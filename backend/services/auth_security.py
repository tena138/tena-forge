import base64
import hashlib
import io
import re
import secrets
import time
import uuid
from datetime import datetime, timedelta, timezone
from typing import Any

import pyotp
import qrcode
import redis
from cryptography.hazmat.primitives.ciphers.aead import AESGCM
from fastapi import Depends, HTTPException, Request, Response, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from jose import ExpiredSignatureError, JWTError, jwt
from passlib.context import CryptContext
from sqlalchemy import select
from sqlalchemy.orm import Session
from ua_parser import user_agent_parser

from database import get_db, get_settings
from models import Academy, ActiveSession, LoginHistory, RefreshToken, TotpSecret

settings = get_settings()
pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto", bcrypt__rounds=12)
bearer_scheme = HTTPBearer(auto_error=False)

COMMON_PASSWORDS = {
    "password",
    "password1",
    "password123",
    "12345678",
    "123456789",
    "qwerty123",
    "abc12345",
    "admin123",
    "letmein",
    "iloveyou",
    "welcome1",
    "tenaforge",
}


def _redis_client():
    if not settings.redis_url:
        return None
    try:
        client = redis.from_url(settings.redis_url, decode_responses=True)
        client.ping()
        return client
    except Exception:
        return None


redis_client = _redis_client()


def now_utc() -> datetime:
    return datetime.now(timezone.utc).replace(tzinfo=None)


def get_real_ip(request: Request) -> str:
    forwarded = request.headers.get("x-forwarded-for")
    if forwarded:
        return forwarded.split(",")[0].strip()
    return request.client.host if request.client else "unknown"


def hash_password(password: str) -> str:
    return pwd_context.hash(password)


def verify_password(password: str, password_hash: str | None) -> bool:
    if not password_hash:
        return False
    return pwd_context.verify(password, password_hash)


def sha256_token(token: str) -> str:
    return hashlib.sha256(token.encode("utf-8")).hexdigest()


def random_url_token(bytes_count: int = 32) -> str:
    return secrets.token_urlsafe(bytes_count)


def validate_password_policy(password: str, email: str, academy_name: str) -> None:
    lowered = password.lower()
    if len(password) < 8:
        raise HTTPException(status_code=400, detail="비밀번호는 8자 이상이어야 합니다.")
    if lowered in COMMON_PASSWORDS:
        raise HTTPException(status_code=400, detail="너무 흔한 비밀번호는 사용할 수 없습니다.")
    if email and email.split("@")[0].lower() in lowered:
        raise HTTPException(status_code=400, detail="이메일과 유사한 비밀번호는 사용할 수 없습니다.")
    normalized_academy = re.sub(r"\s+", "", academy_name or "").lower()
    if normalized_academy and len(normalized_academy) >= 3 and normalized_academy in lowered:
        raise HTTPException(status_code=400, detail="학원명과 유사한 비밀번호는 사용할 수 없습니다.")
    checks = [
        re.search(r"[A-Z]", password),
        re.search(r"[a-z]", password),
        re.search(r"\d", password),
        re.search(r"[^A-Za-z0-9]", password),
    ]
    if not all(checks):
        raise HTTPException(status_code=400, detail="비밀번호는 대문자, 소문자, 숫자, 특수문자를 모두 포함해야 합니다.")


def create_access_token(academy: Academy) -> tuple[str, str, datetime]:
    issued_at_ts = int(time.time())
    expires_at_ts = issued_at_ts + settings.access_token_expire_minutes * 60
    issued_at = datetime.fromtimestamp(issued_at_ts, timezone.utc).replace(tzinfo=None)
    expires_at = datetime.fromtimestamp(expires_at_ts, timezone.utc).replace(tzinfo=None)
    jti = str(uuid.uuid4())
    payload = {
        "sub": str(academy.id),
        "email": academy.email,
        "jti": jti,
        "type": "access",
        "iat": issued_at_ts,
        "exp": expires_at_ts,
    }
    token = jwt.encode(payload, settings.secret_key, algorithm=settings.algorithm)
    return token, jti, expires_at


def decode_access_token(token: str) -> dict[str, Any]:
    return jwt.decode(token, settings.secret_key, algorithms=[settings.algorithm])


def blacklist_access_jti(jti: str, expires_at: datetime) -> None:
    if not redis_client:
        return
    ttl = max(1, int((expires_at - now_utc()).total_seconds()))
    redis_client.setex(f"blacklist:jti:{jti}", ttl, "1")


def is_jti_blacklisted(jti: str) -> bool:
    return bool(redis_client and redis_client.get(f"blacklist:jti:{jti}"))


