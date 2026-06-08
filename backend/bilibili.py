import hashlib
import os
import re
import shutil
import subprocess
import tempfile
import time
from contextlib import contextmanager
from pathlib import Path
from typing import Dict, Iterable, List, Optional, Tuple
from urllib.parse import urlencode

import requests
from urllib3.exceptions import InsecureRequestWarning


requests.packages.urllib3.disable_warnings(InsecureRequestWarning)


UA = (
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
    "AppleWebKit/537.36 (KHTML, like Gecko) "
    "Chrome/130.0.0.0 Safari/537.36"
)

BILIBILI_REFERER = "https://www.bilibili.com/"
VIEW_API = "https://api.bilibili.com/x/web-interface/view"
NAV_API = "https://api.bilibili.com/x/web-interface/nav"
WBI_PLAYURL_API = "https://api.bilibili.com/x/player/wbi/playurl"
PLAIN_PLAYURL_API = "https://api.bilibili.com/x/player/playurl"

MIXIN_KEY_ENC_TAB = [
    46, 47, 18, 2, 53, 8, 23, 32,
    15, 50, 10, 31, 58, 3, 45, 35,
    27, 43, 5, 49, 33, 9, 42, 19,
    29, 28, 14, 39, 12, 38, 41, 13,
    37, 48, 7, 16, 24, 55, 40, 61,
    26, 17, 0, 1, 60, 51, 30, 4,
    22, 25, 54, 21, 56, 59, 6, 63,
    57, 62, 11, 36, 20, 34, 44, 52,
]


def is_bilibili_url(url: str) -> bool:
    return "bilibili.com" in url or "b23.tv" in url


def _extract_bvid(url: str) -> Optional[str]:
    match = re.search(r"(BV[0-9A-Za-z]{8,})", url)
    return match.group(1) if match else None


def _clean_wbi_value(value) -> str:
    return re.sub(r"[!'()*]", "", str(value))


def _safe_filename(value: str, fallback: str = "bilibili-video") -> str:
    value = (value or fallback).strip()
    value = re.sub(r'[\\/:*?"<>|]+', "_", value)
    value = re.sub(r"\s+", " ", value).strip(" .")
    return (value or fallback)[:100]


def _duration_string(seconds: int) -> str:
    if not seconds:
        return ""
    seconds = int(seconds)
    h = seconds // 3600
    m = (seconds % 3600) // 60
    s = seconds % 60
    if h:
        return f"{h}:{m:02d}:{s:02d}"
    return f"{m}:{s:02d}"


def _codec_score(video: Dict) -> int:
    codecs = (video.get("codecs") or "").lower()
    if "avc" in codecs:
        return 30
    if "hev" in codecs or "hvc" in codecs:
        return 20
    if "av01" in codecs or "av1" in codecs:
        return 10
    return 0


def _entry_urls(entry: Dict) -> List[str]:
    urls = []
    for key in ("base_url", "baseUrl", "url"):
        value = entry.get(key)
        if value:
            urls.append(value)
    for key in ("backup_url", "backupUrl", "backup_urls", "backupUrls"):
        value = entry.get(key) or []
        if isinstance(value, str):
            value = [value]
        for item in value:
            if item and item not in urls:
                urls.append(item)
    return urls


@contextmanager
def _without_proxy_env():
    proxy_backup = {}
    for key in ("HTTP_PROXY", "HTTPS_PROXY", "http_proxy", "https_proxy"):
        value = os.environ.pop(key, None)
        if value is not None:
            proxy_backup[key] = value
    try:
        yield
    finally:
        for key, value in proxy_backup.items():
            os.environ[key] = value


