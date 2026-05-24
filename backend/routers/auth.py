import uuid
import time
import secrets
import hashlib
import hmac
from datetime import timedelta
from urllib.parse import urlencode, urlsplit, urlunsplit

from authlib.integrations.starlette_client import OAuth
from fastapi import APIRouter, Depends, HTTPException, Query, Request, Response, status
from fastapi.responses import RedirectResponse
from jose import JWTError, jwt
from sqlalchemy import select
from sqlalchemy.orm import Session

from database import get_db, get_settings
from limiter import limiter
from models import (
    Academy,
    AcademyPlan,
    ActiveSession,
    EmailVerification,
    OAuthAccount,
    OAuthProvider,
    PasswordResetToken,
    Plan,
    RefreshToken,
    Subscription,
    TotpSecret,
)
from schemas import (
    AcademyProfile,
    AccountDeleteRequest,
    BackupCodeLoginRequest,
    ChangePasswordRequest,
    ForgotPasswordRequest,
    LoginHistoryRead,
    OAuthAccountRead,
    LoginRequest,
    ProfileUpdateRequest,
    RegistrationCodeRequest,
    RegistrationCodeResponse,
    RegisterRequest,
    ResendVerificationRequest,
    ResetPasswordRequest,
    ResetPasswordValidateResponse,
    SessionRead,
    SocialSignupCompleteRequest,
    TokenResponse,
    TotpDisableRequest,
    TotpEnableRequest,
    TotpRequiredResponse,
    TotpSetupResponse,
    VerifyEmailRequest,
)
from services.auth_email import (
    send_account_locked_email,
    send_backup_code_used_email,
    send_new_device_login_email,
    send_password_changed_email,
    send_password_reset_email,
    send_registration_code_email,
    send_verification_email,
)
from services.auth_security import (
    blacklist_access_jti,
    clear_refresh_cookie,
    consume_backup_code,
    create_access_token,
    decrypt_secret,
    encrypt_secret,
    get_current_academy,
    get_raw_access_token,
    get_real_ip,
    get_refresh_token_from_cookie,
    hash_password,
    issue_refresh_token,
    make_totp_setup,
    now_utc,
    parse_user_agent,
    random_url_token,
    record_login_history,
    revoke_all_refresh_tokens,
    revoke_refresh_token,
    set_refresh_cookie,
    sha256_token,
    timing_attack_delay,
    validate_password_policy,
    verify_password,
    verify_refresh_record,
    verify_totp,
)
from services.subject_engines import subject_engine_pricing

settings = get_settings()
router = APIRouter(prefix="/api/auth", tags=["auth"])
oauth = OAuth()

if settings.google_client_id and settings.google_client_secret:
    oauth.register(
        name="google",
        client_id=settings.google_client_id,
        client_secret=settings.google_client_secret,
        server_metadata_url="https://accounts.google.com/.well-known/openid-configuration",
        client_kwargs={"scope": "openid profile"},
    )

if settings.kakao_client_id:
    oauth.register(
        name="kakao",
        client_id=settings.kakao_client_id,
        client_secret=settings.kakao_client_secret or None,
        authorize_url="https://kauth.kakao.com/oauth/authorize",
        access_token_url="https://kauth.kakao.com/oauth/token",
        client_kwargs={"scope": "profile_nickname"},
    )

if settings.naver_client_id and settings.naver_client_secret:
    oauth.register(
        name="naver",
        client_id=settings.naver_client_id,
        client_secret=settings.naver_client_secret,
        authorize_url="https://nid.naver.com/oauth2.0/authorize",
        access_token_url="https://nid.naver.com/oauth2.0/token",
    )


def _profile(academy: Academy) -> AcademyProfile:
    return AcademyProfile.model_validate(academy)


def _issue_token_response(db: Session, request: Request, response: Response, academy: Academy, remember: bool = True) -> TokenResponse:
    access_token, _, _ = create_access_token(academy)
    refresh_token, _ = issue_refresh_token(db, request, academy, remember=remember)
    set_refresh_cookie(response, refresh_token, remember=remember)
    return TokenResponse(access_token=access_token, academy=_profile(academy))


def _create_email_verification(db: Session, academy: Academy) -> str:
    token = random_url_token(32)
    db.add(
        EmailVerification(
            academy_id=academy.id,
            token_hash=sha256_token(token),
            expires_at=now_utc() + timedelta(hours=24),
        )
    )
    return token


def _create_password_reset(db: Session, academy: Academy, ip_address: str) -> str:
    token = random_url_token(32)
    db.add(
        PasswordResetToken(
            academy_id=academy.id,
            token_hash=sha256_token(token),
            expires_at=now_utc() + timedelta(minutes=15),
            ip_address=ip_address,
        )
    )
    return token


