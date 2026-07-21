import { useCallback, useEffect, useMemo, useState } from "react";
import { ArrowLeft, ArrowRight } from "lucide-react";

const FEATURES = [
  {
    image: "/assets/features/3d/platforms-3d.webp",
    title: "1000+ 平台支持",
    desc: "基于开源项目 yt-dlp，支持 YouTube、B站、Twitter、Instagram 等全球上千个视频平台。",
    bg: "#1459B8",
    panel: "#3478D5",
  },
  {
    image: "/assets/features/3d/quality-3d.webp",
    title: "高清画质下载",
    desc: "支持 4K、1080P、720P 等清晰度选择，可单独下载视频或音频，满足不同创作场景。",
    bg: "#6F3CC3",
    panel: "#8B5EE0",
  },
  {
    image: "/assets/features/3d/speed-3d.webp",
    title: "极速下载体验",
    desc: "多线程并发下载，实时展示进度并支持断点续传，大文件也能快速稳定保存到本地。",
    bg: "#C65B22",
    panel: "#E47736",
  },
  {
    image: "/assets/features/3d/safe-3d.webp",
    title: "安全无广告",
    desc: "不存储用户数据，无广告与弹窗干扰。视频直接保存到你的设备，隐私安全更有保障。",
    bg: "#147A59",
    panel: "#2B9B75",
  },
  {
    image: "/assets/features/3d/devices-3d.webp",
    title: "全平台兼容",
    desc: "支持 PC 网页端和手机浏览器访问，响应式布局适配不同屏幕，随时随地处理视频。",
    bg: "#B54F7E",
    panel: "#D56B9D",
  },
  {
    image: "/assets/features/3d/subtitles-3d.webp",
    title: "字幕支持",
    desc: "自动提取视频字幕，支持多语言选择与常用格式导出，学习、整理和创作都更轻松。",
    bg: "#087F87",
    panel: "#21A2AA",
  },
];

const ANIMATION_DURATION = 480;
const TRANSITION =
  "transform 480ms cubic-bezier(0.22, 1, 0.36, 1), opacity 360ms ease";

function getRelativeOffset(index, activeIndex) {
  const total = FEATURES.length;
  const forward = (index - activeIndex + total) % total;
  return forward > total / 2 ? forward - total : forward;
}

function getCharacterStyle(offset, isMobile, isAnimating) {
  const base = {
    position: "absolute",
    left: "50%",
    bottom: isMobile ? "20%" : "-2%",
    height: isMobile ? "62%" : "90%",
    aspectRatio: "2 / 3",
    transition: TRANSITION,
    transformOrigin: "50% 100%",
    willChange: isAnimating ? "transform, opacity" : "auto",
  };

  if (offset === 0) {
    return {
      ...base,
      zIndex: 20,
      opacity: 1,
      transform: `translate3d(-50%, 0, 0) scale(${isMobile ? 1.12 : 1.08})`,
    };
  }

  if (offset === -1 || offset === 1) {
    const x = offset * (isMobile ? 34 : 23);
    return {
      ...base,
      zIndex: 12,
      opacity: isMobile ? 0.78 : 0.88,
      transform: `translate3d(calc(-50% + ${x}vw), ${isMobile ? "-10vh" : "-14vh"}, 0) scale(${isMobile ? 0.31 : 0.38})`,
    };
  }

  const x = offset * 20.5;
  return {
    ...base,
    zIndex: 7,
    opacity: 0.5,
    transform: `translate3d(calc(-50% + ${x}vw), -16vh, 0) scale(0.23)`,
  };
}

