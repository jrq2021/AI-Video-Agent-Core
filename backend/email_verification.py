import hashlib
import hmac
import os
import secrets
import smtplib
import time
from email.message import EmailMessage
from typing import Optional

from auth import EMAIL_RE, _get_db, get_user_by_email, update_user_password
from runtime_config import get_runtime_settings


VALID_PURPOSES = {"register", "reset_password"}
PURPOSE_LABELS = {
    "register": "注册账号",
    "reset_password": "找回密码",
}

EMAIL_CODE_EXPIRE_SECONDS = int(os.environ.get("EMAIL_CODE_EXPIRE_SECONDS", "600"))
EMAIL_CODE_COOLDOWN_SECONDS = int(os.environ.get("EMAIL_CODE_COOLDOWN_SECONDS", "60"))
EMAIL_CODE_MAX_ATTEMPTS = int(os.environ.get("EMAIL_CODE_MAX_ATTEMPTS", "5"))
def _now() -> int:
    return int(time.time())


def _normalize_email(email: str) -> str:
    normalized = (email or "").strip().lower()
    if not EMAIL_RE.match(normalized):
        raise ValueError("邮箱格式不正确")
    return normalized


def _normalize_purpose(purpose: str) -> str:
    normalized = (purpose or "").strip()
    if normalized not in VALID_PURPOSES:
        raise ValueError("验证码用途不正确")
    return normalized


def _hash_code(email: str, purpose: str, code: str) -> str:
    secret = get_runtime_settings().email_code_secret
    raw = f"{secret}:{email}:{purpose}:{code}".encode("utf-8")
    return hashlib.sha256(raw).hexdigest()


def _is_debug_enabled() -> bool:
    return os.environ.get("EMAIL_CODE_DEBUG", "").strip().lower() in {"1", "true", "yes", "on"}


