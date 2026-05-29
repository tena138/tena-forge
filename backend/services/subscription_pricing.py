from typing import Any

from fastapi import HTTPException

from services.subject_engines import normalize_subject_engines, subject_engine_pricing


STUDENT_KEY_MONTHLY_ADDON_KRW = 8_000


def _student_key_package_prices(prefix: str, included_keys: int, max_keys: int) -> dict[str, int]:
    prices = {f"{prefix}-student": 0}
    prices.update({f"{prefix}-student-{student_keys}": (student_keys - included_keys) * STUDENT_KEY_MONTHLY_ADDON_KRW for student_keys in range(included_keys + 1, max_keys + 1)})
    if prefix == "basic":
        prices["basic-student-plus"] = (10 - included_keys) * STUDENT_KEY_MONTHLY_ADDON_KRW
    return prices


PACKAGE_GROUPS: dict[str, dict[str, dict[str, int]]] = {
    "basic": {
        "ai": {"basic-ai": 0, "basic-ai-plus": 28_000, "basic-ai-max": 48_000},
        "storage": {"basic-storage": 0, "basic-storage-plus": 10_000, "basic-storage-max": 24_000},
        "student": _student_key_package_prices("basic", 5, 10),
    },
    "pro": {
        "ai": {"pro-ai": 0, "pro-ai-plus": 39_000, "pro-ai-max": 89_000},
        "storage": {"pro-storage": 0, "pro-storage-plus": 29_000, "pro-storage-max": 79_000},
        "student": _student_key_package_prices("pro", 10, 100),
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


def calculate_subscription_price(plan_code: str, billing_cycle: str, selected_package_ids: Any, enabled_subject_engines: Any = None) -> dict[str, Any]:
    if plan_code not in BASE_MONTHLY_PRICE:
        raise HTTPException(status_code=400, detail="Invalid paid plan.")
    cycle = normalize_billing_cycle(billing_cycle)
    selected = normalize_selected_packages(plan_code, selected_package_ids)
    engines = normalize_subject_engines(enabled_subject_engines or ["math"])
    single_engine_monthly = BASE_MONTHLY_PRICE[plan_code]
    for group, package_id in selected.items():
        single_engine_monthly += PACKAGE_GROUPS[plan_code][group][package_id]
    engine_pricing = subject_engine_pricing(single_engine_monthly, engines)
    monthly = int(engine_pricing["final_monthly_price"])
    if cycle == "annual":
        discounted_monthly = round(monthly * (1 - ANNUAL_DISCOUNT_PERCENT / 100))
        amount = discounted_monthly * 12
    else:
        amount = monthly
    return {
        "plan_code": plan_code,
        "billing_cycle": cycle,
        "selected_packages": selected,
        "enabled_subject_engines": engines,
        "subject_engine_count": int(engine_pricing["subject_engine_count"]),
        "subject_multiplier": float(engine_pricing["subject_multiplier"]),
        "subject_engine_monthly_delta_krw": int(engine_pricing["subject_engine_monthly_delta_krw"]),
        "monthly_price_krw": monthly,
        "amount_krw": amount,
        "currency": "KRW",
    }
