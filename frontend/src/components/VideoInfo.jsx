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

export default function VideoInfo({ data, onDownloadComplete }) {
  const [selectedFormat, setSelectedFormat] = useState("best");

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

  const handleDownload = async () => {
    setDownloadState("downloading");
    setProgress(null);

    try {
      const res = await fetch("/api/download", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          url: data.webpage_url,
          format_id: selectedFormat,
        }),
      });

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
                setDownloadState("completed");
                setDownloadFilename(eventData.filename || "");
                if (onDownloadComplete) {
                  onDownloadComplete(data, eventData.filename || "");
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
    if (downloadFilename) {
      window.open(
        `/api/file/${encodeURIComponent(downloadFilename)}`,
        "_blank",
      );
    }
  };

  return (
    <div className="mt-8 animate-fade-in-up">
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

            {/* 下载按钮 */}
            {downloadState !== "completed" ? (
              <button
                onClick={handleDownload}
                disabled={downloadState === "downloading"}
                className="btn-primary text-sm !px-5 !py-2.5"
              >
                {downloadState === "downloading" ? (
                  <span className="flex items-center gap-2">
                    <svg
                      className="animate-spin w-4 h-4"
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
                      ></circle>
                      <path
                        className="opacity-75"
                        fill="currentColor"
                        d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
                      ></path>
                    </svg>
                    下载中...
                  </span>
                ) : (
                  <span className="flex items-center gap-2">
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
                    下载视频
                  </span>
                )}
              </button>
            ) : (
              <button
                onClick={handleDownloadFile}
                className="btn-primary text-sm !px-5 !py-2.5 !bg-green-500 !shadow-green-500/25 hover:!bg-green-600"
              >
                <span className="flex items-center gap-2">
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
      </div>

      {/* 格式选择 */}
      {availableFormats.length > 0 && (
        <div className="mt-4 card p-5">
          <h3 className="text-sm font-semibold text-dark-700 mb-3">
            选择画质 / 格式
          </h3>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2">
            {availableFormats.map((f) => {
              const isSelected = selectedFormat === f.format_id;
              const height = f.resolution
                ? parseInt(f.resolution.replace("p", ""))
                : 0;
              const sizeStr = formatSize(f.filesize || f.filesize_approx || 0);
              return (
                <button
                  key={f.format_id}
                  onClick={() => setSelectedFormat(f.format_id)}
                  disabled={downloadState === "downloading"}
                  className={`relative flex flex-col items-center justify-center p-3 rounded-xl border text-center transition-all duration-200 ${
                    isSelected
                      ? "border-primary-400 bg-primary-50 shadow-sm"
                      : "border-dark-200 bg-white hover:border-dark-300 hover:bg-dark-25"
                  } disabled:opacity-50 disabled:cursor-not-allowed`}
                >
                  <span
                    className={`text-sm font-bold ${
                      isSelected ? "text-primary-700" : "text-dark-700"
                    }`}
                  >
                    {height ? `${height}p` : f.format_note || f.ext}
                  </span>
                  <span className="text-xs text-dark-400 mt-0.5">
                    {f.ext?.toUpperCase()}
                    {f.has_audio ? " · 有音" : " · 无声"}
                  </span>
                  {sizeStr !== "未知" && (
                    <span className="text-xs text-dark-300 mt-0.5">
                      {sizeStr}
                    </span>
                  )}
                  {isSelected && (
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
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* 字幕转录 / AI总结（统一 Tab 面板） */}
      <VideoSubtitle
        videoSrc={
          downloadFilename
            ? `/api/file/${encodeURIComponent(downloadFilename)}`
            : null
        }
        originalUrl={data.webpage_url}
      />
    </div>
  );
}
