import base64
import hashlib
import hmac
import json
import os
from datetime import datetime
from typing import Any

import httpx
from fastapi import HTTPException, Request

from database import get_settings

PORTONE_API_BASE = "https://api.portone.io"
PG_PROVIDER_LABELS = {
    "inicis": "KG Inicis",
    "toss": "Toss Payments",
    "portone": "PortOne",
}


def _env_first(*names: str) -> str:
    for name in names:
        value = os.getenv(name)
        if value:
            return value.strip()
    return ""


def _first_configured(*values: str | None) -> str:
    for value in values:
        if value:
            text = str(value).strip()
            if text:
                return text
    return ""


def _store_id() -> str:
    settings = get_settings()
    return settings.portone_store_id or _env_first("PORTONE_STORE_ID", "NEXT_PUBLIC_PORTONE_STORE_ID")


def _primary_pg_provider() -> str:
    settings = get_settings()
    provider = _first_configured(settings.portone_primary_pg_provider, _env_first("PORTONE_PRIMARY_PG_PROVIDER"))
    provider = provider.lower()
    return provider if provider in {"inicis", "toss"} else "inicis"


def _provider_channel_key(provider: str, purpose: str) -> str:
    settings = get_settings()
    if purpose == "general":
        if provider == "inicis":
            return _first_configured(
                settings.portone_general_channel_key_inicis,
                _env_first(
                    "PORTONE_GENERAL_CHANNEL_KEY_INICIS",
                    "PORTONE_INICIS_GENERAL_CHANNEL_KEY",
                    "NEXT_PUBLIC_PORTONE_GENERAL_CHANNEL_KEY_INICIS",
                ),
                settings.portone_channel_key_inicis,
                _env_first("PORTONE_CHANNEL_KEY_INICIS", "PORTONE_INICIS_CHANNEL_KEY", "NEXT_PUBLIC_PORTONE_CHANNEL_KEY_INICIS"),
            )
        return _first_configured(
            settings.portone_general_channel_key_toss,
            _env_first(
                "PORTONE_GENERAL_CHANNEL_KEY_TOSS",
                "PORTONE_TOSS_GENERAL_CHANNEL_KEY",
                "NEXT_PUBLIC_PORTONE_GENERAL_CHANNEL_KEY_TOSS",
                "NEXT_PUBLIC_PORTONE_CHANNEL_KEY_TOSS",
            ),
        )
    if provider == "inicis":
        return _first_configured(
            settings.portone_billing_channel_key_inicis,
            _env_first(
                "PORTONE_BILLING_CHANNEL_KEY_INICIS",
                "PORTONE_INICIS_BILLING_CHANNEL_KEY",
                "NEXT_PUBLIC_PORTONE_BILLING_CHANNEL_KEY_INICIS",
            ),
            settings.portone_channel_key_inicis,
            _env_first("PORTONE_CHANNEL_KEY_INICIS", "PORTONE_INICIS_CHANNEL_KEY", "NEXT_PUBLIC_PORTONE_CHANNEL_KEY_INICIS"),
        )
    return _first_configured(
        settings.portone_billing_channel_key_toss,
        _env_first(
            "PORTONE_BILLING_CHANNEL_KEY_TOSS",
            "PORTONE_TOSS_BILLING_CHANNEL_KEY",
            "NEXT_PUBLIC_PORTONE_BILLING_CHANNEL_KEY_TOSS",
            "NEXT_PUBLIC_PORTONE_CHANNEL_KEY_TOSS",
        ),
    )


def _generic_channel_key() -> str:
    settings = get_settings()
    return _first_configured(
        settings.portone_channel_key,
        _env_first("PORTONE_CHANNEL_KEY", "NEXT_PUBLIC_PORTONE_CHANNEL_KEY"),
    )


