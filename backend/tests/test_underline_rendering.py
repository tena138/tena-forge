import sys
import unittest
from pathlib import Path

from reportlab.lib.styles import ParagraphStyle


BACKEND_DIR = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(BACKEND_DIR))

from services.export_service import _paragraph_markup, _tex_content  # noqa: E402
from services.template_renderer import render_template_html, underline_html_markup  # noqa: E402


class UnderlineRenderingTests(unittest.TestCase):
    def test_template_data_allows_only_underline_markup(self):
        rendered = render_template_html(
            "<div>{{ problem_text }}</div>",
            {"problem_text": underline_html_markup("stem <u>underlined</u> <b>escaped</b>")},
        )

        self.assertIn("stem <u>underlined</u>", rendered)
        self.assertIn("&lt;b&gt;escaped&lt;/b&gt;", rendered)
        self.assertNotIn("&lt;u&gt;", rendered)

    def test_reportlab_markup_converts_underline_tags(self):
        markup = _paragraph_markup("stem <u>underlined</u> <b>escaped</b>", ParagraphStyle("body"))

        self.assertIn("<u>underlined</u>", markup)
        self.assertIn("&lt;b&gt;escaped&lt;/b&gt;", markup)
        self.assertNotIn("&lt;u&gt;", markup)

    def test_tex_content_converts_underline_tags(self):
        content = _tex_content("stem <u>underlined</u> <b>escaped</b>")

        self.assertIn(r"\underline{underlined}", content)
        self.assertIn(r"\textless{}b\textgreater{}escaped\textless{}/b\textgreater{}", content)
        self.assertNotIn("<u>", content)


if __name__ == "__main__":
    unittest.main()
