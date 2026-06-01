import uuid
from datetime import datetime, timedelta
from typing import Any
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.orm import Session

from database import get_db
from models import Academy, AcademyPlan, AcademyStudentPlan, JobOutput, ProcessingJob, Subscription, SubscriptionBillingKey, SubscriptionEvent, SubscriptionOrder, SubscriptionPaymentAttempt
from schemas import ProcessingJobCreate, ProcessingJobRead, SignedUrlResponse, UsageSummaryRead
from services.academy_student_access import ensure_academy_subscription
from services.auth_security import decrypt_secret, encrypt_secret, sha256_token
from services.ownership import current_owner_id
from services.portone_billing import get_payment, pay_with_billing_key, payment_amount, payment_currency, payment_status, portone_public_config, read_verified_webhook, schedule_billing_key_payment
from services.saas_security import audit, create_signed_url, enforce_usage_limit, ensure_default_plans, get_roles, usage_cost_summary, usage_summary
from services.subscription_pricing import calculate_subscription_price
from services.subject_engines import normalize_subject_engines, subject_engine_pricing
from services.usage_cost_policy import enforce_extraction_preflight, estimate_extraction, record_usage_event

router = APIRouter(prefix="/api/saas", tags=["saas"])

def _student_keys_by_package(prefix: str, included_keys: int, max_keys: int) -> dict[str, int]:
    keys = {f"{prefix}-student": included_keys}
    keys.update({f"{prefix}-student-{student_keys}": student_keys for student_keys in range(included_keys + 1, max_keys + 1)})
    if prefix == "basic":
        keys["basic-student-plus"] = 10
    return keys


STUDENT_KEYS_BY_PACKAGE = {
    "basic": _student_keys_by_package("basic", 5, 10),
    "pro": _student_keys_by_package("pro", 10, 100),
}


class BillingCheckoutRequest(BaseModel):
    plan_code: str
    billing_cycle: str = "monthly"
    selected_package_ids: dict[str, str] = Field(default_factory=dict)
    enabled_subject_engines: list[str] | None = None
    customer_phone: str | None = None


class BillingKeyConfirmRequest(BaseModel):
    issue_id: str
    billing_key: str
    billing_issue_token: str | None = None


class OneTimePaymentConfirmRequest(BaseModel):
    payment_id: str


def _portone_id(prefix: str, plan_code: str | None = None) -> str:
    parts = [prefix]
    if plan_code:
        parts.append(str(plan_code).replace("_", "-")[:12])
    parts.append(str(int(datetime.utcnow().timestamp())))
    parts.append(uuid.uuid4().hex[:12])
    return "-".join(parts)[:64]


def _portone_issue_id(plan_code: str | None = None) -> str:
    plan_part = "".join(ch for ch in str(plan_code or "") if ch.isascii() and ch.isalnum())[:8]
    return f"tfbill{plan_part}{int(datetime.utcnow().timestamp())}{uuid.uuid4().hex[:10]}"[:40]


def _normalize_phone(value: str | None) -> str | None:
    digits = "".join(ch for ch in str(value or "") if ch.isdigit())
    return digits or None


def _period_delta(billing_cycle: str) -> timedelta:
    return timedelta(days=365 if billing_cycle == "annual" else 31)


def _provider_event_id(prefix: str, identifier: str) -> str:
    return f"{prefix}-{identifier}"[:255]