def make_refresh_token() -> tuple[uuid.UUID, str, str]:
    token_id = uuid.uuid4()
    secret = random_url_token(32)
    plaintext = f"{token_id}.{secret}"
    return token_id, secret, plaintext


def split_refresh_token(token: str) -> tuple[uuid.UUID, str]:
    try:
        token_id, secret = token.split(".", 1)
        return uuid.UUID(token_id), secret
    except Exception as exc:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="인증이 필요합니다.") from exc


def parse_user_agent(user_agent: str) -> dict[str, str]:
    parsed = user_agent_parser.Parse(user_agent or "")
    browser_family = parsed.get("user_agent", {}).get("family") or "Unknown"
    browser_major = parsed.get("user_agent", {}).get("major")
    os_family = parsed.get("os", {}).get("family") or "Unknown"
    os_major = parsed.get("os", {}).get("major")
    device_family = parsed.get("device", {}).get("family") or "Unknown"
    ua_lower = (user_agent or "").lower()
    if "tablet" in ua_lower or "ipad" in ua_lower:
        device_type = "tablet"
    elif "mobile" in ua_lower or "iphone" in ua_lower or "android" in ua_lower:
        device_type = "mobile"
    else:
        device_type = "desktop"
    return {
        "device_type": device_type,
        "device_info": device_family,
        "browser": f"{browser_family} {browser_major}".strip(),
        "os": f"{os_family} {os_major}".strip(),
    }


def device_fingerprint(ip_address: str, user_agent: str) -> str:
    return sha256_token(f"{ip_address}|{user_agent}")[:64]


def record_login_history(
    db: Session,
    request: Request,
    academy: Academy | None,
    success: bool,
    provider: str = "email",
    failure_reason: str | None = None,
) -> None:
    user_agent = request.headers.get("user-agent", "")
    parsed = parse_user_agent(user_agent)
    db.add(
        LoginHistory(
            academy_id=academy.id if academy else None,
            ip_address=get_real_ip(request),
            user_agent=user_agent,
            device_type=parsed["device_type"],
            os=parsed["os"],
            browser=parsed["browser"],
            country=None,
            success=success,
            failure_reason=failure_reason,
            provider=provider,
        )
    )


def issue_refresh_token(db: Session, request: Request, academy: Academy, remember: bool = True) -> tuple[str, RefreshToken]:
    token_id, secret, plaintext = make_refresh_token()
    expires_at = now_utc() + timedelta(days=settings.refresh_token_expire_days if remember else 1)
    user_agent = request.headers.get("user-agent", "")
    parsed = parse_user_agent(user_agent)
    refresh = RefreshToken(
        id=token_id,
        academy_id=academy.id,
        token_hash=pwd_context.hash(secret),
        device_info=f"{parsed['browser']} on {parsed['os']}",
        ip_address=get_real_ip(request),
        expires_at=expires_at,
    )
    db.add(refresh)
    db.flush()
    db.add(
        ActiveSession(
            academy_id=academy.id,
            refresh_token_id=refresh.id,
            device_fingerprint=device_fingerprint(refresh.ip_address, user_agent),
        )
    )
    return plaintext, refresh


def set_refresh_cookie(response: Response, token: str, remember: bool = True) -> None:
    max_age = settings.refresh_token_expire_days * 24 * 60 * 60 if remember else None
    same_site = (settings.refresh_cookie_samesite or "strict").lower()
    if same_site not in {"strict", "lax", "none"}:
        same_site = "strict"
    response.set_cookie(
        settings.refresh_cookie_name,
        token,
        max_age=max_age,
        httponly=True,
        secure=settings.refresh_cookie_secure,
        samesite=same_site,
        path="/",
    )


def clear_refresh_cookie(response: Response) -> None:
    response.delete_cookie(settings.refresh_cookie_name, path="/")


def get_refresh_token_from_cookie(request: Request) -> str:
    token = request.cookies.get(settings.refresh_cookie_name)
    if not token:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="인증이 필요합니다.")
    return token


def verify_refresh_record(db: Session, token: str) -> RefreshToken:
    token_id, secret = split_refresh_token(token)
    refresh = db.get(RefreshToken, token_id)
    if not refresh or not pwd_context.verify(secret, refresh.token_hash):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="인증이 필요합니다.")
    if refresh.revoked_at or refresh.expires_at <= now_utc():
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="인증이 필요합니다.")
    if not refresh.academy or not refresh.academy.is_active or refresh.academy.is_suspended:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="인증이 필요합니다.")
    return refresh


def revoke_refresh_token(refresh: RefreshToken | None, reason: str) -> None:
    if refresh and not refresh.revoked_at:
        refresh.revoked_at = now_utc()
        refresh.revoked_reason = reason


