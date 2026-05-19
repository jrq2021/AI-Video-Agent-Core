"""
视频字幕/转录模块（无 Cookie 方案）
═══════════════════════════════════════════════════════════════════
策略：直接调用平台官方公开 API 获取音视频流和字幕，无需登录。
- B站  → api.bilibili.com 公开接口（字幕 + DASH 音频直链）
- 抖音 → aweme/detail API + Bogus 签名（视频 → 提取音频）
- 其他 → yt-dlp 游客模式（增强 UA + 国内站点直连）
"""
import os
import re
import sys
import json
import ssl
import shutil
import logging
import tempfile
import traceback
import urllib.request
from pathlib import Path
from typing import Generator, Optional, List, Dict
from urllib.parse import urlparse

import requests
import yt_dlp

logger = logging.getLogger("transcriber")
logger.setLevel(logging.DEBUG)
if not logger.handlers:
    h = logging.StreamHandler(sys.stdout)
    h.setFormatter(logging.Formatter("[transcriber] %(levelname)s %(message)s"))
    logger.addHandler(h)

# ═══════════════════════════════════════════════════════════════════════
# 通用工具
# ═══════════════════════════════════════════════════════════════════════

DOMESTIC_SITES = [
    "bilibili.com", "b23.tv", "biliapi.net", "bilivideo.com",
    "douyin.com", "iesdouyin.com", "v.douyin.com",
    "ixigua.com", "xigua.com", "kuaishou.com",
    "acfun.cn", "aixifan.com",
]

UA = (
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
    "AppleWebKit/537.36 (KHTML, like Gecko) "
    "Chrome/130.0.0.0 Safari/537.36"
)

def _is_domestic(url: str) -> bool:
    try:
        host = urlparse(url).netloc.lower()
        return any(d in host for d in DOMESTIC_SITES)
    except Exception:
        return False

def _patch_ssl():
    try:
        ctx = ssl.create_default_context()
        ctx.check_hostname = False
        ctx.verify_mode = ssl.CERT_NONE
        for flag_name in ['OP_LEGACY_SERVER_CONNECT', 'OP_IGNORE_UNEXPECTED_EOF']:
            flag = getattr(ssl, flag_name, None)
            if flag:
                ctx.options |= flag
        ssl._create_default_https_context = lambda: ctx
    except Exception:
        pass

_patch_ssl()

