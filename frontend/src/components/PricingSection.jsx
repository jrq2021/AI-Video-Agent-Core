import { useRef, useState } from "react";

/**
 * PricingSection — 会员套餐定价卡片组件
 *
 * 设计要点：
 * - 三栏卡片布局（Free / Pro / Ultra），Pro 高亮推荐
 * - 权益打勾/叉列表，视觉层级清晰
 * - 支持「月付」和「年付」切换（Pro 专属）
 * - 行动按钮根据当前用户状态动态变化
 *
 * Props:
 * @param {object} currentUser - 当前登录用户（含 plan 字段）
 * @param {function} onUpgrade - 点击免费套餐按钮的回调
 * @param {boolean} isLoading - 是否正在处理操作
 */

// 套餐数据（与后端 PLAN_CONFIG 保持一致）
const PLANS = [
  {
    id: "free",
    name: "免费版",
    nameEn: "Free",
    desc: "零成本体验核心功能",
    priceMonthly: 0,
    priceYearly: 0,
    cta: "免费开始",
    highlight: false,
    features: [
      { text: "每日 3 次视频下载", included: true },
      { text: "公开视频直链解析", included: true },
      { text: "每日 1 次 AI 智能总结", included: true },
      { text: "基础字幕提取", included: true },
      { text: "思维导图导出", included: false },
      { text: "批量下载", included: false },
      { text: "优先技术支持", included: false },
    ],
  },
  {
    id: "pro",
    name: "专业版",
    nameEn: "Pro",
    desc: "适合重度视频用户",
    priceMonthly: 9.9,
    priceYearly: 99,
    cta: "输入券码解锁",
    highlight: true, // 高亮推荐
    badge: "最受欢迎",
    features: [
      { text: "每日 30 次视频下载", included: true, highlight: true },
      { text: "每日 10 次 AI 智能总结", included: true },
      { text: "字幕提取 + SRT/VTT 导出", included: true },
      { text: "思维导图生成与导出", included: true },
      { text: "B站 / 抖音专项解析", included: true },
      { text: "批量下载（开发中）", included: false },
      { text: "优先技术支持", included: false },
    ],
  },
  {
    id: "ultra",
    name: "旗舰版",
    nameEn: "Ultra",
    desc: "终身买断，一劳永逸",
    priceLifetime: 199,
    cta: "输入券码解锁",
    highlight: false,
    badge: "最划算",
    features: [
      { text: "每日 100 次视频下载", included: true, highlight: true },
      { text: "每日 50 次 AI 智能总结", included: true, highlight: true },
      { text: "字幕提取 + 导出", included: true },
      { text: "思维导图导出（SVG/PNG）", included: true },
      { text: "B站 / 抖音专项解析", included: true },
      { text: "批量下载（开发中）", included: false },
      { text: "优先技术支持（待接入）", included: false },
    ],
  },
];