def _activate_subscription(
    db: Session,
    user_id: str,
    *,
    plan_code: str,
    billing_cycle: str = "monthly",
    enabled_subject_engines: list[str] | None = None,
    provider: str = "mock",
    provider_subscription_id: str | None = None,
    monthly_price_krw: int | None = None,
    period_amount_krw: int | None = None,
    selected_packages: dict[str, str] | None = None,
) -> Subscription:
    from models import Plan

    plan = db.scalar(select(Plan).where(Plan.code == plan_code))
    if not plan:
        raise HTTPException(status_code=404, detail="Plan not found.")
    now = datetime.utcnow()
    for existing in db.scalars(
        select(Subscription).where(
            Subscription.user_id == user_id,
            Subscription.status.in_(["trialing", "active"]),
        )
    ).all():
        existing.status = "canceled"
        existing.cancel_at_period_end = True

    enabled_engines = normalize_subject_engines(enabled_subject_engines or getattr(plan, "enabled_subject_engines", None) or ["math"])
    pricing = subject_engine_pricing(plan.monthly_price, enabled_engines)
    final_monthly_price = int(monthly_price_krw if monthly_price_krw is not None else pricing["final_monthly_price"])
    final_annual_price = int(period_amount_krw if billing_cycle == "annual" and period_amount_krw is not None else final_monthly_price * 12)
    subscription = Subscription(
        user_id=user_id,
        plan_code=plan_code,
        status="active",
        provider=provider,
        provider_subscription_id=provider_subscription_id,
        current_period_start=now,
        current_period_end=now + _period_delta(billing_cycle),
        enabled_subject_engines=pricing["enabled_subject_engines"],
        subject_engine_count=int(pricing["subject_engine_count"]),
        subject_multiplier=float(pricing["subject_multiplier"]),
        final_monthly_price=final_monthly_price,
        final_annual_price=final_annual_price,
    )
    db.add(subscription)
    academy = db.get(Academy, user_id)
    if academy and academy.account_type == "academy":
        canonical = "pro" if str(plan_code).startswith("pro") or str(plan_code) == "team" else "basic"
        academy.plan = AcademyPlan.pro if canonical == "pro" else AcademyPlan.basic
        academy.plan_expires_at = None
        selected_student_package = (selected_packages or {}).get("student")
        target_student_keys = STUDENT_KEYS_BY_PACKAGE.get(canonical, {}).get(str(selected_student_package or ""))
        if target_student_keys is not None:
            student_subscription = ensure_academy_subscription(db, user_id)
            student_plan = db.scalar(select(AcademyStudentPlan).where(AcademyStudentPlan.code == student_subscription.plan_code))
            included_seats = int(student_plan.included_seats if student_plan else 0)
            student_subscription.purchased_additional_seats = max(int(target_student_keys) - included_seats, 0)
    return subscription


def _schedule_next_subscription_payment(db: Session, subscription: Subscription, billing_key: str, billing_cycle: str, order_id: UUID | None = None) -> tuple[SubscriptionPaymentAttempt, str | None]:
    scheduled_at = subscription.current_period_end or (datetime.utcnow() + _period_delta(billing_cycle))
    amount_krw = int(subscription.final_annual_price if billing_cycle == "annual" else subscription.final_monthly_price)
    payment_id = _portone_id("tf-renew", subscription.plan_code)
    attempt = SubscriptionPaymentAttempt(
        user_id=subscription.user_id,
        subscription_id=subscription.id,
        order_id=order_id,
        provider="portone",
        provider_payment_id=payment_id,
        billing_cycle=billing_cycle,
        amount_krw=amount_krw,
        currency="KRW",
        status="scheduled",
        scheduled_at=scheduled_at,
    )
    db.add(attempt)
    try:
        payload = schedule_billing_key_payment(
            payment_id=payment_id,
            billing_key=billing_key,
            order_name=f"Tena Forge {subscription.plan_code} renewal",
            amount_krw=amount_krw,
            user_id=subscription.user_id,
            time_to_pay=scheduled_at,
        )
        attempt.raw_payload = payload
        return attempt, None
    except Exception as exc:
        attempt.status = "schedule_failed"
        attempt.failure_reason = str(exc)
        return attempt, str(exc)


def _mark_attempt_from_payment(attempt: SubscriptionPaymentAttempt, payment: dict[str, Any]) -> None:
    status = payment_status(payment)
    attempt.raw_payload = payment
    if status == "PAID":
        attempt.status = "paid"
        attempt.paid_at = datetime.utcnow()
        attempt.failure_reason = None
    elif status in {"FAILED", "CANCELED", "CANCELLED"}:
        attempt.status = "canceled" if status in {"CANCELED", "CANCELLED"} else "failed"
        attempt.failed_at = datetime.utcnow()
        attempt.failure_reason = str(payment.get("failure") or payment.get("message") or status)
    else:
        attempt.status = status.lower() or attempt.status


