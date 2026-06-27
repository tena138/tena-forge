import enum
import uuid
from datetime import datetime

from sqlalchemy import Boolean, CHAR, DateTime, Enum, ForeignKey, Integer, JSON, Numeric, String, Text, UniqueConstraint
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.dialects.postgresql import UUID as PG_UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship
from sqlalchemy.types import TypeDecorator

from database import Base


class GUID(TypeDecorator):
    impl = CHAR
    cache_ok = True

    def load_dialect_impl(self, dialect):
        if dialect.name == "postgresql":
            return dialect.type_descriptor(PG_UUID(as_uuid=True))
        return dialect.type_descriptor(CHAR(36))

    def process_bind_param(self, value, dialect):
        if value is None:
            return value
        if dialect.name == "postgresql":
            return value
        return str(value)

    def process_result_value(self, value, dialect):
        if value is None:
            return value
        return value if isinstance(value, uuid.UUID) else uuid.UUID(str(value))


class BatchStatus(str, enum.Enum):
    pending = "pending"
    processing = "processing"
    done = "done"
    error = "error"


class AcademyPlan(str, enum.Enum):
    free = "free"
    basic = "basic"
    pro = "pro"
    enterprise = "enterprise"


class OAuthProvider(str, enum.Enum):
    google = "google"
    kakao = "kakao"
    naver = "naver"


class DashboardAnnouncement(Base):
    __tablename__ = "dashboard_announcements"

    id: Mapped[uuid.UUID] = mapped_column(GUID(), primary_key=True, default=uuid.uuid4)
    eyebrow: Mapped[str | None] = mapped_column(String(80), nullable=True)
    title: Mapped[str] = mapped_column(String(255), nullable=False)
    body: Mapped[str | None] = mapped_column(Text, nullable=True)
    badge: Mapped[str | None] = mapped_column(String(80), nullable=True)
    cta_label: Mapped[str | None] = mapped_column(String(80), nullable=True)
    cta_href: Mapped[str | None] = mapped_column(String(500), nullable=True)
    secondary_label: Mapped[str | None] = mapped_column(String(80), nullable=True)
    secondary_href: Mapped[str | None] = mapped_column(String(500), nullable=True)
    media_type: Mapped[str] = mapped_column(String(20), default="none", nullable=False)
    media_url: Mapped[str | None] = mapped_column(String(1000), nullable=True)
    media_alt: Mapped[str | None] = mapped_column(String(255), nullable=True)
    theme: Mapped[str] = mapped_column(String(40), default="product", nullable=False)
    priority: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    starts_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    ends_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    created_by: Mapped[str | None] = mapped_column(String(64), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False)


class Academy(Base):
    __tablename__ = "academies"

    id: Mapped[uuid.UUID] = mapped_column(GUID(), primary_key=True, default=uuid.uuid4)
    email: Mapped[str] = mapped_column(String(320), unique=True, nullable=False, index=True)
    email_verified: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    email_verified_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    password_hash: Mapped[str | None] = mapped_column(String(255), nullable=True)
    academy_name: Mapped[str] = mapped_column(String(255), nullable=False)
    display_name: Mapped[str | None] = mapped_column(String(120), nullable=True)
    bio: Mapped[str | None] = mapped_column(Text, nullable=True)
    account_type: Mapped[str] = mapped_column(String(20), default="academy", nullable=False, index=True)
    business_number: Mapped[str | None] = mapped_column(String(50), nullable=True)
    phone: Mapped[str | None] = mapped_column(String(50), nullable=True)
    address: Mapped[str | None] = mapped_column(String(500), nullable=True)
    plan: Mapped[AcademyPlan] = mapped_column(Enum(AcademyPlan, name="academy_plan"), default=AcademyPlan.free, nullable=False)
    plan_expires_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    is_suspended: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    suspension_reason: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False)
    last_login_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    last_login_ip: Mapped[str | None] = mapped_column(String(64), nullable=True)
    failed_login_attempts: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    locked_until: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)

    oauth_accounts: Mapped[list["OAuthAccount"]] = relationship("OAuthAccount", back_populates="academy", cascade="all, delete-orphan")
    refresh_tokens: Mapped[list["RefreshToken"]] = relationship("RefreshToken", back_populates="academy", cascade="all, delete-orphan")
    email_verifications: Mapped[list["EmailVerification"]] = relationship("EmailVerification", back_populates="academy", cascade="all, delete-orphan")
    password_reset_tokens: Mapped[list["PasswordResetToken"]] = relationship("PasswordResetToken", back_populates="academy", cascade="all, delete-orphan")
    login_history: Mapped[list["LoginHistory"]] = relationship("LoginHistory", back_populates="academy", cascade="all, delete-orphan")
    active_sessions: Mapped[list["ActiveSession"]] = relationship("ActiveSession", back_populates="academy", cascade="all, delete-orphan")
    totp_secret: Mapped["TotpSecret | None"] = relationship("TotpSecret", back_populates="academy", cascade="all, delete-orphan", uselist=False)

    @property
    def totp_enabled(self) -> bool:
        return bool(self.totp_secret and self.totp_secret.enabled)

    @property
    def totp_enabled_at(self) -> datetime | None:
        return self.totp_secret.enabled_at if self.totp_secret and self.totp_secret.enabled else None

    @property
    def trial_ends_at(self) -> datetime | None:
        return self.plan_expires_at if self.account_type == "academy" else None

    @property
    def requires_payment(self) -> bool:
        return bool(self.account_type == "academy" and self.plan_expires_at and self.plan_expires_at <= datetime.utcnow())


class OAuthAccount(Base):
    __tablename__ = "oauth_accounts"
    __table_args__ = (UniqueConstraint("provider", "provider_account_id", name="uq_oauth_provider_account"),)

    id: Mapped[uuid.UUID] = mapped_column(GUID(), primary_key=True, default=uuid.uuid4)
    academy_id: Mapped[uuid.UUID] = mapped_column(GUID(), ForeignKey("academies.id", ondelete="CASCADE"), nullable=False, index=True)
    provider: Mapped[OAuthProvider] = mapped_column(Enum(OAuthProvider, name="oauth_provider"), nullable=False)
    provider_account_id: Mapped[str] = mapped_column(String(255), nullable=False)
    provider_email: Mapped[str | None] = mapped_column(String(320), nullable=True)
    access_token: Mapped[str] = mapped_column(Text, nullable=False)
    refresh_token: Mapped[str | None] = mapped_column(Text, nullable=True)
    token_expires_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, nullable=False)

    academy: Mapped[Academy] = relationship("Academy", back_populates="oauth_accounts")


class RefreshToken(Base):
    __tablename__ = "refresh_tokens"

    id: Mapped[uuid.UUID] = mapped_column(GUID(), primary_key=True, default=uuid.uuid4)
    academy_id: Mapped[uuid.UUID] = mapped_column(GUID(), ForeignKey("academies.id", ondelete="CASCADE"), nullable=False, index=True)
    token_hash: Mapped[str] = mapped_column(String(255), nullable=False, index=True)
    device_info: Mapped[str | None] = mapped_column(String(500), nullable=True)
    ip_address: Mapped[str] = mapped_column(String(64), nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, nullable=False)
    expires_at: Mapped[datetime] = mapped_column(DateTime, nullable=False)
    revoked_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    revoked_reason: Mapped[str | None] = mapped_column(String(255), nullable=True)

    academy: Mapped[Academy] = relationship("Academy", back_populates="refresh_tokens")
    active_session: Mapped["ActiveSession | None"] = relationship("ActiveSession", back_populates="refresh_token", cascade="all, delete-orphan", uselist=False)


class EmailVerification(Base):
    __tablename__ = "email_verifications"

    id: Mapped[uuid.UUID] = mapped_column(GUID(), primary_key=True, default=uuid.uuid4)
    academy_id: Mapped[uuid.UUID] = mapped_column(GUID(), ForeignKey("academies.id", ondelete="CASCADE"), nullable=False, index=True)
    token_hash: Mapped[str] = mapped_column(String(64), nullable=False, index=True)
    expires_at: Mapped[datetime] = mapped_column(DateTime, nullable=False)
    used_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)

    academy: Mapped[Academy] = relationship("Academy", back_populates="email_verifications")


class PasswordResetToken(Base):
    __tablename__ = "password_reset_tokens"

    id: Mapped[uuid.UUID] = mapped_column(GUID(), primary_key=True, default=uuid.uuid4)
    academy_id: Mapped[uuid.UUID] = mapped_column(GUID(), ForeignKey("academies.id", ondelete="CASCADE"), nullable=False, index=True)
    token_hash: Mapped[str] = mapped_column(String(64), nullable=False, index=True)
    expires_at: Mapped[datetime] = mapped_column(DateTime, nullable=False)
    used_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    ip_address: Mapped[str] = mapped_column(String(64), nullable=False)

    academy: Mapped[Academy] = relationship("Academy", back_populates="password_reset_tokens")


class LoginHistory(Base):
    __tablename__ = "login_history"

    id: Mapped[uuid.UUID] = mapped_column(GUID(), primary_key=True, default=uuid.uuid4)
    academy_id: Mapped[uuid.UUID | None] = mapped_column(GUID(), ForeignKey("academies.id", ondelete="CASCADE"), nullable=True, index=True)
    ip_address: Mapped[str] = mapped_column(String(64), nullable=False)
    user_agent: Mapped[str] = mapped_column(Text, nullable=False)
    device_type: Mapped[str] = mapped_column(String(32), nullable=False)
    os: Mapped[str] = mapped_column(String(128), nullable=False)
    browser: Mapped[str] = mapped_column(String(128), nullable=False)
    country: Mapped[str | None] = mapped_column(String(128), nullable=True)
    login_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, nullable=False)
    success: Mapped[bool] = mapped_column(Boolean, nullable=False)
    failure_reason: Mapped[str | None] = mapped_column(String(255), nullable=True)
    provider: Mapped[str] = mapped_column(String(32), nullable=False)

    academy: Mapped[Academy | None] = relationship("Academy", back_populates="login_history")


class ActiveSession(Base):
    __tablename__ = "active_sessions"

    id: Mapped[uuid.UUID] = mapped_column(GUID(), primary_key=True, default=uuid.uuid4)
    academy_id: Mapped[uuid.UUID] = mapped_column(GUID(), ForeignKey("academies.id", ondelete="CASCADE"), nullable=False, index=True)
    refresh_token_id: Mapped[uuid.UUID] = mapped_column(GUID(), ForeignKey("refresh_tokens.id", ondelete="CASCADE"), nullable=False, index=True)
    device_fingerprint: Mapped[str] = mapped_column(String(128), nullable=False)
    last_active_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, nullable=False)

    academy: Mapped[Academy] = relationship("Academy", back_populates="active_sessions")
    refresh_token: Mapped[RefreshToken] = relationship("RefreshToken", back_populates="active_session")


class TotpSecret(Base):
    __tablename__ = "totp_secrets"

    id: Mapped[uuid.UUID] = mapped_column(GUID(), primary_key=True, default=uuid.uuid4)
    academy_id: Mapped[uuid.UUID] = mapped_column(GUID(), ForeignKey("academies.id", ondelete="CASCADE"), unique=True, nullable=False, index=True)
    secret_encrypted: Mapped[str] = mapped_column(Text, nullable=False)
    enabled: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    enabled_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    backup_codes: Mapped[list] = mapped_column(JSON().with_variant(JSONB, "postgresql"), default=list, nullable=False)

    academy: Mapped[Academy] = relationship("Academy", back_populates="totp_secret")


class Batch(Base):
    __tablename__ = "batches"

    id: Mapped[uuid.UUID] = mapped_column(GUID(), primary_key=True, default=uuid.uuid4)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    problem_pdf_filename: Mapped[str] = mapped_column(String(500), nullable=False)
    solution_pdf_filename: Mapped[str | None] = mapped_column(String(500), nullable=True)
    status: Mapped[BatchStatus] = mapped_column(Enum(BatchStatus, name="batch_status"), default=BatchStatus.pending, nullable=False)
    source_type: Mapped[str] = mapped_column(String(40), default="self_created", nullable=False, index=True)
    source_label: Mapped[str | None] = mapped_column(String(255), nullable=True)
    rights_confirmed: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    rights_confirmed_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    rights_note: Mapped[str | None] = mapped_column(Text, nullable=True)
    accent_color: Mapped[str | None] = mapped_column(String(7), nullable=True)
    subject_candidates: Mapped[list] = mapped_column(JSON().with_variant(JSONB, "postgresql"), default=list, nullable=False)
    unit_candidates: Mapped[list] = mapped_column(JSON().with_variant(JSONB, "postgresql"), default=list, nullable=False)
    document_type_hints: Mapped[list] = mapped_column(JSON().with_variant(JSONB, "postgresql"), default=list, nullable=False)
    archive_folder_id: Mapped[uuid.UUID | None] = mapped_column(GUID(), ForeignKey("archive_folders.id", ondelete="SET NULL"), nullable=True, index=True)
    subject_engine: Mapped[str] = mapped_column(String(30), default="math", nullable=False, index=True)
    processing_task: Mapped[str] = mapped_column(String(30), default="full", nullable=False, index=True)
    owner_id: Mapped[str] = mapped_column(String(64), default="local_user", nullable=False, index=True)
    academy_id: Mapped[str | None] = mapped_column(String(64), nullable=True, index=True)
    progress_message: Mapped[str | None] = mapped_column(String(500), nullable=True)
    progress_current: Mapped[int | None] = mapped_column(Integer, nullable=True)
    progress_total: Mapped[int | None] = mapped_column(Integer, nullable=True)
    progress_started_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    progress_updated_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    failure_stage: Mapped[str | None] = mapped_column(String(500), nullable=True)
    failure_reason: Mapped[str | None] = mapped_column(Text, nullable=True)
    failure_hint: Mapped[str | None] = mapped_column(Text, nullable=True)
    failed_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, nullable=False)

    problems: Mapped[list["Problem"]] = relationship("Problem", back_populates="batch", cascade="all, delete-orphan")
    archive_folder: Mapped["ArchiveFolder | None"] = relationship("ArchiveFolder", back_populates="batches")


