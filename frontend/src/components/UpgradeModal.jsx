import { getMembershipPlanCopy } from "../services/membershipCopy";

export default function UpgradeModal({
  show,
  reason,
  currentUser,
  onClose,
}) {
  if (!show) return null;

  const proPlan = getMembershipPlanCopy("pro");
  const ultraPlan = getMembershipPlanCopy("ultra");
  const currentPlan = getMembershipPlanCopy(currentUser?.plan);

  const handleKeyDown = (event) => {
    if (event.key === "Escape") onClose();
  };

  const goRedeem = () => {
    onClose?.();
    window.setTimeout(() => {
      document.getElementById("pricing")?.scrollIntoView({ behavior: "smooth", block: "start" });
      document.getElementById("membership-code-input")?.focus({ preventScroll: true });
    }, 0);
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      onKeyDown={handleKeyDown}
      role="dialog"
      aria-modal="true"
      aria-label="兑换会员码"
    >
      <div className="absolute inset-0 bg-dark-900/60 backdrop-blur-sm" onClick={onClose} />

      <div className="relative max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-2xl bg-white shadow-2xl animate-in zoom-in-95 duration-200">
        <div className="h-1.5 rounded-t-2xl bg-gradient-to-r from-primary-500 via-purple-500 to-primary-500" />
        <button
          onClick={onClose}
          className="absolute right-4 top-4 rounded-lg p-2 text-dark-400 transition-colors hover:bg-dark-100 hover:text-dark-600"
          aria-label="关闭"
        >
          <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>

        <div className="p-8">
          <div className="mx-auto mb-5 flex h-14 w-14 items-center justify-center rounded-2xl bg-primary-100">
            <svg className="h-7 w-7 text-primary-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904 9 18.75l-.813-2.846a4.5 4.5 0 0 0-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 0 0 3.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 0 0 3.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 0 0-3.09 3.09zM18.259 8.715 18 9.75l-.259-1.035a3.375 3.375 0 0 0-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 0 0 2.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 0 0 2.455 2.456L21.75 6l-1.036.259a3.375 3.375 0 0 0-2.455 2.456z" />
            </svg>
          </div>

          <h3 className="mb-2 text-center text-xl font-bold text-dark-900">解锁创作权益</h3>
          <p className="mb-6 text-center text-sm text-dark-500">{reason}</p>

          {currentPlan && (
            <div className="mb-6 rounded-xl bg-dark-50 p-4">
              <p className="text-xs font-semibold uppercase tracking-wide text-dark-400">当前套餐</p>
              <p className="mt-0.5 font-bold text-dark-900">{currentPlan.name} {currentPlan.nameEn}</p>
            </div>
          )}

          <div className="mb-6 space-y-3">
            <div className="flex w-full items-center justify-between gap-4 rounded-xl border-2 border-primary-500 bg-primary-50/50 p-4">
              <div className="text-left">
                <div className="flex items-center gap-2">
                  <span className="font-bold text-dark-900">{proPlan.name} {proPlan.nameEn}</span>
                  <span className="rounded-full bg-primary-100 px-2 py-0.5 text-xs font-semibold text-primary-700">主推</span>
                </div>
                <p className="mt-0.5 text-sm text-dark-500">{proPlan.modalSummary}</p>
              </div>
            </div>

            <div className="flex w-full items-center justify-between gap-4 rounded-xl border-2 border-purple-300 bg-purple-50/30 p-4">
              <div className="text-left">
                <div className="flex items-center gap-2">
                  <span className="font-bold text-dark-900">{ultraPlan.name} {ultraPlan.nameEn}</span>
                  <span className="rounded-full bg-purple-100 px-2 py-0.5 text-xs font-semibold text-purple-700">已有用户</span>
                </div>
                <p className="mt-0.5 text-sm text-dark-500">{ultraPlan.modalSummary}</p>
              </div>
            </div>
          </div>

          <button
            onClick={goRedeem}
            className="w-full rounded-xl bg-primary-600 px-5 py-3 text-sm font-semibold text-white shadow-lg shadow-primary-600/25 transition hover:bg-primary-700 active:scale-[0.98]"
          >
            输入会员兑换码
          </button>

          <div className="flex items-center justify-between border-t border-dark-100 pt-4">
            <p className="text-xs text-dark-400">新用户请联系卖家获取 Pro 周卡、月卡或年卡。</p>
            <button onClick={onClose} className="text-sm font-medium text-dark-500 transition-colors hover:text-dark-700">稍后再说</button>
          </div>
        </div>
      </div>
    </div>
  );
}
