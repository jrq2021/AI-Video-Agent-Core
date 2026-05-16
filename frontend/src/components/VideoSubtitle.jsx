import { useState, useRef, useEffect, useCallback } from "react";
import useVideoSync from "../hooks/useVideoSync";

/* ── 工具 ────────────────────────────────────────────────────────── */
function formatTime(s) {
  const h = Math.floor(s / 3600),
    m = Math.floor((s % 3600) / 60);
  return h
    ? `${h}:${String(m).padStart(2, "0")}:${String(Math.floor(s % 60)).padStart(2, "0")}`
    : `${m}:${String(Math.floor(s % 60)).padStart(2, "0")}`;
}
function extractBvid(url) {
  return url?.match(/BV[\w]+/)?.[0] ?? null;
}
function isBilibiliUrl(url) {
  return /bilibili\.com|b23\.tv/.test(url);
}
function _sec2vtt(s) {
  const h = Math.floor(s / 3600),
    m = Math.floor((s % 3600) / 60);
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${(s % 60).toFixed(3).padStart(6, "0")}`;
}

/* ── 内联 SVG 图标 ───────────────────────────────────────────────── */
const Icon = {
  sparkles: (
    <svg
      className="w-4 h-4 inline"
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      strokeWidth={1.5}
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09z"
      />
    </svg>
  ),
  subtitles: (
    <svg
      className="w-4 h-4 inline"
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      strokeWidth={1.5}
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M19.114 5.636a9 9 0 010 12.728M16.463 8.288a5.25 5.25 0 010 7.424M6.75 8.25l4.72-4.72a.75.75 0 011.28.53v15.88a.75.75 0 01-1.28.53l-4.72-4.72H4.51c-.88 0-1.704-.507-1.938-1.354A9.009 9.009 0 012.25 12c0-.83.112-1.633.322-2.396C2.806 8.756 3.63 8.25 4.51 8.25H6.75z"
      />
    </svg>
  ),
  download: (
    <svg
      className="w-4 h-4 inline"
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      strokeWidth={2}
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M16.5 12L12 16.5m0 0L7.5 12m4.5 4.5V3"
      />
    </svg>
  ),
  close: (
    <svg
      className="w-3.5 h-3.5"
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      strokeWidth={2}
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M6 18L18 6M6 6l12 12"
      />
    </svg>
  ),
};

/* ── Tab 组件 ───────────────────────────────────────────────────── */
function Tabs({ tabs, active, onChange }) {
  return (
    <div className="flex border-b border-dark-100 bg-white sticky top-0 z-10">
      {tabs.map((t) => (
        <button
          key={t.key}
          onClick={() => onChange(t.key)}
          className={`relative px-5 py-3 text-sm font-medium transition-colors ${
            active === t.key
              ? "text-blue-600"
              : "text-dark-400 hover:text-dark-600"
          }`}
        >
          <span className="mr-1.5">{t.icon}</span>
          {t.label}
          {active === t.key && (
            <span className="absolute bottom-0 left-1/2 -translate-x-1/2 w-8 h-0.5 bg-blue-600 rounded-full" />
          )}
        </button>
      ))}
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════
 * VideoSubtitle — 重构版
 * - Tab 布局：【核心总结】|【完整字幕】
 * - useVideoSync Hook 统一管理双向同步
 * - 画中画：滚动离开视频区时右下角 Sticky 迷你播放器
 * ═══════════════════════════════════════════════════════════════════ */

export default function VideoSubtitle({ videoSrc, originalUrl }) {
  const bvid = extractBvid(originalUrl);
  const isBili = isBilibiliUrl(originalUrl);

  // ── 字幕/转录状态 ──
  const [state, setState] = useState("idle"); // idle|loading|done|error
  const [message, setMessage] = useState("");
  const [segments, setSegments] = useState([]);
  const [error, setError] = useState("");
  const [language, setLanguage] = useState("");
  const [prompt, setPrompt] = useState("");
  const [activeTab, setActiveTab] = useState("summary");

  // ── AI 总结状态 ──
  const [summaryState, setSummaryState] = useState("idle"); // idle|summarizing|streaming|done|error
  const [summaryMessage, setSummaryMessage] = useState("");
  const [summaryText, setSummaryText] = useState("");
  const [summaryError, setSummaryError] = useState("");

  // ── 画中画 ──
  const [isPiP, setIsPiP] = useState(false);
  const playerRef = useRef(null);

  // ── 播放器引用 ──
  const videoRef = useRef(null);
  const iframeRef = useRef(null);
  const listRef = useRef(null);
  const itemRefs = useRef({});
  const abortRef = useRef(null);

  // ── 双向同步 Hook ──
  const sync = useVideoSync(segments);

  // 注入播放器 seek → 暴露给 Hook
  useEffect(() => {
    sync.registerSeekTo((time) => {
      if (isBili && iframeRef.current) {
        iframeRef.current.contentWindow?.postMessage(
          { type: "seek", data: { time } },
          "*",
        );
      } else if (videoRef.current) {
        videoRef.current.currentTime = time;
        videoRef.current.play().catch(() => {});
      }
    });
  }, [isBili, sync]);

  /* ──── iframe 模拟时间（B站模式）──── */
  const timerRef = useRef(null);
  const simRef = useRef(0);
  const playingRef = useRef(false);

  useEffect(() => {
    if (!isBili || state !== "done") return;
    const handler = (e) => {
      if (e.data?.type === "player_loaded") {
        playingRef.current = true;
        if (!timerRef.current) {
          timerRef.current = setInterval(() => {
            if (!playingRef.current) return;
            simRef.current += 0.25;
            sync.onTimeUpdate(simRef.current);
          }, 250);
        }
      }
      if (
        e.data?.type === "current_time" &&
        typeof e.data?.data?.time === "number"
      ) {
        simRef.current = e.data.data.time;
        sync.onTimeUpdate(e.data.data.time);
      }
    };
    window.addEventListener("message", handler);
    return () => {
      window.removeEventListener("message", handler);
      clearInterval(timerRef.current);
    };
  }, [isBili, state, sync]);

  /* ──── HTML5 视频 → 同步 ──── */
  const onVideoTimeUpdate = useCallback(() => {
    if (videoRef.current) sync.onTimeUpdate(videoRef.current.currentTime);
  }, [sync]);

  /* ──── 画中画：IntersectionObserver ──── */
  useEffect(() => {
    const el = playerRef.current;
    if (!el) return;
    const obs = new IntersectionObserver(([e]) => setIsPiP(!e.isIntersecting), {
      threshold: 0.3,
    });
    obs.observe(el);
    return () => obs.disconnect();
  }, [state]);

  /* ──── 滚动高亮字幕 ──── */
  useEffect(() => {
    if (sync.activeIndex < 0) return;
    itemRefs.current[sync.activeIndex]?.scrollIntoView({
      behavior: "smooth",
      block: "nearest",
    });
  }, [sync.activeIndex]);

  /* ──── 转录 API ──── */
  const handleTranscribe = useCallback(() => {
    if (!originalUrl) return;
    setState("loading");
    setSegments([]);
    setError("");
    const ctrl = new AbortController();
    abortRef.current = ctrl;

    fetch("/api/transcribe", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        url: originalUrl,
        model: "base",
        language: "",
        prompt: prompt.trim() || "",
      }),
      signal: ctrl.signal,
    })
      .then((res) => {
        const reader = res.body.getReader();
        const dec = new TextDecoder();
        let buf = "";
        function read() {
          reader
            .read()
            .then(({ done, value }) => {
              if (done) return;
              buf += dec.decode(value, { stream: true });
              const lines = buf.split("\n");
              buf = lines.pop() || "";
              for (const line of lines) {
                if (!line.startsWith("data: ")) continue;
                try {
                  const d = JSON.parse(line.slice(6));
                  switch (d.status) {
                    case "checking":
                    case "downloading_audio":
                    case "transcribing":
                      setMessage(d.message);
                      break;
                    case "found_existing":
                      setSegments(d.segments);
                      setLanguage(d.language || "");
                      setState("done");
                      break;
                    case "done":
                      setSegments(d.segments);
                      setLanguage(d.language || "");
                      setMessage("");
                      setState("done");
                      break;
                    case "error":
                      setState("error");
                      setError(d.message);
                      console.error("[字幕]", d.message);
                      break;
                  }
                } catch {}
              }
              read();
            })
            .catch(() => {});
        }
        read();
      })
      .catch((err) => {
        if (err.name !== "AbortError") {
          setState("error");
          setError(`网络错误: ${err.message}`);
        }
      });
  }, [originalUrl, prompt]);

  useEffect(() => () => abortRef.current?.abort(), []);

  /* ──── 转录完成后自动触发总结 ──── */
  useEffect(() => {
    if (state !== "done" || segments.length === 0) return;
    if (summaryState !== "idle") return; // 只在未总结时自动触发
    setSummaryState("summarizing");
    setSummaryMessage("字幕提取完成，AI 正在分析...");
    const text = segments.map((s) => s.text).join(" ");
    const ctrl = new AbortController();
    fetch("/api/summarize/text", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text }),
      signal: ctrl.signal,
    })
      .then((res) => {
        const reader = res.body.getReader();
        const dec = new TextDecoder();
        let buf = "";
        function read() {
          reader
            .read()
            .then(({ done, value }) => {
              if (done) {
                setSummaryState("done");
                return;
              }
              buf += dec.decode(value, { stream: true });
              for (const line of buf.split("\n")) {
                if (!line.startsWith("data: ")) continue;
                buf = "";
                try {
                  const d = JSON.parse(line.slice(6));
                  if (d.status === "streaming")
                    setSummaryText((p) => p + d.content);
                  else if (d.status === "done") setSummaryState("done");
                  else if (d.status === "error") {
                    setSummaryState("error");
                    setSummaryError(d.message);
                  }
                } catch {}
              }
              read();
            })
            .catch(() => {});
        }
        read();
      })
      .catch((err) => {
        if (err.name !== "AbortError") {
          setSummaryState("error");
          setSummaryError(`网络错误: ${err.message}`);
        }
      });
  }, [state, segments, summaryState]);

  /* ──── AI 总结 API（手动触发，使用已提取的字幕文本）─── */
  const handleSummarize = useCallback(() => {
    if (segments.length === 0) {
      setActiveTab("subtitles");
      return;
    }
    setSummaryState("summarizing");
    setSummaryText("");
    setSummaryError("");
    const text = segments.map((s) => s.text).join(" ");

    const ctrl = new AbortController();
    fetch("/api/summarize/text", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text }),
      signal: ctrl.signal,
    })
      .then((res) => {
        const reader = res.body.getReader();
        const dec = new TextDecoder();
        let buf = "";
        function read() {
          reader
            .read()
            .then(({ done, value }) => {
              if (done) {
                setSummaryState("done");
                return;
              }
              buf += dec.decode(value, { stream: true });
              for (const line of buf.split("\n")) {
                if (!line.startsWith("data: ")) continue;
                buf = "";
                try {
                  const d = JSON.parse(line.slice(6));
                  if (d.status === "streaming")
                    setSummaryText((p) => p + d.content);
                  else if (d.status === "done") setSummaryState("done");
                  else if (d.status === "error") {
                    setSummaryState("error");
                    setSummaryError(d.message);
                  }
                } catch {}
              }
              read();
            })
            .catch(() => {});
        }
        read();
      })
      .catch((err) => {
        if (err.name !== "AbortError") {
          setSummaryState("error");
          setSummaryError(`网络错误: ${err.message}`);
        }
      });
  }, [segments]);

  /* ──── 渲染 ──── */
  if (!originalUrl)
    return (
      <div className="mt-6 p-6 bg-dark-50 rounded-2xl text-center text-dark-400 text-sm">
        请先解析视频链接
      </div>
    );

  const showContent = state === "done" && segments.length > 0;

  return (
    <div className="mt-6">
      <div className="card overflow-hidden">
        {/* ═══ 视频 + Tab 功能区 ═══ */}
        {/* 始终显示：只要有视频 URL 就展示播放器和 Tab */}
        {(isBili || videoSrc) && (
          <>
            {/* 视频区 */}
            <div ref={playerRef} className="bg-black relative">
              {isBili && bvid ? (
                <iframe
                  ref={iframeRef}
                  src={`//player.bilibili.com/player.html?bvid=${bvid}&page=1&autoplay=0`}
                  allow="autoplay; fullscreen"
                  sandbox="allow-scripts allow-same-origin allow-popups"
                  className="w-full aspect-video max-h-[420px] border-0"
                />
              ) : videoSrc ? (
                <video
                  ref={videoRef}
                  src={videoSrc}
                  controls
                  crossOrigin="anonymous"
                  onTimeUpdate={onVideoTimeUpdate}
                  className="w-full max-h-[420px]"
                />
              ) : null}
            </div>

            {/* Tab 栏 */}
            <Tabs
              tabs={[
                { key: "summary", label: "核心总结", icon: Icon.sparkles },
                { key: "subtitles", label: "完整字幕", icon: Icon.subtitles },
              ]}
              active={activeTab}
              onChange={setActiveTab}
            />

            {/* Tab 内容 */}
            <div className="max-h-[460px] overflow-y-auto">
              {activeTab === "summary" && (
                <div className="p-5">
                  {summaryState === "idle" && (
                    <div className="text-center py-8">
                      <div className="w-14 h-14 mx-auto mb-3 rounded-2xl bg-violet-50 flex items-center justify-center">
                        <svg
                          className="w-7 h-7 text-violet-400"
                          fill="none"
                          viewBox="0 0 24 24"
                          stroke="currentColor"
                          strokeWidth={1.5}
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            d="M12 18v-5.25m0 0a6.01 6.01 0 001.5-.189m-1.5.189a6.01 6.01 0 01-1.5-.189m3.75 7.478a12.06 12.06 0 01-4.5 0m3.75 2.383a14.406 14.406 0 01-3 0M14.25 18v-.192c0-.983.658-1.823 1.508-2.316a7.5 7.5 0 10-7.517 0c.85.493 1.509 1.333 1.509 2.316V18"
                          />
                        </svg>
                      </div>
                      <p className="text-dark-500 text-sm">
                        点击下方按钮，让 AI 帮你总结视频要点
                      </p>
                      <p className="text-dark-400 text-xs mt-1">
                        自动提取字幕 · 智能分析 · 省时高效
                      </p>
                      <button
                        onClick={handleSummarize}
                        className="mt-4 px-5 py-2 bg-violet-600 text-white rounded-xl font-medium text-sm hover:bg-violet-700 active:scale-95 transition-all shadow-md shadow-violet-600/20"
                      >
                        ✨ 生成总结
                      </button>
                    </div>
                  )}
                  {summaryState === "summarizing" && (
                    <div className="text-center py-8">
                      <div className="w-14 h-14 mx-auto mb-3 rounded-2xl bg-violet-50 flex items-center justify-center animate-pulse">
                        <svg
                          className="w-7 h-7 text-violet-400"
                          fill="none"
                          viewBox="0 0 24 24"
                          stroke="currentColor"
                          strokeWidth={1.5}
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09z"
                          />
                        </svg>
                      </div>
                      <p className="text-dark-500 text-sm">
                        {summaryMessage || "AI 分析中..."}
                      </p>
                      <p className="text-dark-400 text-xs mt-1">
                        基于 DeepSeek 大模型
                      </p>
                    </div>
                  )}
                  {(summaryState === "streaming" ||
                    summaryState === "done") && (
                    <div>
                      <div className="bg-dark-50 rounded-xl p-4 text-sm text-dark-800 leading-relaxed whitespace-pre-wrap max-h-80 overflow-y-auto">
                        {summaryText}
                        {summaryState === "streaming" && (
                          <span className="inline-block w-2 h-4 bg-violet-600 ml-0.5 animate-pulse align-middle" />
                        )}
                      </div>
                      {summaryState === "done" && (
                        <button
                          onClick={() =>
                            navigator.clipboard.writeText(summaryText)
                          }
                          className="mt-3 flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-dark-500 hover:text-dark-700 bg-white hover:bg-dark-50 border border-dark-200 rounded-lg transition-colors"
                        >
                          <svg
                            className="w-3.5 h-3.5"
                            fill="none"
                            viewBox="0 0 24 24"
                            stroke="currentColor"
                            strokeWidth={1.5}
                          >
                            <path
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              d="M15.666 3.888A2.25 2.25 0 0013.5 2.25h-3c-1.03 0-1.9.693-2.166 1.638m7.332 0c.055.194.084.4.084.612v0a.75.75 0 01-.75.75H9a.75.75 0 01-.75-.75v0c0-.212.03-.418.084-.612m7.332 0c.646.049 1.288.11 1.927.184 1.1.128 1.907 1.077 1.907 2.185V19.5a2.25 2.25 0 01-2.25 2.25H6.75A2.25 2.25 0 014.5 19.5V6.257c0-1.108.806-2.057 1.907-2.185a48.208 48.208 0 011.927-.184"
                            />
                          </svg>
                          复制总结
                        </button>
                      )}
                    </div>
                  )}
                  {summaryState === "error" && (
                    <div className="text-center py-6">
                      <p className="text-red-600 text-sm">{summaryError}</p>
                      <button
                        onClick={handleSummarize}
                        className="mt-3 px-4 py-1.5 text-xs font-medium text-red-600 bg-red-50 hover:bg-red-100 rounded-lg"
                      >
                        重试
                      </button>
                    </div>
                  )}
                </div>
              )}

              {activeTab === "subtitles" &&
                (showContent ? (
                  <>
                    <div ref={listRef}>
                      {segments.map((seg, idx) => (
                        <button
                          key={idx}
                          ref={(el) => {
                            itemRefs.current[idx] = el;
                          }}
                          onClick={() => sync.onSubtitleClick(seg)}
                          className={`w-full text-left px-4 py-2.5 flex gap-3 border-b border-dark-50 transition-all duration-150 hover:bg-blue-50/30 ${
                            idx === sync.activeIndex
                              ? "bg-blue-50 border-l-2 border-l-blue-500"
                              : "border-l-2 border-l-transparent"
                          }`}
                        >
                          <span
                            className={`text-xs font-mono mt-0.5 shrink-0 ${idx === sync.activeIndex ? "text-blue-600 font-semibold" : "text-dark-400"}`}
                          >
                            {formatTime(seg.start)}
                          </span>
                          <span
                            className={`text-sm leading-relaxed ${idx === sync.activeIndex ? "text-blue-800 font-medium" : "text-dark-700"}`}
                          >
                            {seg.text}
                          </span>
                        </button>
                      ))}
                    </div>
                    <div className="px-4 py-3 border-t border-dark-100 flex items-center justify-between text-xs text-dark-400">
                      <span>
                        {language === "zh"
                          ? "中文"
                          : language === "en"
                            ? "English"
                            : "自动识别"}{" "}
                        · {segments.length} 条
                      </span>
                      <button
                        onClick={() => {
                          const vtt =
                            "WEBVTT\n\n" +
                            segments
                              .map(
                                (s, i) =>
                                  `${i + 1}\n${_sec2vtt(s.start)} --> ${_sec2vtt(s.end)}\n${s.text}`,
                              )
                              .join("\n\n");
                          const b = new Blob([vtt], { type: "text/vtt" });
                          const a = document.createElement("a");
                          a.href = URL.createObjectURL(b);
                          a.download = "subtitles.vtt";
                          a.click();
                        }}
                        className="px-3 py-1 text-dark-500 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                      >
                        导出 VTT
                      </button>
                    </div>
                  </>
                ) : (
                  <div className="p-6 text-center">
                    {state === "loading" ? (
                      <div className="flex flex-col items-center gap-3">
                        <span className="inline-block w-8 h-8 border-2 border-blue-200 border-t-blue-500 rounded-full animate-spin" />
                        <p className="text-dark-500 text-sm">
                          {message || "正在提取字幕..."}
                        </p>
                      </div>
                    ) : (
                      <>
                        <div className="w-14 h-14 mx-auto mb-3 rounded-2xl bg-blue-50 flex items-center justify-center">
                          <svg
                            className="w-7 h-7 text-blue-400"
                            fill="none"
                            viewBox="0 0 24 24"
                            stroke="currentColor"
                            strokeWidth={1.5}
                          >
                            <path
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              d="M19.114 5.636a9 9 0 010 12.728M16.463 8.288a5.25 5.25 0 010 7.424M6.75 8.25l4.72-4.72a.75.75 0 011.28.53v15.88a.75.75 0 01-1.28.53l-4.72-4.72H4.51c-.88 0-1.704-.507-1.938-1.354A9.009 9.009 0 012.25 12c0-.83.112-1.633.322-2.396C2.806 8.756 3.63 8.25 4.51 8.25H6.75z"
                            />
                          </svg>
                        </div>
                        <p className="text-dark-500 text-sm mb-1">
                          提取视频字幕，支持自动高亮与点击跳转
                        </p>
                        <p className="text-dark-400 text-xs mb-4">
                          优先使用官方字幕，无字幕时自动语音识别
                        </p>
                        <div className="flex items-center justify-center gap-2">
                          <input
                            type="text"
                            value={prompt}
                            onChange={(e) => setPrompt(e.target.value)}
                            placeholder="上下文提示（可选）：AI, 编程, 流量…"
                            className="px-3 py-2 text-xs border border-dark-200 rounded-lg w-52 focus:border-blue-400 outline-none focus:ring-1 focus:ring-blue-100 transition-all"
                          />
                          <button
                            onClick={handleTranscribe}
                            className="px-4 py-2 text-xs font-medium text-white bg-gradient-to-r from-cyan-500 to-blue-600 rounded-xl shadow-md shadow-blue-500/20 hover:from-cyan-600 hover:to-blue-700 active:scale-95 transition-all"
                          >
                            提取字幕
                          </button>
                        </div>
                        {state === "error" && (
                          <p className="mt-3 text-red-500 text-xs">{error}</p>
                        )}
                      </>
                    )}
                  </div>
                ))}
            </div>
          </>
        )}

        {/* 无视频源时的提示 */}
        {!isBili && !videoSrc && (
          <div className="p-8 text-center text-dark-400 text-sm border-t border-dark-100">
            下载视频后即可播放并查看同步字幕
          </div>
        )}
      </div>

      {/* ═══ 画中画 Sticky ═══ */}
      {isPiP && showContent && (
        <div className="fixed bottom-4 right-4 z-50 w-72 bg-black rounded-xl shadow-2xl overflow-hidden border border-dark-700 animate-slide-up">
          <div className="flex items-center justify-between px-3 py-1.5 bg-dark-800 text-white text-xs">
            <span className="truncate">画中画 · 字幕同步中</span>
            <button
              onClick={() => setIsPiP(false)}
              className="text-dark-400 hover:text-white"
            >
              {Icon.close}
            </button>
          </div>
          {isBili && bvid ? (
            <iframe
              src={`//player.bilibili.com/player.html?bvid=${bvid}&page=1&autoplay=0`}
              className="w-full aspect-video border-0"
              allow="autoplay"
              sandbox="allow-scripts allow-same-origin"
            />
          ) : videoSrc ? (
            <video
              ref={videoRef}
              src={videoSrc}
              controls
              crossOrigin="anonymous"
              onTimeUpdate={onVideoTimeUpdate}
              className="w-full"
            />
          ) : null}
        </div>
      )}
    </div>
  );
}