def _channel_selection(purpose: str = "billing") -> dict[str, str]:
    purpose = (purpose or "billing").strip().lower()
    primary = _primary_pg_provider()
    fallback = "toss" if primary == "inicis" else "inicis"
    for provider in (primary, fallback):
        channel_key = _provider_channel_key(provider, purpose)
        if channel_key:
            return {"channel_key": channel_key, "pg_provider": provider}
    channel_key = _generic_channel_key()
    if channel_key:
        return {"channel_key": channel_key, "pg_provider": "portone"}
    return {"channel_key": "", "pg_provider": primary}


def _channel_key(purpose: str = "billing") -> str:
    return _channel_selection(purpose)["channel_key"]


def _billing_key_method() -> str:
    method = get_settings().portone_billing_key_method or _env_first("PORTONE_BILLING_KEY_METHOD")
    return (method or "CARD").strip().upper()


def _easy_pay_provider() -> str:
    provider = get_settings().portone_easy_pay_provider or _env_first("PORTONE_EASY_PAY_PROVIDER")
    return provider.strip().upper()


def _easy_pay_available_methods() -> list[str]:
    raw = get_settings().portone_easy_pay_available_methods or _env_first("PORTONE_EASY_PAY_AVAILABLE_METHODS")
    return [item.strip().upper() for item in raw.split(",") if item.strip()]


def _is_test_channel() -> bool:
    raw = _env_first("PORTONE_IS_TEST_CHANNEL", "NEXT_PUBLIC_PORTONE_IS_TEST_CHANNEL")
    if raw:
        return raw.lower() in {"1", "true", "yes", "y", "on"}
    return bool(get_settings().portone_is_test_channel)


def _normalize_payment_payload(payload: dict[str, Any]) -> dict[str, Any]:
    payment = payload.get("payment")
    return payment if isinstance(payment, dict) else payload


def portone_public_config(purpose: str = "billing") -> dict[str, Any]:
    store_id = _store_id()
    channel = _channel_selection(purpose)
    channel_key = channel["channel_key"]
    if not store_id or not channel_key:
        raise HTTPException(status_code=503, detail="PortOne Store ID or channel key is not configured.")
    config = {
        "store_id": store_id,
        "channel_key": channel_key,
        "purpose": purpose,
        "pg_provider": channel["pg_provider"],
        "pg_provider_label": PG_PROVIDER_LABELS.get(channel["pg_provider"], "PortOne"),
        "billing_key_method": _billing_key_method(),
        "is_test_channel": _is_test_channel(),
    }
    easy_pay_provider = _easy_pay_provider()
    if easy_pay_provider:
        config["easy_pay_provider"] = easy_pay_provider
    easy_pay_available_methods = _easy_pay_available_methods()
    if easy_pay_available_methods:
        config["easy_pay_available_methods"] = easy_pay_available_methods
    return config


def _api_secret() -> str:
    secret = get_settings().portone_api_secret or _env_first("PORTONE_API_SECRET")
    if not secret:
        raise HTTPException(status_code=503, detail="PORTONE_API_SECRET is not configured.")
    return secret


def _headers() -> dict[str, str]:
    return {
        "Authorization": f"PortOne {_api_secret()}",
        "Content-Type": "application/json",
    }


def _raise_portone_error(action: str, response: httpx.Response) -> None:
    try:
        payload = response.json()
    except ValueError:
        payload = {"message": response.text}
    message = payload.get("message") if isinstance(payload, dict) else None
    raise HTTPException(status_code=502, detail=f"{action} failed through PortOne ({response.status_code}): {message or payload}")


