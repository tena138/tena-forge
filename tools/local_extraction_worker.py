import argparse
import getpass
import json
import os
import sys
import tempfile
import time
from pathlib import Path
from typing import Any

import httpx

ROOT = Path(__file__).resolve().parents[1]
BACKEND_DIR = ROOT / "backend"
sys.path.insert(0, str(BACKEND_DIR))

from database import get_settings  # noqa: E402
from services.math_normalization import normalize_geometry_notation  # noqa: E402
from services.pipeline import (  # noqa: E402
    attach_visuals,
    choose_render_dpi,
    count_pdf_pages,
    extract_and_cross_check,
    extract_solutions,
    format_page_range_group,
    interleave_rendered_page_groups,
    iter_split_page_range_groups,
    render_pdf,
    strip_answer_choices,
)


DEFAULT_API_URL = "https://tena-forge-api.onrender.com"


def api_url(value: str | None) -> str:
    return (value or os.environ.get("TENA_FORGE_API_URL") or DEFAULT_API_URL).rstrip("/")


def login(client: httpx.Client, email: str | None, password: str | None, totp_code: str | None) -> str:
    token = os.environ.get("TENA_FORGE_ACCESS_TOKEN")
    if token:
        return token
    email = email or os.environ.get("TENA_FORGE_EMAIL") or input("Tena Forge email: ").strip()
    password = password or os.environ.get("TENA_FORGE_PASSWORD") or getpass.getpass("Tena Forge password: ")
    payload: dict[str, Any] = {"email": email, "password": password, "remember": True}
    if totp_code or os.environ.get("TENA_FORGE_TOTP_CODE"):
        payload["totp_code"] = totp_code or os.environ.get("TENA_FORGE_TOTP_CODE")
    response = client.post("/api/auth/login", json=payload)
    response.raise_for_status()
    data = response.json()
    if data.get("requires_totp"):
        payload["totp_code"] = input("2FA code: ").strip()
        response = client.post("/api/auth/login", json=payload)
        response.raise_for_status()
        data = response.json()
    access_token = data.get("access_token")
    if not access_token:
        raise RuntimeError("Login did not return an access token.")
    return access_token


def post_progress(client: httpx.Client, batch_id: str, message: str, current: int | None = None, total: int | None = None) -> None:
    client.post(
        f"/api/local-worker/jobs/{batch_id}/progress",
        json={"message": message, "current": current, "total": total},
    ).raise_for_status()


def download_file(client: httpx.Client, url: str, target: Path) -> None:
    with client.stream("GET", url) as response:
        response.raise_for_status()
        with target.open("wb") as output:
            for chunk in response.iter_bytes():
                if chunk:
                    output.write(chunk)


def upload_visual(client: httpx.Client, batch_id: str, filename: str, data: bytes) -> str:
    response = client.post(
        f"/api/local-worker/jobs/{batch_id}/visuals",
        files={"file": (filename, data, "image/png")},
    )
    response.raise_for_status()
    return str(response.json()["url"])


def attach_review_page_images_remote(client: httpx.Client, batch_id: str, problems: list[dict[str, Any]], pages) -> None:
    page_urls: dict[int, str] = {}
    for page in pages:
        page_number = page.page_index + 1
        filename = f"{batch_id}_page_{page_number}_review_source.png"
        page_urls[page.page_index] = upload_visual(client, batch_id, filename, page.png_bytes)
    for problem in problems:
        page_index = int(problem.get("page_index") or 0)
        problem["review_page_image_url"] = page_urls.get(page_index)
        problem["review_page_number"] = page_index + 1


