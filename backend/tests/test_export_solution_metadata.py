import sys
import unittest
from pathlib import Path
from uuid import uuid4


BACKEND_DIR = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(BACKEND_DIR))

from models import Batch, Problem, Tag  # noqa: E402
from services.export_service import _solution_body, _solution_export_problems  # noqa: E402
from services.template_renderer import _problem_export_data  # noqa: E402


def make_problem(*, answer: str | None = "3", solution_steps: str | None = None) -> Problem:
    batch_id = uuid4()
    problem = Problem(
        id=uuid4(),
        problem_number=7,
        problem_text="문항 본문",
        choices=[],
        has_visual=False,
        answer=answer,
        solution_steps=solution_steps,
        needs_review=False,
        source_batch_id=batch_id,
        owner_id="owner-1",
        review_page_number=12,
    )
    problem.tags = Tag(source="교재 A / p.12 / 7번")
    problem.batch = Batch(
        id=batch_id,
        name="교재 A",
        problem_pdf_filename="/uploads/books/book-a.pdf",
        owner_id="owner-1",
        subject_engine="math",
    )
    return problem


class ExportSolutionMetadataTests(unittest.TestCase):
    def test_missing_answer_metadata_includes_original_lookup_fields(self):
        body = _solution_body(make_problem(answer=None), True)

        self.assertIn("답안이 저장되어 있지 않습니다", body)
        self.assertIn("저장된 출처: 교재 A / p.12 / 7번", body)
        self.assertIn("원본 배치: 교재 A", body)
        self.assertIn("문항 PDF: book-a.pdf", body)
        self.assertIn("원본 페이지: p.12", body)
        self.assertIn("문항 번호: 7번", body)
        self.assertNotIn("저장된 정답:", body)

    def test_metadata_only_export_keeps_only_missing_answer_items(self):
        missing = make_problem(answer=None)
        solved = make_problem(answer="3", solution_steps="풀이가 있습니다.")

        self.assertEqual(_solution_export_problems([missing, solved], False, True), [missing])
        self.assertEqual(_solution_export_problems([missing, solved], True, True), [missing, solved])
        self.assertEqual(_solution_export_problems([missing, solved], False, False), [])

    def test_visual_template_data_uses_metadata_when_answer_is_missing(self):
        problem = make_problem(answer=None)
        with_metadata = _problem_export_data(problem, 1, 1, {"include_missing_solution_metadata": True})
        without_metadata = _problem_export_data(problem, 1, 1, {"include_missing_solution_metadata": False})

        self.assertFalse(with_metadata["has_solution"])
        self.assertIn("원본 페이지: p.12", with_metadata["solution"])
        self.assertEqual(without_metadata["solution"], "")

    def test_visual_template_solution_field_contains_answer(self):
        problem = make_problem(answer="3")
        data = _problem_export_data(problem, 1, 1, {"include_missing_solution_metadata": True})

        self.assertTrue(data["has_solution"])
        self.assertEqual(data["solution"], "3")


if __name__ == "__main__":
    unittest.main()
