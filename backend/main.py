import os
import traceback
from datetime import datetime
from pathlib import Path

from fastapi import FastAPI, Query
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from fastapi.responses import JSONResponse
from jose import ExpiredSignatureError, JWTError
from slowapi.errors import RateLimitExceeded
from slowapi.middleware import SlowAPIMiddleware
from starlette.middleware.sessions import SessionMiddleware
from sqlalchemy import inspect, select, text

from database import Base, SessionLocal, engine, get_settings
from limiter import limiter
from models import Problem, ProblemSetItem
from routers import academy_student_app, admin_saas, archive_folders, assets, auth, batches, co_agent, creator_products, creators, dashboard_announcements, export, learning_workspace, legal_marketplace, licensed_library, live_interactions, marketplace, marketplace_products, problem_sets, problems, saas, stores, student_management, template_hub, templates, workspaces
from services.auth_security import decode_access_token, is_jti_blacklisted
from services.batch_jobs import mark_stale_processing_batches
from services.private_files import guess_media_type, static_file_path, verify_static_file_token

settings = get_settings()

app = FastAPI(title="Tena Forge API")

app.add_middleware(
    SessionMiddleware,
    secret_key=settings.secret_key,
    session_cookie="tena_oauth_session",
    same_site="lax",
    https_only=settings.refresh_cookie_secure,
)

def _origin_values(*values: str) -> set[str]:
    origins: set[str] = set()
    for value in values:
        for origin in str(value or "").split(","):
            clean = origin.strip().rstrip("/")
            if clean:
                origins.add(clean)
    return origins


allowed_origins = _origin_values(
    settings.frontend_url,
    settings.cors_origin,
    "https://tena-forge.com",
    "https://www.tena-forge.com",
    "https://tena-forge.vercel.app",
    "https://tena-forge-frontend.onrender.com",
    "http://localhost:3000",
    "http://localhost:3001",
    "http://localhost:53100",
    "http://localhost:53101",
    "http://localhost:53102",
    "http://localhost:53103",
    "http://localhost:53104",
    "http://127.0.0.1:3000",
    "http://127.0.0.1:3001",
    "http://127.0.0.1:53100",
    "http://127.0.0.1:53101",
    "http://127.0.0.1:53102",
    "http://127.0.0.1:53103",
    "http://127.0.0.1:53104",
)


def auth_error_response(request, detail, status_code=401):
    response = JSONResponse({"detail": detail}, status_code=status_code)
    add_cors_headers(request, response)
    return response


def add_cors_headers(request, response):
    origin = request.headers.get("origin")
    if origin in allowed_origins:
        response.headers["Access-Control-Allow-Origin"] = origin
        response.headers["Access-Control-Allow-Credentials"] = "true"
        response.headers["Vary"] = "Origin"
    return response


def rate_limit_error_response(request, exc):
    response = JSONResponse({"detail": "Too many requests. Please retry shortly."}, status_code=429)
    view_rate_limit = getattr(request.state, "view_rate_limit", None)
    if view_rate_limit is not None:
        response = request.app.state.limiter._inject_headers(response, view_rate_limit)
    return add_cors_headers(request, response)


async def unhandled_exception_response(request, exc):
    traceback.print_exception(type(exc), exc, exc.__traceback__)
    payload = {"detail": "Internal server error", "error_type": exc.__class__.__name__}
    if isinstance(exc, NameError):
        payload["error_message"] = str(exc)
    response = JSONResponse(payload, status_code=500)
    return add_cors_headers(request, response)


app.add_middleware(
    CORSMiddleware,
    allow_origins=sorted(origin for origin in allowed_origins if origin),
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allow_headers=["Authorization", "Content-Type", "X-Requested-With", "X-Tena-Workspace-Id", "Cache-Control", "Pragma"],
)
app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, rate_limit_error_response)
app.add_exception_handler(Exception, unhandled_exception_response)
app.add_middleware(SlowAPIMiddleware)


