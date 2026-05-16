"""
yt-dlp 封装层 - 视频信息提取与下载
"""
import os
import re
import ssl
import shutil
import yt_dlp

# 国内视频站点（CDN 直连更快，需绕过系统代理）
DOMESTIC_SITES = [
    "bilibili.com", "b23.tv", "biliapi.net", "bilivideo.com",
    "douyin.com", "iesdouyin.com", "v.douyin.com",
    "ixigua.com", "xigua.com",
    "kuaishou.com",
    "acfun.cn", "aixifan.com",
]

# YouTube 专用优化参数，跳过不必要的解析以加速
YOUTUBE_EXTRACTOR_ARGS = {
    "youtube": {
        "player_client": ["android", "web"],  # android 客户端通常比 web 快
        "skip": ["hls", "dash"],  # 跳过 hls/dash manifest，减少请求量
        "player_skip": ["configs", "webpage"],  # 跳过网页解析
    }
}


def _is_domestic_site(url: str) -> bool:
    """判断是否为国内视频站点"""
    try:
        from urllib.parse import urlparse
        host = urlparse(url).netloc.lower()
        return any(d in host for d in DOMESTIC_SITES)
    except Exception:
        return False


def _patch_ssl():
    """全局修补Python SSL上下文，解决国内CDN的TLS握手异常（UNEXPECTED_EOF）"""
    try:
        ctx = ssl.create_default_context()
        ctx.check_hostname = False
        ctx.verify_mode = ssl.CERT_NONE
        # 添加旧版服务器连接选项（解决某些CDN的TLS握手问题）
        for flag_name in ['OP_LEGACY_SERVER_CONNECT', 'OP_IGNORE_UNEXPECTED_EOF']:
            flag = getattr(ssl, flag_name, None)
            if flag:
                ctx.options |= flag
        ssl._create_default_https_context = lambda: ctx
    except Exception:
        pass


# 启动时修补SSL
_patch_ssl()


