import { useEffect, useMemo, useRef, useState } from "react";

const STORAGE_KEY = "video_dl_history";
const INITIAL_VISIBLE_COUNT = 6;
const LOAD_MORE_COUNT = 6;
const MAX_HISTORY_COUNT = 80;

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
    const [updated] = history.splice(idx, 1);
    history.unshift(updated);
  } else {
    history.unshift(item);
  }

  if (history.length > MAX_HISTORY_COUNT) history.length = MAX_HISTORY_COUNT;
  saveHistory(history);
  return history;
}

export function clearHistory() {
  localStorage.removeItem(STORAGE_KEY);
}

function formatDuration(value) {
  return value || "";
}

export default function DownloadHistory({ onReDownload }) {
  const [history, setHistory] = useState([]);
  const [query, setQuery] = useState("");
  const [platform, setPlatform] = useState("all");
  const [isPlatformOpen, setIsPlatformOpen] = useState(false);
  const [visibleCount, setVisibleCount] = useState(INITIAL_VISIBLE_COUNT);
  const platformMenuRef = useRef(null);

  useEffect(() => {
    setHistory(loadHistory());
    const onStorage = () => setHistory(loadHistory());
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  const platforms = useMemo(
    () =>
      Array.from(
        new Set(history.map((item) => item.extractor).filter(Boolean)),
      ),
    [history],
  );

  const platformOptions = useMemo(
    () => [
      { value: "all", label: "全部平台" },
      ...platforms.map((name) => ({ value: name, label: name })),
    ],
    [platforms],
  );

  const platformLabel =
    platformOptions.find((option) => option.value === platform)?.label ||
    "全部平台";

  const filteredHistory = useMemo(() => {
    const keyword = query.trim().toLowerCase();
    return history.filter((item) => {
      if (platform !== "all" && item.extractor !== platform) return false;
      if (!keyword) return true;
      return [item.title, item.uploader, item.extractor, item.filename]
        .filter(Boolean)
        .some((value) => value.toLowerCase().includes(keyword));
    });
  }, [history, platform, query]);

  useEffect(() => {
    setVisibleCount(INITIAL_VISIBLE_COUNT);
  }, [platform, query]);

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (!platformMenuRef.current?.contains(event.target)) {
        setIsPlatformOpen(false);
      }
    };
    const handleKeyDown = (event) => {
      if (event.key === "Escape") setIsPlatformOpen(false);
    };
    document.addEventListener("mousedown", handleClickOutside);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, []);

  const visibleItems = filteredHistory.slice(0, visibleCount);
  const hasMore = visibleCount < filteredHistory.length;

  const handleClear = () => {
    clearHistory();
    setHistory([]);
    setQuery("");
    setPlatform("all");
  };

  if (history.length === 0) return null;

  return (
    <section className="py-10 bg-dark-50/20">
      <div className="max-w-7xl mx-auto px-4">
        <div className="card p-5 md:p-6">
          <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
            <div className="flex items-start gap-3">
              <span className="mt-0.5 flex h-10 w-10 items-center justify-center rounded-2xl bg-primary-50 text-primary-600">
                <svg
                  className="h-5 w-5"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  strokeWidth={1.7}
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z"
                  />
                </svg>
              </span>
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <h2 className="text-xl font-bold text-dark-900">
                    下载历史
                  </h2>
                  <span className="rounded-full bg-dark-50 px-2.5 py-1 text-xs font-semibold text-dark-500">
                    {history.length} 条
                  </span>
                </div>
                <p className="mt-1 text-sm text-dark-400">
                  最近下载优先展示，可按标题、作者或平台快速查找。
                </p>
              </div>
            </div>

            <button
              onClick={handleClear}
              className="self-start rounded-xl px-3 py-2 text-xs font-medium text-dark-400 transition-colors hover:bg-red-50 hover:text-red-500"
            >
              清空记录
            </button>
          </div>

          <div className="mt-5 flex flex-col gap-3 md:flex-row md:items-center">
            <label className="relative flex-1">
              <span className="sr-only">搜索下载历史</span>
              <svg
                className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-dark-300"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={1.8}
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M21 21l-4.35-4.35m1.1-5.15a7.25 7.25 0 11-14.5 0 7.25 7.25 0 0114.5 0z"
                />
              </svg>
              <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                className="h-11 w-full rounded-2xl border border-dark-200 bg-white/80 pl-10 pr-4 text-sm text-dark-800 outline-none transition focus:border-primary-300 focus:ring-4 focus:ring-primary-50"
                placeholder="搜索标题、作者、平台或文件名"
              />
            </label>

            <div ref={platformMenuRef} className="relative min-w-[170px]">
              <button
                type="button"
                onClick={() => setIsPlatformOpen((open) => !open)}
                className="flex h-11 w-full items-center justify-between gap-3 rounded-2xl border border-dark-200 bg-white/85 px-4 text-left text-sm font-medium text-dark-700 shadow-sm outline-none transition hover:border-primary-300 hover:text-primary-600 focus:border-primary-300 focus:ring-4 focus:ring-primary-50"
                aria-haspopup="listbox"
                aria-expanded={isPlatformOpen}
              >
                <span className="truncate">{platformLabel}</span>
                <svg
                  className={`h-4 w-4 shrink-0 transition-transform ${
                    isPlatformOpen ? "rotate-180" : ""
                  }`}
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  strokeWidth={2}
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M19 9l-7 7-7-7"
                  />
                </svg>
              </button>

              {isPlatformOpen && (
                <div className="absolute right-0 z-30 mt-2 w-full min-w-[190px] overflow-hidden rounded-2xl border border-primary-100 bg-white/95 p-1.5 shadow-2xl shadow-blue-900/10 backdrop-blur-xl">
                  <div role="listbox" aria-label="筛选平台" className="space-y-1">
                    {platformOptions.map((option) => {
                      const selected = platform === option.value;
                      return (
                        <button
                          key={option.value}
                          type="button"
                          role="option"
                          aria-selected={selected}
                          onClick={() => {
                            setPlatform(option.value);
                            setIsPlatformOpen(false);
                          }}
                          className={`flex w-full items-center justify-between rounded-xl px-3 py-2.5 text-left text-sm transition ${
                            selected
                              ? "bg-primary-600 text-white shadow-md shadow-primary-600/20"
                              : "text-dark-700 hover:bg-primary-50 hover:text-primary-700"
                          }`}
                        >
                          <span>{option.label}</span>
                          {selected && (
                            <svg
                              className="h-4 w-4"
                              fill="none"
                              viewBox="0 0 24 24"
                              stroke="currentColor"
                              strokeWidth={2}
                            >
                              <path
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                d="M5 13l4 4L19 7"
                              />
                            </svg>
                          )}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          </div>

          <div className="mt-5 overflow-hidden rounded-2xl border border-dark-100 bg-white/70">
            {visibleItems.length > 0 ? (
              <div className="divide-y divide-dark-100">
                {visibleItems.map((item) => (
                  <article
                    key={item.id}
                    className="grid grid-cols-[88px_minmax(0,1fr)] gap-3 p-3 transition hover:bg-primary-50/35 sm:grid-cols-[104px_minmax(0,1fr)_auto] sm:items-center sm:gap-4 sm:p-4"
                  >
                    {item.thumbnail ? (
                      <div className="relative aspect-video overflow-hidden rounded-xl bg-dark-100">
                        <img
                          src={`/api/thumbnail?url=${encodeURIComponent(item.thumbnail)}`}
                          alt={item.title}
                          className="h-full w-full object-cover"
                          loading="lazy"
                        />
                        {item.duration && (
                          <span className="absolute bottom-1 right-1 rounded bg-black/70 px-1.5 py-0.5 text-[10px] font-medium text-white">
                            {formatDuration(item.duration)}
                          </span>
                        )}
                      </div>
                    ) : (
                      <div className="flex aspect-video items-center justify-center rounded-xl bg-dark-50 text-xs text-dark-300">
                        无封面
                      </div>
                    )}

                    <div className="min-w-0">
                      <h3 className="truncate text-sm font-semibold text-dark-900">
                        {item.title}
                      </h3>
                      <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-dark-400">
                        {item.uploader && <span>{item.uploader}</span>}
                        {item.extractor && (
                          <span className="rounded-md bg-dark-50 px-1.5 py-0.5 text-[10px] font-semibold text-dark-400">
                            {item.extractor}
                          </span>
                        )}
                        {item.downloadedAt && <span>{item.downloadedAt}</span>}
                      </div>
                      {item.filename && (
                        <p className="mt-1 truncate text-[11px] text-dark-300">
                          {item.filename}
                        </p>
                      )}
                    </div>

                    <button
                      onClick={() => onReDownload?.(item)}
                      className="col-span-2 rounded-xl bg-primary-50 px-4 py-2 text-xs font-semibold text-primary-600 transition hover:bg-primary-100 active:scale-95 sm:col-span-1 sm:justify-self-end"
                    >
                      重新下载
                    </button>
                  </article>
                ))}
              </div>
            ) : (
              <div className="px-4 py-10 text-center">
                <p className="text-sm font-medium text-dark-600">
                  没找到匹配的历史记录
                </p>
                <button
                  onClick={() => {
                    setQuery("");
                    setPlatform("all");
                  }}
                  className="mt-2 text-xs font-semibold text-primary-600 hover:text-primary-700"
                >
                  清除筛选
                </button>
              </div>
            )}
          </div>

          {filteredHistory.length > 0 && (
            <div className="mt-4 flex flex-col gap-3 text-xs text-dark-400 sm:flex-row sm:items-center sm:justify-between">
              <span>
                显示 {visibleItems.length} / {filteredHistory.length} 条
              </span>
              {hasMore && (
                <button
                  onClick={() =>
                    setVisibleCount((count) => count + LOAD_MORE_COUNT)
                  }
                  className="self-start rounded-xl border border-dark-200 bg-white/80 px-4 py-2 font-semibold text-dark-600 transition hover:border-primary-300 hover:text-primary-600 sm:self-auto"
                >
                  加载更多
                </button>
              )}
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
