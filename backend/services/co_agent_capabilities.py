from __future__ import annotations

from dataclasses import dataclass
from typing import Any, Iterable


@dataclass(frozen=True)
class CoAgentCapability:
    id: str
    title: str
    category: str
    summary: str
    href: str
    intents: tuple[str, ...]
    direct_intents: tuple[str, ...] = ()
    negative_intents: tuple[str, ...] = ()
    visible_signals: tuple[str, ...] = ()
    required_info: tuple[str, ...] = ()
    side_effects: tuple[str, ...] = ()
    execution_notes: tuple[str, ...] = ()
    ui_anchors: tuple[str, ...] = ()
    workflow_steps: tuple[str, ...] = ()
    can_execute: bool = False
    product_map: bool = True

    def product_item(self) -> dict[str, str]:
        return {"id": self.id, "label": self.title, "href": self.href, "summary": self.summary}


CAPABILITIES: tuple[CoAgentCapability, ...] = (
    CoAgentCapability(
        id="exam_paper_creation",
        title="시험지 제작",
        category="problem_set",
        summary="보관된 문항과 템플릿 조건을 읽어 새 문항 세트를 생성합니다.",
        href="/problem-sets",
        intents=("시험지", "모의고사", "문항 세트", "출제", "만들", "생성", "랜덤", "배점", "난이도", "template", "exam", "paper"),
        direct_intents=("시험지 제작", "시험지 만들", "시험지 생성", "모의고사 제작", "모의고사 만들", "문항 세트 제작", "문항 세트 만들"),
        negative_intents=("문항 추출", "문제 추출", "PDF 추출", "PDF 업로드", "문항 인식", "문제 인식", "OCR", "스캔", "업로드"),
        visible_signals=("보관", "문항 확인", "세트 제작", "제작된 세트", "과목별 문항 수", "템플릿"),
        required_info=("subject", "grade_or_scope", "problem_count", "template", "point_or_difficulty_policy"),
        side_effects=("creates_problem_set", "records_problem_usage", "uses_co_agent_exam_build_credit"),
        execution_notes=(
            "When the request is complete, the backend can create the problem set directly.",
            "If point or difficulty metadata is absent and the user allows random selection, ignore difficulty slots instead of shortfalling on missing metadata.",
            "Ask only for missing required information and prefer available UI choices when possible.",
        ),
        ui_anchors=("archive", "template", "problem_set"),
        workflow_steps=("archive", "template", "problem_set"),
        can_execute=True,
    ),
    CoAgentCapability(
        id="problem_extraction",
        title="PDF 문항 추출",
        category="archive",
        summary="PDF를 업로드해 문항, 선택지, 정답, 해설, 태그 후보를 추출합니다.",
        href="/archive/new",
        intents=("pdf", "업로드", "추출", "스캔", "문항", "문제", "문항 인식", "ocr", "archive"),
        direct_intents=("문항 추출", "문제 추출", "PDF 추출", "PDF 업로드", "PDF 문항", "문항 인식", "문제 인식", "OCR", "스캔"),
        visible_signals=("추출", "현재 추출 중", "추출 대기", "진행 중인 배치", "대기 중인 배치"),
        required_info=("source_file", "subject_engine"),
        side_effects=("starts_extraction_batch", "uses_extraction_credit"),
        ui_anchors=("archive",),
        workflow_steps=("archive",),
    ),
    CoAgentCapability(
        id="problem_archive",
        title="문항 보관",
        category="archive",
        summary="추출된 문항을 검색, 검토, 태그 정리, 재추출할 수 있습니다.",
        href="/problems",
        intents=("보관", "문항 확인", "검토", "태그", "난이도", "배점", "정답", "해설", "재추출"),
        visible_signals=("검토 대기 문항", "과목별 문항 수", "미분류", "태그", "보관"),
        required_info=("filter_or_problem_scope",),
        ui_anchors=("archive",),
        workflow_steps=("archive",),
    ),
    CoAgentCapability(
        id="template_management",
        title="템플릿",
        category="template",
        summary="시험지 양식과 지면 템플릿을 선택하거나 편집합니다.",
        href="/templates/mine",
        intents=("템플릿", "양식", "서식", "세움", "A4", "B5", "지면", "레이아웃", "template"),
        visible_signals=("템플릿", "내 템플릿", "양식", "편집"),
        required_info=("template_name_or_style",),
        ui_anchors=("template",),
        workflow_steps=("template",),
    ),
    CoAgentCapability(
        id="problem_set_management",
        title="문항 세트",
        category="problem_set",
        summary="문항 세트를 만들고 열람하며 학생 배정 전 자료를 정리합니다.",
        href="/problem-sets",
        intents=("문항 세트", "세트", "시험지", "묶", "제작", "저장", "확인"),
        visible_signals=("세트 제작", "제작된 세트", "최근 세트", "문항 세트"),
        required_info=("set_name_or_selection",),
        side_effects=("creates_or_updates_problem_set",),
        ui_anchors=("problem_set",),
        workflow_steps=("problem_set",),
    ),
    CoAgentCapability(
        id="student_management",
        title="학생 관리",
        category="student",
        summary="반, 학생, 수업, 상담, 수납 정보를 관리합니다.",
        href="/student-management",
        intents=("학생", "반", "클래스", "수업", "상담", "출결", "수납", "학부모", "student", "class"),
        visible_signals=("학생 관리", "활성 가능 학생", "클래스", "상담"),
        required_info=("student_or_class_scope",),
        side_effects=("may_create_or_update_student_records",),
    ),
    CoAgentCapability(
        id="paper_session_assignment",
        title="시험 배정",
        category="student",
        summary="문항 세트를 학생이나 반에 배정하고 채점 흐름으로 연결합니다.",
        href="/student-management",
        intents=("배정", "과제", "숙제", "시험 배포", "채점", "리포트", "결과", "오답"),
        visible_signals=("시험 배정", "채점 대기", "리포트", "결과"),
        required_info=("problem_set", "recipient", "due_at"),
        side_effects=("creates_paper_session", "may_notify_students"),
    ),
    CoAgentCapability(
        id="routine_review",
        title="루틴 검토",
        category="routine",
        summary="AI가 제안한 리포트, 피드백, 전송 루틴을 검토하고 승인합니다.",
        href="/co-agent/routines",
        intents=("루틴", "전송", "피드백", "문자", "알림", "검토", "승인", "routine"),
        visible_signals=("루틴", "검토 대기", "AI 제안", "전송"),
        required_info=("routine_selection", "approval"),
        side_effects=("may_send_messages_after_approval",),
    ),
    CoAgentCapability(
        id="live_lecture",
        title="실시간 강의",
        category="live",
        summary="실시간 수업을 열고 학생 참여 흐름을 관리합니다.",
        href="/live-lecture",
        intents=("실시간", "라이브", "강의", "수업 시작", "참여", "방송", "live"),
        visible_signals=("실시간 강의", "수업 시작", "라이브"),
        required_info=("class_or_session",),
    ),
    CoAgentCapability(
        id="billing_plan",
        title="결제와 플랜",
        category="billing",
        summary="플랜, AI credits, 사용량, 결제 상태를 확인합니다.",
        href="/billing",
        intents=("결제", "플랜", "크레딧", "사용량", "용량", "구독", "billing", "credit"),
        visible_signals=("AI credits", "업로드 용량", "보관 용량", "Admin", "플랜"),
        required_info=("billing_question",),
    ),
    CoAgentCapability(
        id="marketplace",
        title="마켓플레이스",
        category="marketplace",
        summary="문항 세트와 자료 상품을 탐색하고 판매/구매 흐름으로 이동합니다.",
        href="/marketplace",
        intents=("마켓", "판매", "구매", "상품", "콘텐츠", "라이선스", "marketplace"),
        visible_signals=("마켓플레이스", "상품", "구매", "판매"),
        required_info=("product_or_store_scope",),
    ),
)


