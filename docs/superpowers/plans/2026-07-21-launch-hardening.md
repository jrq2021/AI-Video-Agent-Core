# Launch Hardening Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make account access, email verification, CORS, and local startup safe and predictable for a public redemption-code service.

**Architecture:** Add a runtime-settings module for environment parsing and production validation. Keep SQLite storage, add an authentication-event table for time-window limits, and migrate legacy passwords only after a correct login.

**Tech Stack:** Python 3, FastAPI, SQLite, PyJWT, python-dotenv, React 18, Vite, PowerShell, Python `unittest`.

## Global Constraints

- Do not change membership plans, coupons, redemption rules, quotas, payments, video parsing, or the existing visual design.
- Production requires `JWT_SECRET`, `EMAIL_CODE_SECRET`, `CORS_ALLOW_ORIGINS`, `SMTP_HOST`, and `SMTP_FROM`; no real secret may enter Git.
- Development permits only localhost origins on ports 5173 and 5174; production never permits a wildcard CORS origin.
- New and reset passwords require 8 characters. Legacy `salt$sha256` hashes migrate after a correct login.
- Email-code IP limit is 10 requests per 900 seconds; failed-login IP limit is 10 attempts per 900 seconds; both are configurable.
- `EMAIL_CODE_DEBUG` remains disabled by default.

---

## File Structure

| File | Responsibility |
| --- | --- |
| `backend/runtime_config.py` | Load `.env`, parse settings, validate production values. |
| `backend/auth.py` | PBKDF2 password hashes, legacy verification/migration, configured JWT. |
| `backend/auth_rate_limit.py` | SQLite authentication-event windows. |
| `backend/email_verification.py` | Configured verification-code secret. |
| `backend/main.py` | CORS whitelist, lifecycle validation, and 429 responses. |
| `backend/test_runtime_config.py` | Settings, template, and local-launcher tests. |
| `backend/test_auth_password_security.py` | PBKDF2, migration, and length tests. |
| `backend/test_auth_rate_limit.py` | Rate-window tests. |
| `backend/test_auth_api_limits.py` | Auth endpoint 429 tests without SMTP. |
| `backend/.env.example` | Safe configuration template. |
| `scripts/start-local.ps1` | Standard local launcher. |
| `README.md` | UTF-8 operator instructions. |

## Task 1: Add validated runtime settings

**Files:**

- Create: `backend/runtime_config.py`
- Create: `backend/test_runtime_config.py`
- Modify: `backend/main.py:1-90`
- Modify: `backend/auth.py:1-35`
- Modify: `backend/email_verification.py:1-25`

**Interfaces:**

- Produces `RuntimeSettings`, `ConfigurationError`, `load_runtime_settings(environ=None)`, `get_runtime_settings()`, and `validate_runtime_settings()`.
- The lifespan calls `validate_runtime_settings()`; CORS uses `get_runtime_settings().cors_allow_origins`.

- [ ] **Step 1: Write the failing configuration test**

```python
import unittest
from runtime_config import ConfigurationError, load_runtime_settings

class RuntimeConfigTest(unittest.TestCase):
    def test_development_defaults_are_local_and_ephemeral(self):
        settings = load_runtime_settings({"APP_ENV": "development"})
        self.assertIn("http://127.0.0.1:5174", settings.cors_allow_origins)
        self.assertTrue(settings.jwt_secret)
        self.assertTrue(settings.email_code_secret)

    def test_production_requires_all_security_values(self):
        with self.assertRaisesRegex(ConfigurationError, "JWT_SECRET.*SMTP_FROM"):
            load_runtime_settings({"APP_ENV": "production"})

    def test_production_parses_origins_and_limits(self):
        settings = load_runtime_settings({
            "APP_ENV": "production", "JWT_SECRET": "jwt", "EMAIL_CODE_SECRET": "email",
            "CORS_ALLOW_ORIGINS": "https://app.example, https://www.example",
            "SMTP_HOST": "smtp.example", "SMTP_FROM": "service@example",
            "AUTH_RATE_LIMIT_WINDOW_SECONDS": "900",
            "EMAIL_CODE_IP_MAX_REQUESTS": "10", "LOGIN_IP_MAX_FAILURES": "10",
        })
        self.assertEqual(settings.cors_allow_origins, ("https://app.example", "https://www.example"))
        self.assertEqual(settings.rate_limit_window_seconds, 900)
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `Push-Location backend; & '../.venv/Scripts/python.exe' -m unittest test_runtime_config.py; Pop-Location`

Expected: FAIL because `runtime_config.py` is absent.

- [ ] **Step 3: Implement the settings module**

```python
# backend/runtime_config.py
import os
import secrets
from dataclasses import dataclass
from pathlib import Path
from dotenv import load_dotenv

