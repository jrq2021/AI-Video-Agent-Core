"""
万能视频下载网站 - 后端 API
基于 FastAPI + yt-dlp + 抖音专用解析
"""
import os
import json
import asyncio
import time
import uuid
import queue as std_queue
import urllib.request
from urllib.parse import urlparse
from decimal import Decimal
from contextlib import asynccontextmanager
from pathlib import Path
from typing import Optional, Dict, Any
from fastapi import FastAPI, HTTPException, Query, Depends, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, StreamingResponse, Response
from pydantic import BaseModel, Field
from downloader import VideoDownloader
from douyin import DouyinParser, is_douyin_url
from bilibili import BilibiliParser, is_bilibili_url
from summarizer import summarize_video, parse_video, summarize_text, generate_mindmap, extract_subtitles_segments
from auth import create_user, authenticate_user, create_token, get_current_user, get_optional_user, get_user_by_id, init_db
from email_verification import (
    init_email_verification_db,
    issue_email_code,
    require_email_code,
    reset_password_with_email_code,
)
from membership import (
    get_user_quota, check_and_consume_quota, get_all_plans, get_plan_config,
    create_order, mark_order_paid, QuotaInfo, init_membership_db,
    get_guest_quota, check_and_consume_guest_quota, get_order,
    update_order_gateway_data, redeem_membership_coupon, refund_quota_once,
)
from parse_history import init_parse_history_db, parse_history_store
from batch_jobs import BatchProcessor, batch_job_store, init_batch_jobs_db
from creator_tools import ALLOWED_TARGET_LANGUAGES, create_creator_pack, translate_segments
from hupijiao import (
    HUPIJIAO_APPID,
    HupijiaoConfigError,
    HupijiaoPaymentError,
    create_payment as create_hupijiao_payment,
    verify_hash as verify_hupijiao_hash,
)
from runtime_config import get_runtime_settings, validate_runtime_settings
from auth_rate_limit import (
    init_auth_rate_limit_db,
    is_rate_limited,
    record_rate_limit_event,
)


async def batch_worker_loop(stop_event: asyncio.Event) -> None:
    processor = BatchProcessor(batch_job_store, parse_history_store)
    while not stop_event.is_set():
        try:
            processed = await asyncio.to_thread(processor.run_once)
        except Exception as exc:
            print(f"[batch-worker] {exc}")
            processed = None
        try:
            await asyncio.wait_for(stop_event.wait(), timeout=0.25 if processed else 1.0)
        except asyncio.TimeoutError:
            pass


# ── 应用生命周期 ──
@asynccontextmanager
async def lifespan(app: FastAPI):
    # 启动时初始化数据库
    validate_runtime_settings()
    init_db()
    init_auth_rate_limit_db()
    init_email_verification_db()
    init_membership_db()
    init_parse_history_db()
    init_batch_jobs_db()
    app.state.batch_worker_stop = asyncio.Event()
    app.state.batch_worker_task = asyncio.create_task(batch_worker_loop(app.state.batch_worker_stop))
    print("[启动] 数据库初始化完成")
    try:
        yield
    finally:
        app.state.batch_worker_stop.set()
        await app.state.batch_worker_task

app = FastAPI(title="万能视频下载器", version="1.0.0", lifespan=lifespan)

