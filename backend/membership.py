"""
会员套餐与额度管理系统
======================
支持三级会员体系：Free / Pro（月付）/ Ultra（终身买断）
采用「每日重置配额 + 月度硬上限」混合模式，兼顾用户体验与服务端成本控制。

核心设计理念：
- 免费用户享受每日重置的基础额度，降低获客门槛
- Pro 用户按月付费，获得更高每日配额 + 高级功能
- Ultra 用户一次买断，终身不限量（仅受合理公平使用限制）

额度消耗规则：
- 视频下载：每成功下载 1 个视频消耗 1 次下载额度
- AI 总结：每生成 1 次视频总结消耗 1 次总结额度
- 思维导图：与 AI 总结共享额度（生成导图也算 1 次）
- 批量下载：功能规划中，当前不作为已上线权益返回
"""

import os
import time
import sqlite3
import json
import secrets
from contextlib import contextmanager
from pathlib import Path
from datetime import datetime, timedelta
from enum import Enum
from typing import Optional, Dict, Any
from dataclasses import dataclass, asdict

# ---------- 套餐定义 ----------

class PlanTier(str, Enum):
    """会员等级枚举"""
    FREE = "free"       # 免费版
    PRO = "pro"         # 专业版（月付）
    ULTRA = "ultra"     # 旗舰版（终身买断）


# 各套餐权益配置（可作为环境变量覆盖，方便运营调参）
PLAN_CONFIG: Dict[str, Dict[str, Any]] = {
    "free": {
        "name": "免费版",
        "name_en": "Free",
        "price_monthly": 0,
        "price_lifetime": 0,
        "daily_downloads": 3,        # 每日下载次数
        "max_quality": "源站可用",    # 实际受限于源站返回的格式
        "daily_summaries": 1,        # 每日 AI 总结次数
        "batch_download": False,     # 批量下载
        "batch_max_count": 0,
        "daily_batch_items": 0,
        "daily_creator_credits": 0,
        "batch_parse": False,
        "mindmap_export": False,     # 思维导图导出
        "watermark": False,          # 当前没有实现主动加水印/去水印链路
        "priority_support": False,
        "features": [
            "每日 3 次视频下载",
            "公开视频直链解析",
            "每日 1 次 AI 智能总结",
            "基础字幕提取",
        ],
    },
    "pro": {
        "name": "专业版",
        "name_en": "Pro",
        "price_monthly": 9.9,        # ¥9.9/月
        "price_yearly": 99,          # ¥99/年（约 ¥8.3/月，节省 17%）
        "price_lifetime": 0,
        "daily_downloads": 30,
        "max_quality": "源站可用",
        "daily_summaries": 10,
        "daily_batch_items": 10,
        "daily_creator_credits": 10,
        "batch_download": False,
        "batch_parse": True,
        "batch_max_count": 5,
        "mindmap_export": True,
        "watermark": False,
        "priority_support": False,
        "features": [
            "每日 30 次视频下载",
            "每日 10 次 AI 智能总结",
            "字幕提取 + SRT/VTT 导出",
            "思维导图生成与导出",
            "B站 / 抖音专项解析",
        ],
    },
    "ultra": {
        "name": "旗舰版",
        "name_en": "Ultra",
        "price_monthly": 0,
        "price_lifetime": 199,       # ¥199 终身买断
        "daily_downloads": 100,      # 合理公平使用上限
        "max_quality": "源站可用",
        "daily_summaries": 50,
        "daily_batch_items": 30,
        "daily_creator_credits": 30,
        "batch_download": False,
        "batch_parse": True,
        "batch_max_count": 15,
        "mindmap_export": True,
        "watermark": False,
        "priority_support": False,
        "features": [
            "每日 100 次视频下载",
            "每日 50 次 AI 智能总结",
            "字幕提取 + 导出",
            "思维导图导出（SVG/PNG）",
            "B站 / 抖音专项解析",
            "终身有效，无需续费",
        ],
    },
}


# ---------- 数据库 ----------

DB_PATH = Path(__file__).parent / "data" / "membership.db"
DB_PATH.parent.mkdir(exist_ok=True)


@contextmanager
def _get_db():
    conn = sqlite3.connect(str(DB_PATH))
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA journal_mode=WAL")
    # 不启用外键约束：users 表在 users.db 中，无法跨数据库引用
    # 用户合法性由 auth.py 保证，此处只做数据记录
    try:
        yield conn
        conn.commit()
    except Exception:
        conn.rollback()
        raise
    finally:
        conn.close()


