"""
抖音视频解析与下载模块
参考 https://github.com/DLWangSan/douyin_parse
直接调用抖音官方 API (aweme/v1/web/aweme/detail/)，使用 a_bogus 签名绕过反爬
"""
import re
import os
import json
import time
import logging
from pathlib import Path
from urllib.parse import urlparse, parse_qs, quote

import requests

try:
    from abogus import ABogus
except Exception:
    ABogus = None

try:
    from xbogus import XBogus
except Exception:
    XBogus = None

logger = logging.getLogger("douyin")

HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
        "AppleWebKit/537.36 (KHTML, like Gecko) "
        "Chrome/125.0.0.0 Safari/537.36"
    ),
    "Accept": "text/html,application/json,*/*",
    "Accept-Language": "zh-CN,zh;q=0.9",
    "Referer": "https://www.douyin.com/",
}

DOUYIN_DOMAINS = [
    "douyin.com", "iesdouyin.com", "v.douyin.com",
    "www.douyin.com", "m.douyin.com",
]


def is_douyin_url(url: str) -> bool:
    """判断是否为抖音链接"""
    try:
        host = urlparse(url).netloc.lower()
        return any(d in host for d in DOUYIN_DOMAINS)
    except Exception:
        return False


class DouyinParser:
    """抖音视频解析器，通过 a_bogus 直调官方 API，获取无水印视频"""

    API_DETAIL = "https://www.douyin.com/aweme/v1/web/aweme/detail/"

    def __init__(self, download_dir: str = "downloads"):
        self.download_dir = Path(download_dir)
        self.download_dir.mkdir(parents=True, exist_ok=True)
        self.session = requests.Session()
        self.session.headers.update(HEADERS)
        self.timeout = (10, 30)
        self._init_guest_cookie()

    def _init_guest_cookie(self):
        """访问抖音首页，获取服务器下发的 ttwid 等匿名 Cookie"""
        try:
            self.session.get("https://www.douyin.com/", timeout=self.timeout)
            logger.info("成功获取抖音匿名访客 Cookie")
        except Exception as e:
            logger.warning(f"获取匿名 Cookie 失败: {e}")

    # ───────────────── 核心解析 ─────────────────

    def parse(self, url: str) -> dict:
        """解析抖音视频信息，返回与 yt-dlp 兼容的统一格式"""
        long_url = self._resolve_url(url)
        video_id = self._extract_video_id(long_url)

        # 方案一：直调抖音官方 API（需 a_bogus 签名）
        data = self._call_detail_api(video_id, long_url)
        if data:
            return self._build_from_aweme(data, video_id, long_url)

        # 方案二：备用 tikwm API
        result = self._try_tikwm(long_url)
        if result:
            return result

        # 方案三：备用 cooluc API
        result = self._try_cooluc(long_url)
        if result:
            return result

        raise ValueError("所有 API 均解析失败，请稍后重试")

    # ───────────────── 方案一：官方 API ─────────────────

    def _call_detail_api(self, video_id: str, original_url: str = "") -> dict | None:
        """调用抖音 aweme/detail API，返回 aweme_detail 字典"""
        if ABogus is None:
            return None

        params = {
            "device_platform": "webapp",
            "aid": "6383",
            "channel": "channel_pc_web",
            "aweme_id": video_id,
            "pc_client_type": "1",
            "version_code": "290100",
            "version_name": "29.1.0",
            "cookie_enabled": "true",
            "browser_language": "zh-CN",
            "browser_platform": "Win32",
            "browser_name": "Chrome",
            "browser_version": "130.0.0.0",
            "browser_online": "true",
            "engine_name": "Blink",
            "engine_version": "130.0.0.0",
            "os_name": "Windows",
            "os_version": "10",
            "platform": "PC",
            "msToken": "",
        }

        try:
            a_bogus = ABogus().get_value(params)
            params["a_bogus"] = quote(a_bogus, safe="")
        except Exception:
            return None

        is_note = "/note/" in original_url
        referer = (
            f"https://www.douyin.com/note/{video_id}" if is_note
            else f"https://www.douyin.com/video/{video_id}"
        )

        headers = {
            "User-Agent": HEADERS["User-Agent"],
            "Referer": referer,
            "Accept": "application/json, text/plain, */*",
        }

        # 先试 a_bogus
        try:
            resp = requests.get(self.API_DETAIL, params=params, headers=headers, timeout=15)
            if resp.status_code == 200 and resp.content:
                data = resp.json()
                if data.get("aweme_detail"):
                    return data
        except Exception:
            pass

        # 回退 X-Bogus
        if XBogus is not None:
            try:
                param_str = "&".join(f"{k}={v}" for k, v in params.items())
                xb_value = XBogus(HEADERS["User-Agent"]).getXBogus(param_str)
                xb_url = f"{self.API_DETAIL}?{param_str}&X-Bogus={xb_value[1]}"
                resp = requests.get(xb_url, headers=headers, timeout=15)
                if resp.status_code == 200 and resp.content:
                    data = resp.json()
                    if data.get("aweme_detail"):
                        return data
            except Exception:
                pass

        return None

    @staticmethod
    def _build_from_aweme(data: dict, video_id: str, long_url: str) -> dict:
        """从 aweme_detail 构建 yt-dlp 兼容字典"""
        aweme = data.get("aweme_detail", {})
        author = aweme.get("author", {})
        video = aweme.get("video", {})
        stats = aweme.get("statistics", {})

        title = aweme.get("desc") or f"抖音视频_{video_id}"
        uploader = author.get("nickname", "抖音用户")

        # 封面
        cover_list = video.get("cover", {}).get("url_list", [])
        thumbnail = cover_list[0] if cover_list else ""

        # 时长 (毫秒 → 秒)
        duration_ms = video.get("duration", 0)
        duration_sec = duration_ms // 1000 if duration_ms > 1000 else duration_ms

        # 无水印播放地址：play_addr 的 url_list，替换 playwm → play
        play_addr = video.get("play_addr", {})
        url_list = play_addr.get("url_list", [])
        direct_url = url_list[0].replace("playwm", "play") if url_list else ""

        # 多画质选项
        formats = DouyinParser._extract_qualities(video, direct_url)

        m, s = divmod(int(duration_sec), 60)
        h, m = divmod(m, 60)
        duration_str = f"{h}:{m:02d}:{s:02d}" if h else f"{m}:{s:02d}"

        return {
            "id": video_id,
            "title": title.strip(),
            "description": title[:200],
            "thumbnail": thumbnail,
            "duration": duration_sec,
            "duration_string": duration_str,
            "uploader": uploader,
            "view_count": stats.get("play_count") or stats.get("digg_count", 0),
            "like_count": stats.get("digg_count", 0),
            "webpage_url": long_url,
            "extractor": "Douyin",
            "formats": formats,
            "subtitles": [],
            "automatic_captions": [],
        }

    @staticmethod
    def _extract_qualities(video: dict, fallback_url: str) -> list[dict]:
        """从 bit_rate 列表提取多画质无水印格式"""
        formats = []
        bit_rate_list = video.get("bit_rate", [])

        if bit_rate_list:
            for br in bit_rate_list:
                if not isinstance(br, dict):
                    continue
                play_addr_br = br.get("play_addr", {})
                url_list_br = play_addr_br.get("url_list", [])
                bit_rate = br.get("bit_rate", 0)
                gear_name = br.get("gear_name", "")

                # 解析分辨率
                ratio = ""
                quality_type = br.get("quality_type")
                if isinstance(quality_type, dict):
                    ratio = quality_type.get("name", "")
                if not ratio and gear_name:
                    m = re.search(r"(\d+p)", gear_name.lower())
                    ratio = m.group(1) if m else ""
                if not ratio:
                    if bit_rate >= 2000000:
                        ratio = "1080p"
                    elif bit_rate >= 1000000:
                        ratio = "720p"
                    elif bit_rate >= 500000:
                        ratio = "540p"
                    else:
                        ratio = "480p"

                if url_list_br:
                    nwm = url_list_br[0].replace("playwm", "play")
                    label = f"{ratio} ({bit_rate // 1000}Kbps)" if bit_rate else ratio
                    formats.append({
                        "format_id": f"douyin_{ratio}",
                        "ext": "mp4",
                        "resolution": ratio,
                        "filesize": None,
                        "filesize_approx": None,
                        "vcodec": "h264",
                        "acodec": "aac",
                        "format_note": label,
                        "tbr": bit_rate,
                        "fps": None,
                        "_direct_url": nwm,
                    })

        # 如果没有 bit_rate 列表，回退到 play_addr
        if not formats and fallback_url:
            formats.append({
                "format_id": "douyin_nowm",
                "ext": "mp4",
                "resolution": "原始",
                "filesize": None,
                "filesize_approx": None,
                "vcodec": "h264",
                "acodec": "aac",
                "format_note": "无水印",
                "tbr": None,
                "fps": None,
                "_direct_url": fallback_url,
            })

        return formats

    # ───────────────── 备用 API ─────────────────

    def _try_tikwm(self, long_url: str) -> dict | None:
        """备用：tikwm API"""
        try:
            resp = self.session.post(
                "https://www.tikwm.com/api/",
                data={"url": long_url},
                timeout=(15, 60),
            )
            resp.raise_for_status()
            result = resp.json()
            if result.get("code") == 0:
                data = result.get("data", {})
                title = (data.get("title") or "抖音视频").strip()
                author_obj = data.get("author") if isinstance(data.get("author"), dict) else {}
                author = author_obj.get("nickname") or "抖音用户"
                cover = data.get("cover") or ""
                direct_url = data.get("play") or ""
                video_id = data.get("id") or "unknown"
                if direct_url:
                    return {
                        "id": str(video_id),
                        "title": title,
                        "description": title[:200],
                        "thumbnail": cover,
                        "duration": data.get("duration", 0),
                        "duration_string": "未知",
                        "uploader": author,
                        "view_count": 0,
                        "like_count": 0,
                        "webpage_url": long_url,
                        "extractor": "Douyin",
                        "formats": [{
                            "format_id": "douyin_nowm",
                            "ext": "mp4",
                            "resolution": "原始",
                            "filesize": None,
                            "filesize_approx": None,
                            "vcodec": "h264",
                            "acodec": "aac",
                            "format_note": "无水印",
                            "tbr": None,
                            "fps": None,
                            "_direct_url": direct_url,
                        }],
                        "subtitles": [],
                        "automatic_captions": [],
                    }
        except Exception:
            pass
        return None

    def _try_cooluc(self, long_url: str) -> dict | None:
        """备用：cooluc API"""
        try:
            resp = self.session.get(
                f"https://api.cooluc.com/?url={long_url}",
                timeout=(15, 60),
            )
            resp.raise_for_status()
            result = resp.json()
            if result.get("success"):
                title = (result.get("desc") or "抖音视频").strip()
                author = result.get("author") or "抖音用户"
                cover = result.get("cover") or ""
                direct_url = result.get("video") or ""
                if direct_url:
                    return {
                        "id": "unknown",
                        "title": title,
                        "description": title[:200],
                        "thumbnail": cover,
                        "duration": 0,
                        "duration_string": "未知",
                        "uploader": author,
                        "view_count": 0,
                        "like_count": 0,
                        "webpage_url": long_url,
                        "extractor": "Douyin",
                        "formats": [{
                            "format_id": "douyin_nowm",
                            "ext": "mp4",
                            "resolution": "原始",
                            "filesize": None,
                            "filesize_approx": None,
                            "vcodec": "h264",
                            "acodec": "aac",
                            "format_note": "无水印",
                            "tbr": None,
                            "fps": None,
                            "_direct_url": direct_url,
                        }],
                        "subtitles": [],
                        "automatic_captions": [],
                    }
        except Exception:
            pass
        return None


    def download(self, url: str, mode: str = "video") -> dict:
        """下载抖音视频，返回文件信息"""
        info = self.parse(url)
        media_url = info["formats"][0]["_direct_url"]
        title = re.sub(r'[\\/*?:"<>|\n\r\t]', "_", info["title"]).strip("_. ")[:60] or f"douyin_{info['id']}"

        ext = ".mp4" if mode == "video" else ".mp3"
        filename = f"{title}{ext}"
        filepath = self.download_dir / filename

        self._download_file(media_url, filepath)

        return {
            "filepath": str(filepath),
            "filename": filename,
            "title": info["title"],
            "ext": ext.lstrip("."),
        }

    def _resolve_url(self, url: str) -> str:
        """解析短链接重定向，获取真实URL"""
        resp = self.session.get(url, timeout=self.timeout, allow_redirects=True)
        resp.raise_for_status()
        return resp.url

    def _extract_video_id(self, url: str) -> str:
        """从 URL 中提取视频 ID"""
        parsed = urlparse(url)
        query = parse_qs(parsed.query)

        for key in ("modal_id", "item_ids", "group_id", "aweme_id"):
            values = query.get(key)
            if values:
                match = re.search(r"(\d{8,24})", values[0])
                if match:
                    return match.group(1)

        for pattern in (r"/video/(\d{8,24})", r"/note/(\d{8,24})", r"/(\d{15,24})(?:/|$)"):
            match = re.search(pattern, parsed.path)
            if match:
                return match.group(1)

        fallback = re.search(r"(\d{15,24})", url)
        if fallback:
            return fallback.group(1)

        raise ValueError("无法从链接中提取视频ID")

    def _download_file(self, url: str, filepath: Path, chunk_size: int = 64 * 1024):
        """下载文件到本地"""
        resp = self.session.get(url, stream=True, timeout=self.timeout, allow_redirects=True)
        resp.raise_for_status()

        temp_path = filepath.with_suffix(filepath.suffix + ".part")
        with open(temp_path, "wb") as f:
            for chunk in resp.iter_content(chunk_size=chunk_size):
                if chunk:
                    f.write(chunk)
        temp_path.rename(filepath)