def _activate_paid_one_time_order(
    db: Session,
    user_id: str,
    order: SubscriptionOrder,
    attempt: SubscriptionPaymentAttempt,
    payment: dict[str, Any],
) -> Subscription:
    if order.status == "paid" and order.subscription_id:
        subscription = db.get(Subscription, order.subscription_id)
        if subscription:
            return subscription
    status = payment_status(payment)
    paid_amount = payment_amount(payment)
    currency = payment_currency(payment)
    if status != "PAID" or paid_amount != order.amount_krw or currency not in {"KRW", "CURRENCY_KRW"}:
        order.status = "failed"
        order.failure_reason = f"Unexpected PortOne payment state: status={status}, amount={paid_amount}, currency={currency}"
        order.payment_snapshot = payment
        attempt.raw_payload = payment
        attempt.status = "failed"
        attempt.failed_at = datetime.utcnow()
        attempt.failure_reason = order.failure_reason
        raise HTTPException(status_code=400, detail=order.failure_reason)

    subscription = _activate_subscription(
        db,
        user_id,
        plan_code=order.plan_code,
        billing_cycle=order.billing_cycle,
        enabled_subject_engines=order.enabled_subject_engines,
        provider="portone",
        provider_subscription_id=attempt.provider_payment_id,
        monthly_price_krw=order.monthly_price_krw,
        period_amount_krw=order.amount_krw,
        selected_packages=order.selected_packages,
    )
    db.flush()
    order.status = "paid"
    order.subscription_id = subscription.id
    order.payment_snapshot = payment
    order.failure_reason = None
    attempt.subscription_id = subscription.id
    _mark_attempt_from_payment(attempt, payment)

    event_payload = {
        "plan_code": order.plan_code,
        "billing_cycle": order.billing_cycle,
        "payment_id": attempt.provider_payment_id,
        "payment_type": "one_time_license",
        "enabled_subject_engines": subscription.enabled_subject_engines,
        "selected_packages": order.selected_packages,
        "final_monthly_price": subscription.final_monthly_price,
        "final_annual_price": subscription.final_annual_price,
    }
    event_id = _provider_event_id("activate", attempt.provider_payment_id)
    if not db.scalar(select(SubscriptionEvent).where(SubscriptionEvent.provider == "portone", SubscriptionEvent.provider_event_id == event_id)):
        db.add(SubscriptionEvent(provider="portone", provider_event_id=event_id, event_type="subscription.activated", payload=event_payload, processed_at=datetime.utcnow()))
    audit(db, user_id, "subscription.activated", "subscription", str(subscription.id), event_payload)
    return subscription


@router.get("/roles")
def roles(request: Request, db: Session = Depends(get_db)):
    return {"roles": sorted(get_roles(db, current_owner_id(request)))}


@router.get("/billing/summary", response_model=UsageSummaryRead)
def billing_summary(request: Request, db: Session = Depends(get_db)):
    user_id = current_owner_id(request)
    plan, subscription, uploads, pages, tokens, storage = usage_summary(db, user_id)
    return {
        "plan": plan,
        "subscription": subscription,
        "monthly_uploads_used": uploads,
        "monthly_pages_used": pages,
        "monthly_ai_tokens_used": tokens,
        "storage_mb_used": storage,
        **usage_cost_summary(db, user_id),
    }


@router.get("/plans")
def list_plans(db: Session = Depends(get_db)):
    ensure_default_plans(db)
    db.commit()
    from models import Plan

    return db.scalars(select(Plan).where(Plan.is_active.is_(True)).order_by(Plan.monthly_price)).all()