def init_membership_db():
    """初始化会员相关表（在应用启动时调用）"""
    with _get_db() as conn:
        # 用户会员信息表（与 auth.users 通过 user_id 关联，不同数据库文件故不设外键）
        conn.execute("""
            CREATE TABLE IF NOT EXISTS user_membership (
                user_id TEXT PRIMARY KEY,
                plan TEXT NOT NULL DEFAULT 'free',
                expires_at INTEGER NOT NULL DEFAULT 0,
                daily_usage_json TEXT NOT NULL DEFAULT '{}',
                usage_date TEXT NOT NULL DEFAULT '',
                created_at INTEGER NOT NULL,
                updated_at INTEGER NOT NULL
            )
        """)

        # 订单记录表（对接支付网关回调，user_id 由 auth 模块保证有效性）
        conn.execute("""
            CREATE TABLE IF NOT EXISTS orders (
                id TEXT PRIMARY KEY,
                user_id TEXT NOT NULL,
                plan TEXT NOT NULL,
                order_type TEXT NOT NULL DEFAULT 'monthly',
                amount REAL NOT NULL,
                currency TEXT NOT NULL DEFAULT 'CNY',
                status TEXT NOT NULL DEFAULT 'pending',
                payment_gateway TEXT NOT NULL DEFAULT '',
                gateway_order_id TEXT DEFAULT '',
                gateway_data_json TEXT DEFAULT '{}',
                created_at INTEGER NOT NULL,
                paid_at INTEGER DEFAULT 0
            )
        """)

        # 用量日志表（用于审计和对账）
        conn.execute("""
            CREATE TABLE IF NOT EXISTS usage_logs (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id TEXT NOT NULL,
                action TEXT NOT NULL,
                video_url TEXT DEFAULT '',
                video_title TEXT DEFAULT '',
                consumed_at INTEGER NOT NULL,
                ip_address TEXT DEFAULT ''
            )
        """)

        conn.execute("""
            CREATE TABLE IF NOT EXISTS coupon_codes (
                code TEXT PRIMARY KEY,
                plan TEXT NOT NULL,
                order_type TEXT NOT NULL DEFAULT 'monthly',
                status TEXT NOT NULL DEFAULT 'active',
                max_redemptions INTEGER NOT NULL DEFAULT 1,
                redeemed_count INTEGER NOT NULL DEFAULT 0,
                redeemed_by TEXT DEFAULT '',
                redeemed_at INTEGER DEFAULT 0,
                expires_at INTEGER DEFAULT 0,
                note TEXT DEFAULT '',
                created_at INTEGER NOT NULL
            )
        """)

        conn.execute("""
            CREATE TABLE IF NOT EXISTS coupon_redemptions (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                code TEXT NOT NULL,
                user_id TEXT NOT NULL,
                plan TEXT NOT NULL,
                order_type TEXT NOT NULL,
                redeemed_at INTEGER NOT NULL
            )
        """)

        conn.execute("""
            CREATE TABLE IF NOT EXISTS quota_refunds (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id TEXT NOT NULL,
                quota_key TEXT NOT NULL,
                audit_key TEXT NOT NULL,
                reason TEXT DEFAULT '',
                refunded_at INTEGER NOT NULL,
                UNIQUE(user_id, quota_key, audit_key)
            )
        """)


# ---------- 核心逻辑 ----------

@dataclass
class QuotaInfo:
    """用户当前额度信息"""
    user_id: str
    plan: str
    expires_at: int
    daily_downloads_limit: int
    daily_summaries_limit: int
    daily_batch_items_limit: int
    daily_creator_credits_limit: int
    daily_downloads_used: int
    daily_summaries_used: int
    daily_batch_items_used: int
    daily_creator_credits_used: int
    can_batch_download: bool
    can_batch_parse: bool
    batch_max_count: int
    can_export_mindmap: bool
    max_quality: str
    has_watermark: bool
    is_expired: bool


def _get_today_str() -> str:
    """获取今天的日期字符串 YYYY-MM-DD"""
    return datetime.now().strftime("%Y-%m-%d")