class VideoDownloader:
    def __init__(self, download_dir: str):
        self.download_dir = download_dir
        # 每次初始化也修补一次，确保生效
        _patch_ssl()

    def _get_common_opts(self, url: str = "") -> dict:
        """获取通用的 yt-dlp 选项，根据站点类型调整代理策略"""
        opts = {
            "quiet": True,
            "no_warnings": True,
            "noplaylist": True,
            "extract_flat": False,
            "socket_timeout": 15,        # 缩短超时，避免长时间卡住
            "extractor_retries": 2,       # 减少重试次数
            "retries": 3,
            "nocheckcertificate": True,
            "legacy_server_connect": True,
        }

        # 国内站点：绕过系统代理直连（避免 Clash/V2Ray 干扰国内 CDN）
        if _is_domestic_site(url):
            opts["proxy"] = ""
        # 国外站点（YouTube 等）：不设置 proxy，让系统代理正常工作

        # YouTube 专用加速选项
        if "youtube.com" in url or "youtu.be" in url:
            opts["extractor_args"] = YOUTUBE_EXTRACTOR_ARGS

        return opts

    def extract_info(self, url: str) -> dict:
        """提取视频信息（不下载）"""
        opts = self._get_common_opts(url)

        with yt_dlp.YoutubeDL(opts) as ydl:
            info = ydl.extract_info(url, download=False)
            info = ydl.sanitize_info(info)

        # 整理格式信息
        formats = []
        seen = set()
        for f in info.get("formats", []):
            if not f.get("ext") or f.get("format_note") == "storyboard":
                continue
            vcodec = f.get("vcodec", "none")
            acodec = f.get("acodec", "none")
            has_video = vcodec and vcodec != "none"
            has_audio = acodec and acodec != "none"
            if not has_video and not has_audio:
                continue

            height = f.get("height") or 0
            ext = f.get("ext", "mp4")
            # 按(高度, 格式, 有无音频)去重
            key = (height, ext, "av" if has_audio else "v")
            if key in seen:
                continue
            seen.add(key)

            formats.append({
                "format_id": f.get("format_id", ""),
                "ext": ext,
                "resolution": f.get("resolution", ""),
                "filesize": f.get("filesize"),
                "filesize_approx": f.get("filesize_approx"),
                "format_note": f.get("format_note", ""),
                "vcodec": vcodec,
                "acodec": acodec if has_audio else "none",
                "has_audio": has_audio,
                "tbr": f.get("tbr"),
                "fps": f.get("fps"),
            })

        # 若所有格式都无音频，加一个合并选项
        formats.sort(key=lambda x: x.get("height", 0) or 0, reverse=True)
        if formats and not any(f.get("has_audio") for f in formats):
            formats.insert(0, {
                "format_id": "bestvideo+bestaudio/best",
                "ext": "mp4",
                "resolution": f"{formats[0].get('resolution', '')} (合并)",
                "filesize": None,
                "filesize_approx": None,
                "format_note": f"{formats[0].get('height', 0)}p 最佳 (视频+音频合并)",
                "vcodec": formats[0].get("vcodec", ""),
                "acodec": "aac",
                "has_audio": True,
                "tbr": None,
                "fps": None,
            })

        return {
            "id": info.get("id", ""),
            "title": info.get("title", ""),
            "description": info.get("description", "")[:500] if info.get("description") else "",
            "thumbnail": info.get("thumbnail", ""),
            "duration": info.get("duration", 0),
            "duration_string": info.get("duration_string", ""),
            "uploader": info.get("uploader", ""),
            "view_count": info.get("view_count", 0),
            "like_count": info.get("like_count", 0),
            "webpage_url": info.get("webpage_url", url),
            "extractor": info.get("extractor", ""),
            "formats": formats,
            # 字幕信息
            "subtitles": list(info.get("subtitles", {}).keys()),
            "automatic_captions": list(info.get("automatic_captions", {}).keys()),
        }

    def download(self, url: str, format_id: str = "best", progress_hook=None) -> dict:
        """下载视频"""
        out_template = os.path.join(self.download_dir, "%(title).100s [%(id)s].%(ext)s")

        # 查找 ffmpeg（优先静态ffmpeg，无需系统安装）
        has_ffmpeg = False
        ffmpeg_path = None
        if shutil.which("ffmpeg"):
            has_ffmpeg = True
            ffmpeg_path = shutil.which("ffmpeg")
        else:
            try:
                import static_ffmpeg
                paths = static_ffmpeg.run.get_or_fetch_platform_executables_else_raise()
                if paths:
                    has_ffmpeg = True
                    ffmpeg_path = paths[0]
            except Exception:
                pass

        # 智能格式选择
        if format_id == "best":
            if has_ffmpeg:
                fmt = "bv*+ba/b"  # 最佳视频+最佳音频合并
            else:
                fmt = "bestvideo/best"  # 无需ffmpeg：只下载最优单流
        else:
            if has_ffmpeg:
                fmt = f"{format_id}+bestaudio/{format_id}"
            else:
                fmt = format_id  # 直接用选中的格式

        opts = self._get_common_opts(url)
        opts.update({
            "format": fmt,
            "outtmpl": out_template,
            "playlist_items": "1",       # 即使有播放列表也只下载第1个
            "merge_output_format": "mp4",
            "progress_hooks": [progress_hook] if progress_hook else [],
            "windowsfilenames": True,
        })

        # 告诉 yt-dlp ffmpeg 在哪里
        if ffmpeg_path:
            opts["ffmpeg_location"] = os.path.dirname(ffmpeg_path)

        with yt_dlp.YoutubeDL(opts) as ydl:
            info = ydl.extract_info(url, download=True)
            info = ydl.sanitize_info(info)

        # 获取实际下载的文件名
        filename = ""
        if info and "requested_downloads" in info:
            for d in info["requested_downloads"]:
                if d.get("filepath"):
                    filename = os.path.basename(d["filepath"])
                    break

        return {
            "title": info.get("title", ""),
            "filename": filename,
            "id": info.get("id", ""),
        }
