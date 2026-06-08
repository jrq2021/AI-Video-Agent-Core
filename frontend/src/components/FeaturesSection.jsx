const features = [
  {
    image: "/assets/features/platforms.svg",
    title: "1000+ 平台支持",
    desc: "基于开源项目 yt-dlp，支持 YouTube、B站、Twitter、Instagram 等全球上千个视频平台。",
  },
  {
    image: "/assets/features/quality.svg",
    title: "高清画质下载",
    desc: "支持 4K/1080P/720P 等所有清晰度选择，可单独下载视频或音频，满足不同场景需求。",
  },
  {
    image: "/assets/features/speed.svg",
    title: "极速下载体验",
    desc: "多线程并发下载，实时进度展示，支持断点续传，大文件也能快速稳定下载到本地。",
  },
  {
    image: "/assets/features/safe.svg",
    title: "安全无广告",
    desc: "无需注册登录，不存储用户数据，无广告无弹窗。视频直接保存到你的设备，隐私安全有保障。",
  },
  {
    image: "/assets/features/devices.svg",
    title: "全平台兼容",
    desc: "支持 PC 网页端和手机浏览器访问，响应式设计适配各种屏幕尺寸，随时随地下载视频。",
  },
  {
    image: "/assets/features/subtitles.svg",
    title: "字幕支持",
    desc: "自动下载视频字幕文件，支持多语言字幕选择，方便学习外语或观看外语视频内容。",
  },
];

export default function FeaturesSection() {
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
          <h2 className="text-3xl md:text-4xl font-extrabold text-dark-900">
            功能特色
          </h2>
          <p className="mt-3 text-dark-400 max-w-xl mx-auto">
            不只是下载，我们提供一站式的视频获取解决方案
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {features.map((feature) => (
            <div
              key={feature.title}
              className="group relative bg-white rounded-2xl p-6 border border-dark-100 hover:border-dark-200 hover:shadow-lg hover:-translate-y-0.5 transition-all duration-300"
            >
              <img
                src={feature.image}
                alt=""
                aria-hidden="true"
                width="80"
                height="80"
                loading="lazy"
                className="w-20 h-20 mb-5 object-contain transition-transform duration-300 group-hover:scale-105"
              />
              <h3 className="text-lg font-bold text-dark-900 mb-2">
                {feature.title}
              </h3>
              <p className="text-sm text-dark-400 leading-relaxed">
                {feature.desc}
              </p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