def _default_academy_name(email: str) -> str:
    local_part = email.split("@", 1)[0].strip()
    return (local_part[:64] or "Tena 사용자")


def _oauth_internal_email(provider: str, provider_account_id: str) -> str:
    digest = hashlib.sha256(f"{provider}:{provider_account_id}".encode("utf-8")).hexdigest()[:24]
    return f"{provider}-{digest}@oauth.tena-forge.com"


def _login_internal_email(login_id: str) -> str:
    return f"{login_id.strip().lower()}@login.tena-forge.com"


def _login_lookup_email(identifier: str) -> str:
    value = identifier.strip().lower()
    if "@" in value:
        return value
    return _login_internal_email(value)


def _create_social_signup_token(provider: str, provider_account_id: str, nickname: str) -> str:
    now = int(time.time())
    payload = {
        "type": "social_signup",
        "provider": provider,
        "provider_account_id": provider_account_id,
        "nickname": nickname,
        "iat": now,
        "exp": now + 900,
    }
    return jwt.encode(payload, settings.secret_key, algorithm=settings.algorithm)


def _decode_social_signup_token(token: str) -> dict:
    try:
        payload = jwt.decode(token, settings.secret_key, algorithms=[settings.algorithm])
    except JWTError:
        raise HTTPException(status_code=400, detail="소셜 인증이 만료되었습니다. 다시 회원가입을 시작해주세요.")
    if payload.get("type") != "social_signup" or payload.get("provider") not in {"kakao", "naver", "google"} or not payload.get("provider_account_id"):
        raise HTTPException(status_code=400, detail="소셜 인증 정보가 올바르지 않습니다.")
    return payload


def _safe_redirect(value: str | None) -> str | None:
    if not value:
        return None
    clean = value.strip()
    if not clean.startswith("/") or clean.startswith("//"):
        return None
    return clean[:500]


def _safe_account_type(value: str | None) -> str:
    return value if value in {"academy", "student"} else "academy"


def _safe_oauth_mode(value: str | None) -> str:
    return "signup" if value == "signup" else "login"


def _store_oauth_intent(request: Request, *, mode: str, account_type: str | None, redirect: str | None) -> None:
    request.session["oauth_intent"] = {
        "mode": _safe_oauth_mode(mode),
        "account_type": _safe_account_type(account_type) if account_type else None,
        "redirect": _safe_redirect(redirect),
    }


def _consume_oauth_intent(request: Request) -> dict:
    try:
        data = request.session.pop("oauth_intent", {})
    except AssertionError:
        data = {}
    if not isinstance(data, dict):
        data = {}
    return {
        "mode": _safe_oauth_mode(data.get("mode")),
        "account_type": _safe_account_type(data.get("account_type")) if data.get("account_type") else None,
        "redirect": _safe_redirect(data.get("redirect")),
    }


def _oauth_error_redirect(code: str, *, mode: str = "login") -> RedirectResponse:
    target = "/register" if mode == "signup" else "/login"
    return RedirectResponse(f"{settings.frontend_url}{target}?{urlencode({'oauth_error': code})}", status_code=302)


def _start_basic_trial(db: Session, academy: Academy) -> None:
    if academy.account_type != "academy":
        academy.plan = AcademyPlan.free
        academy.plan_expires_at = None
        return
    now = now_utc()
    trial_end = now + timedelta(days=7)
    academy.plan = AcademyPlan.basic
    academy.plan_expires_at = trial_end
    plan_price = db.scalar(select(Plan.monthly_price).where(Plan.code == "basic")) or 48_000
    pricing = subject_engine_pricing(int(plan_price), ["math"])
    db.add(
        Subscription(
            user_id=str(academy.id),
            plan_code="basic",
            status="trialing",
            provider="trial",
            current_period_start=now,
            current_period_end=trial_end,
            enabled_subject_engines=pricing["enabled_subject_engines"],
            subject_engine_count=int(pricing["subject_engine_count"]),
            subject_multiplier=float(pricing["subject_multiplier"]),
            final_monthly_price=int(pricing["final_monthly_price"]),
            final_annual_price=int(pricing["final_annual_price"]),
        )
    )


def _registration_code_proof(email: str, code: str, nonce: str, expires_at: int) -> str:
    message = f"{email}:{code}:{nonce}:{expires_at}".encode("utf-8")
    return hmac.new(settings.secret_key.encode("utf-8"), message, hashlib.sha256).hexdigest()


def _create_registration_session(email: str, code: str) -> str:
    now = int(time.time())
    expires_at = now + 600
    nonce = secrets.token_urlsafe(18)
    payload = {
        "type": "registration_code",
        "email": email,
        "nonce": nonce,
        "proof": _registration_code_proof(email, code, nonce, expires_at),
        "iat": now,
        "exp": expires_at,
    }
    return jwt.encode(payload, settings.secret_key, algorithm=settings.algorithm)


