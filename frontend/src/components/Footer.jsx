export default function Footer() {
  return (
    <footer className="border-t border-dark-100 bg-dark-50/50">
      <div className="max-w-7xl mx-auto px-4 py-8">
        <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-6 text-sm text-dark-400">
            <a href="#" className="hover:text-primary-600 transition-colors">
              关于我们
            </a>
            <a href="#" className="hover:text-primary-600 transition-colors">
              使用协议
            </a>
            <a href="#" className="hover:text-primary-600 transition-colors">
              隐私政策
            </a>
            <a href="#" className="hover:text-primary-600 transition-colors">
              联系我们
            </a>
          </div>
          <p className="text-sm text-dark-400">
            © 2026 万能视频下载器 | Powered by yt-dlp
          </p>
        </div>
        <p className="text-xs text-dark-300 text-center mt-3">
          本站仅供学习交流使用，请勿用于非法用途。下载视频请遵守相关平台的使用条款和版权法规。
        </p>
      </div>
    </footer>
  );
}
