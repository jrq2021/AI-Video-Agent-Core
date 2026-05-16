export default function HeroSection() {
  return (
    <section className="pt-16 pb-8 text-center animate-fade-in-up">
      <div className="max-w-3xl mx-auto px-4">
        {/* Badge */}
        <div className="inline-flex items-center gap-2 px-4 py-1.5 bg-primary-50 border border-primary-100 rounded-full mb-6">
          <span className="relative flex h-2 w-2">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-primary-400 opacity-75"></span>
            <span className="relative inline-flex rounded-full h-2 w-2 bg-primary-500"></span>
          </span>
          <span className="text-xs font-semibold text-primary-700">
            支持 1000+ 平台
          </span>
        </div>

        {/* Title */}
        <h1 className="text-4xl md:text-5xl font-extrabold text-dark-900 tracking-tight leading-tight mb-4">
          万能视频下载，
          <span className="bg-gradient-to-r from-primary-600 to-blue-400 bg-clip-text text-transparent">
            随时随地保存精彩
          </span>
        </h1>

        {/* Subtitle */}
        <p className="text-dark-400 text-base md:text-lg max-w-xl mx-auto leading-relaxed">
          粘贴视频链接，一键下载高清无水印视频。支持
          YouTube、B站等上千个平台，快速、免费、安全。
        </p>

        {/* Features mini grid */}
        <div className="flex flex-wrap justify-center gap-8 mt-8 text-sm text-dark-400">
          {[
            { icon: "🎬", text: "1000+ 平台支持" },
            { icon: "⚡", text: "极速下载" },
            { icon: "🎯", text: "高清画质" },
            { icon: "🔒", text: "安全可靠" },
          ].map((f) => (
            <div key={f.text} className="flex items-center gap-2">
              <span className="text-lg">{f.icon}</span>
              <span className="font-medium text-dark-500">{f.text}</span>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