class ArchiveFolder(Base):
    __tablename__ = "archive_folders"

    id: Mapped[uuid.UUID] = mapped_column(GUID(), primary_key=True, default=uuid.uuid4)
    owner_id: Mapped[str] = mapped_column(String(64), default="local_user", nullable=False, index=True)
    academy_id: Mapped[str | None] = mapped_column(String(64), nullable=True, index=True)
    subject_engine: Mapped[str] = mapped_column(String(30), default="math", nullable=False, index=True)
    name: Mapped[str] = mapped_column(String(120), nullable=False)
    parent_id: Mapped[uuid.UUID | None] = mapped_column(GUID(), ForeignKey("archive_folders.id", ondelete="SET NULL"), nullable=True, index=True)
    color: Mapped[str | None] = mapped_column(String(7), nullable=True)
    order: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False)

    parent: Mapped["ArchiveFolder | None"] = relationship("ArchiveFolder", remote_side=[id], back_populates="children")
    children: Mapped[list["ArchiveFolder"]] = relationship("ArchiveFolder", back_populates="parent")
    batches: Mapped[list[Batch]] = relationship("Batch", back_populates="archive_folder")


class KoreanExtractionDocument(Base):
    __tablename__ = "korean_extraction_documents"

    id: Mapped[uuid.UUID] = mapped_column(GUID(), primary_key=True, default=uuid.uuid4)
    batch_id: Mapped[uuid.UUID] = mapped_column(GUID(), ForeignKey("batches.id", ondelete="CASCADE"), unique=True, nullable=False, index=True)
    document_id: Mapped[str] = mapped_column(String(80), nullable=False, index=True)
    subject: Mapped[str] = mapped_column(String(30), default="korean", nullable=False, index=True)
    source_file: Mapped[str] = mapped_column(String(500), nullable=False)
    payload: Mapped[dict] = mapped_column(JSON().with_variant(JSONB, "postgresql"), default=dict, nullable=False)
    global_warnings: Mapped[list] = mapped_column(JSON().with_variant(JSONB, "postgresql"), default=list, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False)


class KoreanPassageGroup(Base):
    __tablename__ = "korean_passage_groups"
    __table_args__ = (UniqueConstraint("document_id", "passage_id", name="uq_korean_passage_document_passage"),)

    id: Mapped[uuid.UUID] = mapped_column(GUID(), primary_key=True, default=uuid.uuid4)
    document_id: Mapped[uuid.UUID] = mapped_column(GUID(), ForeignKey("korean_extraction_documents.id", ondelete="CASCADE"), nullable=False, index=True)
    passage_id: Mapped[str] = mapped_column(String(120), nullable=False, index=True)
    source_pages: Mapped[list] = mapped_column(JSON().with_variant(JSONB, "postgresql"), default=list, nullable=False)
    passage_instruction: Mapped[str | None] = mapped_column(Text, nullable=True)
    passage_title: Mapped[str | None] = mapped_column(Text, nullable=True)
    passage_text: Mapped[str] = mapped_column(Text, default="", nullable=False)
    passage_type: Mapped[str] = mapped_column(String(40), default="unknown", nullable=False, index=True)
    linked_question_ids: Mapped[list] = mapped_column(JSON().with_variant(JSONB, "postgresql"), default=list, nullable=False)
    extraction_confidence: Mapped[float] = mapped_column(Numeric(6, 4), default=0, nullable=False)
    warnings: Mapped[list] = mapped_column(JSON().with_variant(JSONB, "postgresql"), default=list, nullable=False)
    needs_review: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False, index=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, nullable=False)


class KoreanQuestion(Base):
    __tablename__ = "korean_questions"
    __table_args__ = (UniqueConstraint("document_id", "question_id", name="uq_korean_question_document_question"),)

    id: Mapped[uuid.UUID] = mapped_column(GUID(), primary_key=True, default=uuid.uuid4)
    document_id: Mapped[uuid.UUID] = mapped_column(GUID(), ForeignKey("korean_extraction_documents.id", ondelete="CASCADE"), nullable=False, index=True)
    question_id: Mapped[str] = mapped_column(String(120), nullable=False, index=True)
    source_pages: Mapped[list] = mapped_column(JSON().with_variant(JSONB, "postgresql"), default=list, nullable=False)
    question_number: Mapped[str | None] = mapped_column(String(40), nullable=True, index=True)
    linked_passage_id: Mapped[str | None] = mapped_column(String(120), nullable=True, index=True)
    question_stem: Mapped[str] = mapped_column(Text, default="", nullable=False)
    additional_material: Mapped[str | None] = mapped_column(Text, nullable=True)
    choices: Mapped[list] = mapped_column(JSON().with_variant(JSONB, "postgresql"), default=list, nullable=False)
    answer: Mapped[str | None] = mapped_column(Text, nullable=True)
    solution: Mapped[str | None] = mapped_column(Text, nullable=True)
    extraction_confidence: Mapped[float] = mapped_column(Numeric(6, 4), default=0, nullable=False)
    warnings: Mapped[list] = mapped_column(JSON().with_variant(JSONB, "postgresql"), default=list, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, nullable=False)


class Problem(Base):
    __tablename__ = "problems"

    id: Mapped[uuid.UUID] = mapped_column(GUID(), primary_key=True, default=uuid.uuid4)
    problem_number: Mapped[int] = mapped_column(Integer, nullable=False, index=True)
    problem_text: Mapped[str] = mapped_column(Text, nullable=False)
    choices: Mapped[list] = mapped_column(JSON().with_variant(JSONB, "postgresql"), default=list, nullable=False)
    has_visual: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    visual_url: Mapped[str | None] = mapped_column(String(1000), nullable=True)
    visual_schema: Mapped[dict | None] = mapped_column(JSON().with_variant(JSONB, "postgresql"), nullable=True)
    math_model: Mapped[dict | None] = mapped_column(JSON().with_variant(JSONB, "postgresql"), nullable=True)
    review_page_image_url: Mapped[str | None] = mapped_column(String(1000), nullable=True)
    review_page_number: Mapped[int | None] = mapped_column(Integer, nullable=True)
    answer: Mapped[str | None] = mapped_column(Text, nullable=True)
    solution_steps: Mapped[str | None] = mapped_column(Text, nullable=True)
    key_concept: Mapped[str | None] = mapped_column(Text, nullable=True)
    needs_review: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    source_batch_id: Mapped[uuid.UUID] = mapped_column(GUID(), ForeignKey("batches.id", ondelete="CASCADE"), nullable=False, index=True)
    source_type: Mapped[str] = mapped_column(String(40), default="self_created", nullable=False, index=True)
    source_label: Mapped[str | None] = mapped_column(String(255), nullable=True)
    rights_confirmed: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    rights_confirmed_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    rights_note: Mapped[str | None] = mapped_column(Text, nullable=True)
    visibility: Mapped[str] = mapped_column(String(32), default="private", nullable=False, index=True)
    origin_type: Mapped[str] = mapped_column(String(32), default="owned", nullable=False, index=True)
    owner_id: Mapped[str] = mapped_column(String(64), default="local_user", nullable=False, index=True)
    academy_id: Mapped[str | None] = mapped_column(String(64), nullable=True, index=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False)
    deleted_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True, index=True)
    delete_scheduled_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True, index=True)

    batch: Mapped[Batch] = relationship("Batch", back_populates="problems")
    tags: Mapped["Tag"] = relationship("Tag", back_populates="problem", cascade="all, delete-orphan", uselist=False)


class Tag(Base):
    __tablename__ = "tags"

    id: Mapped[uuid.UUID] = mapped_column(GUID(), primary_key=True, default=uuid.uuid4)
    problem_id: Mapped[uuid.UUID] = mapped_column(GUID(), ForeignKey("problems.id", ondelete="CASCADE"), unique=True, nullable=False)
    subject: Mapped[str | None] = mapped_column(String(255), nullable=True, index=True)
    unit: Mapped[str | None] = mapped_column(String(255), nullable=True, index=True)
    difficulty: Mapped[str | None] = mapped_column(String(20), nullable=True, index=True)
    problem_type: Mapped[str | None] = mapped_column(String(255), nullable=True, index=True)
    source: Mapped[str | None] = mapped_column(String(500), nullable=True, index=True)

    problem: Mapped[Problem] = relationship("Problem", back_populates="tags")


class ProblemSet(Base):
    __tablename__ = "problem_sets"

    id: Mapped[uuid.UUID] = mapped_column(GUID(), primary_key=True, default=uuid.uuid4)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    owner_id: Mapped[str] = mapped_column(String(64), default="local_user", nullable=False, index=True)
    academy_id: Mapped[str | None] = mapped_column(String(64), nullable=True, index=True)
    subtitle: Mapped[str | None] = mapped_column(String(255), nullable=True)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    subject: Mapped[str | None] = mapped_column(String(120), nullable=True, index=True)
    grade: Mapped[str | None] = mapped_column(String(120), nullable=True, index=True)
    unit: Mapped[str | None] = mapped_column(String(255), nullable=True, index=True)
    difficulty: Mapped[str | None] = mapped_column(String(40), nullable=True, index=True)
    problem_count: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    visibility: Mapped[str] = mapped_column(String(32), default="private", nullable=False, index=True)
    source_type: Mapped[str] = mapped_column(String(40), default="self_created", nullable=False, index=True)
    rights_confirmed: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    can_publish_to_marketplace: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    thumbnail_url: Mapped[str | None] = mapped_column(String(1000), nullable=True)
    preview_problem_ids: Mapped[list] = mapped_column(JSON().with_variant(JSONB, "postgresql"), default=list, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False)

    items: Mapped[list["ProblemSetItem"]] = relationship(
        "ProblemSetItem",
        back_populates="problem_set",
        cascade="all, delete-orphan",
        order_by="ProblemSetItem.order_index",
    )


class ProblemSetItem(Base):
    __tablename__ = "problem_set_items"
    __table_args__ = (UniqueConstraint("problem_set_id", "problem_id", name="uq_problem_set_problem"),)

    id: Mapped[uuid.UUID] = mapped_column(GUID(), primary_key=True, default=uuid.uuid4)
    problem_set_id: Mapped[uuid.UUID] = mapped_column(GUID(), ForeignKey("problem_sets.id", ondelete="CASCADE"), nullable=False, index=True)
    problem_id: Mapped[uuid.UUID] = mapped_column(GUID(), ForeignKey("problems.id", ondelete="CASCADE"), nullable=False, index=True)
    order_index: Mapped[int] = mapped_column(Integer, nullable=False, default=0)

    problem_set: Mapped[ProblemSet] = relationship("ProblemSet", back_populates="items")
    problem: Mapped[Problem] = relationship("Problem")


class ProblemUsageHistory(Base):
    __tablename__ = "problem_usage_history"

    id: Mapped[uuid.UUID] = mapped_column(GUID(), primary_key=True, default=uuid.uuid4)
    owner_id: Mapped[str] = mapped_column(String(64), nullable=False, index=True)
    academy_id: Mapped[str | None] = mapped_column(String(64), nullable=True, index=True)
    problem_id: Mapped[uuid.UUID] = mapped_column(GUID(), ForeignKey("problems.id", ondelete="CASCADE"), nullable=False, index=True)
    usage_type: Mapped[str] = mapped_column(String(40), nullable=False, index=True)
    problem_set_id: Mapped[uuid.UUID | None] = mapped_column(GUID(), ForeignKey("problem_sets.id", ondelete="SET NULL"), nullable=True, index=True)
    export_title: Mapped[str | None] = mapped_column(String(255), nullable=True)
    export_date: Mapped[str | None] = mapped_column(String(40), nullable=True)
    template_id: Mapped[uuid.UUID | None] = mapped_column(GUID(), ForeignKey("exam_templates.id", ondelete="SET NULL"), nullable=True, index=True)
    hub_template_id: Mapped[uuid.UUID | None] = mapped_column(GUID(), ForeignKey("template_hub_templates.id", ondelete="SET NULL"), nullable=True, index=True)
    context_id: Mapped[str | None] = mapped_column(String(120), nullable=True, index=True)
    metadata_json: Mapped[dict] = mapped_column("metadata", JSON().with_variant(JSONB, "postgresql"), default=dict, nullable=False)
    created_by: Mapped[str | None] = mapped_column(String(64), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, nullable=False, index=True)

    problem: Mapped[Problem] = relationship("Problem")
    problem_set: Mapped[ProblemSet | None] = relationship("ProblemSet")


class ExamTemplate(Base):
    __tablename__ = "exam_templates"

    id: Mapped[uuid.UUID] = mapped_column(GUID(), primary_key=True, default=uuid.uuid4)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    academy_name: Mapped[str | None] = mapped_column(String(255), nullable=True)
    logo_url: Mapped[str | None] = mapped_column(String(1000), nullable=True)
    canvas_json: Mapped[dict | None] = mapped_column(JSON().with_variant(JSONB, "postgresql"), nullable=True)
    header_fields: Mapped[dict] = mapped_column(JSON().with_variant(JSONB, "postgresql"), default=dict, nullable=False)
    footer_text: Mapped[str | None] = mapped_column(Text, nullable=True)
    font_size: Mapped[int] = mapped_column(Integer, default=11, nullable=False)
    problems_per_page: Mapped[int] = mapped_column(Integer, default=2, nullable=False)
    include_solution: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False)

    versions: Mapped[list["TemplateVersion"]] = relationship("TemplateVersion", back_populates="template", cascade="all, delete-orphan")


