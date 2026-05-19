"""
万能视频下载网站 - 后端 API
基于 FastAPI + yt-dlp + 抖音专用解析
"""
import os
import json
import asyncio
import queue as std_queue
import urllib.request
from contextlib import asynccontextmanager
from pathlib import Path
from typing import Optional
from fastapi import FastAPI, HTTPException, Query, Depends, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, StreamingResponse, Response
from pydantic import BaseModel
from downloader import VideoDownloader
from douyin import DouyinParser, is_douyin_url
from summarizer import summarize_video, parse_video, summarize_text, generate_mindmap, extract_subtitles_segments
from auth import create_user, authenticate_user, create_token, get_current_user, get_optional_user, get_user_by_id, init_db
from membership import (
    get_user_quota, check_and_consume_quota, get_all_plans, get_plan_config,
    create_order, mark_order_paid, QuotaInfo, init_membership_db,
    get_guest_quota, check_and_consume_guest_quota,
)


# ── 应用生命周期 ──
@asynccontextmanager
async def lifespan(app: FastAPI):
    # 启动时初始化数据库
    init_db()
    init_membership_db()
    print("[启动] 数据库初始化完成")
    yield
    # 关闭时清理（可选）

app = FastAPI(title="万能视频下载器", version="1.0.0", lifespan=lifespan)

# CORS 允许前端访问
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# 下载目录
DOWNLOAD_DIR = Path(__file__).parent / "downloads"
DOWNLOAD_DIR.mkdir(exist_ok=True)

downloader = VideoDownloader(str(DOWNLOAD_DIR))
douyin_parser = DouyinParser(download_dir=str(DOWNLOAD_DIR))


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


class SummarizeTextRequest(BaseModel):
    subtitles: str
    title: str = ""


class TranscribeRequest(BaseModel):
    url: str
    model: str = "base"
    language: str = ""
    prompt: str = ""


@app.get("/api/health")
async def health():
    return {"status": "ok", "message": "万能视频下载器运行中"}


@app.post("/api/auth/register")
async def register(req: RegisterRequest):
    """注册新用户"""
    try:
        user = create_user(req.username, req.email, req.password)
        token = create_token(user["id"])
        return {"success": True, "user": user, "token": token}
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@app.post("/api/auth/login")
async def login(req: LoginRequest):
    """用户登录"""
    user = authenticate_user(req.login, req.password)
    if not user:
        raise HTTPException(status_code=401, detail="用户名/邮箱或密码错误")
    token = create_token(user["id"])
    return {"success": True, "user": user, "token": token}


@app.get("/api/auth/me")
async def me(user: dict = Depends(get_current_user)):
    """获取当前用户信息（含会员状态）"""
    quota = get_user_quota(user["id"])
    user["plan"] = quota.plan
    user["quota"] = {
        "daily_downloads_limit": quota.daily_downloads_limit,
        "daily_summaries_limit": quota.daily_summaries_limit,
        "daily_downloads_used": quota.daily_downloads_used,
        "daily_summaries_used": quota.daily_summaries_used,
        "can_batch_download": quota.can_batch_download,
        "can_export_mindmap": quota.can_export_mindmap,
        "max_quality": quota.max_quality,
        "has_watermark": quota.has_watermark,
        "is_expired": quota.is_expired,
    }
    return {"success": True, "user": user}


# ==================== 会员套餐 API ====================

@app.get("/api/membership/plans")
async def get_plans():
    """获取所有套餐配置（供前端定价页展示）"""
    return {"success": True, "plans": get_all_plans()}


@app.get("/api/membership/quota")
async def my_quota(user: dict = Depends(get_current_user)):
    """获取当前用户的额度信息"""
    quota = get_user_quota(user["id"])
    return {
        "success": True,
        "quota": {
            "plan": quota.plan,
            "daily_downloads_limit": quota.daily_downloads_limit,
            "daily_summaries_limit": quota.daily_summaries_limit,
            "daily_downloads_used": quota.daily_downloads_used,
            "daily_summaries_used": quota.daily_summaries_used,
            "can_batch_download": quota.can_batch_download,
            "batch_max_count": quota.batch_max_count,
            "can_export_mindmap": quota.can_export_mindmap,
            "max_quality": quota.max_quality,
            "has_watermark": quota.has_watermark,
            "is_expired": quota.is_expired,
            "expires_at": quota.expires_at,
        }
    }


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
                    return {
                        "success": True,
                        "quota": {
                            "plan": quota.plan,
                            "daily_downloads_limit": quota.daily_downloads_limit,
                            "daily_summaries_limit": quota.daily_summaries_limit,
                            "daily_downloads_used": quota.daily_downloads_used,
                            "daily_summaries_used": quota.daily_summaries_used,
                            "can_batch_download": quota.can_batch_download,
                            "batch_max_count": quota.batch_max_count,
                            "can_export_mindmap": quota.can_export_mindmap,
                            "max_quality": quota.max_quality,
                            "has_watermark": quota.has_watermark,
                            "is_expired": quota.is_expired,
                            "expires_at": quota.expires_at,
                            "is_guest": False,
                        }
                    }
        except Exception:
            pass

    # 返回游客额度
    ip = request.client.host if request.client else "127.0.0.1"
    quota = get_guest_quota(ip)
    return {"success": True, "quota": quota}


class CreateOrderRequest(BaseModel):
    plan: str          # pro / ultra
    order_type: str = "monthly"  # monthly / yearly / lifetime


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
        amount = config.get("price_lifetime", 299)
    elif order_type == "yearly":
        amount = config.get("price_yearly", 199)
    else:
        amount = config.get("price_monthly", 29)
    
    if amount <= 0:
        raise HTTPException(status_code=400, detail="该套餐暂不支持此购买方式")
    
    order_id = create_order(
        user_id=user["id"],
        plan=plan,
        order_type=order_type,
        amount=amount,
        currency="CNY",
        payment_gateway="lemonsqueezy",  # 默认网关，可配置
    )
    
    # TODO: 实际对接时，这里调用支付网关 API 创建 Checkout Session
    # checkout_url = lemon_squeezy_create_checkout(order_id, amount, plan)
    
    return {
        "success": True,
        "order_id": order_id,
        "amount": amount,
        "currency": "CNY",
        "plan": plan,
        "order_type": order_type,
        # "checkout_url": checkout_url,  # 支付页面 URL
    }


@app.post("/api/membership/payment-callback")
async def payment_callback(
    order_id: str = Query(...),
    gateway_order_id: str = Query(""),
):
    """
    支付网关回调接口（简化版）。
    
    生产环境中需要：
    1. 验证 Webhook 签名（防止伪造回调）
    2. 幂等处理（同一订单多次回调）
    3. 记录完整的网关原始数据
    """
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
                data = {"status": "finished", "filename": os.path.basename(d.get("filename", ""))}
            else:
                data = {"status": d["status"]}
            progress_queue.put(data)  # 线程安全

        # 在后台线程中下载（抖音走专用模块，无水印）
        async def run_download():
            if is_douyin_url(req.url):
                return await asyncio.to_thread(douyin_parser.download, req.url)
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
