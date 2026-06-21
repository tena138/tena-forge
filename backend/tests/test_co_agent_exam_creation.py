import sys
import unittest
import uuid
from pathlib import Path
from types import SimpleNamespace

from sqlalchemy import create_engine, func, select
from sqlalchemy.orm import sessionmaker


BACKEND_DIR = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(BACKEND_DIR))

from database import Base  # noqa: E402
from models import Batch, Problem, ProblemSet, ProblemSetItem, Tag, UsageLog  # noqa: E402
from routers.co_agent import CoAgentChatMessage, CoAgentChatRequest, co_agent_chat  # noqa: E402


def make_request(owner_id: str):
    return SimpleNamespace(state=SimpleNamespace(academy_id=owner_id), headers={})


class CoAgentExamCreationTests(unittest.TestCase):
    def setUp(self):
        engine = create_engine("sqlite:///:memory:")
        Base.metadata.create_all(bind=engine)
        self.Session = sessionmaker(bind=engine)
        self.owner_id = str(uuid.uuid4())
        self.request = make_request(self.owner_id)

    def _add_problem(self, db, number: int, difficulty: str):
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
            problem_text=f"고3 수학 {difficulty} problem {number}",
            choices=[],
            has_visual=False,
            needs_review=False,
            source_batch_id=batch.id,
            source_label="고3 수학",
            owner_id=self.owner_id,
        )
        problem.tags = Tag(subject="수학", unit=f"단원{number % 3 + 1}", difficulty=difficulty, source=f"고3 / {number}번")
        db.add(problem)
        db.flush()
        return problem

    def _seed_pool(self, db):
        for number in range(1, 11):
            self._add_problem(db, number, "3점")
        for number in range(11, 21):
            self._add_problem(db, number, "4점")
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
            self.assertEqual(response.drafts[0]["status"], "created")
            self.assertEqual(response.quick_actions[0]["href"], f"/problem-sets/{problem_sets[0].id}")

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


if __name__ == "__main__":
    unittest.main()