class TemplateVersion(Base):
    __tablename__ = "template_versions"

    id: Mapped[uuid.UUID] = mapped_column(GUID(), primary_key=True, default=uuid.uuid4)
    template_id: Mapped[uuid.UUID] = mapped_column(GUID(), ForeignKey("exam_templates.id", ondelete="CASCADE"), nullable=False, index=True)
    canvas_json: Mapped[dict] = mapped_column(JSON().with_variant(JSONB, "postgresql"), nullable=False)
    saved_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, nullable=False)
    version_number: Mapped[int] = mapped_column(Integer, nullable=False)
    element_count: Mapped[int] = mapped_column(Integer, default=0, nullable=False)

    template: Mapped[ExamTemplate] = relationship("ExamTemplate", back_populates="versions")


# Template Hub: database-backed, shareable HTML/CSS templates.
class HubTemplate(Base):
    __tablename__ = "template_hub_templates"

    id: Mapped[uuid.UUID] = mapped_column(GUID(), primary_key=True, default=uuid.uuid4)
    owner_id: Mapped[str] = mapped_column(String(64), nullable=False, index=True)
    title: Mapped[str] = mapped_column(String(255), nullable=False)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    category: Mapped[str] = mapped_column(String(64), nullable=False, index=True)
    visibility: Mapped[str] = mapped_column(String(24), default="private", nullable=False, index=True)
    html: Mapped[str] = mapped_column(Text, nullable=False)
    css: Mapped[str | None] = mapped_column(Text, nullable=True)
    schema_json: Mapped[dict | None] = mapped_column(JSON().with_variant(JSONB, "postgresql"), nullable=True)
    thumbnail_url: Mapped[str | None] = mapped_column(String(1000), nullable=True)
    academy_id: Mapped[str | None] = mapped_column(String(64), nullable=True, index=True)
    source_type: Mapped[str] = mapped_column(String(40), default="self_created", nullable=False, index=True)
    rights_confirmed: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    rights_confirmed_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    forked_from_template_id: Mapped[uuid.UUID | None] = mapped_column(GUID(), ForeignKey("template_hub_templates.id", ondelete="SET NULL"), nullable=True, index=True)
    like_count: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    use_count: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False)

    forked_from: Mapped["HubTemplate | None"] = relationship("HubTemplate", remote_side=[id])


class MarketplaceListing(Base):
    __tablename__ = "marketplace_listings"

    id: Mapped[uuid.UUID] = mapped_column(GUID(), primary_key=True, default=uuid.uuid4)
    seller_id: Mapped[str] = mapped_column(String(64), nullable=False, index=True)
    academy_id: Mapped[str | None] = mapped_column(String(64), nullable=True, index=True)
    content_type: Mapped[str] = mapped_column(String(40), nullable=False, index=True)
    content_id: Mapped[str] = mapped_column(String(64), nullable=False, index=True)
    title: Mapped[str] = mapped_column(String(255), nullable=False)
    subtitle: Mapped[str | None] = mapped_column(String(255), nullable=True)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    category: Mapped[str | None] = mapped_column(String(120), nullable=True, index=True)
    subject: Mapped[str | None] = mapped_column(String(120), nullable=True, index=True)
    grade: Mapped[str | None] = mapped_column(String(120), nullable=True, index=True)
    unit: Mapped[str | None] = mapped_column(String(255), nullable=True, index=True)
    thumbnail_url: Mapped[str | None] = mapped_column(String(1000), nullable=True)
    pricing_type: Mapped[str] = mapped_column(String(32), default="free", nullable=False, index=True)
    price_amount: Mapped[int | None] = mapped_column(Integer, nullable=True)
    price_currency: Mapped[str] = mapped_column(String(10), default="KRW", nullable=False)
    subscription_period: Mapped[str | None] = mapped_column(String(32), nullable=True)
    license_type: Mapped[str] = mapped_column(String(40), default="free_use", nullable=False, index=True)
    status: Mapped[str] = mapped_column(String(32), default="draft", nullable=False, index=True)
    rights_confirmed: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    rights_confirmed_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    view_count: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    save_count: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    use_count: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False)


class LicenseEntitlement(Base):
    __tablename__ = "license_entitlements"

    id: Mapped[uuid.UUID] = mapped_column(GUID(), primary_key=True, default=uuid.uuid4)
    buyer_id: Mapped[str] = mapped_column(String(64), nullable=False, index=True)
    buyer_academy_id: Mapped[str | None] = mapped_column(String(64), nullable=True, index=True)
    seller_id: Mapped[str] = mapped_column(String(64), nullable=False, index=True)
    listing_id: Mapped[uuid.UUID] = mapped_column(GUID(), ForeignKey("marketplace_listings.id", ondelete="CASCADE"), nullable=False, index=True)
    content_type: Mapped[str] = mapped_column(String(40), nullable=False, index=True)
    content_id: Mapped[str] = mapped_column(String(64), nullable=False, index=True)
    license_type: Mapped[str] = mapped_column(String(40), nullable=False, index=True)
    status: Mapped[str] = mapped_column(String(24), default="active", nullable=False, index=True)
    starts_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, nullable=False)
    ends_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    can_view: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    can_export: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    can_edit: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    can_publish: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    can_permanently_save: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False)

    listing: Mapped[MarketplaceListing] = relationship("MarketplaceListing")


class CreatorProfile(Base):
    __tablename__ = "creator_profiles"

    id: Mapped[uuid.UUID] = mapped_column(GUID(), primary_key=True, default=uuid.uuid4)
    owner_id: Mapped[str] = mapped_column(String(64), nullable=False, unique=True, index=True)
    display_name: Mapped[str] = mapped_column(String(255), nullable=False)
    slug: Mapped[str] = mapped_column(String(120), nullable=False, unique=True, index=True)
    bio: Mapped[str | None] = mapped_column(Text, nullable=True)
    profile_image_url: Mapped[str | None] = mapped_column(String(1000), nullable=True)
    cover_image_url: Mapped[str | None] = mapped_column(String(1000), nullable=True)
    specialties: Mapped[list] = mapped_column(JSON().with_variant(JSONB, "postgresql"), default=list, nullable=False)
    verified_status: Mapped[str] = mapped_column(String(32), default="unverified", nullable=False, index=True)
    follower_count: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    listing_count: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False)


class Report(Base):
    __tablename__ = "reports"

    id: Mapped[uuid.UUID] = mapped_column(GUID(), primary_key=True, default=uuid.uuid4)
    reporter_id: Mapped[str] = mapped_column(String(64), nullable=False, index=True)
    target_type: Mapped[str] = mapped_column(String(40), nullable=False, index=True)
    target_id: Mapped[str] = mapped_column(String(64), nullable=False, index=True)
    reason: Mapped[str] = mapped_column(String(64), nullable=False, index=True)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    status: Mapped[str] = mapped_column(String(24), default="open", nullable=False, index=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False)


# Production SaaS foundation: roles, subscriptions, creator approval, curated marketplace,
# signed/private file access metadata, orders, licenses, payout ledger, and audit logs.
class UserRole(Base):
    __tablename__ = "user_roles"
    __table_args__ = (UniqueConstraint("user_id", "role", name="uq_user_role"),)

    id: Mapped[uuid.UUID] = mapped_column(GUID(), primary_key=True, default=uuid.uuid4)
    user_id: Mapped[str] = mapped_column(String(64), nullable=False, index=True)
    role: Mapped[str] = mapped_column(String(40), nullable=False, index=True)
    granted_by: Mapped[str | None] = mapped_column(String(64), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, nullable=False)


class Plan(Base):
    __tablename__ = "plans"

    id: Mapped[uuid.UUID] = mapped_column(GUID(), primary_key=True, default=uuid.uuid4)
    code: Mapped[str] = mapped_column(String(40), unique=True, nullable=False, index=True)
    name: Mapped[str] = mapped_column(String(120), nullable=False)
    monthly_price: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    currency: Mapped[str] = mapped_column(String(10), default="KRW", nullable=False)
    monthly_upload_count: Mapped[int] = mapped_column(Integer, default=3, nullable=False)
    monthly_processed_pages: Mapped[int] = mapped_column(Integer, default=30, nullable=False)
    storage_quota_mb: Mapped[int] = mapped_column(Integer, default=100, nullable=False)
    monthly_ai_tokens: Mapped[int] = mapped_column(Integer, default=100000, nullable=False)
    enabled_subject_engines: Mapped[list] = mapped_column(JSON().with_variant(JSONB, "postgresql"), default=lambda: ["math"], nullable=False)
    subject_engine_count: Mapped[int] = mapped_column(Integer, default=1, nullable=False)
    subject_multiplier: Mapped[float] = mapped_column(Numeric(6, 2), default=1, nullable=False)
    final_monthly_price: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    final_annual_price: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False)


class Subscription(Base):
    __tablename__ = "subscriptions"

    id: Mapped[uuid.UUID] = mapped_column(GUID(), primary_key=True, default=uuid.uuid4)
    user_id: Mapped[str] = mapped_column(String(64), nullable=False, index=True)
    plan_code: Mapped[str] = mapped_column(String(40), nullable=False, index=True)
    status: Mapped[str] = mapped_column(String(24), default="trialing", nullable=False, index=True)
    provider: Mapped[str] = mapped_column(String(40), default="mock", nullable=False)
    provider_customer_key: Mapped[str | None] = mapped_column(String(255), nullable=True)
    provider_subscription_id: Mapped[str | None] = mapped_column(String(255), nullable=True, index=True)
    current_period_start: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    current_period_end: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    cancel_at_period_end: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    enabled_subject_engines: Mapped[list] = mapped_column(JSON().with_variant(JSONB, "postgresql"), default=lambda: ["math"], nullable=False)
    subject_engine_count: Mapped[int] = mapped_column(Integer, default=1, nullable=False)
    subject_multiplier: Mapped[float] = mapped_column(Numeric(6, 2), default=1, nullable=False)
    final_monthly_price: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    final_annual_price: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False)


class SubscriptionEvent(Base):
    __tablename__ = "subscription_events"
    __table_args__ = (UniqueConstraint("provider", "provider_event_id", name="uq_subscription_event_provider_id"),)

    id: Mapped[uuid.UUID] = mapped_column(GUID(), primary_key=True, default=uuid.uuid4)
    provider: Mapped[str] = mapped_column(String(40), nullable=False, index=True)
    provider_event_id: Mapped[str] = mapped_column(String(255), nullable=False)
    event_type: Mapped[str] = mapped_column(String(120), nullable=False, index=True)
    payload: Mapped[dict] = mapped_column(JSON().with_variant(JSONB, "postgresql"), default=dict, nullable=False)
    processed_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, nullable=False)


class SubscriptionOrder(Base):
    __tablename__ = "subscription_orders"
    __table_args__ = (
        UniqueConstraint("provider", "provider_payment_id", name="uq_subscription_order_provider_payment"),
        UniqueConstraint("provider", "provider_issue_id", name="uq_subscription_order_provider_issue"),
    )

    id: Mapped[uuid.UUID] = mapped_column(GUID(), primary_key=True, default=uuid.uuid4)
    user_id: Mapped[str] = mapped_column(String(64), nullable=False, index=True)
    subscription_id: Mapped[uuid.UUID | None] = mapped_column(GUID(), ForeignKey("subscriptions.id"), nullable=True, index=True)
    billing_key_id: Mapped[uuid.UUID | None] = mapped_column(GUID(), ForeignKey("subscription_billing_keys.id"), nullable=True, index=True)
    plan_code: Mapped[str] = mapped_column(String(40), nullable=False, index=True)
    billing_cycle: Mapped[str] = mapped_column(String(20), default="monthly", nullable=False, index=True)
    selected_packages: Mapped[dict] = mapped_column(JSON().with_variant(JSONB, "postgresql"), default=dict, nullable=False)
    enabled_subject_engines: Mapped[list] = mapped_column(JSON().with_variant(JSONB, "postgresql"), default=lambda: ["math"], nullable=False)
    monthly_price_krw: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    amount_krw: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    currency: Mapped[str] = mapped_column(String(10), default="KRW", nullable=False)
    status: Mapped[str] = mapped_column(String(24), default="ready", nullable=False, index=True)
    provider: Mapped[str] = mapped_column(String(40), default="portone", nullable=False, index=True)
    provider_payment_id: Mapped[str | None] = mapped_column(String(80), nullable=True, index=True)
    provider_issue_id: Mapped[str | None] = mapped_column(String(80), nullable=True, index=True)
    order_name: Mapped[str] = mapped_column(String(255), nullable=False)
    payment_snapshot: Mapped[dict] = mapped_column(JSON().with_variant(JSONB, "postgresql"), default=dict, nullable=False)
    failure_reason: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False)


class SubscriptionBillingKey(Base):
    __tablename__ = "subscription_billing_keys"

    id: Mapped[uuid.UUID] = mapped_column(GUID(), primary_key=True, default=uuid.uuid4)
    user_id: Mapped[str] = mapped_column(String(64), nullable=False, index=True)
    subscription_id: Mapped[uuid.UUID | None] = mapped_column(GUID(), ForeignKey("subscriptions.id"), nullable=True, index=True)
    provider: Mapped[str] = mapped_column(String(40), default="portone", nullable=False, index=True)
    provider_billing_key_hash: Mapped[str] = mapped_column(String(64), nullable=False, index=True)
    billing_key_encrypted: Mapped[str] = mapped_column(Text, nullable=False)
    status: Mapped[str] = mapped_column(String(24), default="active", nullable=False, index=True)
    issued_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    deleted_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False)


