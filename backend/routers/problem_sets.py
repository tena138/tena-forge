from datetime import datetime
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Request, Response
from sqlalchemy import func, select
from sqlalchemy.orm import Session, joinedload

from database import get_db
from models import MarketplaceListing, Problem, ProblemSet, ProblemSetItem
from schemas import (
    MarketplaceSubmissionRequest,
    ProblemSetAppendItem,
    ProblemSetAppendItems,
    ProblemSetCreate,
    ProblemSetListItem,
    ProblemSetRead,
    ProblemSetReorder,
    ProblemSetUpdate,
)
from services.license_service import is_marketplace_publish_allowed
from services.ownership import current_owner_id

router = APIRouter(prefix="/api/problem-sets", tags=["problem sets"])


def _sync_marketplace_eligibility(problem_set: ProblemSet) -> None:
    item_count = len(problem_set.items)
    problem_set.problem_count = item_count
    problem_set.can_publish_to_marketplace = (
        bool(problem_set.rights_confirmed)
        and problem_set.source_type not in {"personal_study_only", "unknown"}
        and item_count > 0
    )


def _get_set(db: Session, set_id: UUID, owner_id: str) -> ProblemSet:
    problem_set = db.scalars(
        select(ProblemSet)
        .where(ProblemSet.id == set_id, ProblemSet.owner_id == owner_id)
        .options(joinedload(ProblemSet.items).joinedload(ProblemSetItem.problem).joinedload(Problem.tags))
    ).unique().first()
    if not problem_set:
        raise HTTPException(status_code=404, detail="문항 세트를 찾을 수 없습니다.")
    problem_set.items.sort(key=lambda item: item.order_index)
    _sync_marketplace_eligibility(problem_set)
    return problem_set


def _replace_items(db: Session, problem_set: ProblemSet, problem_ids: list[UUID], owner_id: str) -> None:
    unique_ids = []
    seen = set()
    for problem_id in problem_ids:
        if problem_id not in seen:
            unique_ids.append(problem_id)
            seen.add(problem_id)
    if unique_ids:
        found = set(db.scalars(select(Problem.id).where(Problem.id.in_(unique_ids), Problem.owner_id == owner_id)).all())
        missing = [str(problem_id) for problem_id in unique_ids if problem_id not in found]
        if missing:
            raise HTTPException(status_code=404, detail=f"문항을 찾을 수 없습니다: {', '.join(missing)}")
    problem_set.items.clear()
    for index, problem_id in enumerate(unique_ids):
        problem_set.items.append(ProblemSetItem(problem_id=problem_id, order_index=index))
    _sync_marketplace_eligibility(problem_set)
    problem_set.updated_at = datetime.utcnow()


@router.post("", response_model=ProblemSetRead)
def create_problem_set(payload: ProblemSetCreate, request: Request, db: Session = Depends(get_db)):
    if not payload.name.strip():
        raise HTTPException(status_code=400, detail="문항 세트 이름이 필요합니다.")
    owner_id = current_owner_id(request)
    problem_set = ProblemSet(
        name=payload.name.strip(),
        owner_id=owner_id,
        subtitle=payload.subtitle,
        description=payload.description,
        subject=payload.subject,
        grade=payload.grade,
        unit=payload.unit,
        difficulty=payload.difficulty,
        visibility=payload.visibility,
        source_type=payload.source_type,
        rights_confirmed=payload.rights_confirmed,
        thumbnail_url=payload.thumbnail_url,
    )
    db.add(problem_set)
    _replace_items(db, problem_set, payload.problem_ids, owner_id)
    db.commit()
    return _get_set(db, problem_set.id, owner_id)


@router.get("", response_model=list[ProblemSetListItem])
@router.get("/mine", response_model=list[ProblemSetListItem])
def list_problem_sets(request: Request, db: Session = Depends(get_db)):
    owner_id = current_owner_id(request)
    rows = db.execute(
        select(ProblemSet, func.count(ProblemSetItem.id).label("item_count"))
        .outerjoin(ProblemSetItem, ProblemSetItem.problem_set_id == ProblemSet.id)
        .where(ProblemSet.owner_id == owner_id)
        .group_by(ProblemSet.id)
        .order_by(ProblemSet.updated_at.desc())
    ).all()
    result = []
    for problem_set, count in rows:
        problem_set.problem_count = count
        problem_set.can_publish_to_marketplace = (
            problem_set.rights_confirmed
            and problem_set.source_type not in {"personal_study_only", "unknown"}
            and count > 0
        )
        result.append(
            {
                "id": problem_set.id,
                "name": problem_set.name,
                "subtitle": problem_set.subtitle,
                "description": problem_set.description,
                "subject": problem_set.subject,
                "grade": problem_set.grade,
                "unit": problem_set.unit,
                "difficulty": problem_set.difficulty,
                "visibility": problem_set.visibility,
                "source_type": problem_set.source_type,
                "rights_confirmed": problem_set.rights_confirmed,
                "can_publish_to_marketplace": problem_set.can_publish_to_marketplace,
                "thumbnail_url": problem_set.thumbnail_url,
                "created_at": problem_set.created_at,
                "updated_at": problem_set.updated_at,
                "item_count": count,
            }
        )
    return result


