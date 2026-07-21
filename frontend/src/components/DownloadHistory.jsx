import { useEffect, useMemo, useRef, useState } from "react";
import {
  clearParseHistory,
  loadParseHistory,
} from "../services/parseHistory";

const PAGE_SIZE = 4;

function formatDuration(value) {
  return value || "";
}

function formatRecordTime(value) {
  if (!value) return "";
  const milliseconds = value > 1e15 ? Math.floor(value / 1e6) : value;
  const date = new Date(milliseconds);
  return Number.isNaN(date.getTime()) ? "" : date.toLocaleString("zh-CN");
}

function getPaginationItems(currentPage, pageCount) {
  if (pageCount <= 5) {
    return Array.from({ length: pageCount }, (_, index) => index + 1);
  }

  const items = [1];
  const rangeStart = Math.max(2, currentPage - 1);
  const rangeEnd = Math.min(pageCount - 1, currentPage + 1);

  if (rangeStart > 2) items.push("start-ellipsis");
  for (let page = rangeStart; page <= rangeEnd; page += 1) {
    items.push(page);
  }
  if (rangeEnd < pageCount - 1) items.push("end-ellipsis");
  items.push(pageCount);

  return items;
}

export default function DownloadHistory({
  onContinueHistory,
  user,
  showEmpty = false,
  variant = "default",
}) {
  const [history, setHistory] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [platform, setPlatform] = useState("all");
  const [isPlatformOpen, setIsPlatformOpen] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const platformMenuRef = useRef(null);

  useEffect(() => {
    let active = true;
    const refresh = async () => {
      setIsLoading(true);
      const records = await loadParseHistory(user);
      if (active) {
        setHistory(records);
        setIsLoading(false);
      }
    };
    refresh();
    window.addEventListener("parse-history-updated", refresh);
    return () => {
      active = false;
      window.removeEventListener("parse-history-updated", refresh);
    };
  }, [user]);

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
    setCurrentPage(1);
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

  const pageCount = Math.max(1, Math.ceil(filteredHistory.length / PAGE_SIZE));
  const pageStart = (currentPage - 1) * PAGE_SIZE;
  const visibleItems = filteredHistory.slice(pageStart, pageStart + PAGE_SIZE);
  const paginationItems = getPaginationItems(currentPage, pageCount);

  useEffect(() => {
    setCurrentPage((page) => Math.min(page, pageCount));
  }, [pageCount]);

  const handleClear = async () => {
    await clearParseHistory(user);
    setHistory([]);
    setQuery("");
    setPlatform("all");
    setCurrentPage(1);
  };

  if (history.length === 0 && !showEmpty) return null;

  const isProfile = variant === "profile";

  return (
    <section
      className={
        isProfile ? "profile-history" : "bg-dark-50/20 py-10"
      }
    >
      <div className={isProfile ? "" : "mx-auto max-w-7xl px-4"}>
        <div
          className={
            isProfile
              ? "profile-history__surface"
              : "card p-5 md:p-6"
          }
        >
          <div className="download-history__header flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
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
                    解析历史
                  </h2>
                  <span className="rounded-full bg-dark-50 px-2.5 py-1 text-xs font-semibold text-dark-500">
                    {history.length} 条
                  </span>
                </div>
                <p className="mt-1 text-sm text-dark-400">
                  解析成功即自动保存，字幕与 AI 成果可直接继续使用。
                </p>
              </div>
            </div>

            {history.length > 0 ? (
              <button
                onClick={handleClear}
                className="liquid-glass action-glass self-start rounded-full px-4 py-2 text-xs font-medium"
              >
                清空记录
              </button>
            ) : null}
          </div>

          {history.length > 0 ? (
            <div className="download-history__filters mt-5 flex flex-col gap-3 md:flex-row md:items-center">
              <label className="relative flex-1">
                <span className="sr-only">搜索解析历史</span>
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
                  <div className="history-platform-menu absolute right-0 z-30 mt-2 w-full min-w-[190px] overflow-hidden rounded-2xl p-1.5">
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
                            className={`history-platform-option flex w-full items-center justify-between rounded-xl px-3 py-2.5 text-left text-sm ${
                              selected ? "is-selected" : ""
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
          ) : null}

          <div className="download-history__list mt-5 overflow-hidden rounded-2xl border border-dark-100 bg-white/70">
            {visibleItems.length > 0 ? (
              <div className="divide-y divide-dark-100">
                {visibleItems.map((item) => (
                  <article
                    key={item.record_key}
                    className="download-history__row grid grid-cols-[88px_minmax(0,1fr)] gap-3 p-3 transition hover:bg-primary-50/35 sm:grid-cols-[104px_minmax(0,1fr)_auto] sm:items-center sm:gap-4 sm:p-4"
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
                        {formatRecordTime(item.updated_at || item.parsed_at) && (
                          <span>
                            {formatRecordTime(item.updated_at || item.parsed_at)}
                          </span>
                        )}
                      </div>
                      <div className="parse-history-artifacts">
                        {item.subtitles || item.segments?.length ? (
                          <span className="is-ready">已有字幕</span>
                        ) : (
                          <span>未提取字幕</span>
                        )}
                        {item.summary_text ? (
                          <span className="is-ready">已有总结</span>
                        ) : (
                          <span>未生成总结</span>
                        )}
                        {item.mindmap_text ? (
                          <span className="is-ready">已有导图</span>
                        ) : (
                          <span>未生成导图</span>
                        )}
                      </div>
                      {item.filename && (
                        <p className="mt-1 truncate text-[11px] text-dark-300">
                          {item.filename}
                        </p>
                      )}
                    </div>

                    <button
                      onClick={() => onContinueHistory?.(item)}
                      className="liquid-glass action-glass col-span-2 rounded-full px-4 py-2 text-xs font-medium sm:col-span-1 sm:justify-self-end"
                    >
                      继续处理
                    </button>
                  </article>
                ))}
              </div>
            ) : (
              <div className="px-4 py-10 text-center">
                <p className="text-sm font-medium text-dark-600">
                  {history.length === 0
                    ? isLoading
                      ? "正在加载解析历史..."
                      : "还没有解析记录"
                    : "没找到匹配的历史记录"}
                </p>
                {history.length > 0 ? (
                  <button
                    onClick={() => {
                      setQuery("");
                      setPlatform("all");
                    }}
                    className="liquid-glass action-glass mt-3 rounded-full px-4 py-2 text-xs font-medium"
                  >
                    清除筛选
                  </button>
                ) : (
                  <p className="mt-2 text-xs text-dark-400">
                    成功解析视频后，记录会自动保存在这里。
                  </p>
                )}
              </div>
            )}
          </div>

          {filteredHistory.length > 0 && (
            <div className="download-history__footer mt-4 flex flex-col gap-3 text-xs text-dark-400 sm:flex-row sm:items-center sm:justify-between">
              <span>
                第 {currentPage} / {pageCount} 页 · 共 {filteredHistory.length} 条
              </span>
              <nav className="history-pagination" aria-label="解析历史分页">
                <button
                  type="button"
                  onClick={() => setCurrentPage((page) => Math.max(1, page - 1))}
                  disabled={currentPage === 1}
                  className="history-pagination__button"
                >
                  上一页
                </button>
                {paginationItems.map((item) =>
                  typeof item === "number" ? (
                    <button
                      key={item}
                      type="button"
                      onClick={() => setCurrentPage(item)}
                      aria-current={currentPage === item ? "page" : undefined}
                      className={`history-pagination__button history-pagination__page ${
                        currentPage === item ? "is-active" : ""
                      }`}
                    >
                      {item}
                    </button>
                  ) : (
                    <span key={item} className="history-pagination__ellipsis">
                      …
                    </span>
                  ),
                )}
                <button
                  type="button"
                  onClick={() =>
                    setCurrentPage((page) => Math.min(pageCount, page + 1))
                  }
                  disabled={currentPage === pageCount}
                  className="history-pagination__button"
                >
                  下一页
                </button>
              </nav>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