def _reset_daily_usage_if_needed(conn: sqlite3.Connection, user_id: str, today: str):
    """如果日期变了，重置每日用量"""
    row = conn.execute(
        "SELECT usage_date FROM user_membership WHERE user_id=?",
        (user_id,)
    ).fetchone()
    if row and row["usage_date"] != today:
        conn.execute(
            "UPDATE user_membership SET daily_usage_json='{}', usage_date=? WHERE user_id=?",
            (today, user_id)
        )


def _ensure_user_membership(conn: sqlite3.Connection, user_id: str):
    """确保用户有会员记录，没有则创建免费版"""
    now = int(time.time())
    today = _get_today_str()
    existing = conn.execute(
        "SELECT user_id FROM user_membership WHERE user_id=?", (user_id,)
    ).fetchone()
    if not existing:
        conn.execute(
            """INSERT INTO user_membership (user_id, plan, expires_at, daily_usage_json, usage_date, created_at, updated_at)
               VALUES (?, 'free', 0, '{}', ?, ?, ?)""",
            (user_id, today, now, now)
        )


ACTION_QUOTA_KEYS = {
    "download": "downloads",
    "summarize": "summaries",
    "mindmap": "summaries",
    "batch_parse": "batch_items",
    "translate": "creator_credits",
    "creator_pack": "creator_credits",
}

QUOTA_CONFIG_KEYS = {
    "downloads": "daily_downloads",
    "summaries": "daily_summaries",
    "batch_items": "daily_batch_items",
    "creator_credits": "daily_creator_credits",
}


def _build_quota_info(
    user_id: str,
    row: sqlite3.Row,
    plan: str,
    config: Dict[str, Any],
    usage: Dict[str, int],
    is_expired: bool = False,
) -> QuotaInfo:
    return QuotaInfo(
        user_id=user_id,
        plan=plan,
        expires_at=row["expires_at"],
        daily_downloads_limit=config["daily_downloads"],
        daily_summaries_limit=config["daily_summaries"],
        daily_batch_items_limit=config["daily_batch_items"],
        daily_creator_credits_limit=config["daily_creator_credits"],
        daily_downloads_used=usage.get("downloads", 0),
        daily_summaries_used=usage.get("summaries", 0),
        daily_batch_items_used=usage.get("batch_items", 0),
        daily_creator_credits_used=usage.get("creator_credits", 0),
        can_batch_download=config["batch_download"],
        can_batch_parse=config["batch_parse"],
        batch_max_count=config["batch_max_count"],
        can_export_mindmap=config["mindmap_export"],
        max_quality=config["max_quality"],
        has_watermark=config["watermark"],
        is_expired=is_expired,
    )


def get_user_quota(user_id: str) -> QuotaInfo:
    """
    获取用户当前额度信息。
    每次调用时自动检查并重置每日用量。
    前端应在加载时和每次操作后调用此接口。
    """
    today = _get_today_str()

    with _get_db() as conn:
        _ensure_user_membership(conn, user_id)
        _reset_daily_usage_if_needed(conn, user_id, today)

        row = conn.execute(
            "SELECT * FROM user_membership WHERE user_id=?", (user_id,)
        ).fetchone()

    plan = row["plan"]
    config = PLAN_CONFIG.get(plan, PLAN_CONFIG["free"])
    usage = json.loads(row["daily_usage_json"])

    # 判断会员是否过期
    is_expired = False
    if plan == "pro" and row["expires_at"] > 0:
        is_expired = row["expires_at"] < int(time.time())
        if is_expired:
            # Pro 过期降级为 Free
            plan = "free"
            config = PLAN_CONFIG["free"]

    return _build_quota_info(user_id, row, plan, config, usage, is_expired)


