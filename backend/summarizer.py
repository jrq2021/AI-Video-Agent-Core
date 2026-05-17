"""
AI 视频总结模块
- 通过 yt-dlp 提取字幕（优先人工字幕，其次自动字幕）
- 无字幕时自动下载音频，使用 Whisper 语音转文字
- 调用 DeepSeek API 生成视频摘要和核心要点
- 支持 SSE 流式输出
"""
import os
import re
import json
import logging
import tempfile
import urllib.request
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

SUMMARY_PROMPT = """# 字幕内容
{subtitle_text}

# Role
你是一位资深的知识萃取专家。你擅长从繁杂的视频文案中，精准剥离出最核心的骨架，并能提炼出具有启发性的深度洞察。

# Task
仔细阅读 <Input_Text> 中的视频字幕/文本，生成一份全面、深刻且极具视觉层次感的内容总结。

# Rules
1. 拒绝表面概括：不要只罗列“视频说了什么”，必须深挖“背后的逻辑、原因和本质”。
2. 视觉化排版：充分利用 Emoji 图标作为视觉锚点，构建清晰的信息层级，提升前端渲染后的阅读体验。
3. 结构严谨：严格按照 <Output_Format> 的结构和图标输出，直接切入正题，禁止任何寒暄、废话或过渡句。
4. 防呆指令：必须提炼 <Input_Text> 的实际内容，绝不允许照抄或输出模板中的占位符说明。

# Output_Format
🎯 **核心精髓**
[用 1-2 句话，一针见血地指出视频的终极核心论点或最大价值]

🗺️ **全局知识拆解**
[将视频内容按逻辑拆解为 3-5 个核心模块，提取干货]
* 🔹 **[提炼模块一主题]**：[核心结论/观点，不超过30字]
  * ▫️ [支撑该论点的关键细节/数据/案例 1]
  * ▫️ [支撑该论点的关键细节/数据/案例 2]
* 🔹 **[提炼模块二主题]**：[核心结论/观点，不超过30字]
  * ▫️ [支撑该论点的关键细节/数据/案例 1]
  * ▫️ [支撑该论点的关键细节/数据/案例 2]
*(根据视频实际内容长度自然增减模块，保持结构对齐)*

💡 **深度洞察 (Aha Moment)**
* 👁️‍🗨️ [提炼视频中 1-2 个最反直觉、最具认知冲击力、或最能引发思考的深层观点，解释其为什么重要]

🚀 **行动指南**
* ✅ [基于视频内容，给出 1-3 个用户看完后可以立刻落地执行的具体建议，拒绝假大空]"""

# 无字幕时的简化 Prompt
NO_SUB_SUMMARY_PROMPT = """# 视频基本信息
- 标题：{title}
- UP主/作者：{uploader}
- 简介：{description}

# 任务
你是视频内容分析师。请根据以上标题和简介，详细推断并描述视频可能涉及的核心内容与价值。

# 规则
1. 禁止使用"本视频介绍了""总而言之"等废话，直接输出内容。
2. 尽可能详细地展开，覆盖潜在话题、观点方向、受众价值。
3. 每个要点给出具体推断，而不是笼统概括。

# 输出格式（严格遵守 Markdown）
- 总览用一段或多段普通文字，不用标题。
- 各板块用 `## 板块名` 分隔（如 ## 内容方向、## 目标受众、## 核心价值）。
- 板块下的每条要点用 `- **关键词**：具体说明` 格式，关键词加粗后跟冒号和详细描述。
- 板块之间用 `---` 分隔线隔开。"""


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


# ── 字幕时间轴解析工具 ──────────────────────────────────────────────

def _time_to_seconds(time_str: str) -> float:
    """HH:MM:SS.mmm → 秒数"""
    parts = time_str.split(":")
    return int(parts[0]) * 3600 + int(parts[1]) * 60 + float(parts[2])


def _parse_bvid(url: str) -> Optional[str]:
    m = re.search(r"(BV[a-zA-Z0-9]+)", url)
    return m.group(1) if m else None


