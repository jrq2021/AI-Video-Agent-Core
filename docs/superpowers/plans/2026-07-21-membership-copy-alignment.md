# Membership Copy Alignment Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace public price-led membership copy with accurate Xianyu redemption-code delivery and creator-benefit copy.

**Architecture:** Create a pure frontend copy module, then make PricingSection, UpgradeModal, and FAQSection consume it. This preserves the existing cards, styles, routes, quota values, and coupon behavior while eliminating duplicated claims.

**Tech Stack:** React 18, Vite, Node built-in test runner.

## Global Constraints

- Do not show public Pro monthly/yearly or Ultra lifetime prices, price-cycle controls, or “批量下载（开发中）”.
- Pro is the primary offer via Xianyu redemption codes with weekly, monthly, and yearly validity.
- Ultra is compatible for existing users, not a new-user purchase offer.
- Only promise public content the user owns or is authorized to process; do not imply bypassing paid, private, regional, or copyright restrictions.
- Keep quotas aligned with `backend/membership.py`: Pro 5 per batch / 10 daily batch / 10 creator; Ultra 15 / 30 / 30.

---

## File Structure

| File | Responsibility |
| --- | --- |
| `frontend/src/services/membershipCopy.js` | Canonical public membership copy. |
| `frontend/src/services/membershipCopy.test.js` | Node tests for public claims. |
| `frontend/src/components/PricingSection.jsx` | Price-free package cards. |
| `frontend/src/components/UpgradeModal.jsx` | Price-free upgrade explanation. |
| `frontend/src/components/FAQSection.jsx` | Redemption and protected-content FAQ. |

## Task 1: Add the tested copy source

**Files:**
- Create: `frontend/src/services/membershipCopy.js`
- Create: `frontend/src/services/membershipCopy.test.js`

**Interfaces:**
- Produces `MEMBERSHIP_PLAN_CARDS`, `MEMBERSHIP_FAQS`, and `getMembershipPlanCopy(planId)`.

- [ ] **Step 1: Write the failing source test**

```js
import test from "node:test";
import assert from "node:assert/strict";
import { MEMBERSHIP_FAQS, MEMBERSHIP_PLAN_CARDS, getMembershipPlanCopy } from "./membershipCopy.js";

test("Pro copy exposes delivery and quotas", () => {
  const pro = getMembershipPlanCopy("pro");
  assert.match(pro.delivery, /周卡.*月卡.*年卡/);
  assert.ok(pro.features.includes("每批最多 5 条批量解析公开视频，每日 10 条"));
  assert.ok(pro.features.includes("双语字幕与 AI 创作包，每日 10 次创作额度"));
});

test("public copy has no price or batch-download promise", () => {
  const copy = JSON.stringify({ MEMBERSHIP_PLAN_CARDS, MEMBERSHIP_FAQS });
  assert.doesNotMatch(copy, /¥|月付|年付|终身买断|批量下载（开发中）/);
});

test("FAQ gives redemption and content-boundary guidance", () => {
  const copy = JSON.stringify(MEMBERSHIP_FAQS);
  assert.match(copy, /\/redeem/);
  assert.match(copy, /不绕过付费、私密、地区或版权访问限制/);
});
```

- [ ] **Step 2: Run the test and verify it fails**

Run: `Push-Location frontend; & 'C:\Users\jrq\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe' --test src/services/membershipCopy.test.js; Pop-Location`

Expected: FAIL because `membershipCopy.js` is absent.

- [ ] **Step 3: Implement exact public copy**

```js
export const MEMBERSHIP_PLAN_CARDS = [
  { id: "free", name: "免费版", nameEn: "Free", description: "登录后体验基础解析、字幕与整理能力", delivery: "无需兑换码", features: ["登录后每日 3 次视频下载", "每日 1 次 AI 总结与基础字幕提取", "不含批量解析、双语字幕与 AI 创作包"], cta: "免费开始", modalSummary: "免费体验基础解析与字幕提取。" },
  { id: "pro", name: "创作版", nameEn: "Pro", description: "为批量整理、字幕翻译和内容二创准备", delivery: "闲鱼兑换码开通：周卡 / 月卡 / 年卡", features: ["每日 30 次视频下载、10 次 AI 总结", "每批最多 5 条批量解析公开视频，每日 10 条", "双语字幕与 AI 创作包，每日 10 次创作额度", "SRT/VTT、Markdown 与思维导图导出"], cta: "前往兑换中心", modalSummary: "主推兑换码权益：5 条/批、10 条/日批量解析，10 次/日创作额度。" },
  { id: "ultra", name: "权益版", nameEn: "Ultra", description: "已有 Ultra 用户继续享受更高额度", delivery: "已有用户兼容权益，不作为新用户主推商品", features: ["每日 100 次视频下载、50 次 AI 总结", "每批最多 15 条批量解析公开视频，每日 30 条", "双语字幕与 AI 创作包，每日 30 次创作额度", "SRT/VTT、Markdown 与思维导图导出"], cta: "查看兑换说明", modalSummary: "已有用户兼容权益：15 条/批、30 条/日批量解析，30 次/日创作额度。" },
];

export const MEMBERSHIP_FAQS = [
  { question: "需要付费吗？有哪些权益？", answer: "登录后可使用免费基础功能；Pro 兑换码解锁批量解析、双语字幕和 AI 创作包。Ultra 已有用户保留更高额度。" },
  { question: "兑换码在哪里使用？", answer: "注册并登录后，打开 /redeem 输入卖家发送的兑换码；兑换成功后可在兑换中心和个人中心查看到期日及当天额度。" },
  { question: "会员能解析所有视频吗？", answer: "不能。服务仅处理你拥有或已获授权的公开视频；会员不绕过付费、私密、地区或版权访问限制。" },
];

export function getMembershipPlanCopy(planId) {
  return MEMBERSHIP_PLAN_CARDS.find((plan) => plan.id === planId) || null;
}
```

