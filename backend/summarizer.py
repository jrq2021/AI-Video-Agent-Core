"""
AI 视频总结模块
- 通过 yt-dlp 提取字幕（优先人工字幕，其次自动字幕）
- 无字幕时自动下载音频，使用 Whisper 语音转文字
- 调用 DeepSeek API 生成视频摘要和核心要点
- 支持 SSE 流式输出
"""
import os
import logging
import tempfile
from pathlib import Path
from typing import Generator, Optional

import yt_dlp
from openai import OpenAI
from dotenv import load_dotenv

# 加载 .env 文件（位于 backend 目录下）
load_dotenv(Path(__file__).parent / ".env")

logger = logging.getLogger("summarizer")

# DeepSeek API 配置（兼容 OpenAI SDK）
DEEPSEEK_API_KEY = os.environ.get("DEEPSEEK_API_KEY", "")
DEEPSEEK_BASE_URL = "https://api.deepseek.com"

# Whisper 模型（tiny/base/small/medium/large），base 对中文支持较好且速度适中
WHISPER_MODEL = os.environ.get("WHISPER_MODEL", "base")

SUMMARY_PROMPT = """你是一个专业的视频内容总结助手。请结合以下视频基本信息和字幕内容，生成一份全面、有洞察力的总结。

## 视频基本信息
- 标题：{title}
- UP主/作者：{uploader}
- 简介：{description}

## 要求
1. **视频摘要**：结合标题和简介，用 2-3 句话概括视频的核心内容和主题。
2. **核心要点**：列出 5-8 个关键知识点或亮点，每个要点用一句话说清楚。

请按以下格式输出（不要用 markdown 代码块）：

📌 视频摘要
（2-3句话的摘要）

🔑 核心要点
1. 要点一
2. 要点二
3. 要点三
...

## 字幕内容
{subtitle_text}"""


def _patch_ssl():
    """全局修补 SSL"""
    import ssl
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


def extract_bilibili_subtitles(url: str, max_chars: int = 8000) -> Optional[str]:
    """
    通过 B站官方 API 直接获取字幕（绕过 yt-dlp）
    B站字幕格式为 JSON，body 数组中每项有 content 字段
    """
    import re
    import json
    import urllib.request

    # 从 URL 提取 BV 号
    match = re.search(r"(BV[\w]+)", url)
    if not match:
        return None
    bvid = match.group(1)

    headers = {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
        "Referer": "https://www.bilibili.com/",
    }

    try:
        # 1. 获取 cid
        view_url = f"https://api.bilibili.com/x/web-interface/view?bvid={bvid}"
        req = urllib.request.Request(view_url, headers=headers)
        with urllib.request.urlopen(req, timeout=15) as resp:
            data = json.loads(resp.read().decode("utf-8"))
        vid_data = data.get("data", {})
        cid = vid_data.get("cid")
        pages = vid_data.get("pages", [])
        if not cid and pages:
            cid = pages[0].get("cid")
        if not cid:
            return None

        # 2. 获取字幕列表
        player_url = f"https://api.bilibili.com/x/player/v2?bvid={bvid}&cid={cid}"
        req2 = urllib.request.Request(player_url, headers=headers)
        with urllib.request.urlopen(req2, timeout=15) as resp:
            pdata = json.loads(resp.read().decode("utf-8"))

        subs = pdata.get("data", {}).get("subtitle", {}).get("subtitles", [])
        if not subs:
            return None

        # 优先选中文，其次第一个
        subtitle_url = None
        for s in subs:
            u = s.get("subtitle_url", "")
            if s.get("lan") in ("zh-Hans", "zh-CN", "zh") and u:
                subtitle_url = u
                break
        if not subtitle_url:
            subtitle_url = subs[0].get("subtitle_url", "")

        if not subtitle_url:
            return None
        if subtitle_url.startswith("//"):
            subtitle_url = "https:" + subtitle_url

        # 3. 下载并解析字幕
        req3 = urllib.request.Request(subtitle_url, headers=headers)
        with urllib.request.urlopen(req3, timeout=15) as resp:
            raw = resp.read().decode("utf-8-sig", errors="ignore")

        parsed = json.loads(raw)
        body = parsed.get("body", [])
        lines = []
        for item in body:
            content = item.get("content", "").strip()
            if content:
                lines.append(content)

        text = " ".join(lines)
        if len(text) > max_chars:
            text = text[:max_chars]
        return text if len(text.strip()) > 20 else None

    except Exception as e:
        logger.warning(f"B站 API 获取字幕失败: {e}")
        return None


