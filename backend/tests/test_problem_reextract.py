import sys
import unittest
from pathlib import Path


BACKEND_DIR = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(BACKEND_DIR))

from models import Problem  # noqa: E402
from routers.problems import _single_problem_reextract_prompt  # noqa: E402


class ProblemReextractTests(unittest.TestCase):
    def test_single_problem_reextract_prompt_is_visual_crop_first(self):
        problem = Problem(problem_number=6, problem_text=r"$\tan\theta$의 값을 구하시오.", has_visual=True)

        prompt = _single_problem_reextract_prompt(problem)

        self.assertIn("visual_bbox", prompt)
        self.assertIn("Never return []", prompt)
        self.assertIn("visual_bbox is the authoritative visual asset", prompt)
        self.assertIn("set visual_schema to null and rely on the visual_bbox crop", prompt)
        self.assertNotIn("shape_diagram", prompt)
        self.assertNotIn("Do not merely trace pixels", prompt)


if __name__ == "__main__":
    unittest.main()