# CORS 允许前端访问
runtime_settings = get_runtime_settings()
app.add_middleware(
    CORSMiddleware,
    allow_origins=list(runtime_settings.cors_allow_origins),
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# 下载目录
DOWNLOAD_DIR = Path(__file__).parent / "downloads"
DOWNLOAD_DIR.mkdir(exist_ok=True)

downloader = VideoDownloader(str(DOWNLOAD_DIR))
douyin_parser = DouyinParser(download_dir=str(DOWNLOAD_DIR))
bilibili_parser = BilibiliParser(download_dir=str(DOWNLOAD_DIR))


class URLRequest(BaseModel):
    url: str


class DownloadRequest(BaseModel):
    url: str
    format_id: str = "best"


class LoginRequest(BaseModel):
    login: str  # 用户名或邮箱
    password: str


class RegisterRequest(BaseModel):
    username: str
    email: str
    password: str
    code: str


class SendEmailCodeRequest(BaseModel):
    email: str
    purpose: str  # register / reset_password


class ResetPasswordRequest(BaseModel):
    email: str
    code: str
    password: str


class SummarizeTextRequest(BaseModel):
    subtitles: str
    title: str = ""


class TranscribeRequest(BaseModel):
    url: str
    model: str = "base"
    language: str = ""
    prompt: str = ""


class ParseHistoryUpsertRequest(BaseModel):
    video: Dict[str, Any]
    artifacts: Dict[str, Any] = Field(default_factory=dict)


class ParseHistoryArtifactsRequest(BaseModel):
    artifacts: Dict[str, Any] = Field(default_factory=dict)


class BatchJobRequest(BaseModel):
    urls: list[str]


class SubtitleTranslationRequest(BaseModel):
    record_key: str
    target_language: str


class CreatorPackRequest(BaseModel):
    record_key: str


@app.get("/api/health")
async def health():
    return {"status": "ok", "message": "万能视频下载器运行中"}


@app.post("/api/auth/register")
async def register(req: RegisterRequest):
    """注册新用户"""
    try:
        require_email_code(req.email, "register", req.code)
        user = create_user(req.username, req.email, req.password)
        token = create_token(user["id"])
        return {"success": True, "user": user, "token": token}
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@app.post("/api/auth/send-code")
async def send_auth_email_code(req: SendEmailCodeRequest, request: Request):
    """发送注册 / 找回密码邮箱验证码。登录仍使用密码，不需要验证码。"""
    ip = request.client.host if request.client else "127.0.0.1"
    try:
        settings = get_runtime_settings()
        now = int(time.time())
        if is_rate_limited(
            "send_code",
            ip,
            settings.email_code_ip_max_requests,
            settings.rate_limit_window_seconds,
            now,
        ):
            raise HTTPException(status_code=429, detail="验证码请求过于频繁，请稍后再试")
        record_rate_limit_event("send_code", ip, now)
        result = issue_email_code(req.email, req.purpose, ip_address=ip)
        response = {
            "success": True,
            "message": "验证码已发送，有效期 10 分钟",
            "expires_in": result["expires_in"],
            "cooldown": result["cooldown"],
        }
        if "debug_code" in result:
            response["debug_code"] = result["debug_code"]
        return response
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except RuntimeError as e:
        raise HTTPException(status_code=503, detail=str(e))


@app.post("/api/auth/login")
async def login(req: LoginRequest, request: Request):
    """用户登录"""
    ip = request.client.host if request.client else "127.0.0.1"
    settings = get_runtime_settings()
    now = int(time.time())
    if is_rate_limited(
        "login_failure",
        ip,
        settings.login_ip_max_failures,
        settings.rate_limit_window_seconds,
        now,
    ):
        raise HTTPException(status_code=429, detail="登录失败次数过多，请稍后再试")
    user = authenticate_user(req.login, req.password)
    if not user:
        record_rate_limit_event("login_failure", ip, now)
        raise HTTPException(status_code=401, detail="用户名/邮箱或密码错误")
    token = create_token(user["id"])
    return {"success": True, "user": user, "token": token}


@app.post("/api/auth/reset-password")
async def reset_password(req: ResetPasswordRequest):
    """通过邮箱验证码重置密码，成功后直接返回登录态。"""
    try:
        user = reset_password_with_email_code(req.email, req.code, req.password)
        token = create_token(user["id"])
        return {"success": True, "user": user, "token": token}
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@app.get("/api/auth/me")
async def me(user: dict = Depends(get_current_user)):
    """获取当前用户信息（含会员状态）"""
    quota = get_user_quota(user["id"])
    user["plan"] = quota.plan
    user["quota"] = serialize_quota(quota)
    return {"success": True, "user": user}


# ==================== 会员套餐 API ====================

@app.get("/api/parse-history")
async def list_parse_history(user: dict = Depends(get_current_user)):
    return {
        "success": True,
        "records": parse_history_store.list_records(user["id"]),
    }


@app.get("/api/parse-history/{record_key}")
async def get_parse_history_record(
    record_key: str,
    user: dict = Depends(get_current_user),
):
    try:
        record = parse_history_store.get_record(user["id"], record_key)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    if not record:
        raise HTTPException(status_code=404, detail="解析历史不存在")
    return {"success": True, "record": record}


@app.post("/api/parse-history")
async def upsert_parse_history(
    req: ParseHistoryUpsertRequest,
    user: dict = Depends(get_current_user),
):
    try:
        record = parse_history_store.upsert(
            user["id"],
            req.video,
            req.artifacts,
        )
        return {"success": True, "record": record}
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))


