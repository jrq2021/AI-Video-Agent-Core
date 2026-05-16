export default function FeaturesSection() {
  const features = [
    {
      icon: (
        <svg
          className="w-6 h-6"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={1.5}
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M3.75 3v11.25A2.25 2.25 0 006 16.5h2.25M3.75 3h-1.5m1.5 0h16.5m0 0h1.5m-1.5 0v11.25A2.25 2.25 0 0118 16.5h-2.25m-7.5 0h7.5m-7.5 0l-1 3m8.5-3l1 3m0 0l.5 1.5m-.5-1.5h-9.5m0 0l-.5 1.5"
          />
        </svg>
      ),
      title: "1000+ 平台支持",
      desc: "基于开源项目 yt-dlp，支持 YouTube、B站、Twitter、Instagram 等全球上千个视频平台。",
      color: "from-blue-500 to-blue-600",
      bg: "bg-blue-50",
    },
    {
      icon: (
        <svg
          className="w-6 h-6"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={1.5}
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M3 4.5h14.25M3 9h9.75M3 13.5h9.75m4.5-4.5v12m0 0l-3.75-3.75M17.25 21L21 17.25"
          />
        </svg>
      ),
      title: "高清画质下载",
      desc: "支持 4K/1080P/720P 等所有清晰度选择，可单独下载视频或音频，满足不同场景需求。",
      color: "from-purple-500 to-purple-600",
      bg: "bg-purple-50",
    },
    {
      icon: (
        <svg
          className="w-6 h-6"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={1.5}
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M3.75 13.5l10.5-11.25L12 10.5h8.25L9.75 21.75 12 13.5H3.75z"
          />
        </svg>
      ),
      title: "极速下载体验",
      desc: "多线程并发下载，实时进度展示，支持断点续传，大文件也能快速稳定下载到本地。",
      color: "from-orange-500 to-orange-600",
      bg: "bg-orange-50",
    },
    {
      icon: (
        <svg
          className="w-6 h-6"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={1.5}
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M9 12.75L11.25 15 15 9.75m-3-7.036A11.959 11.959 0 013.598 6 11.99 11.99 0 003 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285z"
          />
        </svg>
      ),
      title: "安全无广告",
      desc: "无需注册登录，不存储用户数据，无广告无弹窗。视频直接保存到你的设备，隐私安全有保障。",
      color: "from-green-500 to-green-600",
      bg: "bg-green-50",
    },
    {
      icon: (
        <svg
          className="w-6 h-6"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={1.5}
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M10.5 1.5H8.25A2.25 2.25 0 006 3.75v16.5a2.25 2.25 0 002.25 2.25h7.5A2.25 2.25 0 0018 20.25V3.75a2.25 2.25 0 00-2.25-2.25H13.5m-3 0V3h3V1.5m-3 0h3m-3 18.75h3"
          />
        </svg>
      ),
      title: "全平台兼容",
      desc: "支持 PC 网页端和手机浏览器访问，响应式设计适配各种屏幕尺寸，随时随地下载视频。",
      color: "from-pink-500 to-pink-600",
      bg: "bg-pink-50",
    },
    {
      icon: (
        <svg
          className="w-6 h-6"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={1.5}
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z"
          />
        </svg>
      ),
      title: "字幕支持",
      desc: "自动下载视频字幕文件，支持多语言字幕选择，方便学习外语或观看外语视频内容。",
      color: "from-teal-500 to-teal-600",
      bg: "bg-teal-50",
    },
  ];

  return (
    <section
      id="features"
      className="py-20 bg-gradient-to-b from-white to-dark-50/30"
    >
      <div className="max-w-6xl mx-auto px-4">
        <div className="text-center mb-12">
          <div className="inline-flex items-center gap-2 px-4 py-1.5 bg-primary-50 border border-primary-100 rounded-full mb-4">
            <span className="text-xs font-semibold text-primary-700">
              为什么选择我们
            </span>
          </div>
          <h2 className="text-3xl md:text-4xl font-extrabold text-dark-900 tracking-tight">
            功能特色
          </h2>
          <p className="mt-3 text-dark-400 max-w-xl mx-auto">
            不只是下载，我们提供一站式的视频获取解决方案
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {features.map((f) => (
            <div
              key={f.title}
              className="group relative bg-white rounded-2xl p-6 border border-dark-100 hover:border-dark-200 hover:shadow-lg hover:-translate-y-0.5 transition-all duration-300"
            >
              <div
                className={`w-12 h-12 ${f.bg} rounded-xl flex items-center justify-center mb-4 group-hover:scale-110 transition-transform duration-300`}
              >
                <div
                  className={`bg-gradient-to-br ${f.color} bg-clip-text text-transparent`}
                >
                  {f.icon}
                </div>
              </div>
              <h3 className="text-lg font-bold text-dark-900 mb-2">
                {f.title}
              </h3>
              <p className="text-sm text-dark-400 leading-relaxed">{f.desc}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
