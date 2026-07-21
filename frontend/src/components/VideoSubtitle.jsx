import { useState, useRef, useEffect, useCallback, useMemo } from "react";
import { marked } from "marked";
import useVideoSync from "../hooks/useVideoSync";
import MindMapView from "./MindMapView";

/* ── 配置 marked ────────────────────────────────────────────────── */
marked.setOptions({ breaks: true, gfm: true });
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
function _sec2srt(s) {
  const h = Math.floor(s / 3600),
    m = Math.floor((s % 3600) / 60),
    sec = Math.floor(s % 60),
    ms = Math.floor((s % 1) * 1000);
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")},${String(ms).padStart(3, "0")}`;
}
function downloadSubtitleFile(content, filename) {
  const blob = new Blob([content], { type: "text/plain;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
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
  mindmap: (
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
        d="M9.348 14.652a3.75 3.75 0 010-5.304m5.304 0a3.75 3.75 0 010 5.304m-7.425 2.121a6.75 6.75 0 010-9.546m9.546 0a6.75 6.75 0 010 9.546M5.106 18.894c-3.808-3.807-3.808-9.98 0-13.788m13.788 0c3.808 3.807 3.808 9.98 0 13.788M12 12h.008v.008H12V12zm.375 0a.375.375 0 11-.75 0 .375.375 0 01.75 0z"
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

export default function VideoSubtitle({
  videoSrc,
  originalUrl,
  user,
  quota,
  checkQuota,
  consumeQuota,
  openUpgrade,
  initialArtifacts,
  onArtifactsChange,
}) {
  const bvid = extractBvid(originalUrl);
  const isBili = isBilibiliUrl(originalUrl);

  // ── 额度信息 ──
  const summarizeRemaining = quota
    ? quota.daily_summaries_limit - quota.daily_summaries_used
    : null;
  const isFreeUser = quota?.plan === "free";
  const canExportMindmap = quota?.can_export_mindmap ?? false;

  // ── 全局共享：视频基础数据（一次解析，多处复用）──
  const [videoData, setVideoData] = useState(null); // { title, subtitles }
  const [parseState, setParseState] = useState("idle"); // idle|loading|done|error
  const [parseMessage, setParseMessage] = useState("");
  const parsePromiseRef = useRef(null);
  const subtitlesCacheRef = useRef(""); // 解决异步闭包中 stale state 问题
  const titleCacheRef = useRef("");     // 同上，缓存标题
  const hasParsedRef = useRef(false);   // 标记是否已完成解析（即使无字幕）

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
  const [extractedSubtitles, setExtractedSubtitles] = useState("");
  const [mindmapData, setMindmapData] = useState("");
  const [mindmapState, setMindmapState] = useState("idle"); // idle|loading|done|error
  const [mindmapError, setMindmapError] = useState("");
  const summaryTextRef = useRef("");

  // ── 播放器引用 ──
  const videoRef = useRef(null);
  const iframeRef = useRef(null);
  const listRef = useRef(null);
  const itemRefs = useRef({});
  const abortRef = useRef(null);

  const persistArtifacts = useCallback(
    (artifacts) => {
      if (!onArtifactsChange) return;
      Promise.resolve(onArtifactsChange(artifacts)).catch(() => {});
    },
    [onArtifactsChange],
  );

  /* ──── 更换视频 URL → 清空所有缓存 ──── */
  useEffect(() => {
    const restoredSubtitles = initialArtifacts?.subtitles || "";
    const restoredSegments = Array.isArray(initialArtifacts?.segments)
      ? initialArtifacts.segments
      : [];
    const restoredSummary = initialArtifacts?.summary_text || "";
    const restoredMindmap = initialArtifacts?.mindmap_text || "";
    const restoredTitle = initialArtifacts?.title || "";

    setVideoData(
      restoredSubtitles
        ? { title: restoredTitle, subtitles: restoredSubtitles }
        : null,
    );
    setParseState(restoredSubtitles || restoredSegments.length ? "done" : "idle");
    setParseMessage("");
    parsePromiseRef.current = null;
    subtitlesCacheRef.current = restoredSubtitles;
    titleCacheRef.current = restoredTitle;
    hasParsedRef.current = Boolean(restoredSubtitles || restoredSegments.length);
    setState(restoredSegments.length ? "done" : "idle");
    setSegments(restoredSegments);
    setLanguage(initialArtifacts?.language || "");
    setExtractedSubtitles(restoredSubtitles);
    setError("");
    setSummaryState(restoredSummary ? "done" : "idle");
    setSummaryText(restoredSummary);
    summaryTextRef.current = restoredSummary;
    setSummaryError("");
    setMindmapState(restoredMindmap ? "done" : "idle");
    setMindmapData(restoredMindmap);
    setMindmapError("");
  }, [originalUrl, initialArtifacts]);

  /* ──── 核心保障函数：确保视频字幕已解析并缓存 ──── */
  const ensureVideoData = useCallback(async () => {
    // 命中缓存：已解析过（无论有无字幕）或有字幕数据
    if (hasParsedRef.current || videoData?.subtitles) return;

    // 已有请求在进行中 → 等待同一个 Promise
    if (parsePromiseRef.current) {
      await parsePromiseRef.current;
      return;
    }

    // 发起新请求
    parsePromiseRef.current = (async () => {
      setParseState("loading");
      setParseMessage("正在解析视频与提取字幕...");
      try {
        const res = await fetch("/api/video/parse", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ url: originalUrl }),
        });
        const json = await res.json();
        if (!json.success) throw new Error(json.detail || "解析失败");

        const data = json.data;
        setVideoData({
          title: data.title,
          subtitles: data.subtitles,
        });
        setExtractedSubtitles(data.subtitles);
        subtitlesCacheRef.current = data.subtitles;
        titleCacheRef.current = data.title || "";
        hasParsedRef.current = true;
        // 如果后端返回了带时间轴的分段，直接使用
        if (data.segments && data.segments.length > 0) {
          setSegments(data.segments);
          setLanguage(data.language || "");
          setState("done");
        }
        persistArtifacts({
          subtitles: data.subtitles || "",
          segments: data.segments || [],
          language: data.language || "",
          subtitle_type: data.subtitle_type || "",
        });
        setParseState("done");
      } catch (err) {
        setParseState("error");
        setParseMessage(err.message);
        throw err;
      } finally {
        parsePromiseRef.current = null;
      }
    })();

    await parsePromiseRef.current;
  }, [videoData, originalUrl, persistArtifacts]);

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

  /* ──── 滚动高亮字幕 ──── */
  useEffect(() => {
    if (sync.activeIndex < 0) return;
    itemRefs.current[sync.activeIndex]?.scrollIntoView({
      behavior: "smooth",
      block: "nearest",
    });
  }, [sync.activeIndex]);

  /* ──── 提取字幕（SSE 获取带时间戳的结构化数据，同时更新共享缓存）──── */
  const handleExtractSubtitles = useCallback(() => {
    if (!originalUrl) return;
    setState("loading");
    setSegments([]);
    setError("");
    setMessage("正在提取字幕...");
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
                    case "transcribing": {
                      setMessage(d.message);
                      break;
                    }
                    case "found_existing": {
                      setSegments(d.segments);
                      setLanguage(d.language || "");
                      setState("done");
                      // 同步到共享缓存
                      const cachedPlain = d.segments
                        .map((s) => s.text)
                        .join(" ");
                      setExtractedSubtitles(cachedPlain);
                      subtitlesCacheRef.current = cachedPlain;
                      setVideoData({ title: titleCacheRef.current, subtitles: cachedPlain });
                      setParseState("done");
                      persistArtifacts({
                        subtitles: cachedPlain,
                        segments: d.segments || [],
                        language: d.language || "",
                        subtitle_type: d.subtitle_type || "existing",
                      });
                      break;
                    }
                    case "done": {
                      setSegments(d.segments);
                      setLanguage(d.language || "");
                      setMessage("");
                      setState("done");
                      setActiveTab("subtitles");
                      // 同步到共享缓存（供总结/导图复用）
                      const plainText =
                        d.segments?.map((s) => s.text).join(" ") || "";
                      setExtractedSubtitles(plainText);
                      subtitlesCacheRef.current = plainText;
                      setVideoData({ title: titleCacheRef.current, subtitles: plainText });
                      setParseState("done");
                      persistArtifacts({
                        subtitles: plainText,
                        segments: d.segments || [],
                        language: d.language || "",
                        subtitle_type: d.subtitle_type || "transcribed",
                      });
                      break;
                    }
                    case "error": {
                      setState("error");
                      setError(d.message);
                      console.error("[字幕]", d.message);
                      break;
                    }
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
  }, [originalUrl, prompt, persistArtifacts]);

  /* ──── AI 总结（复用 ensureVideoData 缓存）──── */
  const handleSummarize = useCallback(async () => {
    // ── 额度预检 ──
    if (checkQuota) {
      const check = checkQuota("summarize");
      if (!check.allowed) {
        if (check.needLogin && openUpgrade) {
          openUpgrade(check.reason);
        } else if (check.needUpgrade && openUpgrade) {
          openUpgrade(check.reason);
        }
        return;
      }
    }

    if (!originalUrl) return;
    try {
      await ensureVideoData();
    } catch {
      return; // parseState 已标记 error，UI 会展示
    }
    // videoData 已就绪（通过 ref 避免 stale closure）
    const subtitles = subtitlesCacheRef.current || videoData?.subtitles || "";
    const title = titleCacheRef.current || videoData?.title || "";
    setSummaryState("summarizing");
    setSummaryText("");
    summaryTextRef.current = "";
    setSummaryError("");
    const ctrl = new AbortController();
    const token = localStorage.getItem("auth_token");
    fetch("/api/video/summarize-text", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify({ subtitles, title }),
      signal: ctrl.signal,
    })
      .then((res) => {
        // 处理 429 额度超限
        if (res.status === 429) {
          return res.json().then((errData) => {
            const detail = JSON.parse(errData.detail || "{}");
            setSummaryState("error");
            setSummaryError(detail.message || "额度不足，请升级会员");
            if (openUpgrade) openUpgrade(detail.message);
          });
        }
        const reader = res.body.getReader();
        const dec = new TextDecoder();
        let buf = "";
        function read() {
          reader
            .read()
            .then(({ done, value }) => {
              if (done) {
                setSummaryState("done");
                if (summaryTextRef.current) {
                  persistArtifacts({ summary_text: summaryTextRef.current });
                }
                // ── 总结成功后刷新额度 ──
                if (consumeQuota) consumeQuota();
                return;
              }
              buf += dec.decode(value, { stream: true });
              for (const line of buf.split("\n")) {
                if (!line.startsWith("data: ")) continue;
                buf = "";
                try {
                  const d = JSON.parse(line.slice(6));
                  if (d.status === "streaming") {
                    summaryTextRef.current += d.content;
                    setSummaryText(summaryTextRef.current);
                  }
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
  }, [
    originalUrl,
    ensureVideoData,
    videoData,
    user,
    checkQuota,
    consumeQuota,
    openUpgrade,
    persistArtifacts,
  ]);

  /* ──── 思维导图（复用 ensureVideoData 缓存）──── */
  const handleGenerateMindmap = useCallback(async () => {
    // ── 额度预检 ──
    if (checkQuota) {
      const check = checkQuota("mindmap");
      if (!check.allowed) {
        if (check.needLogin && openUpgrade) {
          openUpgrade(check.reason);
        } else if (check.needUpgrade && openUpgrade) {
          openUpgrade(check.reason);
        }
        return;
      }
    }

    if (!originalUrl) return;
    try {
      await ensureVideoData();
    } catch {
      return;
    }
    const subtitles = subtitlesCacheRef.current || videoData?.subtitles || "";
    const title = titleCacheRef.current || videoData?.title || "";
    setMindmapState("loading");
    setMindmapError("");
    setMindmapData("");
    const token = localStorage.getItem("auth_token");
    fetch("/api/video/mindmap-text", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify({ subtitles, title }),
    })
      .then((res) => {
        if (res.status === 429) {
          return res.json().then((errData) => {
            const detail = JSON.parse(errData.detail || "{}");
            setMindmapState("error");
            setMindmapError(detail.message || "额度不足，请升级会员");
            if (openUpgrade) openUpgrade(detail.message);
          });
        }
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.json();
      })
      .then((data) => {
        if (!data) return; // 429 already handled
        if (data.success) {
          setMindmapData(data.data.markdown);
          setMindmapState("done");
          persistArtifacts({ mindmap_text: data.data.markdown });
          // ── 生成成功后刷新额度 ──
          if (consumeQuota) consumeQuota();
        } else {
          throw new Error(data.message || "生成失败");
        }
      })
      .catch((err) => {
        setMindmapState("error");
        setMindmapError(err.message);
      });
  }, [
    originalUrl,
    ensureVideoData,
    videoData,
    user,
    checkQuota,
    consumeQuota,
    openUpgrade,
    persistArtifacts,
  ]);

  useEffect(() => () => abortRef.current?.abort(), []);

  /* ──── 渲染 ──── */
  if (!originalUrl)
    return (
      <div className="mt-6 p-6 bg-dark-50 rounded-2xl text-center text-dark-400 text-sm">
        请先解析视频链接
      </div>
    );

  return (
    <div className="h-full">
      <div className="card overflow-hidden h-full">
        {/* Tab 栏 */}
        <Tabs
          tabs={[
            { key: "summary", label: "核心总结", icon: Icon.sparkles },
            { key: "subtitles", label: "完整字幕", icon: Icon.subtitles },
            { key: "mindmap", label: "思维导图", icon: Icon.mindmap },
          ]}
          active={activeTab}
          onChange={setActiveTab}
        />

        {/* Tab 内容 */}
        <div className="cinematic-scrollbar max-h-[460px] overflow-y-auto">
          {activeTab === "summary" && (
            <div className="p-5">
              {summaryState === "idle" && parseState === "loading" ? (
                <div className="text-center py-8">
                  <div className="w-14 h-14 mx-auto mb-3 rounded-2xl bg-blue-50 flex items-center justify-center animate-pulse">
                    <span className="inline-block w-7 h-7 border-2 border-blue-200 border-t-blue-400 rounded-full animate-spin" />
                  </div>
                  <p className="text-dark-500 text-sm">{parseMessage}</p>
                  <p className="text-dark-400 text-xs mt-1">
                    解析完成后自动开始总结
                  </p>
                </div>
              ) : (
                summaryState === "idle" && (
                  <div className="text-center py-8">
                    <div className="w-16 h-16 mx-auto mb-4 rounded-2xl bg-gradient-to-br from-blue-50 to-blue-100 flex items-center justify-center shadow-sm animate-float">
                      <svg
                        className="w-8 h-8 text-blue-500"
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
                    <p className="text-dark-600 text-sm font-medium">
                      AI 智能总结
                    </p>
                    <p className="text-dark-400 text-xs mt-1.5 max-w-xs mx-auto">
                      自动提取视频字幕，通过 DeepSeek 大模型生成结构化要点总结
                    </p>
                    {/* ── 额度指示器 ── */}
                    {user && summarizeRemaining !== null && (
                      <div className="mt-3 inline-flex items-center gap-2 px-3 py-1.5 bg-dark-50 rounded-full">
                        <span className="text-xs text-dark-400">今日剩余</span>
                        <span
                          className={`text-xs font-bold ${
                            summarizeRemaining <= 0
                              ? "text-red-500"
                              : "text-green-600"
                          }`}
                        >
                          {summarizeRemaining} 次
                        </span>
                        {isFreeUser && summarizeRemaining <= 0 && (
                          <button
                            onClick={() =>
                              openUpgrade?.("兑换会员码解锁每日 10 次 AI 总结")
                            }
                            className="text-xs text-primary-600 hover:text-primary-700 font-medium underline"
                          >
                            兑换码
                          </button>
                        )}
                      </div>
                    )}
                    <button
                      onClick={handleSummarize}
                      disabled={
                        user &&
                        summarizeRemaining !== null &&
                        summarizeRemaining <= 0
                      }
                      className="relative mt-5 px-6 py-2.5 bg-gradient-to-r from-blue-600 via-blue-500 to-indigo-500 text-white rounded-xl font-medium text-sm hover:from-blue-700 hover:via-blue-600 hover:to-indigo-600 active:scale-95 transition-all shadow-lg shadow-blue-500/25 animate-glow disabled:opacity-50 disabled:cursor-not-allowed disabled:animate-none"
                    >
                      <span className="relative z-10">✨ 生成 AI 总结</span>
                    </button>
                  </div>
                )
              )}
              {summaryState === "summarizing" && (
                <div className="text-center py-8">
                  <div className="w-14 h-14 mx-auto mb-3 rounded-2xl bg-blue-50 flex items-center justify-center animate-pulse">
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
              {(summaryState === "streaming" || summaryState === "done") && (
                <div>
                  <div
                    className="cinematic-scrollbar prose prose-sm max-w-none bg-dark-50 rounded-xl p-4 max-h-80 overflow-y-auto"
                    dangerouslySetInnerHTML={{
                      __html:
                        marked.parse(summaryText || "") +
                        (summaryState === "streaming"
                          ? '<span class="inline-block w-2 h-4 bg-blue-500 ml-0.5 animate-pulse align-middle"></span>'
                          : ""),
                    }}
                  />
                  {summaryState === "done" && (
                    <button
                      onClick={() => navigator.clipboard.writeText(summaryText)}
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

          {activeTab === "mindmap" && (
            <>
              {mindmapState === "idle" && parseState === "loading" ? (
                <div className="p-6 text-center">
                  <div className="w-14 h-14 mx-auto mb-3 rounded-2xl bg-amber-50 flex items-center justify-center animate-pulse">
                    <span className="inline-block w-7 h-7 border-2 border-amber-200 border-t-amber-400 rounded-full animate-spin" />
                  </div>
                  <p className="text-dark-500 text-sm">{parseMessage}</p>
                  <p className="text-dark-400 text-xs mt-1">
                    解析完成后自动生成导图
                  </p>
                </div>
              ) : (
                mindmapState === "idle" && (
                  <div className="p-6 text-center">
                    <div className="w-14 h-14 mx-auto mb-3 rounded-2xl bg-amber-50 flex items-center justify-center">
                      {Icon.mindmap}
                    </div>
                    {/* ── 免费用户思维导图锁定 ── */}
                    {isFreeUser && !canExportMindmap ? (
                      <>
                        <div className="inline-flex items-center gap-1.5 px-3 py-1 mb-3 bg-purple-50 border border-purple-100 rounded-full">
                          <svg
                            className="w-3.5 h-3.5 text-purple-500"
                            fill="currentColor"
                            viewBox="0 0 20 20"
                          >
                            <path
                              fillRule="evenodd"
                              d="M5 9V7a5 5 0 0110 0v2a2 2 0 012 2v5a2 2 0 01-2 2H5a2 2 0 01-2-2v-5a2 2 0 012-2zm8-2v2H7V7a3 3 0 016 0z"
                              clipRule="evenodd"
                            />
                          </svg>
                          <span className="text-xs font-semibold text-purple-700">
                            Pro / Ultra 专属
                          </span>
                        </div>
                        <p className="text-dark-500 text-sm mb-1">
                          思维导图功能需会员码解锁
                        </p>
                        <p className="text-dark-400 text-xs mb-4">
                          兑换 Pro 或 Ultra 会员码后即可将视频内容可视化为思维导图
                        </p>
                        <button
                          onClick={() =>
                            openUpgrade?.("思维导图是 Pro/Ultra 专属功能")
                          }
                          className="px-5 py-2 bg-gradient-to-r from-purple-600 to-purple-500 text-white rounded-xl font-medium text-sm hover:from-purple-700 hover:to-purple-600 active:scale-95 transition-all shadow-md shadow-purple-500/20"
                        >
                          🔓 兑换解锁
                        </button>
                      </>
                    ) : (
                      <>
                        {!summaryText &&
                        !extractedSubtitles &&
                        segments.length === 0 ? (
                          <>
                            <p className="text-dark-500 text-sm mb-1">
                              暂无可用内容
                            </p>
                            <p className="text-dark-400 text-xs">
                              请先在「核心总结」中生成总结，思维导图将自动创建
                            </p>
                          </>
                        ) : (
                          <>
                            <p className="text-dark-500 text-sm mb-1">
                              将视频内容可视化为思维导图
                            </p>
                            <p className="text-dark-400 text-xs mb-4">
                              基于 DeepSeek 大模型自动提炼逻辑结构
                            </p>
                            {/* ── 额度指示器 ── */}
                            {user && summarizeRemaining !== null && (
                              <div className="mb-3 inline-flex items-center gap-2 px-3 py-1.5 bg-dark-50 rounded-full">
                                <span className="text-xs text-dark-400">
                                  今日剩余
                                </span>
                                <span
                                  className={`text-xs font-bold ${summarizeRemaining <= 0 ? "text-red-500" : "text-green-600"}`}
                                >
                                  {summarizeRemaining} 次
                                </span>
                              </div>
                            )}
                            <br />
                            <button
                              onClick={handleGenerateMindmap}
                              disabled={
                                user &&
                                summarizeRemaining !== null &&
                                summarizeRemaining <= 0
                              }
                              className="px-5 py-2 bg-amber-500 text-white rounded-xl font-medium text-sm hover:bg-amber-600 active:scale-95 transition-all shadow-md shadow-amber-500/20 disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                              🧠 生成思维导图
                            </button>
                          </>
                        )}
                      </>
                    )}
                  </div>
                )
              )}
              {mindmapState === "loading" && (
                <div className="p-6 text-center">
                  <div className="w-14 h-14 mx-auto mb-3 rounded-2xl bg-amber-50 flex items-center justify-center animate-pulse">
                    {Icon.mindmap}
                  </div>
                  <p className="text-dark-500 text-sm">AI 正在提炼结构...</p>
                  <p className="text-dark-400 text-xs mt-1">
                    基于 DeepSeek 大模型
                  </p>
                </div>
              )}
              {mindmapState === "done" && (
                <MindMapView markdown={mindmapData} />
              )}
              {mindmapState === "error" && (
                <div className="p-6 text-center">
                  <p className="text-red-600 text-sm">{mindmapError}</p>
                  <button
                    onClick={handleGenerateMindmap}
                    className="mt-3 px-4 py-1.5 text-xs font-medium text-red-600 bg-red-50 hover:bg-red-100 rounded-lg"
                  >
                    重试
                  </button>
                </div>
              )}
            </>
          )}

          {activeTab === "subtitles" &&
            (segments.length > 0 ? (
              <>
                <div
                  ref={listRef}
                  className="cinematic-scrollbar max-h-[400px] overflow-y-auto"
                >
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
                <div className="px-4 py-3 border-t border-dark-100 bg-white flex items-center justify-between text-xs text-dark-400">
                  <span>
                    {language === "zh"
                      ? "中文"
                      : language === "en"
                        ? "English"
                        : "自动识别"}{" "}
                    · {segments.length} 条
                  </span>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => {
                        const srt = segments
                          .map(
                            (s, i) =>
                              `${i + 1}\n${_sec2srt(s.start)} --> ${_sec2srt(s.end)}\n${s.text}`,
                          )
                          .join("\n\n");
                        downloadSubtitleFile(srt, "subtitles.srt");
                      }}
                      className="px-3 py-1 text-dark-500 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                    >
                      导出 SRT
                    </button>
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
                        downloadSubtitleFile(vtt, "subtitles.vtt");
                      }}
                      className="px-3 py-1 text-dark-500 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                    >
                      导出 VTT
                    </button>
                  </div>
                </div>
              </>
            ) : extractedSubtitles ? (
              <div className="p-4">
                <div className="cinematic-scrollbar bg-dark-50 rounded-xl p-4 text-sm text-dark-800 leading-relaxed whitespace-pre-wrap max-h-80 overflow-y-auto">
                  {extractedSubtitles}
                </div>
                <div className="px-4 py-3 flex items-center justify-between text-xs text-dark-400">
                  <button
                    onClick={handleExtractSubtitles}
                    disabled={state === "loading"}
                    className="px-3 py-1 text-blue-600 hover:text-blue-700 hover:bg-blue-50 rounded-lg transition-colors disabled:opacity-50"
                  >
                    {state === "loading"
                      ? "提取中..."
                      : "📝 获取带时间轴的字幕"}
                  </button>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => {
                        downloadSubtitleFile(
                          extractedSubtitles,
                          "subtitles.txt",
                        );
                      }}
                      className="px-3 py-1 text-dark-500 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                    >
                      下载 TXT
                    </button>
                    <button
                      onClick={() => {
                        navigator.clipboard.writeText(extractedSubtitles);
                      }}
                      className="px-3 py-1 text-dark-500 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                    >
                      复制字幕
                    </button>
                  </div>
                </div>
              </div>
            ) : (
              <div className="p-6 text-center">
                {state === "loading" || parseState === "loading" ? (
                  <div className="flex flex-col items-center gap-3">
                    <span className="inline-block w-8 h-8 border-2 border-blue-200 border-t-blue-500 rounded-full animate-spin" />
                    <p className="text-dark-500 text-sm">
                      {parseMessage || message || "正在提取字幕..."}
                    </p>
                  </div>
                ) : (parseState === "error" || state === "error") &&
                  !extractedSubtitles ? (
                  <div className="text-center">
                    <p className="text-red-500 text-sm mb-3">
                      {error || parseMessage}
                    </p>
                    <button
                      onClick={handleExtractSubtitles}
                      className="px-4 py-1.5 text-xs font-medium text-red-600 bg-red-50 hover:bg-red-100 rounded-lg"
                    >
                      重试
                    </button>
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
                        onClick={handleExtractSubtitles}
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
      </div>
    </div>
  );
}