@app.patch("/api/parse-history/{record_key}")
async def patch_parse_history(
    record_key: str,
    req: ParseHistoryArtifactsRequest,
    user: dict = Depends(get_current_user),
):
    try:
        record = parse_history_store.update_artifacts(
            user["id"],
            record_key,
            req.artifacts,
        )
        return {"success": True, "record": record}
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    except KeyError:
        raise HTTPException(status_code=404, detail="解析历史不存在")


@app.delete("/api/parse-history")
async def clear_parse_history(user: dict = Depends(get_current_user)):
    parse_history_store.clear_records(user["id"])
    return {"success": True}


def normalize_batch_urls(urls: list[str]) -> list[str]:
    normalized: list[str] = []
    seen: set[str] = set()
    for raw_url in urls:
        url = str(raw_url or "").strip()
        parsed = urlparse(url)
        if parsed.scheme not in ("http", "https") or not parsed.netloc:
            raise ValueError("Batch jobs only accept valid http(s) video URLs")
        if url in seen:
            raise ValueError("Duplicate video URLs are not allowed in one batch")
        normalized.append(url)
        seen.add(url)
    if not normalized:
        raise ValueError("Please provide at least one video URL")
    return normalized


@app.post("/api/batch-jobs")
async def create_batch_job(req: BatchJobRequest, user: dict = Depends(get_current_user)):
    quota = get_user_quota(user["id"])
    if not quota.can_batch_parse:
        raise HTTPException(status_code=403, detail="Batch parsing is available to Pro members")
    try:
        urls = normalize_batch_urls(req.urls)
        if len(urls) > quota.batch_max_count:
            raise ValueError(f"This membership can parse up to {quota.batch_max_count} links per batch")
        job = batch_job_store.create_job(user["id"], urls, quota.batch_max_count)
        return {"success": True, "job": job}
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))


@app.get("/api/batch-jobs")
async def list_batch_jobs(user: dict = Depends(get_current_user)):
    return {"success": True, "jobs": batch_job_store.list_jobs(user["id"])}


@app.get("/api/batch-jobs/{job_id}")
async def get_batch_job(job_id: str, user: dict = Depends(get_current_user)):
    return {"success": True, "job": batch_job_store.get_job(user["id"], job_id)}


def get_owned_parse_record(user_id: str, record_key: str) -> Dict[str, Any]:
    try:
        record = parse_history_store.get_record(user_id, record_key)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    if not record:
        raise HTTPException(status_code=404, detail="Parse history record not found")
    return record


@app.post("/api/video/translate-subtitles")
async def translate_subtitles(
    req: SubtitleTranslationRequest,
    user: dict = Depends(get_current_user),
):
    record = get_owned_parse_record(user["id"], req.record_key)
    if req.target_language not in ALLOWED_TARGET_LANGUAGES:
        raise HTTPException(status_code=400, detail="Unsupported target language")
    if (
        record.get("translation_language") == req.target_language
        and record.get("translated_segments")
    ):
        return {"success": True, "data": record["translated_segments"], "cached": True}
    if not record.get("segments"):
        raise HTTPException(status_code=400, detail="Extract subtitles before translating them")

    audit_key = f"translate:{req.record_key}:{req.target_language}:{uuid.uuid4().hex}"
    quota_result = check_and_consume_quota(
        user["id"], "translate", audit_key=audit_key
    )
    if not quota_result.get("allowed"):
        raise HTTPException(status_code=429, detail=quota_result.get("reason", "Creator quota exceeded"))
    try:
        translated_segments = await asyncio.to_thread(
            translate_segments,
            record["segments"],
            req.target_language,
        )
        parse_history_store.update_artifacts(
            user["id"],
            req.record_key,
            {
                "translated_segments": translated_segments,
                "translation_language": req.target_language,
            },
        )
    except Exception as exc:
        refund_quota_once(user["id"], "creator_credits", audit_key, str(exc))
        raise HTTPException(status_code=502, detail=f"Subtitle translation failed: {exc}")
    return {"success": True, "data": translated_segments, "cached": False}


