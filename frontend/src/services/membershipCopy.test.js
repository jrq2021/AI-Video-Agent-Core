import test from "node:test";
import assert from "node:assert/strict";
import {
  MEMBERSHIP_FAQS,
  MEMBERSHIP_PLAN_CARDS,
  getMembershipPlanCopy,
} from "./membershipCopy.js";

test("Pro copy exposes Xianyu delivery and creator quotas", () => {
  const pro = getMembershipPlanCopy("pro");
  assert.match(pro.delivery, /周卡.*月卡.*年卡/);
  assert.ok(pro.features.includes("每批最多 5 条批量解析公开视频，每日 10 条"));
  assert.ok(pro.features.includes("双语字幕与 AI 创作包，每日 10 次创作额度"));
});

test("public membership copy has no public price or batch-download promise", () => {
  const publicCopy = JSON.stringify({ MEMBERSHIP_PLAN_CARDS, MEMBERSHIP_FAQS });
  assert.doesNotMatch(publicCopy, /¥|月付|年付|终身买断|批量下载（开发中）/);
});

test("FAQ explains redemption and protected-content boundaries", () => {
  const publicCopy = JSON.stringify(MEMBERSHIP_FAQS);
  assert.match(publicCopy, /\/redeem/);
  assert.match(publicCopy, /不绕过付费、私密、地区或版权访问限制/);
});
