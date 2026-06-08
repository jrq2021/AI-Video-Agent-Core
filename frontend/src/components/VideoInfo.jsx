import { useState } from "react";
import DownloadProgress from "./DownloadProgress";
import VideoSubtitle from "./VideoSubtitle";

function formatDuration(seconds) {
  if (!seconds) return "未知";
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  if (h > 0)
    return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  return `${m}:${String(s).padStart(2, "0")}`;
}

function formatCount(num) {
  if (!num) return "0";
  if (num >= 10000) return (num / 10000).toFixed(1) + "万";
  if (num >= 1000) return (num / 1000).toFixed(1) + "k";
  return num.toString();
}

function formatSize(bytes) {
  if (!bytes) return "未知";
  if (bytes >= 1073741824) return (bytes / 1073741824).toFixed(1) + " GB";
  if (bytes >= 1048576) return (bytes / 1048576).toFixed(1) + " MB";
  if (bytes >= 1024) return (bytes / 1024).toFixed(0) + " KB";
  return bytes + " B";
}

export default function VideoInfo({
  data,
  user,
  quota,
  checkQuota,
  consumeQuota,
  openUpgrade,
  onDownloadComplete,
}) {
  const [selectedFormat, setSelectedFormat] = useState("best");

  // ── 额度检查 ──
  const downloadRemaining = quota
    ? quota.daily_downloads_limit - quota.daily_downloads_used
    : null;
  const isFreeUser = quota?.plan === "free";

  // 通过后端代理加载缩略图（绕过防盗链）
  const thumbnailUrl = data.thumbnail
    ? `/api/thumbnail?url=${encodeURIComponent(data.thumbnail)}`
    : null;
  const [downloadState, setDownloadState] = useState(null); // null | 'downloading' | 'completed' | 'error'
  const [progress, setProgress] = useState(null);
  const [downloadFilename, setDownloadFilename] = useState("");

  // 筛选可用格式
  const availableFormats = data.formats
    .filter((f) => f.vcodec !== "none" || f.acodec !== "none")
    .filter((f) => f.ext && f.ext !== "mhtml")
    .reduce((acc, f) => {
      const key = f.resolution || f.format_note || f.ext;
      if (
        !acc.find(
          (x) =>
            x.resolution === f.resolution &&
            x.ext === f.ext &&
            Math.abs((x.tbr || 0) - (f.tbr || 0)) < 50,
        )
      ) {
        acc.push(f);
      }
      return acc;
    }, [])
    .sort((a, b) => {
      const getHeight = (f) => parseInt(f.resolution?.replace("p", "") || "0");
      return getHeight(b) - getHeight(a);
    })
    .slice(0, 15);

  const triggerBrowserDownload = (filename) => {
    if (!filename) return;
    const link = document.createElement("a");
    link.href = `/api/file/${encodeURIComponent(filename)}`;
    link.download = filename;
    link.style.display = "none";
    document.body.appendChild(link);
    link.click();
    link.remove();
  };

  const handleDownload = async (formatId = selectedFormat) => {
    // ── 前端额度预检 ──
    if (checkQuota) {
      const check = checkQuota("download");
      if (!check.allowed) {
        if (check.needLogin && openUpgrade) {
          openUpgrade(check.reason); // 游客 → 弹出登录引导
        } else if (check.needUpgrade && openUpgrade) {
          openUpgrade(check.reason); // 额度用完 → 弹出升级引导
        }
        return;
      }
    }

    setDownloadState("downloading");
    setDownloadFilename("");
    setProgress({ percent: 0, speed: 0, eta: 0, downloaded: 0, total: 0 });

    try {
      const token = localStorage.getItem("auth_token");
      const res = await fetch("/api/download", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({
          url: data.webpage_url,
          format_id: formatId,
        }),
      });

      // 处理 429 额度超限
      if (res.status === 429) {
        const errData = await res.json();
        const detail = JSON.parse(errData.detail || "{}");
        setDownloadState("error");
        setProgress({ error: detail.message || "额度不足，请升级会员" });
        if (openUpgrade) openUpgrade(detail.message);
        return;
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() || "";

        for (const line of lines) {
          if (line.startsWith("data: ")) {
            try {
              const eventData = JSON.parse(line.slice(6));
              if (eventData.status === "downloading") {
                setProgress({
                  percent: parseFloat(eventData.percent) || 0,
                  speed: eventData.speed,
                  eta: eventData.eta,
                  downloaded: eventData.downloaded_bytes,
                  total: eventData.total_bytes,
                });
              } else if (
                eventData.status === "finished" ||
                eventData.status === "completed"
              ) {
                const filename = eventData.filename || "";
                setDownloadState("completed");
                setProgress((current) => ({ ...(current || {}), percent: 100 }));
                setDownloadFilename(filename);
                triggerBrowserDownload(filename);
                // ── 下载成功后刷新额度 ──
                if (consumeQuota) consumeQuota();
                if (onDownloadComplete) {
                  onDownloadComplete(data, filename);
                }
              } else if (eventData.status === "error") {
                setDownloadState("error");
                setProgress({ error: eventData.message });
              }
            } catch {}
          }
        }
      }
    } catch (e) {
      setDownloadState("error");
      setProgress({ error: "下载失败，请重试" });
    }
  };

  const handleDownloadFile = () => {
    triggerBrowserDownload(downloadFilename);
  };

  return (
    <div className="animate-fade-in-up">
      {/* 视频信息卡片 */}
      <div className="card overflow-hidden">
        {/* 缩略图和基本信息 */}
        <div className="flex flex-col sm:flex-row gap-5 p-5">
          {thumbnailUrl && (
            <div className="relative shrink-0 w-full sm:w-56 aspect-video sm:aspect-auto rounded-xl overflow-hidden bg-dark-100">
              <img
                src={thumbnailUrl}
                alt={data.title}
                className="w-full h-full object-cover"
              />
              {data.duration > 0 && (
                <span className="absolute bottom-2 right-2 px-2 py-0.5 bg-black/70 text-white text-xs rounded-md font-medium">
                  {formatDuration(data.duration)}
                </span>
              )}
            </div>
          )}

          <div className="flex-1 min-w-0">
            <h2 className="text-lg font-bold text-dark-900 leading-snug mb-2 line-clamp-2">
              {data.title}
            </h2>

            <div className="flex flex-wrap items-center gap-3 text-sm text-dark-500 mb-3">
              {data.uploader && (
                <span className="flex items-center gap-1">
                  <svg
                    className="w-4 h-4"
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
                  {data.uploader}
                </span>
              )}
              {data.view_count > 0 && (
                <span className="flex items-center gap-1">
                  <svg
                    className="w-4 h-4"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                    strokeWidth={1.5}
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="M2.036 12.322a1.012 1.012 0 010-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178z"
                    />
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"
                    />
                  </svg>
                  {formatCount(data.view_count)}
                </span>
              )}
              {data.extractor && (
                <span className="px-2 py-0.5 bg-dark-50 text-dark-400 rounded-md text-xs font-medium">
                  {data.extractor}
                </span>
              )}
            </div>

            {data.description && (
              <p className="text-sm text-dark-400 line-clamp-2 mb-3">
                {data.description}
              </p>
            )}
          </div>
        </div>

        {/* 下载进度 */}
        {downloadState === "downloading" && progress && (
          <DownloadProgress progress={progress} />
        )}

        {downloadState === "error" && progress?.error && (
          <div className="px-5 pb-4">
            <p className="text-red-500 text-sm">{progress.error}</p>
          </div>
        )}

        {downloadState === "completed" && downloadFilename && (
          <div className="px-5 pb-4">
            <button
              onClick={handleDownloadFile}
              className="w-full py-2.5 bg-gradient-to-r from-blue-600 to-indigo-500 text-white rounded-xl font-medium text-sm hover:from-blue-700 hover:to-indigo-600 active:scale-[0.98] transition-all shadow-lg shadow-blue-500/20"
            >
              <span className="flex items-center justify-center gap-2">
                <svg
                  className="w-4 h-4"
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
                保存到本地
              </span>
            </button>
          </div>
        )}
      </div>

      {/* 格式选择 — 点击即下载 */}
      {availableFormats.length > 0 && (
        <div className="mt-4 card p-5">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-semibold text-dark-700">
              选择画质下载
            </h3>
            {/* ── 额度指示器 ── */}
            {user && downloadRemaining !== null && (
              <div className="flex items-center gap-2">
                <span className="text-xs text-dark-400">今日剩余</span>
                <span
                  className={`px-2 py-0.5 rounded-full text-xs font-bold ${
                    downloadRemaining <= 1
                      ? "bg-red-100 text-red-600"
                      : downloadRemaining <= 3
                        ? "bg-amber-100 text-amber-700"
                        : "bg-green-100 text-green-700"
                  }`}
                >
                  {downloadRemaining} 次
                </span>
                {isFreeUser && (
                  <button
                    onClick={() => openUpgrade?.("兑换会员码解锁每日 30 次下载")}
                    className="text-xs text-primary-600 hover:text-primary-700 font-medium underline"
                  >
                    兑换码
                  </button>
                )}
              </div>
            )}
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
            {availableFormats.map((f) => {
              const isSelected = selectedFormat === f.format_id;
              const isDownloading =
                downloadState === "downloading" && isSelected;
              const height = f.resolution
                ? parseInt(f.resolution.replace("p", ""))
                : 0;
              const sizeStr = formatSize(f.filesize || f.filesize_approx || 0);
              const hasAudio =
                f.has_audio === true ||
                (f.acodec && f.acodec !== "none");
              return (
                <button
                  key={f.format_id}
                  onClick={() => {
                    if (downloadState === "downloading") return;
                    setSelectedFormat(f.format_id);
                    handleDownload(f.format_id);
                  }}
                  disabled={downloadState === "downloading"}
                  className={`relative flex flex-col items-center justify-center p-3 rounded-xl border text-center transition-all duration-300 group ${
                    isSelected
                      ? "border-primary-400 bg-primary-50/80 backdrop-blur-sm ring-1 ring-primary-200 shadow-md shadow-blue-500/10"
                      : "border-dark-200/60 bg-white/70 backdrop-blur-sm hover:border-primary-300 hover:bg-primary-50/40 hover:shadow-md hover:shadow-blue-500/5"
                  } disabled:opacity-50 disabled:cursor-not-allowed`}
                >
                  {isDownloading && (
                    <svg
                      className="absolute top-1.5 right-1.5 w-4 h-4 animate-spin text-primary-500"
                      fill="none"
                      viewBox="0 0 24 24"
                    >
                      <circle
                        className="opacity-25"
                        cx="12"
                        cy="12"
                        r="10"
                        stroke="currentColor"
                        strokeWidth="4"
                      />
                      <path
                        className="opacity-75"
                        fill="currentColor"
                        d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
                      />
                    </svg>
                  )}
                  {!isDownloading && isSelected && (
                    <svg
                      className="absolute top-1.5 right-1.5 w-4 h-4 text-primary-500"
                      fill="currentColor"
                      viewBox="0 0 20 20"
                    >
                      <path
                        fillRule="evenodd"
                        d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
                        clipRule="evenodd"
                      />
                    </svg>
                  )}
                  {!isDownloading && !isSelected && (
                    <svg
                      className="absolute top-1.5 right-1.5 w-4 h-4 text-dark-300 opacity-0 group-hover:opacity-100 transition-opacity"
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
                  )}
                  <span
                    className={`text-sm font-bold ${
                      isSelected ? "text-primary-700" : "text-dark-700"
                    }`}
                  >
                    {height ? `${height}p` : f.format_note || f.ext}
                  </span>
                  <span className="text-xs text-dark-400 mt-0.5">
                    {f.ext?.toUpperCase()}
                    {hasAudio ? " · 有音" : " · 无声"}
                  </span>
                  {sizeStr !== "未知" && (
                    <span className="text-xs text-dark-300 mt-0.5">
                      {sizeStr}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
