"""临时测试：抖音分享页解析"""
import requests, json

url = 'https://www.douyin.com/video/7637454711896984875'
headers = {
    'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/6051.15 (KHTML, like Gecko) Version/16.0 Mobile/15E148 Safari/604.1',
    'Referer': 'https://www.douyin.com/',
    'Accept-Language': 'zh-CN,zh;q=0.9',
}
r = requests.get(url, headers=headers, timeout=15, allow_redirects=True)
html = r.text
print('Status:', r.status_code, 'Length:', len(html))

marker = 'window._ROUTER_DATA = '
if marker in html:
    print('Found _ROUTER_DATA!')
    start = html.find(marker) + len(marker)
    end = html.find(';\n', start)
    if end > start:
        data = json.loads(html[start:end])
        loader = data.get('loaderData', {})
        for k, v in loader.items():
            if isinstance(v, dict) and 'videoInfoRes' in v:
                items = v['videoInfoRes'].get('item_list', [])
                if items:
                    item = items[0]
                    print('Title:', item.get('desc', ''))
                    author = item.get('author', {})
                    print('Author:', author.get('nickname', ''))
                    video = item.get('video', {})
                    play = video.get('play_addr', {}).get('url_list', [])
                    if play:
                        print('No-wm URL:', play[0].replace('playwm', 'play')[:80])
else:
    print('_ROUTER_DATA not found')
    print('HTML preview:', html[:500])