@app.middleware("http")
async def security_and_auth_middleware(request, call_next):
    path = request.url.path
    public_api_paths = {"/api/saas/billing/webhook"}
    if request.method != "OPTIONS" and path.startswith("/api/") and not path.startswith("/api/auth/") and path not in public_api_paths:
        authorization = request.headers.get("authorization", "")
        if not authorization.lower().startswith("bearer "):
            return auth_error_response(request, "Authentication required")
        token = authorization.split(" ", 1)[1].strip()
        try:
            payload = decode_access_token(token)
            if payload.get("type") != "access" or is_jti_blacklisted(payload.get("jti", "")):
                return auth_error_response(request, "Authentication required")
            request.state.academy_id = payload.get("sub")
        except ExpiredSignatureError:
            return auth_error_response(request, {"code": "TOKEN_EXPIRED"})
        except JWTError:
            return auth_error_response(request, "Authentication required")
    try:
        response = await call_next(request)
    except Exception as exc:
        traceback.print_exc()
        payload = {"detail": "Internal server error", "error_type": exc.__class__.__name__}
        if isinstance(exc, NameError):
            payload["error_message"] = str(exc)
        response = JSONResponse(payload, status_code=500)
        add_cors_headers(request, response)
    response.headers["X-Content-Type-Options"] = "nosniff"
    response.headers["X-Frame-Options"] = "DENY"
    response.headers["X-XSS-Protection"] = "1; mode=block"
    response.headers["Strict-Transport-Security"] = "max-age=31536000; includeSubDomains"
    response.headers["Content-Security-Policy"] = "default-src 'self'; img-src 'self' data: blob: https:; media-src 'self' data: blob: https:"
    response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"
    response.headers["Permissions-Policy"] = "camera=(self), microphone=(self), display-capture=(self), geolocation=()"
    return response


Path(settings.uploads_dir).mkdir(parents=True, exist_ok=True)


@app.get("/static/{relative_path:path}")
def private_static_file(relative_path: str, token: str | None = Query(default=None)):
    if not relative_path.startswith("announcements/"):
        verify_static_file_token(relative_path, token)
    path = static_file_path(relative_path)
    if not path.exists() or not path.is_file():
        return JSONResponse({"detail": "File not found."}, status_code=404)
    return FileResponse(path, media_type=guess_media_type(path))

app.include_router(auth.router)
app.include_router(workspaces.router)
app.include_router(live_interactions.router)
app.include_router(academy_student_app.router)
app.include_router(learning_workspace.router)
app.include_router(co_agent.router)
app.include_router(student_management.router)
app.include_router(saas.router)
app.include_router(creators.router)
app.include_router(creator_products.router)
app.include_router(marketplace_products.router)
app.include_router(admin_saas.router)
app.include_router(legal_marketplace.router)
app.include_router(dashboard_announcements.router)
app.include_router(archive_folders.router)
app.include_router(batches.router)
app.include_router(problems.router)
app.include_router(problem_sets.router)
app.include_router(templates.router)
app.include_router(template_hub.router)
app.include_router(marketplace.router)
app.include_router(licensed_library.router)
app.include_router(stores.router)
app.include_router(export.router)
app.include_router(assets.router)


@app.on_event("startup")
def create_sqlite_tables_for_local_dev():
    if settings.database_url.startswith("sqlite"):
        Base.metadata.create_all(bind=engine)
        columns = {column["name"] for column in inspect(engine).get_columns("tags")}
        if "source" not in columns:
            with engine.begin() as connection:
                connection.execute(text("ALTER TABLE tags ADD COLUMN source VARCHAR(500)"))
                connection.execute(text("CREATE INDEX IF NOT EXISTS ix_tags_source ON tags (source)"))
        template_columns = {column["name"] for column in inspect(engine).get_columns("exam_templates")}
        if "canvas_json" not in template_columns:
            with engine.begin() as connection:
                connection.execute(text("ALTER TABLE exam_templates ADD COLUMN canvas_json JSON"))
        template_columns = {column["name"] for column in inspect(engine).get_columns("exam_templates")}
        if "updated_at" not in template_columns:
            with engine.begin() as connection:
                connection.execute(text("ALTER TABLE exam_templates ADD COLUMN updated_at DATETIME"))
                connection.execute(text("UPDATE exam_templates SET updated_at = created_at WHERE updated_at IS NULL"))
        _ensure_sqlite_columns()
        _seed_saas_foundation()
        _seed_admin_templates()
        _mark_interrupted_batches()
        _purge_expired_trashed_problems()


