from typing import Any

from fastapi import HTTPException


PACKAGE_GROUPS: dict[str, dict[str, dict[str, int]]] = {
    "basic": {
        "ai": {"basic-ai": 0, "basic-ai-plus": 12_000, "basic-ai-max": 29_000},
        "storage": {"basic-storage": 0, "basic-storage-plus": 10_000, "basic-storage-max": 24_000},
        "student": {"basic-student": 0, "basic-student-plus": 9_000, "basic-student-max": 24_000},
        "processing": {"basic-processing-cloud": 0},
    },
    "pro": {
        "ai": {"pro-ai": 0, "pro-ai-plus": 39_000, "pro-ai-max": 89_000},
        "storage": {"pro-storage": 0, "pro-storage-plus": 29_000, "pro-storage-max": 79_000},
        "student": {"pro-student": 0, "pro-student-plus": 39_000, "pro-student-max": 79_000},
        "processing": {"pro-processing-cloud": 0, "pro-processing-cloud-max": 119_000},
    },
}

BASE_MONTHLY_PRICE = {
    "basic": 48_000,
    "pro": 108_000,
}

ANNUAL_DISCOUNT_PERCENT = 20


def normalize_billing_cycle(value: str | None) -> str:
    if value in {"monthly", "annual"}:
        return value
    raise HTTPException(status_code=400, detail="Invalid billing cycle.")


def normalize_selected_packages(plan_code: str, selected_package_ids: Any) -> dict[str, str]:
    groups = PACKAGE_GROUPS.get(plan_code)
    if not groups:
        raise HTTPException(status_code=400, detail="Invalid paid plan.")
    raw = selected_package_ids if isinstance(selected_package_ids, dict) else {}
    selected: dict[str, str] = {}
    for group, options in groups.items():
        requested = str(raw.get(group) or "")
        if requested and requested not in options:
            raise HTTPException(status_code=400, detail=f"Invalid package selection for {group}.")
        selected[group] = requested or next(iter(options))
    return selected


def calculate_subscription_price(plan_code: str, billing_cycle: str, selected_package_ids: Any) -> dict[str, Any]:
    if plan_code not in BASE_MONTHLY_PRICE:
        raise HTTPException(status_code=400, detail="Invalid paid plan.")
    cycle = normalize_billing_cycle(billing_cycle)
    selected = normalize_selected_packages(plan_code, selected_package_ids)
    monthly = BASE_MONTHLY_PRICE[plan_code]
    for group, package_id in selected.items():
        monthly += PACKAGE_GROUPS[plan_code][group][package_id]
    if cycle == "annual":
        discounted_monthly = round(monthly * (1 - ANNUAL_DISCOUNT_PERCENT / 100))
        amount = discounted_monthly * 12
    else:
        amount = monthly
    return {
        "plan_code": plan_code,
        "billing_cycle": cycle,
        "selected_packages": selected,
        "monthly_price_krw": monthly,
        "amount_krw": amount,
        "currency": "KRW",
    }