def _verify_registration_code(email: str, code: str, verification_session: str) -> None:
    try:
        payload = jwt.decode(verification_session, settings.secret_key, algorithms=[settings.algorithm])
    except JWTError:
        raise HTTPException(status_code=400, detail="인증 코드가 만료되었거나 올바르지 않습니다.")
    if payload.get("type") != "registration_code" or payload.get("email") != email:
        raise HTTPException(status_code=400, detail="인증 코드가 요청한 이메일과 일치하지 않습니다.")
    nonce = str(payload.get("nonce") or "")
    expires_at = int(payload.get("exp") or 0)
    expected_proof = str(payload.get("proof") or "")
    actual_proof = _registration_code_proof(email, code.strip(), nonce, expires_at)
    if not nonce or not secrets.compare_digest(expected_proof, actual_proof):
        raise HTTPException(status_code=400, detail="인증 코드가 올바르지 않습니다.")


def _apply_failed_login_policy(academy: Academy) -> None:
    academy.failed_login_attempts += 1
    attempts = academy.failed_login_attempts
    if attempts >= 20:
        academy.is_suspended = True
        academy.suspension_reason = "로그인 실패가 반복되어 계정이 잠겼습니다. 관리자에게 문의해주세요."
        academy.locked_until = None
    elif attempts >= 10:
        academy.locked_until = now_utc() + timedelta(hours=24)
        send_account_locked_email(academy.email, academy.locked_until)
    elif attempts >= 5:
        academy.locked_until = now_utc() + timedelta(minutes=15)


@router.post("/register/code", response_model=RegistrationCodeResponse)
@limiter.limit("5/hour")
def request_registration_code(payload: RegistrationCodeRequest, request: Request, db: Session = Depends(get_db)):
    email = payload.email.lower()
    existing_id = db.scalar(select(Academy.id).where(Academy.email == email))
    code = f"{secrets.randbelow(1_000_000):06d}"
    verification_session = _create_registration_session(email, code)
    if not existing_id:
        if not settings.smtp_host:
            raise HTTPException(status_code=503, detail="SMTP is not configured. Set SMTP_HOST, SMTP_USER, SMTP_PASSWORD, and EMAIL_FROM in Render.")
        if not send_registration_code_email(email, code):
            raise HTTPException(status_code=503, detail="Registration email delivery failed. Please try again later.")
    return {
        "message": "Verification code sent by email.",
        "verification_session": verification_session,
        "expires_in_seconds": 600,
    }


@router.post("/register")
@limiter.limit("3/hour")
def register(payload: RegisterRequest, request: Request, db: Session = Depends(get_db)):
    email = payload.email.lower()
    _verify_registration_code(email, payload.verification_code, payload.verification_session)
    academy_name = (payload.academy_name or _default_academy_name(email)).strip()
    validate_password_policy(payload.password, email, academy_name)
    existing = db.scalar(select(Academy).where(Academy.email == email))
    if existing:
        raise HTTPException(status_code=409, detail="이미 가입된 이메일입니다.")
    academy = Academy(
        email=email,
        password_hash=hash_password(payload.password),
        academy_name=academy_name,
        account_type=payload.account_type,
        business_number=payload.business_number,
        phone=payload.phone,
        address=payload.address,
        plan=AcademyPlan.free,
        is_active=True,
        email_verified=True,
        email_verified_at=now_utc(),
    )
    db.add(academy)
    db.flush()
    _start_basic_trial(db, academy)
    db.commit()
    return {"message": "회원가입이 완료되었습니다.", "email": academy.email}


@router.post("/register/social-complete", response_model=TokenResponse)
@limiter.limit("5/hour")
def complete_social_signup(payload: SocialSignupCompleteRequest, request: Request, response: Response, db: Session = Depends(get_db)):
    social = _decode_social_signup_token(payload.signup_token)
    provider = str(social["provider"])
    provider_account_id = str(social["provider_account_id"])
    existing_oauth = db.scalar(
        select(OAuthAccount).where(
            OAuthAccount.provider == OAuthProvider(provider),
            OAuthAccount.provider_account_id == provider_account_id,
        )
    )
    if existing_oauth:
        raise HTTPException(status_code=409, detail="이미 가입된 소셜 계정입니다. 로그인 화면에서 계속해주세요.")

    login_email = _login_internal_email(payload.login_id)
    if db.scalar(select(Academy.id).where(Academy.email == login_email)):
        raise HTTPException(status_code=409, detail="이미 사용 중인 아이디입니다.")

    nickname = payload.nickname.strip()
    validate_password_policy(payload.password, login_email, nickname)
    academy = Academy(
        email=login_email,
        password_hash=hash_password(payload.password),
        academy_name=nickname,
        account_type="academy",
        plan=AcademyPlan.free,
        email_verified=True,
        email_verified_at=now_utc(),
        is_active=True,
    )
    db.add(academy)
    db.flush()
    db.add(
        OAuthAccount(
            academy_id=academy.id,
            provider=OAuthProvider(provider),
            provider_account_id=provider_account_id,
            provider_email=None,
            access_token="",
            refresh_token=None,
            token_expires_at=None,
        )
    )
    academy.last_login_at = now_utc()
    academy.last_login_ip = get_real_ip(request)
    record_login_history(db, request, academy, True, provider=provider)
    result = _issue_token_response(db, request, response, academy)
    db.commit()
    return result