def is_bilibili_url(url: str) -> bool:
    """判断是否为 B站链接"""
    return "bilibili.com" in url or "b23.tv" in url


def _extract_bilibili_meta(url: str) -> dict:
    """通过 B站 API 获取视频元数据（标题、UP主、简介）"""
    import re, json, urllib.request
    match = re.search(r"(BV[\w]+)", url)
    if not match:
        return {}
    bvid = match.group(1)
    headers = {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
        "Referer": "https://www.bilibili.com/",
    }
    try:
        view_url = f"https://api.bilibili.com/x/web-interface/view?bvid={bvid}"
        req = urllib.request.Request(view_url, headers=headers)
        with urllib.request.urlopen(req, timeout=15) as resp:
            data = json.loads(resp.read().decode("utf-8"))
        d = data.get("data", {})
        return {
            "title": d.get("title", ""),
            "uploader": d.get("owner", {}).get("name", ""),
            "description": (d.get("desc", "") or "")[:500],
        }
    except Exception as e:
        logger.warning(f"B站元数据获取失败: {e}")
        return {}


def extract_video_data(url: str, max_chars: int = 8000) -> dict:
    """
    一站式提取视频元数据 + 字幕。
    B站：API 获取元数据 + 字幕
    其他平台：yt-dlp 获取元数据 + 字幕
    返回 {"title", "uploader", "description", "subtitle_text"}
    """
    # B站专用路径
    if is_bilibili_url(url):
        meta = _extract_bilibili_meta(url)
        sub = extract_bilibili_subtitles(url, max_chars)
        meta["subtitle_text"] = sub or ""
        return meta

    # 其他平台：yt-dlp 同时获取元数据和字幕
    opts = {
        "quiet": True,
        "no_warnings": True,
        "noplaylist": True,
        "writesubtitles": True,
        "writeautomaticsub": True,
        "subtitleslangs": ["zh-Hans", "zh", "zh-CN", "zh-TW", "en", "ja", "ko"],
        "skip_download": True,
        "socket_timeout": 30,
        "nocheckcertificate": True,
        "legacy_server_connect": True,
    }

    try:
        with yt_dlp.YoutubeDL(opts) as ydl:
            info = ydl.extract_info(url, download=False)
            info = ydl.sanitize_info(info)
    except Exception as e:
        logger.warning(f"yt-dlp 提取失败: {e}")
        return {"title": "", "uploader": "", "description": "", "subtitle_text": ""}

    # 元数据
    meta = {
        "title": info.get("title", "") or "",
        "uploader": info.get("uploader", "") or "",
        "description": (info.get("description", "") or "")[:500],
    }

    # 字幕提取（人工优先）
    subtitles = info.get("subtitles", {}) or {}
    auto_subtitles = info.get("automatic_captions", {}) or {}
    preferred_langs = ["zh-Hans", "zh", "zh-CN", "zh-TW", "en", "ja", "ko"]
    subtitle_text = None

    for lang in preferred_langs:
        if lang in subtitles and subtitles[lang]:
            subtitle_text = _fetch_and_parse_subtitle(subtitles[lang])
            if subtitle_text:
                break
        if lang in auto_subtitles and auto_subtitles[lang]:
            subtitle_text = _fetch_and_parse_subtitle(auto_subtitles[lang])
            if subtitle_text:
                break

    if not subtitle_text:
        for lang, subs in {**subtitles, **auto_subtitles}.items():
            if subs:
                subtitle_text = _fetch_and_parse_subtitle(subs)
                if subtitle_text:
                    break

    if subtitle_text and len(subtitle_text) > max_chars:
        subtitle_text = subtitle_text[:max_chars]

    meta["subtitle_text"] = subtitle_text or ""
    return meta