@router.get("/{set_id}", response_model=ProblemSetRead)
def get_problem_set(set_id: UUID, request: Request, db: Session = Depends(get_db)):
    return _get_set(db, set_id, current_owner_id(request))


@router.patch("/{set_id}", response_model=ProblemSetRead)
def update_problem_set(set_id: UUID, payload: ProblemSetUpdate, request: Request, db: Session = Depends(get_db)):
    owner_id = current_owner_id(request)
    problem_set = _get_set(db, set_id, owner_id)
    changes = payload.model_dump(exclude_unset=True)
    if "name" in changes:
        name = changes.pop("name")
        if name is not None:
            if not name.strip():
                raise HTTPException(status_code=400, detail="문항 세트 이름이 필요합니다.")
            problem_set.name = name.strip()
    problem_ids = changes.pop("problem_ids", None)
    for key, value in changes.items():
        setattr(problem_set, key, value)
    if problem_ids is not None:
        _replace_items(db, problem_set, problem_ids, owner_id)
    _sync_marketplace_eligibility(problem_set)
    problem_set.updated_at = datetime.utcnow()
    db.commit()
    return _get_set(db, set_id, owner_id)


@router.delete("/{set_id}", status_code=204)
def delete_problem_set(set_id: UUID, request: Request, db: Session = Depends(get_db)):
    problem_set = db.scalars(
        select(ProblemSet).where(ProblemSet.id == set_id, ProblemSet.owner_id == current_owner_id(request))
    ).first()
    if not problem_set:
        raise HTTPException(status_code=404, detail="문항 세트를 찾을 수 없습니다.")
    db.delete(problem_set)
    db.commit()
    return Response(status_code=204)


@router.post("/{set_id}/items", response_model=ProblemSetRead)
def append_problem_set_item(set_id: UUID, payload: ProblemSetAppendItem, request: Request, db: Session = Depends(get_db)):
    owner_id = current_owner_id(request)
    problem_set = _get_set(db, set_id, owner_id)
    if not db.scalars(select(Problem).where(Problem.id == payload.problem_id, Problem.owner_id == owner_id)).first():
        raise HTTPException(status_code=404, detail="문항을 찾을 수 없습니다.")
    if any(item.problem_id == payload.problem_id for item in problem_set.items):
        return problem_set
    next_index = max([item.order_index for item in problem_set.items], default=-1) + 1
    db.add(ProblemSetItem(problem_set_id=set_id, problem_id=payload.problem_id, order_index=next_index))
    problem_set.updated_at = datetime.utcnow()
    db.commit()
    return _get_set(db, set_id, owner_id)


@router.post("/{set_id}/items/bulk", response_model=ProblemSetRead)
def append_problem_set_items(set_id: UUID, payload: ProblemSetAppendItems, request: Request, db: Session = Depends(get_db)):
    owner_id = current_owner_id(request)
    problem_set = _get_set(db, set_id, owner_id)
    existing_ids = {item.problem_id for item in problem_set.items}

    unique_ids: list[UUID] = []
    seen: set[UUID] = set()
    for problem_id in payload.problem_ids:
      if problem_id not in seen and problem_id not in existing_ids:
          unique_ids.append(problem_id)
          seen.add(problem_id)

    if not unique_ids:
        return problem_set

    found = set(
        db.scalars(
            select(Problem.id).where(
                Problem.id.in_(unique_ids),
                Problem.owner_id == owner_id,
                Problem.deleted_at.is_(None),
            )
        ).all()
    )
    missing = [str(problem_id) for problem_id in unique_ids if problem_id not in found]
    if missing:
        raise HTTPException(status_code=404, detail=f"문항을 찾을 수 없습니다: {', '.join(missing)}")

    next_index = max([item.order_index for item in problem_set.items], default=-1) + 1
    for offset, problem_id in enumerate(unique_ids):
        db.add(ProblemSetItem(problem_set_id=set_id, problem_id=problem_id, order_index=next_index + offset))
    problem_set.updated_at = datetime.utcnow()
    db.commit()
    return _get_set(db, set_id, owner_id)


