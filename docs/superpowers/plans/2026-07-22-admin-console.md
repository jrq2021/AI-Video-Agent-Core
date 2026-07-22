# 后台管理系统 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在现有网站中交付受邮箱白名单保护的 `/admin` 后台，支持运营概览、用户管理、卡券批量交付和操作日志。

**Architecture:** 后端以 `runtime_config.py` 读取管理员邮箱白名单，在 `auth.py` 对账号状态做服务端强制校验，并用新的 `admin_service.py` 聚合 `users.db` 与 `membership.db`。`main.py` 仅暴露 `/api/admin/*` HTTP 接口。前端通过现有 SPA 路由渲染 `AdminPage`，以无新增依赖的 SVG/CSS 呈现图表。

**Tech Stack:** Python 3.12、FastAPI、SQLite、React 18、Vite、Lucide React、现有原生 Node test / Python unittest。

## Global Constraints

- 生产环境 `.env` 必须新增 `ADMIN_EMAILS`，为英文逗号分隔的管理员邮箱；不得将实际邮箱、JWT、SMTP 或支付密钥写入 Git。
- 所有 `/api/admin/*` 权限判断必须在后端完成，前端路由保护只用于体验。
- 用户删除为逻辑删除，所有账号、订单、兑换和解析数据保留；禁用、删除、恢复、套餐调整、卡券撤销都写入审计日志。
- 管理员不能禁用、删除、恢复或修改自己的套餐；所有破坏性用户操作需要前端二次确认。
- 不新增图表依赖、独立子域名、独立前端项目、财务后台或多角色系统。
- 不修改用户自有未跟踪文件 `frontend/vite.session.config.mjs` 或本地发布压缩包。

---

## 文件结构

| 文件 | 职责 |
| --- | --- |
| `backend/runtime_config.py` | 解析并校验 `ADMIN_EMAILS`。 |
| `backend/auth.py` | 用户状态迁移、登录/令牌使用时的账号状态校验、管理员依赖。 |
| `backend/membership.py` | 管理员可用的套餐调整、卡券列表/撤销与批量生成基础函数。 |
| `backend/admin_service.py` | 跨两份 SQLite 数据库的概览、用户列表、审计日志与 CSV 行数据聚合。 |
| `backend/main.py` | 管理 API 请求模型和 `/api/admin/*` 路由。 |
| `backend/test_admin_access.py` | 权限、账号状态和自我保护回归测试。 |
| `backend/test_admin_service.py` | 概览、用户、卡券与审计服务测试。 |
| `frontend/src/services/adminApi.js` | 管理 API 请求、错误处理和 CSV 下载帮助函数。 |
| `frontend/src/services/adminApi.test.js` | 管理 API 请求数据转换单元测试。 |
| `frontend/src/services/appNavigation.js` | 注册 `/admin` 路由。 |
| `frontend/src/components/AdminPage.jsx` | 后台页面容器、导航、数据加载、授权/错误状态。 |
| `frontend/src/components/admin/*.jsx` | 概览、用户表、用户详情抽屉、卡券和操作日志的单一职责组件。 |
| `frontend/src/App.jsx` | 连接 `/admin` 路由、现有登录态与后台页面。 |
| `frontend/src/index.css` | 后台布局、图表、抽屉、弹窗及移动端样式。 |

## Task 1: 管理员配置、账号状态与审计表

**Files:**
- Modify: `backend/runtime_config.py`
- Modify: `backend/auth.py`
- Create: `backend/test_admin_access.py`
- Modify: `backend/.env.example`

**Interfaces:**
- Produces `RuntimeSettings.admin_emails: tuple[str, ...]`。
- Produces `auth.get_current_admin(request: Request) -> dict`。
- Produces `auth.set_user_account_status(user_id: str, status: str, actor_id: str) -> dict`。
- Produces `auth.record_admin_audit(actor_id: str, action: str, target_type: str, target_id: str, before: dict, after: dict) -> None`。

