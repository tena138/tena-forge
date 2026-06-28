from __future__ import annotations

from typing import Any

from sqlalchemy import or_, select
from sqlalchemy.orm import Session

from models import (
    AbuseSignal,
    Academy,
    AcademyClass,
    AcademyMaterial,
    AcademyMaterialAssignment,
    AcademySeat,
    AcademyStudentSubscription,
    Announcement,
    ArchiveAccessGrant,
    ArchiveFolder,
    Assignment,
    AssignmentAnswer,
    AssignmentContent,
    AssignmentSubmission,
    AssignmentTarget,
    Batch,
    CalendarEvent,
    ClassScheduleEvent,
    ClassStudent,
    ClassTeacher,
    ContentVersion,
    HubTemplate,
    JobFile,
    JobOutput,
    KoreanExtractionDocument,
    KoreanPassageGroup,
    KoreanQuestion,
    LearningAssignment,
    LearningAssignmentTarget,
    LearningSubmission,
    MaterialDeliveryLog,
    PaperSession,
    PaperSessionResult,
    Problem,
    ProblemAttempt,
    ProblemResult,
    ProblemSet,
    ProblemSetItem,
    ProblemUsageHistory,
    ProcessingJob,
    RoutineAction,
    RoutineMessage,
    SeatAssignmentHistory,
    StudentAcademyMembership,
    StudentInvite,
    StudentNotification,
    StudentPersonalSet,
    StudentPersonalSetItem,
    StudentTuitionPayment,
    StudentTuitionSessionAdjustment,
    Tag,
    TestSession,
    TestSessionEvent,
    WatermarkedExport,
    WrongAnswerAttempt,
    WrongAnswerExport,
    WrongAnswerItem,
    WrongAnswerRecord,
    WrongAnswerReview,
)


def _dedupe(values: list[Any] | set[Any] | tuple[Any, ...]) -> list[Any]:
    return list(dict.fromkeys(value for value in values if value is not None))


def _in(column: Any, values: list[Any] | set[Any] | tuple[Any, ...]) -> Any | None:
    clean = _dedupe(values)
    return column.in_(clean) if clean else None


def _or(*conditions: Any | None) -> Any | None:
    clean = [condition for condition in conditions if condition is not None]
    return or_(*clean) if clean else None


def _ids(db: Session, statement: Any) -> list[Any]:
    return list(db.scalars(statement).all())


def _delete(db: Session, counts: dict[str, int], label: str, model: Any, condition: Any | None) -> None:
    if condition is None:
        return
    deleted = db.query(model).filter(condition).delete(synchronize_session=False)
    if deleted:
        counts[label] = counts.get(label, 0) + int(deleted)


def _plan_value(academy: Academy) -> str:
    return getattr(academy.plan, "value", str(academy.plan))


