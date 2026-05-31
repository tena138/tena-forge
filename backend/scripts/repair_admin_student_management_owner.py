from __future__ import annotations

from datetime import datetime
import os
from pathlib import Path
import sys
from typing import Iterable

from sqlalchemy import func, or_, select

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from database import SessionLocal
from models import (
    Academy,
    AcademyClass,
    AcademyPlan,
    AcademySeat,
    AcademyStudentSubscription,
    Announcement,
    ArchiveAccessGrant,
    Assignment,
    ClassScheduleEvent,
    ClassStudent,
    ContentVersion,
    LearningAssignment,
    LearningAssignmentTarget,
    LearningSubmission,
    PaperSession,
    PaperSessionResult,
    ProblemAttempt,
    ProblemResult,
    SeatAssignmentHistory,
    StudentAcademyMembership,
    StudentNotification,
    StudentPersonalSetItem,
    UserRole,
    WrongAnswerRecord,
)


LOCAL_OWNER_ID = "local_user"
PRIMARY_ADMIN_EMAIL = "admin@tena-forge.com"
LEGACY_ADMIN_EMAILS = {
    PRIMARY_ADMIN_EMAIL,
    "admin@tenaforge.com",
    "admin@tena.local",
}


def _admin_emails() -> set[str]:
    emails = {email.lower() for email in LEGACY_ADMIN_EMAILS}
    env_email = os.getenv("BOOTSTRAP_ADMIN_EMAIL", "").strip().lower()
    if env_email:
        emails.add(env_email)
    return emails


def _string_ids(values: Iterable[object]) -> set[str]:
    return {str(value) for value in values if value is not None}


def _canonical_admin(db) -> Academy | None:
    emails = _admin_emails()
    preferred = db.scalar(select(Academy).where(func.lower(Academy.email) == PRIMARY_ADMIN_EMAIL))
    if preferred:
        return preferred
    return db.scalar(select(Academy).where(func.lower(Academy.email).in_(emails)))


def _admin_account_ids(db) -> set[str]:
    return _string_ids(db.scalars(select(Academy.id).where(func.lower(Academy.email).in_(_admin_emails()))).all())


