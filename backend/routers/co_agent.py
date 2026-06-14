from fastapi import APIRouter, Depends, Request
from sqlalchemy import func, or_, select
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.orm import Session

from database import get_db
from models import (
    AcademyClass,
    Batch,
    BatchStatus,
    PaperSession,
    PaperSessionResult,
    Problem,
    ProblemSet,
    RoutineAction,
    StudentAcademyMembership,
)
from services.ownership import LOCAL_OWNER_ID, current_owner_id, current_owner_ids

router = APIRouter(prefix="/api/co-agent", tags=["co-agent"])

PRODUCT_MAP = [
    {"id": "extract", "label": "추출", "href": "/archive/new", "summary": "PDF를 업로드해 문항과 답안을 구조화합니다."},
    {"id": "archive", "label": "문항 보관", "href": "/problems", "summary": "추출된 문항을 검토하고 메타데이터를 정리합니다."},
    {"id": "sets", "label": "문항 세트", "href": "/problem-sets", "summary": "보관된 문항으로 시험지나 과제 세트를 만듭니다."},
    {"id": "classes", "label": "클래스/학생", "href": "/student-management", "summary": "수업 단위와 학생을 등록해 운영 데이터를 연결합니다."},
    {"id": "sessions", "label": "시험 배정", "href": "/student-management", "summary": "문항 세트를 학생에게 배정하고 채점 흐름을 만듭니다."},
    {"id": "routines", "label": "루틴", "href": "/co-agent/routines", "summary": "완료된 리포트와 피드백을 검토 후 전송합니다."},
]


def _academy_ids_for_co_agent(request: Request, db: Session) -> set[str]:
    owner_id = current_owner_id(request)
    owner_ids = current_owner_ids(request, db)
    if owner_id != LOCAL_OWNER_ID:
        owner_ids.add(owner_id)
    return owner_ids


def _owner_scope(model, owner_ids: set[str]):
    clauses = []
    if hasattr(model, "owner_id"):
        clauses.append(getattr(model, "owner_id").in_(list(owner_ids)))
    if hasattr(model, "academy_id"):
        clauses.append(getattr(model, "academy_id").in_(list(owner_ids)))
    if not clauses:
        return True
    return or_(*clauses)


def _count(db: Session, statement) -> int:
    try:
        return int(db.scalar(statement) or 0)
    except SQLAlchemyError:
        db.rollback()
        return 0


def _action(action_id: str, priority: int, category: str, title: str, summary: str, reason: str, href: str, cta: str, signals: list[str]) -> dict:
    return {
        "id": action_id,
        "priority": priority,
        "category": category,
        "title": title,
        "summary": summary,
        "reason": reason,
        "href": href,
        "cta": cta,
        "signals": signals,
        "confidence": "high" if priority >= 80 else "medium",
    }