@router.post("/billing/checkout")
def create_checkout(payload: BillingCheckoutRequest, request: Request, db: Session = Depends(get_db)):
    user_id = current_owner_id(request)
    ensure_default_plans(db)
    enabled_engines = normalize_subject_engines(payload.enabled_subject_engines or ["math"])
    pricing = calculate_subscription_price(payload.plan_code, payload.billing_cycle, payload.selected_package_ids, enabled_engines)
    if pricing["billing_cycle"] != "monthly":
        raise HTTPException(status_code=400, detail="Annual plans must use one-time payment checkout.")
    config = portone_public_config("billing")
    academy = db.get(Academy, user_id)
    customer_phone = _normalize_phone(payload.customer_phone) or _normalize_phone(academy.phone if academy else None)
    if str(config.get("billing_key_method") or "").upper() == "CARD" and (not customer_phone or len(customer_phone) not in {10, 11}):
        raise HTTPException(status_code=400, detail="KG이니시스 카드 빌링키 발급을 위해 휴대폰 번호가 필요합니다.")
    if academy and customer_phone and not _normalize_phone(academy.phone):
        academy.phone = customer_phone
    issue_id = _portone_issue_id(payload.plan_code)
    payment_id = _portone_id("tf-pay", payload.plan_code)
    order_name = f"Tena Forge {payload.plan_code.title()} {'annual' if pricing['billing_cycle'] == 'annual' else 'monthly'} subscription"
    now = datetime.utcnow()

    order = SubscriptionOrder(
        user_id=user_id,
        plan_code=payload.plan_code,
        billing_cycle=pricing["billing_cycle"],
        selected_packages=pricing["selected_packages"],
        enabled_subject_engines=enabled_engines,
        monthly_price_krw=int(pricing["monthly_price_krw"]),
        amount_krw=int(pricing["amount_krw"]),
        currency="KRW",
        status="ready",
        provider="portone",
        provider_payment_id=payment_id,
        provider_issue_id=issue_id,
        order_name=order_name,
        created_at=now,
        updated_at=now,
    )
    db.add(order)
    audit(db, user_id, "subscription.checkout.created", "subscription_order", str(order.id), {"provider_payment_id": payment_id, "amount_krw": order.amount_krw})
    db.commit()
    return {
        "provider": "portone",
        "order_id": str(order.id),
        "issue_id": issue_id,
        "issue_name": order_name,
        "payment_id": payment_id,
        "order_name": order_name,
        "amount": order.amount_krw,
        "currency": "KRW",
        "customer_id": user_id,
        "customer_name": academy.academy_name if academy else None,
        "customer_email": academy.email if academy else None,
        "customer_phone": customer_phone,
        "billing_cycle": order.billing_cycle,
        "selected_packages": order.selected_packages,
        "enabled_subject_engines": order.enabled_subject_engines,
        "subject_engine_monthly_delta_krw": pricing["subject_engine_monthly_delta_krw"],
        "portone": {
            "store_id": config["store_id"],
            "channel_key": config["channel_key"],
            "billing_key_method": config["billing_key_method"],
            "is_test_channel": config["is_test_channel"],
        },
    }


