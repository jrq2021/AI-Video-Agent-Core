/**
 * UpgradeModal — 付费墙拦截弹窗
 *
 * 当用户额度用尽或尝试使用高级功能时弹出，引导升级。
 * 设计要点：
 * - 毛玻璃背景 + 居中卡片，视觉聚焦
 * - 展示当前套餐 vs 推荐套餐对比
 * - 快捷升级按钮 + 稍后再说
 * - 支持键盘 ESC 关闭
 *
 * Props:
 * @param {boolean} show - 是否显示
 * @param {string} reason - 升级引导文案
 * @param {object} currentUser - 当前用户
 * @param {function} onUpgrade - 升级回调 (plan, orderType) => void
 * @param {function} onClose - 关闭回调
 * @param {boolean} isLoading - 支付加载态
 */

export default function UpgradeModal({
  show,
  reason,
  currentUser,
  onClose,
}) {
  if (!show) return null;

  // ESC 关闭
  const handleKeyDown = (e) => {
    if (e.key === "Escape") onClose();
  };

  const goRedeem = () => {
    onClose?.();
    window.setTimeout(() => {
      document.getElementById("pricing")?.scrollIntoView({
        behavior: "smooth",
        block: "start",
      });
      document.getElementById("membership-code-input")?.focus({
        preventScroll: true,
      });
    }, 0);
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      onKeyDown={handleKeyDown}
      role="dialog"
      aria-modal="true"
      aria-label="升级会员"
    >
      {/* 毛玻璃背景 */}
      <div
        className="absolute inset-0 bg-dark-900/60 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* 弹窗卡片 */}
      <div className="relative bg-white rounded-2xl shadow-2xl max-w-lg w-full max-h-[90vh] overflow-y-auto animate-in zoom-in-95 duration-200">
        {/* 顶部装饰条 */}
        <div className="h-1.5 bg-gradient-to-r from-primary-500 via-purple-500 to-primary-500 rounded-t-2xl" />

        {/* 关闭按钮 */}
        <button
          onClick={onClose}
          className="absolute top-4 right-4 p-2 text-dark-400 hover:text-dark-600 hover:bg-dark-100 rounded-lg transition-colors"
          aria-label="关闭"
        >
          <svg
            className="w-5 h-5"
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
        </button>

        <div className="p-8">
          {/* 图标 */}
          <div className="mx-auto w-14 h-14 bg-primary-100 rounded-2xl flex items-center justify-center mb-5">
            <svg
              className="w-7 h-7 text-primary-600"
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

          {/* 标题与原因 */}
          <h3 className="text-xl font-bold text-dark-900 text-center mb-2">
            解锁更多功能
          </h3>
          <p className="text-dark-500 text-center text-sm mb-6">{reason}</p>

          {/* 当前套餐状态 */}
          {currentUser?.plan && (
            <div className="bg-dark-50 rounded-xl p-4 mb-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs text-dark-400 uppercase tracking-wide font-semibold">
                    当前套餐
                  </p>
                  <p className="text-dark-900 font-bold mt-0.5">
                    {currentUser.plan === "pro"
                      ? "专业版 Pro"
                      : currentUser.plan === "ultra"
                        ? "旗舰版 Ultra"
                        : "免费版 Free"}
                  </p>
                </div>
                <span
                  className={`px-3 py-1 rounded-full text-xs font-semibold ${
                    currentUser.plan === "free"
                      ? "bg-dark-200 text-dark-600"
                      : currentUser.plan === "pro"
                        ? "bg-primary-100 text-primary-700"
                        : "bg-purple-100 text-purple-700"
                  }`}
                >
                  {currentUser.plan === "free"
                    ? "受限"
                    : currentUser.plan === "pro"
                      ? "已订阅"
                      : "终身"}
                </span>
              </div>
            </div>
          )}

          {/* 券码开通选项 */}
          <div className="space-y-3 mb-6">
            <div className="w-full flex items-center justify-between gap-4 p-4 rounded-xl border-2 border-primary-500 bg-primary-50/50">
              <div className="text-left">
                <div className="flex items-center gap-2">
                  <span className="font-bold text-dark-900">专业版 Pro</span>
                  <span className="text-xs bg-primary-100 text-primary-700 px-2 py-0.5 rounded-full font-semibold">
                    推荐
                  </span>
                </div>
                <p className="text-sm text-dark-500 mt-0.5">
                  每日 30 次下载 · 10 次 AI 总结 · 思维导图
                </p>
              </div>
              <div className="text-right">
                <p className="text-xl font-bold text-dark-900">¥9.9</p>
                <p className="text-xs text-dark-400">/月</p>
              </div>
            </div>

            <div className="w-full flex items-center justify-between gap-4 p-4 rounded-xl border-2 border-purple-300 bg-purple-50/30">
              <div className="text-left">
                <div className="flex items-center gap-2">
                  <span className="font-bold text-dark-900">旗舰版 Ultra</span>
                  <span className="text-xs bg-purple-100 text-purple-700 px-2 py-0.5 rounded-full font-semibold">
                    最划算
                  </span>
                </div>
                <p className="text-sm text-dark-500 mt-0.5">
                  每日 100 次下载 · 50 次 AI 总结 · 终身有效
                </p>
              </div>
              <div className="text-right">
                <p className="text-xl font-bold text-dark-900">¥199</p>
                <p className="text-xs text-dark-400">终身买断</p>
              </div>
            </div>
          </div>

          <button
            onClick={goRedeem}
            className="w-full rounded-xl bg-primary-600 px-5 py-3 text-sm font-semibold text-white shadow-lg shadow-primary-600/25 transition hover:bg-primary-700 active:scale-[0.98]"
          >
            去兑换会员码
          </button>

          {/* 底部操作 */}
          <div className="flex items-center justify-between pt-4 border-t border-dark-100">
            <p className="text-xs text-dark-400">
              当前仅支持卡券解锁
            </p>
            <button
              onClick={onClose}
              className="text-sm text-dark-500 hover:text-dark-700 font-medium transition-colors"
            >
              稍后再说
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
