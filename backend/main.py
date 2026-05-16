"""
万能视频下载网站 - 后端 API
基于 FastAPI + yt-dlp + 抖音专用解析
"""
import os
import json
import asyncio
import queue as std_queue
import urllib.request
from pathlib import Path
from fastapi import FastAPI, HTTPException, Query, Depends
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, StreamingResponse, Response
from pydantic import BaseModel
from downloader import VideoDownloader
from douyin import DouyinParser, is_douyin_url
from summarizer import summarize_video, summarize_text
from transcriber import transcribe_video as do_transcribe, segments_to_vtt, segments_to_srt
from auth import create_user, authenticate_user, create_token, get_current_user, get_user_by_id

app = FastAPI(title="万能视频下载器", version="1.0.0")

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


class TranscribeRequest(BaseModel):
    url: str
    model: str = "base"       # tiny / base / small / medium / large
    language: str = ""        # 空字符串 = 自动检测
    prompt: str = ""          # Whisper 上下文提示，减少同音字错误


class SummarizeTextRequest(BaseModel):
    text: str                 # 字幕纯文本（必填）
    title: str = ""           # 视频标题（可选，提升总结质量）
    uploader: str = ""        # UP主（可选）
    description: str = ""     # 视频简介（可选）


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
    """获取当前用户信息"""
    return {"success": True, "user": user}


@app.get("/api/thumbnail")
async def proxy_thumbnail(url: str = Query(...)):
    """代理缩略图，绕过防盗链。国内 CDN 直连，国外走系统代理"""
    import ssl, os
    from urllib.parse import urlparse

    # 国内 CDN 站点（直连，需清除代理环境变量以免被 Clash/V2Ray 干扰）
    host = urlparse(url).netloc.lower()
    is_domestic = any(d in host for d in (
        "bilibili", "hdslb", "bilivideo",
        "douyin", "iesdouyin", "ixigua", "xigua",
        "kuaishou", "acfun",
    ))

    proxy_backup = {}
    if is_domestic:
        for k in ("HTTP_PROXY", "HTTPS_PROXY", "http_proxy", "https_proxy"):
            v = os.environ.pop(k, None)
            if v is not None:
                proxy_backup[k] = v

    try:
        ctx = ssl.create_default_context()
        ctx.check_hostname = False
        ctx.verify_mode = ssl.CERT_NONE

        if any(d in host for d in ("bilibili", "hdslb", "bilivideo")):
            referer = "https://www.bilibili.com"
        elif "youtube" in host or "ytimg" in host:
            referer = "https://www.youtube.com"
        else:
            referer = "https://www.google.com"

        req = urllib.request.Request(url, headers={
            "Referer": referer,
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
        })
        with urllib.request.urlopen(req, timeout=15, context=ctx) as resp:
            content = resp.read()
            content_type = resp.headers.get("Content-Type", "image/jpeg")
        return Response(content=content, media_type=content_type)
    except Exception as e:
        raise HTTPException(status_code=404, detail=f"缩略图加载失败: {url[:80]}")
    finally:
        for k, v in proxy_backup.items():
            os.environ[k] = v


@app.post("/api/info")
async def get_video_info(req: URLRequest):
    """获取视频信息（标题、缩略图、可用格式等）"""
    try:
        if is_douyin_url(req.url):
            info = await asyncio.to_thread(douyin_parser.parse, req.url)
        else:
            info = await asyncio.to_thread(downloader.extract_info, req.url)
        return {"success": True, "data": info}
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))


@app.post("/api/download")
async def download_video(req: DownloadRequest):
    """下载视频，通过 SSE 推送进度"""
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


@app.post("/api/summarize/text")
async def summarize_text_endpoint(req: SummarizeTextRequest):
    """
    纯文本总结 — 不涉及任何 URL 解析或音频下载。
    前端先通过 /api/transcribe 获取字幕，再将文本传入此接口。
    """
    async def event_stream():
        try:
            for chunk in summarize_text(
                subtitle_text=req.text,
                title=req.title,
                uploader=req.uploader,
                description=req.description,
            ):
                yield f"data: {json.dumps({'status': 'streaming', 'content': chunk}, ensure_ascii=False)}\n\n"
            yield f"data: {json.dumps({'status': 'done', 'message': '总结完成'}, ensure_ascii=False)}\n\n"
        except Exception as e:
            yield f"data: {json.dumps({'status': 'error', 'message': str(e)}, ensure_ascii=False)}\n\n"

    return StreamingResponse(event_stream(), media_type="text/event-stream")


@app.post("/api/summarize")
async def summarize_video_endpoint(req: URLRequest):
    """AI 视频总结，通过 SSE 流式推送"""
    async def event_stream():
        try:
            for chunk in summarize_video(req.url):
                yield f"data: {json.dumps(chunk, ensure_ascii=False)}\n\n"
        except Exception as e:
            yield f"data: {json.dumps({'status': 'error', 'message': str(e)}, ensure_ascii=False)}\n\n"

    return StreamingResponse(event_stream(), media_type="text/event-stream")


@app.post("/api/transcribe")
async def transcribe_video_endpoint(req: TranscribeRequest):
    """视频字幕/转录提取，SSE 流式返回带时间戳的字幕片段"""

    async def event_stream():
        try:
            language = req.language.strip() if req.language else None
            prompt = req.prompt.strip() if req.prompt else None
            for chunk in do_transcribe(req.url, model_name=req.model,
                                        language=language, initial_prompt=prompt):
                yield f"data: {json.dumps(chunk, ensure_ascii=False)}\n\n"
        except Exception as e:
            yield f"data: {json.dumps({'status': 'error', 'message': str(e)}, ensure_ascii=False)}\n\n"

    return StreamingResponse(event_stream(), media_type="text/event-stream")


@app.get("/api/stream/bilibili/{bvid}/{cid}")
async def stream_bilibili_video(bvid: str, cid: str, qn: str = "16"):
    """
    视频流代理：获取 B站真实视频流并转发给前端，绕过 CORS。
    前端可直接用 <video src="/api/stream/bilibili/{bvid}/{cid}"> 播放。
    """
    from transcriber import _bilibili_get_video_stream_info

    info = _bilibili_get_video_stream_info(bvid, cid)
    if not info:
        raise HTTPException(status_code=502, detail="无法获取 B站视频流")

    video_url = info.get("video_url") or info.get("audio_url")
    if not video_url:
        raise HTTPException(status_code=502, detail="无可用的视频/音频流")

    headers = {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
        "Referer": "https://www.bilibili.com/",
    }

    # 直连绕过代理
    import os as _os
    proxy_backup = {}
    for k in ("HTTP_PROXY", "HTTPS_PROXY", "http_proxy", "https_proxy"):
        v = _os.environ.pop(k, None)
        if v is not None:
            proxy_backup[k] = v

    def cleanup():
        for k, v in proxy_backup.items():
            _os.environ[k] = v

    try:
        import requests as _requests
        resp = _requests.get(video_url, headers=headers, stream=True, timeout=120)
        resp.raise_for_status()
        content_type = resp.headers.get("Content-Type", "video/mp4")
        content_length = resp.headers.get("Content-Length")

        def generate():
            try:
                for chunk in resp.iter_content(chunk_size=65536):
                    yield chunk
            finally:
                resp.close()
                cleanup()

        return StreamingResponse(
            generate(),
            media_type=content_type,
            headers={"Content-Length": content_length} if content_length else {},
        )
    except Exception as e:
        cleanup()
        raise HTTPException(status_code=502, detail=f"流代理失败: {e}")


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