def reset_account_data(db: Session, academy: Academy, target_owner_id: str | None = None) -> dict[str, Any]:
    """Delete academy/student operational data while preserving account and billing records."""

    account_id = str(academy.id)
    academy_id = str(target_owner_id or account_id)
    user_id = academy_id
    counts: dict[str, int] = {}

    membership_rows = db.execute(
        select(StudentAcademyMembership.id, StudentAcademyMembership.student_user_id).where(
            StudentAcademyMembership.academy_id == academy_id
        )
    ).all()
    membership_ids = [row[0] for row in membership_rows]
    student_ids = _dedupe([account_id, user_id, *(row[1] for row in membership_rows)])
    class_ids = _ids(db, select(AcademyClass.id).where(AcademyClass.academy_id == academy_id))
    seat_ids = _ids(db, select(AcademySeat.id).where(AcademySeat.academy_id == academy_id))
    student_invite_ids = _ids(
        db,
        select(StudentInvite.id).where(
            _or(
                StudentInvite.academy_id == academy_id,
                _in(StudentInvite.academy_seat_id, seat_ids),
                _in(StudentInvite.academy_student_membership_id, membership_ids),
                _in(StudentInvite.target_user_id, student_ids),
            )
        ),
    )

    assignment_ids = _ids(
        db,
        select(Assignment.id).where(
            _or(
                Assignment.academy_id == academy_id,
                Assignment.created_by_user_id == user_id,
            )
        ),
    )
    submission_ids = _ids(
        db,
        select(AssignmentSubmission.id).where(
            _or(
                _in(AssignmentSubmission.assignment_id, assignment_ids),
                _in(AssignmentSubmission.student_membership_id, membership_ids),
                _in(AssignmentSubmission.student_user_id, student_ids),
            )
        ),
    )
    test_session_ids = _ids(
        db,
        select(TestSession.id).where(
            _or(
                _in(TestSession.assignment_id, assignment_ids),
                _in(TestSession.student_membership_id, membership_ids),
            )
        ),
    )

    material_ids = _ids(db, select(AcademyMaterial.id).where(AcademyMaterial.academy_id == academy_id))
    wrong_answer_item_ids = _ids(
        db,
        select(WrongAnswerItem.id).where(
            _or(
                WrongAnswerItem.academy_id == academy_id,
                _in(WrongAnswerItem.student_user_id, student_ids),
                _in(WrongAnswerItem.student_membership_id, membership_ids),
            )
        ),
    )
    content_version_ids = _ids(
        db,
        select(ContentVersion.id).where(
            _or(
                ContentVersion.academy_id == academy_id,
                ContentVersion.created_by == user_id,
            )
        ),
    )
    paper_session_ids = _ids(
        db,
        select(PaperSession.id).where(
            _or(
                PaperSession.academy_id == academy_id,
                _in(PaperSession.content_version_id, content_version_ids),
                PaperSession.created_by == user_id,
            )
        ),
    )
    paper_session_result_ids = _ids(
        db,
        select(PaperSessionResult.id).where(
            _or(
                PaperSessionResult.academy_id == academy_id,
                _in(PaperSessionResult.paper_session_id, paper_session_ids),
                _in(PaperSessionResult.student_membership_id, membership_ids),
                _in(PaperSessionResult.student_user_id, student_ids),
            )
        ),
    )
    learning_assignment_ids = _ids(
        db,
        select(LearningAssignment.id).where(
            _or(
                LearningAssignment.academy_id == academy_id,
                LearningAssignment.assigned_by == user_id,
                _in(LearningAssignment.content_version_id, content_version_ids),
            )
        ),
    )
    learning_submission_ids = _ids(
        db,
        select(LearningSubmission.id).where(
            _or(
                LearningSubmission.academy_id == academy_id,
                _in(LearningSubmission.student_id, student_ids),
                _in(LearningSubmission.assignment_id, learning_assignment_ids),
            )
        ),
    )
    student_personal_set_ids = _ids(db, select(StudentPersonalSet.id).where(_in(StudentPersonalSet.student_id, student_ids)))
    routine_action_ids = _ids(db, select(RoutineAction.id).where(RoutineAction.academy_id == academy_id))

    batch_ids = _ids(
        db,
        select(Batch.id).where(
            _or(
                Batch.academy_id == academy_id,
                Batch.owner_id == user_id,
            )
        ),
    )
    problem_ids = _ids(
        db,
        select(Problem.id).where(
            _or(
                Problem.academy_id == academy_id,
                Problem.owner_id == user_id,
                _in(Problem.source_batch_id, batch_ids),
            )
        ),
    )
    problem_set_ids = _ids(
        db,
        select(ProblemSet.id).where(
            _or(
                ProblemSet.academy_id == academy_id,
                ProblemSet.owner_id == user_id,
            )
        ),
    )
    korean_document_ids = _ids(
        db,
        select(KoreanExtractionDocument.id).where(_in(KoreanExtractionDocument.batch_id, batch_ids)),
    )
    archive_folder_ids = _ids(
        db,
        select(ArchiveFolder.id).where(
            _or(
                ArchiveFolder.academy_id == academy_id,
                ArchiveFolder.owner_id == user_id,
            )
        ),
    )
    job_ids = _ids(db, select(ProcessingJob.id).where(ProcessingJob.user_id == user_id))

    _delete(
        db,
        counts,
        "routine_messages",
        RoutineMessage,
        _or(
            _in(RoutineMessage.action_id, routine_action_ids),
            _in(RoutineMessage.student_membership_id, membership_ids),
            _in(RoutineMessage.student_user_id, student_ids),
            _in(RoutineMessage.class_id, class_ids),
        ),
    )
    _delete(db, counts, "routine_actions", RoutineAction, RoutineAction.academy_id == academy_id)
    _delete(
        db,
        counts,
        "student_notifications",
        StudentNotification,
        _or(StudentNotification.academy_id == academy_id, _in(StudentNotification.student_user_id, student_ids)),
    )
    _delete(db, counts, "student_invites", StudentInvite, _in(StudentInvite.id, student_invite_ids))
    _delete(db, counts, "academy_announcements", Announcement, Announcement.academy_id == academy_id)
    _delete(
        db,
        counts,
        "abuse_signals",
        AbuseSignal,
        _or(AbuseSignal.academy_id == academy_id, AbuseSignal.user_id == user_id),
    )

    _delete(
        db,
        counts,
        "wrong_answer_reviews",
        WrongAnswerReview,
        _or(_in(WrongAnswerReview.wrong_answer_item_id, wrong_answer_item_ids), _in(WrongAnswerReview.student_user_id, student_ids)),
    )
    _delete(
        db,
        counts,
        "wrong_answer_attempts",
        WrongAnswerAttempt,
        _or(_in(WrongAnswerAttempt.wrong_answer_item_id, wrong_answer_item_ids), _in(WrongAnswerAttempt.student_user_id, student_ids)),
    )
    _delete(
        db,
        counts,
        "wrong_answer_exports",
        WrongAnswerExport,
        _or(WrongAnswerExport.academy_id == academy_id, _in(WrongAnswerExport.student_user_id, student_ids)),
    )
    _delete(db, counts, "wrong_answer_items", WrongAnswerItem, _in(WrongAnswerItem.id, wrong_answer_item_ids))

    _delete(
        db,
        counts,
        "material_delivery_logs",
        MaterialDeliveryLog,
        _or(
            MaterialDeliveryLog.academy_id == academy_id,
            _in(MaterialDeliveryLog.material_id, material_ids),
            _in(MaterialDeliveryLog.student_user_id, student_ids),
        ),
    )
    _delete(
        db,
        counts,
        "watermarked_exports",
        WatermarkedExport,
        _or(
            WatermarkedExport.academy_id == academy_id,
            _in(WatermarkedExport.student_user_id, student_ids),
            _in(WatermarkedExport.student_membership_id, membership_ids),
            _in(WatermarkedExport.source_material_id, material_ids),
        ),
    )
    _delete(db, counts, "academy_material_assignments", AcademyMaterialAssignment, _in(AcademyMaterialAssignment.material_id, material_ids))
    _delete(db, counts, "academy_materials", AcademyMaterial, _in(AcademyMaterial.id, material_ids))

    _delete(db, counts, "assignment_answers", AssignmentAnswer, _in(AssignmentAnswer.submission_id, submission_ids))
    _delete(db, counts, "test_session_events", TestSessionEvent, _in(TestSessionEvent.test_session_id, test_session_ids))
    _delete(db, counts, "test_sessions", TestSession, _in(TestSession.id, test_session_ids))
    _delete(db, counts, "assignment_submissions", AssignmentSubmission, _in(AssignmentSubmission.id, submission_ids))
    _delete(db, counts, "assignment_contents", AssignmentContent, _in(AssignmentContent.assignment_id, assignment_ids))
    _delete(db, counts, "assignment_targets", AssignmentTarget, _in(AssignmentTarget.assignment_id, assignment_ids))
    _delete(db, counts, "assignments", Assignment, _in(Assignment.id, assignment_ids))

    _delete(
        db,
        counts,
        "student_tuition_payments",
        StudentTuitionPayment,
        _or(
            StudentTuitionPayment.academy_id == academy_id,
            _in(StudentTuitionPayment.student_membership_id, membership_ids),
            _in(StudentTuitionPayment.student_user_id, student_ids),
            _in(StudentTuitionPayment.class_id, class_ids),
        ),
    )
    _delete(
        db,
        counts,
        "student_tuition_session_adjustments",
        StudentTuitionSessionAdjustment,
        _or(
            StudentTuitionSessionAdjustment.academy_id == academy_id,
            _in(StudentTuitionSessionAdjustment.student_membership_id, membership_ids),
        ),
    )

    _delete(
        db,
        counts,
        "problem_attempts",
        ProblemAttempt,
        _or(
            ProblemAttempt.academy_id == academy_id,
            _in(ProblemAttempt.student_id, student_ids),
            _in(ProblemAttempt.assignment_id, learning_assignment_ids),
            _in(ProblemAttempt.submission_id, learning_submission_ids),
            _in(ProblemAttempt.problem_id, problem_ids),
        ),
    )
    _delete(
        db,
        counts,
        "wrong_answer_records",
        WrongAnswerRecord,
        _or(
            WrongAnswerRecord.academy_id == academy_id,
            _in(WrongAnswerRecord.student_id, student_ids),
            _in(WrongAnswerRecord.problem_id, problem_ids),
        ),
    )
    _delete(
        db,
        counts,
        "student_personal_set_items",
        StudentPersonalSetItem,
        _or(
            _in(StudentPersonalSetItem.set_id, student_personal_set_ids),
            _in(StudentPersonalSetItem.student_id, student_ids),
            StudentPersonalSetItem.academy_id == academy_id,
            _in(StudentPersonalSetItem.problem_id, problem_ids),
        ),
    )
    _delete(db, counts, "learning_submissions", LearningSubmission, _in(LearningSubmission.id, learning_submission_ids))
    _delete(db, counts, "learning_assignment_targets", LearningAssignmentTarget, _in(LearningAssignmentTarget.assignment_id, learning_assignment_ids))
    _delete(db, counts, "learning_assignments", LearningAssignment, _in(LearningAssignment.id, learning_assignment_ids))
    _delete(db, counts, "student_personal_sets", StudentPersonalSet, _in(StudentPersonalSet.id, student_personal_set_ids))

    _delete(
        db,
        counts,
        "problem_results",
        ProblemResult,
        _or(
            ProblemResult.academy_id == academy_id,
            _in(ProblemResult.paper_session_id, paper_session_ids),
            _in(ProblemResult.paper_session_result_id, paper_session_result_ids),
            _in(ProblemResult.student_membership_id, membership_ids),
            _in(ProblemResult.student_user_id, student_ids),
            _in(ProblemResult.problem_id, problem_ids),
        ),
    )
    _delete(db, counts, "paper_session_results", PaperSessionResult, _in(PaperSessionResult.id, paper_session_result_ids))
    _delete(
        db,
        counts,
        "class_schedule_events",
        ClassScheduleEvent,
        _or(
            ClassScheduleEvent.academy_id == academy_id,
            _in(ClassScheduleEvent.class_id, class_ids),
            _in(ClassScheduleEvent.linked_paper_session_id, paper_session_ids),
        ),
    )
    _delete(
        db,
        counts,
        "calendar_events",
        CalendarEvent,
        _or(
            CalendarEvent.academy_id == academy_id,
            CalendarEvent.owner_id == user_id,
            CalendarEvent.created_by_user_id == user_id,
            _in(CalendarEvent.class_id, class_ids),
            _in(CalendarEvent.student_membership_id, membership_ids),
        ),
    )
    _delete(
        db,
        counts,
        "archive_access_grants",
        ArchiveAccessGrant,
        _or(
            ArchiveAccessGrant.academy_id == academy_id,
            _in(ArchiveAccessGrant.student_id, student_ids),
        ),
    )
    _delete(db, counts, "paper_sessions", PaperSession, _in(PaperSession.id, paper_session_ids))

    _delete(
        db,
        counts,
        "problem_usage_history",
        ProblemUsageHistory,
        _or(
            ProblemUsageHistory.academy_id == academy_id,
            ProblemUsageHistory.owner_id == user_id,
            ProblemUsageHistory.created_by == user_id,
            _in(ProblemUsageHistory.problem_id, problem_ids),
            _in(ProblemUsageHistory.problem_set_id, problem_set_ids),
        ),
    )
    _delete(
        db,
        counts,
        "problem_set_items",
        ProblemSetItem,
        _or(_in(ProblemSetItem.problem_set_id, problem_set_ids), _in(ProblemSetItem.problem_id, problem_ids)),
    )
    _delete(db, counts, "tags", Tag, _in(Tag.problem_id, problem_ids))
    _delete(db, counts, "korean_questions", KoreanQuestion, _in(KoreanQuestion.document_id, korean_document_ids))
    _delete(db, counts, "korean_passage_groups", KoreanPassageGroup, _in(KoreanPassageGroup.document_id, korean_document_ids))
    _delete(db, counts, "korean_extraction_documents", KoreanExtractionDocument, _in(KoreanExtractionDocument.id, korean_document_ids))
    _delete(db, counts, "content_versions", ContentVersion, _in(ContentVersion.id, content_version_ids))
    _delete(db, counts, "problem_sets", ProblemSet, _in(ProblemSet.id, problem_set_ids))
    _delete(db, counts, "problems", Problem, _in(Problem.id, problem_ids))
    _delete(db, counts, "batches", Batch, _in(Batch.id, batch_ids))
    _delete(db, counts, "archive_folders", ArchiveFolder, _in(ArchiveFolder.id, archive_folder_ids))
    _delete(
        db,
        counts,
        "template_hub_templates",
        HubTemplate,
        _or(HubTemplate.academy_id == academy_id, HubTemplate.owner_id == user_id),
    )

    _delete(db, counts, "job_outputs", JobOutput, _or(_in(JobOutput.job_id, job_ids), JobOutput.user_id == user_id))
    _delete(db, counts, "job_files", JobFile, _or(_in(JobFile.job_id, job_ids), JobFile.user_id == user_id))
    _delete(db, counts, "jobs", ProcessingJob, ProcessingJob.user_id == user_id)

    _delete(
        db,
        counts,
        "class_students",
        ClassStudent,
        _or(_in(ClassStudent.student_membership_id, membership_ids), _in(ClassStudent.class_id, class_ids)),
    )
    _delete(db, counts, "class_teachers", ClassTeacher, _in(ClassTeacher.class_id, class_ids))
    _delete(db, counts, "seat_assignment_history", SeatAssignmentHistory, _or(SeatAssignmentHistory.academy_id == academy_id, _in(SeatAssignmentHistory.academy_seat_id, seat_ids)))
    _delete(db, counts, "student_academy_memberships", StudentAcademyMembership, _in(StudentAcademyMembership.id, membership_ids))
    _delete(db, counts, "academy_seats", AcademySeat, _in(AcademySeat.id, seat_ids))
    _delete(db, counts, "academy_classes", AcademyClass, _in(AcademyClass.id, class_ids))

    subscription = db.scalar(select(AcademyStudentSubscription).where(AcademyStudentSubscription.academy_id == account_id))
    preserved = {
        "account_id": account_id,
        "target_owner_id": academy_id,
        "plan": _plan_value(academy),
        "student_plan_code": subscription.plan_code if subscription else None,
        "purchased_additional_student_keys": subscription.purchased_additional_seats if subscription else 0,
        "purchased_staff_seats": subscription.purchased_staff_seats if subscription else 0,
    }
    return {
        "deleted": dict(sorted(counts.items())),
        "total_deleted": sum(counts.values()),
        "preserved": preserved,
    }