@router.post("/billing/one-time-checkout")
def create_one_time_checkout(payload: BillingCheckoutRequest, request: Request, db: Session = Depends(get_db)):
    user_id = current_owner_id(request)
    ensure_default_plans(db)
    enabled_engines = normalize_subject_engines(payload.enabled_subject_engines or ["math"])
    pricing = calculate_subscription_price(payload.plan_code, payload.billing_cycle, payload.selected_package_ids, enabled_engines)
    if pricing["billing_cycle"] != "annual":
        raise HTTPException(status_code=400, detail="One-time checkout is only available for annual licenses.")
    config = portone_public_config("general")
    academy = db.get(Academy, user_id)
    customer_phone = _normalize_phone(payload.customer_phone) or _normalize_phone(academy.phone if academy else None)
    if academy and customer_phone and not _normalize_phone(academy.phone):
        academy.phone = customer_phone
    payment_id = _portone_id("tf-onetime", payload.plan_code)
    order_name = f"Tena Forge {payload.plan_code.title()} 1-year license"
    now = datetime.utcnow()

    order = SubscriptionOrder(
        user_id=user_id,
        plan_code=payload.plan_code,
        billing_cycle=pricing["billing_cycle"],
        selected_packages=pricing["selected_packages"],
        enabled_subject_engines=enabled_engines,
        monthly_price_krw=int(pricing["monthly_price_krw"]),
        amount_krw=int(pricing["amount_krw"]),
        currency="KRW",
        status="ready",
        provider="portone",
        provider_payment_id=payment_id,
        provider_issue_id=None,
        order_name=order_name,
        created_at=now,
        updated_at=now,
    )
    db.add(order)
    db.flush()
    attempt = SubscriptionPaymentAttempt(
        user_id=user_id,
        order_id=order.id,
        provider="portone",
        provider_payment_id=payment_id,
        billing_cycle=order.billing_cycle,
        amount_krw=order.amount_krw,
        currency=order.currency,
        status="ready",
    )
    db.add(attempt)
    audit(db, user_id, "subscription.one_time_checkout.created", "subscription_order", str(order.id), {"provider_payment_id": payment_id, "amount_krw": order.amount_krw})
    db.commit()
    return {
        "provider": "portone",
        "order_id": str(order.id),
        "payment_id": payment_id,
        "order_name": order_name,
        "amount": order.amount_krw,
        "currency": "KRW",
        "customer_id": user_id,
        "customer_name": academy.academy_name if academy else None,
        "customer_email": academy.email if academy else None,
        "customer_phone": customer_phone,
        "billing_cycle": order.billing_cycle,
        "selected_packages": order.selected_packages,
        "enabled_subject_engines": order.enabled_subject_engines,
        "subject_engine_monthly_delta_krw": pricing["subject_engine_monthly_delta_krw"],
        "portone": {
            "store_id": config["store_id"],
            "channel_key": config["channel_key"],
            "is_test_channel": config["is_test_channel"],
        },
    }