class SubscriptionPaymentAttempt(Base):
    __tablename__ = "subscription_payment_attempts"
    __table_args__ = (UniqueConstraint("provider", "provider_payment_id", name="uq_subscription_payment_attempt_provider_payment"),)

    id: Mapped[uuid.UUID] = mapped_column(GUID(), primary_key=True, default=uuid.uuid4)
    user_id: Mapped[str] = mapped_column(String(64), nullable=False, index=True)
    subscription_id: Mapped[uuid.UUID | None] = mapped_column(GUID(), ForeignKey("subscriptions.id"), nullable=True, index=True)
    order_id: Mapped[uuid.UUID | None] = mapped_column(GUID(), ForeignKey("subscription_orders.id"), nullable=True, index=True)
    provider: Mapped[str] = mapped_column(String(40), default="portone", nullable=False, index=True)
    provider_payment_id: Mapped[str] = mapped_column(String(80), nullable=False, index=True)
    billing_cycle: Mapped[str] = mapped_column(String(20), default="monthly", nullable=False)
    amount_krw: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    currency: Mapped[str] = mapped_column(String(10), default="KRW", nullable=False)
    status: Mapped[str] = mapped_column(String(24), default="ready", nullable=False, index=True)
    scheduled_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True, index=True)
    paid_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    failed_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    raw_payload: Mapped[dict] = mapped_column(JSON().with_variant(JSONB, "postgresql"), default=dict, nullable=False)
    failure_reason: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False)


class UsageLog(Base):
    __tablename__ = "usage_logs"

    id: Mapped[uuid.UUID] = mapped_column(GUID(), primary_key=True, default=uuid.uuid4)
    job_id: Mapped[uuid.UUID | None] = mapped_column(GUID(), nullable=True, index=True)
    user_id: Mapped[str] = mapped_column(String(64), nullable=False, index=True)
    usage_type: Mapped[str] = mapped_column(String(40), nullable=False, index=True)
    pages_count: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    tokens_used: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    storage_mb: Mapped[float] = mapped_column(Numeric(12, 3), default=0, nullable=False)
    estimated_cost: Mapped[float] = mapped_column(Numeric(12, 4), default=0, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, nullable=False, index=True)


class ProcessingJob(Base):
    __tablename__ = "jobs"

    id: Mapped[uuid.UUID] = mapped_column(GUID(), primary_key=True, default=uuid.uuid4)
    user_id: Mapped[str] = mapped_column(String(64), nullable=False, index=True)
    status: Mapped[str] = mapped_column(String(24), default="pending", nullable=False, index=True)
    input_file_url: Mapped[str | None] = mapped_column(String(1000), nullable=True)
    output_file_url: Mapped[str | None] = mapped_column(String(1000), nullable=True)
    source_filename: Mapped[str] = mapped_column(String(500), nullable=False)
    file_size: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    page_count: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    error_message: Mapped[str | None] = mapped_column(Text, nullable=True)
    options: Mapped[dict] = mapped_column(JSON().with_variant(JSONB, "postgresql"), default=dict, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, nullable=False)
    started_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    completed_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False)


class JobFile(Base):
    __tablename__ = "job_files"

    id: Mapped[uuid.UUID] = mapped_column(GUID(), primary_key=True, default=uuid.uuid4)
    job_id: Mapped[uuid.UUID] = mapped_column(GUID(), ForeignKey("jobs.id", ondelete="CASCADE"), nullable=False, index=True)
    user_id: Mapped[str] = mapped_column(String(64), nullable=False, index=True)
    storage_path: Mapped[str] = mapped_column(String(1000), nullable=False)
    original_name: Mapped[str] = mapped_column(String(500), nullable=False)
    mime_type: Mapped[str] = mapped_column(String(120), nullable=False)
    size_bytes: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, nullable=False)


class JobOutput(Base):
    __tablename__ = "job_outputs"

    id: Mapped[uuid.UUID] = mapped_column(GUID(), primary_key=True, default=uuid.uuid4)
    job_id: Mapped[uuid.UUID] = mapped_column(GUID(), ForeignKey("jobs.id", ondelete="CASCADE"), nullable=False, index=True)
    user_id: Mapped[str] = mapped_column(String(64), nullable=False, index=True)
    storage_path: Mapped[str] = mapped_column(String(1000), nullable=False)
    output_type: Mapped[str] = mapped_column(String(32), default="html", nullable=False)
    size_bytes: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, nullable=False)


class CreatorApplication(Base):
    __tablename__ = "creator_applications"

    id: Mapped[uuid.UUID] = mapped_column(GUID(), primary_key=True, default=uuid.uuid4)
    user_id: Mapped[str] = mapped_column(String(64), nullable=False, index=True)
    legal_name: Mapped[str] = mapped_column(String(255), nullable=False)
    display_name: Mapped[str] = mapped_column(String(255), nullable=False)
    email: Mapped[str] = mapped_column(String(320), nullable=False)
    phone: Mapped[str | None] = mapped_column(String(80), nullable=True)
    business_type: Mapped[str] = mapped_column(String(40), nullable=False)
    business_registration_number: Mapped[str | None] = mapped_column(String(80), nullable=True)
    tax_invoice_email: Mapped[str | None] = mapped_column(String(320), nullable=True)
    payout_bank_name: Mapped[str] = mapped_column(String(120), nullable=False)
    payout_account_number: Mapped[str] = mapped_column(String(120), nullable=False)
    payout_account_holder: Mapped[str] = mapped_column(String(120), nullable=False)
    portfolio_url: Mapped[str | None] = mapped_column(String(1000), nullable=True)
    sample_content_url: Mapped[str | None] = mapped_column(String(1000), nullable=True)
    introduction: Mapped[str] = mapped_column(Text, nullable=False)
    rights_agreed: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    seller_terms_agreed: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    infringement_policy_agreed: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    payout_policy_agreed: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    status: Mapped[str] = mapped_column(String(24), default="submitted", nullable=False, index=True)
    rejection_reason: Mapped[str | None] = mapped_column(Text, nullable=True)
    admin_notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    reviewed_by: Mapped[str | None] = mapped_column(String(64), nullable=True)
    reviewed_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False)


class PayoutAccount(Base):
    __tablename__ = "payout_accounts"

    id: Mapped[uuid.UUID] = mapped_column(GUID(), primary_key=True, default=uuid.uuid4)
    creator_id: Mapped[str] = mapped_column(String(64), nullable=False, index=True)
    bank_name: Mapped[str] = mapped_column(String(120), nullable=False)
    account_number: Mapped[str] = mapped_column(String(120), nullable=False)
    account_holder: Mapped[str] = mapped_column(String(120), nullable=False)
    status: Mapped[str] = mapped_column(String(24), default="pending", nullable=False, index=True)
    tax_info: Mapped[dict] = mapped_column(JSON().with_variant(JSONB, "postgresql"), default=dict, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False)


class Product(Base):
    __tablename__ = "products"

    id: Mapped[uuid.UUID] = mapped_column(GUID(), primary_key=True, default=uuid.uuid4)
    creator_id: Mapped[str] = mapped_column(String(64), nullable=False, index=True)
    title: Mapped[str] = mapped_column(String(255), nullable=False)
    slug: Mapped[str] = mapped_column(String(160), nullable=False, unique=True, index=True)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    subject: Mapped[str | None] = mapped_column(String(120), nullable=True, index=True)
    grade_level: Mapped[str | None] = mapped_column(String(120), nullable=True, index=True)
    curriculum: Mapped[str | None] = mapped_column(String(120), nullable=True, index=True)
    unit_tags: Mapped[list] = mapped_column(JSON().with_variant(JSONB, "postgresql"), default=list, nullable=False)
    difficulty: Mapped[str | None] = mapped_column(String(40), nullable=True, index=True)
    question_count: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    exam_type: Mapped[str | None] = mapped_column(String(120), nullable=True, index=True)
    thumbnail_url: Mapped[str | None] = mapped_column(String(1000), nullable=True)
    preview_images: Mapped[list] = mapped_column(JSON().with_variant(JSONB, "postgresql"), default=list, nullable=False)
    license_type: Mapped[str] = mapped_column(String(40), default="personal_tutor", nullable=False)
    price: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    currency: Mapped[str] = mapped_column(String(10), default="KRW", nullable=False)
    status: Mapped[str] = mapped_column(String(40), default="draft", nullable=False, index=True)
    rights_declared: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    redistribution_allowed: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    watermark_enabled: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    published_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False)
    deleted_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)


class ProductVersion(Base):
    __tablename__ = "product_versions"

    id: Mapped[uuid.UUID] = mapped_column(GUID(), primary_key=True, default=uuid.uuid4)
    product_id: Mapped[uuid.UUID] = mapped_column(GUID(), ForeignKey("products.id", ondelete="CASCADE"), nullable=False, index=True)
    version_number: Mapped[int] = mapped_column(Integer, default=1, nullable=False)
    changelog: Mapped[str | None] = mapped_column(Text, nullable=True)
    preview_url: Mapped[str | None] = mapped_column(String(1000), nullable=True)
    status: Mapped[str] = mapped_column(String(40), default="draft", nullable=False, index=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, nullable=False)


class ProductAsset(Base):
    __tablename__ = "product_assets"

    id: Mapped[uuid.UUID] = mapped_column(GUID(), primary_key=True, default=uuid.uuid4)
    product_id: Mapped[uuid.UUID] = mapped_column(GUID(), ForeignKey("products.id", ondelete="CASCADE"), nullable=False, index=True)
    product_version_id: Mapped[uuid.UUID | None] = mapped_column(GUID(), ForeignKey("product_versions.id", ondelete="CASCADE"), nullable=True, index=True)
    creator_id: Mapped[str] = mapped_column(String(64), nullable=False, index=True)
    storage_path: Mapped[str] = mapped_column(String(1000), nullable=False)
    filename: Mapped[str] = mapped_column(String(500), nullable=False)
    content_type: Mapped[str] = mapped_column(String(120), nullable=False)
    size_bytes: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    asset_kind: Mapped[str] = mapped_column(String(40), default="download", nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, nullable=False)


class ProductLicenseTier(Base):
    __tablename__ = "product_license_tiers"

    id: Mapped[uuid.UUID] = mapped_column(GUID(), primary_key=True, default=uuid.uuid4)
    product_id: Mapped[uuid.UUID] = mapped_column(GUID(), ForeignKey("products.id", ondelete="CASCADE"), nullable=False, index=True)
    code: Mapped[str] = mapped_column(String(80), nullable=False, index=True)
    name: Mapped[str] = mapped_column(String(120), nullable=False)
    price: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    allowed_students_count: Mapped[int | None] = mapped_column(Integer, nullable=True)
    allowed_print_count: Mapped[int | None] = mapped_column(Integer, nullable=True)
    allowed_branches_count: Mapped[int | None] = mapped_column(Integer, nullable=True)
    commercial_use_allowed: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    redistribution_allowed: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    license_terms_text: Mapped[str] = mapped_column(Text, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, nullable=False)


class MarketplaceOrder(Base):
    __tablename__ = "marketplace_orders"

    id: Mapped[uuid.UUID] = mapped_column(GUID(), primary_key=True, default=uuid.uuid4)
    buyer_user_id: Mapped[str] = mapped_column(String(64), nullable=False, index=True)
    status: Mapped[str] = mapped_column(String(32), default="pending", nullable=False, index=True)
    gross_amount: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    payment_fee_amount: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    platform_commission_amount: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    creator_net_amount: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    currency: Mapped[str] = mapped_column(String(10), default="KRW", nullable=False)
    payment_provider: Mapped[str] = mapped_column(String(40), default="mock", nullable=False)
    payment_provider_order_id: Mapped[str | None] = mapped_column(String(255), nullable=True, index=True)
    commission_rate_snapshot: Mapped[float] = mapped_column(Numeric(6, 4), default=0.10, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False)


class MarketplaceOrderItem(Base):
    __tablename__ = "marketplace_order_items"

    id: Mapped[uuid.UUID] = mapped_column(GUID(), primary_key=True, default=uuid.uuid4)
    order_id: Mapped[uuid.UUID] = mapped_column(GUID(), ForeignKey("marketplace_orders.id", ondelete="CASCADE"), nullable=False, index=True)
    product_id: Mapped[uuid.UUID] = mapped_column(GUID(), ForeignKey("products.id"), nullable=False, index=True)
    product_version_id: Mapped[uuid.UUID | None] = mapped_column(GUID(), ForeignKey("product_versions.id"), nullable=True, index=True)
    license_tier_id: Mapped[uuid.UUID] = mapped_column(GUID(), ForeignKey("product_license_tiers.id"), nullable=False, index=True)
    creator_id: Mapped[str] = mapped_column(String(64), nullable=False, index=True)
    unit_amount: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, nullable=False)


class MarketplacePayment(Base):
    __tablename__ = "marketplace_payments"

    id: Mapped[uuid.UUID] = mapped_column(GUID(), primary_key=True, default=uuid.uuid4)
    order_id: Mapped[uuid.UUID] = mapped_column(GUID(), ForeignKey("marketplace_orders.id", ondelete="CASCADE"), nullable=False, index=True)
    provider: Mapped[str] = mapped_column(String(40), default="mock", nullable=False)
    provider_payment_id: Mapped[str | None] = mapped_column(String(255), nullable=True, index=True)
    amount: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    status: Mapped[str] = mapped_column(String(32), default="paid", nullable=False, index=True)
    raw_event: Mapped[dict] = mapped_column(JSON().with_variant(JSONB, "postgresql"), default=dict, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, nullable=False)