@app.post("/api/video/creator-pack")
async def generate_creator_pack(
    req: CreatorPackRequest,
    user: dict = Depends(get_current_user),
):
    record = get_owned_parse_record(user["id"], req.record_key)
    if record.get("creator_pack"):
        return {"success": True, "data": record["creator_pack"], "cached": True}
    if len(str(record.get("subtitles", "")).strip()) < 20:
        raise HTTPException(status_code=400, detail="Extract usable subtitles before generating a creator pack")

    audit_key = f"creator-pack:{req.record_key}:{uuid.uuid4().hex}"
    quota_result = check_and_consume_quota(
        user["id"], "creator_pack", audit_key=audit_key
    )
    if not quota_result.get("allowed"):
        raise HTTPException(status_code=429, detail=quota_result.get("reason", "Creator quota exceeded"))
    try:
        pack = await asyncio.to_thread(
            create_creator_pack,
            record["subtitles"],
            record.get("segments", []),
            record.get("title", ""),
        )
        parse_history_store.update_artifacts(
            user["id"], req.record_key, {"creator_pack": pack}
        )
    except Exception as exc:
        refund_quota_once(user["id"], "creator_credits", audit_key, str(exc))
        raise HTTPException(status_code=502, detail=f"Creator pack generation failed: {exc}")
    return {"success": True, "data": pack, "cached": False}


@app.get("/api/membership/plans")
async def get_plans():
    """获取所有套餐配置（供前端定价页展示）"""
    return {"success": True, "plans": get_all_plans()}


@app.get("/api/membership/quota")
async def my_quota(user: dict = Depends(get_current_user)):
    """获取当前用户的额度信息"""
    quota = get_user_quota(user["id"])
    return {"success": True, "quota": serialize_quota(quota)}


@app.get("/api/membership/my-quota")
async def my_quota_optional(request: Request):
    """
    获取当前额度信息（可选登录）。
    - 已登录用户：返回会员额度
    - 游客：返回游客额度（IP 追踪，每日 1 次下载）
    """
    # 先尝试从 Auth header 获取用户
    auth = request.headers.get("Authorization", "")
    if auth.startswith("Bearer "):
        try:
            from auth import decode_token, get_user_by_id
            user_id = decode_token(auth[7:])
            if user_id:
                user = get_user_by_id(user_id)
                if user:
                    quota = get_user_quota(user["id"])
                    return {"success": True, "quota": serialize_quota(quota)}
        except Exception:
            pass

    # 返回游客额度
    ip = request.client.host if request.client else "127.0.0.1"
    quota = get_guest_quota(ip)
    return {"success": True, "quota": quota}


class CreateOrderRequest(BaseModel):
    plan: str          # pro / ultra
    order_type: str = "monthly"  # monthly / yearly / lifetime


class RedeemCodeRequest(BaseModel):
    code: str


def serialize_quota(quota: QuotaInfo) -> dict:
    return {
        "plan": quota.plan,
        "daily_downloads_limit": quota.daily_downloads_limit,
        "daily_summaries_limit": quota.daily_summaries_limit,
        "daily_batch_items_limit": quota.daily_batch_items_limit,
        "daily_creator_credits_limit": quota.daily_creator_credits_limit,
        "daily_downloads_used": quota.daily_downloads_used,
        "daily_summaries_used": quota.daily_summaries_used,
        "daily_batch_items_used": quota.daily_batch_items_used,
        "daily_creator_credits_used": quota.daily_creator_credits_used,
        "can_batch_download": quota.can_batch_download,
        "can_batch_parse": quota.can_batch_parse,
        "batch_max_count": quota.batch_max_count,
        "can_export_mindmap": quota.can_export_mindmap,
        "max_quality": quota.max_quality,
        "has_watermark": quota.has_watermark,
        "is_expired": quota.is_expired,
        "expires_at": quota.expires_at,
        "is_guest": False,
    }


