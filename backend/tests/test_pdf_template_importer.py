import io
import sys
import unittest
from pathlib import Path

import fitz


BACKEND_DIR = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(BACKEND_DIR))

from services.pdf_template_importer import build_visual_template_set_from_pdf  # noqa: E402


def sample_pdf_bytes() -> bytes:
    doc = fitz.open()
    page = doc.new_page(width=595, height=842)
    page.draw_rect(fitz.Rect(40, 36, 555, 96), color=(0.1, 0.1, 0.1), width=1)
    page.insert_text((58, 70), "Tena Academy", fontsize=12, color=(0.1, 0.1, 0.1))
    page.insert_text((230, 70), "Midterm Practice", fontsize=18, color=(0, 0, 0))
    page.draw_line((40, 120), (555, 120), color=(0, 0, 0), width=1)
    page.insert_textbox(
        fitz.Rect(52, 150, 540, 470),
        "1. Solve the quadratic equation and choose the correct answer.\n"
        "2. The following paragraph is intentionally long enough to be detected as body content.\n"
        "3. This content should become a dynamic problem region, not fixed template text.",
        fontsize=11,
        color=(0.05, 0.05, 0.05),
    )
    buffer = io.BytesIO()
    doc.save(buffer)
    doc.close()
    return buffer.getvalue()


class PdfTemplateImporterTests(unittest.TestCase):
    def test_imports_pdf_page_as_original_background(self):
        result = build_visual_template_set_from_pdf(sample_pdf_bytes(), "midterm.pdf")
        template_set = result["templateSet"]
        page = template_set["pages"][0]

        self.assertIn("imageUrl", page["background"])
        self.assertTrue(page["background"]["imageUrl"].startswith("data:image/png;base64,"))
        self.assertEqual(page["background"]["color"], "#ffffff")
        self.assertEqual(page["background"]["opacity"], 1)
        self.assertEqual(page["elements"], [])
        self.assertEqual(page["sourceRole"], "pdfBackground")
        self.assertEqual(page["sourcePageNumber"], 1)
        self.assertEqual(template_set["sourceType"], "unknown")
        self.assertFalse(template_set["rightsConfirmed"])
        self.assertEqual(template_set["importMeta"]["mode"], "backgroundSnapshot")

    def test_imports_first_pages_in_order_until_limit(self):
        doc = fitz.open()
        for index in range(8):
            page = doc.new_page(width=595, height=842)
            page.insert_text((72, 72), f"Page {index + 1}", fontsize=16)
        buffer = io.BytesIO()
        doc.save(buffer)
        doc.close()

        result = build_visual_template_set_from_pdf(buffer.getvalue(), "many.pdf")

        self.assertLessEqual(result["imported_page_count"], 6)
        self.assertEqual(len(result["templateSet"]["pages"]), result["imported_page_count"])
        self.assertEqual(result["templateSet"]["importMeta"]["selectedPageNumbers"], [1, 2, 3, 4, 5, 6])
        self.assertTrue(all(page["background"].get("imageUrl", "").startswith("data:image/png;base64,") for page in result["templateSet"]["pages"]))
        self.assertTrue(all(page["elements"] == [] for page in result["templateSet"]["pages"]))
        self.assertTrue(result["warnings"])

    def test_keeps_blank_separator_pages_as_original_pdf_pages(self):
        doc = fitz.open()

        cover = doc.new_page(width=595, height=842)
        cover.insert_text((96, 210), "Algebra Workbook", fontsize=30)

        doc.new_page(width=595, height=842)

        inner = doc.new_page(width=595, height=842)
        inner.insert_textbox(
            fitz.Rect(54, 150, 540, 620),
            "1. Solve the expression below.\n"
            "This page contains enough body text to become a dynamic problem region.\n"
            "A second paragraph keeps the body area large enough for layout detection.",
            fontsize=11,
        )

        buffer = io.BytesIO()
        doc.save(buffer)
        doc.close()

        result = build_visual_template_set_from_pdf(buffer.getvalue(), "blank.pdf")

        selected_numbers = result["templateSet"]["importMeta"]["selectedPageNumbers"]
        self.assertEqual(selected_numbers, [1, 2, 3])
        self.assertEqual(len(result["templateSet"]["pages"]), 3)
        self.assertFalse(any("blank separator" in warning for warning in result["warnings"]))

    def test_does_not_select_representative_roles_or_rebuild_elements(self):
        doc = fitz.open()

        cover = doc.new_page(width=595, height=842)
        cover.insert_text((96, 210), "Algebra Workbook", fontsize=30)
        cover.insert_text((96, 260), "Tena Academy", fontsize=14)

        for index in range(1, 6):
            page = doc.new_page(width=595, height=842)
            page.insert_text((48, 56), "Tena Academy", fontsize=10)
            page.insert_textbox(
                fitz.Rect(54, 150, 540, 620),
                f"{index}. Solve the expression below.\n"
                "This page contains enough body text to become a dynamic problem region.\n"
                "A second paragraph keeps the body area large enough for layout detection.",
                fontsize=11,
            )

        unit = doc.new_page(width=595, height=842)
        unit.insert_text((110, 320), "Unit 3 Linear Functions", fontsize=28)

        solution = doc.new_page(width=595, height=842)
        solution.insert_text((72, 72), "Solutions", fontsize=22)
        solution.insert_textbox(fitz.Rect(72, 140, 520, 560), "Solution notes and explanations for the practice problems.", fontsize=12)

        answer = doc.new_page(width=595, height=842)
        answer.insert_text((72, 72), "Answer Sheet", fontsize=22)

        buffer = io.BytesIO()
        doc.save(buffer)
        doc.close()

        result = build_visual_template_set_from_pdf(buffer.getvalue(), "roles.pdf")
        pages = result["templateSet"]["pages"]
        selected_numbers = result["templateSet"]["importMeta"]["selectedPageNumbers"]

        self.assertLessEqual(len(pages), 6)
        self.assertEqual(selected_numbers, [1, 2, 3, 4, 5, 6])
        self.assertEqual({page["sourceRole"] for page in pages}, {"pdfBackground"})
        self.assertTrue(all(page["elements"] == [] for page in pages))
        self.assertTrue(all(page["background"].get("imageUrl", "").startswith("data:image/png;base64,") for page in pages))


if __name__ == "__main__":
    unittest.main()