load_dotenv(Path(__file__).parent / ".env")
DEV_CORS_ALLOW_ORIGINS = (
    "http://localhost:5173", "http://127.0.0.1:5173",
    "http://localhost:5174", "http://127.0.0.1:5174",
)

class ConfigurationError(RuntimeError):
    pass

@dataclass(frozen=True)
class RuntimeSettings:
    app_env: str
    jwt_secret: str
    email_code_secret: str
    cors_allow_origins: tuple[str, ...]
    rate_limit_window_seconds: int
    email_code_ip_max_requests: int
    login_ip_max_failures: int

def _positive_int(env, key, default):
    try:
        value = int((env.get(key) or str(default)).strip())
    except ValueError as exc:
        raise ConfigurationError(key + " 必须是正整数") from exc
    if value <= 0:
        raise ConfigurationError(key + " 必须大于 0")
    return value

def load_runtime_settings(environ=None):
    env = os.environ if environ is None else environ
    app_env = (env.get("APP_ENV") or "development").strip().lower()
    required = ("JWT_SECRET", "EMAIL_CODE_SECRET", "CORS_ALLOW_ORIGINS", "SMTP_HOST", "SMTP_FROM")
    missing = [key for key in required if app_env == "production" and not (env.get(key) or "").strip()]
    if missing:
        raise ConfigurationError("生产环境缺少配置：" + "、".join(missing))
    source = (env.get("CORS_ALLOW_ORIGINS") or "").strip()
    origins = tuple(value.strip() for value in source.split(",") if value.strip()) or DEV_CORS_ALLOW_ORIGINS
    if app_env == "production" and "*" in origins:
        raise ConfigurationError("生产环境 CORS_ALLOW_ORIGINS 不能包含 *")
    return RuntimeSettings(
        app_env, (env.get("JWT_SECRET") or "").strip() or secrets.token_urlsafe(48),
        (env.get("EMAIL_CODE_SECRET") or "").strip() or secrets.token_urlsafe(48),
        origins, _positive_int(env, "AUTH_RATE_LIMIT_WINDOW_SECONDS", 900),
        _positive_int(env, "EMAIL_CODE_IP_MAX_REQUESTS", 10),
        _positive_int(env, "LOGIN_IP_MAX_FAILURES", 10),
    )

def get_runtime_settings():
    return load_runtime_settings()

def validate_runtime_settings():
    return get_runtime_settings()
```

In `main.py`, import `get_runtime_settings` and `validate_runtime_settings`, use `allow_origins=list(get_runtime_settings().cors_allow_origins)`, and call `validate_runtime_settings()` as the first lifespan action. In `auth.py`, make `create_token` and `decode_token` use `get_runtime_settings().jwt_secret`. In `email_verification.py`, make `_hash_code` use `get_runtime_settings().email_code_secret`; remove the fixed fallback.

- [ ] **Step 4: Run focused tests and compilation**

Run: `Push-Location backend; & '../.venv/Scripts/python.exe' -m unittest test_runtime_config.py; & '../.venv/Scripts/python.exe' -m py_compile runtime_config.py auth.py email_verification.py main.py; Pop-Location`

Expected: 3 passing tests and no compiler output.

- [ ] **Step 5: Commit**

```bash
git add backend/runtime_config.py backend/test_runtime_config.py backend/main.py backend/auth.py backend/email_verification.py
git commit -m "feat: validate runtime security settings"
```

## Task 2: Harden password storage with legacy migration

**Files:**

- Modify: `backend/auth.py:1-175`
- Create: `backend/test_auth_password_security.py`

**Interfaces:**

- Keeps `create_user`, `authenticate_user`, and `update_user_password` result shapes unchanged.
- Produces hashes beginning with `pbkdf2_sha256$600000$`.
- A correct legacy login updates the stored hash and `last_login`.

- [ ] **Step 1: Write the failing password test**

```python
import tempfile
import unittest
from pathlib import Path
import auth