@router.post("/verify-email", response_model=TokenResponse)
def verify_email(payload: VerifyEmailRequest, request: Request, response: Response, db: Session = Depends(get_db)):
    token_hash = sha256_token(payload.token)
    record = db.scalar(
        select(EmailVerification).where(
            EmailVerification.token_hash == token_hash,
            EmailVerification.expires_at > now_utc(),
            EmailVerification.used_at.is_(None),
        )
    )
    if not record:
        raise HTTPException(status_code=400, detail="유효하지 않거나 만료된 링크입니다")
    academy = record.academy
    academy.email_verified = True
    academy.email_verified_at = now_utc()
    academy.is_active = True
    record.used_at = now_utc()
    academy.last_login_at = now_utc()
    academy.last_login_ip = get_real_ip(request)
    record_login_history(db, request, academy, True, provider="email")
    result = _issue_token_response(db, request, response, academy)
    db.commit()
    return result


@router.post("/resend-verification")
@limiter.limit("2/hour")
def resend_verification(payload: ResendVerificationRequest, request: Request, db: Session = Depends(get_db)):
    academy = db.scalar(select(Academy).where(Academy.email == payload.email.lower()))
    if academy and not academy.email_verified:
        token = _create_email_verification(db, academy)
        db.commit()
        send_verification_email(academy.email, academy.academy_name, token)
    return {"message": "인증 이메일을 확인해주세요"}


@router.post("/login", response_model=TokenResponse | TotpRequiredResponse)
@limiter.limit("5 per 15 minutes")
def login(payload: LoginRequest, request: Request, response: Response, db: Session = Depends(get_db)):
    academy = db.scalar(select(Academy).where(Academy.email == _login_lookup_email(payload.email)))
    generic = "아이디 또는 비밀번호가 올바르지 않습니다"
    if not academy:
        timing_attack_delay()
        record_login_history(db, request, None, False, failure_reason="not_found")
        db.commit()
        raise HTTPException(status_code=401, detail=generic)
    if not academy.is_active or not academy.email_verified:
        record_login_history(db, request, academy, False, failure_reason="email_unverified")
        db.commit()
        raise HTTPException(status_code=401, detail="이메일 인증이 필요합니다")
    if academy.is_suspended:
        record_login_history(db, request, academy, False, failure_reason="suspended")
        db.commit()
        raise HTTPException(status_code=403, detail=academy.suspension_reason or "정지된 계정입니다.")
    if academy.locked_until and academy.locked_until > now_utc():
        record_login_history(db, request, academy, False, failure_reason="locked")
        db.commit()
        raise HTTPException(status_code=423, detail={"message": "계정이 잠겨 있습니다", "locked_until": academy.locked_until.isoformat()})
    if not verify_password(payload.password, academy.password_hash):
        _apply_failed_login_policy(academy)
        record_login_history(db, request, academy, False, failure_reason="bad_password")
        db.commit()
        raise HTTPException(status_code=401, detail=generic)
    if academy.totp_secret and academy.totp_secret.enabled:
        if not payload.totp_code:
            return TotpRequiredResponse(academy_id=academy.id)
        if not verify_totp(academy.totp_secret.secret_encrypted, payload.totp_code):
            record_login_history(db, request, academy, False, failure_reason="bad_totp")
            db.commit()
            raise HTTPException(status_code=401, detail="인증 코드가 올바르지 않습니다")
    academy.failed_login_attempts = 0
    academy.locked_until = None
    academy.last_login_at = now_utc()
    academy.last_login_ip = get_real_ip(request)
    record_login_history(db, request, academy, True, provider="email")
    parsed = parse_user_agent(request.headers.get("user-agent", ""))
    send_new_device_login_email(academy.email, parsed["browser"], parsed["os"], get_real_ip(request))
    result = _issue_token_response(db, request, response, academy, remember=payload.remember)
    db.commit()
    return result


