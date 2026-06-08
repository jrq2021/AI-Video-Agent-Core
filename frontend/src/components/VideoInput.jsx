import { useState } from "react";

/**
 * VideoInput — 视频链接输入组件
 *
 * Props:
 * @param {function} onAnalyze - 解析视频回调 (url) => void
 * @param {function} onCheckQuota - 额度校验回调 (action) => { allowed, reason, needLogin, needUpgrade }
 * @param {object} quota - 当前额度对象
 * @param {boolean} isLoading - 是否正在解析
 * @param {object} user - 当前用户（null 表示未登录）
 * @param {function} onAuthClick - 点击登录按钮回调
 */

export default function VideoInput({
  onAnalyze,
  onCheckQuota,
  quota,
  isLoading,
  user,
  onAuthClick,
}) {
  const [url, setUrl] = useState("");
  const [quotaError, setQuotaError] = useState("");

  const handleSubmit = (e) => {
    e.preventDefault();
    setQuotaError("");

    if (!url.trim() || isLoading) return;

    // 额度校验
    if (onCheckQuota) {
      const result = onCheckQuota("download");
      if (!result.allowed) {
        setQuotaError(result.reason);
        return;
      }
    }

    onAnalyze(url.trim());
  };

  // 计算剩余下载次数
  const q = quota || {};
  const downloadRemaining = Math.max(
    0,
    (q.daily_downloads_limit || 0) - (q.daily_downloads_used || 0),
  );
  const downloadLimit = q.daily_downloads_limit || 0;
  const isGuest = q.is_guest || q.plan === "guest";
  const planLabel =
    q.plan === "pro"
      ? "Pro"
      : q.plan === "ultra"
        ? "Ultra"
        : isGuest
          ? "游客"
          : "免费版";

  return (
    <form onSubmit={handleSubmit} className="mt-0">
      {/* ── 额度指示条 ── */}
      <div className="flex items-center justify-between mb-3 px-1">
        <div className="flex items-center gap-2 text-sm">
          {/* 身份标识 */}
          <span
            className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium ${
              isGuest
                ? "bg-dark-100 text-dark-500"
                : q.plan === "pro"
                  ? "bg-primary-100 text-primary-700"
                  : q.plan === "ultra"
                    ? "bg-purple-100 text-purple-700"
                    : "bg-dark-100 text-dark-600"
            }`}
          >
            <span className="w-1.5 h-1.5 rounded-full bg-current"></span>
            {planLabel}
          </span>

          {/* 额度数字 */}
          <span className="text-dark-500">
            今日下载{" "}
            <span
              className={`font-semibold ${
                downloadRemaining === 0
                  ? "text-red-500"
                  : downloadRemaining <= 2
                    ? "text-amber-500"
                    : "text-primary-600"
              }`}
            >
              {downloadRemaining}
            </span>
            <span className="text-dark-400"> / {downloadLimit} 次</span>
          </span>
        </div>

        {/* 引导操作 */}
        <div className="flex items-center gap-2">
          {isGuest && downloadRemaining > 0 && (
            <button
              type="button"
              onClick={onAuthClick}
              className="text-xs text-primary-600 hover:text-primary-700 font-medium transition-colors"
            >
              登录后增至 3 次 →
            </button>
          )}
          {isGuest && downloadRemaining === 0 && (
            <button
              type="button"
              onClick={onAuthClick}
              className="text-xs px-3 py-1 bg-primary-600 text-white rounded-full font-medium hover:bg-primary-700 transition-colors"
            >
              登录解锁更多
            </button>
          )}
          {!isGuest && !user && downloadRemaining > 0 && (
            <button
              type="button"
              onClick={onAuthClick}
              className="text-xs text-primary-600 hover:text-primary-700 font-medium transition-colors"
            >
              登录
            </button>
          )}
        </div>
      </div>

      {/* ── 额度错误提示 ── */}
      {quotaError && (
        <div className="mb-3 p-3 bg-amber-50 border border-amber-200 rounded-xl text-amber-700 text-sm flex items-start gap-2">
          <svg
            className="w-5 h-5 flex-shrink-0 mt-0.5"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={1.5}
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z"
            />
          </svg>
          <div className="flex-1">
            <p>{quotaError}</p>
            <div className="flex gap-2 mt-2">
              {isGuest ? (
                <button
                  type="button"
                  onClick={onAuthClick}
                  className="text-xs px-3 py-1.5 bg-primary-600 text-white rounded-lg font-medium hover:bg-primary-700 transition-colors"
                >
                  立即登录（免费 3 次/天）
                </button>
              ) : (
                <button
                  type="button"
                  onClick={onAuthClick}
                  className="text-xs px-3 py-1.5 bg-primary-600 text-white rounded-lg font-medium hover:bg-primary-700 transition-colors"
                >
                  升级套餐
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ── 输入框 ── */}
      <div className="relative">
        <div className="flex items-center bg-white border border-dark-200 rounded-2xl shadow-lg shadow-dark-900/5 focus-within:border-primary-400 focus-within:ring-4 focus-within:ring-primary-50 transition-all duration-200 overflow-hidden">
          {/* URL icon */}
          <div className="pl-5 pr-3">
            <svg
              className="w-5 h-5 text-dark-400"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={1.5}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M13.19 8.688a4.5 4.5 0 011.242 7.244l-4.5 4.5a4.5 4.5 0 01-6.364-6.364l1.757-1.757m13.35-.622l1.757-1.757a4.5 4.5 0 00-6.364-6.364l-4.5 4.5a4.5 4.5 0 001.242 7.244"
              />
            </svg>
          </div>
          <input
            type="url"
            value={url}
            onChange={(e) => {
              setUrl(e.target.value);
              setQuotaError("");
            }}
            placeholder="粘贴视频链接，支持 YouTube / B站等 1000+ 平台..."
            className="flex-1 py-4 pr-4 text-dark-900 placeholder-dark-400 bg-transparent focus:outline-none text-sm"
            disabled={isLoading}
          />
          <button
            type="submit"
            disabled={isLoading || !url.trim()}
            className="m-1.5 px-6 py-2.5 bg-primary-600 text-white rounded-xl font-medium
                     hover:bg-primary-700 disabled:opacity-50 disabled:cursor-not-allowed
                     active:scale-95 transition-all duration-200 shadow-md shadow-primary-600/20 text-sm whitespace-nowrap"
          >
            {isLoading ? (
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
                解析中
              </span>
            ) : (
              "开始解析"
            )}
          </button>
        </div>
      </div>
    </form>
  );
}