- [ ] **Step 4: Run the test and verify it passes**

Run: `Push-Location frontend; & 'C:\Users\jrq\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe' --test src/services/membershipCopy.test.js; Pop-Location`

Expected: 3 passing tests.

- [ ] **Step 5: Commit the copy source**

```bash
git add frontend/src/services/membershipCopy.js frontend/src/services/membershipCopy.test.js; git commit -m "feat: centralize membership copy"
```

## Task 2: Render the shared copy in each public membership entry

**Files:**
- Modify: `frontend/src/components/PricingSection.jsx`
- Modify: `frontend/src/components/UpgradeModal.jsx`
- Modify: `frontend/src/components/FAQSection.jsx`
- Modify: `frontend/src/services/membershipCopy.test.js`

**Interfaces:**
- Consumes `MEMBERSHIP_PLAN_CARDS`, `MEMBERSHIP_FAQS`, and `getMembershipPlanCopy`.
- Keeps existing props, CSS classes, and navigation callbacks.

- [ ] **Step 1: Add the failing component-source test**

```js
import fs from "node:fs";

test("membership entry components import canonical copy", () => {
  for (const path of ["src/components/PricingSection.jsx", "src/components/UpgradeModal.jsx", "src/components/FAQSection.jsx"]) {
    const source = fs.readFileSync(path, "utf8");
    assert.match(source, /membershipCopy/);
    assert.doesNotMatch(source, /批量下载（开发中）/);
  }
});
```

- [ ] **Step 2: Run the focused test and verify it fails**

Run: `Push-Location frontend; & 'C:\Users\jrq\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe' --test src/services/membershipCopy.test.js; Pop-Location`

Expected: FAIL because the entry components do not yet import the module.

- [ ] **Step 3: Implement component consumption**

```jsx
// PricingSection.jsx
import { MEMBERSHIP_PLAN_CARDS } from "../services/membershipCopy";
// Delete local plans, billing-cycle state, billing toggle, and price calculations.
// Render plan.delivery in pricing-plan-card__price and plan.features in the existing list.
// Pro and Ultra keep onNavigate({ page: "redeem" }); Free keeps onUpgrade.

// UpgradeModal.jsx
import { getMembershipPlanCopy } from "../services/membershipCopy";
const proPlan = getMembershipPlanCopy("pro");
const ultraPlan = getMembershipPlanCopy("ultra");
// Replace price rows with proPlan.modalSummary and ultraPlan.modalSummary.

// FAQSection.jsx
import { MEMBERSHIP_FAQS } from "../services/membershipCopy";
// Replace the local array and render faq.question plus faq.answer.
```

- [ ] **Step 4: Run regression tests and build**

Run: `Push-Location frontend; & 'C:\Users\jrq\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe' --test src/services/membershipCopy.test.js src/services/appNavigation.test.js src/services/creatorPack.test.js; & 'C:\Users\jrq\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe' node_modules\vite\bin\vite.js build; Pop-Location`

Expected: all named tests pass and Vite exits 0.

- [ ] **Step 5: Commit the public copy update**

```bash
git add frontend/src/components/PricingSection.jsx frontend/src/components/UpgradeModal.jsx frontend/src/components/FAQSection.jsx frontend/src/services/membershipCopy.test.js; git commit -m "feat: align membership copy with redemption delivery"
```

## Task 3: Verify remaining visible quota claims

**Files:**
- Modify only if a contradiction is found: `frontend/src/hooks/useQuota.js`, `frontend/src/components/ProfilePage.jsx`, `frontend/src/components/RedeemPage.jsx`, `frontend/src/components/BatchParsePanel.jsx`, `frontend/src/components/CreatorPackPanel.jsx`

- [ ] **Step 1: Scan prohibited copy**

Run: `rg -n "¥|月付|年付|终身买断|批量下载（开发中）" frontend/src/components frontend/src/hooks`

Expected: no membership-entry match; legacy order labels can remain only if they are not shown by the coupon-only flow.

- [ ] **Step 2: Verify quota wording**

Run: `rg -n -C 2 "daily_batch_items|daily_creator_credits|batch_max_count" backend/membership.py frontend/src/components frontend/src/hooks`

Expected: Pro 5 per batch / 10 daily batch / 10 creator; Ultra 15 / 30 / 30.

- [ ] **Step 3: Run the full frontend suite and build**

Run: `Push-Location frontend; & 'C:\Users\jrq\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe' --test src/services/*.test.js; & 'C:\Users\jrq\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe' node_modules\vite\bin\vite.js build; Pop-Location`

Expected: every Node test passes and Vite exits 0.

## Plan Self-Review

- **Spec coverage:** Task 1 centralizes delivery and quota copy; Task 2 updates every public membership entry; Task 3 verifies remaining visible claims.
- **Placeholder scan:** All steps include paths, code, commands, outcomes, and commits.
- **Consistency:** The plan uses the confirmed price-free delivery model and `PLAN_CONFIG` quotas.