class BilibiliParser:
    def __init__(self, download_dir: str = "downloads"):
        self.download_dir = Path(download_dir)
        self.download_dir.mkdir(parents=True, exist_ok=True)
        self.session = requests.Session()
        self.session.trust_env = False
        self.session.headers.update({
            "User-Agent": UA,
            "Referer": BILIBILI_REFERER,
            "Accept": "application/json, text/plain, */*",
            "Accept-Language": "zh-CN,zh;q=0.9,en;q=0.8",
        })
        self._mixin_key = ""
        self._mixin_key_ts = 0.0

    def parse(self, url: str) -> dict:
        normalized_url, bvid = self._normalize_url(url)
        view = self._get_view_data(bvid)
        cid = view.get("cid") or (view.get("pages") or [{}])[0].get("cid")
        if not cid:
            raise RuntimeError("Unable to resolve Bilibili cid.")

        play_data = self._get_playurl(bvid, int(cid), qn=80)
        formats = self._build_formats(play_data)
        if not formats:
            formats = [{
                "format_id": "best",
                "ext": "mp4",
                "resolution": "",
                "filesize": None,
                "filesize_approx": None,
                "format_note": "Best available",
                "vcodec": "unknown",
                "acodec": "aac",
                "has_audio": True,
                "tbr": None,
                "fps": None,
            }]

        return {
            "id": bvid,
            "title": view.get("title", ""),
            "description": (view.get("desc") or "")[:500],
            "thumbnail": view.get("pic", ""),
            "duration": view.get("duration", 0) or 0,
            "duration_string": _duration_string(view.get("duration", 0) or 0),
            "uploader": (view.get("owner") or {}).get("name", ""),
            "view_count": (view.get("stat") or {}).get("view", 0) or 0,
            "like_count": (view.get("stat") or {}).get("like", 0) or 0,
            "webpage_url": normalized_url or f"https://www.bilibili.com/video/{bvid}/",
            "extractor": "BiliBili",
            "formats": formats,
            "subtitles": [],
            "automatic_captions": [],
        }

    def download(self, url: str, format_id: str = "best", progress_hook=None) -> dict:
        normalized_url, bvid = self._normalize_url(url)
        view = self._get_view_data(bvid)
        cid = view.get("cid") or (view.get("pages") or [{}])[0].get("cid")
        if not cid:
            raise RuntimeError("Unable to resolve Bilibili cid.")

        requested_qn = self._format_id_to_qn(format_id)
        play_data = self._get_playurl(bvid, int(cid), qn=requested_qn or 80)
        title = view.get("title") or bvid
        filename = f"{_safe_filename(title)} [{bvid}].mp4"
        output_path = self.download_dir / filename

        dash = play_data.get("dash") or {}
        videos = dash.get("video") or []
        audios = dash.get("audio") or []

        if videos and audios:
            video = self._choose_video(videos, requested_qn)
            audio = max(audios, key=lambda item: item.get("bandwidth", 0) or 0)
            self._download_dash_pair(
                video,
                audio,
                output_path,
                normalized_url or f"https://www.bilibili.com/video/{bvid}/",
                progress_hook,
            )
        else:
            durl = play_data.get("durl") or []
            if not durl:
                low_data = self._get_plain_playurl(bvid, int(cid), qn=requested_qn or 80, fnval=0)
                durl = low_data.get("durl") or []
            if not durl:
                raise RuntimeError("No downloadable Bilibili stream was returned.")
            headers = self._download_headers(normalized_url or f"https://www.bilibili.com/video/{bvid}/")
            self._download_first_available(_entry_urls(durl[0]), output_path, headers, progress_hook)

        if progress_hook:
            progress_hook({"status": "finished", "filename": str(output_path)})

        return {
            "title": title,
            "filename": output_path.name,
            "id": bvid,
        }

    def _normalize_url(self, url: str) -> Tuple[str, str]:
        bvid = _extract_bvid(url)
        normalized_url = url
        if not bvid and "b23.tv" in url:
            with _without_proxy_env():
                response = self.session.get(url, timeout=15, allow_redirects=True, verify=False)
                response.raise_for_status()
            normalized_url = response.url
            bvid = _extract_bvid(normalized_url)
        if not bvid:
            raise RuntimeError("Unable to parse Bilibili BV id from URL.")
        if not normalized_url:
            normalized_url = f"https://www.bilibili.com/video/{bvid}/"
        return normalized_url, bvid

    def _get_json(self, url: str, params: Optional[Dict] = None, timeout: int = 20) -> Dict:
        with _without_proxy_env():
            response = self.session.get(url, params=params, timeout=timeout, verify=False)
            response.raise_for_status()
        return response.json()

    def _get_view_data(self, bvid: str) -> Dict:
        data = self._get_json(VIEW_API, {"bvid": bvid})
        if data.get("code") != 0:
            raise RuntimeError(f"Bilibili view API failed: {data.get('message') or data.get('code')}")
        view = data.get("data") or {}
        if not view:
            raise RuntimeError("Bilibili view API returned empty data.")
        return view

    def _fetch_mixin_key(self) -> str:
        now = time.time()
        if self._mixin_key and now - self._mixin_key_ts < 1800:
            return self._mixin_key

        try:
            data = self._get_json(NAV_API, timeout=15)
            wbi = (data.get("data") or {}).get("wbi_img") or {}
            img_key = self._key_from_url(wbi.get("img_url", ""))
            sub_key = self._key_from_url(wbi.get("sub_url", ""))
            raw_key = img_key + sub_key
            if raw_key:
                self._mixin_key = "".join(
                    raw_key[index] for index in MIXIN_KEY_ENC_TAB if index < len(raw_key)
                )[:32]
                self._mixin_key_ts = now
                return self._mixin_key
        except Exception:
            pass

        self._mixin_key = "ea1db124af3c7062474693fa704f4ff8"
        self._mixin_key_ts = now
        return self._mixin_key

    @staticmethod
    def _key_from_url(url: str) -> str:
        match = re.search(r"/([^/?]+)\.(?:png|jpg|webp)", url)
        return match.group(1) if match else ""

    def _wbi_query(self, params: Dict) -> str:
        signed = {key: _clean_wbi_value(value) for key, value in params.items() if value is not None}
        signed["wts"] = str(int(time.time()))
        query = urlencode(sorted(signed.items()))
        signed["w_rid"] = hashlib.md5((query + self._fetch_mixin_key()).encode("utf-8")).hexdigest()
        return urlencode(sorted(signed.items()))

    def _get_playurl(self, bvid: str, cid: int, qn: Optional[int] = None) -> Dict:
        params = {
            "bvid": bvid,
            "cid": str(cid),
            "qn": str(qn or 80),
            "fnval": "4048",
            "fnver": "0",
            "fourk": "1",
        }
        url = f"{WBI_PLAYURL_API}?{self._wbi_query(params)}"
        try:
            data = self._get_json(url)
            if data.get("code") == 0:
                return data.get("data") or {}
        except Exception:
            pass
        return self._get_plain_playurl(bvid, cid, qn=qn or 80, fnval=4048)

    def _get_plain_playurl(self, bvid: str, cid: int, qn: int = 80, fnval: int = 4048) -> Dict:
        params = {
            "bvid": bvid,
            "cid": str(cid),
            "qn": str(qn),
            "fnval": str(fnval),
            "fnver": "0",
            "fourk": "1",
        }
        data = self._get_json(PLAIN_PLAYURL_API, params)
        if data.get("code") != 0:
            raise RuntimeError(f"Bilibili playurl API failed: {data.get('message') or data.get('code')}")
        return data.get("data") or {}

    def _build_formats(self, play_data: Dict) -> List[Dict]:
        support = {}
        for item in play_data.get("support_formats") or []:
            qn = item.get("quality")
            if qn:
                support[int(qn)] = item

        if not support:
            for qn, desc in zip(play_data.get("accept_quality") or [], play_data.get("accept_description") or []):
                support[int(qn)] = {"quality": int(qn), "new_description": desc, "display_desc": desc}

        dash = play_data.get("dash") or {}
        videos = dash.get("video") or []
        audios = dash.get("audio") or []
        by_quality = {}
        for video in videos:
            qn = int(video.get("id") or 0)
            if not qn:
                continue
            current = by_quality.get(qn)
            if current is None or self._video_sort_key(video) > self._video_sort_key(current):
                by_quality[qn] = video

        formats = []
        qualities = sorted(by_quality.keys(), reverse=True) if by_quality else sorted(support.keys(), reverse=True)
        for qn in qualities:
            video = by_quality.get(qn) or {}
            meta = support.get(qn) or {}
            height = video.get("height") or self._height_from_label(
                meta.get("new_description") or meta.get("display_desc") or meta.get("format") or ""
            )
            label = (
                meta.get("new_description")
                or meta.get("display_desc")
                or meta.get("format")
                or (f"{height}p" if height else f"quality {qn}")
            )
            formats.append({
                "format_id": f"bilibili_qn_{qn}",
                "ext": "mp4",
                "resolution": f"{height}p" if height else label,
                "filesize": None,
                "filesize_approx": None,
                "format_note": label,
                "vcodec": video.get("codecs") or "unknown",
                "acodec": "aac" if audios else "none",
                "has_audio": bool(audios),
                "tbr": round((video.get("bandwidth") or 0) / 1000, 1) or None,
                "fps": video.get("frame_rate") or video.get("fps"),
            })

        durl = play_data.get("durl") or []
        if not formats and durl:
            formats.append({
                "format_id": "bilibili_mp4",
                "ext": "mp4",
                "resolution": "",
                "filesize": durl[0].get("size"),
                "filesize_approx": None,
                "format_note": "MP4",
                "vcodec": "unknown",
                "acodec": "aac",
                "has_audio": True,
                "tbr": None,
                "fps": None,
            })

        return formats[:10]

    @staticmethod
    def _height_from_label(label: str) -> int:
        match = re.search(r"(\d{3,4})\s*[pP]?", label or "")
        return int(match.group(1)) if match else 0

    def _format_id_to_qn(self, format_id: str) -> Optional[int]:
        if not format_id or format_id == "best":
            return None
        match = re.search(r"(\d+)$", format_id)
        return int(match.group(1)) if match else None

    def _video_sort_key(self, video: Dict) -> Tuple[int, int, int, int]:
        return (
            int(video.get("id") or 0),
            int(video.get("height") or 0),
            _codec_score(video),
            int(video.get("bandwidth") or 0),
        )

    def _choose_video(self, videos: List[Dict], requested_qn: Optional[int]) -> Dict:
        candidates = videos
        if requested_qn:
            exact = [item for item in videos if int(item.get("id") or 0) == requested_qn]
            lower = [item for item in videos if int(item.get("id") or 0) <= requested_qn]
            candidates = exact or lower or videos
        return max(candidates, key=self._video_sort_key)

    def _download_headers(self, referer: str) -> Dict:
        return {
            "User-Agent": UA,
            "Referer": referer or BILIBILI_REFERER,
            "Accept": "*/*",
            "Accept-Language": "zh-CN,zh;q=0.9,en;q=0.8",
        }

    def _download_dash_pair(
        self,
        video: Dict,
        audio: Dict,
        output_path: Path,
        referer: str,
        progress_hook,
    ):
        ffmpeg = self._find_ffmpeg()
        if not ffmpeg:
            raise RuntimeError("Bilibili DASH streams need ffmpeg to merge video and audio.")

        headers = self._download_headers(referer)
        with tempfile.TemporaryDirectory(prefix="bilibili_", dir=str(self.download_dir)) as tmpdir:
            video_path = Path(tmpdir) / "video.m4s"
            audio_path = Path(tmpdir) / "audio.m4s"
            video_size = self._download_first_available(_entry_urls(video), video_path, headers, progress_hook)
            self._download_first_available(_entry_urls(audio), audio_path, headers, progress_hook, offset=video_size)

            if progress_hook:
                progress_hook({"status": "processing"})
            cmd = [
                ffmpeg,
                "-y",
                "-i", str(video_path),
                "-i", str(audio_path),
                "-c", "copy",
                "-movflags", "+faststart",
                str(output_path),
            ]
            completed = subprocess.run(cmd, capture_output=True, timeout=1800)
            if completed.returncode != 0:
                output = completed.stderr or completed.stdout or b""
                error = output.decode("utf-8", errors="replace").strip()
                raise RuntimeError(f"ffmpeg merge failed: {error[:500]}")

    def _download_first_available(
        self,
        urls: Iterable[str],
        output_path: Path,
        headers: Dict,
        progress_hook=None,
        offset: int = 0,
    ) -> int:
        last_error = None
        for url in urls:
            try:
                return self._download_one(url, output_path, headers, progress_hook, offset)
            except Exception as exc:
                last_error = exc
                if output_path.exists():
                    output_path.unlink()
        raise RuntimeError(f"Bilibili CDN download failed: {last_error}")

    def _download_one(self, url: str, output_path: Path, headers: Dict, progress_hook=None, offset: int = 0) -> int:
        started = time.time()
        downloaded = 0
        with _without_proxy_env():
            with self.session.get(url, headers=headers, stream=True, timeout=30, verify=False) as response:
                response.raise_for_status()
                total = int(response.headers.get("Content-Length") or 0)
                with open(output_path, "wb") as fp:
                    for chunk in response.iter_content(chunk_size=256 * 1024):
                        if not chunk:
                            continue
                        fp.write(chunk)
                        downloaded += len(chunk)
                        if progress_hook:
                            elapsed = max(time.time() - started, 0.001)
                            speed = downloaded / elapsed
                            total_bytes = offset + total if total else 0
                            progress_hook({
                                "status": "downloading",
                                "downloaded_bytes": offset + downloaded,
                                "total_bytes": total_bytes,
                                "speed": speed,
                                "eta": int((total - downloaded) / speed) if total and speed > 0 else 0,
                            })
        return downloaded

    @staticmethod
    def _find_ffmpeg() -> Optional[str]:
        ffmpeg = shutil.which("ffmpeg")
        if ffmpeg:
            return ffmpeg
        try:
            import static_ffmpeg
            paths = static_ffmpeg.run.get_or_fetch_platform_executables_else_raise()
            if paths:
                return paths[0]
        except Exception:
            return None
        return None