PRODUCT_MAP_IDS = (
    "problem_extraction",
    "problem_archive",
    "problem_set_management",
    "template_management",
    "student_management",
    "routine_review",
)


def _compact(value: str | None) -> str:
    return str(value or "").casefold().replace(" ", "")


def _plain(value: str | None) -> str:
    return str(value or "").casefold()


def _iter_history_text(history: Iterable[Any]) -> Iterable[str]:
    for item in history:
        content = getattr(item, "content", None)
        if content is None and isinstance(item, dict):
            content = item.get("content")
        if content:
            yield str(content)


def _visible_text(visible_context: Any | None) -> str:
    if not visible_context:
        return ""
    if isinstance(visible_context, dict):
        return " ".join(
            str(visible_context.get(key) or "")
            for key in ("current_path", "page_title", "visible_text", "active_element")
        )
    return " ".join(
        str(getattr(visible_context, key, "") or "")
        for key in ("current_path", "page_title", "visible_text", "active_element")
    )


def _path_matches(href: str, current_path: str) -> bool:
    if not href or not current_path:
        return False
    return current_path == href or current_path.startswith(f"{href}/")


def _score_capability(
    capability: CoAgentCapability,
    *,
    message: str,
    history_text: str,
    visible_text: str,
    current_path: str,
) -> tuple[int, list[str]]:
    current_compact = _compact(message)
    history_compact = _compact(history_text)
    visible_compact = _compact(visible_text)
    plain_query = _plain(" ".join((message, history_text, visible_text)))
    score = 0
    matches: list[str] = []

    if _path_matches(capability.href, current_path):
        score += 45
        matches.append(f"path:{capability.href}")

    direct_match = False
    for term in capability.direct_intents:
        clean = _compact(term)
        if clean and clean in current_compact:
            score += 44
            matches.append(f"direct:{term}")
            direct_match = True
        elif clean and clean in history_compact:
            score += 10
            matches.append(f"history:{term}")

    for term in capability.intents:
        clean = _compact(term)
        if clean and clean in current_compact:
            score += 18
            matches.append(term)
        elif clean and clean in history_compact:
            score += 5
            matches.append(f"history:{term}")
        elif clean and clean in visible_compact:
            score += 7
            matches.append(f"visible:{term}")

    if not direct_match:
        for term in capability.negative_intents:
            clean = _compact(term)
            if clean and clean in current_compact:
                score -= 70
                matches.append(f"blocked:{term}")
                break

    for signal in capability.visible_signals:
        clean = _compact(signal)
        if clean and clean in visible_compact:
            score += 8
            matches.append(f"ui:{signal}")

    if capability.category and capability.category.casefold() in plain_query:
        score += 5
        matches.append(f"category:{capability.category}")

    if capability.can_execute and score > 0:
        score += 4

    return score, matches[:8]