def extract_subtitles(url: str, max_chars: int = 8000) -> Optional[str]:
    """
    从视频中提取字幕文本
    B站：直接调 B站 API
    其他平台：通过 yt-dlp 提取
    """
    # B站专用
    if is_bilibili_url(url):
        text = extract_bilibili_subtitles(url, max_chars)
        if text:
            logger.info(f"B站 API 字幕提取成功: {len(text)} 字符")
            return text

    # 其他平台：yt-dlp
    opts = {
        "quiet": True,
        "no_warnings": True,
        "noplaylist": True,
        "writesubtitles": True,
        "writeautomaticsub": True,
        "subtitleslangs": ["zh-Hans", "zh", "zh-CN", "zh-TW", "en", "ja", "ko"],
        "skip_download": True,
        "socket_timeout": 30,
        "nocheckcertificate": True,
        "legacy_server_connect": True,
        "proxy": "",
    }

    try:
        with yt_dlp.YoutubeDL(opts) as ydl:
            info = ydl.extract_info(url, download=False)
            info = ydl.sanitize_info(info)
    except Exception as e:
        logger.warning(f"提取视频信息失败: {e}")
        return None

    if not info:
        return None

    # 获取字幕（人工优先）
    subtitles = info.get("subtitles", {}) or {}
    auto_subtitles = info.get("automatic_captions", {}) or {}

    # 优先中文
    preferred_langs = ["zh-Hans", "zh", "zh-CN", "zh-TW", "en", "ja", "ko"]

    subtitle_text = None

    for lang in preferred_langs:
        # 先查人工字幕
        if lang in subtitles and subtitles[lang]:
            subtitle_text = _fetch_and_parse_subtitle(subtitles[lang])
            if subtitle_text:
                logger.info(f"使用人工字幕: {lang}")
                break

        # 再查自动字幕
        if lang in auto_subtitles and auto_subtitles[lang]:
            subtitle_text = _fetch_and_parse_subtitle(auto_subtitles[lang])
            if subtitle_text:
                logger.info(f"使用自动字幕: {lang}")
                break

    if not subtitle_text:
        # 任意语言兜底
        for lang, subs in {**subtitles, **auto_subtitles}.items():
            if subs:
                subtitle_text = _fetch_and_parse_subtitle(subs)
                if subtitle_text:
                    logger.info(f"使用兜底字幕: {lang}")
                    break

    if subtitle_text and len(subtitle_text) > max_chars:
        subtitle_text = subtitle_text[:max_chars]

    return subtitle_text


def _fetch_and_parse_subtitle(sub_list: list) -> Optional[str]:
    """下载并解析字幕 JSON，返回纯文本"""
    import json
    import urllib.request

    for sub in sub_list:
        sub_url = sub.get("url", "")
        if not sub_url:
            continue

        try:
            req = urllib.request.Request(sub_url, headers={
                "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
            })
            with urllib.request.urlopen(req, timeout=15) as resp:
                raw = resp.read().decode("utf-8-sig", errors="ignore")

            # 尝试多种解析方式
            text = _parse_subtitle_content(raw)
            if text and len(text.strip()) > 20:
                return text
        except Exception:
            continue

    return None