@app.post("/api/membership/redeem-code")
async def redeem_code(req: RedeemCodeRequest, user: dict = Depends(get_current_user)):
    """Redeem a Xianyu/manual coupon code and unlock the matching membership."""
    try:
        redemption = redeem_membership_coupon(user["id"], req.code)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))

    quota = get_user_quota(user["id"])
    return {
        "success": True,
        "message": "兑换成功，会员已开通",
        "redemption": redemption,
        "quota": serialize_quota(quota),
    }


@app.post("/api/membership/create-order")
async def api_create_order(req: CreateOrderRequest, user: dict = Depends(get_current_user)):
    """
    创建支付订单。
    返回订单 ID 和支付信息，前端据此跳转支付网关。
    
    注意：本示例使用 Lemon Squeezy / Stripe 的简化流程，
    实际部署时需要对接具体网关的 API 创建 Checkout Session。
    """
    plan = req.plan
    order_type = req.order_type
    
    config = get_plan_config(plan)
    if not config or plan == "free":
        raise HTTPException(status_code=400, detail="无效的套餐")
    
    # 计算金额
    if order_type == "lifetime" or plan == "ultra":
        amount = config.get("price_lifetime", 199)
    elif order_type == "yearly":
        amount = config.get("price_yearly", 99)
    else:
        amount = config.get("price_monthly", 9.9)
    
    if amount <= 0:
        raise HTTPException(status_code=400, detail="该套餐暂不支持此购买方式")
    
    order_id = create_order(
        user_id=user["id"],
        plan=plan,
        order_type=order_type,
        amount=amount,
        currency="CNY",
        payment_gateway="hupijiao",
    )

    title = f"AI Video {config.get('name_en', plan)} {order_type}"
    try:
        payment = create_hupijiao_payment(
            order_id=order_id,
            amount=amount,
            title=title,
            attach=json.dumps(
                {"user_id": user["id"], "plan": plan, "order_type": order_type},
                ensure_ascii=False,
            ),
        )
        update_order_gateway_data(order_id, {"create_response": payment["raw"]})
    except HupijiaoConfigError as e:
        raise HTTPException(status_code=503, detail=str(e))
    except HupijiaoPaymentError as e:
        raise HTTPException(status_code=502, detail=str(e))
    
    return {
        "success": True,
        "order_id": order_id,
        "amount": amount,
        "currency": "CNY",
        "plan": plan,
        "order_type": order_type,
        "payment_gateway": "hupijiao",
        "checkout_url": payment["checkout_url"],
    }


@app.post("/api/membership/hupijiao/notify")
async def hupijiao_notify(request: Request):
    """虎皮椒支付异步通知：验签、对账、幂等开通会员。"""
    try:
        form = await request.form()
        payload = {key: str(value) for key, value in form.items()}
    except Exception:
        return Response("fail", status_code=400, media_type="text/plain")

    try:
        valid_signature = payload.get("appid") == HUPIJIAO_APPID and verify_hupijiao_hash(payload)
    except HupijiaoConfigError:
        valid_signature = False
    if not valid_signature:
        return Response("fail", status_code=400, media_type="text/plain")

    order_id = payload.get("trade_order_id", "")
    order = get_order(order_id)
    if not order:
        return Response("fail", status_code=404, media_type="text/plain")

    update_order_gateway_data(order_id, {"notify_payload": payload})

    payment_status = payload.get("status") or payload.get("order_status")
    if payment_status != "OD":
        return Response("success", media_type="text/plain")

    try:
        expected_amount = Decimal(str(order["amount"])).quantize(Decimal("0.01"))
        actual_amount = Decimal(str(payload.get("total_fee", "0"))).quantize(Decimal("0.01"))
    except Exception:
        return Response("fail", status_code=400, media_type="text/plain")
    if expected_amount != actual_amount:
        return Response("fail", status_code=400, media_type="text/plain")

    gateway_order_id = (
        payload.get("transaction_id")
        or payload.get("open_order_id")
        or payload.get("order_id")
        or ""
    )
    user_id = mark_order_paid(order_id, gateway_order_id, payload)
    if not user_id:
        return Response("fail", status_code=404, media_type="text/plain")

    return Response("success", media_type="text/plain")


