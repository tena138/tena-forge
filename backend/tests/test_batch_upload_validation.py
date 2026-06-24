import sys
import unittest
from pathlib import Path
from uuid import UUID

from fastapi import HTTPException


BACKEND_DIR = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(BACKEND_DIR))

from routers.batches import _parse_archive_folder_id  # noqa: E402


class BatchUploadValidationTests(unittest.TestCase):
    def test_parse_archive_folder_id_accepts_empty_values(self):
        self.assertIsNone(_parse_archive_folder_id(None))
        self.assertIsNone(_parse_archive_folder_id(""))
        self.assertIsNone(_parse_archive_folder_id("undefined"))

    def test_parse_archive_folder_id_accepts_uuid_string(self):
        folder_id = "4d04b747-fd46-4d91-8543-7cc25cbd1df1"

        self.assertEqual(_parse_archive_folder_id(folder_id), UUID(folder_id))

    def test_parse_archive_folder_id_reports_invalid_value(self):
        with self.assertRaises(HTTPException) as ctx:
            _parse_archive_folder_id("not-a-folder-id")

        self.assertEqual(ctx.exception.status_code, 400)
        self.assertEqual(ctx.exception.detail, "저장 폴더를 다시 선택해 주세요.")


if __name__ == "__main__":
    unittest.main()
