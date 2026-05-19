import os
import subprocess
import sys
from pathlib import Path
from uuid import UUID

from database import get_settings


def launch_batch_worker(batch_id: UUID) -> None:
    backend_dir = Path(__file__).resolve().parents[1]
    log_dir = backend_dir / "logs"
    log_dir.mkdir(exist_ok=True)
    log_path = log_dir / f"batch_{batch_id}.log"
    env = os.environ.copy()
    env.setdefault("DATABASE_URL", get_settings().database_url)
    creationflags = subprocess.CREATE_NEW_PROCESS_GROUP if os.name == "nt" else 0

    with log_path.open("ab") as log_file:
        subprocess.Popen(
            [sys.executable, "-m", "services.batch_worker", str(batch_id)],
            cwd=str(backend_dir),
            env=env,
            stdin=subprocess.DEVNULL,
            stdout=log_file,
            stderr=subprocess.STDOUT,
            close_fds=True,
            creationflags=creationflags,
        )