@app.post("/api/membership/payment-callback")
async def payment_callback(
    order_id: str = Query(...),
    gateway_order_id: str = Query(""),
    token: str = Query(""),
):
    """
    Development-only manual callback.
    Set DEV_PAYMENT_CALLBACK_TOKEN and pass token=... to use it locally.
    """
    expected_token = os.environ.get("DEV_PAYMENT_CALLBACK_TOKEN", "")
    if not expected_token or token != expected_token:
        raise HTTPException(status_code=403, detail="手动回调已禁用")

    user_id = mark_order_paid(order_id, gateway_order_id)
    if not user_id:
        raise HTTPException(status_code=404, detail="订单不存在")
    
    return {"success": True, "message": "支付成功，会员已开通"}


@app.get("/api/thumbnail")
async def proxy_thumbnail(url: str = Query(...)):
    """代理缩略图，绕过防盗链"""
    import ssl, os

    # 保存并清除代理环境变量（urllib 会读取它们）
    proxy_backup = {}
    for k in ("HTTP_PROXY", "HTTPS_PROXY", "http_proxy", "https_proxy"):
        v = os.environ.pop(k, None)
        if v is not None:
            proxy_backup[k] = v

    try:
        ctx = ssl.create_default_context()
        ctx.check_hostname = False
        ctx.verify_mode = ssl.CERT_NONE

        req = urllib.request.Request(url, headers={
            "Referer": "https://www.bilibili.com",
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
        })
        with urllib.request.urlopen(req, timeout=15, context=ctx) as resp:
            content = resp.read()
            content_type = resp.headers.get("Content-Type", "image/jpeg")
        return Response(content=content, media_type=content_type)
    except Exception as e:
        raise HTTPException(status_code=404, detail=f"缩略图加载失败: {url[:80]}")
    finally:
        # 恢复代理环境变量
        for k, v in proxy_backup.items():
            os.environ[k] = v


@app.post("/api/info")
async def get_video_info(req: URLRequest, request: Request):
    """获取视频信息（标题、缩略图、可用格式等）+ 当前用户额度"""
    try:
        if is_douyin_url(req.url):
            info = await asyncio.to_thread(douyin_parser.parse, req.url)
        elif is_bilibili_url(req.url):
            info = await asyncio.to_thread(bilibili_parser.parse, req.url)
        else:
            info = await asyncio.to_thread(downloader.extract_info, req.url)

        # 附带当前额度信息（可选登录）
        ip = request.client.host if request.client else "127.0.0.1"
        auth = request.headers.get("Authorization", "")
        quota_info = None
        if auth.startswith("Bearer "):
            try:
                from auth import decode_token, get_user_by_id
                user_id = decode_token(auth[7:])
                if user_id:
                    u = get_user_by_id(user_id)
                    if u:
                        q = get_user_quota(u["id"])
                        quota_info = {
                            "plan": q.plan,
                            "daily_downloads_limit": q.daily_downloads_limit,
                            "daily_downloads_used": q.daily_downloads_used,
                            "daily_summaries_limit": q.daily_summaries_limit,
                            "daily_summaries_used": q.daily_summaries_used,
                            "can_export_mindmap": q.can_export_mindmap,
                            "is_guest": False,
                        }
            except Exception:
                pass
        if quota_info is None:
            quota_info = get_guest_quota(ip)

        return {"success": True, "data": info, "quota": quota_info}
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))


