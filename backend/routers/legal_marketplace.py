from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from database import get_db
from models import CopyrightReport
from schemas import CopyrightReportCreate, CopyrightReportRead

router = APIRouter(prefix="/api/legal", tags=["legal"])


@router.post("/copyright-reports", response_model=CopyrightReportRead)
def submit_copyright_report(payload: CopyrightReportCreate, db: Session = Depends(get_db)):
    report = CopyrightReport(**payload.model_dump())
    db.add(report)
    db.commit()
    db.refresh(report)
    return report
