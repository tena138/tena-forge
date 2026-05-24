import base64
import hashlib
import hmac
import json
from datetime import datetime
from typing import Any

import httpx
from fastapi import HTTPException, Request

from database import get_settings

PORTONE_API_BASE = "https://api.portone.io"


def portone_public_config() -> dict[str, str]:
    settings = get_settings()
    if not settings.portone_store_id or not settings.portone_channel_key:
        raise HTTPException(status_code=503, detail="PortOne Store ID or channel key is not configured.")
    return {
        "store_id": settings.portone_store_id,
        "channel_key": settings.portone_channel_key,
    }


def _api_secret() -> str:
    secret = get_settings().portone_api_secret
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
    settings = get_settings()
    payload = {
        "storeId": settings.portone_store_id,
        "channelKey": settings.portone_channel_key,
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
        paid = response.json()
        lookup = client.get(f"{PORTONE_API_BASE}/payments/{payment_id}", headers={"Authorization": f"PortOne {_api_secret()}"})
        if lookup.is_success:
            return lookup.json()
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
    settings = get_settings()
    payload = {
        "payment": {
            "storeId": settings.portone_store_id,
            "channelKey": settings.portone_channel_key,
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
    return response.json()


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
