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
from summarizer import summarize_video, parse_video, summarize_text, generate_mindmap, extract_subtitles_segments
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
    """获取当前用户信息"""
    return {"success": True, "user": user}


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


@app.post("/api/video/parse")
async def video_parse(req: URLRequest):
    """解析视频：提取标题+字幕（无字幕自动 ASR），供前端 Tab 面板使用"""
    try:
        data = await asyncio.to_thread(parse_video, req.url)
        return {"success": True, "data": data}
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))


@app.post("/api/video/summarize-text")
async def video_summarize_text(req: SummarizeTextRequest):
    """基于已有字幕文本进行 AI 总结，SSE 流式输出"""
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
async def video_mindmap_text(req: SummarizeTextRequest):
    """基于已有字幕文本生成思维导图 Markdown"""
    try:
        markdown = await asyncio.to_thread(generate_mindmap, req.subtitles, req.title)
        return {"success": True, "data": {"markdown": markdown}}
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))


@app.post("/api/transcribe")
async def transcribe_video(req: TranscribeRequest):
    """音频转录为带时间轴字幕，SSE 流式输出"""
    from summarizer import transcribe_audio, download_audio, extract_subtitles_segments

    async def event_stream():
        try:
            yield f"data: {json.dumps({'status': 'checking', 'message': '正在提取字幕...'}, ensure_ascii=False)}\n\n"

            # 优先用 extract_subtitles_segments 获取带时间轴的字幕
            result = await asyncio.to_thread(extract_subtitles_segments, req.url)
            if result["has_subtitle"] and result["segments"]:
                yield f"data: {json.dumps({'status': 'done', 'segments': result['segments'], 'language': result.get('language', 'zh')}, ensure_ascii=False)}\n\n"
                return

            # 无官方字幕：走 ASR
            yield f"data: {json.dumps({'status': 'downloading_audio', 'message': '未找到字幕，正在下载音频...'}, ensure_ascii=False)}\n\n"
            audio_path = await asyncio.to_thread(download_audio, req.url)
            if not audio_path:
                yield f"data: {json.dumps({'status': 'error', 'message': '音频下载失败'}, ensure_ascii=False)}\n\n"
                return

            yield f"data: {json.dumps({'status': 'transcribing', 'message': '正在语音识别...'}, ensure_ascii=False)}\n\n"
            text = await asyncio.to_thread(transcribe_audio, audio_path)
            try:
                os.remove(audio_path)
            except Exception:
                pass

            if text:
                yield f"data: {json.dumps({'status': 'done', 'segments': [{'text': text}], 'language': 'auto'}, ensure_ascii=False)}\n\n"
            else:
                yield f"data: {json.dumps({'status': 'error', 'message': '语音识别未返回结果'}, ensure_ascii=False)}\n\n"
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
