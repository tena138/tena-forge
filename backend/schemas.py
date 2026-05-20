from datetime import datetime
from typing import Generic, TypeVar
from uuid import UUID

from pydantic import BaseModel, ConfigDict, EmailStr, Field, field_validator

from models import BatchStatus


class TagBase(BaseModel):
    subject: str | None = None
    unit: str | None = None
    difficulty: str | None = None
    problem_type: str | None = None
    source: str | None = None


class TagRead(TagBase):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    problem_id: UUID


class ProblemRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    problem_number: int
    problem_text: str
    has_visual: bool
    visual_url: str | None
    review_page_image_url: str | None = None
    review_page_number: int | None = None
    answer: str | None
    solution_steps: str | None
    key_concept: str | None
    needs_review: bool
    source_batch_id: UUID
    source_type: str = "self_created"
    source_label: str | None = None
    rights_confirmed: bool = False
    rights_confirmed_at: datetime | None = None
    rights_note: str | None = None
    visibility: str = "private"
    origin_type: str = "owned"
    owner_id: str = "local_user"
    academy_id: str | None = None
    created_at: datetime
    updated_at: datetime | None = None
    deleted_at: datetime | None = None
    delete_scheduled_at: datetime | None = None
    tags: TagRead | None = None


class ProblemListItem(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    problem_number: int
    problem_text: str
    has_visual: bool
    visual_url: str | None
    review_page_image_url: str | None = None
    review_page_number: int | None = None
    needs_review: bool
    source_batch_id: UUID
    source_type: str = "self_created"
    source_label: str | None = None
    rights_confirmed: bool = False
    visibility: str = "private"
    origin_type: str = "owned"
    created_at: datetime
    deleted_at: datetime | None = None
    delete_scheduled_at: datetime | None = None
    tags: TagRead | None = None


T = TypeVar("T")


class Paginated(BaseModel, Generic[T]):
    items: list[T]
    total: int
    page: int
    limit: int
    pages: int


class ProblemNavigation(BaseModel):
    previous_id: UUID | None = None
    next_id: UUID | None = None
    position: int | None = None
    total: int = 0


class ReviewUpdate(BaseModel):
    needs_review: bool


class ProblemUpdate(BaseModel):
    problem_text: str


class VisualCropUpdate(BaseModel):
    x: int
    y: int
    width: int
    height: int


class DashboardAnnouncementBase(BaseModel):
    eyebrow: str | None = Field(default=None, max_length=80)
    title: str = Field(min_length=1, max_length=255)
    body: str | None = None
    badge: str | None = Field(default=None, max_length=80)
    cta_label: str | None = Field(default=None, max_length=80)
    cta_href: str | None = Field(default=None, max_length=500)
    secondary_label: str | None = Field(default=None, max_length=80)
    secondary_href: str | None = Field(default=None, max_length=500)
    media_type: str = "none"
    media_url: str | None = Field(default=None, max_length=1000)
    media_alt: str | None = Field(default=None, max_length=255)
    theme: str = "product"
    priority: int = 0
    is_active: bool = True
    starts_at: datetime | None = None
    ends_at: datetime | None = None

    @field_validator("media_type")
    @classmethod
    def validate_media_type(cls, value: str) -> str:
        if value not in {"none", "image", "video"}:
            raise ValueError("media_type must be one of none, image, video")
        return value

    @field_validator("theme")
    @classmethod
    def validate_theme(cls, value: str) -> str:
        if value not in {"product", "update", "event", "system"}:
            raise ValueError("theme must be one of product, update, event, system")
        return value


class DashboardAnnouncementCreate(DashboardAnnouncementBase):
    pass


class DashboardAnnouncementUpdate(BaseModel):
    eyebrow: str | None = Field(default=None, max_length=80)
    title: str | None = Field(default=None, min_length=1, max_length=255)
    body: str | None = None
    badge: str | None = Field(default=None, max_length=80)
    cta_label: str | None = Field(default=None, max_length=80)
    cta_href: str | None = Field(default=None, max_length=500)
    secondary_label: str | None = Field(default=None, max_length=80)
    secondary_href: str | None = Field(default=None, max_length=500)
    media_type: str | None = None
    media_url: str | None = Field(default=None, max_length=1000)
    media_alt: str | None = Field(default=None, max_length=255)
    theme: str | None = None
    priority: int | None = None
    is_active: bool | None = None
    starts_at: datetime | None = None
    ends_at: datetime | None = None

    @field_validator("media_type")
    @classmethod
    def validate_media_type(cls, value: str | None) -> str | None:
        if value is not None and value not in {"none", "image", "video"}:
            raise ValueError("media_type must be one of none, image, video")
        return value

    @field_validator("theme")
    @classmethod
    def validate_theme(cls, value: str | None) -> str | None:
        if value is not None and value not in {"product", "update", "event", "system"}:
            raise ValueError("theme must be one of product, update, event, system")
        return value


class DashboardAnnouncementRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    eyebrow: str | None
    title: str
    body: str | None
    badge: str | None
    cta_label: str | None
    cta_href: str | None
    secondary_label: str | None
    secondary_href: str | None
    media_type: str
    media_url: str | None
    media_alt: str | None
    theme: str
    priority: int
    is_active: bool
    starts_at: datetime | None
    ends_at: datetime | None
    created_by: str | None
    created_at: datetime
    updated_at: datetime


class BatchRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    name: str
    problem_pdf_filename: str
    solution_pdf_filename: str | None
    status: BatchStatus
    source_type: str = "self_created"
    source_label: str | None = None
    rights_confirmed: bool = False
    rights_note: str | None = None
    subject_candidates: list[str] = Field(default_factory=list)
    unit_candidates: list[str] = Field(default_factory=list)
    processing_mode: str = "local"
    created_at: datetime
    problem_count: int = 0
    review_count: int = 0
    tagged_count: int = 0
    untagged_count: int = 0
    progress_message: str | None = None
    progress_percent: int | None = None
    estimated_seconds_remaining: int | None = None
    failure_stage: str | None = None
    failure_reason: str | None = None
    failure_hint: str | None = None
    failed_at: datetime | None = None


class BatchUploadResponse(BaseModel):
    batch_id: UUID
    status: BatchStatus


class BatchStatusResponse(BaseModel):
    batch_id: UUID
    status: BatchStatus
    processing_mode: str = "local"
    progress_message: str
    progress_percent: int | None = None
    estimated_seconds_remaining: int | None = None
    failure_stage: str | None = None
    failure_reason: str | None = None
    failure_hint: str | None = None
    failed_at: datetime | None = None


class FacetsResponse(BaseModel):
    subjects: list[str]
    units: list[str]
    problem_types: list[str]
    sources: list[str] = []
    source_types: list[str] = []
    visibilities: list[str] = []
    origin_types: list[str] = []


class ProblemStats(BaseModel):
    total: int
    needs_review: int
    tagged: int
    untagged: int


SOURCE_TYPES = {
    "self_created",
    "academy_internal",
    "licensed",
    "public_domain_or_open",
    "personal_study_only",
    "unknown",
}

MARKETPLACE_RESTRICTED_SOURCE_TYPES = {"personal_study_only", "unknown"}
VISIBILITIES = {"private", "unlisted", "public", "marketplace", "marketplace_restricted"}


class ProblemSetCreate(BaseModel):
    name: str
    subtitle: str | None = None
    description: str | None = None
    subject: str | None = None
    grade: str | None = None
    unit: str | None = None
    difficulty: str | None = None
    visibility: str = "private"
    source_type: str = "self_created"
    rights_confirmed: bool = False
    thumbnail_url: str | None = None
    problem_ids: list[UUID] = []

    @field_validator("source_type")
    @classmethod
    def valid_source_type(cls, value: str) -> str:
        if value not in SOURCE_TYPES:
            raise ValueError("Unsupported source type.")
        return value

    @field_validator("visibility")
    @classmethod
    def valid_problem_set_visibility(cls, value: str) -> str:
        if value not in VISIBILITIES:
            raise ValueError("Unsupported visibility.")
        return value


class ProblemSetUpdate(BaseModel):
    name: str | None = None
    subtitle: str | None = None
    description: str | None = None
    subject: str | None = None
    grade: str | None = None
    unit: str | None = None
    difficulty: str | None = None
    visibility: str | None = None
    source_type: str | None = None
    rights_confirmed: bool | None = None
    thumbnail_url: str | None = None
    problem_ids: list[UUID] | None = None

    @field_validator("source_type")
    @classmethod
    def valid_optional_source_type(cls, value: str | None) -> str | None:
        if value is not None and value not in SOURCE_TYPES:
            raise ValueError("Unsupported source type.")
        return value

    @field_validator("visibility")
    @classmethod
    def valid_optional_visibility(cls, value: str | None) -> str | None:
        if value is not None and value not in VISIBILITIES:
            raise ValueError("Unsupported visibility.")
        return value


class ProblemSetAppendItem(BaseModel):
    problem_id: UUID


class ProblemSetAppendItems(BaseModel):
    problem_ids: list[UUID]


class ProblemSetReorder(BaseModel):
    ordered_problem_ids: list[UUID]


class ProblemSetItemRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    problem_set_id: UUID
    problem_id: UUID
    order_index: int
    problem: ProblemRead


class ProblemSetRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    name: str
    owner_id: str = "local_user"
    academy_id: str | None = None
    subtitle: str | None = None
    description: str | None = None
    subject: str | None = None
    grade: str | None = None
    unit: str | None = None
    difficulty: str | None = None
    problem_count: int = 0
    visibility: str = "private"
    source_type: str = "self_created"
    rights_confirmed: bool = False
    can_publish_to_marketplace: bool = False
    thumbnail_url: str | None = None
    preview_problem_ids: list | None = None
    created_at: datetime
    updated_at: datetime
    items: list[ProblemSetItemRead] = []


class ProblemSetListItem(BaseModel):
    id: UUID
    name: str
    subtitle: str | None = None
    description: str | None = None
    subject: str | None = None
    grade: str | None = None
    unit: str | None = None
    difficulty: str | None = None
    visibility: str = "private"
    source_type: str = "self_created"
    rights_confirmed: bool = False
    can_publish_to_marketplace: bool = False
    thumbnail_url: str | None = None
    created_at: datetime
    updated_at: datetime
    item_count: int


class ExamTemplateRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    name: str
    academy_name: str | None
    logo_url: str | None
    canvas_json: dict | None = None
    header_fields: dict
    footer_text: str | None
    font_size: int
    problems_per_page: int
    include_solution: bool
    created_at: datetime
    updated_at: datetime


class TemplateVersionRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    template_id: UUID
    canvas_json: dict
    saved_at: datetime
    version_number: int
    element_count: int


class ExportRequest(BaseModel):
    source: str
    problem_set_id: UUID | None = None
    problem_ids: list[UUID] | None = None
    template_id: UUID | None = None
    hub_template_id: UUID | None = None
    exam_title: str
    class_name: str | None = None
    student_name: str | None = None
    date: str
    exam_start_time: str | None = None
    exam_end_time: str | None = None
    exam_time: str | None = None
    exam_datetime: str | None = None
    custom_variables: dict[str, str] | None = None
    include_solution: bool = False


class TemplateVisualSave(BaseModel):
    name: str
    canvas_json: dict
    academy_name: str | None = None
    font_size: int = 11
    problems_per_page: int = 2
    include_solution: bool = False
    footer_text: str | None = None


class ExportPreviewRequest(BaseModel):
    canvas_json: dict


TEMPLATE_HUB_CATEGORIES = {
    "exam",
    "workbook",
    "worksheet",
    "wrong_answer_note",
    "solution_book",
    "concept_note",
    "unit_test",
    "cover",
}
TEMPLATE_HUB_VISIBILITIES = {"private", "unlisted", "public", "marketplace"}


class TemplateCreate(BaseModel):
    title: str = Field(min_length=1, max_length=255)
    description: str | None = None
    category: str = "exam"
    visibility: str = "private"
    html: str = Field(min_length=1)
    css: str | None = None
    schema_json: dict | None = None
    thumbnail_url: str | None = None
    source_type: str = "self_created"
    rights_confirmed: bool = False

    @field_validator("category")
    @classmethod
    def valid_category(cls, value: str) -> str:
        if value not in TEMPLATE_HUB_CATEGORIES:
            raise ValueError("Unsupported template category.")
        return value

    @field_validator("visibility")
    @classmethod
    def valid_visibility(cls, value: str) -> str:
        if value not in TEMPLATE_HUB_VISIBILITIES:
            raise ValueError("Unsupported template visibility.")
        return value

    @field_validator("source_type")
    @classmethod
    def valid_template_source_type(cls, value: str) -> str:
        if value not in SOURCE_TYPES:
            raise ValueError("Unsupported source type.")
        return value


class TemplateUpdate(BaseModel):
    title: str | None = Field(default=None, min_length=1, max_length=255)
    description: str | None = None
    category: str | None = None
    visibility: str | None = None
    html: str | None = Field(default=None, min_length=1)
    css: str | None = None
    schema_json: dict | None = None
    thumbnail_url: str | None = None
    source_type: str | None = None
    rights_confirmed: bool | None = None

    @field_validator("category")
    @classmethod
    def valid_optional_category(cls, value: str | None) -> str | None:
        if value is not None and value not in TEMPLATE_HUB_CATEGORIES:
            raise ValueError("Unsupported template category.")
        return value

    @field_validator("visibility")
    @classmethod
    def valid_optional_visibility(cls, value: str | None) -> str | None:
        if value is not None and value not in TEMPLATE_HUB_VISIBILITIES:
            raise ValueError("Unsupported template visibility.")
        return value

    @field_validator("source_type")
    @classmethod
    def valid_optional_template_source_type(cls, value: str | None) -> str | None:
        if value is not None and value not in SOURCE_TYPES:
            raise ValueError("Unsupported source type.")
        return value


class TemplateResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    owner_id: str
    title: str
    description: str | None
    category: str
    visibility: str
    html: str
    css: str | None
    schema_json: dict | None
    thumbnail_url: str | None
    academy_id: str | None = None
    source_type: str = "self_created"
    rights_confirmed: bool = False
    rights_confirmed_at: datetime | None = None
    forked_from_template_id: UUID | None
    like_count: int
    use_count: int
    created_at: datetime
    updated_at: datetime
    is_owner: bool = False


class TemplateForkResponse(BaseModel):
    template: TemplateResponse
    source_use_count: int


class MarketplaceSubmissionRequest(BaseModel):
    rights_confirmed: bool
    no_unauthorized_copy: bool = False
    pricing_type: str = "free"
    license_type: str = "free_use"
    price_amount: int | None = None
    category: str | None = None


class MarketplaceListingCreate(BaseModel):
    content_type: str
    content_id: str
    title: str = Field(min_length=1, max_length=255)
    subtitle: str | None = None
    description: str | None = None
    category: str | None = None
    subject: str | None = None
    grade: str | None = None
    unit: str | None = None
    thumbnail_url: str | None = None
    pricing_type: str = "free"
    price_amount: int | None = None
    price_currency: str = "KRW"
    subscription_period: str | None = None
    license_type: str = "free_use"
    status: str = "draft"
    rights_confirmed: bool = False


class MarketplaceListingUpdate(BaseModel):
    title: str | None = Field(default=None, min_length=1, max_length=255)
    subtitle: str | None = None
    description: str | None = None
    category: str | None = None
    subject: str | None = None
    grade: str | None = None
    unit: str | None = None
    thumbnail_url: str | None = None
    pricing_type: str | None = None
    price_amount: int | None = None
    price_currency: str | None = None
    subscription_period: str | None = None
    license_type: str | None = None
    status: str | None = None
    rights_confirmed: bool | None = None


class MarketplaceListingRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    seller_id: str
    academy_id: str | None = None
    content_type: str
    content_id: str
    title: str
    subtitle: str | None = None
    description: str | None = None
    category: str | None = None
    subject: str | None = None
    grade: str | None = None
    unit: str | None = None
    thumbnail_url: str | None = None
    pricing_type: str
    price_amount: int | None = None
    price_currency: str
    subscription_period: str | None = None
    license_type: str
    status: str
    rights_confirmed: bool
    rights_confirmed_at: datetime | None = None
    view_count: int
    save_count: int
    use_count: int
    created_at: datetime
    updated_at: datetime


class LicenseEntitlementRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    buyer_id: str
    buyer_academy_id: str | None = None
    seller_id: str
    listing_id: UUID
    content_type: str
    content_id: str
    license_type: str
    status: str
    starts_at: datetime
    ends_at: datetime | None = None
    can_view: bool
    can_export: bool
    can_edit: bool
    can_publish: bool
    can_permanently_save: bool
    created_at: datetime
    updated_at: datetime
    listing: MarketplaceListingRead | None = None


class CreatorProfileCreate(BaseModel):
    display_name: str = Field(min_length=1, max_length=255)
    slug: str = Field(min_length=2, max_length=120)
    bio: str | None = None
    profile_image_url: str | None = None
    cover_image_url: str | None = None
    specialties: list[str] = []


class CreatorProfileUpdate(BaseModel):
    display_name: str | None = Field(default=None, min_length=1, max_length=255)
    slug: str | None = Field(default=None, min_length=2, max_length=120)
    bio: str | None = None
    profile_image_url: str | None = None
    cover_image_url: str | None = None
    specialties: list[str] | None = None


class CreatorProfileRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    owner_id: str
    display_name: str
    slug: str
    bio: str | None = None
    profile_image_url: str | None = None
    cover_image_url: str | None = None
    specialties: list = []
    verified_status: str
    follower_count: int
    listing_count: int
    created_at: datetime
    updated_at: datetime


class ReportCreate(BaseModel):
    target_type: str
    target_id: str
    reason: str
    description: str | None = None


class ReportRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    reporter_id: str
    target_type: str
    target_id: str
    reason: str
    description: str | None = None
    status: str
    created_at: datetime
    updated_at: datetime


class RoleListResponse(BaseModel):
    roles: list[str]


class PlanRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    code: str
    name: str
    monthly_price: int
    currency: str
    monthly_upload_count: int
    monthly_processed_pages: int
    storage_quota_mb: int
    monthly_ai_tokens: int


class SubscriptionRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    user_id: str
    plan_code: str
    status: str
    provider: str
    current_period_start: datetime | None = None
    current_period_end: datetime | None = None
    cancel_at_period_end: bool


class UsageSummaryRead(BaseModel):
    plan: PlanRead
    subscription: SubscriptionRead | None = None
    monthly_uploads_used: int
    monthly_pages_used: int
    monthly_ai_tokens_used: int
    storage_mb_used: float


class CheckoutRequest(BaseModel):
    plan_code: str


class CheckoutResponse(BaseModel):
    provider: str
    checkout_url: str
    message: str


class ProcessingJobCreate(BaseModel):
    source_filename: str = Field(min_length=1, max_length=500)
    file_size: int = Field(default=0, ge=0)
    page_count: int = Field(default=0, ge=0)
    input_file_url: str | None = None
    options: dict = {}


class ProcessingJobRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    user_id: str
    status: str
    input_file_url: str | None = None
    output_file_url: str | None = None
    source_filename: str
    file_size: int
    page_count: int
    error_message: str | None = None
    created_at: datetime
    started_at: datetime | None = None
    completed_at: datetime | None = None


class SignedUrlResponse(BaseModel):
    url: str
    expires_at: datetime


class CreatorApplicationCreate(BaseModel):
    legal_name: str = Field(min_length=1, max_length=255)
    display_name: str = Field(min_length=1, max_length=255)
    email: str = Field(min_length=3, max_length=320)
    phone: str | None = None
    business_type: str
    business_registration_number: str | None = None
    tax_invoice_email: str | None = None
    payout_bank_name: str = Field(min_length=1)
    payout_account_number: str = Field(min_length=1)
    payout_account_holder: str = Field(min_length=1)
    portfolio_url: str | None = None
    sample_content_url: str | None = None
    introduction: str = Field(min_length=10)
    rights_agreed: bool
    seller_terms_agreed: bool
    infringement_policy_agreed: bool
    payout_policy_agreed: bool


class CreatorApplicationRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    user_id: str
    legal_name: str
    display_name: str
    email: str
    phone: str | None = None
    business_type: str
    business_registration_number: str | None = None
    tax_invoice_email: str | None = None
    payout_bank_name: str
    payout_account_number: str
    payout_account_holder: str
    portfolio_url: str | None = None
    sample_content_url: str | None = None
    introduction: str
    status: str
    rejection_reason: str | None = None
    admin_notes: str | None = None
    reviewed_by: str | None = None
    reviewed_at: datetime | None = None
    created_at: datetime
    updated_at: datetime


class AdminReviewRequest(BaseModel):
    reason: str | None = None
    admin_notes: str | None = None


class ProductCreate(BaseModel):
    title: str = Field(min_length=1, max_length=255)
    slug: str = Field(min_length=2, max_length=160)
    description: str | None = None
    subject: str | None = None
    grade_level: str | None = None
    curriculum: str | None = None
    unit_tags: list[str] = []
    difficulty: str | None = None
    question_count: int = 0
    exam_type: str | None = None
    thumbnail_url: str | None = None
    preview_images: list[str] = []
    rights_declared: bool = False
    price: int = 0


class ProductUpdate(BaseModel):
    title: str | None = None
    slug: str | None = None
    description: str | None = None
    subject: str | None = None
    grade_level: str | None = None
    curriculum: str | None = None
    unit_tags: list[str] | None = None
    difficulty: str | None = None
    question_count: int | None = None
    exam_type: str | None = None
    thumbnail_url: str | None = None
    preview_images: list[str] | None = None
    rights_declared: bool | None = None
    price: int | None = None


class ProductRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    creator_id: str
    title: str
    slug: str
    description: str | None = None
    subject: str | None = None
    grade_level: str | None = None
    curriculum: str | None = None
    unit_tags: list = []
    difficulty: str | None = None
    question_count: int
    exam_type: str | None = None
    thumbnail_url: str | None = None
    preview_images: list = []
    price: int
    currency: str
    status: str
    rights_declared: bool
    watermark_enabled: bool
    published_at: datetime | None = None
    created_at: datetime
    updated_at: datetime


class ProductVersionCreate(BaseModel):
    changelog: str | None = None
    preview_url: str | None = None


class ProductVersionRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    product_id: UUID
    version_number: int
    changelog: str | None = None
    preview_url: str | None = None
    status: str
    created_at: datetime


class LicenseTierCreate(BaseModel):
    code: str
    name: str
    price: int = 0
    allowed_students_count: int | None = None
    allowed_print_count: int | None = None
    allowed_branches_count: int | None = None
    commercial_use_allowed: bool = True
    redistribution_allowed: bool = False
    license_terms_text: str


class LicenseTierRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    product_id: UUID
    code: str
    name: str
    price: int
    allowed_students_count: int | None = None
    allowed_print_count: int | None = None
    allowed_branches_count: int | None = None
    commercial_use_allowed: bool
    redistribution_allowed: bool
    license_terms_text: str


class PurchaseRequest(BaseModel):
    license_tier_id: UUID


class MarketplaceOrderRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    buyer_user_id: str
    status: str
    gross_amount: int
    payment_fee_amount: int
    platform_commission_amount: int
    creator_net_amount: int
    currency: str
    payment_provider: str
    created_at: datetime


class ProductLicenseRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    buyer_user_id: str
    product_id: UUID
    product_version_id: UUID | None = None
    creator_id: str
    license_tier_id: UUID
    order_id: UUID
    terms_snapshot: str
    starts_at: datetime
    expires_at: datetime | None = None
    status: str


class PayoutRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    creator_id: str
    amount: int
    currency: str
    status: str
    period_start: datetime | None = None
    period_end: datetime | None = None
    created_at: datetime
    paid_at: datetime | None = None


class CopyrightReportCreate(BaseModel):
    reporter_name: str
    reporter_email: str
    product_id: UUID | None = None
    claim_description: str
    evidence_url: str | None = None


class CopyrightReportRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    reporter_name: str
    reporter_email: str
    product_id: UUID | None = None
    claim_description: str
    evidence_url: str | None = None
    status: str
    admin_notes: str | None = None
    created_at: datetime
    resolved_at: datetime | None = None


class AuditLogRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    actor_id: str | None = None
    action: str
    target_type: str | None = None
    target_id: str | None = None
    metadata_json: dict
    created_at: datetime


class AcademyProfile(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    email: EmailStr
    email_verified: bool
    academy_name: str
    account_type: str = "academy"
    business_number: str | None = None
    phone: str | None = None
    address: str | None = None
    plan: str
    plan_expires_at: datetime | None = None
    is_active: bool
    is_suspended: bool
    suspension_reason: str | None = None
    created_at: datetime
    updated_at: datetime
    last_login_at: datetime | None = None
    totp_enabled: bool = False
    totp_enabled_at: datetime | None = None


class RegisterRequest(BaseModel):
    email: EmailStr
    password: str = Field(min_length=8, max_length=128)
    verification_code: str = Field(min_length=6, max_length=6)
    verification_session: str = Field(min_length=16)
    academy_name: str | None = Field(default=None, min_length=2, max_length=255)
    account_type: str = "academy"
    business_number: str | None = Field(default=None, max_length=50)
    phone: str | None = Field(default=None, max_length=50)
    address: str | None = Field(default=None, max_length=500)
    agree_terms: bool
    agree_privacy: bool
    agree_marketing: bool = False

    @field_validator("account_type")
    @classmethod
    def valid_account_type(cls, value: str) -> str:
        if value not in {"academy", "student"}:
            raise ValueError("account_type must be academy or student")
        return value

    @field_validator("agree_terms", "agree_privacy")
    @classmethod
    def required_agreement(cls, value: bool) -> bool:
        if not value:
            raise ValueError("필수 약관에 동의해야 합니다.")
        return value


class RegistrationCodeRequest(BaseModel):
    email: EmailStr


class RegistrationCodeResponse(BaseModel):
    message: str
    verification_session: str
    expires_in_seconds: int = 600


class VerifyEmailRequest(BaseModel):
    token: str = Field(min_length=16)


class ResendVerificationRequest(BaseModel):
    email: EmailStr


class LoginRequest(BaseModel):
    email: EmailStr
    password: str
    totp_code: str | None = None
    remember: bool = True


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    academy: AcademyProfile


class AccessTokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"


class TotpRequiredResponse(BaseModel):
    requires_totp: bool = True
    academy_id: UUID


class ForgotPasswordRequest(BaseModel):
    email: EmailStr


class ResetPasswordRequest(BaseModel):
    token: str = Field(min_length=16)
    new_password: str = Field(min_length=8, max_length=128)


class ResetPasswordValidateResponse(BaseModel):
    valid: bool


class ChangePasswordRequest(BaseModel):
    current_password: str
    new_password: str = Field(min_length=8, max_length=128)


class ProfileUpdateRequest(BaseModel):
    academy_name: str | None = Field(default=None, min_length=2, max_length=255)
    account_type: str | None = None
    phone: str | None = Field(default=None, max_length=50)
    address: str | None = Field(default=None, max_length=500)
    business_number: str | None = Field(default=None, max_length=50)

    @field_validator("account_type")
    @classmethod
    def valid_optional_account_type(cls, value: str | None) -> str | None:
        if value is not None and value not in {"academy", "student"}:
            raise ValueError("account_type must be academy or student")
        return value


class TotpSetupResponse(BaseModel):
    qr_code_url: str
    secret: str
    backup_codes: list[str]


class TotpEnableRequest(BaseModel):
    totp_code: str = Field(min_length=6, max_length=6)


class TotpDisableRequest(BaseModel):
    password: str
    totp_code: str = Field(min_length=6, max_length=6)


class BackupCodeLoginRequest(BaseModel):
    academy_id: UUID
    backup_code: str = Field(min_length=6, max_length=32)


class SessionRead(BaseModel):
    id: UUID
    device_info: str | None
    browser: str
    os: str
    ip_address: str
    last_active_at: datetime
    created_at: datetime
    is_current: bool


class LoginHistoryRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    ip_address: str
    user_agent: str
    device_type: str
    os: str
    browser: str
    country: str | None
    login_at: datetime
    success: bool
    failure_reason: str | None
    provider: str


class OAuthAccountRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    provider: str
    provider_email: str | None
    created_at: datetime


class AccountDeleteRequest(BaseModel):
    password: str