@router.post("/billing/confirm-billing-key")
def confirm_billing_key(payload: BillingKeyConfirmRequest, request: Request, db: Session = Depends(get_db)):
    user_id = current_owner_id(request)
    ensure_default_plans(db)
    order = db.scalar(
        select(SubscriptionOrder).where(
            SubscriptionOrder.user_id == user_id,
            SubscriptionOrder.provider == "portone",
            SubscriptionOrder.provider_issue_id == payload.issue_id,
        )
    )
    if not order:
        raise HTTPException(status_code=404, detail="Subscription order not found.")
    if order.billing_cycle != "monthly":
        raise HTTPException(status_code=400, detail="Use one-time payment confirmation for annual licenses.")
    if order.status == "paid" and order.subscription_id:
        return {"ok": True, "subscription_id": str(order.subscription_id), "payment_id": order.provider_payment_id, "idempotent": True}
    if order.status not in {"ready", "failed"}:
        raise HTTPException(status_code=409, detail=f"Subscription order is not payable: {order.status}")
    if order.status == "failed":
        order.provider_payment_id = _portone_id("tf-pay", order.plan_code)
        order.status = "ready"
        order.failure_reason = None

    billing_key = payload.billing_key.strip()
    if not billing_key:
        raise HTTPException(status_code=400, detail="billing_key is required.")
    if billing_key == "NEEDS_CONFIRMATION" or payload.billing_issue_token:
        raise HTTPException(status_code=400, detail="This PortOne channel requires manual billing-key confirmation. Use an automatic billing-key issue channel or disable manual confirmation in PortOne.")

    key_record = SubscriptionBillingKey(
        user_id=user_id,
        provider="portone",
        provider_billing_key_hash=sha256_token(billing_key),
        billing_key_encrypted=encrypt_secret(billing_key) or "",
        status="active",
        issued_at=datetime.utcnow(),
    )
    db.add(key_record)
    db.flush()

    attempt = SubscriptionPaymentAttempt(
        user_id=user_id,
        order_id=order.id,
        provider="portone",
        provider_payment_id=order.provider_payment_id or _portone_id("tf-pay", order.plan_code),
        billing_cycle=order.billing_cycle,
        amount_krw=order.amount_krw,
        currency=order.currency,
        status="ready",
    )
    db.add(attempt)
    db.flush()

    try:
        payment = pay_with_billing_key(
            payment_id=attempt.provider_payment_id,
            billing_key=billing_key,
            order_name=order.order_name,
            amount_krw=order.amount_krw,
            user_id=user_id,
        )
    except Exception as exc:
        order.status = "failed"
        order.failure_reason = str(exc)
        order.billing_key_id = key_record.id
        attempt.status = "failed"
        attempt.failed_at = datetime.utcnow()
        attempt.failure_reason = str(exc)
        db.commit()
        raise

    status = payment_status(payment)
    paid_amount = payment_amount(payment)
    currency = payment_currency(payment)
    if status != "PAID" or paid_amount != order.amount_krw or currency not in {"KRW", "CURRENCY_KRW"}:
        order.status = "failed"
        order.failure_reason = f"Unexpected PortOne payment state: status={status}, amount={paid_amount}, currency={currency}"
        order.payment_snapshot = payment
        attempt.raw_payload = payment
        attempt.status = "failed"
        attempt.failed_at = datetime.utcnow()
        attempt.failure_reason = order.failure_reason
        db.commit()
        raise HTTPException(status_code=400, detail=order.failure_reason)

    subscription = _activate_subscription(
        db,
        user_id,
        plan_code=order.plan_code,
        billing_cycle=order.billing_cycle,
        enabled_subject_engines=order.enabled_subject_engines,
        provider="portone",
        provider_subscription_id=attempt.provider_payment_id,
        monthly_price_krw=order.monthly_price_krw,
        period_amount_krw=order.amount_krw,
        selected_packages=order.selected_packages,
    )
    db.flush()

    key_record.subscription_id = subscription.id
    order.status = "paid"
    order.subscription_id = subscription.id
    order.billing_key_id = key_record.id
    order.payment_snapshot = payment
    order.failure_reason = None
    attempt.subscription_id = subscription.id
    _mark_attempt_from_payment(attempt, payment)
    next_attempt, schedule_error = _schedule_next_subscription_payment(db, subscription, billing_key, order.billing_cycle, order.id)

    event_payload = {
        "plan_code": order.plan_code,
        "billing_cycle": order.billing_cycle,
        "payment_id": attempt.provider_payment_id,
        "next_payment_id": next_attempt.provider_payment_id,
        "schedule_error": schedule_error,
        "enabled_subject_engines": subscription.enabled_subject_engines,
        "selected_packages": order.selected_packages,
        "final_monthly_price": subscription.final_monthly_price,
        "final_annual_price": subscription.final_annual_price,
    }
    db.add(SubscriptionEvent(provider="portone", provider_event_id=_provider_event_id("activate", attempt.provider_payment_id), event_type="subscription.activated", payload=event_payload, processed_at=datetime.utcnow()))
    audit(db, user_id, "subscription.activated", "subscription", str(subscription.id), event_payload)
    db.commit()
    return {
        "ok": True,
        "subscription_id": str(subscription.id),
        "plan_code": subscription.plan_code,
        "payment_id": attempt.provider_payment_id,
        "next_payment_id": next_attempt.provider_payment_id,
        "schedule_error": schedule_error,
    }