export default function PricingSection({
  currentUser,
  onUpgrade,
  onRedeemCode,
  onAuthClick,
  onNavigate,
  isLoading = false,
}) {
  const [billingCycle, setBillingCycle] = useState("monthly"); // monthly | yearly
  const [couponCode, setCouponCode] = useState("");
  const [redeemStatus, setRedeemStatus] = useState(null);
  const [isRedeeming, setIsRedeeming] = useState(false);
  const couponInputRef = useRef(null);

  const isCurrentPlan = (planId) => currentUser?.plan === planId;

  const focusCouponInput = () => {
    couponInputRef.current?.focus();
    couponInputRef.current?.scrollIntoView({
      behavior: "smooth",
      block: "center",
    });
  };

  const handleCouponOnlyPlan = (plan) => {
    if (!currentUser) {
      setRedeemStatus({ type: "info", message: "请先登录账号，再兑换会员码" });
      onAuthClick?.();
    } else {
      setRedeemStatus({
        type: "info",
        message: `${plan.nameEn} 目前通过会员兑换码开通，请输入已收到的券码`,
      });
    }
    focusCouponInput();
  };

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
      setRedeemStatus({
        type: "success",
        message: `${plan} 会员已开通，当前额度已刷新`,
      });
    } catch (error) {
      setRedeemStatus({
        type: "error",
        message: error.message || "兑换失败，请检查兑换码",
      });
    } finally {
      setIsRedeeming(false);
    }
  };

  return (
    <section
      id="pricing"
      className="cinematic-section pricing-section"
      aria-label="会员套餐"
    >
      <div className="pricing-section__inner">
        <div className="pricing-section__top">
          <div className="section-heading pricing-section__heading">
            <h2>
              选择适合你的<em>节奏。</em>
            </h2>
            <p>
              从免费版开始，按使用强度升级；已上线与未开放权益清晰标注。
            </p>
          </div>

          <div className="pricing-section__tools">
            <div className="billing-toggle" role="group" aria-label="计费周期">
              <button
                type="button"
                onClick={() => setBillingCycle("monthly")}
                className={billingCycle === "monthly" ? "is-active" : ""}
              >
                月付
              </button>
              <button
                type="button"
                onClick={() => setBillingCycle("yearly")}
                className={billingCycle === "yearly" ? "is-active" : ""}
              >
                年付
                <span className="billing-save">省 17%</span>
              </button>
            </div>

            <form
              onSubmit={handleRedeemSubmit}
              className="coupon-panel pricing-coupon"
            >
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
                  placeholder="输入咸鱼购买后收到的券码"
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
                <p
                  className={`pricing-coupon__status is-${redeemStatus.type}`}
                  role="status"
                >
                  {redeemStatus.message}
                </p>
              )}
              <button type="button" className="pricing-coupon__link" onClick={() => onNavigate?.({ page: "redeem" })}>
                打开独立兑换中心
              </button>
            </form>
          </div>
        </div>

        <div className="pricing-grid">
        {PLANS.map((plan) => {
          const isActive = isCurrentPlan(plan.id);
          const ctaText = plan.cta;

          // 计算展示价格
          let priceDisplay, periodLabel;
          if (plan.id === "free") {
            priceDisplay = "免费";
            periodLabel = "永久";
          } else if (plan.id === "ultra") {
            priceDisplay = `¥${plan.priceLifetime}`;
            periodLabel = "终身买断";
          } else {
            // Pro: 根据 billingCycle 切换
            if (billingCycle === "yearly") {
              priceDisplay = `¥${plan.priceYearly}`;
              periodLabel = "/年";
            } else {
              priceDisplay = `¥${plan.priceMonthly}`;
              periodLabel = "/月";
            }
          }

          return (
            <div
              key={plan.id}
              className={`pricing-card pricing-plan-card ${
                plan.highlight ? "is-featured" : ""
              } ${plan.badge ? "has-badge" : ""} ${isActive ? "is-active" : ""}`}
            >
              {/* 推荐标签 */}
              {plan.badge && (
                <div className="pricing-plan-card__badge">
                  <span
                    className={
                      plan.highlight
                        ? "is-primary"
                        : "is-purple"
                    }
                  >
                    {plan.badge}
                  </span>
                </div>
              )}

              {/* 当前套餐标签 */}
              {isActive && (
                <div className="pricing-plan-card__current">
                  <span>
                    当前套餐
                  </span>
                </div>
              )}

              <div className="pricing-plan-card__heading">
                <div>
                  <h3>{plan.name}</h3>
                  <p>{plan.desc}</p>
                </div>
                <span className="pricing-plan-card__en">{plan.nameEn}</span>
              </div>

              <div className="pricing-plan-card__price">
                <div>
                  <span>
                    {priceDisplay}
                  </span>
                  {periodLabel && (
                    <small>{periodLabel}</small>
                  )}
                </div>
                {plan.id === "pro" && billingCycle === "yearly" && (
                  <p>
                    约 ¥8.3/月，比月付省 ¥19.8
                  </p>
                )}
              </div>

              <ul className="pricing-plan-card__features">
                {plan.features.map((feature, idx) => (
                  <li
                    key={idx}
                    className={feature.included ? "" : "is-disabled"}
                  >
                    {feature.included ? (
                      <svg
                        className={
                          feature.highlight
                            ? "is-highlight"
                            : ""
                        }
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
                    ) : (
                      <svg
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
                    )}
                    <span
                      className={feature.highlight ? "is-highlight" : ""}
                    >
                      {feature.text}
                    </span>
                  </li>
                ))}
              </ul>

              <button
                type="button"
                onClick={() => {
                  if (!isActive) {
                    if (plan.id === "free") {
                      onUpgrade?.(plan.id, "monthly");
                      return;
                    }
                    if (onNavigate) {
                      onNavigate({ page: "redeem" });
                    } else {
                      handleCouponOnlyPlan(plan);
                    }
                  }
                }}
                disabled={isActive || (plan.id === "free" && isLoading)}
                className={`liquid-glass action-glass pricing-plan-card__button ${
                  isActive ? "cursor-not-allowed opacity-45" : ""
                }`}
              >
                {isActive
                  ? "当前套餐"
                  : plan.id === "free" && isLoading
                    ? "处理中..."
                    : ctaText}
              </button>
            </div>
          );
        })}
        </div>

        <p className="pricing-section__note">
          当前会员通过兑换码开通，已上线权益以勾选项为准。
          <span className="sr-only">套餐功能说明</span>
        </p>
      </div>
    </section>
  );
}