class PasswordSecurityTest(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.original = auth.DB_PATH
        auth.DB_PATH = Path(self.temp.name) / "users.db"
        auth.init_db()

    def tearDown(self):
        auth.DB_PATH = self.original
        self.temp.cleanup()

    def test_new_account_uses_pbkdf2(self):
        user = auth.create_user("secure-user", "secure@example.com", "password-8")
        with auth._get_db() as conn:
            stored = conn.execute("SELECT password_hash FROM users WHERE id=?", (user["id"],)).fetchone()["password_hash"]
        self.assertTrue(stored.startswith("pbkdf2_sha256$600000$"))

    def test_legacy_hash_upgrades_after_correct_login(self):
        legacy = auth._hash_legacy_password("legacy-pass")
        with auth._get_db() as conn:
            conn.execute("INSERT INTO users (id,username,email,password_hash,created_at) VALUES (?,?,?,?,?)",
                         ("legacy", "legacy-user", "legacy@example.com", legacy, 1))
        self.assertIsNotNone(auth.authenticate_user("legacy@example.com", "legacy-pass"))
        with auth._get_db() as conn:
            stored = conn.execute("SELECT password_hash FROM users WHERE id='legacy'").fetchone()["password_hash"]
        self.assertTrue(stored.startswith("pbkdf2_sha256$"))

    def test_new_password_requires_eight_characters(self):
        with self.assertRaisesRegex(ValueError, "至少 8 位"):
            auth.create_user("short-user", "short@example.com", "short")
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `Push-Location backend; & '../.venv/Scripts/python.exe' -m unittest test_auth_password_security.py; Pop-Location`

Expected: FAIL because PBKDF2 helpers and the 8-character rule are absent.

- [ ] **Step 3: Implement PBKDF2 and migration**

```python
import base64
import hmac

PASSWORD_MIN_LENGTH = 8
PBKDF2_ITERATIONS = 600_000

def _hash_password(password):
    salt = secrets.token_bytes(16)
    digest = hashlib.pbkdf2_hmac("sha256", password.encode("utf-8"), salt, PBKDF2_ITERATIONS)
    values = (
        str(PBKDF2_ITERATIONS),
        base64.urlsafe_b64encode(salt).decode("ascii"),
        base64.urlsafe_b64encode(digest).decode("ascii"),
    )
    return "pbkdf2_sha256$" + "$".join(values)

def _hash_legacy_password(password):
    salt = secrets.token_hex(16)
    return salt + "$" + hashlib.sha256((password + salt).encode("utf-8")).hexdigest()

def _verify_password(password, stored):
    try:
        if stored.startswith("pbkdf2_sha256$"):
            _, raw_iterations, raw_salt, raw_digest = stored.split("$", 3)
            salt = base64.urlsafe_b64decode(raw_salt.encode("ascii"))
            expected = base64.urlsafe_b64decode(raw_digest.encode("ascii"))
            actual = hashlib.pbkdf2_hmac("sha256", password.encode("utf-8"), salt, int(raw_iterations))
            return hmac.compare_digest(actual, expected), False
        salt, expected = stored.split("$", 1)
        actual = hashlib.sha256((password + salt).encode("utf-8")).hexdigest()
        return hmac.compare_digest(actual, expected), True
    except (TypeError, ValueError, UnicodeError):
        return False, False
```

Use `PASSWORD_MIN_LENGTH` in registration and reset validation. In `authenticate_user`, replace the old boolean check with:

```python
verified, needs_upgrade = _verify_password(password, row["password_hash"]) if row else (False, False)
if not row or not verified:
    return None
with _get_db() as conn:
    if needs_upgrade:
        conn.execute("UPDATE users SET password_hash=? WHERE id=?", (_hash_password(password), row["id"]))
    conn.execute("UPDATE users SET last_login=? WHERE id=?", (int(time.time()), row["id"]))
```

- [ ] **Step 4: Run focused tests**

Run: `Push-Location backend; & '../.venv/Scripts/python.exe' -m unittest test_auth_password_security.py test_auth_db_close.py; Pop-Location`

Expected: 4 passing tests.

- [ ] **Step 5: Commit**

```bash
git add backend/auth.py backend/test_auth_password_security.py
git commit -m "feat: harden password storage"
```

## Task 3: Add persistent authentication rate limits

**Files:**

- Create: `backend/auth_rate_limit.py`
- Create: `backend/test_auth_rate_limit.py`
- Create: `backend/test_auth_api_limits.py`
- Modify: `backend/main.py:20-225`

**Interfaces:**

- Produces `init_auth_rate_limit_db()`, `is_rate_limited(action, scope, limit, window_seconds, now)`, and `record_rate_limit_event(action, scope, now)`.
- Email code returns 429 before SMTP delivery when its IP window is full.
- Login records only failed attempts.

- [ ] **Step 1: Write failing limiter tests**

```python
import tempfile
import unittest
from pathlib import Path
import auth
import auth_rate_limit

class AuthRateLimitTest(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.original = auth.DB_PATH
        auth.DB_PATH = Path(self.temp.name) / "users.db"
        auth_rate_limit.init_auth_rate_limit_db()

    def tearDown(self):
        auth.DB_PATH = self.original
        self.temp.cleanup()

    def test_window_blocks_then_expires(self):
        for _ in range(10):
            auth_rate_limit.record_rate_limit_event("send_code", "203.0.113.1", 1000)
        self.assertTrue(auth_rate_limit.is_rate_limited("send_code", "203.0.113.1", 10, 900, 1001))
        self.assertFalse(auth_rate_limit.is_rate_limited("send_code", "203.0.113.1", 10, 900, 1901))
```

```python
import asyncio
import unittest
from types import SimpleNamespace
from unittest.mock import patch
from fastapi import HTTPException
import main

class AuthApiLimitsTest(unittest.TestCase):
    def test_send_code_returns_429_before_delivery(self):
        request = SimpleNamespace(client=SimpleNamespace(host="203.0.113.5"))
        payload = main.SendEmailCodeRequest(email="new@example.com", purpose="register")
        with patch("main.is_rate_limited", return_value=True), patch("main.issue_email_code") as issue:
            with self.assertRaises(HTTPException) as caught:
                asyncio.run(main.send_auth_email_code(payload, request))
        self.assertEqual(caught.exception.status_code, 429)
        issue.assert_not_called()
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `Push-Location backend; & '../.venv/Scripts/python.exe' -m unittest test_auth_rate_limit.py test_auth_api_limits.py; Pop-Location`

Expected: FAIL because the limiter module and guards are absent.

- [ ] **Step 3: Implement SQLite windows and endpoint guards**

```python
# backend/auth_rate_limit.py
from auth import _get_db

def init_auth_rate_limit_db():
    with _get_db() as conn:
        conn.execute("CREATE TABLE IF NOT EXISTS auth_rate_limit_events (id INTEGER PRIMARY KEY AUTOINCREMENT, action TEXT NOT NULL, scope TEXT NOT NULL, created_at INTEGER NOT NULL)")
        conn.execute("CREATE INDEX IF NOT EXISTS idx_auth_rate_limit_lookup ON auth_rate_limit_events (action, scope, created_at)")

def is_rate_limited(action, scope, limit, window_seconds, now):
    cutoff = now - window_seconds
    with _get_db() as conn:
        conn.execute("DELETE FROM auth_rate_limit_events WHERE created_at < ?", (cutoff,))
        count = conn.execute("SELECT COUNT(*) FROM auth_rate_limit_events WHERE action=? AND scope=? AND created_at>=?", (action, scope, cutoff)).fetchone()[0]
    return count >= limit

def record_rate_limit_event(action, scope, now):
    with _get_db() as conn:
        conn.execute("INSERT INTO auth_rate_limit_events (action, scope, created_at) VALUES (?,?,?)", (action, scope, now))
```

Call `init_auth_rate_limit_db()` in lifespan. In `send_auth_email_code`, load settings and current Unix time; check `is_rate_limited("send_code", ip, settings.email_code_ip_max_requests, settings.rate_limit_window_seconds, now)`, raise `HTTPException(429, "验证码请求过于频繁，请稍后再试")` when true, otherwise record `send_code` before `issue_email_code`.

Change login to accept `request: Request`. Check a `login_failure` limit before authentication, record only an invalid credential attempt, and return `HTTPException(429, "登录失败次数过多，请稍后再试")` at the ceiling. Preserve the existing 401 and successful response shapes.

- [ ] **Step 4: Run focused tests**

Run: `Push-Location backend; & '../.venv/Scripts/python.exe' -m unittest test_auth_rate_limit.py test_auth_api_limits.py test_auth_password_security.py; Pop-Location`

Expected: all focused tests pass without SMTP delivery.

- [ ] **Step 5: Commit**

```bash
git add backend/auth_rate_limit.py backend/test_auth_rate_limit.py backend/test_auth_api_limits.py backend/main.py
git commit -m "feat: rate limit authentication requests"
```

## Task 4: Add the template, local launcher, and operator guide

**Files:**

- Modify: `backend/.env.example`
- Modify: `backend/test_runtime_config.py`
- Create: `scripts/start-local.ps1`
- Modify: `README.md`

**Interfaces:**

- `scripts/start-local.ps1` accepts `-BackendPort` and `-FrontendPort`, defaulting to 8000 and 5173.
- It uses root `.venv`, waits for `/api/health`, starts Vite, and never writes `.env` or application data.

- [ ] **Step 1: Extend the failing configuration test**

```python
from pathlib import Path

def test_template_and_launcher_document_standard_startup(self):
    template = Path(__file__).with_name(".env.example").read_text(encoding="utf-8")
    for key in ("APP_ENV", "JWT_SECRET", "EMAIL_CODE_SECRET", "CORS_ALLOW_ORIGINS", "AUTH_RATE_LIMIT_WINDOW_SECONDS"):
        self.assertIn(key, template)
    script = Path(__file__).parent.parent / "scripts" / "start-local.ps1"
    self.assertTrue(script.exists())
    source = script.read_text(encoding="utf-8")
    self.assertIn(".venv\\Scripts\\python.exe", source)
    self.assertIn("BackendPort = 8000", source)
    self.assertIn("FrontendPort = 5173", source)
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `Push-Location backend; & '../.venv/Scripts/python.exe' -m unittest test_runtime_config.py; Pop-Location`

Expected: FAIL because the template and launcher are incomplete.

- [ ] **Step 3: Add exact safe settings and launcher**

Add to `backend/.env.example`:

```env
APP_ENV="development"
JWT_SECRET=""
EMAIL_CODE_SECRET=""
CORS_ALLOW_ORIGINS="http://localhost:5173,http://127.0.0.1:5173,http://localhost:5174,http://127.0.0.1:5174"
AUTH_RATE_LIMIT_WINDOW_SECONDS="900"
EMAIL_CODE_IP_MAX_REQUESTS="10"
LOGIN_IP_MAX_FAILURES="10"
EMAIL_CODE_DEBUG="0"
```

Create `scripts/start-local.ps1`:

```powershell
param([int]$BackendPort = 8000, [int]$FrontendPort = 5173)
$projectRoot = Split-Path -Parent $PSScriptRoot
$python = Join-Path $projectRoot ".venv\\Scripts\\python.exe"
if (-not (Test-Path -LiteralPath $python)) { throw "未找到项目虚拟环境：$python" }
Start-Process -FilePath $python -ArgumentList "-m","uvicorn","main:app","--host","127.0.0.1","--port",$BackendPort -WorkingDirectory (Join-Path $projectRoot "backend") -WindowStyle Hidden
for ($attempt = 0; $attempt -lt 20; $attempt++) {
    try {
        Invoke-WebRequest -UseBasicParsing -Uri "http://127.0.0.1:$BackendPort/api/health" -TimeoutSec 2 | Out-Null
        break
    } catch { Start-Sleep -Milliseconds 500 }
}
Start-Process -FilePath "npm.cmd" -ArgumentList "run","dev","--","--host","127.0.0.1","--port",$FrontendPort -WorkingDirectory (Join-Path $projectRoot "frontend") -WindowStyle Hidden
Write-Host "前端地址：http://127.0.0.1:$FrontendPort"
```

Replace the unreadable README text with UTF-8 Chinese setup instructions: prerequisites, copying the env template, standard startup, local URL, QQ SMTP fields, temporary `EMAIL_CODE_DEBUG=1` testing, production requirements, and restoring debug to 0.

- [ ] **Step 4: Run checks**

Run: `Push-Location backend; & '../.venv/Scripts/python.exe' -m unittest test_runtime_config.py; Pop-Location; powershell.exe -NoProfile -Command "Get-Content -LiteralPath './scripts/start-local.ps1' -Raw | Out-Null"`

Expected: configuration tests pass and PowerShell exits 0.

- [ ] **Step 5: Commit**

```bash
git add backend/.env.example backend/test_runtime_config.py scripts/start-local.ps1 README.md
git commit -m "docs: add secure startup guidance"
```

## Task 5: Verify the full hardening pass

**Files:**

- Modify only files directly exposed by failed verification.

- [ ] **Step 1: Run all backend tests**

Run: `Push-Location backend; & '../.venv/Scripts/python.exe' -m unittest discover -p 'test_*.py'; Pop-Location`

Expected: every backend test passes without a live SMTP connection.

- [ ] **Step 2: Run frontend tests and production build**

Run: `Push-Location frontend; & 'C:/Users/jrq/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node.exe' --test src/services/*.test.js; & 'C:/Users/jrq/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node.exe' node_modules/vite/bin/vite.js build; Pop-Location`

Expected: all Node tests pass and Vite exits 0; a non-failing chunk-size warning is acceptable.

- [ ] **Step 3: Confirm production rejects missing secrets**

Run: `Push-Location backend; $env:APP_ENV='production'; Remove-Item Env:JWT_SECRET -ErrorAction SilentlyContinue; & '../.venv/Scripts/python.exe' -c "import runtime_config; runtime_config.get_runtime_settings()"; Pop-Location`

Expected: nonzero exit that names missing required values without printing or replacing any real env value.

- [ ] **Step 4: Commit a verification fix only when a test exposes one**

```bash
git status --short
git add backend/runtime_config.py backend/auth.py backend/email_verification.py backend/auth_rate_limit.py backend/main.py backend/test_runtime_config.py backend/test_auth_password_security.py backend/test_auth_rate_limit.py backend/test_auth_api_limits.py backend/.env.example scripts/start-local.ps1 README.md
git commit -m "fix: verify launch hardening"
```

## Plan Self-Review

- **Spec coverage:** Tasks 1 through 4 implement production validation/CORS, PBKDF2 migration, IP limits, and operator guidance; Task 5 verifies them.
- **Placeholder scan:** Every task includes concrete files, test code, commands, expected outcomes, and commit boundaries.
- **Consistency:** `APP_ENV`, `JWT_SECRET`, `EMAIL_CODE_SECRET`, `CORS_ALLOW_ORIGINS`, `AUTH_RATE_LIMIT_WINDOW_SECONDS`, `EMAIL_CODE_IP_MAX_REQUESTS`, and `LOGIN_IP_MAX_FAILURES` are spelled consistently across the plan.