def init_email_verification_db() -> None:
    with _get_db() as conn:
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS email_verification_codes (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                email TEXT NOT NULL,
                purpose TEXT NOT NULL,
                code_hash TEXT NOT NULL,
                ip_address TEXT,
                created_at INTEGER NOT NULL,
                expires_at INTEGER NOT NULL,
                used_at INTEGER,
                attempts INTEGER NOT NULL DEFAULT 0
            )
            """
        )
        conn.execute(
            """
            CREATE INDEX IF NOT EXISTS idx_email_verification_lookup
            ON email_verification_codes (email, purpose, created_at DESC)
            """
        )


def _send_email_code(email: str, purpose: str, code: str) -> None:
    smtp_host = os.environ.get("SMTP_HOST", "").strip()
    if not smtp_host:
        if _is_debug_enabled():
            print(f"[EMAIL_CODE_DEBUG] {email} {purpose} code={code}")
            return
        raise RuntimeError("邮件服务未配置，请先配置 SMTP_HOST 等邮箱参数")

    smtp_port = int(os.environ.get("SMTP_PORT", "465"))
    smtp_user = os.environ.get("SMTP_USER", "").strip()
    smtp_password = os.environ.get("SMTP_PASSWORD", "").strip()
    smtp_from = os.environ.get("SMTP_FROM", "").strip() or smtp_user
    use_ssl = os.environ.get("SMTP_SSL", "1").strip().lower() not in {"0", "false", "no"}

    if not smtp_from:
        raise RuntimeError("邮件服务未配置发件人 SMTP_FROM")

    label = PURPOSE_LABELS[purpose]
    message = EmailMessage()
    message["Subject"] = f"万能视频下载 {label}验证码"
    message["From"] = smtp_from
    message["To"] = email
    message.set_content(
        "\n".join(
            [
                f"你的验证码是：{code}",
                "",
                f"用途：{label}",
                f"有效期：{EMAIL_CODE_EXPIRE_SECONDS // 60} 分钟",
                "",
                "如果不是你本人操作，请忽略这封邮件。",
            ]
        )
    )

    if use_ssl:
        with smtplib.SMTP_SSL(smtp_host, smtp_port, timeout=15) as server:
            if smtp_user:
                server.login(smtp_user, smtp_password)
            server.send_message(message)
    else:
        with smtplib.SMTP(smtp_host, smtp_port, timeout=15) as server:
            server.starttls()
            if smtp_user:
                server.login(smtp_user, smtp_password)
            server.send_message(message)


def issue_email_code(
    email: str,
    purpose: str,
    ip_address: str = "",
    code: Optional[str] = None,
    deliver: bool = True,
) -> dict:
    init_email_verification_db()

    normalized_email = _normalize_email(email)
    normalized_purpose = _normalize_purpose(purpose)

    if normalized_purpose == "register" and get_user_by_email(normalized_email):
        raise ValueError("该邮箱已注册，请直接登录")
    if normalized_purpose == "reset_password" and not get_user_by_email(normalized_email):
        raise ValueError("该邮箱还没有注册")

    current = _now()
    with _get_db() as conn:
        latest = conn.execute(
            """
            SELECT created_at FROM email_verification_codes
            WHERE email=? AND purpose=? AND used_at IS NULL
            ORDER BY created_at DESC LIMIT 1
            """,
            (normalized_email, normalized_purpose),
        ).fetchone()

        if latest and current - int(latest["created_at"]) < EMAIL_CODE_COOLDOWN_SECONDS:
            raise ValueError("验证码发送太频繁，请稍后再试")

        generated_code = code or f"{secrets.randbelow(1_000_000):06d}"
        conn.execute(
            """
            INSERT INTO email_verification_codes
                (email, purpose, code_hash, ip_address, created_at, expires_at)
            VALUES (?, ?, ?, ?, ?, ?)
            """,
            (
                normalized_email,
                normalized_purpose,
                _hash_code(normalized_email, normalized_purpose, generated_code),
                ip_address,
                current,
                current + EMAIL_CODE_EXPIRE_SECONDS,
            ),
        )

    if deliver:
        _send_email_code(normalized_email, normalized_purpose, generated_code)

    result = {
        "email": normalized_email,
        "purpose": normalized_purpose,
        "expires_in": EMAIL_CODE_EXPIRE_SECONDS,
        "cooldown": EMAIL_CODE_COOLDOWN_SECONDS,
    }
    if _is_debug_enabled():
        result["debug_code"] = generated_code
    return result


def require_email_code(email: str, purpose: str, code: str) -> bool:
    init_email_verification_db()

    normalized_email = _normalize_email(email)
    normalized_purpose = _normalize_purpose(purpose)
    normalized_code = (code or "").strip()
    if not normalized_code:
        raise ValueError("请输入验证码")

    current = _now()
    with _get_db() as conn:
        row = conn.execute(
            """
            SELECT * FROM email_verification_codes
            WHERE email=? AND purpose=? AND used_at IS NULL
            ORDER BY created_at DESC LIMIT 1
            """,
            (normalized_email, normalized_purpose),
        ).fetchone()

        if not row:
            raise ValueError("请先获取验证码")
        if int(row["expires_at"]) < current:
            raise ValueError("验证码已过期，请重新获取")
        if int(row["attempts"]) >= EMAIL_CODE_MAX_ATTEMPTS:
            raise ValueError("验证码错误次数过多，请重新获取")

        expected = row["code_hash"]
        actual = _hash_code(normalized_email, normalized_purpose, normalized_code)
        if not hmac.compare_digest(expected, actual):
            conn.execute(
                "UPDATE email_verification_codes SET attempts=attempts+1 WHERE id=?",
                (row["id"],),
            )
            raise ValueError("验证码不正确")

        conn.execute(
            "UPDATE email_verification_codes SET used_at=? WHERE id=?",
            (current, row["id"]),
        )
    return True


def reset_password_with_email_code(email: str, code: str, password: str) -> dict:
    normalized_email = _normalize_email(email)
    require_email_code(normalized_email, "reset_password", code)
    return update_user_password(normalized_email, password)
