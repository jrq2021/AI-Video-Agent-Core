# 卡券闲鱼交付话术与分页 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (\`- [ ]\`) syntax for tracking.

**Goal:** 让运营后台为新生成和库存中的可用卡券提供可直接发送给闲鱼买家的交付话术，并为卡券列表提供分页。

**Architecture:** 新增一个只依赖 coupon 数据的前端纯函数模块，集中生成套餐标签、兑换码有效期和交付话术。CouponManager 在生成结果和可用库存行复用该模块；AdminPage 持有卡券页码，利用现有后端分页参数重新请求 \`/api/admin/coupons\`。

**Tech Stack:** React 18、Vite、Node built-in \`node:test\`、FastAPI 既有管理接口。

## Global Constraints

- 不新增数据库字段、后端路由或依赖。
- 文案只陈述当前实际权益；不承诺无限使用、全平台可用、绕过付费/私密/版权限制。
- 只对 \`status === "active"\` 的库存卡显示复制话术；其他状态不显示。
- 卡券分页每页固定 20 条，筛选状态变化后重置到第 1 页。
- 所有复制失败必须保留文本可手动复制并显示中文反馈。

---

### Task 1: 实现并测试卡券交付话术纯函数

**Files:**
- Create: \`frontend/src/services/couponDeliveryCopy.js\`
- Test: \`frontend/src/services/couponDeliveryCopy.test.js\`

**Interfaces:**
- Produces: \`getCouponPlanLabel(coupon)\`、\`formatCouponExpiry(expiresAt)\`、\`buildCouponDeliveryCopy(coupon)\`。
- Consumes: coupon 的 \`code\`、\`plan\`、\`order_type\`、\`max_redemptions\`、\`remaining_redemptions\`、\`expires_at\`。

- [ ] **Step 1: 写失败测试**

\`\`\`js
import test from "node:test";
import assert from "node:assert/strict";
import { buildCouponDeliveryCopy, getCouponPlanLabel } from "./couponDeliveryCopy.js";

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
  assert.match(copy, /批量解析（5 条\/批、10 条\/日）/);
  assert.match(copy, /仅限 1 个账号兑换/);
  assert.doesNotMatch(copy, /无限|全平台|绕过/);
});

test("多次兑换和有截止日的卡券话术说明剩余次数和截止日", () => {
  const copy = buildCouponDeliveryCopy({
    code: "JD-MULTI",
    plan: "pro",
    order_type: "yearly",
    max_redemptions: 3,
    remaining_redemptions: 2,
    expires_at: Date.UTC(2026, 11, 31) / 1000,
  });
  assert.match(copy, /剩余可兑换次数：2/);
  assert.match(copy, /2026-12-31/);
  assert.match(copy, /年卡（365 天）/);
});
\`\`\`

- [ ] **Step 2: 验证测试失败**

Run: \`node --test src/services/couponDeliveryCopy.test.js\`（工作目录：\`frontend\`）  
Expected: FAIL，提示模块不存在。

- [ ] **Step 3: 编写最小实现**

\`\`\`js
const REDEEM_URL = "https://jdnlab.com/redeem";

export function getCouponPlanLabel({ plan, order_type }) {
  const labels = {
    "pro:weekly": "Pro 创作版周卡（7 天）",
    "pro:monthly": "Pro 创作版月卡（30 天）",
    "pro:yearly": "Pro 创作版年卡（365 天）",
    "ultra:lifetime": "Ultra 权益版终身卡",
  };
  return labels[\`\${plan}:\${order_type}\`] || "会员兑换卡";
}
\`\`\`

实现 \`formatCouponExpiry\` 使用 \`new Date(expiresAt * 1000)\` 和 \`Intl.DateTimeFormat("zh-CN", { timeZone: "Asia/Shanghai", year: "numeric", month: "2-digit", day: "2-digit" })\`，输出 \`YYYY-MM-DD\`。\`buildCouponDeliveryCopy\` 返回包含问候、兑换码、四步兑换路径、当前套餐权益、公开授权限制和数字商品售后说明的多行文本。

- [ ] **Step 4: 验证测试通过**

Run: \`node --test src/services/couponDeliveryCopy.test.js\`  
Expected: PASS，2 个测试通过。

- [ ] **Step 5: 提交**

\`\`\`bash
git add frontend/src/services/couponDeliveryCopy.js frontend/src/services/couponDeliveryCopy.test.js
git commit -m "feat: add coupon delivery copy generator"
\`\`\`

### Task 2: 增加卡券查询参数构建与测试

**Files:**
- Modify: \`frontend/src/services/adminApi.js\`
- Modify: \`frontend/src/services/adminApi.test.js\`

**Interfaces:**
- Produces: \`buildCouponQuery({ status, page })\`，返回 \`?status=<status>&page=<page>&page_size=20\`。
- Consumes: AdminPage 的 \`couponStatus\` 和 \`couponPage\`。

- [ ] **Step 1: 写失败测试**

\`\`\`js
import { buildCouponQuery } from "./adminApi.js";

test("buildCouponQuery 保留状态并规范化页码", () => {
  assert.equal(buildCouponQuery({ status: "active", page: 3 }), "?status=active&page=3&page_size=20");
  assert.equal(buildCouponQuery({ status: "all", page: 0 }), "?status=all&page=1&page_size=20");
});
\`\`\`

- [ ] **Step 2: 验证测试失败**

Run: \`node --test src/services/adminApi.test.js\`  
Expected: FAIL，提示 \`buildCouponQuery\` 未导出。

- [ ] **Step 3: 编写最小实现**

\`\`\`js
export function buildCouponQuery({ status = "all", page = 1 } = {}) {
  const normalizedPage = Math.max(1, Number(page) || 1);
  return \`?status=\${encodeURIComponent(status)}&page=\${normalizedPage}&page_size=20\`;
}
\`\`\`

- [ ] **Step 4: 验证测试通过**

Run: \`node --test src/services/adminApi.test.js\`  
Expected: PASS。

- [ ] **Step 5: 提交**

\`\`\`bash
git add frontend/src/services/adminApi.js frontend/src/services/adminApi.test.js
git commit -m "feat: add coupon pagination query"
\`\`\`

### Task 3: 将分页状态接入管理页

**Files:**
- Modify: \`frontend/src/components/AdminPage.jsx\`

**Interfaces:**
- Consumes: \`buildCouponQuery\`。
- Produces: 向 CouponManager 传递 \`onPage\`，并以当前 \`couponPage\` 请求卡券数据。

- [ ] **Step 1: 修改状态与请求**

新增 \`const [couponPage, setCouponPage] = useState(1);\`；把 \`loadAll\` 扩展为接收 \`nextCouponPage\`，并将固定的 coupons URL 改为：

\`\`\`js
requestAdmin(\`/coupons\${buildCouponQuery({ status: nextCouponStatus, page: nextCouponPage })}\`, {}, token)
\`\`\`

\`updateCoupons(nextStatus)\` 必须执行 \`setCouponPage(1)\` 并调用 \`loadAll(filters, nextStatus, 1)\`；新增 \`updateCouponPage(nextPage)\`，只更新页码并调用 \`loadAll(filters, couponStatus, nextPage)\`。创建、撤销后保留当前页并重新加载；若当前页因最后一条被撤销而超过总页数，使用接口返回的 \`page\` 与 \`total\` 纠正到最后可用页。

- [ ] **Step 2: 运行现有前端单元测试**

Run: \`node --test src/services/adminApi.test.js src/services/couponDeliveryCopy.test.js\`  
Expected: PASS。

- [ ] **Step 3: 提交**

\`\`\`bash
git add frontend/src/components/AdminPage.jsx
git commit -m "feat: paginate admin coupons"
\`\`\`

### Task 4: 在生成区和库存列表添加复制话术 UI

**Files:**
- Modify: \`frontend/src/components/admin/CouponManager.jsx\`
- Modify: \`frontend/src/index.css\`

**Interfaces:**
- Consumes: \`buildCouponDeliveryCopy\`、\`getCouponPlanLabel\`、\`onPage\`、后端返回的 \`coupons.items/page/page_size/total\`。
- Produces: 新生成卡的完整交付话术、active 库存卡的“复制话术”按钮、分页控制。

- [ ] **Step 1: 生成结果改为完整卡券对象**

在 create 成功后，使用当前表单创建：

\`\`\`js
const createdCoupons = (result.coupons || []).map((code) => ({
  code,
  plan: form.plan,
  order_type: form.order_type,
  max_redemptions: Number(form.max_redemptions),
  remaining_redemptions: Number(form.max_redemptions),
  expires_at: form.expires_days > 0 ? Math.floor(Date.now() / 1000) + Number(form.expires_days) * 86400 : 0,
}));
\`\`\`

将 \`createdCodes\` 替换为 \`createdCoupons\`。展示每张券的代码、套餐标签、只读话术文本框及“复制本张话术”按钮；顶部“复制全部发货话术”通过 \`createdCoupons.map(buildCouponDeliveryCopy).join("\\n\\n----------\\n\\n")\` 复制。

- [ ] **Step 2: 增加 active 卡券操作**

在列表最后一列中，仅在 \`item.status === "active"\` 时渲染：

\`\`\`jsx
<button type="button" className="admin-link-button" onClick={() => copyDeliveryCopy(item)}>
  <Copy aria-hidden="true" />复制话术
</button>
\`\`\`

保留“撤销”按钮。used、revoked、expired 行不得渲染复制话术按钮。

- [ ] **Step 3: 增加多次兑换风险提示与分页**

当 \`Number(form.max_redemptions) > 1\` 时，在生成按钮前显示“当前卡券允许多次兑换，不建议按单个闲鱼买家发货”。

使用现有 \`.admin-pagination\` 样式，在卡券表格下渲染：上一页、\`第 {data.page} / {Math.max(1, Math.ceil(data.total / data.page_size))} 页\`、下一页。第一页禁用上一页，末页禁用下一页；按钮调用 \`onPage(data.page - 1)\` 与 \`onPage(data.page + 1)\`。

- [ ] **Step 4: 补充样式与可访问性**

为复制按钮设置 \`display: inline-flex\`、图标间距、焦点样式；生成话术文本框使用折叠式最大高度和 \`white-space: pre-wrap\`。分页按钮在移动端换行但保持可点击。所有状态反馈通过既有 \`aria-live="polite"\` 的 \`message\` 输出。

- [ ] **Step 5: 验证**

Run: \`npm run build\`（工作目录：\`frontend\`）  
Expected: Vite 生产构建成功。

手动验证：生成 1 张 Pro 月卡，复制一张话术；生成 2 张卡，分别复制；切换到已用完筛选确认没有复制话术；创建超过 20 张卡后确认翻页；撤销当前页最后一张卡后确认不会保留空页。

- [ ] **Step 6: 提交**

\`\`\`bash
git add frontend/src/components/admin/CouponManager.jsx frontend/src/index.css
git commit -m "feat: add coupon delivery copy actions"
\`\`\`

### Task 5: 完整回归

**Files:**
- Verify: \`backend/test_admin_api.py\`
- Verify: \`frontend/src/services/adminApi.test.js\`
- Verify: \`frontend/src/services/couponDeliveryCopy.test.js\`

- [ ] **Step 1: 运行后端管理接口回归**

Run: \`..\\.venv\\Scripts\\python.exe -m unittest backend.test_admin_api\`（仓库根目录）  
Expected: PASS。

- [ ] **Step 2: 运行前端纯函数测试与构建**

Run: \`node --test src/services/adminApi.test.js src/services/couponDeliveryCopy.test.js && npm run build\`（工作目录：\`frontend\`）  
Expected: 全部通过；允许现有 bundle-size warning。

- [ ] **Step 3: 提交最终修订**

\`\`\`bash
git status --short
git add frontend/src/services/couponDeliveryCopy.js frontend/src/services/couponDeliveryCopy.test.js frontend/src/services/adminApi.js frontend/src/services/adminApi.test.js frontend/src/components/AdminPage.jsx frontend/src/components/admin/CouponManager.jsx frontend/src/index.css
git commit -m "test: cover coupon delivery copy workflow"
\`\`\`