def search_co_agent_capabilities(
    *,
    message: str,
    history: Iterable[Any] = (),
    visible_context: Any | None = None,
    current_path: str | None = None,
    limit: int = 5,
) -> list[dict[str, Any]]:
    visible = _visible_text(visible_context)
    path = current_path or ""
    if not path and visible_context is not None:
        if isinstance(visible_context, dict):
            path = str(visible_context.get("current_path") or "")
        else:
            path = str(getattr(visible_context, "current_path", "") or "")
    history_text = " ".join(_iter_history_text(history))[-4000:]

    scored: list[tuple[int, CoAgentCapability, list[str]]] = []
    for capability in CAPABILITIES:
        score, matches = _score_capability(
            capability,
            message=message,
            history_text=history_text,
            visible_text=visible,
            current_path=path,
        )
        if score > 0:
            scored.append((score, capability, matches))

    if not scored:
        fallback_ids = ("exam_paper_creation", "problem_extraction", "problem_archive", "problem_set_management")
        scored = [(1, capability, ["default"]) for capability in CAPABILITIES if capability.id in fallback_ids]

    scored.sort(key=lambda item: item[0], reverse=True)
    return [_capability_payload(capability, score=score, matches=matches) for score, capability, matches in scored[: max(1, min(limit, 8))]]


def _capability_payload(capability: CoAgentCapability, *, score: int | None = None, matches: list[str] | None = None) -> dict[str, Any]:
    payload: dict[str, Any] = {
        "id": capability.id,
        "title": capability.title,
        "category": capability.category,
        "summary": capability.summary,
        "href": capability.href,
        "required_info": list(capability.required_info),
        "side_effects": list(capability.side_effects),
        "execution_notes": list(capability.execution_notes),
        "ui_anchors": list(capability.ui_anchors),
        "workflow_steps": list(capability.workflow_steps),
        "can_execute": capability.can_execute,
    }
    if score is not None:
        payload["score"] = score
    if matches is not None:
        payload["matches"] = matches
    return payload


def capability_prompt_context(capabilities: list[dict[str, Any]]) -> list[dict[str, Any]]:
    return [
        {
            "id": item.get("id"),
            "title": item.get("title"),
            "category": item.get("category"),
            "summary": item.get("summary"),
            "href": item.get("href"),
            "can_execute": item.get("can_execute"),
            "required_info": item.get("required_info", []),
            "side_effects": item.get("side_effects", []),
            "execution_notes": item.get("execution_notes", []),
            "ui_anchors": item.get("ui_anchors", []),
            "workflow_steps": item.get("workflow_steps", []),
        }
        for item in capabilities
    ]


def co_agent_product_map() -> list[dict[str, str]]:
    by_id = {capability.id: capability for capability in CAPABILITIES}
    return [by_id[capability_id].product_item() for capability_id in PRODUCT_MAP_IDS if capability_id in by_id]
