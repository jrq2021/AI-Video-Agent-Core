"""Manual yt-dlp probe for Douyin using the local Chrome cookie store."""

import yt_dlp


def main() -> None:
    opts = {
        "quiet": False,
        "nocheckcertificate": True,
        "proxy": "",
        "cookiesfrombrowser": ("chrome",),
        "format": "best",
        "noplaylist": True,
    }
    yd = yt_dlp.YoutubeDL(opts)
    info = yd.extract_info("https://v.douyin.com/PUhK_GOKRdw/", download=False)
    print("Title:", info.get("title"))
    for video_format in info.get("formats", [])[:3]:
        print(
            f"  {video_format.get('format_id')} | {video_format.get('ext')} | "
            f"{video_format.get('resolution', '')}"
        )


if __name__ == "__main__":
    main()