@router.post("/refresh")
def refresh(request: Request, response: Response, db: Session = Depends(get_db)):
    try:
        token = get_refresh_token_from_cookie(request)
        old_refresh = verify_refresh_record(db, token)
    except HTTPException:
        clear_refresh_cookie(response)
        raise
    academy = old_refresh.academy
    if old_refresh.active_session:
        db.delete(old_refresh.active_session)
    revoke_refresh_token(old_refresh, "rotated")
    access_token, _, _ = create_access_token(academy)
    new_refresh, _ = issue_refresh_token(db, request, academy, remember=True)
    set_refresh_cookie(response, new_refresh, remember=True)
    db.commit()
    return {"access_token": access_token, "token_type": "bearer"}


@router.post("/logout")
def logout(
    request: Request,
    response: Response,
    token_data: tuple[str, dict] = Depends(get_raw_access_token),
    db: Session = Depends(get_db),
):
    _, payload = token_data
    blacklist_access_jti(payload["jti"], now_utc() + timedelta(seconds=max(1, int(payload["exp"]) - int(time.time()))))
    raw_refresh = request.cookies.get(settings.refresh_cookie_name)
    if raw_refresh:
        try:
            refresh = verify_refresh_record(db, raw_refresh)
            if refresh.active_session:
                db.delete(refresh.active_session)
            revoke_refresh_token(refresh, "logout")
        except HTTPException:
            pass
    clear_refresh_cookie(response)
    db.commit()
    return {"message": "로그아웃되었습니다"}


@router.post("/logout-all")
def logout_all(
    response: Response,
    academy: Academy = Depends(get_current_academy),
    db: Session = Depends(get_db),
):
    revoke_all_refresh_tokens(db, academy.id, "logout_all")
    db.query(ActiveSession).filter(ActiveSession.academy_id == academy.id).delete(synchronize_session=False)
    clear_refresh_cookie(response)
    db.commit()
    return {"message": "모든 기기에서 로그아웃되었습니다"}


@router.post("/forgot-password")
@limiter.limit("3/hour")
def forgot_password(payload: ForgotPasswordRequest, request: Request, db: Session = Depends(get_db)):
    academy = db.scalar(select(Academy).where(Academy.email == payload.email.lower()))
    if academy:
        token = _create_password_reset(db, academy, get_real_ip(request))
        db.commit()
        send_password_reset_email(academy.email, token, get_real_ip(request))
    return {"message": "이메일을 발송했습니다. 받은 편지함을 확인해주세요."}


@router.get("/reset-password/validate", response_model=ResetPasswordValidateResponse)
def validate_reset_token(token: str = Query(...), db: Session = Depends(get_db)):
    record = db.scalar(
        select(PasswordResetToken).where(
            PasswordResetToken.token_hash == sha256_token(token),
            PasswordResetToken.expires_at > now_utc(),
            PasswordResetToken.used_at.is_(None),
        )
    )
    return {"valid": bool(record)}


@router.post("/reset-password")
def reset_password(payload: ResetPasswordRequest, request: Request, db: Session = Depends(get_db)):
    record = db.scalar(
        select(PasswordResetToken).where(
            PasswordResetToken.token_hash == sha256_token(payload.token),
            PasswordResetToken.expires_at > now_utc(),
            PasswordResetToken.used_at.is_(None),
        )
    )
    if not record:
        raise HTTPException(status_code=400, detail="유효하지 않거나 만료된 링크입니다")
    academy = record.academy
    validate_password_policy(payload.new_password, academy.email, academy.academy_name)
    academy.password_hash = hash_password(payload.new_password)
    record.used_at = now_utc()
    revoke_all_refresh_tokens(db, academy.id, "password_reset")
    db.query(ActiveSession).filter(ActiveSession.academy_id == academy.id).delete(synchronize_session=False)
    db.commit()
    send_password_changed_email(academy.email, get_real_ip(request))
    return {"message": "비밀번호가 변경되었습니다"}


@router.post("/change-password")
def change_password(payload: ChangePasswordRequest, request: Request, academy: Academy = Depends(get_current_academy), db: Session = Depends(get_db)):
    if not verify_password(payload.current_password, academy.password_hash):
        raise HTTPException(status_code=401, detail="현재 비밀번호가 올바르지 않습니다")
    if verify_password(payload.new_password, academy.password_hash):
        raise HTTPException(status_code=400, detail="기존 비밀번호와 다른 비밀번호를 사용해주세요")
    validate_password_policy(payload.new_password, academy.email, academy.academy_name)
    academy.password_hash = hash_password(payload.new_password)
    revoke_all_refresh_tokens(db, academy.id, "password_changed")
    db.query(ActiveSession).filter(ActiveSession.academy_id == academy.id).delete(synchronize_session=False)
    db.commit()
    send_password_changed_email(academy.email, get_real_ip(request))
    return {"message": "비밀번호가 변경되었습니다"}


@router.post("/2fa/setup", response_model=TotpSetupResponse)
def setup_2fa(academy: Academy = Depends(get_current_academy), db: Session = Depends(get_db)):
    _, secret, backup_codes, qr_code_url = make_totp_setup(db, academy)
    db.commit()
    return TotpSetupResponse(qr_code_url=qr_code_url, secret=secret, backup_codes=backup_codes)


