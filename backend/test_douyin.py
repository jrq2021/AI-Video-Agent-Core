"""Manual HTTP probe for a Douyin share page."""

import json

import requests


def main() -> None:
    url = "https://www.douyin.com/video/7637454711896984875"
    headers = {
        "User-Agent": (
            "Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) "
            "AppleWebKit/6051.15 (KHTML, like Gecko) Version/16.0 "
            "Mobile/15E148 Safari/604.1"
        ),
        "Referer": "https://www.douyin.com/",
        "Accept-Language": "zh-CN,zh;q=0.9",
    }
    response = requests.get(url, headers=headers, timeout=15, allow_redirects=True)
    html = response.text
    print("Status:", response.status_code, "Length:", len(html))

    marker = "window._ROUTER_DATA = "
    if marker not in html:
        print("_ROUTER_DATA not found")
        print("HTML preview:", html[:500])
        return

    print("Found _ROUTER_DATA!")
    start = html.find(marker) + len(marker)
    end = html.find(";\n", start)
    if end <= start:
        return

    data = json.loads(html[start:end])
    loader = data.get("loaderData", {})
    for value in loader.values():
        if not isinstance(value, dict) or "videoInfoRes" not in value:
            continue
        items = value["videoInfoRes"].get("item_list", [])
        if not items:
            continue
        item = items[0]
        print("Title:", item.get("desc", ""))
        author = item.get("author", {})
        print("Author:", author.get("nickname", ""))
        video = item.get("video", {})
        play = video.get("play_addr", {}).get("url_list", [])
        if play:
            print("No-wm URL:", play[0].replace("playwm", "play")[:80])
        return


if __name__ == "__main__":
    main()
