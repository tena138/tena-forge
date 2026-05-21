import sys
from uuid import UUID

from database import SessionLocal
from models import Batch
from services.pipeline import process_batch, process_solutions_only


def _processing_task(batch_id: UUID) -> str:
    db = SessionLocal()
    try:
        batch = db.get(Batch, batch_id)
        return str(batch.processing_task or "full") if batch else "full"
    finally:
        db.close()


def main() -> int:
    if len(sys.argv) != 2:
        print("Usage: python -m services.batch_worker <batch_id>", file=sys.stderr)
        return 2
    batch_id = UUID(sys.argv[1])
    if _processing_task(batch_id) == "solution_only":
        process_solutions_only(batch_id)
    else:
        process_batch(batch_id)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