def _parse_subtitle_content(raw: str) -> Optional[str]:
    """解析字幕内容，支持 srt/vtt/json 格式"""
    import json
    import re

    # 1. JSON 格式（常见于 B站、YouTube 自动字幕）
    try:
        data = json.loads(raw)
        lines = []
        if isinstance(data, list):
            for item in data:
                if isinstance(item, dict):
                    segs = item.get("segs") or item.get("body") or []
                    if isinstance(segs, list):
                        for seg in segs:
                            if isinstance(seg, dict):
                                text = seg.get("utf8", "") or seg.get("content", "")
                                if text:
                                    lines.append(text.strip())
                    content = item.get("content", "") or item.get("text", "")
                    if content and not lines:
                        lines.append(content.strip())
        elif isinstance(data, dict):
            body = data.get("body", [])
            if isinstance(body, list):
                for item in body:
                    if isinstance(item, dict):
                        content = item.get("content", "") or item.get("text", "")
                        if content:
                            lines.append(content.strip())
        if lines:
            return " ".join(lines)
    except (json.JSONDecodeError, TypeError):
        pass

    # 2. SRT 格式
    srt_match = re.search(r"\d+\n\d{2}:\d{2}:\d{2}[.,]\d{3} -->", raw)
    if srt_match:
        blocks = re.split(r"\n\d+\n", raw)
        lines = []
        for block in blocks:
            cleaned = re.sub(r"\d{2}:\d{2}:\d{2}[.,]\d{3} --> \d{2}:\d{2}:\d{2}[.,]\d{3}.*", "", block)
            text = re.sub(r"<[^>]+>", "", cleaned).strip()
            if text and not text.isdigit():
                lines.append(text)
        if lines:
            return " ".join(lines)

    # 3. VTT 格式
    vtt_match = re.match(r"^(WEBVTT|NOTE)", raw.strip())
    if vtt_match or " --> " in raw:
        lines = []
        raws = raw.split("\n")
        for r in raws:
            r = r.strip()
            if not r or " --> " in r or r.startswith("WEBVTT") or r.startswith("NOTE") or r.startswith("Kind:") or r.startswith("Language:"):
                continue
            r = re.sub(r"<[^>]+>", "", r)
            if r and not r.isdigit():
                lines.append(r)
        if lines:
            return " ".join(lines)

    return None


def summarize_with_deepseek(prompt: str, api_key: Optional[str] = None) -> Generator[str, None, None]:
    """
    调用 DeepSeek API 进行流式总结。
    prompt 应为已组装好的完整提示词。
    """
    key = api_key or DEEPSEEK_API_KEY
    if not key:
        yield "错误：未配置 DEEPSEEK_API_KEY 环境变量，请在终端中设置：`$env:DEEPSEEK_API_KEY='your-key'`"
        return

    try:
        client = OpenAI(api_key=key, base_url=DEEPSEEK_BASE_URL)
        stream = client.chat.completions.create(
            model="deepseek-chat",
            messages=[
                {"role": "system", "content": "你是一个专业的视频内容总结助手，输出简洁清晰。"},
                {"role": "user", "content": prompt},
            ],
            temperature=0.7,
            max_tokens=2000,
            stream=True,
        )

        for chunk in stream:
            if chunk.choices and chunk.choices[0].delta.content:
                yield chunk.choices[0].delta.content

    except Exception as e:
        logger.error(f"DeepSeek API 调用失败: {e}")
        yield f"\n\n总结生成失败：{str(e)}"


TEXT_SUMMARY_PROMPT = """你是一个专业的视频内容总结助手。请根据以下字幕内容，生成一份全面、有洞察力的总结。

{subtitle_text}

## 要求
1. **视频摘要**：用 2-3 句话概括核心内容和主题。
2. **核心要点**：列出 5-8 个关键知识点或亮点，每个要点用一句话说清楚。

请按以下格式输出（不要用 markdown 代码块）：

📌 视频摘要
（2-3句话的摘要）

🔑 核心要点
1. 要点一
2. 要点二
3. 要点三
...
"""