@app.post("/api/download")
async def download_video(req: DownloadRequest, request: Request, user: Optional[dict] = Depends(get_optional_user)):
    """
    下载视频，通过 SSE 推送进度。
    支持已登录用户（会员额度）和游客（IP 追踪，每日 1 次）。
    """
    # 获取客户端 IP
    ip = request.client.host if request.client else "127.0.0.1"

    # 额度检查
    if user:
        quota_result = check_and_consume_quota(
            user["id"], "download",
            video_url=req.url,
            ip_address=ip,
        )
    else:
        quota_result = check_and_consume_guest_quota(
            ip, "download",
            video_url=req.url,
        )

    if not quota_result["allowed"]:
        raise HTTPException(
            status_code=429,
            detail=json.dumps({
                "code": "QUOTA_EXCEEDED",
                "message": quota_result["reason"],
                "quota": {
                    "limit": quota_result["quota"]["daily_downloads_limit"] if isinstance(quota_result["quota"], dict) else quota_result["quota"].daily_downloads_limit,
                    "used": quota_result["quota"]["daily_downloads_used"] if isinstance(quota_result["quota"], dict) else quota_result["quota"].daily_downloads_used,
                    "plan": quota_result["quota"]["plan"] if isinstance(quota_result["quota"], dict) else quota_result["quota"].plan,
                }
            })
        )
    async def event_stream():
        progress_queue = std_queue.Queue()  # 线程安全队列

        def progress_hook(d):
            """yt-dlp 进度回调（在下载线程中调用）"""
            if d["status"] == "downloading":
                downloaded = d.get("downloaded_bytes", 0)
                total = d.get("total_bytes") or d.get("total_bytes_estimate", 0)
                percent = (downloaded / total * 100) if total > 0 else 0
                data = {
                    "status": "downloading",
                    "downloaded_bytes": downloaded,
                    "total_bytes": total,
                    "speed": d.get("speed") or 0,
                    "eta": d.get("eta", 0),
                    "percent": round(percent, 1),
                }
            elif d["status"] == "finished":
                data = {"status": "processing", "message": "正在整理文件…"}
            else:
                data = {"status": d["status"]}
            progress_queue.put(data)  # 线程安全

        # 在后台线程中下载（抖音走专用模块，无水印）
        async def run_download():
            if is_douyin_url(req.url):
                return await asyncio.to_thread(
                    douyin_parser.download, req.url, req.format_id, "video", progress_hook
                )
            if is_bilibili_url(req.url):
                return await asyncio.to_thread(
                    bilibili_parser.download, req.url, req.format_id, progress_hook
                )
            return await asyncio.to_thread(
                downloader.download, req.url, req.format_id, progress_hook
            )

        download_task = asyncio.ensure_future(run_download())

        yield f"data: {json.dumps({'status': 'starting'})}\n\n"

        try:
            # 边下载边实时推送进度
            while not download_task.done() or not progress_queue.empty():
                try:
                    data = progress_queue.get(timeout=0.1)
                    yield f"data: {json.dumps(data)}\n\n"
                except std_queue.Empty:
                    await asyncio.sleep(0.05)  # 让出控制权，避免阻塞事件循环

            result = download_task.result()
            yield f"data: {json.dumps({'status': 'completed', 'filename': result.get('filename', '')})}\n\n"
        except Exception as e:
            yield f"data: {json.dumps({'status': 'error', 'message': str(e)})}\n\n"

    return StreamingResponse(event_stream(), media_type="text/event-stream")


@app.post("/api/summarize")
async def summarize_video_endpoint(req: URLRequest, request: Request, user: Optional[dict] = Depends(get_optional_user)):
    """AI 视频总结，通过 SSE 流式推送。支持游客和登录用户。"""
    ip = request.client.host if request.client else "127.0.0.1"
    # 额度检查
    if user:
        quota_result = check_and_consume_quota(
            user["id"], "summarize",
            video_url=req.url,
            ip_address=ip,
        )
    else:
        quota_result = check_and_consume_guest_quota(ip, "summarize", video_url=req.url)
    if not quota_result["allowed"]:
        q = quota_result["quota"]
        raise HTTPException(
            status_code=429,
            detail=json.dumps({
                "code": "QUOTA_EXCEEDED",
                "message": quota_result["reason"],
                "quota": {
                    "limit": q["daily_summaries_limit"] if isinstance(q, dict) else q.daily_summaries_limit,
                    "used": q["daily_summaries_used"] if isinstance(q, dict) else q.daily_summaries_used,
                    "plan": q["plan"] if isinstance(q, dict) else q.plan,
                }
            })
        )
    async def event_stream():
        try:
            for chunk in summarize_video(req.url):
                yield f"data: {json.dumps(chunk, ensure_ascii=False)}\n\n"
        except Exception as e:
            yield f"data: {json.dumps({'status': 'error', 'message': str(e)}, ensure_ascii=False)}\n\n"

    return StreamingResponse(event_stream(), media_type="text/event-stream")