def check_and_consume_quota(
    user_id: str,
    action: str,
    video_url: str = "",
    video_title: str = "",
    ip_address: str = "",
    audit_key: str = "",
) -> Dict[str, Any]:
    """
    检查并消耗用户额度。原子操作，线程安全。

    Args:
        user_id: 用户 ID
        action: 操作类型 - 'download' / 'summarize' / 'mindmap' / 'batch_download'
        video_url: 视频链接（用于日志）
        video_title: 视频标题（用于日志）
        ip_address: 客户端 IP

    Returns:
        {
            "allowed": bool,       # 是否允许操作
            "quota": QuotaInfo,    # 当前额度信息
            "reason": str,         # 拒绝原因（allowed=False 时）
            "remaining": int,      # 剩余次数
        }
    """
    today = _get_today_str()
    now = int(time.time())

    # 操作到额度的映射
    action_map = {
        "download": "downloads",
        "summarize": "summaries",
        "mindmap": "summaries",  # 思维导图与总结共享额度
    }

    action_map.update(ACTION_QUOTA_KEYS)

    if action not in action_map:
        return {"allowed": False, "reason": f"未知操作类型: {action}"}

    quota_key = action_map[action]
    limit_key = f"daily_{quota_key}_limit"
    used_key = f"daily_{quota_key}_used"

    with _get_db() as conn:
        _ensure_user_membership(conn, user_id)
        _reset_daily_usage_if_needed(conn, user_id, today)

        row = conn.execute(
            "SELECT * FROM user_membership WHERE user_id=?", (user_id,)
        ).fetchone()

        plan = row["plan"]
        config = PLAN_CONFIG.get(plan, PLAN_CONFIG["free"])
        usage = json.loads(row["daily_usage_json"])

        # 检查 Pro 是否过期
        if plan == "pro" and row["expires_at"] > 0 and row["expires_at"] < now:
            plan = "free"
            config = PLAN_CONFIG["free"]

        limit = config[QUOTA_CONFIG_KEYS[quota_key]]
        # 上面这行有点绕，直接用 action 判断更清晰
        if action == "download":
            limit = config["daily_downloads"]
        elif action in ("summarize", "mindmap"):
            limit = config["daily_summaries"]

        used = usage.get(quota_key, 0)

        if used >= limit:
            quota = _build_quota_info(user_id, row, plan, config, usage)
            return {
                "allowed": False,
                "quota": quota,
                "reason": f"今日{quota_key}额度已用完（{used}/{limit}），请升级会员或明天再试",
                "remaining": 0,
            }

        # 原子更新：消耗 1 次额度
        usage[quota_key] = used + 1
        conn.execute(
            "UPDATE user_membership SET daily_usage_json=?, updated_at=? WHERE user_id=?",
            (json.dumps(usage), now, user_id)
        )

        # 记录操作日志
        conn.execute(
            "INSERT INTO usage_logs (user_id, action, video_url, video_title, consumed_at, ip_address) VALUES (?,?,?,?,?,?)",
            (user_id, action, video_url, video_title, now, ip_address)
        )

        remaining = limit - (used + 1)

    quota = _build_quota_info(user_id, row, plan, config, usage)

    return {
        "allowed": True,
        "quota": quota,
        "reason": "",
        "remaining": remaining,
    }


def refund_quota_once(
    user_id: str,
    quota_key: str,
    audit_key: str,
    reason: str = "",
) -> bool:
    """Refund one daily quota at most once for a durable operation identifier."""
    if quota_key not in QUOTA_CONFIG_KEYS or not audit_key:
        return False

    now = int(time.time())
    today = _get_today_str()
    with _get_db() as conn:
        _ensure_user_membership(conn, user_id)
        _reset_daily_usage_if_needed(conn, user_id, today)
        try:
            conn.execute(
                """INSERT INTO quota_refunds
                   (user_id, quota_key, audit_key, reason, refunded_at)
                   VALUES (?, ?, ?, ?, ?)""",
                (user_id, quota_key, audit_key, reason, now),
            )
        except sqlite3.IntegrityError:
            return False

        row = conn.execute(
            "SELECT daily_usage_json FROM user_membership WHERE user_id=?",
            (user_id,),
        ).fetchone()
        usage = json.loads(row["daily_usage_json"])
        usage[quota_key] = max(0, usage.get(quota_key, 0) - 1)
        conn.execute(
            "UPDATE user_membership SET daily_usage_json=?, updated_at=? WHERE user_id=?",
            (json.dumps(usage), now, user_id),
        )
        conn.execute(
            """INSERT INTO usage_logs
               (user_id, action, video_url, video_title, consumed_at, ip_address)
               VALUES (?, 'quota_refund', ?, ?, ?, '')""",
            (user_id, audit_key, reason, now),
        )
    return True