- [ ] **Step 1: 写出账号状态和管理员访问的失败测试**

```python
class AdminAccessTest(unittest.TestCase):
    def test_non_whitelisted_user_is_rejected(self):
        with patch.dict(os.environ, {"ADMIN_EMAILS": "owner@example.com"}, clear=False):
            request = bearer_request(auth.create_token("member"))
            with self.assertRaisesRegex(HTTPException, "管理员权限"):
                auth.get_current_admin(request)

    def test_disabled_user_cannot_use_existing_token(self):
        token = auth.create_token("member")
        auth.set_user_account_status("member", "disabled", "owner")
        with self.assertRaisesRegex(HTTPException, "账号已禁用"):
            auth.get_current_user(bearer_request(token))

    def test_admin_cannot_change_own_account_status(self):
        with self.assertRaisesRegex(ValueError, "不能操作自己的账号"):
            auth.set_user_account_status("owner", "disabled", "owner")
```

- [ ] **Step 2: 运行测试确认当前实现失败**

Run: `Push-Location backend; $env:PYTHONPATH="$PWD\venv\Lib\site-packages"; python -m unittest test_admin_access.py; Pop-Location`

Expected: 失败，提示缺少 `get_current_admin` 或 `set_user_account_status`。

- [ ] **Step 3: 实现配置与无损 SQLite 迁移**

在 `RuntimeSettings` 添加字段并解析小写、去重后的邮箱：

```python
admin_emails = tuple(
    sorted({value.strip().lower() for value in _non_empty(env, "ADMIN_EMAILS").split(",") if value.strip()})
)
if app_env == "production" and not admin_emails:
    raise ConfigurationError("生产环境缺少 ADMIN_EMAILS")
```

在 `init_db()` 中通过 `PRAGMA table_info(users)` 检查并仅在缺少时执行：

```python
conn.execute("ALTER TABLE users ADD COLUMN account_status TEXT NOT NULL DEFAULT 'active'")
conn.execute("ALTER TABLE users ADD COLUMN status_updated_at INTEGER NOT NULL DEFAULT 0")
```

同一数据库创建审计表：

```sql
CREATE TABLE IF NOT EXISTS admin_audit_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    actor_id TEXT NOT NULL,
    action TEXT NOT NULL,
    target_type TEXT NOT NULL,
    target_id TEXT NOT NULL,
    before_json TEXT NOT NULL DEFAULT '{}',
    after_json TEXT NOT NULL DEFAULT '{}',
    created_at INTEGER NOT NULL
)
```

`get_current_user()` 在 JWT 解码后查询用户的 `account_status`；`disabled` 抛出 403“账号已禁用”，`deleted` 抛出 403“账号已删除”。`authenticate_user()` 也必须拒绝非 `active` 账号，确保禁用或逻辑删除后既不能继续使用旧令牌，也不能重新登录。`get_current_admin()` 复用该函数，再匹配 `get_runtime_settings().admin_emails`。状态写入函数只接受 `active`、`disabled`、`deleted`，拒绝 `user_id == actor_id`，写入变更前后审计记录。每次 `init_db()` 启动时删除 `created_at` 早于当前时间 90 天的 `admin_audit_logs`，其余审计记录保留。

在 `.env.example` 增加不含真实邮箱的：

```env
ADMIN_EMAILS="owner@example.com"
```

- [ ] **Step 4: 运行账号状态与权限测试确认通过**

Run: `Push-Location backend; $env:PYTHONPATH="$PWD\venv\Lib\site-packages"; python -m unittest test_admin_access.py test_runtime_config.py; Pop-Location`

Expected: 所有测试通过。

- [ ] **Step 5: 提交本任务**

```powershell
git add backend/runtime_config.py backend/auth.py backend/test_admin_access.py backend/.env.example
git commit -m "feat: add admin access control"
```

## Task 2: 会员、卡券与管理服务

