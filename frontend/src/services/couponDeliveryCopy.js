const REDEEM_URL = "https://jdnlab.com/redeem";

const PLAN_DETAILS = {
  "pro:weekly": {
    label: "Pro 创作版周卡（7 天）",
    benefits: [
      "每日 30 次视频下载",
      "每日 10 次 AI 总结/思维导图",
      "批量解析（5 条/批、10 条/日）",
      "双语字幕与 AI 创作包共用 10 次/日额度",
      "支持 SRT/VTT、Markdown 和思维导图导出",
    ],
  },
  "pro:monthly": {
    label: "Pro 创作版月卡（30 天）",
    benefits: [
      "每日 30 次视频下载",
      "每日 10 次 AI 总结/思维导图",
      "批量解析（5 条/批、10 条/日）",
      "双语字幕与 AI 创作包共用 10 次/日额度",
      "支持 SRT/VTT、Markdown 和思维导图导出",
    ],
  },
  "pro:yearly": {
    label: "Pro 创作版年卡（365 天）",
    benefits: [
      "每日 30 次视频下载",
      "每日 10 次 AI 总结/思维导图",
      "批量解析（5 条/批、10 条/日）",
      "双语字幕与 AI 创作包共用 10 次/日额度",
      "支持 SRT/VTT、Markdown 和思维导图导出",
    ],
  },
  "ultra:lifetime": {
    label: "Ultra 权益版终身卡",
    benefits: [
      "每日 100 次视频下载",
      "每日 50 次 AI 总结/思维导图",
      "批量解析（15 条/批、30 条/日）",
      "双语字幕与 AI 创作包共用 30 次/日额度",
      "支持字幕、Markdown 和思维导图导出",
    ],
  },
};

function getRemainingRedemptions(coupon = {}) {
  const maxRedemptions = Math.max(1, Number(coupon.max_redemptions) || 1);
  if (coupon.remaining_redemptions === undefined || coupon.remaining_redemptions === null) {
    return maxRedemptions;
  }
  return Math.max(0, Number(coupon.remaining_redemptions) || 0);
}

export function getCouponPlanLabel(coupon = {}) {
  return PLAN_DETAILS[`${coupon.plan}:${coupon.order_type}`]?.label || "会员兑换卡";
}

export function formatCouponExpiry(expiresAt) {
  const timestamp = Number(expiresAt) || 0;
  if (timestamp <= 0) return "";

  const parts = new Intl.DateTimeFormat("zh-CN", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date(timestamp * 1000));
  const values = Object.fromEntries(parts.map(({ type, value }) => [type, value]));
  return `${values.year}-${values.month}-${values.day}`;
}

export function buildCouponDeliveryCopy(coupon = {}) {
  const code = String(coupon.code || "").trim();
  const detail = PLAN_DETAILS[`${coupon.plan}:${coupon.order_type}`] || {
    label: getCouponPlanLabel(coupon),
    benefits: ["请以兑换后个人中心展示的权益为准"],
  };
  const maxRedemptions = Math.max(1, Number(coupon.max_redemptions) || 1);
  const remainingRedemptions = getRemainingRedemptions(coupon);
  const expiresAt = formatCouponExpiry(coupon.expires_at);
  const redemptionNote = maxRedemptions === 1
    ? "本兑换码仅限 1 个账号兑换，请勿转发或重复使用。"
    : `此兑换码最多可兑换 ${maxRedemptions} 次，当前剩余可兑换次数：${remainingRedemptions}。`;
  const expiryNote = expiresAt
    ? `兑换码有效至：${expiresAt}，请在截止日前完成兑换。`
    : "兑换码未单独设置截止日，售出后请尽快完成兑换。";

  return [
    "您好，感谢购买，以下是您的会员兑换信息：",
    "",
    `套餐：${detail.label}`,
    `兑换码：${code || "请向卖家索取兑换码"}`,
    redemptionNote,
    expiryNote,
    "",
    "兑换步骤：",
    "1. 使用自己的邮箱注册或登录网站账号；",
    `2. 打开兑换中心：${REDEEM_URL}`,
    "3. 输入上方兑换码并确认兑换；",
    "4. 兑换成功后，可在个人中心查看套餐到期时间和每日额度。",
    "",
    "本套餐主要权益：",
    ...detail.benefits.map((benefit) => `- ${benefit}`),
    "",
    "使用说明：仅支持处理本人拥有或已获授权的公开视频内容；不支持绕过付费、私密、地区或版权限制。",
    "售后说明：兑换成功后的数字商品不支持退换；未兑换前如有问题请先联系我。",
  ].join("\n");
}
