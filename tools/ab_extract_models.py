from __future__ import annotations

import argparse
import json
import sys
import time
from datetime import datetime
from pathlib import Path
from typing import Any

from openai import OpenAI


REPO_ROOT = Path(__file__).resolve().parents[1]
BACKEND_ROOT = REPO_ROOT / "backend"
if str(BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT))

from database import get_settings  # noqa: E402
from services.pipeline import (  # noqa: E402
    EXTRACTION_PROMPT,
    _extract_json_text,
    _loads_lenient_json,
    _wait_for_ai_slot,
    choose_render_dpi,
    count_pdf_pages,
    render_pdf,
    strip_answer_choices,
)


DEFAULT_MODELS = ["gpt-4o-mini", "gpt-5-mini", "gpt-5.4-mini"]


def latest_problem_pdf() -> Path:
    uploads = BACKEND_ROOT / "uploads"
    candidates = [
        path
        for path in uploads.glob("*.pdf")
        if not any(marker in path.name.lower() for marker in ("solution", "answer", "해설", "정답"))
    ]
    if not candidates:
        raise FileNotFoundError(f"No problem PDF found under {uploads}")
    return max(candidates, key=lambda path: path.stat().st_mtime)


def slug(value: str) -> str:
    return "".join(character if character.isalnum() or character in "-_." else "-" for character in value)


def usage_to_dict(usage: Any) -> dict[str, int | None]:
    if not usage:
        return {}
    return {
        "prompt_tokens": getattr(usage, "prompt_tokens", None),
        "completion_tokens": getattr(usage, "completion_tokens", None),
        "total_tokens": getattr(usage, "total_tokens", None),
    }


def extract_page(client: OpenAI, model: str, base64_image: str, max_output_tokens: int, image_detail: str) -> dict[str, Any]:
    started_at = time.perf_counter()
    kwargs = {
        "model": model,
        "messages": [
            {
                "role": "user",
                "content": [
                    {
                        "type": "image_url",
                        "image_url": {
                            "url": f"data:image/png;base64,{base64_image}",
                            "detail": image_detail,
                        },
                    },
                    {"type": "text", "text": EXTRACTION_PROMPT},
                ],
            }
        ],
    }
    try:
        _wait_for_ai_slot()
        response = client.chat.completions.create(max_tokens=max_output_tokens, **kwargs)
    except Exception as exc:
        if "max_tokens" not in str(exc):
            raise
        try:
            _wait_for_ai_slot()
            response = client.chat.completions.create(
                extra_body={"max_completion_tokens": max_output_tokens},
                **kwargs,
            )
        except Exception as fallback_exc:
            if "max_completion_tokens" not in str(fallback_exc):
                raise
            _wait_for_ai_slot()
            response = client.chat.completions.create(**kwargs)

    raw_content = response.choices[0].message.content or "[]"
    json_text = _extract_json_text(raw_content)
    parsed = _loads_lenient_json(json_text)
    items = parsed if isinstance(parsed, list) else []
    cleaned_items = []
    for item in items:
        if not isinstance(item, dict):
            continue
        next_item = dict(item)
        if isinstance(next_item.get("problem_text"), str):
            cleaned, suspicious = strip_answer_choices(next_item["problem_text"])
            next_item["problem_text"] = cleaned
            next_item["answer_choice_suspicious"] = suspicious
        cleaned_items.append(next_item)

    return {
        "duration_seconds": round(time.perf_counter() - started_at, 2),
        "usage": usage_to_dict(getattr(response, "usage", None)),
        "items": cleaned_items,
        "raw_content": raw_content,
    }


def summarize_model(result: dict[str, Any]) -> dict[str, Any]:
    total_items = sum(len(page.get("items", [])) for page in result["pages"])
    errors = [page for page in result["pages"] if page.get("error")]
    usage = {"prompt_tokens": 0, "completion_tokens": 0, "total_tokens": 0}
    for page in result["pages"]:
        for key in usage:
            usage[key] += int(page.get("usage", {}).get(key) or 0)
    return {
        "model": result["model"],
        "pages": len(result["pages"]),
        "items": total_items,
        "errors": len(errors),
        "duration_seconds": round(sum(float(page.get("duration_seconds", 0)) for page in result["pages"]), 2),
        "usage": usage,
    }