class MarketplaceRefund(Base):
    __tablename__ = "marketplace_refunds"

    id: Mapped[uuid.UUID] = mapped_column(GUID(), primary_key=True, default=uuid.uuid4)
    order_id: Mapped[uuid.UUID] = mapped_column(GUID(), ForeignKey("marketplace_orders.id", ondelete="CASCADE"), nullable=False, index=True)
    amount: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    reason: Mapped[str | None] = mapped_column(Text, nullable=True)
    status: Mapped[str] = mapped_column(String(32), default="pending", nullable=False, index=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, nullable=False)


class ProductLicense(Base):
    __tablename__ = "licenses"

    id: Mapped[uuid.UUID] = mapped_column(GUID(), primary_key=True, default=uuid.uuid4)
    buyer_user_id: Mapped[str] = mapped_column(String(64), nullable=False, index=True)
    product_id: Mapped[uuid.UUID] = mapped_column(GUID(), ForeignKey("products.id"), nullable=False, index=True)
    product_version_id: Mapped[uuid.UUID | None] = mapped_column(GUID(), ForeignKey("product_versions.id"), nullable=True, index=True)
    creator_id: Mapped[str] = mapped_column(String(64), nullable=False, index=True)
    license_tier_id: Mapped[uuid.UUID] = mapped_column(GUID(), ForeignKey("product_license_tiers.id"), nullable=False, index=True)
    order_id: Mapped[uuid.UUID] = mapped_column(GUID(), ForeignKey("marketplace_orders.id"), nullable=False, index=True)
    terms_snapshot: Mapped[str] = mapped_column(Text, nullable=False)
    starts_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, nullable=False)
    expires_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    status: Mapped[str] = mapped_column(String(24), default="active", nullable=False, index=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, nullable=False)


class CreatorBalanceLedger(Base):
    __tablename__ = "creator_balance_ledger"

    id: Mapped[uuid.UUID] = mapped_column(GUID(), primary_key=True, default=uuid.uuid4)
    creator_id: Mapped[str] = mapped_column(String(64), nullable=False, index=True)
    order_id: Mapped[uuid.UUID | None] = mapped_column(GUID(), nullable=True, index=True)
    entry_type: Mapped[str] = mapped_column(String(40), nullable=False, index=True)
    amount: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    currency: Mapped[str] = mapped_column(String(10), default="KRW", nullable=False)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, nullable=False)


class Payout(Base):
    __tablename__ = "payouts"

    id: Mapped[uuid.UUID] = mapped_column(GUID(), primary_key=True, default=uuid.uuid4)
    creator_id: Mapped[str] = mapped_column(String(64), nullable=False, index=True)
    amount: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    currency: Mapped[str] = mapped_column(String(10), default="KRW", nullable=False)
    status: Mapped[str] = mapped_column(String(24), default="pending", nullable=False, index=True)
    period_start: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    period_end: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    admin_notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, nullable=False)
    paid_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)


class PayoutItem(Base):
    __tablename__ = "payout_items"

    id: Mapped[uuid.UUID] = mapped_column(GUID(), primary_key=True, default=uuid.uuid4)
    payout_id: Mapped[uuid.UUID] = mapped_column(GUID(), ForeignKey("payouts.id", ondelete="CASCADE"), nullable=False, index=True)
    ledger_id: Mapped[uuid.UUID] = mapped_column(GUID(), ForeignKey("creator_balance_ledger.id"), nullable=False, index=True)
    amount: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, nullable=False)


class CopyrightReport(Base):
    __tablename__ = "copyright_reports"

    id: Mapped[uuid.UUID] = mapped_column(GUID(), primary_key=True, default=uuid.uuid4)
    reporter_name: Mapped[str] = mapped_column(String(255), nullable=False)
    reporter_email: Mapped[str] = mapped_column(String(320), nullable=False)
    product_id: Mapped[uuid.UUID | None] = mapped_column(GUID(), ForeignKey("products.id"), nullable=True, index=True)
    claim_description: Mapped[str] = mapped_column(Text, nullable=False)
    evidence_url: Mapped[str | None] = mapped_column(String(1000), nullable=True)
    status: Mapped[str] = mapped_column(String(40), default="submitted", nullable=False, index=True)
    admin_notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, nullable=False)
    resolved_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)


class AuditLog(Base):
    __tablename__ = "audit_logs"

    id: Mapped[uuid.UUID] = mapped_column(GUID(), primary_key=True, default=uuid.uuid4)
    actor_id: Mapped[str | None] = mapped_column(String(64), nullable=True, index=True)
    action: Mapped[str] = mapped_column(String(120), nullable=False, index=True)
    target_type: Mapped[str | None] = mapped_column(String(80), nullable=True, index=True)
    target_id: Mapped[str | None] = mapped_column(String(80), nullable=True, index=True)
    metadata_json: Mapped[dict] = mapped_column("metadata", JSON().with_variant(JSONB, "postgresql"), default=dict, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, nullable=False, index=True)


class PlatformSetting(Base):
    __tablename__ = "platform_settings"

    key: Mapped[str] = mapped_column(String(120), primary_key=True)
    value: Mapped[dict] = mapped_column(JSON().with_variant(JSONB, "postgresql"), default=dict, nullable=False)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False)


# Academy student app foundation -------------------------------------------------
# Seats are reusable academy-owned access units. Invite codes are rotatable
# credentials that let a student claim one currently unassigned seat.


class AcademyStudentPlan(Base):
    __tablename__ = "academy_student_plans"

    id: Mapped[uuid.UUID] = mapped_column(GUID(), primary_key=True, default=uuid.uuid4)
    code: Mapped[str] = mapped_column(String(40), unique=True, nullable=False, index=True)
    name: Mapped[str] = mapped_column(String(120), nullable=False)
    included_seats: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    monthly_price: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    additional_seat_price: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    daily_upload_quota_per_student: Mapped[int] = mapped_column(Integer, default=5, nullable=False)
    daily_extraction_quota_per_student: Mapped[int] = mapped_column(Integer, default=5, nullable=False)
    daily_export_quota_per_student: Mapped[int] = mapped_column(Integer, default=5, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, nullable=False)


class AcademyStudentSubscription(Base):
    __tablename__ = "academy_student_subscriptions"

    id: Mapped[uuid.UUID] = mapped_column(GUID(), primary_key=True, default=uuid.uuid4)
    academy_id: Mapped[str] = mapped_column(String(64), nullable=False, unique=True, index=True)
    plan_code: Mapped[str] = mapped_column(String(40), default="tutor", nullable=False, index=True)
    status: Mapped[str] = mapped_column(String(32), default="active", nullable=False, index=True)
    purchased_additional_seats: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    purchased_staff_seats: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    overage_policy: Mapped[str] = mapped_column(String(32), default="BLOCK_AT_LIMIT", nullable=False)
    billing_metadata: Mapped[dict] = mapped_column(JSON().with_variant(JSONB, "postgresql"), default=dict, nullable=False)
    current_period_start: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    current_period_end: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False)


class AcademyStaffMembership(Base):
    __tablename__ = "academy_staff_memberships"
    __table_args__ = (UniqueConstraint("academy_id", "user_id", name="uq_academy_staff_user"),)

    id: Mapped[uuid.UUID] = mapped_column(GUID(), primary_key=True, default=uuid.uuid4)
    academy_id: Mapped[str] = mapped_column(String(64), nullable=False, index=True)
    user_id: Mapped[str] = mapped_column(String(64), nullable=False, index=True)
    role: Mapped[str] = mapped_column(String(24), default="teacher", nullable=False, index=True)
    can_manage_billing: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    can_manage_seats: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    can_manage_materials: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    can_manage_assignments: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    can_manage_students: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    can_manage_schedule: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    can_manage_coagent: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False)


class AcademyStaffInviteCode(Base):
    __tablename__ = "academy_staff_invite_codes"

    id: Mapped[uuid.UUID] = mapped_column(GUID(), primary_key=True, default=uuid.uuid4)
    academy_id: Mapped[str] = mapped_column(String(64), nullable=False, index=True)
    code_hash: Mapped[str] = mapped_column(String(64), nullable=False, unique=True, index=True)
    code_preview: Mapped[str] = mapped_column(String(12), nullable=False)
    role: Mapped[str] = mapped_column(String(24), default="teacher", nullable=False, index=True)
    can_manage_seats: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    can_manage_materials: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    can_manage_assignments: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    can_manage_students: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    can_manage_schedule: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    can_manage_coagent: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    assigned_class_ids: Mapped[list] = mapped_column(JSON().with_variant(JSONB, "postgresql"), default=list, nullable=False)
    created_by: Mapped[str] = mapped_column(String(64), nullable=False, index=True)
    claimed_by: Mapped[str | None] = mapped_column(String(64), nullable=True, index=True)
    expires_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, index=True)
    claimed_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    revoked_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True, index=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False)


class AcademyWorkspaceSettings(Base):
    __tablename__ = "academy_workspace_settings"

    academy_id: Mapped[str] = mapped_column(String(64), primary_key=True)
    live_start_lead_minutes: Mapped[int] = mapped_column(Integer, default=5, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False)


class AcademySeat(Base):
    __tablename__ = "academy_seats"

    id: Mapped[uuid.UUID] = mapped_column(GUID(), primary_key=True, default=uuid.uuid4)
    academy_id: Mapped[str] = mapped_column(String(64), nullable=False, index=True)
    class_id: Mapped[uuid.UUID | None] = mapped_column(GUID(), ForeignKey("academy_classes.id", ondelete="SET NULL"), nullable=True, index=True)
    seat_number: Mapped[str] = mapped_column(String(80), nullable=False)
    display_name: Mapped[str | None] = mapped_column(String(120), nullable=True)
    invite_code_hash: Mapped[str] = mapped_column(String(64), nullable=False, unique=True, index=True)
    invite_code_preview: Mapped[str] = mapped_column(String(12), nullable=False)
    current_student_membership_id: Mapped[uuid.UUID | None] = mapped_column(GUID(), nullable=True, index=True)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False, index=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False)
    last_rotated_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    released_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)


class StudentAcademyMembership(Base):
    __tablename__ = "student_academy_memberships"

    id: Mapped[uuid.UUID] = mapped_column(GUID(), primary_key=True, default=uuid.uuid4)
    student_user_id: Mapped[str] = mapped_column(String(64), nullable=False, index=True)
    academy_id: Mapped[str] = mapped_column(String(64), nullable=False, index=True)
    academy_seat_id: Mapped[uuid.UUID] = mapped_column(GUID(), ForeignKey("academy_seats.id"), nullable=False, index=True)
    display_name_in_academy: Mapped[str | None] = mapped_column(String(120), nullable=True)
    status: Mapped[str] = mapped_column(String(24), default="active", nullable=False, index=True)
    joined_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, nullable=False)
    ended_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    expires_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True, index=True)
    created_by: Mapped[str | None] = mapped_column(String(64), nullable=True)
    claimed_by: Mapped[str | None] = mapped_column(String(64), nullable=True)
    metadata_json: Mapped[dict] = mapped_column("metadata", JSON().with_variant(JSONB, "postgresql"), default=dict, nullable=False)


class SeatAssignmentHistory(Base):
    __tablename__ = "seat_assignment_history"

    id: Mapped[uuid.UUID] = mapped_column(GUID(), primary_key=True, default=uuid.uuid4)
    academy_seat_id: Mapped[uuid.UUID] = mapped_column(GUID(), ForeignKey("academy_seats.id"), nullable=False, index=True)
    academy_id: Mapped[str] = mapped_column(String(64), nullable=False, index=True)
    student_user_id: Mapped[str] = mapped_column(String(64), nullable=False, index=True)
    membership_id: Mapped[uuid.UUID] = mapped_column(GUID(), nullable=False, index=True)
    assigned_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, nullable=False)
    released_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    released_by: Mapped[str | None] = mapped_column(String(64), nullable=True)
    reason: Mapped[str | None] = mapped_column(Text, nullable=True)


class AcademyClass(Base):
    __tablename__ = "academy_classes"

    id: Mapped[uuid.UUID] = mapped_column(GUID(), primary_key=True, default=uuid.uuid4)
    academy_id: Mapped[str] = mapped_column(String(64), nullable=False, index=True)
    name: Mapped[str] = mapped_column(String(160), nullable=False)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    subject: Mapped[str | None] = mapped_column(String(120), nullable=True, index=True)
    grade_level: Mapped[str | None] = mapped_column(String(120), nullable=True, index=True)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False, index=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False)


class ClassStudent(Base):
    __tablename__ = "class_students"
    __table_args__ = (UniqueConstraint("class_id", "student_membership_id", name="uq_class_student_membership"),)

    id: Mapped[uuid.UUID] = mapped_column(GUID(), primary_key=True, default=uuid.uuid4)
    class_id: Mapped[uuid.UUID] = mapped_column(GUID(), ForeignKey("academy_classes.id", ondelete="CASCADE"), nullable=False, index=True)
    student_membership_id: Mapped[uuid.UUID] = mapped_column(GUID(), ForeignKey("student_academy_memberships.id"), nullable=False, index=True)
    joined_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, nullable=False)
    left_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)