@router.post("/billing/confirm-payment")
def confirm_one_time_payment(payload: OneTimePaymentConfirmRequest, request: Request, db: Session = Depends(get_db)):
    user_id = current_owner_id(request)
    ensure_default_plans(db)
    payment_id = payload.payment_id.strip()
    if not payment_id:
        raise HTTPException(status_code=400, detail="payment_id is required.")
    order = db.scalar(
        select(SubscriptionOrder).where(
            SubscriptionOrder.user_id == user_id,
            SubscriptionOrder.provider == "portone",
            SubscriptionOrder.provider_payment_id == payment_id,
            SubscriptionOrder.billing_cycle == "annual",
        )
    )
    if not order:
        raise HTTPException(status_code=404, detail="Subscription order not found.")
    attempt = db.scalar(
        select(SubscriptionPaymentAttempt).where(
            SubscriptionPaymentAttempt.user_id == user_id,
            SubscriptionPaymentAttempt.provider == "portone",
            SubscriptionPaymentAttempt.provider_payment_id == payment_id,
        )
    )
    if not attempt:
        attempt = SubscriptionPaymentAttempt(
            user_id=user_id,
            order_id=order.id,
            provider="portone",
            provider_payment_id=payment_id,
            billing_cycle=order.billing_cycle,
            amount_krw=order.amount_krw,
            currency=order.currency,
            status="ready",
        )
        db.add(attempt)
        db.flush()
    if order.status == "paid" and order.subscription_id:
        return {"ok": True, "subscription_id": str(order.subscription_id), "payment_id": payment_id, "idempotent": True}
    if order.status not in {"ready", "failed"}:
        raise HTTPException(status_code=409, detail=f"Subscription order is not payable: {order.status}")

    payment = get_payment(payment_id)
    if not payment:
        raise HTTPException(status_code=404, detail="PortOne payment not found.")
    subscription = _activate_paid_one_time_order(db, user_id, order, attempt, payment)
    db.commit()
    return {
        "ok": True,
        "subscription_id": str(subscription.id),
        "plan_code": subscription.plan_code,
        "payment_id": payment_id,
        "next_payment_id": None,
    }


@router.post("/billing/webhook")
async def portone_billing_webhook(request: Request, db: Session = Depends(get_db)):
    event = await read_verified_webhook(request)
    event_type = str(event.get("type") or "")
    data = event.get("data") if isinstance(event.get("data"), dict) else {}
    payment_id = data.get("paymentId") or event.get("paymentId")
    if not payment_id:
        return {"received": True, "ignored": "missing paymentId"}

    payment = get_payment(str(payment_id))
    if not payment:
        return {"received": True, "ignored": "payment not found"}

    attempt = db.scalar(select(SubscriptionPaymentAttempt).where(SubscriptionPaymentAttempt.provider == "portone", SubscriptionPaymentAttempt.provider_payment_id == str(payment_id)))
    if not attempt:
        return {"received": True, "ignored": "unknown paymentId"}

    previous_status = attempt.status
    _mark_attempt_from_payment(attempt, payment)
    if attempt.status == "paid" and previous_status in {"ready", "failed"} and attempt.order_id and not attempt.subscription_id:
        order = db.get(SubscriptionOrder, attempt.order_id)
        if order and order.billing_cycle == "annual" and order.provider_issue_id is None:
            _activate_paid_one_time_order(db, order.user_id, order, attempt, payment)
    elif attempt.status == "paid" and previous_status == "scheduled" and attempt.subscription_id:
        subscription = db.get(Subscription, attempt.subscription_id)
        if subscription:
            now = datetime.utcnow()
            base = subscription.current_period_end if subscription.current_period_end and subscription.current_period_end > now else now
            subscription.current_period_start = now
            subscription.current_period_end = base + _period_delta(attempt.billing_cycle)
            subscription.status = "active"
            key_record = db.scalar(
                select(SubscriptionBillingKey)
                .where(
                    SubscriptionBillingKey.subscription_id == subscription.id,
                    SubscriptionBillingKey.status == "active",
                )
                .order_by(SubscriptionBillingKey.created_at.desc())
            )
            if key_record:
                billing_key = decrypt_secret(key_record.billing_key_encrypted)
                if billing_key:
                    _schedule_next_subscription_payment(db, subscription, billing_key, attempt.billing_cycle)
    elif attempt.status in {"failed", "canceled"} and attempt.subscription_id:
        subscription = db.get(Subscription, attempt.subscription_id)
        if subscription:
            subscription.status = "past_due" if attempt.status == "failed" else "canceled"

    webhook_event_id = _provider_event_id("webhook", f"{event_type}-{payment_id}")
    if not db.scalar(select(SubscriptionEvent).where(SubscriptionEvent.provider == "portone", SubscriptionEvent.provider_event_id == webhook_event_id)):
        db.add(
            SubscriptionEvent(
                provider="portone",
                provider_event_id=webhook_event_id,
                event_type=event_type or "portone.webhook",
                payload={"event": event, "payment": payment},
                processed_at=datetime.utcnow(),
            )
        )
    db.commit()
    return {"received": True}