def pay_with_billing_key(
    *,
    payment_id: str,
    billing_key: str,
    order_name: str,
    amount_krw: int,
    user_id: str,
) -> dict[str, Any]:
    payload = {
        "storeId": _store_id(),
        "channelKey": _channel_key("billing"),
        "billingKey": billing_key,
        "orderName": order_name,
        "customer": {"id": user_id},
        "amount": {"total": amount_krw},
        "currency": "KRW",
    }
    with httpx.Client(timeout=30) as client:
        response = client.post(f"{PORTONE_API_BASE}/payments/{payment_id}/billing-key", headers=_headers(), json=payload)
        if not response.is_success:
            _raise_portone_error("Billing key payment", response)
        paid = _normalize_payment_payload(response.json())
        lookup = client.get(f"{PORTONE_API_BASE}/payments/{payment_id}", headers={"Authorization": f"PortOne {_api_secret()}"})
        if lookup.is_success:
            return _normalize_payment_payload(lookup.json())
        return paid


def schedule_billing_key_payment(
    *,
    payment_id: str,
    billing_key: str,
    order_name: str,
    amount_krw: int,
    user_id: str,
    time_to_pay: datetime,
) -> dict[str, Any]:
    payload = {
        "payment": {
            "storeId": _store_id(),
            "channelKey": _channel_key("billing"),
            "billingKey": billing_key,
            "orderName": order_name,
            "customer": {"id": user_id},
            "amount": {"total": amount_krw},
            "currency": "KRW",
        },
        "timeToPay": time_to_pay.replace(microsecond=0).isoformat() + "Z",
    }
    with httpx.Client(timeout=30) as client:
        response = client.post(f"{PORTONE_API_BASE}/payments/{payment_id}/schedule", headers=_headers(), json=payload)
    if not response.is_success:
        _raise_portone_error("Billing schedule", response)
    return response.json()


def get_payment(payment_id: str) -> dict[str, Any] | None:
    with httpx.Client(timeout=30) as client:
        response = client.get(f"{PORTONE_API_BASE}/payments/{payment_id}", headers={"Authorization": f"PortOne {_api_secret()}"})
    if response.status_code == 404:
        return None
    if not response.is_success:
        _raise_portone_error("Payment lookup", response)
    return _normalize_payment_payload(response.json())


def payment_status(payment: dict[str, Any]) -> str:
    return str(payment.get("status") or payment.get("paymentStatus") or "").upper()


def payment_amount(payment: dict[str, Any]) -> int:
    amount = payment.get("amount")
    if isinstance(amount, dict):
        value = amount.get("paid") if amount.get("paid") is not None else amount.get("total")
        return int(value or 0)
    return int(payment.get("totalAmount") or payment.get("paidAmount") or 0)


def payment_currency(payment: dict[str, Any]) -> str:
    return str(payment.get("currency") or "KRW").upper()


def verify_standard_webhook(payload: bytes, headers: dict[str, str]) -> bool:
    secret = get_settings().portone_webhook_secret
    if not secret:
        return True

    webhook_id = headers.get("webhook-id") or headers.get("svix-id")
    timestamp = headers.get("webhook-timestamp") or headers.get("svix-timestamp")
    signature_header = headers.get("webhook-signature") or headers.get("svix-signature")
    if not webhook_id or not timestamp or not signature_header:
        return False

    key = secret
    if key.startswith("whsec_"):
        key = key.removeprefix("whsec_")
    try:
        key_bytes = base64.b64decode(key)
    except Exception:
        key_bytes = secret.encode("utf-8")

    signed_payload = f"{webhook_id}.{timestamp}.".encode("utf-8") + payload
    expected = base64.b64encode(hmac.new(key_bytes, signed_payload, hashlib.sha256).digest()).decode("ascii")
    signatures = [part.split(",", 1)[1] if "," in part else part for part in signature_header.split(" ")]
    return any(hmac.compare_digest(expected, signature.strip()) for signature in signatures)


async def read_verified_webhook(request: Request) -> dict[str, Any]:
    payload = await request.body()
    if not verify_standard_webhook(payload, {key.lower(): value for key, value in request.headers.items()}):
        raise HTTPException(status_code=401, detail="Invalid PortOne webhook signature.")
    return json.loads(payload.decode("utf-8"))