@app.on_event("startup")
def repair_production_schema_and_admin():
    if settings.database_url.startswith("sqlite"):
        return
    from scripts.ensure_admin_account import main as ensure_admin_account
    from scripts.ensure_admin_templates import main as ensure_admin_templates
    from scripts.ensure_pg_review_account import main as ensure_pg_review_account
    from scripts.ensure_student_test_account import main as ensure_student_test_account
    from scripts.ensure_workspace_test_accounts import main as ensure_workspace_test_accounts
    from scripts.repair_alembic_version import main as repair_alembic_version

    repair_alembic_version()
    ensure_admin_account()
    ensure_admin_templates()
    ensure_pg_review_account()
    ensure_workspace_test_accounts()
    ensure_student_test_account()
    _mark_interrupted_batches()
    print("Production schema repair, admin/test bootstrap, and template seed completed.", flush=True)


@app.get("/health")
def health():
    return {"ok": True}


@app.get("/health/db")
def health_db():
    try:
        from scripts.ensure_admin_account import ADMIN_EMAIL
        from scripts.repair_alembic_version import (
            ACADEMY_REQUIRED_COLUMNS,
            ACADEMY_SEAT_REQUIRED_COLUMNS,
            ACADEMY_STAFF_INVITE_CODE_REQUIRED_COLUMNS,
            ACADEMY_STAFF_MEMBERSHIP_REQUIRED_COLUMNS,
            ACADEMY_STUDENT_SUBSCRIPTION_REQUIRED_COLUMNS,
            ACADEMY_WORKSPACE_SETTINGS_REQUIRED_COLUMNS,
            BATCH_REQUIRED_COLUMNS,
            CLASS_SCHEDULE_EVENT_REQUIRED_COLUMNS,
            KOREAN_PASSAGE_GROUP_REQUIRED_COLUMNS,
            PROBLEM_REQUIRED_COLUMNS,
            SUBJECT_ENGINE_COLUMNS,
        )

        inspector = inspect(engine)
        tables = set(inspector.get_table_names())
        required_tables = {
            "academies",
            "plans",
            "subscriptions",
            "user_roles",
            "archive_folders",
            "batches",
            "problems",
            "problem_sets",
            "student_academy_memberships",
            "academy_classes",
            "academy_seats",
            "academy_student_subscriptions",
            "academy_staff_memberships",
            "academy_staff_invite_codes",
            "academy_workspace_settings",
            "content_versions",
            "archive_access_grants",
            "learning_assignments",
            "learning_assignment_targets",
            "learning_submissions",
            "problem_attempts",
            "wrong_answer_records",
            "student_personal_sets",
            "student_personal_set_items",
            "paper_sessions",
            "paper_session_results",
            "problem_results",
            "class_schedule_events",
            "korean_extraction_documents",
            "korean_passage_groups",
            "korean_questions",
            "subscription_orders",
            "subscription_billing_keys",
            "subscription_payment_attempts",
            "routine_actions",
            "routine_messages",
            "problem_usage_history",
            "student_tuition_payments",
            "student_tuition_session_adjustments",
            "student_invites",
        }
        academy_columns = {column["name"] for column in inspector.get_columns("academies")} if "academies" in tables else set()
        batch_columns = {column["name"] for column in inspector.get_columns("batches")} if "batches" in tables else set()
        problem_columns = {column["name"] for column in inspector.get_columns("problems")} if "problems" in tables else set()
        academy_seat_columns = {column["name"] for column in inspector.get_columns("academy_seats")} if "academy_seats" in tables else set()
        academy_student_subscription_columns = {column["name"] for column in inspector.get_columns("academy_student_subscriptions")} if "academy_student_subscriptions" in tables else set()
        academy_staff_membership_columns = {column["name"] for column in inspector.get_columns("academy_staff_memberships")} if "academy_staff_memberships" in tables else set()
        academy_staff_invite_code_columns = {column["name"] for column in inspector.get_columns("academy_staff_invite_codes")} if "academy_staff_invite_codes" in tables else set()
        academy_workspace_settings_columns = {column["name"] for column in inspector.get_columns("academy_workspace_settings")} if "academy_workspace_settings" in tables else set()
        korean_passage_group_columns = {column["name"] for column in inspector.get_columns("korean_passage_groups")} if "korean_passage_groups" in tables else set()
        class_schedule_event_columns = {column["name"] for column in inspector.get_columns("class_schedule_events")} if "class_schedule_events" in tables else set()
        plan_columns = {column["name"] for column in inspector.get_columns("plans")} if "plans" in tables else set()
        subscription_columns = {column["name"] for column in inspector.get_columns("subscriptions")} if "subscriptions" in tables else set()
        missing_tables = sorted(required_tables - tables)
        missing_academy_columns = sorted(ACADEMY_REQUIRED_COLUMNS - academy_columns)
        missing_batch_columns = sorted(BATCH_REQUIRED_COLUMNS - batch_columns)
        missing_problem_columns = sorted(PROBLEM_REQUIRED_COLUMNS - problem_columns)
        missing_academy_seat_columns = sorted(ACADEMY_SEAT_REQUIRED_COLUMNS - academy_seat_columns)
        missing_academy_student_subscription_columns = sorted(ACADEMY_STUDENT_SUBSCRIPTION_REQUIRED_COLUMNS - academy_student_subscription_columns)
        missing_academy_staff_membership_columns = sorted(ACADEMY_STAFF_MEMBERSHIP_REQUIRED_COLUMNS - academy_staff_membership_columns)
        missing_academy_staff_invite_code_columns = sorted(ACADEMY_STAFF_INVITE_CODE_REQUIRED_COLUMNS - academy_staff_invite_code_columns)
        missing_academy_workspace_settings_columns = sorted(ACADEMY_WORKSPACE_SETTINGS_REQUIRED_COLUMNS - academy_workspace_settings_columns)
        missing_korean_passage_group_columns = sorted(KOREAN_PASSAGE_GROUP_REQUIRED_COLUMNS - korean_passage_group_columns)
        missing_class_schedule_event_columns = sorted(CLASS_SCHEDULE_EVENT_REQUIRED_COLUMNS - class_schedule_event_columns)
        missing_plan_columns = sorted(SUBJECT_ENGINE_COLUMNS - plan_columns)
        missing_subscription_columns = sorted(SUBJECT_ENGINE_COLUMNS - subscription_columns)
        alembic_versions = []
        admin_exists = None
        if "alembic_version" in tables:
            with engine.begin() as connection:
                alembic_versions = [row[0] for row in connection.execute(text("SELECT version_num FROM alembic_version ORDER BY version_num")).all()]
        if {"academies"}.issubset(tables) and {"email", "password_hash"}.issubset(academy_columns):
            with engine.begin() as connection:
                admin_exists = bool(
                    connection.execute(
                        text("SELECT 1 FROM academies WHERE email = :email LIMIT 1"),
                        {"email": ADMIN_EMAIL},
                    ).first()
                )
        return {
            "ok": not any(
                [
                    missing_tables,
                    missing_academy_columns,
                    missing_batch_columns,
                    missing_problem_columns,
                    missing_academy_seat_columns,
                    missing_academy_student_subscription_columns,
                    missing_academy_staff_membership_columns,
                    missing_academy_staff_invite_code_columns,
                    missing_academy_workspace_settings_columns,
                    missing_korean_passage_group_columns,
                    missing_class_schedule_event_columns,
                    missing_plan_columns,
                    missing_subscription_columns,
                ]
            ),
            "commit": (os.getenv("RENDER_GIT_COMMIT") or "unknown")[:7],
            "admin_email": ADMIN_EMAIL,
            "admin_exists": admin_exists,
            "bootstrap_password_configured": bool(os.getenv("BOOTSTRAP_ADMIN_PASSWORD")),
            "alembic_versions": alembic_versions,
            "missing_tables": missing_tables,
            "missing_academy_columns": missing_academy_columns,
            "missing_batch_columns": missing_batch_columns,
            "missing_problem_columns": missing_problem_columns,
            "missing_academy_seat_columns": missing_academy_seat_columns,
            "missing_academy_student_subscription_columns": missing_academy_student_subscription_columns,
            "missing_academy_staff_membership_columns": missing_academy_staff_membership_columns,
            "missing_academy_staff_invite_code_columns": missing_academy_staff_invite_code_columns,
            "missing_academy_workspace_settings_columns": missing_academy_workspace_settings_columns,
            "missing_korean_passage_group_columns": missing_korean_passage_group_columns,
            "missing_class_schedule_event_columns": missing_class_schedule_event_columns,
            "missing_plan_columns": missing_plan_columns,
            "missing_subscription_columns": missing_subscription_columns,
        }
    except Exception as exc:
        return JSONResponse(
            {
                "ok": False,
                "commit": (os.getenv("RENDER_GIT_COMMIT") or "unknown")[:7],
                "error_type": exc.__class__.__name__,
                "error": str(exc),
            },
            status_code=500,
        )