def process_job(client: httpx.Client, job: dict[str, Any]) -> None:
    settings = get_settings()
    if not settings.openai_api_key:
        raise RuntimeError("OPENAI_API_KEY must be set on this computer before running the local worker.")

    batch_id = str(job["id"])
    batch_name = str(job.get("name") or batch_id)
    print(f"[{batch_id}] starting {batch_name}")

    with tempfile.TemporaryDirectory(prefix="tena-forge-worker-") as temp_dir_raw:
        temp_dir = Path(temp_dir_raw)
        problem_pdf = temp_dir / "problems.pdf"
        solution_pdf = temp_dir / "solutions.pdf"
        post_progress(client, batch_id, "PDF 다운로드 중", 0, None)
        download_file(client, f"/api/local-worker/jobs/{batch_id}/files/problem", problem_pdf)

        solution_mode = str(settings.ai_solution_mode or "skip").strip().lower()
        has_solution = bool(job.get("has_solution_pdf")) and solution_mode != "skip"
        if has_solution:
            download_file(client, f"/api/local-worker/jobs/{batch_id}/files/solution", solution_pdf)

        extraction_passes = max(settings.ai_extraction_passes, 1)
        units_per_page = 1 + extraction_passes
        problem_page_count = count_pdf_pages(str(problem_pdf))
        solution_page_count = count_pdf_pages(str(solution_pdf)) if has_solution else 0
        solution_units = solution_page_count * units_per_page
        problem_units = problem_page_count * units_per_page
        total_units = solution_units + problem_units
        problem_dpi = choose_render_dpi(str(problem_pdf), problem_page_count)
        solution_dpi = (settings.pdf_solution_render_dpi or choose_render_dpi(str(solution_pdf), solution_page_count)) if has_solution else problem_dpi
        post_progress(client, batch_id, "PDF 페이지 수 확인 완료", 0, total_units)

        solutions: dict[int, dict[str, Any]] = {}
        if has_solution:
            solution_models = [model.strip() for model in settings.ai_solution_model_pool.split(",") if model.strip()] or [settings.ai_model]
            processed_solution_pages = 0
            for range_group in iter_split_page_range_groups(solution_page_count, len(solution_models)):
                chunk_len = sum(end - start for start, end in range_group)
                base = processed_solution_pages * units_per_page
                rendered_groups = []
                rendered_pages = 0
                for start, end in range_group:
                    post_progress(client, batch_id, f"해설 PDF 렌더링 중 ({start + 1}-{end}/{solution_page_count}페이지)", base + rendered_pages, total_units)
                    rendered = render_pdf(str(solution_pdf), start_page=start, end_page=end, dpi=solution_dpi)
                    rendered_groups.append(rendered)
                    rendered_pages += end - start
                solution_pages = interleave_rendered_page_groups(rendered_groups)
                post_progress(client, batch_id, f"해설 원문 추출 중 ({format_page_range_group(range_group, solution_page_count)})", base + chunk_len, total_units)
                solutions.update(extract_solutions(solution_pages, display_total_pages=solution_page_count))
                processed_solution_pages += chunk_len

        problem_models = [model.strip() for model in settings.ai_model_pool.split(",") if model.strip()] or [settings.ai_model]
        processed_problem_pages = 0
        all_problems: list[dict[str, Any]] = []
        for range_group in iter_split_page_range_groups(problem_page_count, len(problem_models)):
            chunk_len = sum(end - start for start, end in range_group)
            base = solution_units + processed_problem_pages * units_per_page
            rendered_groups = []
            rendered_pages = 0
            for start, end in range_group:
                post_progress(client, batch_id, f"문제 PDF 렌더링 중 ({start + 1}-{end}/{problem_page_count}페이지)", base + rendered_pages, total_units)
                rendered = render_pdf(str(problem_pdf), start_page=start, end_page=end, dpi=problem_dpi)
                rendered_groups.append(rendered)
                rendered_pages += end - start
            problem_pages = interleave_rendered_page_groups(rendered_groups)
            page_range_label = format_page_range_group(range_group, problem_page_count)
            post_progress(client, batch_id, f"문항 추출 중 ({page_range_label})", base + chunk_len, total_units)
            extracted = extract_and_cross_check(
                problem_pages,
                display_total_pages=problem_page_count,
                subject_candidates=job.get("subject_candidates") or [],
                unit_candidates=job.get("unit_candidates") or [],
            )
            attach_visuals(extracted, problem_pages, batch_id)
            post_progress(client, batch_id, f"검토용 원본 페이지 업로드 중 ({page_range_label})", base + chunk_len * units_per_page, total_units)
            attach_review_page_images_remote(client, batch_id, extracted, problem_pages)
            for problem in extracted:
                cleaned, suspicious = strip_answer_choices(problem["problem_text"])
                problem["problem_text"] = normalize_geometry_notation(cleaned)
                problem["needs_review"] = problem["needs_review"] or suspicious
            all_problems.extend(extracted)
            processed_problem_pages += chunk_len

        payload = {
            "problems": all_problems,
            "solutions": {str(number): value for number, value in solutions.items()},
        }
        post_progress(client, batch_id, "문항 저장 중", total_units, total_units)
        response = client.post(f"/api/local-worker/jobs/{batch_id}/complete", json=payload, timeout=120)
        response.raise_for_status()
        print(f"[{batch_id}] done: {len(all_problems)} problems")


def run(args: argparse.Namespace) -> None:
    base_url = api_url(args.api_url)
    with httpx.Client(base_url=base_url, timeout=60) as client:
        token = login(client, args.email, args.password, args.totp_code)
        client.headers.update({"Authorization": f"Bearer {token}"})
        while True:
            response = client.get("/api/local-worker/jobs/next")
            response.raise_for_status()
            job = response.json()
            if not job:
                print("No pending local extraction jobs.")
                if args.watch:
                    time.sleep(args.interval)
                    continue
                return
            try:
                process_job(client, job)
            except Exception as exc:
                batch_id = str(job["id"])
                print(f"[{batch_id}] failed: {exc}", file=sys.stderr)
                client.post(
                    f"/api/local-worker/jobs/{batch_id}/fail",
                    json={"stage": "local worker", "reason": str(exc), "hint": "로컬 워커 로그와 OPENAI_API_KEY 설정을 확인하세요."},
                )
                if not args.watch:
                    raise


def main() -> None:
    parser = argparse.ArgumentParser(description="Run Tena Forge extraction jobs on this computer.")
    parser.add_argument("--api-url", help=f"Tena Forge API URL. Default: {DEFAULT_API_URL}")
    parser.add_argument("--email", help="Tena Forge login email. Can also use TENA_FORGE_EMAIL.")
    parser.add_argument("--password", help="Tena Forge login password. Can also use TENA_FORGE_PASSWORD.")
    parser.add_argument("--totp-code", help="2FA code if enabled. Can also use TENA_FORGE_TOTP_CODE.")
    parser.add_argument("--watch", action="store_true", help="Keep polling for new jobs.")
    parser.add_argument("--interval", type=int, default=10, help="Polling interval in seconds when --watch is used.")
    args = parser.parse_args()
    run(args)


if __name__ == "__main__":
    main()
