import { useState, useEffect } from "react";

const STORAGE_KEY = "video_dl_history";

export function loadHistory() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]");
  } catch {
    return [];
  }
}

export function saveHistory(items) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
}

export function addHistoryItem(data, filename) {
  const history = loadHistory();
  // 去重
  const idx = history.findIndex((h) => h.id === data.id);
  const item = {
    id: data.id,
    title: data.title,
    thumbnail: data.thumbnail,
    uploader: data.uploader,
    extractor: data.extractor,
    duration: data.duration_string,
    webpage_url: data.webpage_url || "",
    downloadedAt: new Date().toLocaleString("zh-CN"),
    filename,
  };
  if (idx >= 0) {
    history[idx] = { ...history[idx], ...item };
  } else {
    history.unshift(item);
  }
  // 最多保存 50 条
  if (history.length > 50) history.length = 50;
  saveHistory(history);
  return history;
}

export function clearHistory() {
  localStorage.removeItem(STORAGE_KEY);
}

function formatDuration(s) {
  if (!s) return "";
  return s;
}

export default function DownloadHistory({ onReDownload }) {
  const [history, setHistory] = useState([]);

  useEffect(() => {
    setHistory(loadHistory());
    // 监听 storage 变化（跨标签页同步）
    const onStorage = () => setHistory(loadHistory());
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  const handleClear = () => {
    clearHistory();
    setHistory([]);
  };

  if (history.length === 0) return null;

  return (
    <section className="py-12 bg-dark-50/30">
      <div className="max-w-3xl mx-auto px-4">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-xl font-bold text-dark-900 flex items-center gap-2">
            <svg
              className="w-5 h-5 text-primary-500"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={1.5}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z"
              />
            </svg>
            下载历史
          </h2>
          <button
            onClick={handleClear}
            className="text-xs text-dark-400 hover:text-red-500 transition-colors"
          >
            清空记录
          </button>
        </div>

        <div className="space-y-2">
          {history.map((item) => (
            <div
              key={item.id}
              className="flex items-center gap-4 bg-white rounded-2xl p-4 border border-dark-100 hover:border-dark-200 hover:shadow-sm transition-all duration-200"
            >
              {/* Thumbnail */}
              {item.thumbnail && (
                <div className="shrink-0 w-28 aspect-video rounded-lg overflow-hidden bg-dark-100">
                  <img
                    src={`/api/thumbnail?url=${encodeURIComponent(item.thumbnail)}`}
                    alt={item.title}
                    className="w-full h-full object-cover"
                    loading="lazy"
                  />
                  {item.duration && (
                    <span className="absolute bottom-1 right-1 px-1.5 py-0.5 bg-black/70 text-white text-[10px] rounded font-medium">
                      {formatDuration(item.duration)}
                    </span>
                  )}
                </div>
              )}

              {/* Info */}
              <div className="flex-1 min-w-0">
                <h3 className="text-sm font-semibold text-dark-800 truncate">
                  {item.title}
                </h3>
                <div className="flex items-center gap-2 mt-1 text-xs text-dark-400">
                  {item.uploader && <span>{item.uploader}</span>}
                  {item.extractor && (
                    <span className="px-1.5 py-0.5 bg-dark-50 rounded text-[10px] font-medium text-dark-400">
                      {item.extractor}
                    </span>
                  )}
                </div>
                <p className="text-[11px] text-dark-300 mt-1">
                  {item.downloadedAt}
                </p>
              </div>

              {/* Action */}
              <button
                onClick={() => onReDownload?.(item)}
                className="shrink-0 px-4 py-2 bg-primary-50 text-primary-600 rounded-xl text-xs font-medium hover:bg-primary-100 active:scale-95 transition-all duration-200"
              >
                重新下载
              </button>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
