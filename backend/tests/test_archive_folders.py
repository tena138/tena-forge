import sys
import unittest
from pathlib import Path
from types import SimpleNamespace

from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from fastapi import HTTPException


BACKEND_DIR = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(BACKEND_DIR))

from database import Base  # noqa: E402
from models import ArchiveFolder, Batch  # noqa: E402
from routers.archive_folders import create_archive_folder, delete_archive_folder, list_archive_folders  # noqa: E402
from routers.batches import update_batch_archive_folder  # noqa: E402
from schemas import ArchiveFolderCreate, BatchArchiveFolderUpdate  # noqa: E402


class ArchiveFolderTests(unittest.TestCase):
    def setUp(self):
        engine = create_engine("sqlite:///:memory:")
        Base.metadata.create_all(bind=engine)
        self.Session = sessionmaker(bind=engine)
        self.request = SimpleNamespace(state=SimpleNamespace(academy_id="owner-1"))

    def test_folder_tree_and_batch_assignment_are_account_scoped(self):
        db = self.Session()
        try:
            math = create_archive_folder(ArchiveFolderCreate(name="수학", color="#8b5cf6"), self.request, db)
            child = create_archive_folder(ArchiveFolderCreate(name="미친개념 수2", parent_id=math.id), self.request, db)
            english = create_archive_folder(ArchiveFolderCreate(name="English", subject_engine="english", color="#06b6d4"), self.request, db)
            other_request = SimpleNamespace(state=SimpleNamespace(academy_id="owner-2"))

            self.assertEqual([folder.name for folder in list_archive_folders(self.request, db, subject_engine="math")], ["수학", "미친개념 수2"])
            self.assertEqual([folder.name for folder in list_archive_folders(self.request, db, subject_engine="english")], ["English"])
            self.assertEqual(list_archive_folders(other_request, db), [])

            batch = Batch(name="0606 수2", problem_pdf_filename="problem.pdf", owner_id="owner-1", subject_engine="math")
            db.add(batch)
            db.commit()
            db.refresh(batch)

            updated = update_batch_archive_folder(batch.id, BatchArchiveFolderUpdate(archive_folder_id=child.id), self.request, db)
            self.assertEqual(updated.archive_folder_id, child.id)
            with self.assertRaises(HTTPException):
                update_batch_archive_folder(batch.id, BatchArchiveFolderUpdate(archive_folder_id=english.id), self.request, db)

            delete_archive_folder(child.id, self.request, db)
            db.refresh(batch)
            self.assertIsNone(batch.archive_folder_id)
            self.assertEqual(db.query(ArchiveFolder).count(), 2)
        finally:
            db.close()


if __name__ == "__main__":
    unittest.main()
