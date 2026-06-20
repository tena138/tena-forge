import sys
import unittest
import uuid
from pathlib import Path

from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker


BACKEND_DIR = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(BACKEND_DIR))

from database import Base  # noqa: E402
from models import Batch, Problem, ProblemUsageHistory, Tag  # noqa: E402
from services.exam_paper_planner import build_exam_paper_draft  # noqa: E402


class ExamPaperPlannerTests(unittest.TestCase):
    def setUp(self):
        engine = create_engine("sqlite:///:memory:")
        Base.metadata.create_all(bind=engine)
        self.Session = sessionmaker(bind=engine)
        self.owner_id = str(uuid.uuid4())

    def _add_problem(self, db, number: int, difficulty: str, unit: str):
        batch = db.query(Batch).first()
        if not batch:
            batch = Batch(
                name="고3 수학 모의고사",
                problem_pdf_filename="math.pdf",
                subject_engine="math",
                owner_id=self.owner_id,
            )
            db.add(batch)
            db.flush()
        problem = Problem(
            problem_number=number,
            problem_text=f"{unit} {difficulty} problem {number}",
            choices=[],
            has_visual=False,
            needs_review=False,
            source_batch_id=batch.id,
            source_label="고3 수학",
            owner_id=self.owner_id,
        )
        problem.tags = Tag(subject="수학", unit=unit, difficulty=difficulty, source=f"고3 / {number}번")
        db.add(problem)
        db.flush()
        return problem

    def _seed_math_pool(self, db):
        problems = []
        number = 1
        for difficulty, count in (("2점", 10), ("3점", 10), ("4점", 5)):
            for index in range(count):
                problems.append(self._add_problem(db, number, difficulty, f"단원{index % 3 + 1}"))
                number += 1
        db.commit()
        return problems

    def test_math_positions_follow_point_difficulty_bands(self):
        db = self.Session()
        try:
            self._seed_math_pool(db)

            draft = build_exam_paper_draft(
                db,
                message="수학 고3 문제 중에서 1-10 쉬운 문제, 11-20 중간 문제, 21-25 어려운 문제로 세움 양식 시험지 제작",
                owner_ids={self.owner_id},
            )

            difficulties = [problem["difficulty"] for problem in draft["problems"]]
            self.assertEqual(difficulties[:10], ["2점"] * 10)
            self.assertEqual(difficulties[10:20], ["3점"] * 10)
            self.assertEqual(difficulties[20:25], ["4점"] * 5)
            self.assertEqual(draft["missing_difficulty_slots"], [])
            self.assertEqual(draft["difficulty_distribution"], {"2점": 10, "3점": 10, "4점": 5})
        finally:
            db.close()

    def test_used_problem_is_excluded_and_missing_slot_is_reported(self):
        db = self.Session()
        try:
            problems = self._seed_math_pool(db)
            used_hard_problem = next(problem for problem in problems if problem.tags.difficulty == "4점")
            db.add(
                ProblemUsageHistory(
                    owner_id=self.owner_id,
                    problem_id=used_hard_problem.id,
                    usage_type="export",
                    metadata_json={"test": True},
                )
            )
            db.commit()

            draft = build_exam_paper_draft(
                db,
                message="수학 고3 문제 중에서 1-10 쉬움 11-20 중간 21-25 어려움 세움 양식 시험지 제작",
                owner_ids={self.owner_id},
            )

            selected_ids = {problem["id"] for problem in draft["problems"]}
            self.assertNotIn(str(used_hard_problem.id), selected_ids)
            self.assertEqual(draft["used_exclusion"]["excluded_count"], 1)
            self.assertEqual(len(draft["missing_difficulty_slots"]), 1)
            self.assertEqual(draft["missing_difficulty_slots"][0]["difficulty"], "4점")
        finally:
            db.close()

    def test_missing_required_information_returns_questions_without_selection(self):
        db = self.Session()
        try:
            self._seed_math_pool(db)

            draft = build_exam_paper_draft(
                db,
                message="시험지 만들어줘",
                owner_ids={self.owner_id},
            )

            self.assertEqual(draft["status"], "needs_input")
            fields = {item["field"] for item in draft["missing_required_fields"]}
            self.assertIn("subject", fields)
            self.assertIn("grade", fields)
            self.assertIn("problem_count", fields)
            self.assertIn("difficulty_plan", fields)
            self.assertIn("template", fields)
            self.assertEqual(draft["problems"], [])
            self.assertTrue(draft["clarification_questions"])
        finally:
            db.close()

    def test_delivery_intent_requires_recipient_and_due_at(self):
        db = self.Session()
        try:
            self._seed_math_pool(db)

            draft = build_exam_paper_draft(
                db,
                message="수학 고3 25문항 1-10 2점 11-20 3점 21-25 4점 세움 양식으로 내야 해",
                owner_ids={self.owner_id},
            )

            self.assertEqual(draft["status"], "needs_input")
            fields = {item["field"] for item in draft["missing_required_fields"]}
            self.assertIn("recipient", fields)
            self.assertIn("due_at", fields)
        finally:
            db.close()


if __name__ == "__main__":
    unittest.main()