**Files:**
- Modify: `backend/membership.py`
- Create: `backend/admin_service.py`
- Create: `backend/test_admin_service.py`

**Interfaces:**
- Produces `membership.set_admin_membership(user_id, plan, order_type) -> dict`。
- Produces `membership.list_membership_coupons(status, offset, limit) -> tuple[list[dict], int]`。
- Produces `membership.revoke_membership_coupon(code) -> dict`。
- Produces `admin_service.get_overview(now: int | None = None) -> dict`。
- Produces `admin_service.list_users(query, status, plan, page, page_size) -> dict`。
- Produces `admin_service.get_user_detail(user_id: str) -> dict`，包含会员与最近兑换记录。
- Produces `admin_service.list_audit_logs(page, page_size) -> dict`。

- [ ] **Step 1: 写出概览、用户、卡券撤销的失败测试**

```python
def test_overview_counts_today_registration_paid_members_and_coupon_statuses(self):
    overview = admin_service.get_overview(now=1_720_000_000)
    self.assertEqual(overview["metrics"]["total_users"], 3)
    self.assertEqual(overview["metrics"]["paid_users"], 2)
    self.assertEqual(overview["coupon_statuses"]["active"], 1)

def test_list_users_merges_status_and_membership_then_filters(self):
    result = admin_service.list_users(query="pro@", status="active", plan="pro", page=1, page_size=20)
    self.assertEqual(result["total"], 1)
    self.assertEqual(result["items"][0]["email"], "pro@example.com")

def test_revoke_coupon_keeps_existing_redemption_history(self):
    coupon = membership.create_membership_coupon("pro", "monthly", max_redemptions=2)
    membership.redeem_membership_coupon("buyer", coupon)
    revoked = membership.revoke_membership_coupon(coupon)
    self.assertEqual(revoked["status"], "revoked")
```

- [ ] **Step 2: 运行测试确认服务尚不存在**

Run: `Push-Location backend; $env:PYTHONPATH="$PWD\venv\Lib\site-packages"; python -m unittest test_admin_service.py; Pop-Location`

Expected: 失败，提示缺少 `admin_service` 或卡券管理函数。

- [ ] **Step 3: 实现会员调整和卡券管理基础函数**

`set_admin_membership` 接受 `free`、`pro`、`ultra` 和类型 `weekly/monthly/yearly/lifetime`。`free` 写入 `plan='free'`、`expires_at=0`；`pro` 使用 `_membership_duration_days`；`ultra` 固定终身。函数返回序列化后的 `QuotaInfo`。为保证批量发券原子性，将既有单张创建逻辑提取为可复用的“使用调用方传入连接”辅助函数；批量接口在同一 `membership.db` 事务内生成全部卡券，任一张失败即回滚。

`revoke_membership_coupon` 只更新 `status='active'` 的卡券为 `revoked`，返回更新后的卡券；状态为 `used`、`revoked` 或 `expired` 时抛出 `ValueError`。卡券查询使用参数化 SQL，状态为 `all` 时不拼接过滤条件，其余只允许 `active/used/revoked/expired`。

`admin_service.py` 从 `auth._get_db()` 读取用户和审计记录，从 `membership._get_db()` 读取会员、卡券和兑换记录，以 `user_id` 在 Python 中合并。返回 JSON 原生类型：时间为 Unix 秒，分页格式固定为 `{"items": [...], "page": 1, "page_size": 20, "total": 0}`。概览中的注册趋势固定返回最近 7 个自然日、包括 0 值日期。

- [ ] **Step 4: 运行服务测试确认通过**

Run: `Push-Location backend; $env:PYTHONPATH="$PWD\venv\Lib\site-packages"; python -m unittest test_admin_service.py test_coupon_admin.py test_membership_creator.py; Pop-Location`

Expected: 所有测试通过。

- [ ] **Step 5: 提交本任务**

