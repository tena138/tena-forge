import sys
import unittest
import uuid
from pathlib import Path
from types import SimpleNamespace

from sqlalchemy import create_engine, select
from sqlalchemy.orm import sessionmaker


BACKEND_DIR = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(BACKEND_DIR))

from database import Base  # noqa: E402
from models import Batch, Problem, ProblemSet, ProblemSetItem, ProblemUsageHistory  # noqa: E402
from routers.problem_sets import create_problem_set, get_problem_usage_history  # noqa: E402
from schemas import ProblemSetCreate, ProblemUsageHistoryQuery  # noqa: E402
from services.problem_usage_history import record_export_usage  # noqa: E402


def make_request(owner_id: str):
    return SimpleNamespace(state=SimpleNamespace(academy_id=owner_id))


class ProblemUsageHistoryTests(unittest.TestCase):
    def setUp(self):
        engine = create_engine("sqlite:///:memory:")
        Base.metadata.create_all(bind=engine)
        self.Session = sessionmaker(bind=engine)
        self.owner_id = str(uuid.uuid4())
        self.request = make_request(self.owner_id)

    def _problem(self, db, number: int = 1) -> Problem:
        batch = Batch(name=f"Batch {number}", problem_pdf_filename="problem.pdf", owner_id=self.owner_id)
        db.add(batch)
        db.flush()
        problem = Problem(
            problem_number=number,
            problem_text=f"problem {number}",
            choices=[],
            has_visual=False,
            needs_review=False,
            source_batch_id=batch.id,
            owner_id=self.owner_id,
        )
        db.add(problem)
        db.commit()
        db.refresh(problem)
        return problem

    def test_set_creation_records_problem_usage(self):
        db = self.Session()
        try:
            problem = self._problem(db)

            problem_set = create_problem_set(ProblemSetCreate(name="중간고사 A", problem_ids=[problem.id]), self.request, db)

            rows = db.scalars(select(ProblemUsageHistory).where(ProblemUsageHistory.problem_id == problem.id)).all()
            self.assertEqual(len(rows), 1)
            self.assertEqual(rows[0].usage_type, "problem_set")
            self.assertEqual(rows[0].problem_set_id, problem_set.id)

            result = get_problem_usage_history(ProblemUsageHistoryQuery(problem_ids=[problem.id]), self.request, db)
            histories = result["histories"][str(problem.id)]
            self.assertEqual(histories[0]["problem_set_name"], "중간고사 A")
        finally:
            db.close()

    def test_usage_query_backfills_existing_set_items(self):
        db = self.Session()
        try:
            problem = self._problem(db)
            problem_set = ProblemSet(name="기존 세트", owner_id=self.owner_id)
            db.add(problem_set)
            db.flush()
            db.add(ProblemSetItem(problem_set_id=problem_set.id, problem_id=problem.id, order_index=0))
            db.commit()

            result = get_problem_usage_history(ProblemUsageHistoryQuery(problem_ids=[problem.id]), self.request, db)

            histories = result["histories"][str(problem.id)]
            self.assertEqual(len(histories), 1)
            self.assertEqual(histories[0]["usage_type"], "problem_set")
            self.assertEqual(histories[0]["problem_set_name"], "기존 세트")
            self.assertEqual(db.scalar(select(ProblemUsageHistory).where(ProblemUsageHistory.problem_id == problem.id)).problem_set_id, problem_set.id)
        finally:
            db.close()

    def test_export_usage_records_each_export_event(self):
        db = self.Session()
        try:
            problem = self._problem(db)
            payload = SimpleNamespace(
                source="selection",
                problem_set_id=None,
                exam_title="6월 실전 모의고사",
                date="2026-06-17",
                template_id=None,
                hub_template_id=None,
                include_solution=False,
                include_missing_solution_metadata=False,
            )

            record_export_usage(db, owner_id=self.owner_id, problems=[problem], payload=payload, output_type="pdf")
            db.commit()

            result = get_problem_usage_history(ProblemUsageHistoryQuery(problem_ids=[problem.id]), self.request, db)
            histories = result["histories"][str(problem.id)]
            self.assertEqual(histories[0]["usage_type"], "export")
            self.assertEqual(histories[0]["export_title"], "6월 실전 모의고사")
        finally:
            db.close()


if __name__ == "__main__":
    unittest.main()