@router.post("/2fa/enable")
def enable_2fa(payload: TotpEnableRequest, academy: Academy = Depends(get_current_academy), db: Session = Depends(get_db)):
    if not academy.totp_secret or not verify_totp(academy.totp_secret.secret_encrypted, payload.totp_code):
        raise HTTPException(status_code=400, detail="인증 코드가 올바르지 않습니다")
    academy.totp_secret.enabled = True
    academy.totp_secret.enabled_at = now_utc()
    revoke_all_refresh_tokens(db, academy.id, "2fa_enabled")
    db.commit()
    return {"message": "2단계 인증이 활성화되었습니다"}


@router.post("/2fa/disable")
def disable_2fa(payload: TotpDisableRequest, request: Request, academy: Academy = Depends(get_current_academy), db: Session = Depends(get_db)):
    if not verify_password(payload.password, academy.password_hash):
        raise HTTPException(status_code=401, detail="비밀번호가 올바르지 않습니다")
    if not academy.totp_secret or not verify_totp(academy.totp_secret.secret_encrypted, payload.totp_code):
        raise HTTPException(status_code=400, detail="인증 코드가 올바르지 않습니다")
    db.delete(academy.totp_secret)
    db.commit()
    send_password_changed_email(academy.email, get_real_ip(request))
    return {"message": "2단계 인증이 비활성화되었습니다"}


@router.post("/2fa/backup-code", response_model=TokenResponse)
def login_with_backup_code(payload: BackupCodeLoginRequest, request: Request, response: Response, db: Session = Depends(get_db)):
    academy = db.get(Academy, payload.academy_id)
    if not academy or not academy.totp_secret or not academy.totp_secret.enabled:
        raise HTTPException(status_code=401, detail="인증이 필요합니다")
    if not consume_backup_code(academy.totp_secret, payload.backup_code):
        record_login_history(db, request, academy, False, failure_reason="bad_backup_code")
        db.commit()
        raise HTTPException(status_code=401, detail="백업 코드가 올바르지 않습니다")
    academy.failed_login_attempts = 0
    academy.last_login_at = now_utc()
    academy.last_login_ip = get_real_ip(request)
    record_login_history(db, request, academy, True, provider="email")
    result = _issue_token_response(db, request, response, academy)
    db.commit()
    send_backup_code_used_email(academy.email, get_real_ip(request))
    return result


@router.get("/sessions", response_model=list[SessionRead])
def list_sessions(request: Request, academy: Academy = Depends(get_current_academy), db: Session = Depends(get_db)):
    current_refresh_id = None
    raw_refresh = request.cookies.get(settings.refresh_cookie_name)
    if raw_refresh:
        try:
            current_refresh_id, _ = raw_refresh.split(".", 1)
            current_refresh_id = uuid.UUID(current_refresh_id)
        except Exception:
            current_refresh_id = None
    sessions = db.scalars(select(ActiveSession).where(ActiveSession.academy_id == academy.id).order_by(ActiveSession.last_active_at.desc())).all()
    result = []
    for session in sessions:
        refresh = session.refresh_token
        parsed = parse_user_agent(refresh.device_info or "")
        result.append(
            SessionRead(
                id=session.id,
                device_info=refresh.device_info,
                browser=parsed["browser"] if parsed["browser"] != "Unknown" else (refresh.device_info or "Unknown"),
                os=parsed["os"],
                ip_address=refresh.ip_address,
                last_active_at=session.last_active_at,
                created_at=session.created_at,
                is_current=refresh.id == current_refresh_id,
            )
        )
    return result


@router.delete("/sessions/{session_id}")
def revoke_session(session_id: uuid.UUID, academy: Academy = Depends(get_current_academy), db: Session = Depends(get_db)):
    session = db.get(ActiveSession, session_id)
    if not session or session.academy_id != academy.id:
        raise HTTPException(status_code=404, detail="세션을 찾을 수 없습니다")
    revoke_refresh_token(session.refresh_token, "session_revoked")
    db.delete(session)
    db.commit()
    return {"message": "세션이 종료되었습니다"}


@router.delete("/sessions")
def revoke_other_sessions(request: Request, academy: Academy = Depends(get_current_academy), db: Session = Depends(get_db)):
    current_id = None
    raw_refresh = request.cookies.get(settings.refresh_cookie_name)
    if raw_refresh:
        try:
            current_id, _ = raw_refresh.split(".", 1)
            current_id = uuid.UUID(current_id)
        except Exception:
            current_id = None
    revoke_all_refresh_tokens(db, academy.id, "other_sessions_revoked", except_id=current_id)
    if current_id:
        db.query(ActiveSession).filter(ActiveSession.academy_id == academy.id, ActiveSession.refresh_token_id != current_id).delete(synchronize_session=False)
    else:
        db.query(ActiveSession).filter(ActiveSession.academy_id == academy.id).delete(synchronize_session=False)
    db.commit()
    return {"message": "다른 기기에서 로그아웃되었습니다"}


