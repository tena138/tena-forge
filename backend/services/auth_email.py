from datetime import datetime
import logging

import emails
from jinja2 import Template

from database import get_settings

settings = get_settings()
logger = logging.getLogger(__name__)

BASE_TEMPLATE = """
<!doctype html>
<html lang="ko">
  <body style="margin:0;background:#f4f6f8;font-family:Arial,'Malgun Gothic',sans-serif;color:#111827;">
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="padding:32px 16px;">
      <tr>
        <td align="center">
          <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:560px;background:#ffffff;border:1px solid #e5e7eb;border-radius:12px;overflow:hidden;">
            <tr>
              <td style="padding:28px 32px 12px;text-align:center;">
                <div style="font-size:22px;font-weight:800;color:#4f46e5;">Tena Forge</div>
              </td>
            </tr>
            <tr>
              <td style="padding:8px 32px 32px;font-size:15px;line-height:1.7;">
                {{ body }}
              </td>
            </tr>
            <tr>
              <td style="padding:18px 32px;background:#f9fafb;color:#6b7280;font-size:12px;text-align:center;">
                Tena Forge | 문의: support@tena-forge.com
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>
"""


def _button(label: str, url: str) -> str:
    return (
        f'<p style="text-align:center;margin:28px 0;">'
        f'<a href="{url}" style="display:inline-block;background:#4f46e5;color:white;'
        f'padding:13px 24px;border-radius:8px;text-decoration:none;font-weight:700;">{label}</a>'
        f"</p>"
    )


def _send(to: str, subject: str, body: str) -> bool:
    html = Template(BASE_TEMPLATE).render(body=body)
    if not settings.smtp_host:
        logger.warning("Email skipped because SMTP_HOST is not configured: to=%s subject=%s", to, subject)
        return False
    message = emails.html(
        html=html,
        subject=subject,
        mail_from=(settings.email_from_name, settings.email_from),
    )
    smtp = {
        "host": settings.smtp_host,
        "port": settings.smtp_port,
        "user": settings.smtp_user or None,
        "password": settings.smtp_password or None,
        "tls": True,
    }
    try:
        message.send(to=to, smtp=smtp)
    except Exception:
        logger.exception("Email send failed: to=%s subject=%s", to, subject)
        return False
    return True


def send_verification_email(email: str, academy_name: str, token: str) -> None:
    url = f"{settings.frontend_url}/verify-email?token={token}"
    body = (
        f"<p>안녕하세요, <strong>{academy_name}</strong>님!</p>"
        "<p>아래 버튼을 클릭하여 이메일 인증을 완료해주세요.</p>"
        f"{_button('이메일 인증하기', url)}"
        "<p>이 링크는 24시간 후 만료됩니다.</p>"
        "<p style='color:#6b7280;'>본인이 요청하지 않은 경우 이 이메일을 무시하세요.</p>"
    )
    _send(email, "[Tena Forge] 이메일 인증을 완료해주세요", body)


def send_registration_code_email(email: str, code: str) -> bool:
    body = (
        "<p>Tena Forge 회원가입을 계속하려면 아래 인증 코드를 입력해주세요.</p>"
        f"<p style='margin:28px 0;text-align:center;font-size:32px;font-weight:800;letter-spacing:8px;color:#4f46e5;'>{code}</p>"
        "<p>이 코드는 10분 동안만 사용할 수 있습니다.</p>"
        "<p style='color:#6b7280;'>본인이 요청하지 않았다면 이 메일을 무시해주세요.</p>"
    )
    return _send(email, "[Tena Forge] 회원가입 인증 코드", body)


def send_password_reset_email(email: str, token: str, ip_address: str) -> None:
    url = f"{settings.frontend_url}/reset-password?token={token}"
    timestamp = datetime.utcnow().strftime("%Y-%m-%d %H:%M:%S UTC")
    body = (
        "<p>비밀번호 재설정을 요청하셨습니다.</p>"
        f"{_button('비밀번호 재설정', url)}"
        "<p>이 링크는 15분 후 만료됩니다.</p>"
        f"<p>요청 IP: {ip_address}<br />요청 시각: {timestamp}</p>"
        "<p style='color:#b91c1c;'>본인이 요청하지 않은 경우 즉시 비밀번호를 변경하세요.</p>"
    )
    _send(email, "[Tena Forge] 비밀번호 재설정 링크", body)


def send_password_changed_email(email: str, ip_address: str) -> None:
    timestamp = datetime.utcnow().strftime("%Y-%m-%d %H:%M:%S UTC")
    body = (
        "<p>회원님의 계정 비밀번호가 변경되었습니다.</p>"
        f"<p>변경 시각: {timestamp}<br />변경 IP: {ip_address}</p>"
        f"{_button('계정 보호하기', settings.frontend_url + '/account/security')}"
    )
    _send(email, "[Tena Forge] 비밀번호가 변경되었습니다", body)


def send_account_locked_email(email: str, locked_until: datetime) -> None:
    body = (
        "<p>로그인 시도가 여러 번 실패하여 계정이 잠겼습니다.</p>"
        f"<p>잠금 해제 시각: {locked_until.strftime('%Y-%m-%d %H:%M:%S UTC')}</p>"
        "<p>본인이 시도하지 않은 경우 비밀번호를 변경하세요.</p>"
    )
    _send(email, "[Tena Forge] 계정이 일시적으로 잠겼습니다", body)


def send_new_device_login_email(email: str, browser: str, os: str, ip_address: str) -> None:
    timestamp = datetime.utcnow().strftime("%Y-%m-%d %H:%M:%S UTC")
    body = (
        "<p>새로운 환경에서 로그인이 감지되었습니다.</p>"
        f"<p>기기: {browser} on {os}<br />IP: {ip_address}<br />시각: {timestamp}</p>"
        f"{_button('본인이 아닌 경우 모든 기기에서 로그아웃', settings.frontend_url + '/account/security')}"
    )
    _send(email, "[Tena Forge] 새로운 기기에서 로그인되었습니다", body)


def send_backup_code_used_email(email: str, ip_address: str) -> None:
    body = f"<p>2단계 인증 백업 코드가 사용되었습니다.</p><p>IP: {ip_address}</p>"
    _send(email, "[Tena Forge] 백업 코드가 사용되었습니다", body)
