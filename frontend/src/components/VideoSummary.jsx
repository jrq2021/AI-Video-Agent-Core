import { useState, useEffect, useRef } from "react";

function formatSummaryText(rawText) {
  // 处理换行和格式
  return rawText.replace(/\n{3,}/g, "\n\n").trim();
}

export default function VideoSummary({ videoUrl }) {
  const [state, setState] = useState("idle"); // idle | extracting | asr | summarizing | streaming | done | error
  const [message, setMessage] = useState("");
  const [summaryText, setSummaryText] = useState("");
  const [error, setError] = useState("");
  const summaryRef = useRef(null);
  const abortRef = useRef(null);

  const handleSummarize = () => {
    setState("extracting");
    setSummaryText("");
    setError("");

    const controller = new AbortController();
    abortRef.current = controller;

    fetch("/api/summarize", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url: videoUrl }),
      signal: controller.signal,
    })
      .then((res) => {
        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";

        let hasError = false;
        function read() {
          reader
            .read()
            .then(({ done, value }) => {
              if (done) {
                if (!hasError) setState("done");
                return;
              }

              buffer += decoder.decode(value, { stream: true });
              const lines = buffer.split("\n");
              buffer = lines.pop() || "";

              for (const line of lines) {
                if (line.startsWith("data: ")) {
                  try {
                    const data = JSON.parse(line.slice(6));

                    if (data.status === "extracting") {
                      setMessage(data.message);
                    } else if (data.status === "asr_downloading") {
                      setState("asr");
                      setMessage(data.message);
                    } else if (data.status === "asr_transcribing") {
                      setState("asr");
                      setMessage(data.message);
                    } else if (data.status === "extracted") {
                      setState("summarizing");
                      setMessage(data.message);
                    } else if (data.status === "summarizing") {
                      setMessage(data.message);
                    } else if (data.status === "streaming") {
                      setState("streaming");
                      setSummaryText((prev) => prev + data.content);
                    } else if (data.status === "done") {
                      setState("done");
                    } else if (data.status === "error") {
                      setState("error");
                      setError(data.message);
                      hasError = true;
                    }
                  } catch {}
                }
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
          setError("网络错误，请确保后端服务已启动");
        }
      });
  };

  // 自动滚动
  useEffect(() => {
    if (summaryRef.current && state === "streaming") {
      summaryRef.current.scrollTop = summaryRef.current.scrollHeight;
    }
  }, [summaryText, state]);

  const handleCopy = () => {
    navigator.clipboard.writeText(summaryText).then(() => {
      // 临时提示
      const btn = document.getElementById("copy-summary-btn");
      if (btn) {
        const orig = btn.textContent;
        btn.textContent = "已复制 ✓";
        setTimeout(() => {
          btn.textContent = orig;
        }, 1500);
      }
    });
  };

  return (
    <div className="mt-8 animate-fade-in-up">
      <div className="card overflow-hidden">
        {/* 标题栏 */}
        <div className="px-5 py-4 border-b border-dark-100 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-violet-500 to-purple-600 flex items-center justify-center">
              <svg
                className="w-5 h-5 text-white"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={1.5}
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09zM18.259 8.715L18 9.75l-.259-1.035a3.375 3.375 0 00-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 002.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 002.455 2.456L21.75 6l-1.036.259a3.375 3.375 0 00-2.455 2.456z"
                />
              </svg>
            </div>
            <div>
              <h3 className="font-semibold text-dark-900 text-sm">
                AI 智能总结
              </h3>
              <p className="text-xs text-dark-400">
                基于 DeepSeek 大模型分析视频字幕
              </p>
            </div>
          </div>

          {state === "idle" && (
            <button
              onClick={handleSummarize}
              className="px-4 py-2 bg-violet-600 text-white rounded-xl font-medium text-sm
                       hover:bg-violet-700 active:scale-95 transition-all duration-200
                       shadow-md shadow-violet-600/20"
            >
              ✨ 生成总结
            </button>
          )}

          {(state === "extracting" ||
            state === "summarizing" ||
            state === "asr") && (
            <div className="flex items-center gap-2 text-violet-600">
              <div className="w-4 h-4 border-2 border-violet-200 border-t-violet-600 rounded-full animate-spin"></div>
              <span className="text-xs font-medium">
                {message || "处理中..."}
              </span>
            </div>
          )}
        </div>

        {/* 内容区域 */}
        <div className="p-5">
          {state === "idle" && (
            <div className="text-center py-8">
              <div className="w-16 h-16 mx-auto mb-3 rounded-2xl bg-violet-50 flex items-center justify-center">
                <svg
                  className="w-8 h-8 text-violet-400"
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
                点击上方按钮，让 AI 帮你快速了解视频内容
              </p>
              <p className="text-dark-400 text-xs mt-1">
                自动提取字幕 · 智能分析要点 · 省时高效
              </p>
            </div>
          )}

          {state === "asr" && (
            <div className="text-center py-8">
              <div className="w-16 h-16 mx-auto mb-3 rounded-2xl bg-orange-50 flex items-center justify-center animate-pulse">
                <svg
                  className="w-8 h-8 text-orange-400"
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
              <p className="text-dark-500 text-sm">
                {message || "正在进行语音识别..."}
              </p>
              <p className="text-dark-400 text-xs mt-1">
                字幕不可用，自动启用 Whisper 语音转文字
              </p>
            </div>
          )}

          {(state === "streaming" || state === "done") && (
            <div>
              <div
                ref={summaryRef}
                className="bg-dark-50 rounded-xl p-4 text-sm text-dark-800 leading-relaxed whitespace-pre-wrap max-h-96 overflow-y-auto"
              >
                {formatSummaryText(summaryText)}
                {state === "streaming" && (
                  <span className="inline-block w-2 h-4 bg-violet-600 ml-0.5 animate-pulse"></span>
                )}
              </div>

              {state === "done" && (
                <div className="flex items-center gap-2 mt-3">
                  <button
                    id="copy-summary-btn"
                    onClick={handleCopy}
                    className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-dark-500 hover:text-dark-700 bg-white hover:bg-dark-50 border border-dark-200 rounded-lg transition-colors"
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
                  <span className="text-xs text-green-600 font-medium flex items-center gap-1">
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
                        d="M4.5 12.75l6 6 9-13.5"
                      />
                    </svg>
                    生成完毕
                  </span>
                </div>
              )}
            </div>
          )}

          {state === "error" && (
            <div className="p-4 bg-red-50 border border-red-100 rounded-xl text-red-600 text-sm">
              <p className="font-medium">总结失败</p>
              <p className="mt-1 text-xs text-red-500">{error}</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