```powershell
git add backend/membership.py backend/admin_service.py backend/test_admin_service.py
git commit -m "feat: add admin user and coupon services"
```

## Task 3: 管理 HTTP API 与导出

**Files:**
- Modify: `backend/main.py`
- Create: `backend/test_admin_api.py`

**Interfaces:**
- Consumes `auth.get_current_admin`、`admin_service.*`、`membership.*`。
- Produces `/api/admin/overview`、`/api/admin/users`、`/api/admin/users/{user_id}`、`/api/admin/users/{user_id}/membership`、`/api/admin/users/{user_id}/status`、`/api/admin/coupons`、`/api/admin/coupons/batch`、`/api/admin/coupons/{code}/revoke`、`/api/admin/coupons/export`、`/api/admin/audit-logs`。

- [ ] **Step 1: 写出管理员 API 的失败测试**

```python
def test_overview_requires_admin(self):
    with self.assertRaises(HTTPException) as caught:
        asyncio.run(main.admin_overview(user={"id": "member", "email": "member@example.com"}))
    self.assertEqual(caught.exception.status_code, 403)

def test_batch_coupon_endpoint_returns_codes_and_audit_event(self):
    payload = main.AdminCouponBatchRequest(plan="pro", order_type="weekly", count=2, expires_days=30, note="xianyu", max_redemptions=1)
    result = asyncio.run(main.admin_create_coupons(payload, user=ADMIN_USER))
    self.assertEqual(len(result["coupons"]), 2)
    self.assertTrue(all(code.startswith("JD-") for code in result["coupons"]))

def test_coupon_export_is_csv_attachment(self):
    response = asyncio.run(main.admin_export_coupons(status="active", user=ADMIN_USER))
    self.assertEqual(response.media_type, "text/csv")
    self.assertIn("attachment", response.headers["content-disposition"])
```

- [ ] **Step 2: 运行测试确认当前没有这些接口**

Run: `Push-Location backend; $env:PYTHONPATH="$PWD\venv\Lib\site-packages"; python -m unittest test_admin_api.py; Pop-Location`

Expected: 失败，提示缺少 `admin_overview` 或请求模型。

- [ ] **Step 3: 实现严格的请求模型、路由与 CSV 响应**

新增 Pydantic 请求模型：

```python
class AdminMembershipRequest(BaseModel):
    plan: Literal["free", "pro", "ultra"]
    order_type: Literal["weekly", "monthly", "yearly", "lifetime"] = "monthly"

class AdminUserStatusRequest(BaseModel):
    status: Literal["active", "disabled", "deleted"]

class AdminCouponBatchRequest(BaseModel):
    plan: Literal["pro", "ultra"]
    order_type: Literal["weekly", "monthly", "yearly", "lifetime"] = "monthly"
    count: int = Field(ge=1, le=100)
    expires_days: int = Field(default=0, ge=0, le=3650)
    note: str = Field(default="", max_length=120)
    max_redemptions: int = Field(default=1, ge=1, le=100)
```

每个路由以 `user: dict = Depends(get_current_admin)` 作为依赖。修改用户状态和会员前检查 `user_id != user["id"]`，并将 `before` 与 `after` 摘要交给 `record_admin_audit`；批量发券和撤销卡券同样写审计日志。批量生成使用 Task 2 的同连接辅助函数，在一个 SQLite 事务中完成，任一张失败即回滚；导出使用 `csv.DictWriter` 写入 `io.StringIO`，经 `Response(..., media_type="text/csv; charset=utf-8")` 返回并设置 `Content-Disposition: attachment; filename="coupons.csv"`。

- [ ] **Step 4: 运行管理员 API 与全量后端测试**

Run: `Push-Location backend; $env:PYTHONPATH="$PWD\venv\Lib\site-packages"; python -m unittest discover -p "test_*.py"; Pop-Location`

Expected: 所有测试通过。

- [ ] **Step 5: 提交本任务**

