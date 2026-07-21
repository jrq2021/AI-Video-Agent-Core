import { useEffect, useRef, useState } from "react";

export default function HeroSection({ onStartParse }) {
  const sectionRef = useRef(null);
  const videoRef = useRef(null);
  const [videoReady, setVideoReady] = useState(false);

  useEffect(() => {
    const section = sectionRef.current;
    const video = videoRef.current;
    if (!section || !video) return undefined;

    if (video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA) {
      setVideoReady(true);
    }

    const syncPlayback = (isVisible) => {
      if (isVisible && !document.hidden) {
        video.play().catch(() => {});
      } else {
        video.pause();
      }
    };

    const observer = new IntersectionObserver(
      ([entry]) => syncPlayback(entry.isIntersecting),
      { threshold: 0.05 },
    );
    const handleVisibilityChange = () =>
      syncPlayback(section.getBoundingClientRect().bottom > 0);

    observer.observe(section);
    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      observer.disconnect();
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, []);

  return (
    <section
      ref={sectionRef}
      className="relative z-10 flex min-h-[100svh] items-center justify-center px-6 pb-24 pt-32 text-center sm:pb-28 sm:pt-36"
    >
      <video
        ref={videoRef}
        className={`cinematic-hero__video ${videoReady ? "is-ready" : ""}`}
        autoPlay
        loop
        muted
        playsInline
        preload="auto"
        poster="/assets/theme/hero-video-poster.webp"
        onLoadedData={() => setVideoReady(true)}
        onCanPlay={() => setVideoReady(true)}
        onError={() => setVideoReady(false)}
        aria-hidden="true"
      >
        <source src="/assets/theme/hero-background.mp4" type="video/mp4" />
      </video>

      <div className="cinematic-hero__copy relative z-10 mx-auto flex w-full max-w-7xl flex-col items-center">
        <h1 className="hero-title animate-fade-rise max-w-6xl text-white">
          让<em>灵感</em>，
          <br />
          <em>穿过寂静生长。</em>
        </h1>

        <p className="animate-fade-rise-delay mt-8 max-w-2xl text-base leading-relaxed text-white/65 sm:text-lg">
          为深度思考者、勇敢创作者与安静的行动派，打造专注而自由的数字空间。
          在纷扰之中，留住真正值得保存的画面与声音。
        </p>

        <a
          href="/parse"
          onClick={(event) => {
            event.preventDefault();
            onStartParse?.();
          }}
          className="liquid-glass animate-fade-rise-delay-2 mt-12 inline-flex cursor-pointer items-center justify-center rounded-full px-14 py-5 text-base font-medium text-white transition-transform duration-300 hover:scale-[1.03] focus:outline-none focus-visible:ring-2 focus-visible:ring-white/80"
        >
          开始解析
        </a>
      </div>
    </section>
  );
}
