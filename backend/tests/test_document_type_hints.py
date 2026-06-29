import sys
import unittest
from pathlib import Path


BACKEND_DIR = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(BACKEND_DIR))

from services.document_type_hints import (  # noqa: E402
    DOCUMENT_TYPE_MIXED,
    DOCUMENT_TYPE_PROBLEM,
    DOCUMENT_TYPE_SOLUTION,
    document_type_hints_note,
    normalize_document_type_hint,
)


class DocumentTypeHintTests(unittest.TestCase):
    def test_korean_document_type_aliases_normalize(self):
        self.assertEqual(normalize_document_type_hint("본문"), DOCUMENT_TYPE_PROBLEM)
        self.assertEqual(normalize_document_type_hint("문제"), DOCUMENT_TYPE_PROBLEM)
        self.assertEqual(normalize_document_type_hint("해설"), DOCUMENT_TYPE_SOLUTION)
        self.assertEqual(normalize_document_type_hint("정답"), DOCUMENT_TYPE_SOLUTION)
        self.assertEqual(normalize_document_type_hint("믹스"), DOCUMENT_TYPE_MIXED)
        self.assertEqual(normalize_document_type_hint("혼합"), DOCUMENT_TYPE_MIXED)

    def test_solution_hint_note_directs_answer_metadata_extraction(self):
        note = document_type_hints_note(DOCUMENT_TYPE_SOLUTION, doc_kind="solution")

        self.assertIn("answer metadata source", note)
        self.assertIn("problem-number-to-answer mappings", note)
        self.assertIn("Do not reinterpret solution explanations as standalone student problems", note)


if __name__ == "__main__":
    unittest.main()
