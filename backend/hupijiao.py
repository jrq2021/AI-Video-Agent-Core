import hashlib
import os
import secrets
import time
from decimal import Decimal
from pathlib import Path
from typing import Any, Dict

import requests

try:
    from dotenv import load_dotenv

    load_dotenv(Path(__file__).parent / ".env")
except Exception:
    pass


HUPIJIAO_GATEWAY_URL = os.environ.get(
    "HUPIJIAO_GATEWAY_URL",
    "https://api.xunhupay.com/payment/do.html",
)
HUPIJIAO_APPID = os.environ.get("HUPIJIAO_APPID", "").strip()
HUPIJIAO_APPSECRET = os.environ.get("HUPIJIAO_APPSECRET", "").strip()
PUBLIC_BASE_URL = (
    os.environ.get("PUBLIC_BASE_URL")
    or os.environ.get("APP_BASE_URL")
    or os.environ.get("SITE_BASE_URL")
    or ""
).strip().rstrip("/")


class HupijiaoConfigError(RuntimeError):
    pass


class HupijiaoPaymentError(RuntimeError):
    pass


def is_configured() -> bool:
    return bool(HUPIJIAO_APPID and HUPIJIAO_APPSECRET)


def require_configured() -> None:
    if not HUPIJIAO_APPID or not HUPIJIAO_APPSECRET:
        raise HupijiaoConfigError(
            "虎皮椒支付未配置：请在 backend/.env 中设置 HUPIJIAO_APPID 和 HUPIJIAO_APPSECRET"
        )


def _absolute_url(path_or_url: str) -> str:
    if path_or_url.startswith(("http://", "https://")):
        return path_or_url
    if not PUBLIC_BASE_URL:
        raise HupijiaoConfigError(
            "虎皮椒支付需要公网回调地址：请设置 PUBLIC_BASE_URL，或单独设置 HUPIJIAO_NOTIFY_URL/HUPIJIAO_RETURN_URL"
        )
    return f"{PUBLIC_BASE_URL}/{path_or_url.lstrip('/')}"


def generate_hash(data: Dict[str, Any], secret: str | None = None) -> str:
    secret = HUPIJIAO_APPSECRET if secret is None else secret
    items = []
    for key in sorted(data.keys()):
        value = data[key]
        if key == "hash" or value is None or value == "":
            continue
        items.append(f"{key}={value}")
    return hashlib.md5(("&".join(items) + secret).encode("utf-8")).hexdigest()


def verify_hash(data: Dict[str, Any]) -> bool:
    require_configured()
    expected = data.get("hash", "")
    if not expected:
        return False
    return secrets.compare_digest(generate_hash(data), expected)


def format_amount(amount: float | Decimal) -> str:
    normalized = Decimal(str(amount)).quantize(Decimal("0.01"))
    return format(normalized, "f").rstrip("0").rstrip(".")


def create_payment(
    *,
    order_id: str,
    amount: float,
    title: str,
    attach: str = "",
    return_url: str = "",
    callback_url: str = "",
) -> Dict[str, Any]:
    require_configured()

    notify_url = os.environ.get("HUPIJIAO_NOTIFY_URL", "").strip() or _absolute_url(
        "/api/membership/hupijiao/notify"
    )
    return_url = (
        return_url
        or os.environ.get("HUPIJIAO_RETURN_URL", "").strip()
        or _absolute_url(f"/?payment=success&order_id={order_id}")
    )
    callback_url = (
        callback_url
        or os.environ.get("HUPIJIAO_CALLBACK_URL", "").strip()
        or _absolute_url(f"/?payment=cancel&order_id={order_id}")
    )

    payload: Dict[str, Any] = {
        "version": "1.1",
        "appid": HUPIJIAO_APPID,
        "trade_order_id": order_id,
        "total_fee": format_amount(amount),
        "title": title[:120],
        "time": int(time.time()),
        "notify_url": notify_url,
        "return_url": return_url,
        "callback_url": callback_url,
        "plugins": "ai-video",
        "attach": attach,
        "nonce_str": secrets.token_hex(16),
    }
    payload["hash"] = generate_hash(payload)

    try:
        response = requests.post(HUPIJIAO_GATEWAY_URL, json=payload, timeout=20)
        response.raise_for_status()
        data = response.json()
    except Exception as exc:
        raise HupijiaoPaymentError(f"虎皮椒创建支付订单失败：{exc}") from exc

    if data.get("hash") and not verify_hash(data):
        raise HupijiaoPaymentError("虎皮椒返回签名校验失败")

    errcode = int(data.get("errcode", 0) or 0)
    if errcode != 0:
        raise HupijiaoPaymentError(data.get("errmsg") or "虎皮椒返回支付订单创建失败")

    checkout_url = data.get("url") or data.get("url_qrcode")
    if not checkout_url:
        raise HupijiaoPaymentError("虎皮椒未返回支付跳转地址")

    return {
        "checkout_url": checkout_url,
        "raw": data,
    }