@router.post("/billing/activate")
def activate_paid_subscription():
    raise HTTPException(status_code=410, detail="Use /api/saas/billing/confirm-billing-key for PortOne billing-key subscriptions.")


@router.post("/jobs", response_model=ProcessingJobRead)
def create_job(payload: ProcessingJobCreate, request: Request, db: Session = Depends(get_db)):
    user_id = current_owner_id(request)
    enforce_usage_limit(db, user_id, pages_to_add=payload.page_count, upload_count=1)
    file_size_mb = round((payload.file_size or 0) / 1024 / 1024, 3)
    estimate = estimate_extraction(
        subject_engine=str((payload.options or {}).get("subject_engine") or "math"),
        problem_pages=payload.page_count,
        solution_pages=0,
        problem_file_mb=file_size_mb,
        usage_type="job_extraction_estimate",
    )
    enforce_extraction_preflight(db, user_id, estimate, file_size_mb=file_size_mb, page_count=payload.page_count)
    job = ProcessingJob(
        user_id=user_id,
        status="queued",
        input_file_url=payload.input_file_url,
        source_filename=payload.source_filename,
        file_size=payload.file_size,
        page_count=payload.page_count,
        options=payload.options,
    )
    db.add(job)
    db.flush()
    record_usage_event(db, user_id, estimate, job_id=job.id, storage_mb=file_size_mb)
    audit(db, user_id, "job.created", "job", str(job.id), {"source_filename": payload.source_filename})
    db.commit()
    db.refresh(job)
    return job


@router.get("/jobs", response_model=list[ProcessingJobRead])
def list_jobs(request: Request, db: Session = Depends(get_db)):
    return db.scalars(select(ProcessingJob).where(ProcessingJob.user_id == current_owner_id(request)).order_by(ProcessingJob.created_at.desc())).all()


@router.get("/jobs/{job_id}", response_model=ProcessingJobRead)
def get_job(job_id: UUID, request: Request, db: Session = Depends(get_db)):
    job = db.scalar(select(ProcessingJob).where(ProcessingJob.id == job_id, ProcessingJob.user_id == current_owner_id(request)))
    if not job:
        raise HTTPException(status_code=404, detail="작업을 찾을 수 없습니다.")
    return job


@router.post("/jobs/{job_id}/cancel", response_model=ProcessingJobRead)
def cancel_job(job_id: UUID, request: Request, db: Session = Depends(get_db)):
    job = db.scalar(select(ProcessingJob).where(ProcessingJob.id == job_id, ProcessingJob.user_id == current_owner_id(request)))
    if not job:
        raise HTTPException(status_code=404, detail="작업을 찾을 수 없습니다.")
    if job.status in {"completed", "failed", "canceled"}:
        return job
    job.status = "canceled"
    audit(db, job.user_id, "job.canceled", "job", str(job.id))
    db.commit()
    db.refresh(job)
    return job


@router.post("/jobs/{job_id}/download", response_model=SignedUrlResponse)
def signed_job_download(job_id: UUID, request: Request, db: Session = Depends(get_db)):
    user_id = current_owner_id(request)
    output = db.scalar(select(JobOutput).where(JobOutput.job_id == job_id, JobOutput.user_id == user_id).order_by(JobOutput.created_at.desc()))
    if not output:
        job = db.scalar(select(ProcessingJob).where(ProcessingJob.id == job_id, ProcessingJob.user_id == user_id))
        if not job or not job.output_file_url:
            raise HTTPException(status_code=404, detail="다운로드할 결과 파일이 없습니다.")
        path = job.output_file_url
    else:
        path = output.storage_path
    url, expires_at = create_signed_url(path)
    audit(db, user_id, "job.download_url.created", "job", str(job_id), {"path": path})
    db.commit()
    return {"url": url, "expires_at": expires_at}