@router.get("/me", response_model=AcademyProfile)
def me(academy: Academy = Depends(get_current_academy)):
    return academy


@router.patch("/me", response_model=AcademyProfile)
def update_me(payload: ProfileUpdateRequest, academy: Academy = Depends(get_current_academy), db: Session = Depends(get_db)):
    for field in ("academy_name", "account_type", "phone", "address", "business_number"):
        value = getattr(payload, field)
        if value is not None:
            setattr(academy, field, value)
    if payload.account_type == "student":
        academy.plan = AcademyPlan.free
        academy.plan_expires_at = None
        for subscription in db.scalars(select(Subscription).where(Subscription.user_id == str(academy.id), Subscription.status == "trialing")).all():
            subscription.status = "canceled"
    elif payload.account_type == "academy" and not academy.plan_expires_at:
        active_sub = db.scalar(
            select(Subscription).where(
                Subscription.user_id == str(academy.id),
                Subscription.status.in_(["trialing", "active"]),
                ((Subscription.current_period_end.is_(None)) | (Subscription.current_period_end > now_utc())),
            )
        )
        if not active_sub:
            _start_basic_trial(db, academy)
    db.commit()
    db.refresh(academy)
    return academy


@router.get("/login-history", response_model=list[LoginHistoryRead])
def login_history(academy: Academy = Depends(get_current_academy)):
    return sorted(academy.login_history, key=lambda item: item.login_at, reverse=True)[:30]


@router.get("/oauth-accounts", response_model=list[OAuthAccountRead])
def oauth_accounts(academy: Academy = Depends(get_current_academy)):
    return academy.oauth_accounts


@router.delete("/oauth-accounts/{provider}")
def unlink_oauth_account(provider: OAuthProvider, academy: Academy = Depends(get_current_academy), db: Session = Depends(get_db)):
    account = next((item for item in academy.oauth_accounts if item.provider == provider), None)
    if not account:
        raise HTTPException(status_code=404, detail="연결된 소셜 계정을 찾을 수 없습니다")
    if not academy.password_hash and len(academy.oauth_accounts) <= 1:
        raise HTTPException(status_code=400, detail="로그인 수단이 하나 이상 필요합니다")
    db.delete(account)
    db.commit()
    return {"message": "소셜 계정 연결이 해제되었습니다"}


@router.delete("/me")
def delete_account(payload: AccountDeleteRequest, response: Response, academy: Academy = Depends(get_current_academy), db: Session = Depends(get_db)):
    if academy.password_hash and not verify_password(payload.password, academy.password_hash):
        raise HTTPException(status_code=401, detail="비밀번호가 올바르지 않습니다")
    revoke_all_refresh_tokens(db, academy.id, "account_deleted")
    db.delete(academy)
    clear_refresh_cookie(response)
    db.commit()
    return {"message": "계정이 삭제되었습니다"}


def _oauth_client(name: str):
    client = getattr(oauth, name, None)
    if client is None:
        raise HTTPException(status_code=503, detail=f"{name} OAuth 설정이 필요합니다")
    return client


def _oauth_callback_url(request: Request, callback_name: str) -> str:
    public_base = settings.public_api_url.strip().rstrip("/")
    if public_base:
        return f"{public_base}{request.app.url_path_for(callback_name)}"

    url = str(request.url_for(callback_name))
    parts = urlsplit(url)
    forwarded_proto = (request.headers.get("x-forwarded-proto") or "").split(",", 1)[0].strip()
    scheme = forwarded_proto or parts.scheme
    if parts.netloc.endswith(".onrender.com") and scheme == "http":
        scheme = "https"
    return urlunsplit((scheme, parts.netloc, parts.path, parts.query, parts.fragment))


@router.get("/google")
async def google_login(request: Request, mode: str = "login", account_type: str | None = None, redirect: str | None = None):
    _store_oauth_intent(request, mode=mode, account_type=account_type, redirect=redirect)
    redirect_uri = _oauth_callback_url(request, "google_callback")
    return await _oauth_client("google").authorize_redirect(request, redirect_uri)


@router.get("/google/callback", name="google_callback")
async def google_callback(request: Request, db: Session = Depends(get_db)):
    intent = _consume_oauth_intent(request)
    token = await _oauth_client("google").authorize_access_token(request)
    info = token.get("userinfo") or await _oauth_client("google").parse_id_token(request, token)
    return _oauth_finalize(db, request, "google", str(info["sub"]), info.get("name") or "Google Academy", token, intent)


