import os
import subprocess
import sys
import threading
from datetime import datetime, timedelta
from pathlib import Path
from uuid import UUID

from sqlalchemy import func, or_, select

from database import SessionLocal, get_settings
from models import Batch, BatchStatus


_scheduler_lock = threading.Lock()
_SCHEDULER_LOCK_NAMESPACE = 1413828161
_SCHEDULER_LOCK_ID = 1
_STALE_PROCESSING_MINUTES = int(os.getenv("STALE_PROCESSING_MINUTES", "30"))


def _try_database_scheduler_lock(db) -> bool:
    bind = db.get_bind()
    if bind.dialect.name != "postgresql":
        return True
    return bool(db.scalar(select(func.pg_try_advisory_xact_lock(_SCHEDULER_LOCK_NAMESPACE, _SCHEDULER_LOCK_ID))))


def _launch_batch_worker(batch_id: UUID) -> None:
    backend_dir = Path(__file__).resolve().parents[1]
    log_dir = backend_dir / "logs"
    log_dir.mkdir(exist_ok=True)
    log_path = log_dir / f"batch_{batch_id}.log"
    env = os.environ.copy()
    env.setdefault("DATABASE_URL", get_settings().database_url)
    creationflags = subprocess.CREATE_NEW_PROCESS_GROUP if os.name == "nt" else 0

    with log_path.open("ab") as log_file:
        subprocess.Popen(
            [sys.executable, "-m", "services.batch_worker", str(batch_id)],
            cwd=str(backend_dir),
            env=env,
            stdin=subprocess.DEVNULL,
            stdout=log_file,
            stderr=subprocess.STDOUT,
            close_fds=True,
            creationflags=creationflags,
        )


def launch_batch_worker(batch_id: UUID) -> None:
    _launch_batch_worker(batch_id)


def mark_stale_processing_batches(db, *, batch_id: UUID | None = None) -> int:
    stale_before = datetime.utcnow() - timedelta(minutes=_STALE_PROCESSING_MINUTES)
    query = db.query(Batch).filter(
        Batch.status == BatchStatus.processing,
        or_(
            Batch.progress_updated_at.is_(None),
            Batch.progress_updated_at < stale_before,
        ),
    )
    if batch_id is not None:
        query = query.filter(Batch.id == batch_id)

    interrupted = query.all()
    now = datetime.utcnow()
    for batch in interrupted:
        previous_stage = batch.progress_message or "처리 중"
        batch.status = BatchStatus.error
        batch.progress_message = "처리 작업이 중단되었습니다."
        batch.failure_stage = previous_stage
        batch.failure_reason = f"작업 진행 상태가 {_STALE_PROCESSING_MINUTES}분 이상 갱신되지 않아 중단된 것으로 판단했습니다."
        batch.failure_hint = "배치를 다시 처리해 주세요. 같은 구간에서 반복되면 원본 PDF와 답안 PDF 매칭 상태를 확인해 주세요."
        batch.failed_at = now
        batch.progress_updated_at = now
    return len(interrupted)


def schedule_next_batch() -> UUID | None:
    """Start the oldest pending batch only when no batch is currently processing."""
    with _scheduler_lock:
        db = SessionLocal()
        try:
            if not _try_database_scheduler_lock(db):
                return None

            stale_count = mark_stale_processing_batches(db)
            active_batch_id = db.scalar(
                select(Batch.id)
                .where(Batch.status == BatchStatus.processing)
                .limit(1)
            )
            if active_batch_id:
                if stale_count:
                    db.commit()
                return None

            batch = db.scalars(
                select(Batch)
                .where(Batch.status == BatchStatus.pending)
                .order_by(Batch.created_at.asc(), Batch.id.asc())
                .limit(1)
                .with_for_update(skip_locked=True)
            ).first()
            if not batch:
                if stale_count:
                    db.commit()
                return None

            now = datetime.utcnow()
            batch.status = BatchStatus.processing
            batch.progress_message = "대기열에서 처리 시작 준비 중"
            batch.progress_current = 0
            batch.progress_total = None
            batch.progress_started_at = now
            batch.progress_updated_at = now
            batch.failure_stage = None
            batch.failure_reason = None
            batch.failure_hint = None
            batch.failed_at = None
            db.commit()
            batch_id = batch.id

            try:
                _launch_batch_worker(batch_id)
            except Exception:
                failed = db.get(Batch, batch_id)
                if failed:
                    failed.status = BatchStatus.error
                    failed.progress_message = "처리 작업을 시작하지 못했습니다."
                    failed.failure_stage = "작업 시작"
                    failed.failure_reason = "배치 워커 프로세스를 시작하지 못했습니다."
                    failed.failure_hint = "서버 실행 환경과 작업 로그 디렉터리 권한을 확인하세요."
                    failed.failed_at = datetime.utcnow()
                    failed.progress_updated_at = failed.failed_at
                    db.commit()
                raise
            return batch_id
        finally:
            db.close()
