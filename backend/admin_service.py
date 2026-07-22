"""Read-model services used exclusively by the protected admin API."""

import json
import time
from datetime import datetime, timedelta
from typing import Any

import auth
import membership


VALID_ACCOUNT_STATUSES = {"active", "disabled", "deleted"}
VALID_PLANS = {"free", "pro", "ultra"}


def _safe_json(raw: str) -> dict[str, Any]:
    try:
        value = json.loads(raw or "{}")
        return value if isinstance(value, dict) else {}
    except (TypeError, ValueError):
        return {}


def _effective_plan(record: dict[str, Any], now: int) -> str:
    if record.get("plan") == "pro" and record.get("expires_at", 0) > 0:
        if record["expires_at"] < now:
            return "free"
    return record.get("plan") or "free"


def _membership_map() -> dict[str, dict[str, Any]]:
    with membership._get_db() as conn:
        rows = conn.execute("SELECT * FROM user_membership").fetchall()
    return {row["user_id"]: dict(row) for row in rows}


def _coupon_status_counts(now: int) -> dict[str, int]:
    with membership._get_db() as conn:
        membership._expire_coupons(conn, now)
        rows = conn.execute(
            "SELECT status, COUNT(*) AS count FROM coupon_codes GROUP BY status"
        ).fetchall()
    counts = {status: 0 for status in ("active", "used", "revoked", "expired")}
    counts.update({row["status"]: row["count"] for row in rows})
    return counts


def get_overview(now: int | None = None) -> dict[str, Any]:
    now = int(time.time()) if now is None else int(now)
    today = datetime.fromtimestamp(now).replace(hour=0, minute=0, second=0, microsecond=0)
    today_start = int(today.timestamp())

    with auth._get_db() as conn:
        users = [dict(row) for row in conn.execute("SELECT * FROM users").fetchall()]
    memberships = _membership_map()
    coupon_statuses = _coupon_status_counts(now)
    with membership._get_db() as conn:
        today_redemptions = conn.execute(
            "SELECT COUNT(*) FROM coupon_redemptions WHERE redeemed_at >= ?", (today_start,)
        ).fetchone()[0]

    paid_users = 0
    plan_distribution = {plan: 0 for plan in ("free", "pro", "ultra")}
    for user in users:
        if user.get("account_status", "active") != "active":
            continue
        plan = _effective_plan(memberships.get(user["id"], {}), now)
        plan_distribution[plan] += 1
        if plan in {"pro", "ultra"}:
            paid_users += 1

    registration_trend = []
    for days_ago in range(6, -1, -1):
        day_start = today - timedelta(days=days_ago)
        next_day = day_start + timedelta(days=1)
        registration_trend.append(
            {
                "date": day_start.strftime("%Y-%m-%d"),
                "count": sum(
                    1
                    for user in users
                    if int(day_start.timestamp()) <= user["created_at"] < int(next_day.timestamp())
                ),
            }
        )

    return {
        "metrics": {
            "total_users": len(users),
            "today_new_users": sum(user["created_at"] >= today_start for user in users),
            "paid_users": paid_users,
            "today_coupon_redemptions": today_redemptions,
        },
        "registration_trend": registration_trend,
        "plan_distribution": [
            {"plan": plan, "count": plan_distribution[plan]}
            for plan in ("free", "pro", "ultra")
        ],
        "coupon_statuses": coupon_statuses,
    }


def list_users(
    query: str = "",
    status: str = "all",
    plan: str = "all",
    page: int = 1,
    page_size: int = 20,
) -> dict[str, Any]:
    if status != "all" and status not in VALID_ACCOUNT_STATUSES:
        raise ValueError("账号状态筛选不合法")
    if plan != "all" and plan not in VALID_PLANS:
        raise ValueError("套餐筛选不合法")
    page = max(1, int(page))
    page_size = max(1, min(int(page_size), 100))
    normalized_query = query.strip().lower()
    now = int(time.time())

    with auth._get_db() as conn:
        rows = conn.execute(
            """SELECT id, username, email, created_at, last_login,
                      account_status, status_updated_at
               FROM users ORDER BY created_at DESC, id ASC"""
        ).fetchall()
    memberships = _membership_map()

    items = []
    for row in rows:
        user = dict(row)
        record = memberships.get(user["id"], {})
        current_plan = _effective_plan(record, now)
        if normalized_query and normalized_query not in user["username"].lower() and normalized_query not in user["email"].lower():
            continue
        if status != "all" and user["account_status"] != status:
            continue
        if plan != "all" and current_plan != plan:
            continue
        usage = _safe_json(record.get("daily_usage_json", "{}"))
        items.append(
            {
                **user,
                "plan": current_plan,
                "expires_at": record.get("expires_at", 0),
                "daily_usage": usage,
                "usage_date": record.get("usage_date", ""),
            }
        )

    total = len(items)
    start = (page - 1) * page_size
    return {"items": items[start : start + page_size], "page": page, "page_size": page_size, "total": total}


def get_user_detail(user_id: str) -> dict[str, Any] | None:
    with auth._get_db() as conn:
        row = conn.execute(
            """SELECT id, username, email, created_at, last_login,
                      account_status, status_updated_at
               FROM users WHERE id=?""",
            (user_id,),
        ).fetchone()
    if not row:
        return None

    user = dict(row)
    record = _membership_map().get(user_id, {})
    with membership._get_db() as conn:
        redemptions = [
            dict(redemption)
            for redemption in conn.execute(
                """SELECT code, plan, order_type, redeemed_at
                   FROM coupon_redemptions WHERE user_id=?
                   ORDER BY redeemed_at DESC, id DESC LIMIT 10""",
                (user_id,),
            ).fetchall()
        ]
    now = int(time.time())
    return {
        **user,
        "plan": _effective_plan(record, now),
        "expires_at": record.get("expires_at", 0),
        "daily_usage": _safe_json(record.get("daily_usage_json", "{}")),
        "usage_date": record.get("usage_date", ""),
        "recent_redemptions": redemptions,
    }


def list_audit_logs(page: int = 1, page_size: int = 20) -> dict[str, Any]:
    page = max(1, int(page))
    page_size = max(1, min(int(page_size), 100))
    offset = (page - 1) * page_size
    with auth._get_db() as conn:
        total = conn.execute("SELECT COUNT(*) FROM admin_audit_logs").fetchone()[0]
        rows = conn.execute(
            """SELECT id, actor_id, action, target_type, target_id,
                      before_json, after_json, created_at
               FROM admin_audit_logs ORDER BY created_at DESC, id DESC LIMIT ? OFFSET ?""",
            (page_size, offset),
        ).fetchall()
    return {
        "items": [
            {
                **dict(row),
                "before": _safe_json(row["before_json"]),
                "after": _safe_json(row["after_json"]),
            }
            for row in rows
        ],
        "page": page,
        "page_size": page_size,
        "total": total,
    }