def _parse_vtt(filepath: str) -> list[dict]:
    """解析 VTT 字幕文件 → [{start, end, text}, ...]"""
    with open(filepath, "r", encoding="utf-8") as f:
        content = f.read()

    segments = []
    blocks = re.split(r"\n\n+", content)
    time_pattern = re.compile(
        r"(\d{2}:\d{2}:\d{2}\.\d{3})\s*-->\s*(\d{2}:\d{2}:\d{2}\.\d{3})"
    )

    seen = set()
    for block in blocks:
        lines = block.strip().split("\n")
        time_match = None
        text_lines = []
        for line in lines:
            m = time_pattern.search(line)
            if m:
                time_match = m
            elif time_match and line.strip() and not line.strip().isdigit():
                clean = re.sub(r"<[^>]+>", "", line.strip())
                if clean:
                    text_lines.append(clean)

        if time_match and text_lines:
            text = " ".join(text_lines)
            if text in seen:
                continue
            seen.add(text)
            segments.append({
                "start": round(_time_to_seconds(time_match.group(1)), 2),
                "end": round(_time_to_seconds(time_match.group(2)), 2),
                "text": text,
            })

    return segments


# ── 字幕提取（优先官方 API，兜底 yt-dlp + VTT 解析）────────────────

def extract_subtitles_segments(url: str, max_chars: int = 8000) -> dict:
    """
    提取带时间轴的视频字幕，返回:
    {
        "has_subtitle": bool,
        "language": str,
        "subtitle_type": "manual" | "auto" | "none",
        "segments": [{"start": float, "end": float, "text": str}, ...],
        "full_text": str
    }
    """
    empty = {
        "has_subtitle": False, "language": "", "subtitle_type": "none",
        "segments": [], "full_text": "",
    }

    # ── B站专用 ──
    if is_bilibili_url(url):
        result = _extract_bilibili_segments(url, max_chars)
        if result["has_subtitle"]:
            return result
        return empty

    # ── 其他平台：yt-dlp 下载 VTT ──
    opts = {
        "quiet": True, "no_warnings": True, "noplaylist": True,
        "writesubtitles": True, "writeautomaticsub": True,
        "subtitleslangs": ["zh-Hans", "zh", "zh-CN", "zh-TW", "en", "ja", "ko"],
        "skip_download": True, "socket_timeout": 30,
        "nocheckcertificate": True, "legacy_server_connect": True, "proxy": "",
    }

    try:
        with yt_dlp.YoutubeDL(opts) as ydl:
            info = ydl.extract_info(url, download=False)
            info = ydl.sanitize_info(info)
    except Exception as e:
        logger.warning(f"提取视频信息失败: {e}")
        return empty

    if not info:
        return empty

    subtitles = info.get("subtitles", {}) or {}
    auto_subs = info.get("automatic_captions", {}) or {}
    subtitles = {k: v for k, v in subtitles.items() if k != "danmaku"}

    preferred = ["zh-Hans", "zh", "zh-CN", "en", "ja", "ko"]
    lang, sub_type = None, None

    # 优先人工字幕
    for l in preferred:
        if l in subtitles:
            lang, sub_type = l, "manual"
            break
    # 其次自动字幕
    if not lang:
        for l in preferred:
            if l in auto_subs:
                lang, sub_type = l, "auto"
                break
    # 任意兜底
    if not lang:
        for l in subtitles:
            lang, sub_type = l, "manual"
            break
    if not lang:
        for l in auto_subs:
            lang, sub_type = l, "auto"
            break

    if not lang:
        return empty

    # 下载 VTT 并解析
    with tempfile.TemporaryDirectory() as tmp:
        vtt_opts = {
            "quiet": True, "no_warnings": True, "noplaylist": True,
            "skip_download": True,
            "writesubtitles": sub_type == "manual",
            "writeautomaticsub": sub_type == "auto",
            "subtitleslangs": [lang], "subtitlesformat": "vtt",
            "outtmpl": os.path.join(tmp, "sub"),
        }
        try:
            with yt_dlp.YoutubeDL(vtt_opts) as ydl:
                ydl.download([url])
        except Exception:
            return empty

        vtt_files = [f for f in os.listdir(tmp) if f.endswith(".vtt")]
        if not vtt_files:
            return empty

        segments = _parse_vtt(os.path.join(tmp, vtt_files[0]))
        full_text = " ".join(s["text"] for s in segments)
        if len(full_text) > max_chars:
            full_text = full_text[:max_chars]

        return {
            "has_subtitle": True, "language": lang, "subtitle_type": sub_type,
            "segments": segments, "full_text": full_text,
        }