def set_user_plan(
    user_id: str,
    plan: str,
    order_type: str = "monthly",
    duration_days: int = 30,
) -> bool:
    """
    设置用户会员等级（支付成功后调用）。

    Args:
        user_id: 用户 ID
        plan: 目标等级 (pro/ultra)
        order_type: monthly / yearly / lifetime
        duration_days: 有效天数（lifetime 时忽略）
    """
    if plan not in ("pro", "ultra"):
        raise ValueError(f"无效的套餐等级: {plan}")

    now = int(time.time())

    if plan == "ultra":
        expires_at = 0  # 永不过期
    else:
        expires_at = now + duration_days * 86400

    with _get_db() as conn:
        _ensure_user_membership(conn, user_id)
        conn.execute(
            """UPDATE user_membership
               SET plan=?, expires_at=?, updated_at=?
               WHERE user_id=?""",
            (plan, expires_at, now, user_id)
        )
    return True


def _membership_duration_days(plan: str, order_type: str) -> int:
    if plan == "ultra" or order_type == "lifetime":
        return 0
    if order_type == "weekly":
        return 7
    if order_type == "yearly":
        return 365
    return 30


_MEMBERSHIP_ORDER_TYPES = {"weekly", "monthly", "yearly", "lifetime"}
_COUPON_STATUSES = {"active", "used", "revoked", "expired"}


def set_admin_membership(user_id: str, plan: str, order_type: str = "monthly") -> Dict[str, Any]:
    """Set a membership plan from the admin console and return its quota snapshot."""
    if plan not in {"free", "pro", "ultra"}:
        raise ValueError("管理员套餐必须是 free、pro 或 ultra")
    if order_type not in _MEMBERSHIP_ORDER_TYPES:
        raise ValueError("套餐类型必须是 weekly/monthly/yearly/lifetime")
    if plan == "pro" and order_type == "lifetime":
        raise ValueError("Pro 套餐不支持终身类型")

    now = int(time.time())
    if plan == "free":
        expires_at = 0
    elif plan == "ultra":
        order_type = "lifetime"
        expires_at = 0
    else:
        expires_at = now + _membership_duration_days(plan, order_type) * 86400

    with _get_db() as conn:
        _ensure_user_membership(conn, user_id)
        conn.execute(
            """UPDATE user_membership
               SET plan=?, expires_at=?, updated_at=?
               WHERE user_id=?""",
            (plan, expires_at, now, user_id),
        )

    return asdict(get_user_quota(user_id))


def _normalize_coupon_code(code: str) -> str:
    return "".join(str(code or "").upper().strip().split())


def generate_coupon_code(prefix: str = "JD") -> str:
    """Generate a human-friendly coupon code for manual sales channels."""
    body = secrets.token_urlsafe(9).upper().replace("-", "").replace("_", "")
    return f"{prefix}-{body[:4]}-{body[4:8]}-{body[8:12]}"


def create_membership_coupon(
    plan: str,
    order_type: str = "monthly",
    code: str = "",
    expires_days: int = 0,
    note: str = "",
    max_redemptions: int = 1,
) -> str:
    """Create a membership coupon and return the generated/normalized code."""
    with _get_db() as conn:
        return _create_membership_coupon_in_conn(
            conn,
            plan=plan,
            order_type=order_type,
            code=code,
            expires_days=expires_days,
            note=note,
            max_redemptions=max_redemptions,
        )


def _create_membership_coupon_in_conn(
    conn: sqlite3.Connection,
    plan: str,
    order_type: str = "monthly",
    code: str = "",
    expires_days: int = 0,
    note: str = "",
    max_redemptions: int = 1,
) -> str:
    """Insert one coupon using a caller-owned transaction connection."""
    if plan not in ("pro", "ultra"):
        raise ValueError("券码套餐必须是 pro 或 ultra")
    if order_type not in _MEMBERSHIP_ORDER_TYPES:
        raise ValueError("券码类型必须是 weekly/monthly/yearly/lifetime")
    if plan == "pro" and order_type == "lifetime":
        raise ValueError("Pro 券码不支持终身类型")
    if expires_days < 0:
        raise ValueError("券码有效期不能为负数")
    if plan == "ultra":
        order_type = "lifetime"

    now = int(time.time())
    expires_at = now + expires_days * 86400 if expires_days > 0 else 0
    max_redemptions = max(1, int(max_redemptions or 1))
    normalized_code = _normalize_coupon_code(code) if code else generate_coupon_code()

    conn.execute(
        """INSERT INTO coupon_codes
           (code, plan, order_type, status, max_redemptions, redeemed_count,
            expires_at, note, created_at)
           VALUES (?, ?, ?, 'active', ?, 0, ?, ?, ?)""",
        (
            normalized_code,
            plan,
            order_type,
            max_redemptions,
            expires_at,
            note,
            now,
        ),
    )
    return normalized_code


