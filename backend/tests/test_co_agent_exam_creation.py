import sys
import json
import unittest
import uuid
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import patch

from sqlalchemy import create_engine, func, select
from sqlalchemy.orm import sessionmaker


BACKEND_DIR = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(BACKEND_DIR))

from database import Base  # noqa: E402
from models import Batch, Problem, ProblemSet, ProblemSetItem, ProblemUsageHistory, Tag, UsageLog  # noqa: E402
import routers.co_agent as co_agent_module  # noqa: E402
from routers.co_agent import CoAgentChatMessage, CoAgentChatRequest, co_agent_chat  # noqa: E402
from routers.problem_sets import list_problem_sets  # noqa: E402


def make_request(owner_id: str):
    return SimpleNamespace(state=SimpleNamespace(academy_id=owner_id), headers={})


class CoAgentExamCreationTests(unittest.TestCase):
    def setUp(self):
        engine = create_engine("sqlite:///:memory:")
        Base.metadata.create_all(bind=engine)
        self.Session = sessionmaker(bind=engine)
        self.owner_id = str(uuid.uuid4())
        self.request = make_request(self.owner_id)

    def _add_problem(
        self,
        db,
        number: int,
        difficulty: str | None,
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
            problem_text=f"{source_label} {difficulty} problem {number}",
            choices=[],
            has_visual=False,
            needs_review=False,
            source_batch_id=batch.id,
            source_label=source_label,
            owner_id=self.owner_id,
        )
        problem.tags = Tag(subject="수학", unit=f"단원{number % 3 + 1}", difficulty=difficulty, source=f"{source_label} / {number}번")
        db.add(problem)
        db.flush()
        return problem

    def _seed_pool(self, db):
        for number in range(1, 11):
            self._add_problem(db, number, "3점")
        for number in range(11, 21):
            self._add_problem(db, number, "4점")
        db.commit()

    def _seed_pool_without_difficulty(self, db):
        for number in range(1, 21):
            self._add_problem(db, number, None)
        db.commit()

    def _seed_pool_with_sparse_difficulty(self, db):
        for number in range(1, 21):
            self._add_problem(db, number, "3점" if number <= 3 else None)
        db.commit()

    def _seed_sparse_grade_pool(self, db):
        for number in range(1, 4):
            self._add_problem(db, number, None, source_label="고3 수학", batch_name="고3 수학 모의고사")
        for number in range(4, 24):
            self._add_problem(db, number, None, source_label="수학 보관", batch_name="수학 보관")
        db.commit()

    def _mark_all_problems_used(self, db):
        problems = db.scalars(select(Problem).where(Problem.owner_id == self.owner_id)).all()
        for problem in problems:
            db.add(
                ProblemUsageHistory(
                    owner_id=self.owner_id,
                    problem_id=problem.id,
                    usage_type="export",
                    metadata_json={"test": True},
                )
            )
        db.commit()

    def test_chat_creates_problem_set_when_exam_request_is_complete(self):
        db = self.Session()
        try:
            self._seed_pool(db)

            response = co_agent_chat(
                CoAgentChatRequest(message="고3 수학 시험지 1-10까지는 3점, 11-20번까지는 4점으로 기본 양식으로 만들어줘"),
                self.request,
                db,
            )

            problem_sets = db.scalars(select(ProblemSet).where(ProblemSet.owner_id == self.owner_id)).all()
            self.assertEqual(len(problem_sets), 1)
            self.assertIn("고3 수학 시험지 20문항", problem_sets[0].name)

            items = db.scalars(
                select(ProblemSetItem).where(ProblemSetItem.problem_set_id == problem_sets[0].id).order_by(ProblemSetItem.order_index)
            ).all()
            self.assertEqual(len(items), 20)
            self.assertIn("/problem-sets/", response.answer)
            self.assertIn("문항 세트", response.answer)
            self.assertEqual(response.drafts[0]["status"], "created")
            self.assertEqual(response.quick_actions[0]["href"], f"/problem-sets/{problem_sets[0].id}")
            self.assertEqual(response.quick_actions[0]["label"], "새 문항 세트 확인")
            self.assertEqual(response.workflow["status"], "created")
            self.assertEqual(response.workflow["active_step"], "problem_set")
            self.assertEqual(response.workflow["bubble"]["variant"], "success")
            self.assertEqual(response.workflow["target"]["step"], "problem_set")
            self.assertEqual(response.workflow["target"]["action"], "created")
            self.assertIn('data-coagent-anchor="problem_set"', response.workflow["target"]["selector"])

            listed_sets = list_problem_sets(self.request, db)
            self.assertEqual(len(listed_sets), 1)
            self.assertEqual(str(listed_sets[0]["id"]), str(problem_sets[0].id))
            self.assertEqual(listed_sets[0]["item_count"], 20)

            usage = db.scalars(select(UsageLog).where(UsageLog.user_id == self.owner_id, UsageLog.usage_type == "co_agent_exam_build")).all()
            self.assertEqual(len(usage), 1)
            self.assertEqual(usage[0].tokens_used, 200)
        finally:
            db.close()

    def test_chat_uses_previous_exam_request_when_user_answers_clarification(self):
        db = self.Session()
        try:
            self._seed_pool(db)

            response = co_agent_chat(
                CoAgentChatRequest(
                    message="기본 양식으로 해줘",
                    messages=[
                        CoAgentChatMessage(role="user", content="고3 수학 시험지 1-10까지는 3점, 11-20번까지는 4점으로 만들어줘"),
                        CoAgentChatMessage(role="assistant", content="시험지 제작 전에 확인이 필요합니다. 어떤 시험지 템플릿 또는 양식을 사용할까요?"),
                    ],
                ),
                self.request,
                db,
            )

            self.assertEqual(response.drafts[0]["status"], "created")
            self.assertEqual(db.scalar(select(func.count(ProblemSetItem.id))), 20)
        finally:
            db.close()

    def test_chat_finishes_problem_set_after_template_reply_with_used_candidates(self):
        db = self.Session()
        try:
            self._seed_pool(db)
            self._mark_all_problems_used(db)

            response = co_agent_chat(
                CoAgentChatRequest(
                    message="세움 양식으로",
                    messages=[
                        CoAgentChatMessage(role="user", content="고3 수학 시험지 1-10까지는 3점, 11-20번까지는 4점으로 만들어줘"),
                        CoAgentChatMessage(role="assistant", content="시험지 제작 전에 확인이 필요합니다. 어떤 시험지 템플릿 또는 양식을 사용할까요?"),
                    ],
                ),
                self.request,
                db,
            )

            self.assertEqual(response.drafts[0]["status"], "created")
            self.assertEqual(response.drafts[0]["used_exclusion"]["reused_count"], 20)
            self.assertEqual(response.workflow["status"], "created")
            self.assertEqual(response.workflow["bubble"]["variant"], "success")
            self.assertEqual(db.scalar(select(func.count(ProblemSetItem.id))), 20)
        finally:
            db.close()

    def test_chat_reports_needs_input_when_total_candidates_are_short(self):
        db = self.Session()
        try:
            for number in range(1, 4):
                self._add_problem(db, number, None)
            db.commit()

            response = co_agent_chat(
                CoAgentChatRequest(message="고3 수학 시험지 20문항 세움 양식으로 만들어줘"),
                self.request,
                db,
            )

            self.assertEqual(response.drafts[0]["status"], "draft")
            self.assertEqual(response.drafts[0]["selected_count"], 3)
            self.assertEqual(response.drafts[0]["candidate_shortfall"], 17)
            self.assertEqual(response.workflow["status"], "needs_input")
            self.assertEqual(response.workflow["active_step"], "archive")
            self.assertEqual(response.workflow["bubble"]["variant"], "question")
            self.assertEqual(response.workflow["bubble"]["field"], "candidate_shortfall")
            self.assertEqual(db.scalar(select(func.count(ProblemSetItem.id))), 0)
        finally:
            db.close()

    def test_chat_creates_from_subject_pool_when_grade_metadata_is_sparse(self):
        db = self.Session()
        try:
            self._seed_sparse_grade_pool(db)
            for number in range(24, 44):
                self._add_problem(db, number, None, source_label="고1 수학", batch_name="고1 수학 모의고사")
            db.commit()

            response = co_agent_chat(
                CoAgentChatRequest(message="고3 수학 시험지 20문항 세움 양식으로 만들어줘"),
                self.request,
                db,
            )

            selected_sources = [problem["source_label"] or "" for problem in response.drafts[0]["problems"]]
            self.assertEqual(response.drafts[0]["status"], "created")
            self.assertEqual(response.drafts[0]["selected_count"], 20)
            self.assertTrue(response.drafts[0]["grade_filter_relaxed"])
            self.assertFalse(any("고1" in source for source in selected_sources))
            self.assertEqual(response.workflow["status"], "created")
            self.assertEqual(db.scalar(select(func.count(ProblemSetItem.id))), 20)
        finally:
            db.close()

    def test_chat_treats_random_reply_as_random_difficulty_plan(self):
        db = self.Session()
        try:
            self._seed_pool(db)

            response = co_agent_chat(
                CoAgentChatRequest(
                    message="그냥 랜덤으로",
                    messages=[
                        CoAgentChatMessage(role="user", content="고3 수학 시험지 20문항 세움 양식으로 만들어줘"),
                        CoAgentChatMessage(role="assistant", content="시험지 제작 전에 확인이 필요합니다. 배점/난이도 배치는 어떻게 할까요? 예: 1-10 2점, 11-20 3점, 21-25 4점."),
                    ],
                ),
                self.request,
                db,
            )

            self.assertEqual(response.drafts[0]["status"], "created")
            self.assertEqual(response.drafts[0]["selection_strategy"], "random_without_difficulty")
            self.assertEqual(response.drafts[0]["difficulty_plan_mode"], "random_without_difficulty")
            self.assertEqual(response.drafts[0]["missing_difficulty_slots"], [])
            self.assertEqual(db.scalar(select(func.count(ProblemSetItem.id))), 20)
        finally:
            db.close()

    def test_ai_intent_normalizer_accepts_flexible_difficulty_reply(self):
        ai_payload = {
            "is_exam_request": True,
            "confidence": 0.91,
            "normalized_message": "고3 수학 20문항 세움 양식 시험지 제작. 난이도/배점 조건 없이 랜덤 추출.",
            "reason": "난이도 질문에 대한 위임 답변",
        }
        with patch("routers.co_agent._co_agent_exam_intent_completion", return_value=json.dumps(ai_payload, ensure_ascii=False)):
            normalized = co_agent_module._co_agent_exam_context_message_ai(
                "적당히 해줘",
                [
                    CoAgentChatMessage(role="user", content="고3 수학 시험지 20문항 세움 양식으로 만들어줘"),
                    CoAgentChatMessage(role="assistant", content="시험지 제작 전에 확인이 필요합니다. 배점/난이도 배치는 어떻게 할까요?"),
                ],
            )

        self.assertEqual(normalized, ai_payload["normalized_message"])

    def test_chat_uses_ai_normalized_exam_followup_for_creation(self):
        db = self.Session()
        try:
            self._seed_pool(db)
            normalized = "고3 수학 20문항 세움 양식 시험지 제작. 난이도/배점 조건 없이 랜덤 추출."

            with patch("routers.co_agent._co_agent_exam_context_message_ai", return_value=normalized) as ai_normalizer:
                response = co_agent_chat(
                    CoAgentChatRequest(
                        message="적당히 해줘",
                        messages=[
                            CoAgentChatMessage(role="user", content="고3 수학 시험지 20문항 세움 양식으로 만들어줘"),
                            CoAgentChatMessage(role="assistant", content="시험지 제작 전에 확인이 필요합니다. 배점/난이도 배치는 어떻게 할까요?"),
                        ],
                    ),
                    self.request,
                    db,
                )

            ai_normalizer.assert_called_once()
            self.assertEqual(response.drafts[0]["status"], "created")
            self.assertEqual(response.drafts[0]["selection_strategy"], "random_without_difficulty")
            self.assertEqual(db.scalar(select(func.count(ProblemSetItem.id))), 20)
        finally:
            db.close()

    def test_chat_creates_problem_set_randomly_when_point_metadata_is_missing(self):
        db = self.Session()
        try:
            self._seed_pool_without_difficulty(db)

            response = co_agent_chat(
                CoAgentChatRequest(message="고3 수학 시험지 1-10까지는 3점, 11-20번까지는 4점으로 세움 양식으로 만들어줘"),
                self.request,
                db,
            )

            problem_sets = db.scalars(select(ProblemSet).where(ProblemSet.owner_id == self.owner_id)).all()
            self.assertEqual(len(problem_sets), 1)
            self.assertEqual(response.drafts[0]["status"], "created")
            self.assertEqual(response.drafts[0]["selection_strategy"], "random_without_difficulty")
            self.assertTrue(response.drafts[0]["ignored_difficulty_plan"])
            self.assertEqual(db.scalar(select(func.count(ProblemSetItem.id))), 20)
        finally:
            db.close()

    def test_chat_creates_problem_set_randomly_when_point_metadata_is_sparse(self):
        db = self.Session()
        try:
            self._seed_pool_with_sparse_difficulty(db)

            response = co_agent_chat(
                CoAgentChatRequest(message="고3 수학 시험지 1-10까지는 3점, 11-20번까지는 4점으로 세움 양식으로 만들어줘"),
                self.request,
                db,
            )

            problem_sets = db.scalars(select(ProblemSet).where(ProblemSet.owner_id == self.owner_id)).all()
            self.assertEqual(len(problem_sets), 1)
            self.assertEqual(response.drafts[0]["status"], "created")
            self.assertEqual(response.drafts[0]["selection_strategy"], "random_without_difficulty")
            self.assertEqual(response.drafts[0]["point_difficulty_metadata_count"], 3)
            self.assertEqual(db.scalar(select(func.count(ProblemSetItem.id))), 20)
        finally:
            db.close()

    def test_chat_treats_named_template_reply_as_template_answer(self):
        db = self.Session()
        try:
            self._seed_pool(db)

            response = co_agent_chat(
                CoAgentChatRequest(
                    message="세움 A4 2단으로 된거",
                    messages=[
                        CoAgentChatMessage(role="user", content="고3 수학 시험지 1-10까지는 3점, 11-20번까지는 4점으로 만들어줘"),
                        CoAgentChatMessage(role="assistant", content="시험지 제작 전에 확인이 필요합니다. 어떤 시험지 템플릿 또는 양식을 사용할까요?"),
                    ],
                ),
                self.request,
                db,
            )

            self.assertEqual(response.drafts[0]["status"], "created")
            self.assertEqual(db.scalar(select(func.count(ProblemSetItem.id))), 20)
            self.assertNotEqual(response.quick_actions[0]["kind"], "revise")
        finally:
            db.close()

    def test_chat_keeps_subject_answer_across_later_template_reply(self):
        db = self.Session()
        try:
            self._seed_pool(db)

            response = co_agent_chat(
                CoAgentChatRequest(
                    message="세움 A4 2단으로 된거",
                    messages=[
                        CoAgentChatMessage(role="user", content="시험지 만들어줘"),
                        CoAgentChatMessage(role="assistant", content="시험지 제작 전에 확인이 필요합니다. 어떤 과목 시험지인가요? 수학, 국어, 영어 중에서 알려주세요."),
                        CoAgentChatMessage(role="user", content="고3 수학 시험지 1-10까지는 3점, 11-20번까지는 4점"),
                        CoAgentChatMessage(role="assistant", content="시험지 제작 전에 확인이 필요합니다. 어떤 시험지 템플릿 또는 양식을 사용할까요?"),
                    ],
                ),
                self.request,
                db,
            )

            self.assertEqual(response.drafts[0]["status"], "created")
            self.assertEqual(response.drafts[0]["subject_engine"], "math")
            self.assertEqual(db.scalar(select(func.count(ProblemSetItem.id))), 20)
        finally:
            db.close()

    def test_chat_resets_exam_context_after_new_exam_request(self):
        db = self.Session()
        try:
            self._seed_pool(db)

            response = co_agent_chat(
                CoAgentChatRequest(
                    message="수학",
                    messages=[
                        CoAgentChatMessage(role="user", content="고3 수학 시험지 1-10까지는 3점, 11-20번까지는 4점으로 기본 양식으로 만들어줘"),
                        CoAgentChatMessage(role="assistant", content="문항 세트에 시험지를 생성했습니다. /problem-sets/old"),
                        CoAgentChatMessage(role="user", content="시험지 만들어줘"),
                        CoAgentChatMessage(role="assistant", content="시험지 제작 전에 확인이 필요합니다. 어떤 과목 시험지인가요? 수학, 국어, 영어 중에서 알려주세요."),
                    ],
                ),
                self.request,
                db,
            )

            self.assertEqual(response.drafts[0]["status"], "needs_input")
            self.assertEqual(response.drafts[0]["subject_engine"], "math")
            self.assertEqual(response.drafts[0]["selected_count"], 0)
            self.assertEqual(response.workflow["status"], "needs_input")
            self.assertEqual(response.workflow["active_step"], "archive")
            self.assertEqual(response.workflow["bubble"]["variant"], "question")
            self.assertEqual(response.workflow["target"]["action"], "wait")
            self.assertIn('data-coagent-anchor="archive"', response.workflow["target"]["selector"])
            self.assertEqual(db.scalar(select(func.count(ProblemSetItem.id))), 0)
        finally:
            db.close()


if __name__ == "__main__":
    unittest.main()