@router.get("/next-actions")
def next_actions(request: Request, db: Session = Depends(get_db)):
    owner_id = current_owner_id(request)
    owner_ids = _academy_ids_for_co_agent(request, db)
    owner_scope = _owner_scope(Batch, owner_ids)
    problem_scope = _owner_scope(Problem, owner_ids)
    set_scope = _owner_scope(ProblemSet, owner_ids)

    batch_count = _count(db, select(func.count(Batch.id)).where(owner_scope))
    done_batch_count = _count(db, select(func.count(Batch.id)).where(owner_scope, Batch.status == BatchStatus.done))
    processing_batch_count = _count(db, select(func.count(Batch.id)).where(owner_scope, Batch.status.in_([BatchStatus.pending, BatchStatus.processing])))
    failed_batch_count = _count(db, select(func.count(Batch.id)).where(owner_scope, Batch.status == BatchStatus.error))
    problem_count = _count(db, select(func.count(Problem.id)).where(problem_scope, Problem.deleted_at.is_(None)))
    review_problem_count = _count(db, select(func.count(Problem.id)).where(problem_scope, Problem.deleted_at.is_(None), Problem.needs_review.is_(True)))
    answer_ready_count = _count(db, select(func.count(Problem.id)).where(problem_scope, Problem.deleted_at.is_(None), Problem.answer.is_not(None)))
    problem_set_count = _count(db, select(func.count(ProblemSet.id)).where(set_scope))

    class_count = _count(db, select(func.count(AcademyClass.id)).where(AcademyClass.academy_id.in_(list(owner_ids)), AcademyClass.is_active.is_(True)))
    student_count = _count(db, select(func.count(StudentAcademyMembership.id)).where(StudentAcademyMembership.academy_id.in_(list(owner_ids)), StudentAcademyMembership.status == "active"))
    paper_session_count = _count(db, select(func.count(PaperSession.id)).where(PaperSession.academy_id.in_(list(owner_ids))))
    pending_grading_count = _count(db, select(func.count(PaperSessionResult.id)).where(PaperSessionResult.academy_id.in_(list(owner_ids)), PaperSessionResult.status.in_(["pending_grading", "in_progress"])))
    graded_result_count = _count(db, select(func.count(PaperSessionResult.id)).where(PaperSessionResult.academy_id.in_(list(owner_ids)), PaperSessionResult.status == "graded"))
    pending_routine_count = _count(db, select(func.count(RoutineAction.id)).where(RoutineAction.academy_id.in_(list(owner_ids)), RoutineAction.status.in_(["suggested", "reviewing"])))

    stats = {
        "batches": batch_count,
        "done_batches": done_batch_count,
        "processing_batches": processing_batch_count,
        "failed_batches": failed_batch_count,
        "problems": problem_count,
        "review_problems": review_problem_count,
        "answer_ready_problems": answer_ready_count,
        "problem_sets": problem_set_count,
        "classes": class_count,
        "students": student_count,
        "paper_sessions": paper_session_count,
        "pending_grading_results": pending_grading_count,
        "graded_results": graded_result_count,
        "pending_routines": pending_routine_count,
    }

    actions: list[dict] = []
    if pending_routine_count:
        actions.append(
            _action(
                "review_routines",
                96,
                "routine",
                "대기 중인 루틴을 검토하세요",
                f"전송 전 확인이 필요한 루틴 {pending_routine_count}건이 있습니다.",
                "코에이전트는 전송을 자동으로 확정하지 않고, 사용자가 문구를 확인한 뒤 실행합니다.",
                "/co-agent/routines",
                "루틴 검토",
                [f"대기 루틴 {pending_routine_count}건"],
            )
        )
    if batch_count == 0 and problem_count == 0:
        actions.append(
            _action(
                "start_first_extract",
                95,
                "extract",
                "첫 PDF 추출을 시작하세요",
                "아직 추출된 자료가 없습니다. 문제 PDF나 해설지/답지를 업로드해 문항 보관함을 만들 수 있습니다.",
                "Tena Forge의 대부분 흐름은 추출된 문항을 기준으로 이어집니다.",
                "/archive/new",
                "추출 시작",
                ["추출 기록 없음", "보관 문항 없음"],
            )
        )
    if processing_batch_count:
        actions.append(
            _action(
                "check_extract_progress",
                88,
                "extract",
                "진행 중인 추출을 확인하세요",
                f"처리 중인 추출 작업 {processing_batch_count}건이 있습니다.",
                "추출이 끝나면 문항 검토와 세트 제작으로 이어갈 수 있습니다.",
                "/batches",
                "진행 상황 보기",
                [f"처리 중 {processing_batch_count}건"],
            )
        )
    if failed_batch_count:
        actions.append(
            _action(
                "repair_failed_extract",
                84,
                "extract",
                "실패한 추출을 확인하세요",
                f"실패한 추출 작업 {failed_batch_count}건이 있습니다.",
                "파일 형식이나 답안 자료를 다시 확인하면 다음 작업으로 이어질 수 있습니다.",
                "/batches",
                "실패 작업 확인",
                [f"실패 {failed_batch_count}건"],
            )
        )
    if done_batch_count and review_problem_count:
        actions.append(
            _action(
                "review_extracted_problems",
                90,
                "archive",
                "추출된 문항을 검토하세요",
                f"검토가 필요한 문항 {review_problem_count}개가 남아 있습니다.",
                "검토가 끝나야 세트 제작과 시험 배정의 정확도가 좋아집니다.",
                "/problems",
                "문항 검토",
                [f"완료 추출 {done_batch_count}건", f"검토 필요 {review_problem_count}개"],
            )
        )
    if problem_count and problem_set_count == 0:
        actions.append(
            _action(
                "create_problem_set",
                82,
                "sets",
                "문항 세트를 만드세요",
                f"보관된 문항 {problem_count}개를 세트로 묶을 수 있습니다.",
                "세트를 만들면 시험 배정, 채점, 리포트 루틴까지 연결됩니다.",
                "/problem-sets",
                "세트 만들기",
                [f"보관 문항 {problem_count}개", "세트 없음"],
            )
        )
    if problem_set_count and class_count == 0:
        actions.append(
            _action(
                "create_class",
                78,
                "classes",
                "첫 클래스를 만드세요",
                "문항 세트가 준비되어 있습니다. 클래스를 만들면 학생에게 시험을 배정할 수 있습니다.",
                "Academy OS 데이터가 있어야 학습 리포트와 루틴 추천이 정확해집니다.",
                "/student-management",
                "클래스 만들기",
                [f"문항 세트 {problem_set_count}개", "클래스 없음"],
            )
        )
    if class_count and student_count == 0:
        actions.append(
            _action(
                "add_students",
                76,
                "classes",
                "학생을 추가하세요",
                f"활성 클래스 {class_count}개가 있지만 등록된 학생이 없습니다.",
                "학생이 연결되어야 시험 배정, 채점 기록, 상담일지가 이어집니다.",
                "/student-management",
                "학생 추가",
                [f"클래스 {class_count}개", "학생 없음"],
            )
        )
    if problem_set_count and student_count and paper_session_count == 0:
        actions.append(
            _action(
                "assign_first_session",
                74,
                "sessions",
                "첫 시험을 배정하세요",
                "문항 세트와 학생 데이터가 준비되어 있습니다.",
                "시험 세션을 만들면 채점 결과와 오답 관리, 리포트 루틴이 이어집니다.",
                "/student-management",
                "시험 배정",
                [f"세트 {problem_set_count}개", f"학생 {student_count}명"],
            )
        )
    if pending_grading_count:
        actions.append(
            _action(
                "grade_sessions",
                92,
                "sessions",
                "채점 대기 결과를 처리하세요",
                f"채점이 필요한 결과 {pending_grading_count}건이 있습니다.",
                "채점이 끝나야 학생별 피드백과 리포트 루틴을 만들 수 있습니다.",
                "/student-management",
                "채점하기",
                [f"채점 대기 {pending_grading_count}건"],
            )
        )
    if graded_result_count and pending_routine_count == 0:
        actions.append(
            _action(
                "check_report_routines",
                68,
                "routine",
                "리포트 루틴 후보를 확인하세요",
                f"채점된 결과 {graded_result_count}건을 기반으로 공유 후보를 만들 수 있습니다.",
                "루틴 탭을 열면 코에이전트가 전송 전 검토가 필요한 후보를 정리합니다.",
                "/co-agent/routines",
                "루틴 확인",
                [f"채점 완료 {graded_result_count}건"],
            )
        )
    if not actions:
        actions.append(
            _action(
                "continue_archive_quality",
                60,
                "archive",
                "보관함 품질을 점검하세요",
                "현재 즉시 처리해야 할 큰 병목은 보이지 않습니다.",
                "문항 메타데이터와 세트 구성을 다듬으면 이후 추천 정확도가 높아집니다.",
                "/problems",
                "보관함 보기",
                ["긴급 작업 없음"],
            )
        )

    actions = sorted(actions, key=lambda item: item["priority"], reverse=True)[:5]
    current_stage = actions[0]["category"] if actions else "archive"
    return {
        "owner_id": owner_id,
        "current_stage": current_stage,
        "stats": stats,
        "actions": actions,
        "product_map": PRODUCT_MAP,
        "policy": {
            "autonomy": "recommend_only_until_user_confirms",
            "can_execute_without_confirmation": False,
            "side_effects_require_approval": True,
            "llm_role": "Tena Forge 기능 지도를 바탕으로 다음 행동을 설명하고 우선순위를 정합니다.",
        },
    }
