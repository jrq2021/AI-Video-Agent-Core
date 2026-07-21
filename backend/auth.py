"""
用户认证模块
- SQLite 存储用户数据
- bcrypt 风格密码哈希
- JWT Token 鉴权
"""
import os
import re
import time
import json
import uuid
import base64
import hashlib
import hmac
import sqlite3
import secrets
from pathlib import Path
from datetime import datetime, timedelta
from contextlib import contextmanager
from functools import wraps
from typing import Optional

import jwt
from fastapi import HTTPException, Request
from runtime_config import get_runtime_settings

# ---------- 配置 ----------
DB_PATH = Path(__file__).parent / "data" / "users.db"
DB_PATH.parent.mkdir(exist_ok=True)

JWT_ALGORITHM = "HS256"
JWT_EXPIRE_HOURS = 72  # Token 有效期 3 天
PASSWORD_MIN_LENGTH = 8
PBKDF2_ITERATIONS = 600_000


# ---------- 数据库 ----------
@contextmanager
def _get_db():
    conn = sqlite3.connect(str(DB_PATH))
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA journal_mode=WAL")
    conn.execute("PRAGMA foreign_keys=ON")
    try:
        yield conn
        conn.commit()
    except Exception:
        conn.rollback()
        raise
    finally:
        conn.close()


def init_db():
    with _get_db() as conn:
        conn.execute("""
            CREATE TABLE IF NOT EXISTS users (
                id TEXT PRIMARY KEY,
                username TEXT UNIQUE NOT NULL,
                email TEXT UNIQUE NOT NULL,
                password_hash TEXT NOT NULL,
                created_at INTEGER NOT NULL,
                last_login INTEGER
            )
        """)
        conn.execute("""
            CREATE TABLE IF NOT EXISTS sessions (
                token TEXT PRIMARY KEY,
                user_id TEXT NOT NULL,
                created_at INTEGER NOT NULL,
                expires_at INTEGER NOT NULL,
                FOREIGN KEY (user_id) REFERENCES users(id)
            )
        """)


def _hash_password(password: str) -> str:
    """使用 PBKDF2-SHA256 保存新密码。"""
    salt = secrets.token_bytes(16)
    digest = hashlib.pbkdf2_hmac(
        "sha256", password.encode("utf-8"), salt, PBKDF2_ITERATIONS
    )
    values = (
        str(PBKDF2_ITERATIONS),
        base64.urlsafe_b64encode(salt).decode("ascii"),
        base64.urlsafe_b64encode(digest).decode("ascii"),
    )
    return "pbkdf2_sha256$" + "$".join(values)


def _hash_legacy_password(password: str) -> str:
    """保留旧格式生成器，仅用于兼容性测试。"""
    salt = secrets.token_hex(16)
    digest = hashlib.sha256((password + salt).encode("utf-8")).hexdigest()
    return f"{salt}${digest}"


def _verify_password(password: str, stored: str) -> tuple[bool, bool]:
    """返回“密码正确、是否需要迁移到 PBKDF2”。"""
    try:
        if stored.startswith("pbkdf2_sha256$"):
            _, raw_iterations, raw_salt, raw_digest = stored.split("$", 3)
            salt = base64.urlsafe_b64decode(raw_salt.encode("ascii"))
            expected = base64.urlsafe_b64decode(raw_digest.encode("ascii"))
            actual = hashlib.pbkdf2_hmac(
                "sha256", password.encode("utf-8"), salt, int(raw_iterations)
            )
            return hmac.compare_digest(actual, expected), False
        salt, expected = stored.split("$", 1)
        actual = hashlib.sha256((password + salt).encode("utf-8")).hexdigest()
        return hmac.compare_digest(actual, expected), True
    except (TypeError, ValueError, UnicodeError):
        return False, False


# ---------- 用户操作 ----------
EMAIL_RE = re.compile(r"^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$")


def validate_password(password: str) -> str:
    if len(password) < PASSWORD_MIN_LENGTH:
        raise ValueError("密码至少 8 位")
    return password


def validate_registration_input(username: str, email: str, password: str) -> tuple[str, str]:
    normalized_username = username.strip()
    normalized_email = email.strip().lower()
    validate_password(password)
    if len(normalized_username) < 2 or len(normalized_username) > 30:
        raise ValueError("用户名需为 2-30 个字符")
    if not EMAIL_RE.match(normalized_email):
        raise ValueError("邮箱格式不正确")
    return normalized_username, normalized_email