def revoke_all_refresh_tokens(db: Session, academy_id: uuid.UUID, reason: str, except_id: uuid.UUID | None = None) -> None:
    tokens = db.scalars(
        select(RefreshToken).where(
            RefreshToken.academy_id == academy_id,
            RefreshToken.revoked_at.is_(None),
        )
    ).all()
    for token in tokens:
        if except_id and token.id == except_id:
            continue
        revoke_refresh_token(token, reason)


def auth_payload_from_credentials(credentials: HTTPAuthorizationCredentials | None) -> tuple[str, dict[str, Any]]:
    if not credentials or credentials.scheme.lower() != "bearer":
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="인증이 필요합니다.")
    token = credentials.credentials
    try:
        payload = decode_access_token(token)
    except ExpiredSignatureError as exc:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail={"code": "TOKEN_EXPIRED"}) from exc
    except JWTError as exc:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="인증이 필요합니다.") from exc
    if payload.get("type") != "access" or is_jti_blacklisted(payload.get("jti", "")):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="인증이 필요합니다.")
    return token, payload


def get_current_academy(
    credentials: HTTPAuthorizationCredentials | None = Depends(bearer_scheme),
    db: Session = Depends(get_db),
) -> Academy:
    _, payload = auth_payload_from_credentials(credentials)
    academy = db.get(Academy, uuid.UUID(payload["sub"]))
    if not academy or not academy.is_active:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="인증이 필요합니다.")
    if academy.is_suspended:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail=academy.suspension_reason or "정지된 계정입니다.")
    return academy


def get_raw_access_token(credentials: HTTPAuthorizationCredentials | None = Depends(bearer_scheme)) -> tuple[str, dict[str, Any]]:
    return auth_payload_from_credentials(credentials)


def timing_attack_delay() -> None:
    time.sleep(0.2)


def _encryption_key() -> bytes:
    if settings.encryption_key:
        key = bytes.fromhex(settings.encryption_key)
        if len(key) != 32:
            raise RuntimeError("ENCRYPTION_KEY must be 32 bytes hex for AES-256.")
        return key
    return hashlib.sha256(settings.secret_key.encode("utf-8")).digest()


def encrypt_secret(value: str | None) -> str | None:
    if value is None:
        return None
    nonce = secrets.token_bytes(12)
    cipher = AESGCM(_encryption_key()).encrypt(nonce, value.encode("utf-8"), None)
    return base64.urlsafe_b64encode(nonce + cipher).decode("ascii")


def decrypt_secret(value: str | None) -> str | None:
    if value is None:
        return None
    payload = base64.urlsafe_b64decode(value.encode("ascii"))
    nonce, cipher = payload[:12], payload[12:]
    return AESGCM(_encryption_key()).decrypt(nonce, cipher, None).decode("utf-8")


def make_totp_setup(db: Session, academy: Academy) -> tuple[TotpSecret, str, list[str], str]:
    secret = pyotp.random_base32()
    backup_codes = [secrets.token_hex(4).upper() for _ in range(8)]
    hashed_codes = [{"hash": pwd_context.hash(code), "used_at": None} for code in backup_codes]
    existing = academy.totp_secret
    if existing:
        existing.secret_encrypted = encrypt_secret(secret) or ""
        existing.enabled = False
        existing.enabled_at = None
        existing.backup_codes = hashed_codes
        record = existing
    else:
        record = TotpSecret(
            academy_id=academy.id,
            secret_encrypted=encrypt_secret(secret) or "",
            enabled=False,
            backup_codes=hashed_codes,
        )
        db.add(record)
    issuer = "Tena Forge"
    uri = pyotp.TOTP(secret).provisioning_uri(name=academy.email, issuer_name=issuer)
    image = qrcode.make(uri)
    buffer = io.BytesIO()
    image.save(buffer, format="PNG")
    qr_code_url = "data:image/png;base64," + base64.b64encode(buffer.getvalue()).decode("ascii")
    return record, secret, backup_codes, qr_code_url


def verify_totp(secret_encrypted: str, code: str) -> bool:
    secret = decrypt_secret(secret_encrypted)
    if not secret:
        return False
    return pyotp.TOTP(secret).verify(code, valid_window=1)


def consume_backup_code(totp: TotpSecret, backup_code: str) -> bool:
    codes = list(totp.backup_codes or [])
    for item in codes:
        if item.get("used_at"):
            continue
        if pwd_context.verify(backup_code.upper(), item.get("hash", "")):
            item["used_at"] = now_utc().isoformat()
            totp.backup_codes = codes
            return True
    return False