def write_markdown(output_dir: Path, source_pdf: Path, page_limit: int, results: list[dict[str, Any]]) -> None:
    lines = [
        "# Model A/B Extraction",
        "",
        f"- Source PDF: `{source_pdf}`",
        f"- Pages: first {page_limit}",
        f"- Created at: {datetime.now().isoformat(timespec='seconds')}",
        "",
        "## Summary",
        "",
        "| Model | Pages | Extracted items | Errors | Duration | Prompt tokens | Completion tokens | Total tokens |",
        "|---|---:|---:|---:|---:|---:|---:|---:|",
    ]
    for result in results:
        summary = summarize_model(result)
        usage = summary["usage"]
        lines.append(
            f"| `{summary['model']}` | {summary['pages']} | {summary['items']} | {summary['errors']} | "
            f"{summary['duration_seconds']}s | {usage['prompt_tokens']} | {usage['completion_tokens']} | {usage['total_tokens']} |"
        )

    lines.extend(["", "## Page-by-page", ""])
    for page_number in range(1, page_limit + 1):
        lines.extend([f"### Page {page_number}", ""])
        for result in results:
            page = next((item for item in result["pages"] if item["page_number"] == page_number), None)
            lines.append(f"#### {result['model']}")
            if not page:
                lines.extend(["No result.", ""])
                continue
            if page.get("error"):
                lines.extend([f"Error: `{page['error']}`", ""])
                continue
            lines.append(f"- Items: {len(page.get('items', []))}")
            lines.append(f"- Duration: {page.get('duration_seconds')}s")
            lines.append("")
            lines.append("```json")
            lines.append(json.dumps(page.get("items", []), ensure_ascii=False, indent=2))
            lines.append("```")
            lines.append("")

    (output_dir / "comparison.md").write_text("\n".join(lines), encoding="utf-8")


def main() -> int:
    parser = argparse.ArgumentParser(description="Run model A/B extraction on the first pages of a PDF.")
    parser.add_argument("--pdf", type=Path, default=None, help="PDF path. Defaults to latest non-solution PDF in backend/uploads.")
    parser.add_argument("--pages", type=int, default=10, help="Number of pages from the front of the PDF.")
    parser.add_argument("--models", nargs="+", default=DEFAULT_MODELS, help="Models to compare.")
    parser.add_argument("--output-dir", type=Path, default=None, help="Output directory.")
    parser.add_argument("--rerun-success", action="store_true", help="Re-run pages even when a successful page JSON already exists.")
    args = parser.parse_args()

    settings = get_settings()
    if not settings.openai_api_key:
        raise RuntimeError("OPENAI_API_KEY is not set.")

    source_pdf = (args.pdf or latest_problem_pdf()).resolve()
    if not source_pdf.exists():
        raise FileNotFoundError(source_pdf)

    page_count = count_pdf_pages(str(source_pdf))
    page_limit = min(max(args.pages, 1), page_count)
    dpi = choose_render_dpi(str(source_pdf), page_count)
    output_dir = args.output_dir or (REPO_ROOT / "site-captures" / f"model-ab-{datetime.now().strftime('%Y%m%d-%H%M%S')}")
    output_dir.mkdir(parents=True, exist_ok=True)

    print(f"Source PDF: {source_pdf}")
    print(f"Pages: 1-{page_limit} of {page_count}; render DPI: {dpi}")
    print(f"Models: {', '.join(args.models)}")
    print(f"Output: {output_dir}")

    pages = render_pdf(str(source_pdf), start_page=0, end_page=page_limit, dpi=dpi)
    client = OpenAI(api_key=settings.openai_api_key)
    results: list[dict[str, Any]] = []

    for model in args.models:
        model_result = {"model": model, "pages": []}
        model_dir = output_dir / slug(model)
        model_dir.mkdir(exist_ok=True)
        print(f"\n== {model} ==")
        for page in pages:
            page_number = page.page_index + 1
            page_path = model_dir / f"page-{page_number:02d}.json"
            if page_path.exists() and not args.rerun_success:
                existing = json.loads(page_path.read_text(encoding="utf-8"))
                if not existing.get("error"):
                    print(f"Page {page_number}... reused", flush=True)
                    model_result["pages"].append(existing)
                    continue
            print(f"Page {page_number}...", flush=True)
            try:
                page_result = extract_page(
                    client,
                    model,
                    page.base64_png,
                    max_output_tokens=max(settings.ai_max_output_tokens, 512),
                    image_detail=settings.ai_image_detail,
                )
                page_result["page_number"] = page_number
            except Exception as exc:
                page_result = {"page_number": page_number, "error": str(exc), "items": []}
            model_result["pages"].append(page_result)
            page_path.write_text(
                json.dumps(page_result, ensure_ascii=False, indent=2),
                encoding="utf-8",
            )
        results.append(model_result)

    summary = {
        "source_pdf": str(source_pdf),
        "page_limit": page_limit,
        "created_at": datetime.now().isoformat(timespec="seconds"),
        "summaries": [summarize_model(result) for result in results],
        "results": results,
    }
    (output_dir / "results.json").write_text(json.dumps(summary, ensure_ascii=False, indent=2), encoding="utf-8")
    write_markdown(output_dir, source_pdf, page_limit, results)

    print("\nDone.")
    print(output_dir)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
