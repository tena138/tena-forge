import sys
import unittest
import uuid
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import patch

from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker


BACKEND_DIR = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(BACKEND_DIR))

from database import Base  # noqa: E402
from routers.co_agent import CoAgentChatRequest, CoAgentVisibleContext, co_agent_chat  # noqa: E402
from services.co_agent_capabilities import co_agent_product_map, search_co_agent_capabilities  # noqa: E402
from services.exam_paper_planner import looks_like_exam_paper_request  # noqa: E402


def make_request(owner_id: str):
    return SimpleNamespace(state=SimpleNamespace(academy_id=owner_id), headers={})


class CoAgentCapabilityRegistryTests(unittest.TestCase):
    def test_search_prioritizes_exam_paper_creation(self):
        matches = search_co_agent_capabilities(
            message="고3 수학 시험지 20문항을 세움 양식으로 만들어줘",
            current_path="/academy",
        )

        self.assertEqual(matches[0]["id"], "exam_paper_creation")
        self.assertTrue(matches[0]["can_execute"])
        self.assertIn("template", matches[0]["required_info"])

    def test_search_prioritizes_problem_extraction_for_extraction_request(self):
        matches = search_co_agent_capabilities(
            message="문항 추출 하고 싶어",
            history=[{"role": "user", "content": "고3 수학 시험지 20문항 만들어줘"}],
            current_path="/academy",
        )

        self.assertEqual(matches[0]["id"], "problem_extraction")
        self.assertIn("direct:문항 추출", matches[0]["matches"])
        self.assertFalse(looks_like_exam_paper_request("문항 추출 하고 싶어"))

    def test_search_uses_visible_ui_and_path(self):
        matches = search_co_agent_capabilities(
            message="이 화면에서 양식을 고르고 싶어",
            visible_context={
                "current_path": "/templates/mine",
                "page_title": "Templates",
                "visible_text": "내 템플릿 양식 편집 지면 레이아웃",
                "active_element": "",
            },
        )

        self.assertEqual(matches[0]["id"], "template_management")
        self.assertGreaterEqual(matches[0]["score"], 45)

    def test_product_map_is_registry_derived(self):
        product_ids = [item["id"] for item in co_agent_product_map()]

        self.assertIn("problem_extraction", product_ids)
        self.assertIn("problem_set_management", product_ids)
        self.assertIn("routine_review", product_ids)

    def test_chat_injects_searched_capabilities_into_ai_context(self):
        engine = create_engine("sqlite:///:memory:")
        Base.metadata.create_all(bind=engine)
        Session = sessionmaker(bind=engine)
        db = Session()
        owner_id = str(uuid.uuid4())
        captured: dict[str, list[dict[str, str]]] = {}

        def fake_completion(messages: list[dict[str, str]]):
            captured["messages"] = messages
            return "반과 학생 관리는 학생 관리 화면에서 이어갈 수 있습니다.", "test-model"

        try:
            with patch("routers.co_agent._co_agent_chat_completion", side_effect=fake_completion):
                response = co_agent_chat(
                    CoAgentChatRequest(
                        message="학생 관리에서 반을 만들고 학생을 추가하려면?",
                        current_path="/student-management",
                        visible_context=CoAgentVisibleContext(
                            current_path="/student-management",
                            page_title="Student Management",
                            visible_text="학생 관리 클래스 반 학생 상담",
                            active_element="",
                        ),
                    ),
                    make_request(owner_id),
                    db,
                )
        finally:
            db.close()

        capability_ids = [item["id"] for item in response.capabilities]
        self.assertIn("student_management", capability_ids)

        context_text = captured["messages"][0]["content"]
        self.assertIn("capability_registry_matches", context_text)
        self.assertIn("student_management", context_text)
        self.assertIn("searched_capability_registry", context_text)

    def test_chat_routes_problem_extraction_without_exam_draft(self):
        engine = create_engine("sqlite:///:memory:")
        Base.metadata.create_all(bind=engine)
        Session = sessionmaker(bind=engine)
        db = Session()
        owner_id = str(uuid.uuid4())

        try:
            with patch("routers.co_agent._co_agent_chat_completion") as chat_completion:
                response = co_agent_chat(
                    CoAgentChatRequest(
                        message="문항 추출 하고 싶어",
                        messages=[
                            {"role": "user", "content": "고3 수학 시험지 20문항 만들어줘"},
                            {"role": "assistant", "content": "어떤 템플릿을 사용할까요?"},
                        ],
                        current_path="/academy",
                    ),
                    make_request(owner_id),
                    db,
                )
        finally:
            db.close()

        chat_completion.assert_not_called()
        self.assertEqual(response.capabilities[0]["id"], "problem_extraction")
        self.assertEqual(response.drafts, [])
        self.assertEqual(response.workflow["kind"], "problem_extraction")
        self.assertEqual(response.workflow["active_step"], "archive")
        self.assertEqual(response.quick_actions[0]["href"], "/archive/new")


if __name__ == "__main__":
    unittest.main()