class ClassTeacher(Base):
    __tablename__ = "class_teachers"
    __table_args__ = (UniqueConstraint("class_id", "academy_staff_user_id", name="uq_class_teacher_user"),)

    id: Mapped[uuid.UUID] = mapped_column(GUID(), primary_key=True, default=uuid.uuid4)
    class_id: Mapped[uuid.UUID] = mapped_column(GUID(), ForeignKey("academy_classes.id", ondelete="CASCADE"), nullable=False, index=True)
    academy_staff_user_id: Mapped[str] = mapped_column(String(64), nullable=False, index=True)
    role_in_class: Mapped[str] = mapped_column(String(40), default="teacher", nullable=False)
    assigned_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, nullable=False)


class Assignment(Base):
    __tablename__ = "assignments"

    id: Mapped[uuid.UUID] = mapped_column(GUID(), primary_key=True, default=uuid.uuid4)
    academy_id: Mapped[str] = mapped_column(String(64), nullable=False, index=True)
    created_by_user_id: Mapped[str] = mapped_column(String(64), nullable=False, index=True)
    title: Mapped[str] = mapped_column(String(255), nullable=False)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    assignment_type: Mapped[str] = mapped_column(String(40), default="homework", nullable=False, index=True)
    submission_mode: Mapped[str] = mapped_column(String(40), default="completion", nullable=False)
    target_type: Mapped[str] = mapped_column(String(40), default="class", nullable=False)
    open_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True, index=True)
    due_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True, index=True)
    close_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True, index=True)
    allow_late_submission: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    late_submission_policy: Mapped[str | None] = mapped_column(Text, nullable=True)
    result_release_policy: Mapped[str] = mapped_column(String(40), default="manual", nullable=False)
    time_limit_minutes: Mapped[int | None] = mapped_column(Integer, nullable=True)
    max_attempts: Mapped[int] = mapped_column(Integer, default=1, nullable=False)
    archived_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False)


class AssignmentTarget(Base):
    __tablename__ = "assignment_targets"

    id: Mapped[uuid.UUID] = mapped_column(GUID(), primary_key=True, default=uuid.uuid4)
    assignment_id: Mapped[uuid.UUID] = mapped_column(GUID(), ForeignKey("assignments.id", ondelete="CASCADE"), nullable=False, index=True)
    target_type: Mapped[str] = mapped_column(String(24), nullable=False, index=True)
    target_id: Mapped[str] = mapped_column(String(80), nullable=False, index=True)


class AssignmentContent(Base):
    __tablename__ = "assignment_contents"

    id: Mapped[uuid.UUID] = mapped_column(GUID(), primary_key=True, default=uuid.uuid4)
    assignment_id: Mapped[uuid.UUID] = mapped_column(GUID(), ForeignKey("assignments.id", ondelete="CASCADE"), nullable=False, index=True)
    content_type: Mapped[str] = mapped_column(String(40), nullable=False)
    content_ref_id: Mapped[str | None] = mapped_column(String(80), nullable=True)
    text_content: Mapped[str | None] = mapped_column(Text, nullable=True)
    file_asset_id: Mapped[str | None] = mapped_column(String(80), nullable=True)
    order_index: Mapped[int] = mapped_column(Integer, default=0, nullable=False)


class AssignmentSubmission(Base):
    __tablename__ = "assignment_submissions"

    id: Mapped[uuid.UUID] = mapped_column(GUID(), primary_key=True, default=uuid.uuid4)
    assignment_id: Mapped[uuid.UUID] = mapped_column(GUID(), ForeignKey("assignments.id", ondelete="CASCADE"), nullable=False, index=True)
    student_membership_id: Mapped[uuid.UUID] = mapped_column(GUID(), ForeignKey("student_academy_memberships.id"), nullable=False, index=True)
    student_user_id: Mapped[str] = mapped_column(String(64), nullable=False, index=True)
    status: Mapped[str] = mapped_column(String(32), default="assigned", nullable=False, index=True)
    submitted_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    score: Mapped[Numeric | None] = mapped_column(Numeric(8, 2), nullable=True)
    feedback: Mapped[str | None] = mapped_column(Text, nullable=True)
    teacher_reviewed_by: Mapped[str | None] = mapped_column(String(64), nullable=True)
    reviewed_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False)


class AssignmentAnswer(Base):
    __tablename__ = "assignment_answers"

    id: Mapped[uuid.UUID] = mapped_column(GUID(), primary_key=True, default=uuid.uuid4)
    submission_id: Mapped[uuid.UUID] = mapped_column(GUID(), ForeignKey("assignment_submissions.id", ondelete="CASCADE"), nullable=False, index=True)
    question_id: Mapped[str | None] = mapped_column(String(80), nullable=True)
    item_index: Mapped[int | None] = mapped_column(Integer, nullable=True)
    answer_text: Mapped[str | None] = mapped_column(Text, nullable=True)
    answer_choice: Mapped[str | None] = mapped_column(String(40), nullable=True)
    is_correct: Mapped[bool | None] = mapped_column(Boolean, nullable=True)
    solution_image_asset_id: Mapped[str | None] = mapped_column(String(80), nullable=True)
    time_spent_seconds: Mapped[int | None] = mapped_column(Integer, nullable=True)


class TestSession(Base):
    __tablename__ = "test_sessions"

    id: Mapped[uuid.UUID] = mapped_column(GUID(), primary_key=True, default=uuid.uuid4)
    assignment_id: Mapped[uuid.UUID] = mapped_column(GUID(), ForeignKey("assignments.id", ondelete="CASCADE"), nullable=False, index=True)
    student_membership_id: Mapped[uuid.UUID] = mapped_column(GUID(), ForeignKey("student_academy_memberships.id"), nullable=False, index=True)
    started_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, nullable=False)
    expires_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True, index=True)
    submitted_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    status: Mapped[str] = mapped_column(String(32), default="in_progress", nullable=False, index=True)
    score: Mapped[Numeric | None] = mapped_column(Numeric(8, 2), nullable=True)
    raw_score: Mapped[Numeric | None] = mapped_column(Numeric(8, 2), nullable=True)
    max_score: Mapped[Numeric | None] = mapped_column(Numeric(8, 2), nullable=True)
    suspicious_event_count: Mapped[int] = mapped_column(Integer, default=0, nullable=False)


class TestSessionEvent(Base):
    __tablename__ = "test_session_events"

    id: Mapped[uuid.UUID] = mapped_column(GUID(), primary_key=True, default=uuid.uuid4)
    test_session_id: Mapped[uuid.UUID] = mapped_column(GUID(), ForeignKey("test_sessions.id", ondelete="CASCADE"), nullable=False, index=True)
    event_type: Mapped[str] = mapped_column(String(80), nullable=False, index=True)
    metadata_json: Mapped[dict] = mapped_column("metadata", JSON().with_variant(JSONB, "postgresql"), default=dict, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, nullable=False)


class CalendarEvent(Base):
    __tablename__ = "calendar_events"

    id: Mapped[uuid.UUID] = mapped_column(GUID(), primary_key=True, default=uuid.uuid4)
    owner_type: Mapped[str] = mapped_column(String(24), nullable=False, index=True)
    owner_id: Mapped[str] = mapped_column(String(80), nullable=False, index=True)
    academy_id: Mapped[str | None] = mapped_column(String(64), nullable=True, index=True)
    class_id: Mapped[uuid.UUID | None] = mapped_column(GUID(), nullable=True, index=True)
    student_membership_id: Mapped[uuid.UUID | None] = mapped_column(GUID(), nullable=True, index=True)
    created_by_user_id: Mapped[str] = mapped_column(String(64), nullable=False, index=True)
    title: Mapped[str] = mapped_column(String(255), nullable=False)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    event_type: Mapped[str] = mapped_column(String(40), default="custom", nullable=False, index=True)
    starts_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, index=True)
    ends_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, index=True)
    visibility: Mapped[str] = mapped_column(String(40), default="personal_private", nullable=False, index=True)
    recurrence_rule: Mapped[str | None] = mapped_column(String(500), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False)


class AcademyMaterial(Base):
    __tablename__ = "academy_materials"

    id: Mapped[uuid.UUID] = mapped_column(GUID(), primary_key=True, default=uuid.uuid4)
    academy_id: Mapped[str] = mapped_column(String(64), nullable=False, index=True)
    created_by_user_id: Mapped[str] = mapped_column(String(64), nullable=False, index=True)
    title: Mapped[str] = mapped_column(String(255), nullable=False)
    material_type: Mapped[str] = mapped_column(String(40), default="pdf", nullable=False, index=True)
    storage_path: Mapped[str | None] = mapped_column(String(1000), nullable=True)
    external_url: Mapped[str | None] = mapped_column(String(1000), nullable=True)
    permissions: Mapped[dict] = mapped_column(JSON().with_variant(JSONB, "postgresql"), default=dict, nullable=False)
    expires_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True, index=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False)


class AcademyMaterialAssignment(Base):
    __tablename__ = "academy_material_assignments"

    id: Mapped[uuid.UUID] = mapped_column(GUID(), primary_key=True, default=uuid.uuid4)
    material_id: Mapped[uuid.UUID] = mapped_column(GUID(), ForeignKey("academy_materials.id", ondelete="CASCADE"), nullable=False, index=True)
    target_type: Mapped[str] = mapped_column(String(24), nullable=False, index=True)
    target_id: Mapped[str] = mapped_column(String(80), nullable=False, index=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, nullable=False)


class MaterialDeliveryLog(Base):
    __tablename__ = "material_delivery_logs"

    id: Mapped[uuid.UUID] = mapped_column(GUID(), primary_key=True, default=uuid.uuid4)
    material_id: Mapped[uuid.UUID] = mapped_column(GUID(), ForeignKey("academy_materials.id"), nullable=False, index=True)
    student_user_id: Mapped[str] = mapped_column(String(64), nullable=False, index=True)
    academy_id: Mapped[str] = mapped_column(String(64), nullable=False, index=True)
    action: Mapped[str] = mapped_column(String(24), nullable=False, index=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, nullable=False)
    ip_address: Mapped[str | None] = mapped_column(String(64), nullable=True)
    user_agent: Mapped[str | None] = mapped_column(Text, nullable=True)


class WatermarkedExport(Base):
    __tablename__ = "watermarked_exports"

    id: Mapped[uuid.UUID] = mapped_column(GUID(), primary_key=True, default=uuid.uuid4)
    academy_id: Mapped[str | None] = mapped_column(String(64), nullable=True, index=True)
    student_user_id: Mapped[str] = mapped_column(String(64), nullable=False, index=True)
    student_membership_id: Mapped[uuid.UUID | None] = mapped_column(GUID(), nullable=True, index=True)
    source_material_id: Mapped[uuid.UUID | None] = mapped_column(GUID(), nullable=True, index=True)
    source_wrong_answer_export_id: Mapped[uuid.UUID | None] = mapped_column(GUID(), nullable=True, index=True)
    export_type: Mapped[str] = mapped_column(String(40), nullable=False, index=True)
    export_hash: Mapped[str] = mapped_column(String(64), nullable=False, index=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, nullable=False)
    downloaded_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    ip_address: Mapped[str | None] = mapped_column(String(64), nullable=True)
    user_agent: Mapped[str | None] = mapped_column(Text, nullable=True)


class DailyStudentQuotaUsage(Base):
    __tablename__ = "daily_student_quota_usage"
    __table_args__ = (UniqueConstraint("student_user_id", "date", "source", name="uq_daily_quota_student_date_source"),)

    id: Mapped[uuid.UUID] = mapped_column(GUID(), primary_key=True, default=uuid.uuid4)
    student_user_id: Mapped[str] = mapped_column(String(64), nullable=False, index=True)
    date: Mapped[str] = mapped_column(String(10), nullable=False, index=True)
    upload_count: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    extraction_count: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    export_count: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    source: Mapped[str] = mapped_column(String(80), default="personal", nullable=False, index=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False)


class MonthlyUsageRecord(Base):
    __tablename__ = "monthly_usage_records"
    __table_args__ = (UniqueConstraint("academy_id", "month", name="uq_monthly_usage_academy_month"),)

    id: Mapped[uuid.UUID] = mapped_column(GUID(), primary_key=True, default=uuid.uuid4)
    academy_id: Mapped[str] = mapped_column(String(64), nullable=False, index=True)
    month: Mapped[str] = mapped_column(String(7), nullable=False, index=True)
    active_seats: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    assigned_seats: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    upload_count: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    extraction_count: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    export_count: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    estimated_bill: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False)


class WrongAnswerItem(Base):
    __tablename__ = "wrong_answer_items"

    id: Mapped[uuid.UUID] = mapped_column(GUID(), primary_key=True, default=uuid.uuid4)
    student_user_id: Mapped[str] = mapped_column(String(64), nullable=False, index=True)
    academy_id: Mapped[str | None] = mapped_column(String(64), nullable=True, index=True)
    student_membership_id: Mapped[uuid.UUID | None] = mapped_column(GUID(), nullable=True, index=True)
    source_type: Mapped[str] = mapped_column(String(40), default="manual_entry", nullable=False, index=True)
    source_ref_id: Mapped[str | None] = mapped_column(String(80), nullable=True, index=True)
    original_image_asset_id: Mapped[str | None] = mapped_column(String(80), nullable=True)
    original_pdf_page_asset_id: Mapped[str | None] = mapped_column(String(80), nullable=True)
    extracted_problem_text: Mapped[str | None] = mapped_column(Text, nullable=True)
    extracted_choices: Mapped[list] = mapped_column(JSON().with_variant(JSONB, "postgresql"), default=list, nullable=False)
    extracted_answer: Mapped[str | None] = mapped_column(Text, nullable=True)
    extracted_explanation: Mapped[str | None] = mapped_column(Text, nullable=True)
    subject: Mapped[str | None] = mapped_column(String(120), nullable=True, index=True)
    unit: Mapped[str | None] = mapped_column(String(255), nullable=True, index=True)
    difficulty: Mapped[str | None] = mapped_column(String(40), nullable=True, index=True)
    tags: Mapped[list] = mapped_column(JSON().with_variant(JSONB, "postgresql"), default=list, nullable=False)
    visibility: Mapped[str] = mapped_column(String(40), default="private", nullable=False, index=True)
    memo: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False)
    archived_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)


