import { useRef, useState } from "react";
import { MEMBERSHIP_PLAN_CARDS } from "../services/membershipCopy";

export default function PricingSection({
  currentUser,
  onUpgrade,
  onRedeemCode,
  onAuthClick,
  onNavigate,
  isLoading = false,
}) {
  const [couponCode, setCouponCode] = useState("");
  const [redeemStatus, setRedeemStatus] = useState(null);
  const [isRedeeming, setIsRedeeming] = useState(false);
  const couponInputRef = useRef(null);

  const isCurrentPlan = (planId) => currentUser?.plan === planId;

  const handleRedeemSubmit = async (event) => {
    event.preventDefault();
    const code = couponCode.trim();
    if (!code) {
      setRedeemStatus({ type: "error", message: "请输入兑换码" });
      return;
    }
    if (!currentUser) {
      setRedeemStatus({ type: "info", message: "请先登录账号，再兑换会员码" });
      onAuthClick?.();
      return;
    }
    if (!onRedeemCode) return;

    setIsRedeeming(true);
    setRedeemStatus(null);
    try {
      const data = await onRedeemCode(code);
      const plan = data.redemption?.plan === "ultra" ? "Ultra" : "Pro";
      setCouponCode("");
      setRedeemStatus({ type: "success", message: `${plan} 权益已生效，当前额度已刷新` });
    } catch (error) {
      setRedeemStatus({ type: "error", message: error.message || "兑换失败，请检查兑换码" });
    } finally {
      setIsRedeeming(false);
    }
  };

  return (
    <section id="pricing" className="cinematic-section pricing-section" aria-label="会员权益">
      <div className="pricing-section__inner">
        <div className="pricing-section__top">
          <div className="section-heading pricing-section__heading">
            <h2>选择适合你的<em>创作权益。</em></h2>
            <p>从基础解析开始；需要批量整理、双语字幕和内容二创时，再通过兑换码解锁对应权益。</p>
          </div>

          <form onSubmit={handleRedeemSubmit} className="coupon-panel pricing-coupon">
            <div className="pricing-coupon__field">
              <label htmlFor="membership-code-input">会员兑换码</label>
              <input
                id="membership-code-input"
                ref={couponInputRef}
                value={couponCode}
                onChange={(event) => {
                  setCouponCode(event.target.value.toUpperCase());
                  setRedeemStatus(null);
                }}
                placeholder="输入闲鱼卖家提供的兑换码"
              />
            </div>
            <button
              type="submit"
              disabled={isRedeeming}
              className="liquid-glass action-glass pricing-coupon__button"
            >
              {isRedeeming ? "兑换中..." : "立即兑换"}
            </button>
            {redeemStatus && (
              <p className={`pricing-coupon__status is-${redeemStatus.type}`} role="status">
                {redeemStatus.message}
              </p>
            )}
            <button type="button" className="pricing-coupon__link" onClick={() => onNavigate?.({ page: "redeem" })}>
              打开独立兑换中心
            </button>
          </form>
        </div>

        <div className="pricing-grid">
          {MEMBERSHIP_PLAN_CARDS.map((plan) => {
            const isActive = isCurrentPlan(plan.id);
            const isPro = plan.id === "pro";
            const badge = isPro ? "主推兑换权益" : plan.id === "ultra" ? "已有用户" : null;

            return (
              <div
                key={plan.id}
                className={`pricing-card pricing-plan-card ${isPro ? "is-featured" : ""} ${badge ? "has-badge" : ""} ${isActive ? "is-active" : ""}`}
              >
                {badge && (
                  <div className="pricing-plan-card__badge">
                    <span className={isPro ? "is-primary" : "is-purple"}>{badge}</span>
                  </div>
                )}
                {isActive && <div className="pricing-plan-card__current"><span>当前套餐</span></div>}

                <div className="pricing-plan-card__heading">
                  <div>
                    <h3>{plan.name}</h3>
                    <p>{plan.description}</p>
                  </div>
                  <span className="pricing-plan-card__en">{plan.nameEn}</span>
                </div>

                <div className="pricing-plan-card__price">
                  <p className="pricing-plan-card__delivery">{plan.delivery}</p>
                </div>

                <ul className="pricing-plan-card__features">
                  {plan.features.map((feature) => (
                    <li key={feature}>
                      <svg fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden="true">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                      </svg>
                      <span>{feature}</span>
                    </li>
                  ))}
                </ul>

                <button
                  type="button"
                  onClick={() => {
                    if (isActive) return;
                    if (plan.id === "free") {
                      onUpgrade?.("free", "free");
                      return;
                    }
                    onNavigate?.({ page: "redeem" });
                  }}
                  disabled={isActive || (plan.id === "free" && isLoading)}
                  className={`liquid-glass action-glass pricing-plan-card__button ${isActive ? "cursor-not-allowed opacity-45" : ""}`}
                >
                  {isActive ? "当前套餐" : plan.id === "free" && isLoading ? "处理中..." : plan.cta}
                </button>
              </div>
            );
          })}
        </div>

        <p className="pricing-section__note">
          新用户通过闲鱼兑换码开通 Pro；兑换成功后可在兑换中心和个人中心查看到期日与当天额度。
        </p>
      </div>
    </section>
  );
}
