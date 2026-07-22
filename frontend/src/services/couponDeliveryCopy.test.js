import test from "node:test";
import assert from "node:assert/strict";
import {
  buildCouponDeliveryCopy,
  formatCouponExpiry,
  getCouponPlanLabel,
} from "./couponDeliveryCopy.js";

test("Pro 月卡话术包含兑换码、真实权益与兑换入口", () => {
  const copy = buildCouponDeliveryCopy({
    code: "JD-PRO-MONTHLY",
    plan: "pro",
    order_type: "monthly",
    max_redemptions: 1,
    remaining_redemptions: 1,
    expires_at: 0,
  });

  assert.equal(getCouponPlanLabel({ plan: "pro", order_type: "monthly" }), "Pro 创作版月卡（30 天）");
  assert.match(copy, /JD-PRO-MONTHLY/);
  assert.match(copy, /https:\/\/jdnlab\.com\/redeem/);
  assert.match(copy, /每日 30 次视频下载/);
  assert.match(copy, /批量解析（5 条\/批、10 条\/日）/);
  assert.match(copy, /双语字幕与 AI 创作包共用 10 次\/日额度/);
  assert.match(copy, /仅限 1 个账号兑换/);
  assert.match(copy, /兑换成功后的数字商品不支持退换/);
  assert.doesNotMatch(copy, /无限使用|全平台可用|可绕过/);
});

test("多次兑换和有截止日的卡券话术说明剩余次数和截止日", () => {
  const coupon = {
    code: "JD-MULTI",
    plan: "pro",
    order_type: "yearly",
    max_redemptions: 3,
    remaining_redemptions: 2,
    expires_at: Date.UTC(2026, 11, 31) / 1000,
  };
  const copy = buildCouponDeliveryCopy(coupon);

  assert.equal(formatCouponExpiry(coupon.expires_at), "2026-12-31");
  assert.match(copy, /剩余可兑换次数：2/);
  assert.match(copy, /兑换码有效至：2026-12-31/);
  assert.match(copy, /Pro 创作版年卡（365 天）/);
});

test("Ultra 卡使用权益版标签和对应额度", () => {
  const copy = buildCouponDeliveryCopy({
    code: "JD-ULTRA",
    plan: "ultra",
    order_type: "lifetime",
    max_redemptions: 1,
    remaining_redemptions: 1,
    expires_at: 0,
  });

  assert.equal(getCouponPlanLabel({ plan: "ultra", order_type: "lifetime" }), "Ultra 权益版终身卡");
  assert.match(copy, /每日 100 次视频下载/);
  assert.match(copy, /每日 50 次 AI 总结\/思维导图/);
  assert.match(copy, /批量解析（15 条\/批、30 条\/日）/);
});
