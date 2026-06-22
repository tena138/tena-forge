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

    def _add_problem(
        self,
        db,
        number: int,
        difficulty: str | None,
        unit: str,
        source_label: str = "고3 수학",
        batch_name: str = "고3 수학 모의고사",
    ):
        batch = db.query(Batch).filter(Batch.name == batch_name).first()
        if not batch:
            batch = Batch(
                name=batch_name,
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
            source_label=source_label,
            owner_id=self.owner_id,
        )
        problem.tags = Tag(subject="수학", unit=unit, difficulty=difficulty, source=f"{source_label} / {number}번")
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

    def _seed_math_pool_without_difficulty(self, db, count: int = 20):
        problems = []
        for number in range(1, count + 1):
            problems.append(self._add_problem(db, number, None, f"단원{number % 3 + 1}"))
        db.commit()
        return problems

    def _seed_math_pool_with_sparse_difficulty(self, db, count: int = 20):
        problems = []
        for number in range(1, count + 1):
            difficulty = "3점" if number <= 3 else None
            problems.append(self._add_problem(db, number, difficulty, f"단원{number % 3 + 1}"))
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

    def test_used_problem_is_reused_when_needed_to_complete_distribution(self):
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
            self.assertIn(str(used_hard_problem.id), selected_ids)
            self.assertEqual(draft["selected_count"], 25)
            self.assertEqual(draft["used_exclusion"]["excluded_count"], 0)
            self.assertEqual(draft["used_exclusion"]["reused_count"], 1)
            self.assertEqual(draft["missing_difficulty_slots"], [])
            self.assertTrue(any("사용 이력이 있는 문항 1개" in warning for warning in draft["warnings"]))
        finally:
            db.close()

    def test_random_difficulty_request_ignores_default_point_bands(self):
        db = self.Session()
        try:
            for number in range(1, 21):
                self._add_problem(db, number, "3점", f"단원{number % 3 + 1}")
            db.commit()

            draft = build_exam_paper_draft(
                db,
                message="수학 고3 20문항 세움 양식 시험지 제작, 난이도는 그냥 랜덤으로",
                owner_ids={self.owner_id},
            )

            self.assertEqual(draft["status"], "draft")
            self.assertEqual(draft["selected_count"], 20)
            self.assertEqual(draft["missing_difficulty_slots"], [])
            self.assertEqual(draft["selection_strategy"], "random_without_difficulty")
            self.assertEqual(draft["difficulty_plan_mode"], "random_without_difficulty")
            self.assertTrue(any("요청대로" in warning for warning in draft["warnings"]))
        finally:
            db.close()

    def test_sparse_grade_metadata_relaxes_to_visible_subject_pool(self):
        db = self.Session()
        try:
            for number in range(1, 4):
                self._add_problem(db, number, None, f"단원{number % 3 + 1}", source_label="고3 수학", batch_name="고3 수학 모의고사")
            for number in range(4, 24):
                self._add_problem(db, number, None, f"단원{number % 3 + 1}", source_label="수학 보관", batch_name="수학 보관")
            db.commit()

            draft = build_exam_paper_draft(
                db,
                message="고3 수학 시험지 20문항 세움 양식으로 만들어줘",
                owner_ids={self.owner_id},
            )

            self.assertEqual(draft["status"], "draft")
            self.assertEqual(draft["selected_count"], 20)
            self.assertEqual(draft["candidate_shortfall"], 0)
            self.assertTrue(draft["grade_filter_relaxed"])
            self.assertTrue(any("수학 보관 범위" in warning for warning in draft["warnings"]))
        finally:
            db.close()

    def test_missing_point_metadata_uses_random_selection_without_difficulty_slots(self):
        db = self.Session()
        try:
            self._seed_math_pool_without_difficulty(db, 20)

            draft = build_exam_paper_draft(
                db,
                message="수학 고3 20문항 1-10 3점 11-20 4점 세움 양식 시험지 제작",
                owner_ids={self.owner_id},
            )

            self.assertEqual(draft["status"], "draft")
            self.assertEqual(draft["selected_count"], 20)
            self.assertEqual(draft["missing_difficulty_slots"], [])
            self.assertEqual(draft["selection_strategy"], "random_without_difficulty")
            self.assertTrue(draft["ignored_difficulty_plan"])
            self.assertEqual(draft["difficulty_distribution"], {"미지정": 20})
            self.assertTrue(any("배점 메타데이터" in warning for warning in draft["warnings"]))
        finally:
            db.close()

    def test_sparse_point_metadata_uses_random_selection_without_difficulty_slots(self):
        db = self.Session()
        try:
            self._seed_math_pool_with_sparse_difficulty(db, 20)

            draft = build_exam_paper_draft(
                db,
                message="수학 고3 20문항 1-10 3점 11-20 4점 세움 양식 시험지 제작",
                owner_ids={self.owner_id},
            )

            self.assertEqual(draft["status"], "draft")
            self.assertEqual(draft["selected_count"], 20)
            self.assertEqual(draft["missing_difficulty_slots"], [])
            self.assertEqual(draft["selection_strategy"], "random_without_difficulty")
            self.assertTrue(draft["ignored_difficulty_plan"])
            self.assertEqual(draft["point_difficulty_metadata_count"], 3)
        finally:
            db.close()

    def test_missing_difficulty_plan_is_not_required_when_pool_has_no_point_metadata(self):
        db = self.Session()
        try:
            self._seed_math_pool_without_difficulty(db, 20)

            draft = build_exam_paper_draft(
                db,
                message="수학 고3 20문항 세움 양식 시험지 제작",
                owner_ids={self.owner_id},
            )

            self.assertEqual(draft["status"], "draft")
            self.assertEqual(draft["selected_count"], 20)
            self.assertEqual(draft["selection_strategy"], "random_without_difficulty")
            self.assertEqual(draft["missing_required_fields"], [])
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
