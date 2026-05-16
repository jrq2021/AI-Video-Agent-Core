export default function ContactSection() {
  return (
    <section
      id="contact"
      className="py-20 bg-gradient-to-b from-dark-50/30 to-white"
    >
      <div className="max-w-4xl mx-auto px-4">
        <div className="text-center mb-12">
          <div className="inline-flex items-center gap-2 px-4 py-1.5 bg-rose-50 border border-rose-100 rounded-full mb-4">
            <span className="text-xs font-semibold text-rose-700">
              联系我们
            </span>
          </div>
          <h2 className="text-3xl md:text-4xl font-extrabold text-dark-900 tracking-tight">
            有什么想说的？
          </h2>
          <p className="mt-3 text-dark-400">
            无论是建议、反馈还是合作，都欢迎联系
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
          <div className="card p-6 text-center group hover:-translate-y-0.5 transition-all duration-300">
            <div className="w-12 h-12 bg-blue-50 rounded-xl flex items-center justify-center mx-auto mb-3 group-hover:scale-110 transition-transform">
              <svg
                className="w-6 h-6 text-blue-600"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={1.5}
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M21.75 6.75v10.5a2.25 2.25 0 01-2.25 2.25h-15a2.25 2.25 0 01-2.25-2.25V6.75m19.5 0A2.25 2.25 0 0019.5 4.5h-15a2.25 2.25 0 00-2.25 2.25m19.5 0v.243a2.25 2.25 0 01-1.07 1.916l-7.5 4.615a2.25 2.25 0 01-2.36 0L3.32 8.91a2.25 2.25 0 01-1.07-1.916V6.75"
                />
              </svg>
            </div>
            <h3 className="font-bold text-dark-800 mb-1">邮件联系</h3>
            <p className="text-sm text-dark-400">support@videodl.com</p>
          </div>

          <div className="card p-6 text-center group hover:-translate-y-0.5 transition-all duration-300">
            <div className="w-12 h-12 bg-purple-50 rounded-xl flex items-center justify-center mx-auto mb-3 group-hover:scale-110 transition-transform">
              <svg
                className="w-6 h-6 text-purple-600"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={1.5}
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M12 20.25c4.97 0 9-3.694 9-8.25s-4.03-8.25-9-8.25S3 7.444 3 12c0 2.104.859 4.023 2.273 5.48.432.447.74 1.04.586 1.641a4.483 4.483 0 01-.923 1.785A5.969 5.969 0 006 21c1.282 0 2.47-.402 3.445-1.087.81.22 1.668.337 2.555.337z"
                />
              </svg>
            </div>
            <h3 className="font-bold text-dark-800 mb-1">反馈建议</h3>
            <p className="text-sm text-dark-400">GitHub Issues / 用户社区</p>
          </div>

          <div className="card p-6 text-center group hover:-translate-y-0.5 transition-all duration-300">
            <div className="w-12 h-12 bg-green-50 rounded-xl flex items-center justify-center mx-auto mb-3 group-hover:scale-110 transition-transform">
              <svg
                className="w-6 h-6 text-green-600"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={1.5}
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M15.75 6a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0zM4.501 20.118a7.5 7.5 0 0114.998 0"
                />
              </svg>
            </div>
            <h3 className="font-bold text-dark-800 mb-1">商务合作</h3>
            <p className="text-sm text-dark-400">business@videodl.com</p>
          </div>
        </div>

        {/* 免责声明 */}
        <div className="mt-10 p-5 bg-amber-50 border border-amber-100 rounded-2xl">
          <div className="flex gap-3">
            <span className="text-amber-500 text-lg shrink-0">⚠️</span>
            <div>
              <h4 className="font-semibold text-amber-800 text-sm mb-1">
                免责声明
              </h4>
              <p className="text-xs text-amber-600 leading-relaxed">
                本站仅供学习交流使用。下载视频时请遵守相关平台的服务条款和当地法律法规，请勿用于侵犯他人版权或商业盈利等非法用途。本站不对用户的下载行为承担任何法律责任。
              </p>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
