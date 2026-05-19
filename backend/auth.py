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
import hashlib
import sqlite3
import secrets
from pathlib import Path
from datetime import datetime, timedelta
from functools import wraps
from typing import Optional

import jwt
from fastapi import HTTPException, Request

# ---------- 配置 ----------
DB_PATH = Path(__file__).parent / "data" / "users.db"
DB_PATH.parent.mkdir(exist_ok=True)

JWT_SECRET = os.environ.get("JWT_SECRET", secrets.token_hex(32))
JWT_ALGORITHM = "HS256"
JWT_EXPIRE_HOURS = 72  # Token 有效期 3 天


# ---------- 数据库 ----------
def _get_db() -> sqlite3.Connection:
    conn = sqlite3.connect(str(DB_PATH))
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA journal_mode=WAL")
    conn.execute("PRAGMA foreign_keys=ON")
    return conn


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
    """SHA-256 + salt 密码哈希"""
    salt = secrets.token_hex(16)
    h = hashlib.sha256((password + salt).encode()).hexdigest()
    return f"{salt}${h}"


def _verify_password(password: str, stored: str) -> bool:
    try:
        salt, h = stored.split("$", 1)
        return hashlib.sha256((password + salt).encode()).hexdigest() == h
    except Exception:
        return False


# ---------- 用户操作 ----------
EMAIL_RE = re.compile(r"^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$")


def create_user(username: str, email: str, password: str) -> dict:
    """注册新用户，返回用户信息"""
    username = username.strip()
    email = email.strip().lower()

    if len(username) < 2 or len(username) > 30:
        raise ValueError("用户名需 2-30 个字符")
    if not EMAIL_RE.match(email):
        raise ValueError("邮箱格式不正确")
    if len(password) < 6:
        raise ValueError("密码至少 6 位")

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

    if not row or not _verify_password(password, row["password_hash"]):
        return None

    # 更新最后登录时间
    now = int(time.time())
    with _get_db() as conn:
        conn.execute("UPDATE users SET last_login=? WHERE id=?", (now, row["id"]))

    return {"id": row["id"], "username": row["username"], "email": row["email"]}


def get_user_by_id(user_id: str) -> Optional[dict]:
    with _get_db() as conn:
        row = conn.execute("SELECT id, username, email FROM users WHERE id=?", (user_id,)).fetchone()
    return dict(row) if row else None


# ---------- JWT Token ----------
def create_token(user_id: str) -> str:
    now = int(time.time())
    payload = {
        "sub": user_id,
        "iat": now,
        "exp": now + JWT_EXPIRE_HOURS * 3600,
    }
    return jwt.encode(payload, JWT_SECRET, algorithm=JWT_ALGORITHM)


def decode_token(token: str) -> Optional[str]:
    """解码 token，返回 user_id；无效返回 None"""
    try:
        payload = jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALGORITHM])
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