def _discover_related_student_management_owners(db, seed_owner_ids: set[str]) -> set[str]:
    """Find split owners by following class/student/session links.

    Production data has at times been written under local_user, admin@tenaforge.com,
    admin@tena-forge.com, or a membership owner only reachable through class_students.
    This walks those relationships so the repair is durable instead of tied to one
    hard-coded broken owner id.
    """

    owner_ids = set(seed_owner_ids)
    membership_ids: set[str] = set()
    class_ids: set[str] = set()
    paper_session_ids: set[str] = set()

    changed = True
    while changed:
        changed = False

        classes = db.scalars(select(AcademyClass).where(AcademyClass.academy_id.in_(owner_ids))).all()
        if class_ids:
            classes.extend(db.scalars(select(AcademyClass).where(AcademyClass.id.in_(class_ids))).all())
        next_class_ids = _string_ids(class_.id for class_ in classes)
        if not next_class_ids.issubset(class_ids):
            class_ids |= next_class_ids
            changed = True
        next_owner_ids = _string_ids(class_.academy_id for class_ in classes)
        if not next_owner_ids.issubset(owner_ids):
            owner_ids |= next_owner_ids
            changed = True

        linked_membership_ids = set()
        if class_ids:
            linked_membership_ids = _string_ids(
                db.scalars(
                    select(ClassStudent.student_membership_id).where(
                        ClassStudent.class_id.in_(class_ids),
                        ClassStudent.left_at.is_(None),
                    )
                ).all()
            )
        if membership_ids:
            linked_membership_ids |= membership_ids
        direct_memberships = db.scalars(
            select(StudentAcademyMembership).where(StudentAcademyMembership.academy_id.in_(owner_ids))
        ).all()
        linked_memberships = []
        if linked_membership_ids:
            linked_memberships = db.scalars(
                select(StudentAcademyMembership).where(StudentAcademyMembership.id.in_(linked_membership_ids))
            ).all()
        all_memberships = [*direct_memberships, *linked_memberships]

        next_membership_ids = _string_ids(membership.id for membership in all_memberships)
        if not next_membership_ids.issubset(membership_ids):
            membership_ids |= next_membership_ids
            changed = True

        next_owner_ids = _string_ids(membership.academy_id for membership in all_memberships)
        if not next_owner_ids.issubset(owner_ids):
            owner_ids |= next_owner_ids
            changed = True

        seat_ids = _string_ids(membership.academy_seat_id for membership in all_memberships)
        seat_filters = [AcademySeat.academy_id.in_(owner_ids)]
        if seat_ids:
            seat_filters.append(AcademySeat.id.in_(seat_ids))
        if membership_ids:
            seat_filters.append(AcademySeat.current_student_membership_id.in_(membership_ids))
        seats = db.scalars(select(AcademySeat).where(or_(*seat_filters))).all()
        next_owner_ids = _string_ids(seat.academy_id for seat in seats)
        if not next_owner_ids.issubset(owner_ids):
            owner_ids |= next_owner_ids
            changed = True

        if membership_ids:
            result_rows = db.scalars(
                select(PaperSessionResult).where(PaperSessionResult.student_membership_id.in_(membership_ids))
            ).all()
            problem_rows = db.scalars(
                select(ProblemResult).where(ProblemResult.student_membership_id.in_(membership_ids))
            ).all()
            session_ids_from_results = _string_ids(row.paper_session_id for row in [*result_rows, *problem_rows])
            if not session_ids_from_results.issubset(paper_session_ids):
                paper_session_ids |= session_ids_from_results
                changed = True
            next_owner_ids = _string_ids(row.academy_id for row in [*result_rows, *problem_rows])
            if not next_owner_ids.issubset(owner_ids):
                owner_ids |= next_owner_ids
                changed = True

        schedule_filters = [ClassScheduleEvent.academy_id.in_(owner_ids)]
        if class_ids:
            schedule_filters.append(ClassScheduleEvent.class_id.in_(class_ids))
        if paper_session_ids:
            schedule_filters.append(ClassScheduleEvent.linked_paper_session_id.in_(paper_session_ids))
        schedules = db.scalars(select(ClassScheduleEvent).where(or_(*schedule_filters))).all()
        next_owner_ids = _string_ids(schedule.academy_id for schedule in schedules)
        if not next_owner_ids.issubset(owner_ids):
            owner_ids |= next_owner_ids
            changed = True

        sessions = db.scalars(select(PaperSession).where(PaperSession.academy_id.in_(owner_ids))).all()
        if paper_session_ids:
            sessions.extend(db.scalars(select(PaperSession).where(PaperSession.id.in_(paper_session_ids))).all())
        for session in sessions:
            if str(session.academy_id) not in owner_ids:
                owner_ids.add(str(session.academy_id))
                changed = True
            if str(session.id) not in paper_session_ids:
                paper_session_ids.add(str(session.id))
                changed = True
            for membership_id in session.student_membership_ids or []:
                if str(membership_id) not in membership_ids:
                    membership_ids.add(str(membership_id))
                    changed = True
            for class_id in session.class_ids or []:
                if str(class_id) not in class_ids:
                    class_ids.add(str(class_id))
                    changed = True

    return owner_ids


def _merge_subscriptions(db, canonical_id: str, source_ids: set[str]) -> int:
    rows = db.scalars(
        select(AcademyStudentSubscription).where(AcademyStudentSubscription.academy_id.in_(source_ids))
    ).all()
    canonical = next((row for row in rows if row.academy_id == canonical_id), None)
    if not canonical:
        canonical = AcademyStudentSubscription(academy_id=canonical_id)
        db.add(canonical)
        db.flush()

    changed = 0
    for row in rows:
        if row.id == canonical.id:
            continue
        canonical.purchased_additional_seats = max(
            canonical.purchased_additional_seats,
            row.purchased_additional_seats or 0,
        )
        if row.status == "active":
            canonical.status = "active"
        merged_metadata = dict(canonical.billing_metadata or {})
        merged_metadata.update(row.billing_metadata or {})
        canonical.billing_metadata = merged_metadata
        db.delete(row)
        changed += 1
    return changed


