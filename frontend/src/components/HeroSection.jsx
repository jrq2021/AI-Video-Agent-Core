export default function HeroSection({ theme = "cinematic" }) {
  if (theme !== "cinematic") {
    return (
      <section className="pt-16 pb-8 text-center animate-fade-in-up">
        <div className="max-w-3xl mx-auto px-4">
          <div className="inline-flex items-center gap-2 px-4 py-1.5 bg-primary-50 border border-primary-100 rounded-full mb-6">
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-primary-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2 w-2 bg-primary-500"></span>
            </span>
            <span className="text-xs font-semibold text-primary-700">
              支持 1000+ 平台
            </span>
          </div>

          <h1 className="text-4xl md:text-5xl font-extrabold text-dark-900 tracking-tight leading-tight mb-4">
            万能视频下载，
            <span className="bg-gradient-to-r from-primary-600 to-blue-400 bg-clip-text text-transparent">
              随时随地保存精彩
            </span>
          </h1>

          <p className="text-dark-400 text-base md:text-lg max-w-xl mx-auto leading-relaxed">
            粘贴视频链接，一键下载高清无水印视频。支持
            YouTube、B站等上千个平台，快速、免费、安全。
          </p>

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

  return (
    <section className="relative overflow-hidden pt-16 pb-6 md:pt-24 md:pb-10 animate-fade-in-up">
      <div
        className="absolute inset-0 opacity-95"
        aria-hidden="true"
        style={{
          backgroundImage:
            "linear-gradient(90deg, rgba(255, 250, 236, 0.98) 0%, rgba(255, 250, 236, 0.88) 36%, rgba(255, 250, 236, 0.2) 66%), url('/assets/theme/pop-hero.png')",
          backgroundSize: "cover",
          backgroundPosition: "center right",
        }}
      />
      <div className="absolute inset-x-0 bottom-0 h-24 bg-gradient-to-t from-[#fffaf0] via-[#fffaf0]/80 to-transparent" />
      <div className="relative max-w-7xl mx-auto px-4 sm:px-6">
        <div className="max-w-2xl">
          <p className="text-sm font-semibold uppercase tracking-[0.22em] text-[#0b64ff] mb-5">
            Video capture made playful
          </p>
          <h1 className="text-4xl md:text-6xl font-extrabold leading-tight text-[#101828]">
            万能视频下载
            <span className="block bg-gradient-to-r from-[#0b64ff] via-[#ff2da3] to-[#f2bf21] bg-clip-text text-transparent">
              像收藏作品一样保存视频
            </span>
          </h1>
          <p className="mt-6 text-base md:text-lg leading-8 text-[#475467] max-w-xl">
            粘贴链接，解析高清画质、音频与字幕。把复杂的视频获取流程收进一个安静、快速、可控的工作台。
          </p>

          <div className="mt-8 grid grid-cols-2 sm:flex sm:flex-wrap gap-3">
            {["1000+ 平台", "高清有音", "字幕总结", "本地保存"].map((item) => (
              <span
                key={item}
                className="inline-flex items-center justify-center rounded-full border border-white/70 bg-white/70 px-4 py-2 text-sm font-semibold text-[#184078] shadow-sm backdrop-blur-md"
              >
                {item}
              </span>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
