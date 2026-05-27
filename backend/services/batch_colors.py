import re


BATCH_ACCENT_COLORS = [
    "#8b5cf6",
    "#0ea5e9",
    "#14b8a6",
    "#22c55e",
    "#eab308",
    "#f97316",
    "#ec4899",
    "#6366f1",
    "#06b6d4",
    "#84cc16",
]

_HEX_COLOR_RE = re.compile(r"^#[0-9a-fA-F]{6}$")


def normalize_batch_color(value: str | None) -> str | None:
    if not value:
        return None
    color = value.strip()
    return color.lower() if _HEX_COLOR_RE.match(color) else None


def batch_color_for_seed(seed: object | None) -> str:
    text = str(seed or "batch")
    hash_value = 0
    for char in text:
        hash_value = (hash_value * 31 + ord(char)) & 0xFFFFFFFF
    return BATCH_ACCENT_COLORS[hash_value % len(BATCH_ACCENT_COLORS)]