```powershell
git add backend/main.py backend/test_admin_api.py
git commit -m "feat: expose admin management api"
```

## Task 4: 后台路由与前端数据访问

**Files:**
- Create: `frontend/src/services/adminApi.js`
- Create: `frontend/src/services/adminApi.test.js`
- Modify: `frontend/src/services/appNavigation.js`
- Modify: `frontend/src/services/appNavigation.test.js`
- Modify: `frontend/src/App.jsx`

**Interfaces:**
- Produces `adminApi.requestAdmin(path, options, token)`、`adminApi.downloadCouponCsv(token, status)`。
- Produces `admin` 页面标识与 `/admin` 路由。
- Produces `<AdminPage token={token} onBackHome={fn} onLogout={fn} />` 的应用入口。

- [ ] **Step 1: 写出导航和请求封装的失败测试**

```javascript
test("admin route maps to /admin", () => {
  assert.equal(getPageFromPath("/admin"), "admin");
  assert.equal(getPathForPage("admin"), "/admin");
});

test("admin request forwards bearer token and surfaces API detail", async () => {
  const fetchImpl = async (_url, options) => new Response(JSON.stringify({ detail: "管理员权限不足" }), { status: 403 });
  await assert.rejects(() => requestAdmin("/overview", {}, "token", fetchImpl), /管理员权限不足/);
});
```

- [ ] **Step 2: 运行 Node 测试确认失败**

Run: `Push-Location frontend; node --test src/services/adminApi.test.js src/services/appNavigation.test.js; Pop-Location`

Expected: 失败，提示缺少 `adminApi.js` 或 `admin` 路由。

- [ ] **Step 3: 实现 API 客户端、下载和页面入口**

`requestAdmin` 固定使用 `/api/admin` 前缀、JSON 请求头与 `Authorization: Bearer ${token}`，对非 2xx 优先抛出后端 `detail`。CSV 下载读取 `Blob`，创建临时对象 URL 并触发文件名为 `coupons.csv` 的下载，最后 `URL.revokeObjectURL`。

在 `PAGE_PATHS` 增加：

```javascript
admin: "/admin",
```

在 `App.jsx` 的 `profile/redeem/parse` 分支前增加 `page === "admin"` 分支；无 token 时渲染 `AdminPage` 的登录提示，已有 token 时传递 token、`navigateTo("home")` 与现有 `handleLogout`。后端返回 403 时由后台页面展示“无管理权限”并提供返回首页按钮，不在前端伪造管理员判断。

- [ ] **Step 4: 运行前端单元测试**

Run: `Push-Location frontend; node --test src/services/adminApi.test.js src/services/appNavigation.test.js; Pop-Location`

Expected: 所有测试通过。

- [ ] **Step 5: 提交本任务**

```powershell
git add frontend/src/services/adminApi.js frontend/src/services/adminApi.test.js frontend/src/services/appNavigation.js frontend/src/services/appNavigation.test.js frontend/src/App.jsx
git commit -m "feat: add admin route and api client"
```

## Task 5: 概览与操作日志界面

**Files:**
- Create: `frontend/src/components/AdminPage.jsx`
- Create: `frontend/src/components/admin/AdminOverview.jsx`
- Create: `frontend/src/components/admin/AuditLogTable.jsx`
- Modify: `frontend/src/index.css`

**Interfaces:**
- Consumes `requestAdmin("/overview", ...)` 与 `requestAdmin("/audit-logs", ...)`。
- Produces `<AdminPage>` 的概览、错误、加载、无权限和日志页。

- [ ] **Step 1: 写出格式化和图表数据转换的失败测试**

```javascript
test("buildTrendPoints preserves zero-value dates", () => {
  const points = buildTrendPoints([
    { date: "2026-07-20", count: 0 },
    { date: "2026-07-21", count: 3 },
  ], 300, 120);
  assert.equal(points.length, 2);
  assert.match(points[0], /^0,/);
});
```