def summarize_text(
    subtitle_text: str,
    title: str = "",
    uploader: str = "",
    description: str = "",
    api_key: Optional[str] = None,
) -> Generator[str, None, None]:
    """
    纯文本总结 — 不涉及任何 URL 解析、下载或 Whisper。
    直接根据传入的字幕文本调用 LLM 生成总结，SSE 流式输出。

    前端应先通过 /api/transcribe 获取字幕，再将字幕文本传入此函数。
    """
    # 组装提示词（优先使用提供的元数据）
    header = ""
    if title:
        header += f"- 标题：{title}\n"
    if uploader:
        header += f"- UP主/作者：{uploader}\n"
    if description:
        header += f"- 简介：{description}\n"

    if header:
        prompt = TEXT_SUMMARY_PROMPT.format(
            subtitle_text=f"## 视频基本信息\n{header}\n## 字幕内容\n{subtitle_text}"
        )
    else:
        prompt = TEXT_SUMMARY_PROMPT.format(subtitle_text=subtitle_text)

    for chunk in summarize_with_deepseek(prompt, api_key):
        yield chunk


def download_audio(url: str) -> Optional[str]:
    """
    下载视频的音频轨到临时文件
    返回临时文件路径，失败返回 None
    仅下载前 15 分钟（900秒），避免音频文件过大
    """
    try:
        tmp_dir = Path(tempfile.gettempdir()) / "video_summarizer"
        tmp_dir.mkdir(exist_ok=True)
        out_template = str(tmp_dir / "%(id)s.%(ext)s")

        opts = {
            "quiet": True,
            "no_warnings": True,
            "noplaylist": True,
            "format": "bestaudio/best",
            "outtmpl": out_template,
            "postprocessors": [{
                "key": "FFmpegExtractAudio",
                "preferredcodec": "mp3",
                "preferredquality": "64",
            }],
            "download_sections": ["*0:00-15:00"],  # 只下载前15分钟
            "socket_timeout": 30,
            "nocheckcertificate": True,
            "legacy_server_connect": True,
            "proxy": "",
            # 指定 ffmpeg 路径
            "ffmpeg_location": _find_ffmpeg(),
        }

        with yt_dlp.YoutubeDL(opts) as ydl:
            info = ydl.extract_info(url, download=True)
            info = ydl.sanitize_info(info)

        # 查找下载的音频文件
        video_id = info.get("id", "")
        for f in tmp_dir.glob(f"*{video_id}*"):
            if f.suffix in (".mp3", ".m4a", ".opus", ".aac", ".wav", ".webm"):
                return str(f)

        # 兜底：找最近修改的文件
        files = sorted(tmp_dir.glob("*"), key=lambda x: x.stat().st_mtime, reverse=True)
        for f in files:
            if f.suffix in (".mp3", ".m4a", ".opus", ".aac", ".wav", ".webm"):
                return str(f)

    except Exception as e:
        logger.warning(f"下载音频失败: {e}")

    return None


def _find_ffmpeg() -> str:
    """查找 ffmpeg 路径"""
    import shutil
    path = shutil.which("ffmpeg")
    if path:
        return os.path.dirname(path)

    # 尝试 static_ffmpeg
    try:
        import static_ffmpeg
        paths = static_ffmpeg.run.get_or_fetch_platform_executables_else_raise()
        if paths:
            return os.path.dirname(paths[0])
    except Exception:
        pass

    return ""


def transcribe_audio(audio_path: str, max_chars: int = 8000) -> Optional[str]:
    """
    使用 Whisper 将音频转为文字
    优先使用 faster-whisper（更快），回退到 openai-whisper
    """
    model_name = WHISPER_MODEL

    # 尝试 faster-whisper（比 openai-whisper 快 4 倍）
    try:
        import faster_whisper

        logger.info(f"使用 faster-whisper 模型: {model_name}")
        # CPU 上使用 int8 量化加速
        model = faster_whisper.WhisperModel(
            model_name, device="cpu", compute_type="int8"
        )
        segments, _ = model.transcribe(audio_path, language="zh", beam_size=5)

        text_parts = []
        total_chars = 0
        for seg in segments:
            text = seg.text.strip()
            if text:
                text_parts.append(text)
                total_chars += len(text)
                if total_chars >= max_chars:
                    break

        result = " ".join(text_parts)
        if result and len(result.strip()) > 20:
            logger.info(f"faster-whisper 转录完成: {len(result)} 字符")
            return result

    except ImportError:
        logger.info("faster-whisper 未安装，尝试 openai-whisper")
    except Exception as e:
        logger.warning(f"faster-whisper 转录失败: {e}")

    # 回退到 openai-whisper
    try:
        import whisper

        logger.info(f"使用 openai-whisper 模型: {model_name}")
        model = whisper.load_model(model_name)
        result = model.transcribe(audio_path, language="zh", fp16=False)

        text = result.get("text", "").strip()
        if text and len(text) > 20:
            if len(text) > max_chars:
                text = text[:max_chars]
            logger.info(f"openai-whisper 转录完成: {len(text)} 字符")
            return text

    except ImportError:
        logger.warning("openai-whisper 也未安装")
    except Exception as e:
        logger.warning(f"openai-whisper 转录失败: {e}")

    return None


