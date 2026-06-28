import re
import unicodedata

PROFILE_NAME_RE = re.compile(r"^[a-z0-9][a-z0-9_]{2,31}$")


def normalize_profile_name(value: str | None) -> str:
    return str(value or "").strip().lstrip("@").lower()


def valid_profile_name(value: str | None) -> bool:
    return bool(PROFILE_NAME_RE.fullmatch(normalize_profile_name(value)))


def profile_name_seed(*values: str | None) -> str:
    for value in values:
        normalized = unicodedata.normalize("NFKD", str(value or ""))
        ascii_value = normalized.encode("ascii", "ignore").decode("ascii").lower()
        cleaned = re.sub(r"[^a-z0-9_]+", "_", ascii_value).strip("_")
        cleaned = re.sub(r"_+", "_", cleaned)
        if cleaned and cleaned[0].isalnum():
            return cleaned[:24]
    return "user"


def unique_profile_name_seed(seed: str, fallback_id: str, used: set[str]) -> str:
    base = re.sub(r"[^a-z0-9_]+", "_", normalize_profile_name(seed)).strip("_") or "user"
    if not base[0].isalnum():
        base = f"user_{base}"
    base = base[:24]
    if len(base) < 3:
        base = f"{base}user"[:24]
    candidate = base
    if candidate not in used and PROFILE_NAME_RE.fullmatch(candidate):
        used.add(candidate)
        return candidate

    suffix = re.sub(r"[^a-z0-9]+", "", fallback_id.lower())[:8] or "00000000"
    trimmed = base[: max(3, 31 - len(suffix))]
    candidate = f"{trimmed}_{suffix}"[:32]
    counter = 2
    while candidate in used or not PROFILE_NAME_RE.fullmatch(candidate):
        counter_suffix = f"{suffix[:6]}{counter}"
        trimmed = base[: max(3, 31 - len(counter_suffix))]
        candidate = f"{trimmed}_{counter_suffix}"[:32]
        counter += 1
    used.add(candidate)
    return candidate