将纯函数放在 `frontend/src/services/adminApi.js` 并从测试导出，避免在 JSX 测试 DOM 实现细节。

- [ ] **Step 2: 运行测试确认失败**

Run: `Push-Location frontend; node --test src/services/adminApi.test.js; Pop-Location`

Expected: 失败，提示缺少 `buildTrendPoints`。

- [ ] **Step 3: 实现概览、日志及状态界面**

`AdminPage` 用 `useEffect` 并行加载 `/overview`、`/users?page=1&page_size=20`、`/coupons?status=all&page=1&page_size=20`、`/audit-logs?page=1&page_size=20`。加载中显示骨架；`401` 显示登录提示；`403` 显示无权限；其他错误展示重试按钮。

`AdminOverview` 使用四个指标条目、内联 `<svg viewBox="0 0 300 120">` 注册趋势折线和基于套餐数量的 CSS conic-gradient 环图；不添加外部图表依赖。`AuditLogTable` 显示管理员、动作、对象、摘要与本地化时间。

新增样式以 `.admin-shell` 为根，宽屏侧栏宽 232px，小于 860px 时折叠为横向导航；所有按钮提供 focus-visible 状态，面板含骨架、空状态、错误状态及 `prefers-reduced-motion` 兼容。

- [ ] **Step 4: 运行服务测试和生产构建**

Run: `Push-Location frontend; node --test src/services/adminApi.test.js; npm run build; Pop-Location`

Expected: 测试通过，Vite 生产构建成功。

- [ ] **Step 5: 提交本任务**

```powershell
git add frontend/src/components/AdminPage.jsx frontend/src/components/admin/AdminOverview.jsx frontend/src/components/admin/AuditLogTable.jsx frontend/src/services/adminApi.js frontend/src/services/adminApi.test.js frontend/src/index.css
git commit -m "feat: add admin overview and audit log"
```

## Task 6: 用户与卡券操作界面

**Files:**
- Create: `frontend/src/components/admin/UserTable.jsx`
- Create: `frontend/src/components/admin/UserDetailDrawer.jsx`
- Create: `frontend/src/components/admin/CouponManager.jsx`
- Modify: `frontend/src/components/AdminPage.jsx`
- Modify: `frontend/src/index.css`
- Modify: `frontend/src/services/adminApi.js`
- Modify: `frontend/src/services/adminApi.test.js`

**Interfaces:**
- Consumes users、coupons 分页结果和管理 API。
- Produces `UserTable` 搜索/筛选/分页、`UserDetailDrawer` 二次确认动作、`CouponManager` 批量生成/复制/导出/撤销。

- [ ] **Step 1: 写出用户请求和卡券输入的失败测试**

```javascript
test("buildUserQuery omits empty filters and preserves page", () => {
  assert.equal(buildUserQuery({ query: "", status: "all", plan: "pro", page: 2 }), "?plan=pro&page=2&page_size=20");
});

test("validateCouponBatch rejects count outside 1 to 100", () => {
  assert.equal(validateCouponBatch({ count: 0 }).count, "数量需为 1-100");
  assert.deepEqual(validateCouponBatch({ plan: "pro", order_type: "weekly", count: 2, expires_days: 0, max_redemptions: 1 }), {});
});
```

- [ ] **Step 2: 运行测试确认失败**

Run: `Push-Location frontend; node --test src/services/adminApi.test.js; Pop-Location`

Expected: 失败，提示缺少 `buildUserQuery` 或 `validateCouponBatch`。

- [ ] **Step 3: 实现用户管理交互**

`UserTable` 将关键词、状态和套餐作为受控输入；点击查询回到第 1 页；分页只发送合法正整数。`UserDetailDrawer` 显示账号、状态、会员、到期、当日额度和最近兑换。套餐表单只能提交 `free/pro/ultra` 与合法类型；状态动作按钮对当前登录管理员用户禁用。