@router.get("/kakao")
async def kakao_login(request: Request, mode: str = "login", account_type: str | None = None, redirect: str | None = None):
    _store_oauth_intent(request, mode=mode, account_type=account_type, redirect=redirect)
    redirect_uri = _oauth_callback_url(request, "kakao_callback")
    return await _oauth_client("kakao").authorize_redirect(request, redirect_uri)


@router.get("/kakao/callback", name="kakao_callback")
async def kakao_callback(request: Request, db: Session = Depends(get_db)):
    intent = _consume_oauth_intent(request)
    token = await _oauth_client("kakao").authorize_access_token(request)
    response = await _oauth_client("kakao").get("https://kapi.kakao.com/v2/user/me", token=token)
    data = response.json()
    account = data.get("kakao_account", {})
    profile = account.get("profile", {})
    return _oauth_finalize(db, request, "kakao", str(data["id"]), profile.get("nickname") or "Kakao Academy", token, intent)


@router.get("/naver")
async def naver_login(request: Request, mode: str = "login", account_type: str | None = None, redirect: str | None = None):
    _store_oauth_intent(request, mode=mode, account_type=account_type, redirect=redirect)
    redirect_uri = _oauth_callback_url(request, "naver_callback")
    return await _oauth_client("naver").authorize_redirect(request, redirect_uri)


@router.get("/naver/callback", name="naver_callback")
async def naver_callback(request: Request, db: Session = Depends(get_db)):
    intent = _consume_oauth_intent(request)
    token = await _oauth_client("naver").authorize_access_token(request)
    response = await _oauth_client("naver").get("https://openapi.naver.com/v1/nid/me", token=token)
    data = response.json().get("response", {})
    return _oauth_finalize(db, request, "naver", str(data["id"]), data.get("nickname") or "Naver 사용자", token, intent)


def _oauth_finalize(db: Session, request: Request, provider: str, provider_account_id: str, name: str, token: dict, intent: dict | None = None):
    intent = intent or {}
    mode = _safe_oauth_mode(intent.get("mode"))
    requested_account_type = _safe_account_type(intent.get("account_type")) if intent.get("account_type") else None
    oauth_account = db.scalar(
        select(OAuthAccount).where(
            OAuthAccount.provider == OAuthProvider(provider),
            OAuthAccount.provider_account_id == provider_account_id,
        )
    )
    if oauth_account:
        academy = oauth_account.academy
        if mode == "signup" and requested_account_type and academy.account_type != requested_account_type:
            return _oauth_error_redirect("account_type_conflict", mode=mode)
    else:
        academy = None
        if mode == "signup":
            signup_token = _create_social_signup_token(provider, provider_account_id, name)
            fragment = urlencode({"signup_token": signup_token, "nickname": name})
            return RedirectResponse(f"{settings.frontend_url}/register/complete#{fragment}", status_code=302)
        if not academy and mode == "login":
            return _oauth_error_redirect("signup_required", mode=mode)
        if not academy:
            academy = Academy(
                email=_oauth_internal_email(provider, provider_account_id),
                academy_name=name,
                account_type=requested_account_type or "academy",
                email_verified=True,
                email_verified_at=now_utc(),
                is_active=True,
                password_hash=None,
            )
            db.add(academy)
            db.flush()
            _start_basic_trial(db, academy)
            db.flush()
        oauth_account = OAuthAccount(
            academy_id=academy.id,
            provider=OAuthProvider(provider),
            provider_account_id=provider_account_id,
            provider_email=None,
            access_token=encrypt_secret(token.get("access_token")) or "",
            refresh_token=encrypt_secret(token.get("refresh_token")),
            token_expires_at=now_utc() + timedelta(seconds=int(token.get("expires_in", 0))) if token.get("expires_in") else None,
        )
        db.add(oauth_account)
    oauth_account.access_token = encrypt_secret(token.get("access_token")) or oauth_account.access_token
    oauth_account.refresh_token = encrypt_secret(token.get("refresh_token")) or oauth_account.refresh_token
    academy.email_verified = True
    academy.email_verified_at = academy.email_verified_at or now_utc()
    academy.is_active = True
    academy.last_login_at = now_utc()
    academy.last_login_ip = get_real_ip(request)
    record_login_history(db, request, academy, True, provider=provider)
    access_token, _, _ = create_access_token(academy)
    refresh_token, _ = issue_refresh_token(db, request, academy, remember=True)
    db.commit()
    fragment = urlencode(
        {
            "access_token": access_token,
            "provider": provider,
            "redirect": intent.get("redirect") or "",
        }
    )
    redirect = RedirectResponse(f"{settings.frontend_url}/#{fragment}", status_code=302)
    set_refresh_cookie(redirect, refresh_token, remember=True)
    return redirect
