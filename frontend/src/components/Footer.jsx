export default function Footer() {
  return (
    <footer className="cinematic-footer">
      <div className="mx-auto max-w-7xl px-4 py-10 sm:px-6">
        <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-6 text-sm">
            <a href="#" className="transition-colors">
              关于我们
            </a>
            <a href="#" className="transition-colors">
              使用协议
            </a>
            <a href="#" className="transition-colors">
              隐私政策
            </a>
            <a href="#contact" className="transition-colors">
              联系我们
            </a>
          </div>
          <p className="text-sm">
            © 2026 万能视频下载器 | Powered by yt-dlp
          </p>
        </div>
        <p className="mt-4 text-center text-xs">
          本站仅供学习交流使用，请勿用于非法用途。下载视频请遵守相关平台的使用条款和版权法规。
        </p>
      </div>
    </footer>
  );
}