class WrongAnswerReview(Base):
    __tablename__ = "wrong_answer_reviews"

    id: Mapped[uuid.UUID] = mapped_column(GUID(), primary_key=True, default=uuid.uuid4)
    wrong_answer_item_id: Mapped[uuid.UUID] = mapped_column(GUID(), ForeignKey("wrong_answer_items.id", ondelete="CASCADE"), nullable=False, index=True)
    student_user_id: Mapped[str] = mapped_column(String(64), nullable=False, index=True)
    scheduled_for: Mapped[datetime] = mapped_column(DateTime, nullable=False, index=True)
    completed_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    result: Mapped[str | None] = mapped_column(String(40), nullable=True)
    time_spent_seconds: Mapped[int | None] = mapped_column(Integer, nullable=True)
    memo: Mapped[str | None] = mapped_column(Text, nullable=True)


class WrongAnswerAttempt(Base):
    __tablename__ = "wrong_answer_attempts"

    id: Mapped[uuid.UUID] = mapped_column(GUID(), primary_key=True, default=uuid.uuid4)
    wrong_answer_item_id: Mapped[uuid.UUID] = mapped_column(GUID(), ForeignKey("wrong_answer_items.id", ondelete="CASCADE"), nullable=False, index=True)
    student_user_id: Mapped[str] = mapped_column(String(64), nullable=False, index=True)
    attempted_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, nullable=False, index=True)
    result: Mapped[str] = mapped_column(String(40), nullable=False)
    answer_text: Mapped[str | None] = mapped_column(Text, nullable=True)
    solution_image_asset_id: Mapped[str | None] = mapped_column(String(80), nullable=True)
    time_spent_seconds: Mapped[int | None] = mapped_column(Integer, nullable=True)
    memo: Mapped[str | None] = mapped_column(Text, nullable=True)


class WrongAnswerExport(Base):
    __tablename__ = "wrong_answer_exports"

    id: Mapped[uuid.UUID] = mapped_column(GUID(), primary_key=True, default=uuid.uuid4)
    student_user_id: Mapped[str] = mapped_column(String(64), nullable=False, index=True)
    academy_id: Mapped[str | None] = mapped_column(String(64), nullable=True, index=True)
    item_ids: Mapped[list] = mapped_column(JSON().with_variant(JSONB, "postgresql"), default=list, nullable=False)
    export_pdf_asset_id: Mapped[str | None] = mapped_column(String(80), nullable=True)
    export_id: Mapped[str] = mapped_column(String(80), nullable=False, unique=True, index=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, nullable=False)
    quota_units_used: Mapped[int] = mapped_column(Integer, default=1, nullable=False)
    watermark_applied: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)


class ContentVersion(Base):
    __tablename__ = "content_versions"

    id: Mapped[uuid.UUID] = mapped_column(GUID(), primary_key=True, default=uuid.uuid4)
    academy_id: Mapped[str] = mapped_column(String(64), nullable=False, index=True)
    source_type: Mapped[str] = mapped_column(String(40), nullable=False, index=True)
    source_id: Mapped[str] = mapped_column(String(80), nullable=False, index=True)
    title: Mapped[str] = mapped_column(String(255), nullable=False)
    version_label: Mapped[str | None] = mapped_column(String(80), nullable=True)
    snapshot: Mapped[dict] = mapped_column(JSON().with_variant(JSONB, "postgresql"), default=dict, nullable=False)
    created_by: Mapped[str | None] = mapped_column(String(64), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, nullable=False)


class PaperSession(Base):
    __tablename__ = "paper_sessions"

    id: Mapped[uuid.UUID] = mapped_column(GUID(), primary_key=True, default=uuid.uuid4)
    academy_id: Mapped[str] = mapped_column(String(64), nullable=False, index=True)
    title: Mapped[str] = mapped_column(String(255), nullable=False)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    source_problem_set_id: Mapped[uuid.UUID | None] = mapped_column(GUID(), ForeignKey("problem_sets.id"), nullable=True, index=True)
    source_archive_id: Mapped[str | None] = mapped_column(String(80), nullable=True, index=True)
    content_version_id: Mapped[uuid.UUID] = mapped_column(GUID(), ForeignKey("content_versions.id"), nullable=False, index=True)
    session_type: Mapped[str] = mapped_column(String(32), default="test", nullable=False, index=True)
    target_type: Mapped[str] = mapped_column(String(24), default="class", nullable=False, index=True)
    class_ids: Mapped[list] = mapped_column(JSON().with_variant(JSONB, "postgresql"), default=list, nullable=False)
    student_membership_ids: Mapped[list] = mapped_column(JSON().with_variant(JSONB, "postgresql"), default=list, nullable=False)
    scheduled_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True, index=True)
    due_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True, index=True)
    status: Mapped[str] = mapped_column(String(24), default="draft", nullable=False, index=True)
    exported_file_url: Mapped[str | None] = mapped_column(String(1000), nullable=True)
    created_by: Mapped[str | None] = mapped_column(String(64), nullable=True, index=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False)

    content_version: Mapped[ContentVersion] = relationship("ContentVersion")


class PaperSessionResult(Base):
    __tablename__ = "paper_session_results"
    __table_args__ = (UniqueConstraint("paper_session_id", "student_membership_id", name="uq_paper_session_student_result"),)

    id: Mapped[uuid.UUID] = mapped_column(GUID(), primary_key=True, default=uuid.uuid4)
    academy_id: Mapped[str] = mapped_column(String(64), nullable=False, index=True)
    paper_session_id: Mapped[uuid.UUID] = mapped_column(GUID(), ForeignKey("paper_sessions.id", ondelete="CASCADE"), nullable=False, index=True)
    student_membership_id: Mapped[uuid.UUID] = mapped_column(GUID(), ForeignKey("student_academy_memberships.id"), nullable=False, index=True)
    student_user_id: Mapped[str] = mapped_column(String(64), nullable=False, index=True)
    status: Mapped[str] = mapped_column(String(32), default="pending_grading", nullable=False, index=True)
    score: Mapped[Numeric | None] = mapped_column(Numeric(8, 2), nullable=True)
    correct_count: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    wrong_count: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    total_count: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    graded_by: Mapped[str | None] = mapped_column(String(64), nullable=True, index=True)
    graded_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True, index=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False)


class ProblemResult(Base):
    __tablename__ = "problem_results"
    __table_args__ = (UniqueConstraint("paper_session_result_id", "problem_id", name="uq_problem_result_student_problem"),)

    id: Mapped[uuid.UUID] = mapped_column(GUID(), primary_key=True, default=uuid.uuid4)
    academy_id: Mapped[str] = mapped_column(String(64), nullable=False, index=True)
    paper_session_id: Mapped[uuid.UUID] = mapped_column(GUID(), ForeignKey("paper_sessions.id", ondelete="CASCADE"), nullable=False, index=True)
    paper_session_result_id: Mapped[uuid.UUID] = mapped_column(GUID(), ForeignKey("paper_session_results.id", ondelete="CASCADE"), nullable=False, index=True)
    student_membership_id: Mapped[uuid.UUID] = mapped_column(GUID(), ForeignKey("student_academy_memberships.id"), nullable=False, index=True)
    student_user_id: Mapped[str] = mapped_column(String(64), nullable=False, index=True)
    problem_id: Mapped[uuid.UUID] = mapped_column(GUID(), ForeignKey("problems.id"), nullable=False, index=True)
    problem_version_id: Mapped[uuid.UUID] = mapped_column(GUID(), ForeignKey("content_versions.id"), nullable=False, index=True)
    problem_number: Mapped[int] = mapped_column(Integer, nullable=False, index=True)
    result_status: Mapped[str] = mapped_column(String(24), default="unmarked", nullable=False, index=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False)


class ClassScheduleEvent(Base):
    __tablename__ = "class_schedule_events"

    id: Mapped[uuid.UUID] = mapped_column(GUID(), primary_key=True, default=uuid.uuid4)
    academy_id: Mapped[str] = mapped_column(String(64), nullable=False, index=True)
    class_id: Mapped[uuid.UUID] = mapped_column(GUID(), ForeignKey("academy_classes.id", ondelete="CASCADE"), nullable=False, index=True)
    title: Mapped[str] = mapped_column(String(255), nullable=False)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    event_type: Mapped[str] = mapped_column(String(32), default="class", nullable=False, index=True)
    starts_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, index=True)
    ends_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    linked_paper_session_id: Mapped[uuid.UUID | None] = mapped_column(GUID(), ForeignKey("paper_sessions.id"), nullable=True, index=True)
    counts_for_tuition: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False, index=True)
    metadata_json: Mapped[dict] = mapped_column("metadata", JSON().with_variant(JSONB, "postgresql"), default=dict, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False)


class StudentTuitionSessionAdjustment(Base):
    __tablename__ = "student_tuition_session_adjustments"
    __table_args__ = (UniqueConstraint("event_id", "student_membership_id", name="uq_tuition_session_adjustment_event_student"),)

    id: Mapped[uuid.UUID] = mapped_column(GUID(), primary_key=True, default=uuid.uuid4)
    academy_id: Mapped[str] = mapped_column(String(64), nullable=False, index=True)
    event_id: Mapped[uuid.UUID] = mapped_column(GUID(), ForeignKey("class_schedule_events.id", ondelete="CASCADE"), nullable=False, index=True)
    student_membership_id: Mapped[uuid.UUID] = mapped_column(GUID(), ForeignKey("student_academy_memberships.id", ondelete="CASCADE"), nullable=False, index=True)
    counts_for_tuition: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False, index=True)
    reason: Mapped[str | None] = mapped_column(String(80), nullable=True)
    note: Mapped[str | None] = mapped_column(Text, nullable=True)
    updated_by: Mapped[str | None] = mapped_column(String(64), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False)


class StudentTuitionPayment(Base):
    __tablename__ = "student_tuition_payments"
    __table_args__ = (UniqueConstraint("academy_id", "student_membership_id", "due_event_id", name="uq_tuition_payment_due_event_student"),)

    id: Mapped[uuid.UUID] = mapped_column(GUID(), primary_key=True, default=uuid.uuid4)
    academy_id: Mapped[str] = mapped_column(String(64), nullable=False, index=True)
    student_membership_id: Mapped[uuid.UUID] = mapped_column(GUID(), ForeignKey("student_academy_memberships.id", ondelete="CASCADE"), nullable=False, index=True)
    student_user_id: Mapped[str] = mapped_column(String(64), nullable=False, index=True)
    class_id: Mapped[uuid.UUID | None] = mapped_column(GUID(), ForeignKey("academy_classes.id", ondelete="SET NULL"), nullable=True, index=True)
    due_event_id: Mapped[uuid.UUID | None] = mapped_column(GUID(), ForeignKey("class_schedule_events.id", ondelete="SET NULL"), nullable=True, index=True)
    cycle_number: Mapped[int] = mapped_column(Integer, default=1, nullable=False, index=True)
    cycle_start_session: Mapped[int] = mapped_column(Integer, default=1, nullable=False)
    cycle_end_session: Mapped[int] = mapped_column(Integer, default=1, nullable=False)
    cycle_sessions: Mapped[int] = mapped_column(Integer, default=1, nullable=False)
    amount: Mapped[int | None] = mapped_column(Integer, nullable=True)
    status: Mapped[str] = mapped_column(String(32), default="pending", nullable=False, index=True)
    due_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, index=True)
    paid_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    confirmed_by: Mapped[str | None] = mapped_column(String(64), nullable=True)
    reminder_count: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    reminder_sent_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    reminder_message: Mapped[str | None] = mapped_column(Text, nullable=True)
    metadata_json: Mapped[dict] = mapped_column("metadata", JSON().with_variant(JSONB, "postgresql"), default=dict, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False)


class ArchiveAccessGrant(Base):
    __tablename__ = "archive_access_grants"

    id: Mapped[uuid.UUID] = mapped_column(GUID(), primary_key=True, default=uuid.uuid4)
    academy_id: Mapped[str] = mapped_column(String(64), nullable=False, index=True)
    student_id: Mapped[str | None] = mapped_column(String(64), nullable=True, index=True)
    group_id: Mapped[uuid.UUID | None] = mapped_column(GUID(), nullable=True, index=True)
    source_type: Mapped[str] = mapped_column(String(40), nullable=False, index=True)
    source_id: Mapped[str] = mapped_column(String(80), nullable=False, index=True)
    access_scope: Mapped[str] = mapped_column(String(40), default="problemSet", nullable=False, index=True)
    can_view_problems: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    can_solve_freely: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    can_save_to_my_archive: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    can_create_custom_sets: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    can_see_answer_immediately: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    can_see_solution: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    can_retry: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    timed_only: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    starts_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True, index=True)
    expires_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True, index=True)
    revoked_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True, index=True)
    created_by: Mapped[str | None] = mapped_column(String(64), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False)