def sec2vtt(s: float) -> str:
    h, m = int(s // 3600), int((s % 3600) // 60)
    return f"{h:02d}:{m:02d}:{s % 60:06.3f}"

def sec2srt(s: float) -> str:
    return sec2vtt(s).replace(".", ",")

def segments_to_vtt(segments: List[Dict]) -> str:
    lines = ["WEBVTT\n"]
    for seg in segments:
        lines.append(f"\n{sec2vtt(seg['start'])} --> {sec2vtt(seg['end'])}\n{seg['text']}")
    return "\n".join(lines) + "\n"

def segments_to_srt(segments: List[Dict]) -> str:
    lines = []
    for i, seg in enumerate(segments, 1):
        lines.append(f"{i}\n{sec2srt(seg['start'])} --> {sec2srt(seg['end'])}\n{seg['text']}")
    return "\n\n".join(lines) + "\n"

def segments_to_text(segments: List[Dict]) -> str:
    return " ".join(seg["text"] for seg in segments)

def _http_get(url: str, headers: dict = None, timeout: int = 30) -> bytes:
    """带 UA 和 SSL 修补的 HTTP GET"""
    h = {"User-Agent": UA}
    if headers:
        h.update(headers)
    req = urllib.request.Request(url, headers=h)
    ctx = ssl.create_default_context()
    ctx.check_hostname = False
    ctx.verify_mode = ssl.CERT_NONE
    with urllib.request.urlopen(req, timeout=timeout, context=ctx) as resp:
        return resp.read()


# ═══════════════════════════════════════════════════════════════════════
# B站：Wbi 签名 API + Playwright 备用方案
# ═══════════════════════════════════════════════════════════════════════

import hashlib
import time as _time

def _extract_bvid(url: str) -> Optional[str]:
    m = re.search(r"(BV[\w]+)", url)
    return m.group(1) if m else None

def _is_bilibili(url: str) -> bool:
    return any(d in url for d in ("bilibili.com", "b23.tv"))


# ── Wbi 签名（从 B站 nav API 获取实时密钥）──

_WBI_KEY_CACHE = {"key": "", "ts": 0}

def _fetch_wbi_keys() -> tuple:
    """从 B站 nav API 获取 img_key 和 sub_key，缓存 30 分钟"""
    now = _time.time()
    if _WBI_KEY_CACHE["key"] and (now - _WBI_KEY_CACHE["ts"]) < 1800:
        return _WBI_KEY_CACHE["key"]

    try:
        raw = _http_get("https://api.bilibili.com/x/web-interface/nav",
                         headers={"Referer": "https://www.bilibili.com/"})
        data = json.loads(raw)
        wbi = data.get("data", {}).get("wbi_img", {})
        img_url = wbi.get("img_url", "")
        sub_url = wbi.get("sub_url", "")
        # 从 URL 中提取 key：.../wbi/abcdef.png → abcdef
        img_key = re.search(r"/([^/]+)\.png", img_url)
        sub_key = re.search(r"/([^/]+)\.png", sub_url)
        if img_key and sub_key:
            key = img_key.group(1) + sub_key.group(1)
            _WBI_KEY_CACHE["key"] = key
            _WBI_KEY_CACHE["ts"] = now
            logger.info(f"Wbi 密钥已更新: {key[:8]}...")
            return key
    except Exception as e:
        logger.warning(f"Wbi 密钥获取失败: {e}")

    # 回退：使用 douyin-api 项目中已验证的硬编码密钥
    fallback = "ea1db124af3c7062474693fa704f4ff8"
    logger.info(f"使用备用 Wbi 密钥: {fallback[:8]}...")
    return fallback


def _wbi_sign(params: dict) -> dict:
    """对参数进行 Wbi 签名，添加 w_rid 和 wts"""
    mixin_key = _fetch_wbi_keys()
    params["wts"] = str(int(_time.time()))
    # 排序并拼接
    sorted_params = sorted(params.items())
    query = "&".join(f"{k}={v}" for k, v in sorted_params)
    # 计算 w_rid = MD5(query + mixin_key)
    w_rid = hashlib.md5((query + mixin_key).encode()).hexdigest()
    params["w_rid"] = w_rid
    return params


# ── B站 cid 获取 ──

def _bilibili_get_cid(bvid: str) -> Optional[int]:
    """通过 B站公开 API 获取 cid"""
    api = f"https://api.bilibili.com/x/web-interface/view?bvid={bvid}"
    try:
        raw = _http_get(api, headers={"Referer": "https://www.bilibili.com/"})
        data = json.loads(raw)
        logger.info(f"B站 view API 响应 code={data.get('code')}")
        d = data.get("data", {})
        cid = d.get("cid")
        if not cid:
            pages = d.get("pages", [])
            if pages:
                cid = pages[0].get("cid")
        logger.info(f"cid={cid}")
        return cid
    except Exception as e:
        logger.error(f"B站 cid 获取失败: {e}\n{traceback.format_exc()}")
        return None


# ── B站音频 URL 获取（Wbi 签名）──

def _bilibili_get_audio_url_wbi(bvid: str, cid: int) -> Optional[List[str]]:
    """
    通过 Wbi 签名的 playurl API 获取 DASH 音频直链列表。
    返回 [主URL, 备用URL1, 备用URL2, ...] 或 None。
    fnval=4048 启用 DASH + 杜比 + 8K 等所有流格式。
    """
    params = _wbi_sign({
        "bvid": bvid,
        "cid": str(cid),
        "fnval": "4048",
        "fnver": "0",
        "fourk": "1",
    })
    query = "&".join(f"{k}={v}" for k, v in params.items())
    api = f"https://api.bilibili.com/x/player/wbi/playurl?{query}"

    try:
        raw = _http_get(api, headers={"Referer": "https://www.bilibili.com/"})
        data = json.loads(raw)
        code = data.get("code", -1)
        logger.info(f"B站 playurl API 响应: code={code}, message={data.get('message', '')}")

        if code != 0:
            logger.error(f"B站 API 返回错误: {json.dumps(data, ensure_ascii=False)[:500]}")
            return None

        dash = data.get("data", {}).get("dash", {})
        audios = dash.get("audio", [])
        if audios:
            audios.sort(key=lambda a: a.get("bandwidth", 0))
            urls = []
            for audio in audios:
                # 主 URL
                main_url = audio.get("base_url") or audio.get("baseUrl")
                if main_url:
                    urls.append(main_url)
                # 备用 URL 列表（B站 CDN 不同节点）
                backups = audio.get("backup_url") or audio.get("backupUrl") or []
                if isinstance(backups, str):
                    backups = [backups]
                for bu in backups:
                    if bu and bu not in urls:
                        urls.append(bu)
                # backup_urls 列表
                backup_list = audio.get("backup_urls") or audio.get("backupUrls") or []
                for bu in backup_list:
                    if bu and bu not in urls:
                        urls.append(bu)
            if urls:
                logger.info(f"✅ Wbi API 获取到 {len(urls)} 个音频 URL (bandwidth={audios[0].get('bandwidth')})")
                return urls

        # 回退：durl
        durl = data.get("data", {}).get("durl", [])
        if durl:
            urls = [d.get("url") for d in durl if d.get("url")]
            backups = [d.get("backup_url") for d in durl if d.get("backup_url")]
            all_urls = urls + backups
            if all_urls:
                return all_urls

        logger.error(f"playurl 响应无 dash 也无 durl: {json.dumps(data, ensure_ascii=False)[:500]}")
        return None
    except Exception as e:
        logger.error(f"B站 Wbi playurl 请求失败: {e}\n{traceback.format_exc()}")
        return None


def _bilibili_get_video_stream_info(bvid: str, cid: int) -> Optional[Dict]:
    """
    获取 B站视频流信息（供前端代理播放用）。
    返回 {"video_url": "...", "audio_url": "..."} 或 None。
    """
    params = _wbi_sign({
        "bvid": bvid, "cid": str(cid),
        "fnval": "4048", "fnver": "0", "fourk": "1",
    })
    query = "&".join(f"{k}={v}" for k, v in params.items())
    api = f"https://api.bilibili.com/x/player/wbi/playurl?{query}"

    try:
        raw = _http_get(api, headers={"Referer": "https://www.bilibili.com/"})
        data = json.loads(raw)
        if data.get("code") != 0:
            logger.error(f"获取视频流失败: {data.get('message')}")
            return None

        dash = data.get("data", {}).get("dash", {})
        videos = dash.get("video", [])
        audios = dash.get("audio", [])

        result = {}
        if videos:
            videos.sort(key=lambda v: v.get("id", 999))
            result["video_url"] = videos[0].get("base_url") or videos[0].get("baseUrl")
        if audios:
            audios.sort(key=lambda a: a.get("bandwidth", 0))
            result["audio_url"] = audios[0].get("base_url") or audios[0].get("baseUrl")

        # 回退 durl（非 DASH 模式）
        if not result:
            durl = data.get("data", {}).get("durl", [])
            if durl:
                result["video_url"] = durl[0].get("url")

        return result if result else None
    except Exception as e:
        logger.error(f"获取视频流信息失败: {e}")
        return None


# ── Playwright 备用方案 ──

def _bilibili_get_audio_url_playwright(url: str, bvid: str) -> Optional[str]:
    """
    使用 Playwright 无头浏览器访问 B站视频页，
    拦截网络请求，抓取 audio .m4s 流地址。
    """
    try:
        from playwright.sync_api import sync_playwright
    except ImportError:
        logger.warning("Playwright 未安装，跳过")
        return None

    logger.info("🎭 启动 Playwright 无头浏览器拦截 B站音频流...")
    audio_urls = []

    def _on_response(response):
        req_url = response.url
        if ".m4s" in req_url and "audio" in req_url.lower():
            audio_urls.append(req_url)
            logger.info(f"🎭 拦截到音频流: {req_url[:100]}...")

    try:
        with sync_playwright() as p:
            browser = p.chromium.launch(headless=True, args=[
                "--no-sandbox", "--disable-setuid-sandbox",
                "--disable-blink-features=AutomationControlled",
            ])
            context = browser.new_context(
                user_agent=UA,
                viewport={"width": 1920, "height": 1080},
                locale="zh-CN",
            )
            page = context.new_page()
            page.on("response", _on_response)

            video_url = f"https://www.bilibili.com/video/{bvid}"
            logger.info(f"🎭 访问: {video_url}")
            page.goto(video_url, wait_until="domcontentloaded", timeout=30000)

            # 等待 DASH 播放器加载（B站页面加载后约 2-5 秒会请求音视频流）
            page.wait_for_timeout(8000)

            browser.close()

            if audio_urls:
                # 选第一个（通常是最低码率，够 Whisper 用）
                return audio_urls[0]

    except Exception as e:
        logger.error(f"Playwright 拦截失败: {e}\n{traceback.format_exc()}")

    return None


def _bilibili_get_audio_url(bvid: str, cid: int, original_url: str = "") -> Optional[List[str]]:
    """
    获取 B站音频流 URL 列表（多层回退）：
    1. Wbi 签名 API（返回主 URL + 备用 URL）
    2. Playwright 网络拦截
    """
    # 方案1：Wbi 签名 API
    urls = _bilibili_get_audio_url_wbi(bvid, cid)
    if urls:
        return urls

    # 方案2：Playwright 备用
    logger.info("Wbi API 失败，尝试 Playwright 备用方案...")
    url = _bilibili_get_audio_url_playwright(original_url or f"https://www.bilibili.com/video/{bvid}", bvid)
    if url:
        return [url]

    return None


# ── B站字幕获取（/x/player/v2 仍可用，无需签名）──

def _bilibili_get_subtitles(bvid: str, cid: int) -> Optional[List[Dict]]:
    """通过 B站 player/v2 API 获取字幕 JSON（此接口暂不需要 Wbi）"""
    api = f"https://api.bilibili.com/x/player/v2?bvid={bvid}&cid={cid}"
    try:
        raw = _http_get(api, headers={"Referer": "https://www.bilibili.com/"})
        data = json.loads(raw)
        subs = data.get("data", {}).get("subtitle", {}).get("subtitles", [])
        if not subs:
            return None
        sub_url = None
        for s in subs:
            u = s.get("subtitle_url", "")
            if s.get("lan") in ("zh-Hans", "zh-CN", "zh") and u:
                sub_url = u; break
        if not sub_url:
            sub_url = subs[0].get("subtitle_url", "")
        if not sub_url:
            return None
        if sub_url.startswith("//"):
            sub_url = "https:" + sub_url

        raw_sub = _http_get(sub_url, headers={"Referer": "https://www.bilibili.com/"})
        parsed = json.loads(raw_sub)
        body = parsed.get("body", [])
        segments = []
        for item in body:
            t_from = item.get("from", 0)
            t_to = item.get("to", t_from + 1)
            text = item.get("content", "").strip()
            if text:
                segments.append({"start": round(t_from, 2), "end": round(t_to, 2), "text": text})
        return segments if segments else None
    except Exception as e:
        logger.warning(f"B站字幕获取失败: {e}")
        return None


# ── B站音频下载 ──

def _bilibili_download_audio(bvid: str, cid: int, output_dir: str,
                              original_url: str = "") -> str:
    """下载 B站音频流（Wbi API 多 URL 回退 → Playwright 备用）"""
    audio_urls = _bilibili_get_audio_url(bvid, cid, original_url)
    if not audio_urls:
        raise RuntimeError(
            "无法获取 B站音频流地址。\n\n"
            "可能原因：\n"
            "1. B站 API 要求 Wbi 签名（已尝试自动签名）\n"
            "2. Playwright 备用方案也未成功\n"
            "3. 视频需要大会员或已失效"
        )

    out_path = os.path.join(output_dir, f"{bvid}_{cid}.m4s")
    headers = {"User-Agent": UA, "Referer": "https://www.bilibili.com/"}

    # 绕过系统代理直连
    proxy_backup = {}
    for k in ("HTTP_PROXY", "HTTPS_PROXY", "http_proxy", "https_proxy"):
        v = os.environ.pop(k, None)
        if v is not None:
            proxy_backup[k] = v

    last_error = None
    try:
        # 依次尝试所有 URL（主 URL + 备用 CDN 节点）
        for i, audio_url in enumerate(audio_urls):
            try:
                logger.info(f"下载 B站音频 [{i+1}/{len(audio_urls)}]: {audio_url[:100]}...")
                resp = requests.get(
                    audio_url, headers=headers, timeout=30, stream=True,
                    verify=False,
                    proxies={"http": None, "https": None},
                )
                resp.raise_for_status()
                with open(out_path, "wb") as f:
                    for chunk in resp.iter_content(chunk_size=8192):
                        f.write(chunk)
                size_mb = os.path.getsize(out_path) / 1024 / 1024
                logger.info(f"✅ B站音频下载成功 ({size_mb:.1f} MB) [URL #{i+1}]")
                return out_path
            except Exception as e:
                last_error = str(e)
                logger.warning(f"B站 CDN #{i+1} 失败 ({last_error[:100]}), 尝试下一个...")
                # 清理可能的不完整文件
                if os.path.exists(out_path):
                    os.remove(out_path)
                continue

        raise RuntimeError(f"所有 CDN 节点均下载失败: {last_error}")
    finally:
        for k, v in proxy_backup.items():
            os.environ[k] = v


# ═══════════════════════════════════════════════════════════════════════
# 抖音：复用现有 DouyinParser（Bogus 签名，无需登录）
# ═══════════════════════════════════════════════════════════════════════

def _is_douyin(url: str) -> bool:
    from douyin import is_douyin_url
    return is_douyin_url(url)


def _douyin_get_video_url(url: str) -> Optional[str]:
    """通过 DouyinParser 获取无水印视频直链"""
    try:
        from douyin import DouyinParser
        parser = DouyinParser(download_dir=tempfile.gettempdir())
        info = parser.parse(url)
        # info["formats"] 第一个是无水印 mp4
        formats = info.get("formats", [])
        for f in formats:
            if f.get("ext") == "mp4" and f.get("direct_url"):
                return f["direct_url"]
        # 回退：用 download 方法
        return None
    except Exception as e:
        logger.warning(f"抖音解析失败: {e}")
        return None


def _douyin_download_audio(url: str, output_dir: str) -> str:
    """
    抖音音频下载：
    1. DouyinParser 获取视频直链
    2. 下载视频（或用 ffmpeg 提取音频）
    """
    from douyin import DouyinParser, is_douyin_url

    parser = DouyinParser(download_dir=output_dir)
    try:
        result = parser.download(url)
        filename = result.get("filename", "")
        video_path = os.path.join(output_dir, filename)
        if not os.path.exists(video_path):
            raise RuntimeError(f"抖音视频下载失败，文件未生成: {video_path}")

        # 尝试用 ffmpeg 提取音频
        ffmpeg = shutil.which("ffmpeg")
        if not ffmpeg:
            try:
                import static_ffmpeg
                paths = static_ffmpeg.run.get_or_fetch_platform_executables_else_raise()
                ffmpeg = paths[0] if paths else None
            except Exception:
                pass

        if ffmpeg:
            audio_path = os.path.join(output_dir, f"{Path(filename).stem}.m4a")
            import subprocess
            subprocess.run(
                [ffmpeg, "-i", video_path, "-vn", "-acodec", "aac", "-y", audio_path],
                capture_output=True, timeout=120,
            )
            if os.path.exists(audio_path) and os.path.getsize(audio_path) > 1024:
                logger.info(f"✅ 抖音音频提取成功: {os.path.basename(audio_path)}")
                return audio_path

        # ffmpeg 不可用 → 直接返回视频文件（faster-whisper 可处理）
        logger.info(f"⚠️ ffmpeg 不可用，直接用视频文件转录")
        return video_path

    except Exception as e:
        raise RuntimeError(f"抖音音频下载失败: {e}\n{traceback.format_exc()}")


# ═══════════════════════════════════════════════════════════════════════
# 其他平台：yt-dlp 游客模式（增强 UA，无 Cookie）
# ═══════════════════════════════════════════════════════════════════════

def _ytdlp_guest_opts(url: str, extra: dict = None) -> dict:
    """yt-dlp 游客模式配置（无 Cookie，增强伪装）"""
    opts = {
        "quiet": True, "no_warnings": True, "noplaylist": True,
        "socket_timeout": 30, "extractor_retries": 3, "retries": 5,
        "nocheckcertificate": True, "legacy_server_connect": True,
        "http_headers": {
            "User-Agent": UA,
            "Accept-Language": "zh-CN,zh;q=0.9,en;q=0.8",
        },
    }
    if _is_domestic(url):
        opts["proxy"] = ""
    ffmpeg = shutil.which("ffmpeg")
    if ffmpeg:
        opts["ffmpeg_location"] = os.path.dirname(ffmpeg)
    if extra:
        opts.update(extra)
    return opts


def _ytdlp_guest_download_audio(url: str, output_dir: str) -> str:
    """yt-dlp 游客模式下载音频（其他平台回退方案）"""
    outtmpl = os.path.join(output_dir, "%(id)s.%(ext)s")
    opts = _ytdlp_guest_opts(url, extra={
        "format": "worstaudio/worst",  # 最低音质，门槛最低
        "outtmpl": outtmpl,
        "socket_timeout": 60,
        "extractor_retries": 5,
        "retries": 10,
    })
    logger.info(f"yt-dlp 游客模式下载: {url[:80]}...")
    with yt_dlp.YoutubeDL(opts) as ydl:
        info = ydl.extract_info(url, download=True)
        info = ydl.sanitize_info(info)

    vid = info.get("id", "audio")
    for ext in ("m4a", "mp3", "opus", "webm", "aac", "ogg", "wav", "mp4"):
        p = os.path.join(output_dir, f"{vid}.{ext}")
        if os.path.exists(p) and os.path.getsize(p) > 1024:
            logger.info(f"✅ yt-dlp 音频: {os.path.basename(p)}")
            return p
    raise RuntimeError(f"yt-dlp 音频未生成，目录: {os.listdir(output_dir)}")


# ═══════════════════════════════════════════════════════════════════════
# 主入口：字幕提取 → 音频下载 → Whisper 转录
# ═══════════════════════════════════════════════════════════════════════

def transcribe_video(url: str, model_name: str = "base",
                     language: Optional[str] = None,
                     initial_prompt: Optional[str] = None) -> Generator[Dict, None, None]:
    """
    视频转录主流程（SSE 生成器）
    B站/抖音 → 官方 API 直调；其他 → yt-dlp 游客模式
    initial_prompt: 上下文提示，帮助 Whisper 纠正同音字
    """

    # ── 1. 字幕提取 ──
    yield {"status": "checking", "message": "正在检查视频字幕..."}

    # B站：官方 API 字幕
    if _is_bilibili(url):
        bvid = _extract_bvid(url)
        if bvid:
            cid = _bilibili_get_cid(bvid)
            if cid:
                existing = _bilibili_get_subtitles(bvid, cid)
                if existing and len(existing) >= 3:
                    lang = _detect_language(existing)
                    yield {"status": "found_existing",
                           "message": f"已找到 B站内置字幕（{len(existing)} 条）",
                           "segments": existing, "language": lang}
                    yield {"status": "done", "segments": existing,
                           "language": lang, "text": segments_to_text(existing)}
                    return

    # 其他平台：yt-dlp 字幕提取
    if not _is_bilibili(url) and not _is_douyin(url):
        existing = _ytdlp_extract_subtitles(url)
        if existing and len(existing) >= 3:
            lang = _detect_language(existing)
            yield {"status": "found_existing",
                   "message": f"已找到内置字幕（{len(existing)} 条）",
                   "segments": existing, "language": lang}
            yield {"status": "done", "segments": existing,
                   "language": lang, "text": segments_to_text(existing)}
            return

    # ── 2. 无字幕 → 下载音频 ──
    yield {"status": "downloading_audio",
           "message": "未找到内置字幕，正在下载音频流（官方 API 直连）...", "progress": 0}

    with tempfile.TemporaryDirectory(prefix="video_audio_") as tmpdir:
        try:
            if _is_bilibili(url):
                bvid = _extract_bvid(url)
                cid = _bilibili_get_cid(bvid)
                audio_path = _bilibili_download_audio(bvid, cid, tmpdir, original_url=url)
            elif _is_douyin(url):
                audio_path = _douyin_download_audio(url, tmpdir)
            else:
                audio_path = _ytdlp_guest_download_audio(url, tmpdir)
        except Exception as e:
            err = str(e)
            logger.error(f"音频下载失败:\n{err}")
            yield {"status": "error",
                   "message": f"❌ 音频下载失败\n\n{err}"}
            return

        size_mb = os.path.getsize(audio_path) / 1024 / 1024
        yield {"status": "downloading_audio",
               "message": f"音频就绪（{size_mb:.1f} MB），开始语音识别...", "progress": 100}

        # ── 3. Whisper 转录 ──
        yield {"status": "transcribing",
               "message": "正在语音识别（faster-whisper），请耐心等待...", "progress": 0}
        try:
            segments = _whisper_transcribe(audio_path, model_name, language,
                                              initial_prompt=initial_prompt)
        except ImportError as e:
            yield {"status": "error", "message": str(e)}
            return
        except Exception as e:
            yield {"status": "error",
                   "message": f"语音识别失败: {e}\n{traceback.format_exc()}"}
            return

        if not segments:
            yield {"status": "error", "message": "未识别到任何语音内容"}
            return

        lang = _detect_language(segments)
        yield {"status": "transcribing",
               "message": f"识别完成，共 {len(segments)} 条字幕", "progress": 100}
        yield {"status": "done", "segments": segments,
               "language": lang, "text": segments_to_text(segments)}


# ═══════════════════════════════════════════════════════════════════════
# 辅助函数
# ═══════════════════════════════════════════════════════════════════════

def _ytdlp_extract_subtitles(url: str) -> Optional[List[Dict]]:
    """
    yt-dlp 游客模式极速提取字幕（仅拉取元数据，不下载视频）。
    目标：< 1s 内获取官方字幕 JSON/SRT。
    """
    import time as _t
    t0 = _t.time()

    opts = _ytdlp_guest_opts(url, extra={
        "writesubtitles": True,
        "writeautomaticsub": True,
        "subtitleslangs": ["zh-Hans", "zh", "zh-CN", "zh-TW", "en", "ja", "ko"],
        "skip_download": True,          # 不下载视频
        "no_check_formats": True,       # 跳过格式校验，加速
        "extract_flat": False,          # 需要完整信息才能获取字幕
        "socket_timeout": 15,           # 短超时快速失败
    })
    try:
        with yt_dlp.YoutubeDL(opts) as ydl:
            info = ydl.sanitize_info(ydl.extract_info(url, download=False))
    except Exception as e:
        logger.warning(f"yt-dlp 字幕提取失败 (耗时 {_t.time()-t0:.1f}s): {e}")
        return None

    logger.info(f"yt-dlp 字幕元数据获取成功 (耗时 {_t.time()-t0:.1f}s)")
    subtitles = info.get("subtitles", {}) or {}
    auto_subs = info.get("automatic_captions", {}) or {}

    for lang in ["zh-Hans", "zh", "zh-CN", "zh-TW", "en"]:
        for src in (subtitles, auto_subs):
            if lang in src and src[lang]:
                sub_url = src[lang][0].get("url")
                if sub_url:
                    segs = _fetch_and_parse_subtitle(sub_url)
                    logger.info(f"✅ 提取到官方字幕: {lang} ({len(segs or [])} 条, 总耗时 {_t.time()-t0:.1f}s)")
                    return segs

    logger.info(f"未找到官方字幕 (耗时 {_t.time()-t0:.1f}s)")
    return None


def _fetch_and_parse_subtitle(sub_url: str) -> Optional[List[Dict]]:
    try:
        raw = _http_get(sub_url).decode("utf-8-sig", errors="ignore")
    except Exception:
        return None
    if raw.strip().startswith("{"):
        try:
            data = json.loads(raw)
            events = data.get("events") or data.get("body") or []
            segments = []
            for ev in events:
                ts = ev.get("tStartMs") or ev.get("from", 0)
                dur = ev.get("dDurationMs") or ev.get("duration", 0)
                te = ts + dur
                segs = ev.get("segs", [])
                text = "".join(s.get("utf8", "") for s in segs) if segs else (
                    ev.get("content", "") or ev.get("text", ""))
                if isinstance(ts, (int, float)) and text.strip():
                    segments.append({
                        "start": round(ts / 1000, 2),
                        "end": round(te / 1000, 2),
                        "text": text.strip(),
                    })
            if segments:
                return segments
        except Exception:
            pass
    if " --> " in raw:
        if "WEBVTT" in raw[:100].upper():
            return _parse_vtt(raw)
        return _parse_srt(raw)
    return None


def _parse_vtt(raw: str) -> List[Dict]:
    segments = []
    p = re.compile(r"(\d{2}:\d{2}:\d{2}\.\d{3})\s*-->\s*(\d{2}:\d{2}:\d{2}\.\d{3})")
    lines = raw.split("\n")
    i = 0
    while i < len(lines):
        m = p.search(lines[i])
        if m:
            start, end = _ts2sec(m.group(1)), _ts2sec(m.group(2))
            i += 1
            txt = []
            while i < len(lines) and lines[i].strip() and not p.search(lines[i]):
                txt.append(lines[i].strip()); i += 1
            text = re.sub(r"<[^>]+>", "", " ".join(txt)).strip()
            if text:
                segments.append({"start": round(start, 2), "end": round(end, 2), "text": text})
        else:
            i += 1
    return segments


def _parse_srt(raw: str) -> List[Dict]:
    segments = []
    p = re.compile(r"(\d{2}:\d{2}:\d{2}[,\.]\d{3})\s*-->\s*(\d{2}:\d{2}:\d{2}[,\.]\d{3})")
    for block in re.split(r"\n\s*\n", raw.strip()):
        m = p.search(block)
        if not m:
            continue
        start = _ts2sec(m.group(1).replace(",", "."))
        end = _ts2sec(m.group(2).replace(",", "."))
        txt = [l.strip() for l in block.split("\n")[1:] if l.strip() and not p.search(l)]
        text = re.sub(r"<[^>]+>", "", " ".join(txt)).strip()
        if text:
            segments.append({"start": round(start, 2), "end": round(end, 2), "text": text})
    return segments


def _ts2sec(ts: str) -> float:
    parts = ts.replace(",", ".").split(":")
    return float(parts[0]) * 3600 + float(parts[1]) * 60 + float(parts[2])


# ═══════════════════════════════════════════════════════════════════════
# Whisper 转录
# ═══════════════════════════════════════════════════════════════════════

_whisper_cache = None

def _get_whisper_model(model_name: str = "base"):
    global _whisper_cache
    if _whisper_cache is not None:
        return _whisper_cache
    from faster_whisper import WhisperModel
    device = "cuda" if _check_cuda() else "cpu"
    ct = "float16" if device == "cuda" else "int8"
    logger.info(f"加载 Whisper: {model_name} ({device}/{ct})")
    _whisper_cache = WhisperModel(model_name, device=device, compute_type=ct)
    return _whisper_cache

def _check_cuda() -> bool:
    try:
        import torch
        return torch.cuda.is_available()
    except Exception:
        return False

def _whisper_transcribe(audio_path: str, model_name: str = "base",
                         language: Optional[str] = None,
                         initial_prompt: Optional[str] = None) -> List[Dict]:
    """
    faster-whisper 转录。
    initial_prompt: 上下文提示词，帮助模型纠正同音字。
      例如: "AI、编程、流量、模型、算法、深度学习"
    """
    model = _get_whisper_model(model_name)
    kwargs = dict(
        language=language, beam_size=5,
        vad_filter=True,
        vad_parameters=dict(min_silence_duration_ms=500),
    )
    if initial_prompt:
        kwargs["initial_prompt"] = initial_prompt
        logger.info(f"Whisper 上下文提示: {initial_prompt[:80]}...")

    seg_iter, info = model.transcribe(audio_path, **kwargs)
    logger.info(f"检测语言: {info.language} (p={info.language_probability:.2f})")
    return [{"start": round(s.start, 2), "end": round(s.end, 2),
             "text": s.text.strip()} for s in seg_iter]


def _detect_language(segments: List[Dict]) -> str:
    text = " ".join(s["text"] for s in segments[:20])
    return "zh" if len(re.findall(r"[\u4e00-\u9fff]", text)) > len(text) * 0.1 else "en"
