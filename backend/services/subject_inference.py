import re
import unicodedata


COMMON_MATH_PATTERN = re.compile(r"공통수학[12]|공통수[12]|공수[12]")
SUBJECT_RULES: tuple[tuple[str, re.Pattern[str], bool], ...] = (
    ("영어", re.compile(r"영어|영문|영문법|독해|어휘|듣기|ENGLISH|READING|GRAMMAR|LISTENING|VOCAB"), False),
    ("국어", re.compile(r"국어|언어와매체|화법과작문|문학|비문학|독서|KOREAN|LANGUAGE"), False),
    ("공통수학1", re.compile(r"공통수학1|공통수1|공수1"), False),
    ("공통수학2", re.compile(r"공통수학2|공통수2|공수2"), False),
    ("수학Ⅰ", re.compile(r"수학I(?!I)|수I(?!I)|수학1|수1"), True),
    ("수학Ⅱ", re.compile(r"수학II|수II|수학2|수2"), True),
    ("미적분", re.compile(r"미적분|미적"), False),
    ("확률과 통계", re.compile(r"확률과통계|확통"), False),
    ("기하", re.compile(r"기하|기벡"), False),
)


def _compact_subject_text(value: str | None) -> str:
    return re.sub(r"\s+", "", unicodedata.normalize("NFKC", value or "")).upper()


def infer_subject_candidates_from_text(*values: str | None) -> list[str]:
    compacted = _compact_subject_text(" ".join(value or "" for value in values))
    if not compacted:
        return []

    without_common_math = COMMON_MATH_PATTERN.sub("", compacted)
    subjects: list[str] = []
    for subject, pattern, strip_common in SUBJECT_RULES:
        target = without_common_math if strip_common else compacted
        if pattern.search(target) and subject not in subjects:
            subjects.append(subject)
    return subjects
