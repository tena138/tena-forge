import sys
import unittest
import uuid
from pathlib import Path
from types import SimpleNamespace

from sqlalchemy import create_engine, select
from sqlalchemy.orm import sessionmaker


BACKEND_DIR = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(BACKEND_DIR))

from database import Base  # noqa: E402
from models import ArchiveFolder, Batch, BatchStatus, Problem, ProblemSet  # noqa: E402
from routers.archive_folders import list_archive_folders  # noqa: E402
from routers.batches import list_batches  # noqa: E402
from routers.problem_sets import list_problem_sets  # noqa: E402
from routers.problems import list_problems  # noqa: E402
from services.ownership import LOCAL_OWNER_ID, claim_legacy_archive_if_safe  # noqa: E402


def make_request(owner_id: str):
    return SimpleNamespace(state=SimpleNamespace(academy_id=owner_id))


class LegacyArchiveRecoveryTests(unittest.TestCase):
    def setUp(self):
        engine = create_engine("sqlite:///:memory:")
        Base.metadata.create_all(bind=engine)
        self.Session = sessionmaker(bind=engine)
        self.owner_id = str(uuid.uuid4())
        self.other_owner_id = str(uuid.uuid4())
        self.request = make_request(self.owner_id)

    def _add_legacy_archive(self, db):
        folder = ArchiveFolder(owner_id=LOCAL_OWNER_ID, name="Legacy", subject_engine="math")
        batch = Batch(
            name="Legacy batch",
            problem_pdf_filename="legacy.pdf",
            status=BatchStatus.done,
            owner_id=LOCAL_OWNER_ID,
            subject_engine="math",
        )
        problem_set = ProblemSet(name="Legacy set", owner_id=LOCAL_OWNER_ID)
        db.add_all([folder, batch, problem_set])
        db.flush()
        batch.archive_folder_id = folder.id
        problem = Problem(
            problem_number=1,
            problem_text="legacy problem",
            choices=[],
            has_visual=False,
            needs_review=True,
            source_batch_id=batch.id,
            source_type="self_created",
            rights_confirmed=True,
            visibility="private",
            origin_type="owned",
            owner_id=LOCAL_OWNER_ID,
        )
        db.add(problem)
        db.commit()
        return folder, batch, problem, problem_set

    def test_archive_reads_claim_unowned_legacy_content_for_current_account(self):
        db = self.Session()
        try:
            self._add_legacy_archive(db)

            folders = list_archive_folders(self.request, db, subject_engine="math")
            batches = list_batches(self.request, db)
            sets = list_problem_sets(self.request, db)
            problems = list_problems(
                request=self.request,
                subject=None,
                unit=None,
                difficulty=None,
                problem_type=None,
                needs_review=None,
                source_type=None,
                visibility=None,
                origin_type=None,
                search=None,
                batch_id=None,
                batch_ids=None,
                page_from=None,
                page_to=None,
                sort="source_order",
                page=1,
                limit=20,
                db=db,
            )

            self.assertEqual([folder.owner_id for folder in folders], [self.owner_id])
            self.assertEqual(len(batches), 1)
            self.assertEqual(batches[0].problem_count, 1)
            self.assertEqual(len(sets), 1)
            self.assertEqual(problems["total"], 1)

            self.assertFalse(db.scalars(select(Problem).where(Problem.owner_id == LOCAL_OWNER_ID)).first())
            self.assertFalse(db.scalars(select(Batch).where(Batch.owner_id == LOCAL_OWNER_ID)).first())
            self.assertFalse(db.scalars(select(ArchiveFolder).where(ArchiveFolder.owner_id == LOCAL_OWNER_ID)).first())
            self.assertFalse(db.scalars(select(ProblemSet).where(ProblemSet.owner_id == LOCAL_OWNER_ID)).first())
        finally:
            db.close()

    def test_legacy_content_is_not_claimed_when_another_real_owner_has_archive_data(self):
        db = self.Session()
        try:
            self._add_legacy_archive(db)
            db.add(
                Batch(
                    name="Other owner batch",
                    problem_pdf_filename="other.pdf",
                    status=BatchStatus.done,
                    owner_id=self.other_owner_id,
                    subject_engine="math",
                )
            )
            db.commit()

            claimed = claim_legacy_archive_if_safe(db, self.owner_id, self.owner_id)

            self.assertEqual(claimed, 0)
            self.assertTrue(db.scalars(select(Batch).where(Batch.owner_id == LOCAL_OWNER_ID)).first())
        finally:
            db.close()


if __name__ == "__main__":
    unittest.main()