export default function FeaturesSection() {
  const [activeIndex, setActiveIndex] = useState(0);
  const [isAnimating, setIsAnimating] = useState(false);
  const [isMobile, setIsMobile] = useState(() => window.innerWidth < 640);

  const activeFeature = FEATURES[activeIndex];

  useEffect(() => {
    const handleResize = () => setIsMobile(window.innerWidth < 640);
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  const navigate = useCallback(
    (direction) => {
      if (isAnimating) return;
      setIsAnimating(true);
      setActiveIndex((current) =>
        direction === "next"
          ? (current + 1) % FEATURES.length
          : (current + FEATURES.length - 1) % FEATURES.length,
      );
      window.setTimeout(() => setIsAnimating(false), ANIMATION_DURATION);
    },
    [isAnimating],
  );

  const visibleCharacters = useMemo(
    () =>
      FEATURES.map((feature, index) => ({
        feature,
        index,
        offset: getRelativeOffset(index, activeIndex),
      })).filter(({ offset }) => Math.abs(offset) <= (isMobile ? 1 : 2)),
    [activeIndex, isMobile],
  );

  useEffect(() => {
    const handleKeyDown = (event) => {
      if (event.key === "ArrowLeft") navigate("prev");
      if (event.key === "ArrowRight") navigate("next");
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [navigate]);

  return (
    <section
      id="features"
      className="feature-showcase"
      style={{
        "--feature-bg": activeFeature.bg,
        "--feature-panel": activeFeature.panel,
      }}
      aria-label="六大功能轮播"
    >
      <div className="feature-showcase__viewport">
        <div className="feature-showcase__grain" aria-hidden="true" />

        <p className="feature-showcase__brand">功能图鉴</p>
        <p className="feature-showcase__ghost" aria-hidden="true">
          六大能力
        </p>

        <div className="feature-showcase__characters" aria-live="polite">
          {visibleCharacters.map(({ feature, index, offset }) => (
            <div
              key={feature.title}
              className="feature-showcase__character"
              style={getCharacterStyle(offset, isMobile, isAnimating)}
              aria-hidden={index !== activeIndex}
            >
              <img
                src={feature.image}
                alt={index === activeIndex ? feature.title : ""}
                draggable="false"
                loading={index === activeIndex ? "eager" : "lazy"}
                decoding="async"
                fetchpriority={index === activeIndex ? "high" : "low"}
              />
            </div>
          ))}
        </div>

        <div className="feature-showcase__copy">
          <p className="feature-showcase__count">
            {String(activeIndex + 1).padStart(2, "0")}
            <span>/ {String(FEATURES.length).padStart(2, "0")}</span>
          </p>
          <h2>{activeFeature.title}</h2>
          <p className="feature-showcase__desc">{activeFeature.desc}</p>
          <div className="feature-showcase__controls">
            <button
              type="button"
              onClick={() => navigate("prev")}
              aria-label="上一个功能"
            >
              <ArrowLeft aria-hidden="true" strokeWidth={2.25} />
            </button>
            <button
              type="button"
              onClick={() => navigate("next")}
              aria-label="下一个功能"
            >
              <ArrowRight aria-hidden="true" strokeWidth={2.25} />
            </button>
          </div>
        </div>

        <a
          href="#download-workspace"
          className="feature-showcase__link"
          onClick={(event) => {
            event.preventDefault();
            document.querySelector("#download-workspace")?.scrollIntoView({
              behavior: "smooth",
              block: "start",
            });
          }}
        >
          开始解析
          <ArrowRight aria-hidden="true" strokeWidth={2.25} />
        </a>

        <div className="feature-showcase__dots" aria-label="选择功能">
          {FEATURES.map((feature, index) => (
            <button
              key={feature.title}
              type="button"
              onClick={() => {
                if (index === activeIndex || isAnimating) return;
                setIsAnimating(true);
                setActiveIndex(index);
                window.setTimeout(() => setIsAnimating(false), ANIMATION_DURATION);
              }}
              className={index === activeIndex ? "is-active" : ""}
              aria-label={`查看${feature.title}`}
              aria-current={index === activeIndex ? "true" : undefined}
            />
          ))}
        </div>
      </div>
    </section>
  );
}