def parse_video(url: str) -> dict:
    """
    纯解析：提取视频元数据 + 字幕（含 ASR 兜底）。
    不调用任何大模型，只返回结构化数据。

    返回 {"title": str, "subtitles": str}
    """
    data = extract_video_data(url)
    subtitle_text = data.get("subtitle_text", "")

    if not subtitle_text or len(subtitle_text.strip()) < 20:
        # 无字幕 → 下载音频走 Whisper ASR
        audio_path = download_audio(url)
        if audio_path:
            subtitle_text = transcribe_audio(audio_path) or ""
            try:
                os.remove(audio_path)
            except Exception:
                pass

    return {
        "title": data.get("title", ""),
        "subtitles": subtitle_text or "",
    }


def summarize_video(url: str, api_key: Optional[str] = None) -> Generator[dict, None, None]:
    """
    一站式：提取元数据+字幕 → (无字幕则ASR) → 组装提示词 → AI 总结 → SSE 流式输出
    """
    # 阶段1：提取元数据与字幕
    yield {"status": "extracting", "message": "正在提取视频信息和字幕..."}
    data = extract_video_data(url)
    subtitle_text = data.get("subtitle_text", "")

    if not subtitle_text or len(subtitle_text.strip()) < 20:
        # 阶段2：走 ASR 后备方案
        yield {
            "status": "asr_downloading",
            "message": "未找到字幕，正在下载音频以进行语音识别（约需下载前15分钟）..."
        }

        audio_path = download_audio(url)
        if not audio_path:
            yield {
                "status": "error",
                "message": "未找到可用的视频字幕，且音频下载失败。请尝试其他视频。"
            }
            return

        yield {
            "status": "asr_transcribing",
            "message": f"音频下载完成，正在语音转文字（Whisper {WHISPER_MODEL} 模型，请耐心等待）..."
        }

        subtitle_text = transcribe_audio(audio_path) or ""

        try:
            os.remove(audio_path)
        except Exception:
            pass

        if not subtitle_text or len(subtitle_text.strip()) < 20:
            subtitle_text = "（注：当前视频无可用字幕或识别不到语音，请仅根据上述提供的标题和简介，推测并总结视频可能的核心内容。）"
            yield {
                "status": "extracted",
                "message": "未提取到有效语音，将直接根据视频标题和简介进行智能总结...",
                "subtitles": ""  # 🔴 新增：确保前端状态被清空或更新
            }
        else:
            yield {
                "status": "extracted",
                "message": f"语音识别完成（{len(subtitle_text)} 字符），正在生成 AI 总结...",
                "subtitles": subtitle_text  # 🔴 新增：将 Whisper 识别的字幕传给前端
            }
    else:
        yield {
            "status": "extracted",
            "message": f"字幕提取完成（{len(subtitle_text)} 字符），正在生成 AI 总结...",
            "subtitles": subtitle_text  # 🔴 新增：将官方提取的字幕传给前端
        }

    # 阶段3：组装元数据 + 字幕 → 完整 Prompt
    yield {"status": "summarizing", "message": "AI 正在分析视频内容..."}

    prompt = SUMMARY_PROMPT.format(
        title=data.get("title", "未知标题"),
        uploader=data.get("uploader", "未知作者"),
        description=data.get("description", "暂无简介"),
        subtitle_text=subtitle_text,
    )

    for text_chunk in summarize_with_deepseek(prompt, api_key):
        yield {"status": "streaming", "content": text_chunk}

    yield {"status": "done", "message": "总结完成"}


