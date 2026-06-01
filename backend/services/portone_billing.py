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


def _env_first(*names: str) -> str:
    for name in names:
        value = os.getenv(name)
        if value:
            return value.strip()
    return ""


def _store_id() -> str:
    settings = get_settings()
    return settings.portone_store_id or _env_first("PORTONE_STORE_ID", "NEXT_PUBLIC_PORTONE_STORE_ID")


def _channel_key(purpose: str = "billing") -> str:
    settings = get_settings()
    purpose = (purpose or "billing").strip().lower()
    if purpose == "general":
        general_channel_key = settings.portone_general_channel_key_inicis or _env_first(
            "PORTONE_GENERAL_CHANNEL_KEY_INICIS",
            "PORTONE_INICIS_GENERAL_CHANNEL_KEY",
            "NEXT_PUBLIC_PORTONE_GENERAL_CHANNEL_KEY_INICIS",
        )
        if general_channel_key:
            return general_channel_key
    else:
        billing_channel_key = settings.portone_billing_channel_key_inicis or _env_first(
            "PORTONE_BILLING_CHANNEL_KEY_INICIS",
            "PORTONE_INICIS_BILLING_CHANNEL_KEY",
            "NEXT_PUBLIC_PORTONE_BILLING_CHANNEL_KEY_INICIS",
        )
        if billing_channel_key:
            return billing_channel_key
    inicis_channel_key = settings.portone_channel_key_inicis or _env_first(
        "PORTONE_CHANNEL_KEY_INICIS",
        "PORTONE_INICIS_CHANNEL_KEY",
        "NEXT_PUBLIC_PORTONE_CHANNEL_KEY_INICIS",
    )
    if inicis_channel_key:
        return inicis_channel_key
    nice_channel_key = settings.portone_channel_key_nice or _env_first(
        "PORTONE_CHANNEL_KEY_NICE",
        "PORTONE_NICE_CHANNEL_KEY",
        "NEXT_PUBLIC_PORTONE_CHANNEL_KEY_NICE",
    )
    if nice_channel_key:
        return nice_channel_key
    return settings.portone_channel_key or _env_first(
        "PORTONE_CHANNEL_KEY",
        "NEXT_PUBLIC_PORTONE_CHANNEL_KEY",
        "NEXT_PUBLIC_PORTONE_CHANNEL_KEY_TOSS",
    )


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
    channel_key = _channel_key(purpose)
    if not store_id or not channel_key:
        raise HTTPException(status_code=503, detail="PortOne Store ID or channel key is not configured.")
    config = {
        "store_id": store_id,
        "channel_key": channel_key,
        "purpose": purpose,
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