@router.delete("/{set_id}/items/{problem_id}", status_code=204)
def remove_problem_set_item(set_id: UUID, problem_id: UUID, request: Request, db: Session = Depends(get_db)):
    problem_set = _get_set(db, set_id, current_owner_id(request))
    item = db.scalars(select(ProblemSetItem).where(ProblemSetItem.problem_set_id == set_id, ProblemSetItem.problem_id == problem_id)).first()
    if not item:
        raise HTTPException(status_code=404, detail="세트에 해당 문항이 없습니다.")
    db.delete(item)
    if problem_set:
        problem_set.updated_at = datetime.utcnow()
    db.commit()
    return Response(status_code=204)


@router.patch("/{set_id}/reorder", response_model=ProblemSetRead)
def reorder_problem_set(set_id: UUID, payload: ProblemSetReorder, request: Request, db: Session = Depends(get_db)):
    owner_id = current_owner_id(request)
    problem_set = _get_set(db, set_id, owner_id)
    current_ids = {item.problem_id for item in problem_set.items}
    ordered_ids = set(payload.ordered_problem_ids)
    if current_ids != ordered_ids:
        raise HTTPException(status_code=400, detail="현재 세트의 문항과 순서 목록이 일치하지 않습니다.")
    by_problem_id = {item.problem_id: item for item in problem_set.items}
    for index, problem_id in enumerate(payload.ordered_problem_ids):
        by_problem_id[problem_id].order_index = index
    problem_set.updated_at = datetime.utcnow()
    db.commit()
    return _get_set(db, set_id, owner_id)


@router.post("/{set_id}/publish", response_model=ProblemSetRead)
def publish_problem_set(set_id: UUID, request: Request, db: Session = Depends(get_db)):
    owner_id = current_owner_id(request)
    problem_set = _get_set(db, set_id, owner_id)
    problem_set.visibility = "public"
    problem_set.updated_at = datetime.utcnow()
    db.commit()
    return _get_set(db, set_id, owner_id)


@router.post("/{set_id}/unpublish", response_model=ProblemSetRead)
def unpublish_problem_set(set_id: UUID, request: Request, db: Session = Depends(get_db)):
    owner_id = current_owner_id(request)
    problem_set = _get_set(db, set_id, owner_id)
    problem_set.visibility = "private"
    problem_set.updated_at = datetime.utcnow()
    db.commit()
    return _get_set(db, set_id, owner_id)


@router.post("/{set_id}/submit-to-marketplace")
def submit_problem_set_to_marketplace(set_id: UUID, payload: MarketplaceSubmissionRequest, request: Request, db: Session = Depends(get_db)):
    owner_id = current_owner_id(request)
    problem_set = _get_set(db, set_id, owner_id)
    if not payload.rights_confirmed or not payload.no_unauthorized_copy:
        raise HTTPException(status_code=400, detail="마켓플레이스 등록 전 권리 확인이 필요합니다.")
    problem_set.rights_confirmed = True
    _sync_marketplace_eligibility(problem_set)
    allowed, reason = is_marketplace_publish_allowed(problem_set)
    if not allowed:
        raise HTTPException(status_code=400, detail=reason)

    listing = db.scalars(
        select(MarketplaceListing).where(
            MarketplaceListing.content_type == "problem_set",
            MarketplaceListing.content_id == str(problem_set.id),
        )
    ).first()
    if not listing:
        listing = MarketplaceListing(
            seller_id=problem_set.owner_id or owner_id,
            content_type="problem_set",
            content_id=str(problem_set.id),
            title=problem_set.name,
            subtitle=problem_set.subtitle,
            description=problem_set.description,
            category=payload.category,
            subject=problem_set.subject,
            grade=problem_set.grade,
            unit=problem_set.unit,
            thumbnail_url=problem_set.thumbnail_url,
            pricing_type=payload.pricing_type,
            price_amount=payload.price_amount,
            license_type=payload.license_type,
            status="published",
            rights_confirmed=True,
            rights_confirmed_at=datetime.utcnow(),
        )
        db.add(listing)
    else:
        listing.title = problem_set.name
        listing.subtitle = problem_set.subtitle
        listing.description = problem_set.description
        listing.category = payload.category or listing.category
        listing.subject = problem_set.subject
        listing.grade = problem_set.grade
        listing.unit = problem_set.unit
        listing.pricing_type = payload.pricing_type
        listing.price_amount = payload.price_amount
        listing.license_type = payload.license_type
        listing.status = "published"
        listing.rights_confirmed = True
        listing.rights_confirmed_at = datetime.utcnow()
        listing.updated_at = datetime.utcnow()
    problem_set.visibility = "marketplace"
    problem_set.updated_at = datetime.utcnow()
    db.commit()
    db.refresh(listing)
    return {"listing_id": listing.id, "status": listing.status}