def _expire_coupons(conn: sqlite3.Connection, now: int) -> None:
    conn.execute(
        """UPDATE coupon_codes
           SET status='expired'
           WHERE status='active' AND expires_at > 0 AND expires_at < ?""",
        (now,),
    )


def list_membership_coupons(
    status: str = "all", offset: int = 0, limit: int = 20
) -> tuple[list[Dict[str, Any]], int]:
    """List coupons for administration without exposing write access."""
    if status != "all" and status not in _COUPON_STATUSES:
        raise ValueError("卡券状态不合法")
    offset = max(0, int(offset))
    limit = max(1, min(int(limit), 100))

    with _get_db() as conn:
        _expire_coupons(conn, int(time.time()))
        if status == "all":
            total = conn.execute("SELECT COUNT(*) FROM coupon_codes").fetchone()[0]
            rows = conn.execute(
                "SELECT * FROM coupon_codes ORDER BY created_at DESC, code ASC LIMIT ? OFFSET ?",
                (limit, offset),
            ).fetchall()
        else:
            total = conn.execute(
                "SELECT COUNT(*) FROM coupon_codes WHERE status=?", (status,)
            ).fetchone()[0]
            rows = conn.execute(
                """SELECT * FROM coupon_codes WHERE status=?
                   ORDER BY created_at DESC, code ASC LIMIT ? OFFSET ?""",
                (status, limit, offset),
            ).fetchall()

    items = []
    for row in rows:
        item = dict(row)
        item["remaining_redemptions"] = max(0, item["max_redemptions"] - item["redeemed_count"])
        items.append(item)
    return items, total


def revoke_membership_coupon(code: str) -> Dict[str, Any]:
    """Revoke an unused active coupon while preserving redemption history."""
    normalized_code = _normalize_coupon_code(code)
    if not normalized_code:
        raise ValueError("请提供券码")

    with _get_db() as conn:
        _expire_coupons(conn, int(time.time()))
        row = conn.execute(
            "SELECT * FROM coupon_codes WHERE code=?", (normalized_code,)
        ).fetchone()
        if not row:
            raise ValueError("券码不存在")
        if row["status"] != "active":
            raise ValueError("当前卡券无法撤销")
        conn.execute(
            "UPDATE coupon_codes SET status='revoked' WHERE code=?", (normalized_code,)
        )
        result = dict(row)
        result["status"] = "revoked"
        result["remaining_redemptions"] = max(
            0, result["max_redemptions"] - result["redeemed_count"]
        )
    return result


def redeem_membership_coupon(user_id: str, code: str) -> Dict[str, Any]:
    """Redeem a coupon code and activate the corresponding membership."""
    normalized_code = _normalize_coupon_code(code)
    if not normalized_code:
        raise ValueError("请输入兑换码")

    now = int(time.time())
    today = _get_today_str()

    with _get_db() as conn:
        coupon = conn.execute(
            "SELECT * FROM coupon_codes WHERE code=?",
            (normalized_code,)
        ).fetchone()
        if not coupon:
            raise ValueError("兑换码不存在")
        if coupon["status"] != "active":
            raise ValueError("兑换码已失效")
        if coupon["expires_at"] and coupon["expires_at"] < now:
            conn.execute(
                "UPDATE coupon_codes SET status='expired' WHERE code=?",
                (normalized_code,)
            )
            raise ValueError("兑换码已过期")
        if coupon["redeemed_count"] >= coupon["max_redemptions"]:
            raise ValueError("兑换码已被使用")

        plan = coupon["plan"]
        order_type = coupon["order_type"]
        duration_days = _membership_duration_days(plan, order_type)

        _ensure_user_membership(conn, user_id)
        _reset_daily_usage_if_needed(conn, user_id, today)

        membership = conn.execute(
            "SELECT * FROM user_membership WHERE user_id=?",
            (user_id,)
        ).fetchone()

        if membership and membership["plan"] == "ultra":
            raise ValueError("当前账号已是 Ultra 永久会员，无需重复兑换")

        if plan == "ultra" or duration_days == 0:
            expires_at = 0
        else:
            base_time = now
            if membership and membership["plan"] == plan and membership["expires_at"] > now:
                base_time = membership["expires_at"]
            expires_at = base_time + duration_days * 86400

        new_count = coupon["redeemed_count"] + 1
        new_status = "used" if new_count >= coupon["max_redemptions"] else "active"
        cur = conn.execute(
            """UPDATE coupon_codes
               SET redeemed_count=?, status=?, redeemed_by=?, redeemed_at=?
               WHERE code=? AND status='active' AND redeemed_count=?""",
            (
                new_count,
                new_status,
                user_id,
                now,
                normalized_code,
                coupon["redeemed_count"],
            )
        )
        if cur.rowcount != 1:
            raise ValueError("兑换码已被使用，请刷新后重试")

        conn.execute(
            """UPDATE user_membership
               SET plan=?, expires_at=?, updated_at=?
               WHERE user_id=?""",
            (plan, expires_at, now, user_id)
        )
        conn.execute(
            """INSERT INTO coupon_redemptions
               (code, user_id, plan, order_type, redeemed_at)
               VALUES (?, ?, ?, ?, ?)""",
            (normalized_code, user_id, plan, order_type, now)
        )

    return {
        "code": normalized_code,
        "plan": plan,
        "order_type": order_type,
        "expires_at": expires_at,
    }


