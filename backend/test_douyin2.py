"""测试yt-dlp从Chrome获取Cookie解析抖音"""
import yt_dlp

opts = {
    'quiet': False,
    'nocheckcertificate': True,
    'proxy': '',
    'cookiesfrombrowser': ('chrome',),
    'format': 'best',
    'noplaylist': True,
}
yd = yt_dlp.YoutubeDL(opts)
info = yd.extract_info('https://v.douyin.com/PUhK_GOKRdw/', download=False)
print('Title:', info.get('title'))
for f in info.get('formats', [])[:3]:
    print(f'  {f.get("format_id")} | {f.get("ext")} | {f.get("resolution","")}')
