import sys
import unittest
import inspect
from pathlib import Path
from uuid import UUID

from fastapi import FastAPI, File, HTTPException, UploadFile
from fastapi.params import File as FileParam
from fastapi.testclient import TestClient


BACKEND_DIR = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(BACKEND_DIR))

from routers.batches import _parse_archive_folder_id, upload_batch  # noqa: E402


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

    def test_repeated_pdf_files_parse_as_upload_list(self):
        param = inspect.signature(upload_batch).parameters["pdf_files"]
        self.assertEqual(param.annotation, list[UploadFile])
        self.assertIsInstance(param.default, FileParam)
        self.assertEqual(param.default.default, [])

        app = FastAPI()

        @app.post("/probe")
        def probe(pdf_files: list[UploadFile] = File(default=[])):
            return {"filenames": [file.filename for file in pdf_files]}

        response = TestClient(app).post(
            "/probe",
            files=[
                ("pdf_files", ("problem.pdf", b"%PDF-1.4\n%%EOF", "application/pdf")),
                ("pdf_files", ("solution.pdf", b"%PDF-1.4\n%%EOF", "application/pdf")),
            ],
        )

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json(), {"filenames": ["problem.pdf", "solution.pdf"]})


if __name__ == "__main__":
    unittest.main()