def _ensure_sqlite_columns():
    column_specs = {
        "batches": {
            "source_type": "VARCHAR(40) DEFAULT 'self_created' NOT NULL",
            "source_label": "VARCHAR(255)",
            "rights_confirmed": "BOOLEAN DEFAULT 0 NOT NULL",
            "rights_confirmed_at": "DATETIME",
            "rights_note": "TEXT",
            "accent_color": "VARCHAR(7)",
            "subject_candidates": "JSON DEFAULT '[]' NOT NULL",
            "unit_candidates": "JSON DEFAULT '[]' NOT NULL",
            "document_type_hints": "JSON DEFAULT '[]' NOT NULL",
            "archive_folder_id": "CHAR(36)",
            "subject_engine": "VARCHAR(30) DEFAULT 'math' NOT NULL",
            "processing_task": "VARCHAR(30) DEFAULT 'full' NOT NULL",
            "owner_id": "VARCHAR(64) DEFAULT 'local_user' NOT NULL",
            "academy_id": "VARCHAR(64)",
            "progress_message": "VARCHAR(500)",
            "progress_current": "INTEGER",
            "progress_total": "INTEGER",
            "progress_started_at": "DATETIME",
            "progress_updated_at": "DATETIME",
            "failure_stage": "VARCHAR(500)",
            "failure_reason": "TEXT",
            "failure_hint": "TEXT",
            "failed_at": "DATETIME",
        },
        "archive_folders": {
            "subject_engine": "VARCHAR(30) DEFAULT 'math' NOT NULL",
        },
        "problems": {
            "source_type": "VARCHAR(40) DEFAULT 'self_created' NOT NULL",
            "source_label": "VARCHAR(255)",
            "rights_confirmed": "BOOLEAN DEFAULT 0 NOT NULL",
            "rights_confirmed_at": "DATETIME",
            "rights_note": "TEXT",
            "visibility": "VARCHAR(32) DEFAULT 'private' NOT NULL",
            "origin_type": "VARCHAR(32) DEFAULT 'owned' NOT NULL",
            "owner_id": "VARCHAR(64) DEFAULT 'local_user' NOT NULL",
            "academy_id": "VARCHAR(64)",
            "updated_at": "DATETIME",
            "review_page_image_url": "VARCHAR(1000)",
            "review_page_number": "INTEGER",
            "visual_schema": "JSON",
            "math_model": "JSON",
            "choices": "JSON DEFAULT '[]' NOT NULL",
            "deleted_at": "DATETIME",
            "delete_scheduled_at": "DATETIME",
        },
        "korean_passage_groups": {
            "needs_review": "BOOLEAN DEFAULT 1 NOT NULL",
        },
        "academies": {
            "account_type": "VARCHAR(20) DEFAULT 'academy' NOT NULL",
            "display_name": "VARCHAR(120)",
            "profile_name": "VARCHAR(32)",
            "bio": "TEXT",
        },
        "class_schedule_events": {
            "counts_for_tuition": "BOOLEAN DEFAULT 1 NOT NULL",
            "metadata": "JSON DEFAULT '{}' NOT NULL",
        },
        "academy_seats": {
            "invite_metadata": "JSON DEFAULT '{}' NOT NULL",
        },
        "academy_student_subscriptions": {
            "purchased_staff_seats": "INTEGER DEFAULT 0 NOT NULL",
        },
        "academy_staff_memberships": {
            "can_manage_students": "BOOLEAN DEFAULT 1 NOT NULL",
            "can_manage_schedule": "BOOLEAN DEFAULT 1 NOT NULL",
            "can_manage_coagent": "BOOLEAN DEFAULT 0 NOT NULL",
        },
        "academy_staff_invite_codes": {
            "assigned_class_ids": "JSON DEFAULT '[]' NOT NULL",
        },
        "academy_workspace_settings": {
            "live_start_lead_minutes": "INTEGER DEFAULT 5 NOT NULL",
        },
        "problem_sets": {
            "owner_id": "VARCHAR(64) DEFAULT 'local_user' NOT NULL",
            "academy_id": "VARCHAR(64)",
            "subtitle": "VARCHAR(255)",
            "description": "TEXT",
            "subject": "VARCHAR(120)",
            "grade": "VARCHAR(120)",
            "unit": "VARCHAR(255)",
            "difficulty": "VARCHAR(40)",
            "problem_count": "INTEGER DEFAULT 0 NOT NULL",
            "visibility": "VARCHAR(32) DEFAULT 'private' NOT NULL",
            "source_type": "VARCHAR(40) DEFAULT 'self_created' NOT NULL",
            "rights_confirmed": "BOOLEAN DEFAULT 0 NOT NULL",
            "can_publish_to_marketplace": "BOOLEAN DEFAULT 0 NOT NULL",
            "thumbnail_url": "VARCHAR(1000)",
            "preview_problem_ids": "JSON",
        },
        "template_hub_templates": {
            "academy_id": "VARCHAR(64)",
            "source_type": "VARCHAR(40) DEFAULT 'self_created' NOT NULL",
            "rights_confirmed": "BOOLEAN DEFAULT 0 NOT NULL",
            "rights_confirmed_at": "DATETIME",
        },
        "plans": {
            "enabled_subject_engines": "JSON DEFAULT '[\"math\"]' NOT NULL",
            "subject_engine_count": "INTEGER DEFAULT 1 NOT NULL",
            "subject_multiplier": "NUMERIC DEFAULT 1 NOT NULL",
            "final_monthly_price": "INTEGER DEFAULT 0 NOT NULL",
            "final_annual_price": "INTEGER DEFAULT 0 NOT NULL",
        },
        "subscriptions": {
            "enabled_subject_engines": "JSON DEFAULT '[\"math\"]' NOT NULL",
            "subject_engine_count": "INTEGER DEFAULT 1 NOT NULL",
            "subject_multiplier": "NUMERIC DEFAULT 1 NOT NULL",
            "final_monthly_price": "INTEGER DEFAULT 0 NOT NULL",
            "final_annual_price": "INTEGER DEFAULT 0 NOT NULL",
        },
    }
    with engine.begin() as connection:
        for table_name, specs in column_specs.items():
            existing = {row[1] for row in connection.execute(text(f"PRAGMA table_info({table_name})")).fetchall()}
            for column_name, sql_type in specs.items():
                if column_name not in existing:
                    connection.execute(text(f"ALTER TABLE {table_name} ADD COLUMN {column_name} {sql_type}"))
                    existing.add(column_name)
        academy_columns = {row[1] for row in connection.execute(text("PRAGMA table_info(academies)")).fetchall()}
        if "profile_name" in academy_columns:
            from services.profile_names import profile_name_seed, unique_profile_name_seed

            rows = connection.execute(text("SELECT id, email, display_name, academy_name, profile_name FROM academies")).mappings().all()
            used = {str(row["profile_name"]).lower() for row in rows if row["profile_name"]}
            for row in rows:
                if row["profile_name"]:
                    continue
                email_local = str(row["email"] or "").split("@", 1)[0]
                seed = profile_name_seed(row["display_name"], row["academy_name"], email_local)
                profile_name = unique_profile_name_seed(seed, str(row["id"]), used)
                connection.execute(
                    text("UPDATE academies SET profile_name = :profile_name WHERE id = :id"),
                    {"profile_name": profile_name, "id": row["id"]},
                )
            connection.execute(text("CREATE UNIQUE INDEX IF NOT EXISTS ix_academies_profile_name ON academies (profile_name)"))