def _merge_wrong_answers(db, canonical_id: str, source_ids: set[str]) -> int:
    moved = 0
    rows = db.scalars(select(WrongAnswerRecord).where(WrongAnswerRecord.academy_id.in_(source_ids))).all()
    canonical_by_key = {
        (row.student_id, str(row.problem_id)): row
        for row in rows
        if row.academy_id == canonical_id
    }
    for row in rows:
        if row.academy_id == canonical_id:
            continue
        key = (row.student_id, str(row.problem_id))
        existing = canonical_by_key.get(key)
        if existing:
            existing.wrong_count = max(existing.wrong_count or 0, row.wrong_count or 0)
            existing.retry_count = max(existing.retry_count or 0, row.retry_count or 0)
            existing.first_wrong_at = min(existing.first_wrong_at, row.first_wrong_at)
            existing.latest_wrong_at = max(existing.latest_wrong_at, row.latest_wrong_at)
            existing.source_assignment_ids = list(
                dict.fromkeys([*(existing.source_assignment_ids or []), *(row.source_assignment_ids or [])])
            )
            existing.teacher_memo = existing.teacher_memo or row.teacher_memo
            existing.student_memo = existing.student_memo or row.student_memo
            existing.updated_at = datetime.utcnow()
            db.delete(row)
        else:
            row.academy_id = canonical_id
            canonical_by_key[key] = row
        moved += 1
    return moved


def _bulk_reassign(db, canonical_id: str, source_ids: set[str]) -> int:
    models = (
        AcademySeat,
        StudentAcademyMembership,
        SeatAssignmentHistory,
        AcademyClass,
        Assignment,
        ArchiveAccessGrant,
        LearningAssignment,
        LearningAssignmentTarget,
        LearningSubmission,
        ProblemAttempt,
        ContentVersion,
        PaperSession,
        PaperSessionResult,
        ProblemResult,
        ClassScheduleEvent,
        StudentPersonalSetItem,
        Announcement,
        StudentNotification,
    )
    total = 0
    old_ids = source_ids - {canonical_id}
    if not old_ids:
        return 0
    for model in models:
        total += (
            db.query(model)
            .filter(model.academy_id.in_(old_ids))
            .update({model.academy_id: canonical_id}, synchronize_session=False)
        )
    return total


def _grant_admin_role(db, admin: Academy) -> None:
    admin.account_type = admin.account_type or "academy"
    admin.plan = AcademyPlan.pro
    admin.is_active = True
    admin.is_suspended = False
    role = db.scalar(
        select(UserRole).where(
            UserRole.user_id == str(admin.id),
            UserRole.role == "admin",
        )
    )
    if not role:
        db.add(UserRole(user_id=str(admin.id), role="admin", granted_by="repair_admin_student_management_owner"))


def main() -> None:
    db = SessionLocal()
    try:
        canonical = _canonical_admin(db)
        if not canonical:
            print("Skipping admin student-management repair: no admin account was found.")
            return

        canonical_id = str(canonical.id)
        seed_owner_ids = _admin_account_ids(db) | {LOCAL_OWNER_ID, canonical_id}
        source_owner_ids = _discover_related_student_management_owners(db, seed_owner_ids)

        _grant_admin_role(db, canonical)
        merged_subscriptions = _merge_subscriptions(db, canonical_id, source_owner_ids)
        merged_wrong_answers = _merge_wrong_answers(db, canonical_id, source_owner_ids)
        db.flush()
        reassigned = _bulk_reassign(db, canonical_id, source_owner_ids)
        db.commit()

        print(
            "Admin student-management owner repair complete: "
            f"canonical={canonical.email} ({canonical_id}), "
            f"sources={sorted(source_owner_ids)}, "
            f"reassigned={reassigned}, "
            f"merged_subscriptions={merged_subscriptions}, "
            f"merged_wrong_answers={merged_wrong_answers}."
        )
    except Exception:
        db.rollback()
        raise
    finally:
        db.close()


if __name__ == "__main__":
    main()