def ensure_registration_available(username: str, email: str) -> None:
    with _get_db() as conn:
        existing = conn.execute(
            "SELECT 1 FROM users WHERE username=? OR email=?",
            (username, email),
        ).fetchone()
    if existing:
        raise ValueError("用户名或邮箱已被注册")


def create_user(username: str, email: str, password: str) -> dict:
    """注册新用户，返回用户信息"""
    username, email = validate_registration_input(username, email, password)
    user_id = str(uuid.uuid4())
    now = int(time.time())
    pw_hash = _hash_password(password)

    with _get_db() as conn:
        try:
            conn.execute(
                "INSERT INTO users (id, username, email, password_hash, created_at) VALUES (?,?,?,?,?)",
                (user_id, username, email, pw_hash, now),
            )
        except sqlite3.IntegrityError:
            raise ValueError("用户名或邮箱已被注册")

    return {"id": user_id, "username": username, "email": email}


def authenticate_user(login: str, password: str) -> Optional[dict]:
    """验证用户登录，返回用户信息"""
    login = login.strip().lower()

    with _get_db() as conn:
        row = conn.execute(
            "SELECT * FROM users WHERE username=? OR email=?",
            (login, login),
        ).fetchone()

    verified, needs_upgrade = _verify_password(password, row["password_hash"]) if row else (False, False)
    if not row or not verified:
        return None

    # 更新最后登录时间
    now = int(time.time())
    with _get_db() as conn:
        if needs_upgrade:
            conn.execute(
                "UPDATE users SET password_hash=? WHERE id=?",
                (_hash_password(password), row["id"]),
            )
        conn.execute("UPDATE users SET last_login=? WHERE id=?", (now, row["id"]))

    return {"id": row["id"], "username": row["username"], "email": row["email"]}


def get_user_by_id(user_id: str) -> Optional[dict]:
    with _get_db() as conn:
        row = conn.execute("SELECT id, username, email FROM users WHERE id=?", (user_id,)).fetchone()
    return dict(row) if row else None


def get_user_by_email(email: str) -> Optional[dict]:
    email = email.strip().lower()
    with _get_db() as conn:
        row = conn.execute(
            "SELECT id, username, email FROM users WHERE email=?",
            (email,),
        ).fetchone()
    return dict(row) if row else None


def update_user_password(email: str, password: str) -> dict:
    email = email.strip().lower()
    validate_password(password)
    user = get_user_by_email(email)
    if not user:
        raise ValueError("邮箱未注册")

    with _get_db() as conn:
        conn.execute(
            "UPDATE users SET password_hash=? WHERE id=?",
            (_hash_password(password), user["id"]),
        )

    return user


# ---------- JWT Token ----------
def create_token(user_id: str) -> str:
    now = int(time.time())
    payload = {
        "sub": user_id,
        "iat": now,
        "exp": now + JWT_EXPIRE_HOURS * 3600,
    }
    return jwt.encode(payload, get_runtime_settings().jwt_secret, algorithm=JWT_ALGORITHM)


def decode_token(token: str) -> Optional[str]:
    """解码 token，返回 user_id；无效返回 None"""
    try:
        payload = jwt.decode(
            token,
            get_runtime_settings().jwt_secret,
            algorithms=[JWT_ALGORITHM],
        )
        return payload.get("sub")
    except jwt.ExpiredSignatureError:
        return None
    except Exception:
        return None


# ---------- FastAPI 依赖注入 ----------
def get_current_user(request: Request) -> dict:
    """从请求头 Authorization: Bearer <token> 中获取当前用户"""
    auth = request.headers.get("Authorization", "")
    if not auth.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="未登录")

    token = auth[7:]
    user_id = decode_token(token)
    if not user_id:
        raise HTTPException(status_code=401, detail="登录已过期，请重新登录")

    user = get_user_by_id(user_id)
    if not user:
        raise HTTPException(status_code=401, detail="用户不存在")

    return user


def get_optional_user(request: Request) -> Optional[dict]:
    """可选登录：已登录返回用户信息，未登录返回 None"""
    auth = request.headers.get("Authorization", "")
    if not auth.startswith("Bearer "):
        return None
    try:
        token = auth[7:]
        user_id = decode_token(token)
        if user_id:
            return get_user_by_id(user_id)
    except Exception:
        pass
    return None


# 启动时初始化数据库
init_db()