def _extract_bilibili_segments(url: str, max_chars: int = 8000) -> dict:
    """B站 dm/view API → 带时间轴的字幕分段"""
    empty = {
        "has_subtitle": False, "language": "", "subtitle_type": "none",
        "segments": [], "full_text": "",
    }
    try:
        bvid = _parse_bvid(url)
        if not bvid:
            return empty

        headers = {
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
            "Referer": f"https://www.bilibili.com/video/{bvid}",
        }

        # 获取 aid + cid
        view_url = f"https://api.bilibili.com/x/web-interface/view?bvid={bvid}"
        view_req = urllib.request.Request(view_url, headers=headers)
        with urllib.request.urlopen(view_req, timeout=15) as resp:
            view_data = json.loads(resp.read().decode("utf-8")).get("data", {})
        aid = view_data.get("aid")
        cid = view_data.get("cid") or (view_data.get("pages", [{}])[0].get("cid"))
        if not aid or not cid:
            return empty

        # 获取字幕列表
        dm_url = f"https://api.bilibili.com/x/v2/dm/view?aid={aid}&oid={cid}&type=1"
        dm_req = urllib.request.Request(dm_url, headers=headers)
        with urllib.request.urlopen(dm_req, timeout=15) as resp:
            dm_data = json.loads(resp.read().decode("utf-8")).get("data", {})
        subtitle_list = dm_data.get("subtitle", {}).get("subtitles", [])

        if not subtitle_list:
            return empty

        # 选最佳语言
        best = subtitle_list[0]
        for s in subtitle_list:
            if s.get("lan", "") in ("zh-Hans", "zh-CN", "zh"):
                best = s
                break

        sub_type = "auto" if best.get("lan", "").startswith("ai-") else "manual"
        sub_url = best.get("subtitle_url", "")
        if sub_url.startswith("//"):
            sub_url = "https:" + sub_url
        if not sub_url:
            return empty

        # 下载并解析字幕 JSON
        sub_req = urllib.request.Request(sub_url, headers=headers)
        with urllib.request.urlopen(sub_req, timeout=15) as resp:
            sub_json = json.loads(resp.read().decode("utf-8-sig", errors="ignore"))
        body = sub_json.get("body", [])

        segments = []
        for item in body:
            content = item.get("content", "").strip()
            if not content:
                continue
            segments.append({
                "start": round(item.get("from", 0), 2),
                "end": round(item.get("to", 0), 2),
                "text": content,
            })

        full_text = " ".join(s["text"] for s in segments)
        if len(full_text) > max_chars:
            full_text = full_text[:max_chars]

        return {
            "has_subtitle": True,
            "language": best.get("lan", "zh"),
            "subtitle_type": sub_type,
            "segments": segments,
            "full_text": full_text,
        }
    except Exception as e:
        logger.warning(f"B站字幕提取失败: {e}")
        return empty


# ── 兼容旧接口：纯文本提取 ──────────────────────────────────────────

def extract_bilibili_subtitles(url: str, max_chars: int = 8000) -> Optional[str]:
    """兼容旧接口：仅返回纯文本"""
    result = _extract_bilibili_segments(url, max_chars)
    return result["full_text"] if result["has_subtitle"] else None


def extract_subtitles(url: str, max_chars: int = 8000) -> Optional[str]:
    """兼容旧接口：仅返回纯文本"""
    result = extract_subtitles_segments(url, max_chars)
    return result["full_text"] if result["has_subtitle"] else None


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

    # 字幕提取（使用新的 extract_subtitles_segments，支持时间轴）
    sub_result = extract_subtitles_segments(url, max_chars)
    meta["subtitle_text"] = sub_result.get("full_text", "") or ""
    return meta


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
                {"role": "system", "content": "用最少字数提供最高密度信息，直接输出核心内容，禁用废话和过渡词。"},
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


