from __future__ import annotations

import asyncio
from datetime import datetime, timezone
from pathlib import Path
from uuid import uuid4

from fastapi import FastAPI, HTTPException

from models.schemas import ExtractedItem
from pipeline.ai_extract import run_ai_extraction
from pipeline.extract_images import extract_image_pages
from pipeline.extract_pdf import extract_pdf_pages
from pipeline.generate_html import generate_preview_html
from pipeline.normalize_items import normalize_items
from pipeline.quality_check import score_quality
from pipeline.render_pdf import render_pdf_bytes
from pipeline.template_apply import apply_template
from services.logger import configure_logging, logger
from services.queue import poll_queued_jobs
from services.storage import download_source, upload_output
from services.supabase_client import get_settings, get_supabase

configure_logging()
app = FastAPI(title="Tena Forge Worker", version="1.0.0")


@app.on_event("startup")
async def start_polling() -> None:
    import os

    if os.getenv("WORKER_POLL_ENABLED", "true").lower() == "true":
        asyncio.create_task(poll_queued_jobs(process_job))


@app.get("/health")
async def health() -> dict:
    return {"ok": True, "service": "tena-forge-worker"}


@app.post("/jobs/{job_id}/process")
async def process_job_endpoint(job_id: str) -> dict:
    await process_job(job_id)
    return {"ok": True, "job_id": job_id}


async def process_job(job_id: str) -> None:
    supabase = get_supabase()
    job_response = supabase.table("jobs").select("*").eq("id", job_id).single().execute()
    job = job_response.data
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")

    if job["job_type"] == "pdf_generation":
        await process_generation_job(job)
        return

    await update_job(job_id, status="processing", progress=5, started_at=now())
    try:
        file_response = supabase.table("files").select("*").eq("id", job["source_file_id"]).single().execute()
        source_file = file_response.data
        source_path = download_source(source_file["storage_path"])
        await update_job(job_id, progress=20)

        pages = extract_pdf_pages(source_path) if source_path.suffix.lower() == ".pdf" else extract_image_pages(source_path)
        await update_job(job_id, progress=35)

        extraction = await run_ai_extraction(pages)
        items = normalize_items(extraction)
        await update_job(job_id, progress=70)

        rows = [item_to_row(item, job, source_file) for item in items]
        if rows:
            supabase.table("extracted_items").insert(rows).execute()

        quality = score_quality(items)
        preview_html = generate_preview_html(items, title=source_file["original_name"])
        output_path = upload_output(job["workspace_id"], f"preview-{job_id}.html", preview_html.encode("utf-8"), "text/html")
        output_file = supabase.table("files").insert({
            "workspace_id": job["workspace_id"],
            "user_id": job["user_id"],
            "original_name": f"preview-{source_file['original_name']}.html",
            "storage_path": output_path,
            "mime_type": "text/html",
            "size_bytes": len(preview_html.encode("utf-8")),
            "file_kind": "output",
        }).execute().data[0]
        supabase.table("outputs").insert({
            "workspace_id": job["workspace_id"],
            "job_id": job_id,
            "output_type": "html",
            "file_id": output_file["id"],
            "preview_url": output_path,
        }).execute()
        supabase.table("usage_logs").insert({
            "workspace_id": job["workspace_id"],
            "user_id": job["user_id"],
            "job_id": job_id,
            "usage_type": "document_processing",
            "pages_count": len(pages),
            "tokens_used": 0,
            "storage_mb": max(source_file.get("size_bytes", 0) / 1024 / 1024, 0),
            "cost_usd": 0,
        }).execute()
        await update_job(job_id, status="reviewing", progress=100, completed_at=now(), options={**job.get("options", {}), "quality": quality})
        logger.info("job_processed", job_id=job_id, item_count=len(items))
    except Exception as exc:
        logger.error("job_failed", job_id=job_id, error=str(exc))
        await update_job(job_id, status="failed", error_message=str(exc), completed_at=now())
        supabase.table("error_logs").insert({
            "workspace_id": job["workspace_id"],
            "job_id": job_id,
            "level": "error",
            "message": str(exc),
            "metadata": {"job_type": job["job_type"]},
        }).execute()


async def process_generation_job(job: dict) -> None:
    supabase = get_supabase()
    await update_job(job["id"], status="processing", progress=10, started_at=now())
    try:
        options = job.get("options") or {}
        item_ids = options.get("item_ids") or []
        template_id = options.get("template_id")
        if not item_ids or not template_id:
            raise ValueError("item_ids and template_id are required")
        items_response = supabase.table("extracted_items").select("*").in_("id", item_ids).execute()
        template = supabase.table("templates").select("*").eq("id", template_id).single().execute().data
        items = [ExtractedItem.model_validate({
            "item_type": row.get("item_type") or "problem",
            "source_page": row.get("source_page"),
            "content_text": row.get("content_text") or "",
            "content_html": row.get("content_html"),
            "math_latex": row.get("math_latex"),
            "images": row.get("image_paths") or [],
            "subject": row.get("subject"),
            "unit": row.get("unit"),
            "difficulty": row.get("difficulty"),
            "tags": row.get("tags") or [],
            "metadata": row.get("metadata") or {},
        }) for row in items_response.data or []]
        await update_job(job["id"], progress=55)
        html = apply_template(template["template_html"], template.get("template_css"), items, options.get("variables") or {})
        output_bytes = render_pdf_bytes(html)
        output_type = options.get("output_type") or "pdf"
        suffix = "pdf" if output_type == "pdf" else "html"
        mime = "application/pdf" if suffix == "pdf" else "text/html"
        path = upload_output(job["workspace_id"], f"output-{uuid4()}.{suffix}", output_bytes, mime)
        output_file = supabase.table("files").insert({
            "workspace_id": job["workspace_id"],
            "user_id": job["user_id"],
            "original_name": f"generated-output.{suffix}",
            "storage_path": path,
            "mime_type": mime,
            "size_bytes": len(output_bytes),
            "file_kind": "output",
        }).execute().data[0]
        supabase.table("outputs").insert({
            "workspace_id": job["workspace_id"],
            "job_id": job["id"],
            "template_id": template_id,
            "output_type": output_type,
            "file_id": output_file["id"],
            "preview_url": path,
        }).execute()
        await update_job(job["id"], status="completed", progress=100, completed_at=now())
    except Exception as exc:
        await update_job(job["id"], status="failed", error_message=str(exc), completed_at=now())
        raise


def item_to_row(item: ExtractedItem, job: dict, source_file: dict) -> dict:
    return {
        "workspace_id": job["workspace_id"],
        "job_id": job["id"],
        "source_file_id": source_file["id"],
        "source_page": item.source_page,
        "item_type": item.item_type,
        "content_text": item.content_text,
        "content_html": item.content_html,
        "math_latex": item.math_latex,
        "image_paths": item.images,
        "subject": item.subject,
        "unit": item.unit,
        "difficulty": item.difficulty,
        "tags": item.tags,
        "metadata": item.metadata,
    }


async def update_job(job_id: str, **fields) -> None:
    fields["updated_at"] = now()
    get_supabase().table("jobs").update(fields).eq("id", job_id).execute()


def now() -> str:
    return datetime.now(timezone.utc).isoformat()
