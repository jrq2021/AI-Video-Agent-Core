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
import html as html_lib
from pathlib import Path
from urllib.parse import urlparse, parse_qs, quote, unquote, urlencode

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
        self._load_configured_cookie()
        self._init_guest_cookie()

    def _load_configured_cookie(self):
        """Load an optional login cookie from DOUYIN_COOKIE or DOUYIN_COOKIE_FILE."""
        cookie = os.getenv("DOUYIN_COOKIE", "").strip()
        cookie_file = os.getenv("DOUYIN_COOKIE_FILE", "").strip()
        if not cookie and cookie_file:
            cookie = self._read_cookie_file(Path(cookie_file))
        if cookie:
            self.session.headers["Cookie"] = cookie

    @staticmethod
    def _read_cookie_file(cookie_file: Path) -> str:
        if not cookie_file.exists():
            return ""

        try:
            raw = cookie_file.read_text(encoding="utf-8").strip()
        except Exception:
            return ""

        if not raw:
            return ""
        if "\t" not in raw and ";" in raw:
            return raw

        cookies = []
        for line in raw.splitlines():
            line = line.strip()
            if not line or line.startswith("#"):
                continue
            parts = line.split("\t")
            if len(parts) >= 7:
                cookies.append(f"{parts[5]}={parts[6]}")
        return "; ".join(cookies)

    def _init_guest_cookie(self):
        """访问抖音首页，获取服务器下发的 ttwid 等匿名 Cookie"""
        try:
            self.session.get("https://www.douyin.com/", timeout=self.timeout)
            self._ensure_ttwid_cookie()
            logger.info("成功获取抖音匿名访客 Cookie")
        except Exception as e:
            logger.warning(f"获取匿名 Cookie 失败: {e}")

    def _reset_guest_session(self):
        cookie_header = self.session.headers.get("Cookie")
        self.session.cookies.clear()
        if cookie_header:
            self.session.headers["Cookie"] = cookie_header
        self._init_guest_cookie()

    def _ensure_ttwid_cookie(self):
        """Generate an anonymous ttwid cookie without using a user account cookie."""
        if self._has_cookie("ttwid"):
            return

        payload = {
            "region": "cn",
            "aid": 1768,
            "needFid": False,
            "service": "www.ixigua.com",
            "migrate_info": {"ticket": "", "source": "node"},
            "cbUrlProtocol": "https",
            "union": True,
        }

        try:
            resp = self.session.post(
                "https://ttwid.bytedance.com/ttwid/union/register/",
                json=payload,
                headers={
                    "User-Agent": HEADERS["User-Agent"],
                    "Content-Type": "application/json",
                    "Accept": "application/json, text/plain, */*",
                },
                timeout=self.timeout,
            )
            ttwid = resp.cookies.get("ttwid")
            if ttwid:
                self._clear_cookie("ttwid")
                self.session.cookies.set("ttwid", ttwid, domain=".douyin.com", path="/")
        except Exception as e:
            logger.warning("生成匿名 ttwid 失败: %s", e)

    def _has_cookie(self, name: str) -> bool:
        return any(cookie.name == name and bool(cookie.value) for cookie in self.session.cookies)

    def _clear_cookie(self, name: str):
        for cookie in list(self.session.cookies):
            if cookie.name == name:
                try:
                    self.session.cookies.clear(cookie.domain, cookie.path, cookie.name)
                except Exception:
                    pass

    # ───────────────── 核心解析 ─────────────────

    def parse(self, url: str) -> dict:
        """解析抖音视频信息，返回与 yt-dlp 兼容的统一格式"""
        long_url = self._resolve_url(url)
        video_id = self._extract_video_id(long_url)

        # 方案一：直调抖音官方 API（需 a_bogus 签名）
        data = self._call_detail_api(video_id, long_url)
        if data:
            return self._build_from_aweme(data, video_id, long_url)

        self._reset_guest_session()
        data = self._call_detail_api(video_id, long_url)
        if data:
            return self._build_from_aweme(data, video_id, long_url)

        # 方案二：从公开视频页内嵌 JSON 中提取，避免依赖登录 Cookie
        result = self._try_page_hydration(long_url, video_id)
        if result:
            return result

        # 方案三：备用 tikwm API
        result = self._try_tikwm(long_url)
        if result:
            return result

        # 方案四：备用 cooluc API
        result = self._try_cooluc(long_url)
        if result:
            return result

        raise ValueError("所有 API 均解析失败，请稍后重试")

    # ───────────────── 方案一：官方 API ─────────────────

    def _call_detail_api(self, video_id: str, original_url: str = "") -> dict | None:
        """调用抖音 aweme/detail API，返回 aweme_detail 字典"""
        if ABogus is None:
            logger.warning("抖音 detail API 跳过：ABogus 不可用")
            return None

        self._ensure_ttwid_cookie()

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
            signed_url = f"{self.API_DETAIL}?{urlencode(params)}&a_bogus={quote(a_bogus, safe='')}"
        except Exception as e:
            logger.warning("抖音 a_bogus 生成失败: %s", e)
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
            resp = self.session.get(signed_url, headers=headers, timeout=15)
            if resp.status_code == 200 and resp.content:
                data = resp.json()
                if data.get("aweme_detail"):
                    return data
                logger.warning("抖音 detail API 无 aweme_detail: %s", str(data)[:300])
            else:
                logger.warning("抖音 detail API HTTP %s: %s", resp.status_code, resp.text[:200])
        except Exception as e:
            logger.warning("抖音 detail API 请求失败: %s", e)

        # 回退 X-Bogus
        if XBogus is not None:
            try:
                param_str = urlencode(params)
                xb_value = XBogus(HEADERS["User-Agent"]).getXBogus(param_str)
                xb_url = f"{self.API_DETAIL}?{param_str}&X-Bogus={xb_value[1]}"
                resp = self.session.get(xb_url, headers=headers, timeout=15)
                if resp.status_code == 200 and resp.content:
                    data = resp.json()
                    if data.get("aweme_detail"):
                        return data
            except Exception as e:
                logger.warning("抖音 X-Bogus 回退失败: %s", e)

        return None

    def _try_page_hydration(self, long_url: str, video_id: str) -> dict | None:
        """Extract aweme data from the public page's embedded hydration JSON."""
        page_urls = [long_url]
        canonical = f"https://www.douyin.com/video/{video_id}"
        if canonical not in page_urls:
            page_urls.append(canonical)

        for page_url in page_urls:
            try:
                resp = self.session.get(
                    page_url,
                    headers={**HEADERS, "Referer": "https://www.douyin.com/"},
                    timeout=self.timeout,
                    allow_redirects=True,
                )
                if resp.status_code != 200 or not resp.text:
                    continue

                for data in self._extract_hydration_json(resp.text):
                    aweme = self._find_aweme(data, video_id)
                    if aweme:
                        return self._build_from_aweme({"aweme_detail": aweme}, video_id, long_url)
            except Exception as e:
                logger.warning("抖音页面 JSON 兜底失败: %s", e)

        return None

    @staticmethod
    def _extract_hydration_json(page_html: str) -> list[dict]:
        candidates = []
        patterns = [
            r'<script[^>]+id="RENDER_DATA"[^>]*>(.*?)</script>',
            r'<script[^>]+id="__UNIVERSAL_DATA_FOR_REHYDRATION__"[^>]*>(.*?)</script>',
        ]

        for pattern in patterns:
            for match in re.finditer(pattern, page_html, flags=re.S):
                raw = html_lib.unescape(match.group(1)).strip()
                if not raw:
                    continue
                for text in (raw, unquote(raw)):
                    try:
                        candidates.append(json.loads(text))
                        break
                    except Exception:
                        continue

        return candidates

    @staticmethod
    def _find_aweme(node, video_id: str, depth: int = 0):
        if depth > 12:
            return None

        if isinstance(node, dict):
            video = node.get("video")
            node_id = str(node.get("aweme_id") or node.get("item_id") or node.get("group_id") or "")
            if isinstance(video, dict) and (not video_id or node_id == video_id or len(node_id) >= 8):
                if video.get("play_addr") or video.get("download_addr") or video.get("bit_rate"):
                    return node

            aweme_detail = node.get("aweme_detail")
            if isinstance(aweme_detail, dict):
                found = DouyinParser._find_aweme(aweme_detail, video_id, depth + 1)
                if found:
                    return found

            for value in node.values():
                found = DouyinParser._find_aweme(value, video_id, depth + 1)
                if found:
                    return found

        if isinstance(node, list):
            for item in node:
                found = DouyinParser._find_aweme(item, video_id, depth + 1)
                if found:
                    return found

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
        play_addr = video.get("play_addr") or video.get("download_addr", {})
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
            for idx, br in enumerate(bit_rate_list):
                if not isinstance(br, dict):
                    continue
                play_addr_br = br.get("play_addr") or br.get("download_addr", {})
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
                    rate_tag = bit_rate // 1000 if bit_rate else idx
                    safe_ratio = re.sub(r"[^0-9a-zA-Z]+", "_", ratio or "unknown").strip("_")
                    formats.append({
                        "format_id": f"douyin_{safe_ratio}_{rate_tag}",
                        "ext": "mp4",
                        "resolution": ratio,
                        "filesize": None,
                        "filesize_approx": None,
                        "vcodec": "h264",
                        "acodec": "aac",
                        "has_audio": True,
                        "format_note": label,
                        "tbr": bit_rate,
                        "fps": None,
                        "_direct_url": nwm,
                    })

        # 如果没有 bit_rate 列表，回退到 play_addr
        if formats:
            best_by_resolution = {}
            for fmt in formats:
                key = fmt.get("resolution") or fmt.get("format_note") or fmt.get("format_id")
                current = best_by_resolution.get(key)
                if current is None or (fmt.get("tbr") or 0) > (current.get("tbr") or 0):
                    best_by_resolution[key] = fmt

            def sort_key(fmt: dict):
                height_match = re.search(r"(\d+)", fmt.get("resolution") or "")
                height = int(height_match.group(1)) if height_match else 0
                return (height, fmt.get("tbr") or 0)

            formats = sorted(best_by_resolution.values(), key=sort_key, reverse=True)

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
        except Exception as e:
            logger.warning("tikwm API 失败: %s", e)
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
        except Exception as e:
            logger.warning("cooluc API 失败: %s", e)
        return None


    def download(self, url: str, format_id: str = "best", mode: str = "video", progress_hook=None) -> dict:
        """下载抖音视频，返回文件信息"""
        info = self.parse(url)
        formats = info.get("formats") or []
        if not formats:
            raise RuntimeError("抖音解析成功，但没有可下载的视频直链")

        title = re.sub(r'[\\/*?:"<>|\n\r\t]', "_", info["title"]).strip("_. ")[:60] or f"douyin_{info['id']}"

        ext = ".mp4" if mode == "video" else ".mp3"
        filename = f"{title}{ext}"
        filepath = self.download_dir / filename

        selected = None
        if format_id and format_id != "best":
            selected = next((f for f in formats if f.get("format_id") == format_id), None)

        candidates = []
        if selected:
            candidates.append(selected)
        candidates.extend(f for f in formats if f is not selected)

        last_error = None
        for fmt in candidates:
            media_url = fmt.get("_direct_url")
            if not media_url:
                continue
            try:
                self._download_file(media_url, filepath, progress_hook=progress_hook)
                return {
                    "filepath": str(filepath),
                    "filename": filename,
                    "title": info["title"],
                    "ext": ext.lstrip("."),
                }
            except Exception as e:
                last_error = e
                logger.warning("抖音直链下载失败，尝试备用格式 %s: %s", fmt.get("format_id"), e)

        raise RuntimeError(f"抖音视频下载失败: {last_error or '没有可用直链'}")

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

    def _download_file(self, url: str, filepath: Path, chunk_size: int = 64 * 1024, progress_hook=None):
        """下载文件到本地"""
        headers = {
            "User-Agent": HEADERS["User-Agent"],
            "Referer": "https://www.douyin.com/",
            "Accept": "*/*",
        }
        resp = self.session.get(url, headers=headers, stream=True, timeout=self.timeout, allow_redirects=True)
        resp.raise_for_status()
        content_type = (resp.headers.get("Content-Type") or "").lower()
        if "text/html" in content_type or "application/json" in content_type:
            raise RuntimeError(f"直链返回非视频内容: {content_type or 'unknown'}")

        temp_path = filepath.with_suffix(filepath.suffix + ".part")
        if temp_path.exists():
            temp_path.unlink()

        total = int(resp.headers.get("Content-Length") or 0)
        downloaded = 0
        start = time.time()
        with open(temp_path, "wb") as f:
            for chunk in resp.iter_content(chunk_size=chunk_size):
                if chunk:
                    f.write(chunk)
                    downloaded += len(chunk)
                    if progress_hook:
                        elapsed = max(time.time() - start, 0.001)
                        progress_hook({
                            "status": "downloading",
                            "downloaded_bytes": downloaded,
                            "total_bytes": total,
                            "speed": downloaded / elapsed,
                            "eta": int((total - downloaded) / (downloaded / elapsed)) if total else 0,
                        })
        temp_path.rename(filepath)
        if progress_hook:
            progress_hook({"status": "finished", "filename": str(filepath)})
