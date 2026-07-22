import os
import secrets
import warnings
from dataclasses import dataclass
from pathlib import Path
from typing import Mapping, Optional

from dotenv import load_dotenv


load_dotenv(Path(__file__).parent / ".env")


DEV_CORS_ALLOW_ORIGINS = (
    "http://localhost:5173",
    "http://127.0.0.1:5173",
    "http://localhost:5174",
    "http://127.0.0.1:5174",
)
PRODUCTION_REQUIRED_KEYS = (
    "JWT_SECRET",
    "EMAIL_CODE_SECRET",
    "CORS_ALLOW_ORIGINS",
    "SMTP_HOST",
    "SMTP_FROM",
    "ADMIN_EMAILS",
)
_DEV_JWT_SECRET = secrets.token_urlsafe(48)
_DEV_EMAIL_CODE_SECRET = secrets.token_urlsafe(48)


class ConfigurationError(RuntimeError):
    pass


@dataclass(frozen=True)
class RuntimeSettings:
    app_env: str
    jwt_secret: str
    email_code_secret: str
    cors_allow_origins: tuple[str, ...]
    admin_emails: tuple[str, ...]
    rate_limit_window_seconds: int
    email_code_ip_max_requests: int
    login_ip_max_failures: int


def _positive_int(env: Mapping[str, str], key: str, default: int) -> int:
    try:
        value = int((env.get(key) or str(default)).strip())
    except ValueError as exc:
        raise ConfigurationError(f"{key} 必须是正整数") from exc
    if value <= 0:
        raise ConfigurationError(f"{key} 必须大于 0")
    return value


def _non_empty(env: Mapping[str, str], key: str) -> str:
    return (env.get(key) or "").strip()


def load_runtime_settings(environ: Optional[Mapping[str, str]] = None) -> RuntimeSettings:
    env = os.environ if environ is None else environ
    app_env = _non_empty(env, "APP_ENV").lower() or "development"
    if app_env not in {"development", "production"}:
        raise ConfigurationError("APP_ENV 只能是 development 或 production")

    missing = [
        key for key in PRODUCTION_REQUIRED_KEYS if app_env == "production" and not _non_empty(env, key)
    ]
    if missing:
        raise ConfigurationError("生产环境缺少配置：" + "、".join(missing))

    origins_raw = _non_empty(env, "CORS_ALLOW_ORIGINS")
    origins = tuple(value.strip() for value in origins_raw.split(",") if value.strip())
    if not origins:
        origins = DEV_CORS_ALLOW_ORIGINS
    if app_env == "production" and "*" in origins:
        raise ConfigurationError("生产环境 CORS_ALLOW_ORIGINS 不能包含 *")

    admin_emails = tuple(
        sorted(
            {
                value.strip().lower()
                for value in _non_empty(env, "ADMIN_EMAILS").split(",")
                if value.strip()
            }
        )
    )

    jwt_secret = _non_empty(env, "JWT_SECRET") or _DEV_JWT_SECRET
    email_code_secret = _non_empty(env, "EMAIL_CODE_SECRET") or _DEV_EMAIL_CODE_SECRET
    return RuntimeSettings(
        app_env=app_env,
        jwt_secret=jwt_secret,
        email_code_secret=email_code_secret,
        cors_allow_origins=origins,
        admin_emails=admin_emails,
        rate_limit_window_seconds=_positive_int(env, "AUTH_RATE_LIMIT_WINDOW_SECONDS", 900),
        email_code_ip_max_requests=_positive_int(env, "EMAIL_CODE_IP_MAX_REQUESTS", 10),
        login_ip_max_failures=_positive_int(env, "LOGIN_IP_MAX_FAILURES", 10),
    )


def get_runtime_settings() -> RuntimeSettings:
    return load_runtime_settings()


def validate_runtime_settings() -> RuntimeSettings:
    settings = get_runtime_settings()
    if settings.app_env == "development":
        missing_development = [
            key for key in ("JWT_SECRET", "EMAIL_CODE_SECRET") if not _non_empty(os.environ, key)
        ]
        if missing_development:
            warnings.warn(
                "开发环境正在使用临时安全密钥：" + "、".join(missing_development),
                RuntimeWarning,
                stacklevel=2,
            )
    return settings