class LearningAssignment(Base):
    __tablename__ = "learning_assignments"

    id: Mapped[uuid.UUID] = mapped_column(GUID(), primary_key=True, default=uuid.uuid4)
    academy_id: Mapped[str] = mapped_column(String(64), nullable=False, index=True)
    title: Mapped[str] = mapped_column(String(255), nullable=False)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    source_type: Mapped[str] = mapped_column(String(40), nullable=False, index=True)
    source_id: Mapped[str] = mapped_column(String(80), nullable=False, index=True)
    content_version_id: Mapped[uuid.UUID] = mapped_column(GUID(), ForeignKey("content_versions.id"), nullable=False, index=True)
    assigned_by: Mapped[str] = mapped_column(String(64), nullable=False, index=True)
    assigned_to_type: Mapped[str] = mapped_column(String(24), default="mixed", nullable=False)
    start_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True, index=True)
    due_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True, index=True)
    schedule_type: Mapped[str] = mapped_column(String(24), default="one_time", nullable=False)
    recurrence_rule: Mapped[str | None] = mapped_column(String(500), nullable=True)
    grading_mode: Mapped[str] = mapped_column(String(24), default="auto", nullable=False)
    show_score_policy: Mapped[str] = mapped_column(String(32), default="immediately", nullable=False)
    show_answer_policy: Mapped[str] = mapped_column(String(32), default="afterSubmit", nullable=False)
    show_solution_policy: Mapped[str] = mapped_column(String(32), default="afterSubmit", nullable=False)
    retry_policy: Mapped[str] = mapped_column(String(24), default="wrongOnly", nullable=False)
    time_limit_seconds: Mapped[int | None] = mapped_column(Integer, nullable=True)
    shuffle_problems: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    shuffle_choices: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    status: Mapped[str] = mapped_column(String(24), default="draft", nullable=False, index=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False)

    content_version: Mapped[ContentVersion] = relationship("ContentVersion")


class LearningAssignmentTarget(Base):
    __tablename__ = "learning_assignment_targets"

    id: Mapped[uuid.UUID] = mapped_column(GUID(), primary_key=True, default=uuid.uuid4)
    assignment_id: Mapped[uuid.UUID] = mapped_column(GUID(), ForeignKey("learning_assignments.id", ondelete="CASCADE"), nullable=False, index=True)
    academy_id: Mapped[str] = mapped_column(String(64), nullable=False, index=True)
    student_id: Mapped[str | None] = mapped_column(String(64), nullable=True, index=True)
    group_id: Mapped[uuid.UUID | None] = mapped_column(GUID(), nullable=True, index=True)


class LearningSubmission(Base):
    __tablename__ = "learning_submissions"

    id: Mapped[uuid.UUID] = mapped_column(GUID(), primary_key=True, default=uuid.uuid4)
    academy_id: Mapped[str] = mapped_column(String(64), nullable=False, index=True)
    student_id: Mapped[str] = mapped_column(String(64), nullable=False, index=True)
    assignment_id: Mapped[uuid.UUID | None] = mapped_column(GUID(), ForeignKey("learning_assignments.id"), nullable=True, index=True)
    source_context: Mapped[str] = mapped_column(String(40), default="assignment", nullable=False, index=True)
    source_id: Mapped[str | None] = mapped_column(String(80), nullable=True, index=True)
    started_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, nullable=False)
    submitted_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True, index=True)
    status: Mapped[str] = mapped_column(String(32), default="in_progress", nullable=False, index=True)
    score: Mapped[Numeric | None] = mapped_column(Numeric(8, 2), nullable=True)
    correct_count: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    wrong_count: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    total_count: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    time_spent_seconds: Mapped[int | None] = mapped_column(Integer, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False)


class ProblemAttempt(Base):
    __tablename__ = "problem_attempts"

    id: Mapped[uuid.UUID] = mapped_column(GUID(), primary_key=True, default=uuid.uuid4)
    academy_id: Mapped[str] = mapped_column(String(64), nullable=False, index=True)
    student_id: Mapped[str] = mapped_column(String(64), nullable=False, index=True)
    submission_id: Mapped[uuid.UUID | None] = mapped_column(GUID(), ForeignKey("learning_submissions.id", ondelete="CASCADE"), nullable=True, index=True)
    assignment_id: Mapped[uuid.UUID | None] = mapped_column(GUID(), ForeignKey("learning_assignments.id"), nullable=True, index=True)
    problem_id: Mapped[uuid.UUID] = mapped_column(GUID(), ForeignKey("problems.id"), nullable=False, index=True)
    problem_version_id: Mapped[uuid.UUID] = mapped_column(GUID(), ForeignKey("content_versions.id"), nullable=False, index=True)
    source_context: Mapped[str] = mapped_column(String(40), nullable=False, index=True)
    student_answer: Mapped[str | None] = mapped_column(Text, nullable=True)
    normalized_student_answer: Mapped[str | None] = mapped_column(Text, nullable=True)
    correct_answer: Mapped[str | None] = mapped_column(Text, nullable=True)
    normalized_correct_answer: Mapped[str | None] = mapped_column(Text, nullable=True)
    is_correct: Mapped[bool | None] = mapped_column(Boolean, nullable=True, index=True)
    grading_status: Mapped[str] = mapped_column(String(32), default="needs_manual_review", nullable=False, index=True)
    attempt_number: Mapped[int] = mapped_column(Integer, default=1, nullable=False)
    time_spent_seconds: Mapped[int | None] = mapped_column(Integer, nullable=True)
    submitted_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, nullable=False, index=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, nullable=False)


class WrongAnswerRecord(Base):
    __tablename__ = "wrong_answer_records"
    __table_args__ = (UniqueConstraint("academy_id", "student_id", "problem_id", name="uq_wrong_answer_student_problem"),)

    id: Mapped[uuid.UUID] = mapped_column(GUID(), primary_key=True, default=uuid.uuid4)
    academy_id: Mapped[str] = mapped_column(String(64), nullable=False, index=True)
    student_id: Mapped[str] = mapped_column(String(64), nullable=False, index=True)
    problem_id: Mapped[uuid.UUID] = mapped_column(GUID(), ForeignKey("problems.id"), nullable=False, index=True)
    problem_version_id: Mapped[uuid.UUID] = mapped_column(GUID(), ForeignKey("content_versions.id"), nullable=False, index=True)
    first_wrong_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, nullable=False)
    latest_wrong_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, nullable=False, index=True)
    wrong_count: Mapped[int] = mapped_column(Integer, default=1, nullable=False)
    retry_count: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    resolved_status: Mapped[str] = mapped_column(String(24), default="unresolved", nullable=False, index=True)
    last_attempt_id: Mapped[uuid.UUID | None] = mapped_column(GUID(), nullable=True, index=True)
    source_assignment_ids: Mapped[list] = mapped_column(JSON().with_variant(JSONB, "postgresql"), default=list, nullable=False)
    student_memo: Mapped[str | None] = mapped_column(Text, nullable=True)
    teacher_memo: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False)


class StudentPersonalSet(Base):
    __tablename__ = "student_personal_sets"

    id: Mapped[uuid.UUID] = mapped_column(GUID(), primary_key=True, default=uuid.uuid4)
    student_id: Mapped[str] = mapped_column(String(64), nullable=False, index=True)
    title: Mapped[str] = mapped_column(String(255), nullable=False)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    visibility: Mapped[str] = mapped_column(String(24), default="private", nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False)


class StudentPersonalSetItem(Base):
    __tablename__ = "student_personal_set_items"
    __table_args__ = (UniqueConstraint("set_id", "problem_id", name="uq_student_personal_set_problem"),)

    id: Mapped[uuid.UUID] = mapped_column(GUID(), primary_key=True, default=uuid.uuid4)
    set_id: Mapped[uuid.UUID] = mapped_column(GUID(), ForeignKey("student_personal_sets.id", ondelete="CASCADE"), nullable=False, index=True)
    student_id: Mapped[str] = mapped_column(String(64), nullable=False, index=True)
    academy_id: Mapped[str] = mapped_column(String(64), nullable=False, index=True)
    problem_id: Mapped[uuid.UUID] = mapped_column(GUID(), ForeignKey("problems.id"), nullable=False, index=True)
    problem_version_id: Mapped[uuid.UUID] = mapped_column(GUID(), ForeignKey("content_versions.id"), nullable=False, index=True)
    source_access_grant_id: Mapped[uuid.UUID | None] = mapped_column(GUID(), ForeignKey("archive_access_grants.id"), nullable=True, index=True)
    order_index: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    locked_reason: Mapped[str | None] = mapped_column(String(255), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, nullable=False)


class Announcement(Base):
    __tablename__ = "academy_announcements"

    id: Mapped[uuid.UUID] = mapped_column(GUID(), primary_key=True, default=uuid.uuid4)
    academy_id: Mapped[str] = mapped_column(String(64), nullable=False, index=True)
    title: Mapped[str] = mapped_column(String(255), nullable=False)
    body: Mapped[str] = mapped_column(Text, nullable=False)
    target_type: Mapped[str] = mapped_column(String(24), default="academy", nullable=False, index=True)
    target_id: Mapped[str | None] = mapped_column(String(80), nullable=True, index=True)
    created_by: Mapped[str] = mapped_column(String(64), nullable=False, index=True)
    pinned: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    requires_acknowledgement: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, nullable=False)


class RoutineAction(Base):
    __tablename__ = "routine_actions"
    __table_args__ = (UniqueConstraint("academy_id", "routine_type", "source_type", "source_id", name="uq_routine_action_source"),)

    id: Mapped[uuid.UUID] = mapped_column(GUID(), primary_key=True, default=uuid.uuid4)
    academy_id: Mapped[str] = mapped_column(String(64), nullable=False, index=True)
    routine_type: Mapped[str] = mapped_column(String(80), nullable=False, index=True)
    source_type: Mapped[str] = mapped_column(String(80), nullable=False, index=True)
    source_id: Mapped[str] = mapped_column(String(120), nullable=False, index=True)
    class_id: Mapped[uuid.UUID | None] = mapped_column(GUID(), nullable=True, index=True)
    status: Mapped[str] = mapped_column(String(40), default="suggested", nullable=False, index=True)
    title: Mapped[str] = mapped_column(String(255), nullable=False)
    summary: Mapped[str | None] = mapped_column(Text, nullable=True)
    ai_payload: Mapped[dict] = mapped_column(JSON().with_variant(JSONB, "postgresql"), default=dict, nullable=False)
    channel: Mapped[str] = mapped_column(String(40), default="student_notification", nullable=False)
    created_by: Mapped[str | None] = mapped_column(String(64), nullable=True)
    approved_by: Mapped[str | None] = mapped_column(String(64), nullable=True)
    approved_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    sent_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False)

    messages: Mapped[list["RoutineMessage"]] = relationship("RoutineMessage", back_populates="action", cascade="all, delete-orphan", order_by="RoutineMessage.created_at")


class RoutineMessage(Base):
    __tablename__ = "routine_messages"

    id: Mapped[uuid.UUID] = mapped_column(GUID(), primary_key=True, default=uuid.uuid4)
    action_id: Mapped[uuid.UUID] = mapped_column(GUID(), ForeignKey("routine_actions.id", ondelete="CASCADE"), nullable=False, index=True)
    student_membership_id: Mapped[uuid.UUID | None] = mapped_column(GUID(), nullable=True, index=True)
    student_user_id: Mapped[str] = mapped_column(String(64), nullable=False, index=True)
    student_name: Mapped[str] = mapped_column(String(255), nullable=False)
    class_id: Mapped[uuid.UUID | None] = mapped_column(GUID(), nullable=True, index=True)
    class_name: Mapped[str | None] = mapped_column(String(255), nullable=True)
    message_body: Mapped[str] = mapped_column(Text, nullable=False)
    status: Mapped[str] = mapped_column(String(40), default="pending", nullable=False, index=True)
    channel: Mapped[str] = mapped_column(String(40), default="student_notification", nullable=False)
    delivery_status: Mapped[str] = mapped_column(String(40), default="draft", nullable=False, index=True)
    notification_id: Mapped[uuid.UUID | None] = mapped_column(GUID(), ForeignKey("student_notifications.id", ondelete="SET NULL"), nullable=True, index=True)
    metadata_json: Mapped[dict] = mapped_column("metadata", JSON().with_variant(JSONB, "postgresql"), default=dict, nullable=False)
    sent_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False)

    action: Mapped[RoutineAction] = relationship("RoutineAction", back_populates="messages")


class StudentNotification(Base):
    __tablename__ = "student_notifications"

    id: Mapped[uuid.UUID] = mapped_column(GUID(), primary_key=True, default=uuid.uuid4)
    student_user_id: Mapped[str] = mapped_column(String(64), nullable=False, index=True)
    academy_id: Mapped[str | None] = mapped_column(String(64), nullable=True, index=True)
    notification_type: Mapped[str] = mapped_column(String(80), nullable=False, index=True)
    title: Mapped[str] = mapped_column(String(255), nullable=False)
    body: Mapped[str | None] = mapped_column(Text, nullable=True)
    read_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    metadata_json: Mapped[dict] = mapped_column("metadata", JSON().with_variant(JSONB, "postgresql"), default=dict, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, nullable=False)


class AbuseSignal(Base):
    __tablename__ = "abuse_signals"

    id: Mapped[uuid.UUID] = mapped_column(GUID(), primary_key=True, default=uuid.uuid4)
    user_id: Mapped[str] = mapped_column(String(64), nullable=False, index=True)
    academy_id: Mapped[str | None] = mapped_column(String(64), nullable=True, index=True)
    signal_type: Mapped[str] = mapped_column(String(80), nullable=False, index=True)
    severity: Mapped[str] = mapped_column(String(24), default="low", nullable=False, index=True)
    metadata_json: Mapped[dict] = mapped_column("metadata", JSON().with_variant(JSONB, "postgresql"), default=dict, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, nullable=False)
    resolved_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