def _mark_interrupted_batches():
    db = SessionLocal()
    try:
        if mark_stale_processing_batches(db):
            db.commit()
    finally:
        db.close()


def _purge_expired_trashed_problems():
    db = SessionLocal()
    try:
        expired = db.query(Problem).filter(
            Problem.delete_scheduled_at.is_not(None),
            Problem.delete_scheduled_at <= datetime.utcnow(),
        ).all()
        for problem in expired:
            db.query(ProblemSetItem).filter(ProblemSetItem.problem_id == problem.id).delete(synchronize_session=False)
            db.delete(problem)
        if expired:
            db.commit()
    finally:
        db.close()


def _seed_admin_templates():
    from scripts.ensure_admin_templates import main as ensure_admin_templates

    ensure_admin_templates()


def _seed_saas_foundation():
    from models import (
        Academy,
        AcademyPlan,
        CreatorBalanceLedger,
        CreatorProfile,
        MarketplaceOrder,
        MarketplaceOrderItem,
        Plan,
        PlatformSetting,
        Product,
        ProductLicense,
        ProductLicenseTier,
        ProductVersion,
        UserRole,
    )
    from services.auth_security import hash_password

    db = SessionLocal()
    try:
        default_plans = [
            ("free", "Free", 0, 0, 0, 0, 0),
            ("basic_local", "Basic Local", 48000, 100, 1000, 20480, 5000000),
            ("basic_cloud", "Basic Cloud", 79000, 100, 1000, 20480, 5000000),
            ("pro", "Pro", 108000, 100, 1000, 5120, 5000000),
            ("pro_cloud", "Pro Cloud", 157000, 500, 10000, 51200, 50000000),
            ("team", "Team", 99000, 500, 10000, 51200, 50000000),
            ("enterprise", "Enterprise", 0, 999999, 999999, 999999, 999999999),
        ]
        for code, name, price, uploads, pages, storage, tokens in default_plans:
            plan = db.scalar(select(Plan).where(Plan.code == code))
            if not plan:
                db.add(Plan(code=code, name=name, monthly_price=price, monthly_upload_count=uploads, monthly_processed_pages=pages, storage_quota_mb=storage, monthly_ai_tokens=tokens))
            else:
                plan.name = name
                plan.monthly_price = price
                if code == "free":
                    plan.monthly_upload_count = uploads
                    plan.monthly_processed_pages = pages
                    plan.storage_quota_mb = storage
                    plan.monthly_ai_tokens = tokens
        if not db.get(PlatformSetting, "marketplace"):
            db.add(PlatformSetting(key="marketplace", value={"default_commission_rate": 0.10, "payout_period": "monthly", "minimum_product_price": 0}))
        admin = db.scalar(select(Academy).where(Academy.email == "admin@tenaforge.com"))
        if not admin:
            admin = Academy(
                email="admin@tenaforge.com",
                password_hash=hash_password("AdminTest!2026"),
                academy_name="Tena Admin",
                display_name="Tena Admin",
                profile_name="tena_admin",
                email_verified=True,
                email_verified_at=datetime.utcnow(),
                is_active=True,
                plan=AcademyPlan.pro,
            )
            db.add(admin)
            db.flush()
        else:
            admin.password_hash = hash_password("AdminTest!2026")
            admin.email_verified = True
            admin.email_verified_at = admin.email_verified_at or datetime.utcnow()
            admin.is_active = True
            admin.profile_name = admin.profile_name or "tena_admin"
        if admin and not db.scalar(select(UserRole).where(UserRole.user_id == str(admin.id), UserRole.role == "admin")):
            db.add(UserRole(user_id=str(admin.id), role="admin", granted_by="seed"))
        normal_user = db.scalar(select(Academy).where(Academy.email == "user@tenaforge.com"))
        if not normal_user:
            normal_user = Academy(
                email="user@tenaforge.com",
                profile_name="tena_user",
                password_hash=hash_password("UserTest!2026"),
                academy_name="일반 사용자",
                email_verified=True,
                email_verified_at=datetime.utcnow(),
                is_active=True,
                plan=AcademyPlan.basic,
            )
            db.add(normal_user)
        else:
            normal_user.password_hash = hash_password("UserTest!2026")
            normal_user.email_verified = True
            normal_user.email_verified_at = normal_user.email_verified_at or datetime.utcnow()
            normal_user.is_active = True
            normal_user.profile_name = normal_user.profile_name or "tena_user"
        creator_user = db.scalar(select(Academy).where(Academy.email == "creator@tenaforge.com"))
        if not creator_user:
            creator_user = Academy(email="creator@tenaforge.com", password_hash=hash_password("CreatorTest!2026"), academy_name="샘플 크리에이터", email_verified=True, email_verified_at=datetime.utcnow(), is_active=True)
            creator_user.profile_name = "tena_creator"
            db.add(creator_user)
            db.flush()
        else:
            creator_user.password_hash = hash_password("CreatorTest!2026")
            creator_user.email_verified = True
            creator_user.email_verified_at = creator_user.email_verified_at or datetime.utcnow()
            creator_user.is_active = True
            creator_user.profile_name = creator_user.profile_name or "tena_creator"
        creator_id = str(creator_user.id)
        if not db.scalar(select(UserRole).where(UserRole.user_id == creator_id, UserRole.role == "creator")):
            db.add(UserRole(user_id=creator_id, role="creator", granted_by="seed"))
        if not db.scalar(select(CreatorProfile).where(CreatorProfile.owner_id == creator_id)):
            db.add(CreatorProfile(owner_id=creator_id, display_name="Tena Math Lab", slug="tena-math-lab", bio="검토된 수학 모의고사와 문제 세트를 제작합니다.", verified_status="verified", specialties=["수학", "모의고사"]))
        product = db.scalar(select(Product).where(Product.slug == "sample-math-mock-exam"))
        if not product:
            product = Product(creator_id=creator_id, title="고1 수학 모의고사 샘플", slug="sample-math-mock-exam", description="검토된 고1 수학 모의고사 PDF와 문항 패키지 샘플입니다.", subject="수학", grade_level="고1", curriculum="공통수학", unit_tags=["이차함수", "방정식"], difficulty="중", question_count=20, exam_type="모의고사", price=0, status="published", rights_declared=True, published_at=datetime.utcnow())
            db.add(product)
            db.flush()
            version = ProductVersion(product_id=product.id, version_number=1, changelog="초기 샘플 버전", status="approved")
            db.add(version)
            db.flush()
            tier = ProductLicenseTier(product_id=product.id, code="personal_tutor", name="개인 강사용", price=0, allowed_students_count=30, allowed_print_count=100, allowed_branches_count=1, commercial_use_allowed=True, redistribution_allowed=False, license_terms_text="구매자 본인의 수업에서만 사용할 수 있으며 재배포는 금지됩니다.")
            db.add(tier)
        db.commit()
    finally:
        db.close()