def create_order(
    user_id: str,
    plan: str,
    order_type: str,
    amount: float,
    currency: str = "CNY",
    payment_gateway: str = "",
) -> str:
    """创建订单，返回订单 ID"""
    import uuid
    order_id = uuid.uuid4().hex
    now = int(time.time())

    with _get_db() as conn:
        conn.execute(
            """INSERT INTO orders (id, user_id, plan, order_type, amount, currency, status, payment_gateway, created_at)
               VALUES (?,?,?,?,?,?, 'pending', ?, ?)""",
            (order_id, user_id, plan, order_type, amount, currency, payment_gateway, now)
        )
    return order_id


def get_order(order_id: str) -> Optional[Dict[str, Any]]:
    """Return one order as a plain dict, or None when it does not exist."""
    with _get_db() as conn:
        row = conn.execute(
            "SELECT * FROM orders WHERE id=?", (order_id,)
        ).fetchone()
    return dict(row) if row else None


def update_order_gateway_data(order_id: str, gateway_data: dict) -> bool:
    """Store payment gateway metadata for reconciliation."""
    with _get_db() as conn:
        cur = conn.execute(
            "UPDATE orders SET gateway_data_json=? WHERE id=?",
            (json.dumps(gateway_data), order_id)
        )
    return cur.rowcount > 0


def mark_order_paid(
    order_id: str,
    gateway_order_id: str = "",
    gateway_data: dict = None,
) -> Optional[str]:
    """
    标记订单已支付，并自动升级用户会员。
    返回 user_id 或 None。
    """
    now = int(time.time())
    gateway_data = gateway_data or {}

    with _get_db() as conn:
        row = conn.execute(
            "SELECT * FROM orders WHERE id=?", (order_id,)
        ).fetchone()
        if not row:
            return None
        order = dict(row)
        if order["status"] == "paid":
            return order["user_id"]  # 幂等

        conn.execute(
            """UPDATE orders
               SET status='paid', gateway_order_id=?, gateway_data_json=?, paid_at=?
               WHERE id=?""",
            (gateway_order_id, json.dumps(gateway_data), now, order_id)
        )

    # 根据订单类型计算有效期
    if order["plan"] == "ultra" or order["order_type"] == "lifetime":
        duration_days = 0  # 永久
    elif order["order_type"] == "yearly":
        duration_days = 365
    else:
        duration_days = 30  # monthly

    set_user_plan(order["user_id"], order["plan"], order["order_type"], duration_days)

    return order["user_id"]


def get_plan_config(plan: str) -> Dict[str, Any]:
    """获取套餐配置（供前端展示）"""
    return PLAN_CONFIG.get(plan, PLAN_CONFIG["free"])


def get_all_plans() -> Dict[str, Dict[str, Any]]:
    """获取所有套餐配置（供前端定价页展示）"""
    # 返回副本，防止前端意外修改
    return {
        "free": dict(PLAN_CONFIG["free"]),
        "pro": dict(PLAN_CONFIG["pro"]),
        "ultra": dict(PLAN_CONFIG["ultra"]),
    }


