from __future__ import annotations

import json
import os
from datetime import datetime
from pathlib import Path
import sys
from uuid import UUID

from sqlalchemy import select

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from database import SessionLocal
from models import Academy, HubTemplate


ADMIN_EMAIL = os.getenv("BOOTSTRAP_ADMIN_EMAIL", "admin@tenaforge.com").strip().lower()
SEED_DIR = Path(__file__).resolve().parents[1] / "seed_data" / "template_hub"


def _load_seed_templates() -> list[dict]:
    if not SEED_DIR.exists():
        return []
    templates = []
    for path in sorted(SEED_DIR.glob("*.json")):
        templates.append(json.loads(path.read_text(encoding="utf-8")))
    return templates


def _find_existing_template(db, seed: dict) -> HubTemplate | None:
    seed_id = seed.get("id")
    if seed_id:
        try:
            existing = db.get(HubTemplate, UUID(seed_id))
            if existing:
                return existing
        except ValueError:
            pass
    title = str(seed.get("title") or "").strip()
    if title:
        return db.scalar(select(HubTemplate).where(HubTemplate.title == title))
    return None


def _upsert_template(db, admin: Academy, seed: dict) -> str:
    now = datetime.utcnow()
    template = _find_existing_template(db, seed)
    created = template is None
    if created:
        template = HubTemplate()
        if seed.get("id"):
            template.id = UUID(seed["id"])
        template.created_at = now
        db.add(template)

    template.owner_id = str(admin.id)
    template.academy_id = None
    template.title = str(seed["title"]).strip()
    template.description = seed.get("description")
    template.category = seed.get("category") or "exam"
    template.visibility = "private"
    template.html = seed.get("html") or "<!-- Visual Template Studio: render from schema_json.visualTemplateSet -->"
    template.css = seed.get("css") or ""
    template.schema_json = seed.get("schema_json")
    template.thumbnail_url = seed.get("thumbnail_url")
    template.source_type = seed.get("source_type") or "self_created"
    template.rights_confirmed = bool(seed.get("rights_confirmed"))
    template.rights_confirmed_at = now if template.rights_confirmed else None
    template.updated_at = now
    return "created" if created else "updated"


def main() -> None:
    seeds = _load_seed_templates()
    if not seeds:
        print("No admin template seeds found.")
        return

    db = SessionLocal()
    try:
        admin = db.scalar(select(Academy).where(Academy.email == ADMIN_EMAIL))
        if not admin:
            print(f"Skipping admin template seeds: admin account not found ({ADMIN_EMAIL}).")
            return

        for seed in seeds:
            action = _upsert_template(db, admin, seed)
            print(f"{action.capitalize()} admin-only template: {seed.get('title')}")
        db.commit()
    finally:
        db.close()


if __name__ == "__main__":
    main()