@app.post("/api/video/parse")
async def video_parse(req: URLRequest):
    """解析视频：提取标题+字幕（无字幕自动 ASR），供前端 Tab 面板使用"""
    try:
        data = await asyncio.to_thread(parse_video, req.url)
        return {"success": True, "data": data}
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))


@app.post("/api/video/summarize-text")
async def video_summarize_text(req: SummarizeTextRequest, request: Request, user: Optional[dict] = Depends(get_optional_user)):
    """基于已有字幕文本进行 AI 总结，SSE 流式输出。支持游客和登录用户。"""
    ip = request.client.host if request.client else "127.0.0.1"
    if user:
        quota_result = check_and_consume_quota(
            user["id"], "summarize",
            video_title=req.title,
            ip_address=ip,
        )
    else:
        quota_result = check_and_consume_guest_quota(ip, "summarize")
    if not quota_result["allowed"]:
        q = quota_result["quota"]
        raise HTTPException(
            status_code=429,
            detail=json.dumps({
                "code": "QUOTA_EXCEEDED",
                "message": quota_result["reason"],
                "quota": {
                    "limit": q["daily_summaries_limit"] if isinstance(q, dict) else q.daily_summaries_limit,
                    "used": q["daily_summaries_used"] if isinstance(q, dict) else q.daily_summaries_used,
                    "plan": q["plan"] if isinstance(q, dict) else q.plan,
                }
            })
        )
    async def event_stream():
        try:
            for chunk in summarize_text(req.subtitles, req.title):
                if isinstance(chunk, dict):
                    yield f"data: {json.dumps(chunk, ensure_ascii=False)}\n\n"
                else:
                    yield f"data: {json.dumps({'status': 'streaming', 'content': chunk}, ensure_ascii=False)}\n\n"
        except Exception as e:
            yield f"data: {json.dumps({'status': 'error', 'message': str(e)}, ensure_ascii=False)}\n\n"

    return StreamingResponse(event_stream(), media_type="text/event-stream")


@app.post("/api/video/mindmap-text")
async def video_mindmap_text(req: SummarizeTextRequest, request: Request, user: Optional[dict] = Depends(get_optional_user)):
    """基于已有字幕文本生成思维导图 Markdown。支持游客和登录用户（思维导图需 Pro/Ultra）。"""
    ip = request.client.host if request.client else "127.0.0.1"
    if user:
        quota_result = check_and_consume_quota(
            user["id"], "mindmap",
            video_title=req.title,
            ip_address=ip,
        )
    else:
        quota_result = check_and_consume_guest_quota(ip, "mindmap")
    if not quota_result["allowed"]:
        q = quota_result["quota"]
        raise HTTPException(
            status_code=429,
            detail=json.dumps({
                "code": "QUOTA_EXCEEDED",
                "message": quota_result["reason"],
                "quota": {
                    "limit": q["daily_summaries_limit"] if isinstance(q, dict) else q.daily_summaries_limit,
                    "used": q["daily_summaries_used"] if isinstance(q, dict) else q.daily_summaries_used,
                    "plan": q["plan"] if isinstance(q, dict) else q.plan,
                }
            })
        )
    try:
        markdown = await asyncio.to_thread(generate_mindmap, req.subtitles, req.title)
        return {"success": True, "data": {"markdown": markdown}}
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))


@app.post("/api/transcribe")
async def transcribe_video(req: TranscribeRequest):
    """音频转录为带时间轴字幕，SSE 流式输出（使用 transcriber 模块）"""
    from transcriber import transcribe_video as do_transcribe

    async def event_stream():
        try:
            for chunk in do_transcribe(
                req.url,
                model_name=req.model or "base",
                language=req.language or None,
                initial_prompt=req.prompt or None,
            ):
                yield f"data: {json.dumps(chunk, ensure_ascii=False)}\n\n"
        except Exception as e:
            yield f"data: {json.dumps({'status': 'error', 'message': str(e)}, ensure_ascii=False)}\n\n"

    return StreamingResponse(event_stream(), media_type="text/event-stream")


@app.get("/api/file/{filename}")
async def get_file(filename: str):
    """下载完成的文件"""
    filepath = DOWNLOAD_DIR / filename
    if not filepath.exists():
        raise HTTPException(status_code=404, detail="文件不存在")
    return FileResponse(filepath, filename=filename)


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