# ═══════════════════════════════════════════════
#  游客额度系统（基于 IP + 日期，无需登录）
# ═══════════════════════════════════════════════

# 游客每日免费下载次数
GUEST_DAILY_DOWNLOADS = 1
GUEST_DAILY_SUMMARIES = 1


def _init_guest_table(conn: sqlite3.Connection):
    """初始化游客用量表"""
    conn.execute("""
        CREATE TABLE IF NOT EXISTS guest_usage (
            ip_address TEXT NOT NULL,
            usage_date TEXT NOT NULL,
            action TEXT NOT NULL,
            count INTEGER NOT NULL DEFAULT 0,
            PRIMARY KEY (ip_address, usage_date, action)
        )
    """)


def get_guest_quota(ip_address: str) -> Dict[str, Any]:
    """
    获取游客当前额度信息。
    无需登录，基于 IP + 日期追踪。
    """
    today = _get_today_str()
    with _get_db() as conn:
        _init_guest_table(conn)
        # 清理过期数据（保留最近 7 天）
        conn.execute(
            "DELETE FROM guest_usage WHERE usage_date < ?",
            ((datetime.now() - timedelta(days=7)).strftime("%Y-%m-%d"),)
        )

        row = conn.execute(
            "SELECT action, count FROM guest_usage WHERE ip_address=? AND usage_date=?",
            (ip_address, today)
        ).fetchall()

    downloads_used = 0
    summaries_used = 0
    for r in row:
        if r["action"] == "download":
            downloads_used = r["count"]
        elif r["action"] == "summarize":
            summaries_used = r["count"]

    return {
        "plan": "guest",
        "daily_downloads_limit": GUEST_DAILY_DOWNLOADS,
        "daily_summaries_limit": GUEST_DAILY_SUMMARIES,
        "daily_batch_items_limit": 0,
        "daily_creator_credits_limit": 0,
        "daily_downloads_used": downloads_used,
        "daily_summaries_used": summaries_used,
        "daily_batch_items_used": 0,
        "daily_creator_credits_used": 0,
        "can_batch_download": False,
        "can_batch_parse": False,
        "batch_max_count": 0,
        "can_export_mindmap": False,
        "max_quality": "源站可用",
        "has_watermark": False,
        "is_expired": False,
        "is_guest": True,
    }


def check_and_consume_guest_quota(
    ip_address: str,
    action: str,
    video_url: str = "",
) -> Dict[str, Any]:
    """
    检查并消耗游客额度。原子操作。

    Returns:
        { "allowed": bool, "quota": dict, "reason": str, "remaining": int }
    """
    today = _get_today_str()
    now = int(time.time())

    if action not in ("download", "summarize", "mindmap"):
        return {"allowed": False, "reason": f"未知操作类型: {action}"}

    # 游客思维导图与总结共享额度
    quota_action = "summarize" if action in ("summarize", "mindmap") else "download"
    # 映射到 dict 键名（注意复数形式：summaries 不是 summarizes）
    quota_key = "summaries" if quota_action == "summarize" else "downloads"
    limit = GUEST_DAILY_SUMMARIES if quota_action == "summarize" else GUEST_DAILY_DOWNLOADS

    quota = get_guest_quota(ip_address)
    used = quota[f"daily_{quota_key}_used"]

    if used >= limit:
        action_label = "总结" if quota_action == "summarize" else "下载"
        return {
            "allowed": False,
            "quota": quota,
            "reason": f"游客今日{action_label}额度已用完（{used}/{limit}），请登录获取更多额度",
            "remaining": 0,
        }

    with _get_db() as conn:
        _init_guest_table(conn)
        conn.execute(
            """INSERT INTO guest_usage (ip_address, usage_date, action, count)
               VALUES (?, ?, ?, 1)
               ON CONFLICT (ip_address, usage_date, action)
               DO UPDATE SET count = count + 1""",
            (ip_address, today, quota_action)
        )

    remaining = limit - (used + 1)
    quota[f"daily_{quota_key}_used"] = used + 1

    return {
        "allowed": True,
        "quota": quota,
        "reason": "",
        "remaining": remaining,
    }


# 启动时初始化
init_membership_db()
