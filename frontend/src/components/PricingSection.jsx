import { useState } from "react";

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
 * @param {function} onUpgrade - 点击升级按钮的回调 (plan, orderType) => void
 * @param {boolean} isLoading - 是否正在处理支付
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
    cta: "立即升级",
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
    cta: "终身买断",
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
  isLoading = false,
}) {
  const [billingCycle, setBillingCycle] = useState("monthly"); // monthly | yearly
  const [couponCode, setCouponCode] = useState("");
  const [redeemStatus, setRedeemStatus] = useState(null);
  const [isRedeeming, setIsRedeeming] = useState(false);

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
      className="py-24 px-4 sm:px-6 lg:px-8 max-w-7xl mx-auto"
      aria-label="会员套餐"
    >
      {/* 标题区 */}
      <div className="text-center mb-16">
        <h2 className="text-4xl sm:text-5xl font-extrabold text-dark-900 tracking-tight">
          选择适合你的
          <span className="bg-gradient-to-r from-primary-600 to-purple-600 bg-clip-text text-transparent">
            {" "}
            套餐
          </span>
        </h2>
        <p className="mt-4 text-lg text-dark-500 max-w-2xl mx-auto">
          从免费版开始，按使用强度升级；页面只展示已上线或明确标注未开放的权益。
        </p>

        {/* 月付/年付切换（仅影响 Pro） */}
        <div className="mt-8 inline-flex items-center bg-dark-100 rounded-xl p-1 gap-1">
          <button
            onClick={() => setBillingCycle("monthly")}
            className={`px-5 py-2 rounded-lg text-sm font-medium transition-all duration-200 ${
              billingCycle === "monthly"
                ? "bg-white text-dark-900 shadow-sm"
                : "text-dark-500 hover:text-dark-700"
            }`}
          >
            月付
          </button>
          <button
            onClick={() => setBillingCycle("yearly")}
            className={`px-5 py-2 rounded-lg text-sm font-medium transition-all duration-200 flex items-center gap-2 ${
              billingCycle === "yearly"
                ? "bg-white text-dark-900 shadow-sm"
                : "text-dark-500 hover:text-dark-700"
            }`}
          >
            年付
            <span className="text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded-full font-semibold">
              省 17%
            </span>
          </button>
        </div>
      </div>

      <form
        onSubmit={handleRedeemSubmit}
        className="mx-auto mb-10 flex max-w-3xl flex-col gap-3 rounded-2xl border border-primary-100 bg-white/85 p-4 shadow-sm shadow-blue-500/5 backdrop-blur sm:flex-row sm:items-center"
      >
        <div className="min-w-0 flex-1">
          <label className="mb-1 block text-sm font-semibold text-dark-800">
            会员兑换码
          </label>
          <input
            value={couponCode}
            onChange={(event) => {
              setCouponCode(event.target.value.toUpperCase());
              setRedeemStatus(null);
            }}
            placeholder="输入咸鱼购买后收到的券码"
            className="w-full rounded-xl border border-dark-200 bg-white px-4 py-2.5 text-sm font-semibold tracking-wide text-dark-900 outline-none transition focus:border-primary-400 focus:ring-4 focus:ring-primary-50"
          />
          {redeemStatus && (
            <p
              className={`mt-2 text-xs font-medium ${
                redeemStatus.type === "success"
                  ? "text-green-600"
                  : redeemStatus.type === "info"
                    ? "text-primary-600"
                    : "text-red-500"
              }`}
            >
              {redeemStatus.message}
            </p>
          )}
        </div>
        <button
          type="submit"
          disabled={isRedeeming}
          className="shrink-0 rounded-xl bg-dark-900 px-5 py-2.5 text-sm font-semibold text-white shadow-lg shadow-dark-900/10 transition hover:bg-dark-800 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-60"
        >
          {isRedeeming ? "兑换中..." : "立即兑换"}
        </button>
      </form>

      {/* 三栏卡片 */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-8 items-start">
        {PLANS.map((plan) => {
          const isActive = isCurrentPlan(plan.id);

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
              className={`relative rounded-2xl border-2 p-8 transition-all duration-300 hover:shadow-xl ${
                plan.highlight
                  ? "border-primary-500 shadow-lg shadow-primary-500/10 scale-[1.02] bg-white"
                  : "border-dark-200 bg-white hover:border-primary-300"
              } ${isActive ? "ring-2 ring-primary-300 ring-offset-2" : ""}`}
            >
              {/* 推荐标签 */}
              {plan.badge && (
                <div className="absolute -top-3 left-1/2 -translate-x-1/2">
                  <span
                    className={`px-4 py-1 rounded-full text-xs font-bold tracking-wide uppercase ${
                      plan.highlight
                        ? "bg-primary-600 text-white shadow-md shadow-primary-600/30"
                        : "bg-purple-600 text-white shadow-md shadow-purple-600/30"
                    }`}
                  >
                    {plan.badge}
                  </span>
                </div>
              )}

              {/* 当前套餐标签 */}
              {isActive && (
                <div className="absolute top-4 right-4">
                  <span className="px-3 py-1 bg-green-100 text-green-700 text-xs font-semibold rounded-full">
                    当前套餐
                  </span>
                </div>
              )}

              {/* 套餐名称 */}
              <div className="mb-6">
                <h3 className="text-xl font-bold text-dark-900">{plan.name}</h3>
                <p className="text-sm text-dark-400 mt-1">{plan.desc}</p>
              </div>

              {/* 价格 */}
              <div className="mb-6">
                <div className="flex items-baseline gap-1">
                  <span className="text-4xl font-extrabold text-dark-900">
                    {priceDisplay}
                  </span>
                  {periodLabel && (
                    <span className="text-dark-400 text-sm">{periodLabel}</span>
                  )}
                </div>
                {/* 年付优惠提示 */}
                {plan.id === "pro" && billingCycle === "yearly" && (
                  <p className="text-sm text-green-600 mt-1">
                    约 ¥8.3/月，比月付省 ¥19.8
                  </p>
                )}
              </div>

              {/* 权益列表 */}
              <ul className="space-y-3 mb-8">
                {plan.features.map((feature, idx) => (
                  <li key={idx} className="flex items-start gap-3">
                    {feature.included ? (
                      <svg
                        className={`w-5 h-5 mt-0.5 flex-shrink-0 ${
                          feature.highlight
                            ? "text-primary-600"
                            : "text-green-500"
                        }`}
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
                        className="w-5 h-5 mt-0.5 flex-shrink-0 text-dark-300"
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
                      className={`text-sm ${
                        feature.included
                          ? feature.highlight
                            ? "text-dark-900 font-semibold"
                            : "text-dark-600"
                          : "text-dark-400 line-through"
                      }`}
                    >
                      {feature.text}
                    </span>
                  </li>
                ))}
              </ul>

              {/* 行动按钮 */}
              <button
                onClick={() => {
                  if (!isActive) {
                    const orderType =
                      plan.id === "ultra"
                        ? "lifetime"
                        : billingCycle === "yearly"
                          ? "yearly"
                          : "monthly";
                    onUpgrade(plan.id, orderType);
                  }
                }}
                disabled={isActive || isLoading}
                className={`w-full py-3 rounded-xl text-sm font-semibold transition-all duration-200 ${
                  isActive
                    ? "bg-dark-100 text-dark-400 cursor-not-allowed"
                    : plan.highlight
                      ? "bg-primary-600 text-white hover:bg-primary-700 shadow-lg shadow-primary-600/30 active:scale-[0.98]"
                      : "bg-dark-900 text-white hover:bg-dark-800 shadow-lg shadow-dark-900/10 active:scale-[0.98]"
                } disabled:opacity-60`}
              >
                {isActive ? "当前套餐" : isLoading ? "处理中..." : plan.cta}
              </button>
            </div>
          );
        })}
      </div>

      {/* 底部说明 */}
      <p className="text-center text-sm text-dark-400 mt-10">
        当前价格用于演示套餐和额度逻辑。正式支付接入后，升级会在支付成功后立即生效。
        <br />
        已上线权益以页面勾选项为准；批量下载、去水印、优先技术支持仍需单独开发后再开放。
        {/* 保持二行说明，避免套餐底部视觉过空 */}
        <span className="sr-only">套餐功能说明</span>
      </p>
    </section>
  );
}
