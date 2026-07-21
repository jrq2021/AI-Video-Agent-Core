export const MEMBERSHIP_PLAN_CARDS = [
  {
    id: "free",
    name: "免费版",
    nameEn: "Free",
    description: "登录后体验基础解析、字幕与整理能力",
    delivery: "无需兑换码",
    features: [
      "登录后每日 3 次视频下载",
      "每日 1 次 AI 总结与基础字幕提取",
      "不含批量解析、双语字幕与 AI 创作包",
    ],
    cta: "免费开始",
    modalSummary: "免费体验基础解析与字幕提取。",
  },
  {
    id: "pro",
    name: "创作版",
    nameEn: "Pro",
    description: "为批量整理、字幕翻译和内容二创准备",
    delivery: "闲鱼兑换码开通：周卡 / 月卡 / 年卡",
    features: [
      "每日 30 次视频下载、10 次 AI 总结",
      "每批最多 5 条批量解析公开视频，每日 10 条",
      "双语字幕与 AI 创作包，每日 10 次创作额度",
      "SRT/VTT、Markdown 与思维导图导出",
    ],
    cta: "前往兑换中心",
    modalSummary: "主推兑换码权益：5 条/批、10 条/日批量解析，10 次/日创作额度。",
  },
  {
    id: "ultra",
    name: "权益版",
    nameEn: "Ultra",
    description: "已有 Ultra 用户继续享受更高额度",
    delivery: "已有用户兼容权益，不作为新用户主推商品",
    features: [
      "每日 100 次视频下载、50 次 AI 总结",
      "每批最多 15 条批量解析公开视频，每日 30 条",
      "双语字幕与 AI 创作包，每日 30 次创作额度",
      "SRT/VTT、Markdown 与思维导图导出",
    ],
    cta: "查看兑换说明",
    modalSummary: "已有用户兼容权益：15 条/批、30 条/日批量解析，30 次/日创作额度。",
  },
];

export const MEMBERSHIP_FAQS = [
  {
    question: "需要付费吗？有哪些权益？",
    answer: "登录后可使用免费基础功能；Pro 兑换码解锁批量解析、双语字幕和 AI 创作包。Ultra 已有用户保留更高额度。",
  },
  {
    question: "兑换码在哪里使用？",
    answer: "注册并登录后，打开 /redeem 输入卖家发送的兑换码；兑换成功后可在兑换中心和个人中心查看到期日及当天额度。",
  },
  {
    question: "会员能解析所有视频吗？",
    answer: "不能。服务仅处理你拥有或已获授权的公开视频；会员不绕过付费、私密、地区或版权访问限制。",
  },
];

export function getMembershipPlanCopy(planId) {
  return MEMBERSHIP_PLAN_CARDS.find((plan) => plan.id === planId) || null;
}
