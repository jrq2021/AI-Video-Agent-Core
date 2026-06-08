import { useEffect } from "react";

const PLAN_LABELS = {
  free: "免费版",
  pro: "专业版 Pro",
  ultra: "旗舰版 Ultra",
};

const ORDER_TYPE_LABELS = {
  free: "免费",
  monthly: "月付",
  yearly: "年付",
  lifetime: "终身买断",
};

export default function MembershipOrderModal({ data, onClose }) {
  useEffect(() => {
    if (!data) return undefined;
    const handleKeyDown = (event) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [data, onClose]);

  if (!data) return null;

  const isSuccess = data.type === "order_created" || data.type === "free";
  const accent = isSuccess
    ? "from-primary-600 to-purple-500"
    : data.type === "login_required"
      ? "from-amber-500 to-orange-500"
      : "from-red-500 to-rose-500";

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-label={data.title}
    >
      <button
        className="absolute inset-0 bg-dark-900/45 backdrop-blur-md"
        onClick={onClose}
        aria-label="关闭弹窗"
      />

      <div className="relative w-full max-w-md overflow-hidden rounded-3xl border border-white/80 bg-white shadow-2xl shadow-blue-950/15">
        <div className={`h-1.5 bg-gradient-to-r ${accent}`} />
        <button
          onClick={onClose}
          className="absolute right-4 top-4 rounded-xl p-2 text-dark-300 transition hover:bg-dark-50 hover:text-dark-700"
          aria-label="关闭"
        >
          <svg
            className="h-5 w-5"
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

        <div className="p-6 pt-8">
          <div
            className={`mb-5 flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br ${accent} text-white shadow-lg shadow-blue-500/20`}
          >
            {isSuccess ? (
              <svg
                className="h-7 w-7"
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
            ) : (
              <svg
                className="h-7 w-7"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={2}
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M12 9v3.75m0 3.75h.008v.008H12v-.008zM10.29 3.86L1.82 18a2.25 2.25 0 001.93 3.375h16.5A2.25 2.25 0 0022.18 18L13.71 3.86a2.25 2.25 0 00-3.42 0z"
                />
              </svg>
            )}
          </div>

          <h3 className="text-2xl font-bold text-dark-900">{data.title}</h3>
          <p className="mt-2 text-sm leading-6 text-dark-500">
            {data.message}
          </p>

          <dl className="mt-5 space-y-2 rounded-2xl bg-dark-50/80 p-4 text-sm">
            {data.plan && (
              <div className="flex items-center justify-between gap-4">
                <dt className="text-dark-400">套餐</dt>
                <dd className="font-semibold text-dark-800">
                  {PLAN_LABELS[data.plan] || data.plan}
                </dd>
              </div>
            )}
            {data.orderType && (
              <div className="flex items-center justify-between gap-4">
                <dt className="text-dark-400">类型</dt>
                <dd className="font-semibold text-dark-800">
                  {ORDER_TYPE_LABELS[data.orderType] || data.orderType}
                </dd>
              </div>
            )}
            {data.amount !== undefined && (
              <div className="flex items-center justify-between gap-4">
                <dt className="text-dark-400">金额</dt>
                <dd className="font-semibold text-dark-800">¥{data.amount}</dd>
              </div>
            )}
            {data.orderId && (
              <div className="flex items-start justify-between gap-4">
                <dt className="text-dark-400">订单号</dt>
                <dd className="max-w-[210px] break-all text-right text-xs font-medium text-dark-500">
                  {data.orderId}
                </dd>
              </div>
            )}
            {data.record?.clickedAt && (
              <div className="flex items-center justify-between gap-4">
                <dt className="text-dark-400">记录时间</dt>
                <dd className="font-medium text-dark-600">
                  {data.record.clickedAt}
                </dd>
              </div>
            )}
          </dl>

          <div className="mt-6 flex items-center justify-end">
            <button
              onClick={onClose}
              className="rounded-2xl bg-dark-900 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-dark-800 active:scale-95"
            >
              知道了
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
