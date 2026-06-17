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
    def test_imports_header_design_and_converts_body_to_region(self):
        result = build_visual_template_set_from_pdf(sample_pdf_bytes(), "midterm.pdf")
        template_set = result["templateSet"]
        page = template_set["pages"][0]
        elements = page["elements"]

        text_values = [element.get("text", "") for element in elements if element.get("type") == "text"]
        self.assertTrue(any("Tena Academy" in value for value in text_values))
        self.assertFalse(any("quadratic equation" in value for value in text_values))
        self.assertTrue(any(element.get("type") == "problemRegion" for element in elements))
        self.assertTrue(any(element.get("type") in {"shape", "line"} for element in elements))
        self.assertEqual(template_set["sourceType"], "unknown")
        self.assertFalse(template_set["rightsConfirmed"])

    def test_limits_imported_pages(self):
        doc = fitz.open()
        for index in range(8):
            page = doc.new_page(width=595, height=842)
            page.insert_text((72, 72), f"Page {index + 1}", fontsize=16)
        buffer = io.BytesIO()
        doc.save(buffer)
        doc.close()

        result = build_visual_template_set_from_pdf(buffer.getvalue(), "many.pdf")

        self.assertEqual(result["imported_page_count"], 6)
        self.assertEqual(len(result["templateSet"]["pages"]), 6)
        self.assertTrue(result["warnings"])


if __name__ == "__main__":
    unittest.main()