# ═══════════════════════════════════════════════════════════════════
# 思维导图生成
# ═══════════════════════════════════════════════════════════════════

MINDMAP_PROMPT = """你是一个专业的知识结构提取助手。请根据以下视频字幕/总结内容，提炼出该视频的逻辑结构，并以 Markdown 多级列表格式输出。

{context}

## 严格输出规则（必须逐条遵守）
1. 第一行必须是 `# <视频核心主题>`（用 5-15 字概括）。
2. 用 `##` 表示一级分类（3-6 个），`-` 表示具体要点。
3. 子要点用 4 个空格缩进的 `-`，形成 `##` → `-` → `    -` 三级结构。
4. **绝对禁止**输出任何解释、前言、客套话、代码块标记（\`\`\`）、HTML 标签。
5. **绝对禁止**输出"以下是..."、"根据内容..."等引导语。直接从 `#` 开始。
6. 每个要点 ≤ 25 字，一行一句。
7. 如果内容不足以提炼，至少输出 1 个 `#` 标题 + 2 个 `##` 分类。

## 输出示例（严格遵守此格式）
# 机器学习的核心概念
## 监督学习
- 线性回归
    - 最小二乘法
    - 梯度下降优化
- 决策树
    - 信息增益
    - 剪枝策略
## 无监督学习
- K-Means 聚类
- PCA 降维
## 深度学习
- 神经网络基础
    - 激活函数
    - 反向传播
- CNN 卷积网络
- Transformer 架构
## 模型评估
- 交叉验证
- 过拟合与欠拟合
"""


def generate_mindmap(
    subtitle_text: str,
    title: str = "",
    api_key: Optional[str] = None,
) -> str:
    """
    根据字幕/总结文本，调用 DeepSeek 生成 Markdown 思维导图。
    返回纯 Markdown 多级列表字符串。
    """
    # 组装上下文
    context_parts = []
    if title:
        context_parts.append(f"视频标题：{title}")
    context_parts.append(f"视频内容：\n{subtitle_text}")
    context = "\n\n".join(context_parts)

    prompt = MINDMAP_PROMPT.format(context=context)

    key = api_key or DEEPSEEK_API_KEY
    if not key:
        return (
            "# 配置错误\n"
            "## 原因\n"
            "- 未设置 DEEPSEEK_API_KEY 环境变量\n"
            "## 解决方法\n"
            "- 在终端中设置 `$env:DEEPSEEK_API_KEY='your-key'`"
        )

    try:
        client = OpenAI(api_key=key, base_url=DEEPSEEK_BASE_URL)
        response = client.chat.completions.create(
            model="deepseek-chat",
            messages=[
                {
                    "role": "system",
                    "content": "你是一个知识结构提取器。你只输出 Markdown 多级列表（# ## -），绝不输出任何解释、代码块标记或引导语。",
                },
                {"role": "user", "content": prompt},
            ],
            temperature=0.3,
            max_tokens=2000,
        )

        result = response.choices[0].message.content or ""

        # 清理可能的代码块标记
        result = result.strip()
        if result.startswith("```"):
            lines = result.split("\n")
            if lines[0].startswith("```"):
                lines = lines[1:]
            if lines and lines[-1].strip().startswith("```"):
                lines = lines[:-1]
            result = "\n".join(lines).strip()

        # 如果 LLM 仍然输出了引导语，尝试裁剪到第一个 # 开始
        if not result.startswith("#"):
            import re
            match = re.search(r"^#", result, re.MULTILINE)
            if match:
                result = result[match.start():]

        return result or "# 生成结果为空\n## 请重试\n- 视频内容可能不足以提炼结构"

    except Exception as e:
        logger.error(f"思维导图生成失败: {e}")
        return f"# 生成失败\n## 错误信息\n- {str(e)}"