每个状态、套餐、删除/恢复动作都先打开确认弹窗，确认后调用 `PATCH /users/{id}/status` 或 `PATCH /users/{id}/membership`，成功后刷新概览、用户和日志数据；失败时保留抽屉并显示后端错误。

- [ ] **Step 4: 实现卡券管理交互**

`CouponManager` 的生成表单使用 `validateCouponBatch`，仅允许 Pro 的周/月/年和 Ultra 的终身类型。生成结果以只读文本列表展示，提供 `navigator.clipboard.writeText(codes.join("\n"))` 和 CSV 下载。列表展示状态、兑换进度、兑换账号、时间和备注；撤销按钮仅在服务端返回 `active` 时显示，点击必须二次确认。

- [ ] **Step 5: 验证前端行为和构建**

Run: `Push-Location frontend; node --test src/services/adminApi.test.js src/services/appNavigation.test.js; npm run build; Pop-Location`

Expected: 测试通过，生产构建成功。

- [ ] **Step 6: 提交本任务**

```powershell
git add frontend/src/components/AdminPage.jsx frontend/src/components/admin/UserTable.jsx frontend/src/components/admin/UserDetailDrawer.jsx frontend/src/components/admin/CouponManager.jsx frontend/src/services/adminApi.js frontend/src/services/adminApi.test.js frontend/src/index.css
git commit -m "feat: add admin users and coupons"
```

## Task 7: 全量验证、运营配置与上线

**Files:**
- Modify: `README.md`
- Modify: `backend/.env.example`
- Test: `backend/test_admin_access.py`
- Test: `backend/test_admin_service.py`
- Test: `backend/test_admin_api.py`
- Test: `frontend/src/services/adminApi.test.js`
- Test: `frontend/src/services/appNavigation.test.js`

- [ ] **Step 1: 补充生产环境管理员配置说明**

在 README 的生产环境段加入：

```env
ADMIN_EMAILS="owner@example.com,second-admin@example.com"
```

说明管理员邮箱必须是已注册账户的邮箱；修改白名单后需重启本项目后端；不得将真实邮箱以外的密钥提交到仓库。

- [ ] **Step 2: 运行后端全量测试**

Run: `Push-Location backend; $env:PYTHONPATH="$PWD\venv\Lib\site-packages"; python -m unittest discover -p "test_*.py"; Pop-Location`

Expected: 全部通过。

- [ ] **Step 3: 运行前端全量 Node 测试与生产构建**

Run: `Push-Location frontend; node --test src/services/*.test.js; npm run build; Pop-Location`

Expected: 全部通过，Vite 构建成功；如仍有现存 bundle 大小提示，只记录为提示，不将其视为失败。

- [ ] **Step 4: 手动验收**

1. 使用 `ADMIN_EMAILS` 中的账号登录并访问 `/admin`，确认概览、用户、卡券和日志可见。
2. 使用普通账号访问 `/admin`，确认显示无权限；直接请求 `/api/admin/overview` 返回 403。
3. 禁用测试用户，确认该用户的现有 token 调用 `/api/auth/me` 返回 403；恢复后可重新登录。
4. 生成两张 Pro 周卡，复制全部、下载 CSV、兑换其中一张、撤销另一张，确认列表和日志一致。
5. 逻辑删除测试用户，确认不能登录；恢复后确认可登录且其历史会员/兑换信息仍存在。

- [ ] **Step 5: 提交并推送**

```powershell
git add README.md backend/.env.example
git commit -m "docs: document admin configuration"
git push origin main
```

- [ ] **Step 6: 上线本项目**

沿用现有“新 release 目录 + 8001 灰度 + 8000 切换”的发布方式。服务器 `.env` 在灰度启动前必须设置 `ADMIN_EMAILS`；先验证 `http://127.0.0.1:8001/api/health`，再替换本项目的前端 `dist` 和 8000 Uvicorn 进程。不得修改 Nginx、Docker、面板服务或其他项目端口。
