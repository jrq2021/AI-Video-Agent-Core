import { useEffect } from "react";
import { getMembershipPlanCopy } from "../services/membershipCopy";

const ORDER_TYPE_LABELS = {
  free: "免费体验",
  weekly: "周卡兑换",
  monthly: "月卡兑换",
  yearly: "年卡兑换",
  lifetime: "已有用户权益",
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

  const planCopy = getMembershipPlanCopy(data.plan);
  const isSuccess = data.type === "order_created" || data.type === "free";
  const tone = isSuccess
    ? "is-success"
    : data.type === "login_required"
      ? "is-warning"
      : "is-error";

  return (
    <div
      className="membership-order-modal fixed inset-0 z-[60] flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-label={data.title}
    >
      <button
        className="membership-order-modal__backdrop absolute inset-0"
        onClick={onClose}
        aria-label="关闭弹窗"
      />

      <div className={`membership-order-modal__panel ${tone}`}>
        <button
          onClick={onClose}
          className="membership-order-modal__close"
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

        <div className="membership-order-modal__glow" aria-hidden="true" />
        <div className="membership-order-modal__content">
          <div className="membership-order-modal__icon">
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

          <p className="membership-order-modal__eyebrow">
            {isSuccess ? "操作已记录" : "需要处理"}
          </p>
          <h3>{data.title}</h3>
          <p className="membership-order-modal__message">{data.message}</p>

          <dl className="membership-order-modal__details">
            {data.plan && (
              <div>
                <dt>套餐</dt>
                <dd>
                  {planCopy ? `${planCopy.name} ${planCopy.nameEn}` : data.plan}
                </dd>
              </div>
            )}
            {data.orderType && (
              <div>
                <dt>类型</dt>
                <dd>
                  {ORDER_TYPE_LABELS[data.orderType] || data.orderType}
                </dd>
              </div>
            )}
            {data.orderId && (
              <div>
                <dt>订单号</dt>
                <dd className="membership-order-modal__order-id">
                  {data.orderId}
                </dd>
              </div>
            )}
            {data.record?.clickedAt && (
              <div>
                <dt>记录时间</dt>
                <dd>
                  {data.record.clickedAt}
                </dd>
              </div>
            )}
          </dl>

          <div className="membership-order-modal__actions">
            <button
              onClick={onClose}
              className="liquid-glass action-glass"
            >
              知道了
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