TEXT_SUMMARY_PROMPT = """# 字幕内容
{subtitle_text}

# 任务
你是视频内容分析师。请详细总结以上字幕内容，帮助读者快速掌握视频的全部有价值信息。

# 规则
1. 禁止使用"本视频介绍了""总而言之"等废话，直接输出内容。
2. 覆盖视频涉及的所有重要话题、观点、数据、案例，不要只挑一两个点。
3. 每个要点给出具体信息，而不是笼统概括。
4. 输出格式建议（可自由发挥）：先一段总览，再分点详述，最后可加一句点睛之笔。"""


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
    # 字幕为空但有标题时，降级为基于标题/简介总结
    is_no_sub = not subtitle_text or len(subtitle_text.strip()) < 20

    # 组装提示词
    if is_no_sub and title:
        # 无字幕：用 NO_SUB_SUMMARY_PROMPT
        prompt = NO_SUB_SUMMARY_PROMPT.format(
            title=title,
            uploader=uploader or "未知作者",
            description=description or "暂无简介",
        )
    elif not is_no_sub:
        # 有字幕：拼接元数据前缀
        parts = []
        if title:
            parts.append(f"标题：{title}")
        if uploader:
            parts.append(f"UP主：{uploader}")
        if description:
            parts.append(f"简介：{description}")
        if parts:
            parts.append(f"字幕：{subtitle_text}")
            combined = "\n".join(parts)
        else:
            combined = subtitle_text
        prompt = TEXT_SUMMARY_PROMPT.format(subtitle_text=combined)
    else:
        yield "错误：未提供字幕或视频标题，无法生成总结。"
        return

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
            # B站 CDN 需要 Referer，否则 8082 端口连接被拒
            "http_headers": {
                "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
                "Referer": "https://www.bilibili.com/",
            },
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
        else:
            logger.warning(f"faster-whisper 转录结果过短或为空（{len(result)} 字符），尝试回退")

    except ImportError:
        logger.info("faster-whisper 未安装，尝试 openai-whisper")
    except Exception as e:
        logger.warning(f"faster-whisper 转录失败: {e}，尝试回退")

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
    纯解析：提取视频元数据 + 带时间轴的字幕（含 ASR 兜底）。
    不调用任何大模型，只返回结构化数据。

    返回 {"title": str, "subtitles": str, "segments": list, "language": str, "subtitle_type": str}
    """
    logger.info(f"parse_video: 开始解析 {url[:60]}")

    # 提取元数据
    data = extract_video_data(url)
    title = data.get("title", "")
    logger.info(f"parse_video: 标题={title[:50]}")

    # 提取带时间轴的字幕
    sub_result = extract_subtitles_segments(url)
    has_sub = sub_result.get("has_subtitle", False)
    segments = sub_result.get("segments", [])
    subtitle_text = sub_result.get("full_text", "")
    logger.info(f"parse_video: has_subtitle={has_sub}, segments={len(segments)}, text={len(subtitle_text)}")

    if not subtitle_text or len(subtitle_text.strip()) < 20:
        logger.info("parse_video: 无字幕，尝试下载音频走 ASR...")
        audio_path = download_audio(url)
        logger.info(f"parse_video: download_audio 返回 {audio_path}")
        if audio_path:
            subtitle_text = transcribe_audio(audio_path) or ""
            logger.info(f"parse_video: transcribe_audio 返回 {len(subtitle_text)} 字符")
            try:
                os.remove(audio_path)
            except Exception:
                pass
        else:
            logger.warning("parse_video: 音频下载失败，无法走 ASR")
    else:
        logger.info(f"parse_video: 已有字幕，跳过 ASR")

    logger.info(f"parse_video: 最终 subtitle={len(subtitle_text)} 字符, segments={len(segments)}")
    return {
        "title": title,
        "subtitles": subtitle_text or "",
        "segments": segments,
        "language": sub_result.get("language", ""),
        "subtitle_type": sub_result.get("subtitle_type", "none"),
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
            subtitle_text = ""
            yield {
                "status": "extracted",
                "message": "未提取到有效语音，将直接根据视频标题和简介进行智能总结...",
                "subtitles": ""
            }
        else:
            yield {
                "status": "extracted",
                "message": f"语音识别完成（{len(subtitle_text)} 字符），正在生成 AI 总结...",
                "subtitles": subtitle_text
            }
    else:
        yield {
            "status": "extracted",
            "message": f"字幕提取完成（{len(subtitle_text)} 字符），正在生成 AI 总结...",
            "subtitles": subtitle_text
        }

    # 阶段3：组装元数据 + 字幕 → 完整 Prompt（无字幕时使用简化版）
    yield {"status": "summarizing", "message": "AI 正在分析视频内容..."}

    if subtitle_text and len(subtitle_text.strip()) >= 20:
        # 有字幕：将元数据作为前缀和字幕一起传入
        meta_prefix = ""
        t = data.get("title", "")
        u = data.get("uploader", "")
        d = data.get("description", "")
        if t:
            meta_prefix += f"标题：{t}\n"
        if u:
            meta_prefix += f"UP主：{u}\n"
        if d:
            meta_prefix += f"简介：{d}\n"
        full_input = meta_prefix + subtitle_text if meta_prefix else subtitle_text
        prompt = SUMMARY_PROMPT.format(subtitle_text=full_input)
    else:
        prompt = NO_SUB_SUMMARY_PROMPT.format(
            title=data.get("title", "未知标题"),
            uploader=data.get("uploader", "未知作者"),
            description=data.get("description", "暂无简介"),
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
4. **绝对禁止**输出任何解释、前言、客套话、代码块标记（```）、HTML 标签。
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