# Creator Content Pack Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Sell and deliver a creator-oriented Pro experience through Xianyu-compatible redemption codes, batch parsing, bilingual subtitles, and cached AI creator packs.

**Architecture:** Keep the existing React/Vite and FastAPI/SQLite application. Extend membership's JSON-backed daily usage with two new counters, store batch jobs in a dedicated SQLite store, and store generated translations/creator packs beside existing parse-history artifacts. Reuse the existing OpenAI-compatible DeepSeek client, but validate structured data before it reaches the UI.

**Tech Stack:** React 18, Vite, Node built-in test runner, FastAPI, SQLite, Python `unittest`, OpenAI SDK, existing DeepSeek API integration.

## Global Constraints

- Only publicly accessible content that the user owns or is authorized to process is in scope; do not implement paid/private-content bypassing or watermark removal.
- Keep the existing manual route system; do not add React Router or a background-job dependency.
- Keep the existing single-download, subtitle, summary, mindmap, history, and redemption behavior backward-compatible.
- Batch processing runs with one global worker and one active batch per user; never start unbounded concurrent ASR jobs.
- Every batch-item quota charge and refund must be persisted and idempotent.
- Never expose coupon issuance or revocation through an unauthenticated public HTTP endpoint.
- AI output must be structured, length-limited, cached per record, and sanitized before rich rendering.

---

## File Structure

| File | Responsibility |
| --- | --- |
| `backend/membership.py` | Weekly coupon duration, package limits, creator/batch counters, idempotent quota refunds. |
| `backend/coupon_admin.py` | Local-only seller command to create, list, and revoke coupons. |
| `backend/parse_history.py` | Persist translated segments and creator-pack JSON with migrations. |
| `backend/batch_jobs.py` | SQLite batch-job store, ownership checks, state transitions, recovery queries. |
| `backend/creator_tools.py` | Translation and creator-pack DeepSeek prompts, JSON parsing, data validation. |
| `backend/main.py` | Request models, membership/batch/content APIs, startup worker lifecycle. |
| `frontend/src/services/appNavigation.js` | Add `/redeem` route mapping. |
| `frontend/src/services/creatorPack.js` | Pure bilingual SRT/VTT and Markdown export builders. |
| `frontend/src/hooks/useQuota.js` | Redeem-center state, richer quota refresh, shared authorization headers. |
| `frontend/src/components/RedeemPage.jsx` | Dedicated redemption and post-redeem benefit view. |
| `frontend/src/components/BatchParsePanel.jsx` | Batch URL input, pre-validation, submit, polling, and retry display. |
| `frontend/src/components/CreatorPackPanel.jsx` | Translation and creator-pack actions, cached output, exports. |
| `frontend/src/components/ParsePage.jsx` | Assemble single and batch parsing flows. |
| `frontend/src/components/VideoSubtitle.jsx` | Delegate paid subtitle/creator functionality to `CreatorPackPanel`. |
| `frontend/src/components/ProfilePage.jsx` | Show expiry, batch quota, creator quota, and redeem entry. |
| `frontend/src/App.jsx` | Route `/redeem`, pass membership and batch callbacks, keep route state stable. |
| `frontend/src/index.css` | Match existing cinematic styles for redeem, batch, and creator views. |

## Task 1: Extend membership quota primitives and coupon durations

**Files:**
- Modify: `backend/membership.py:31-150,198-420,450-610`
- Create: `backend/test_membership_creator.py`

**Interfaces:**
- Produces `QuotaInfo.daily_batch_items_limit`, `daily_batch_items_used`, `daily_creator_credits_limit`, `daily_creator_credits_used`, and `can_batch_parse`.
- Produces `check_and_consume_quota(user_id, action, ..., audit_key="")` for `batch_parse`, `translate`, and `creator_pack`.
- Produces `refund_quota_once(user_id, quota_key, audit_key, reason="") -> bool`.
- Produces `create_membership_coupon(..., order_type="weekly")` and a seven-day `_membership_duration_days` branch.

- [ ] **Step 1: Write failing quota and weekly-coupon tests**

```python
class CreatorMembershipTest(unittest.TestCase):
    def test_weekly_coupon_grants_pro_for_seven_days(self):
        code = create_membership_coupon("pro", order_type="weekly")
        result = redeem_membership_coupon("user-week", code)
        self.assertGreater(result["expires_at"], int(time.time()) + 6 * 86400)
        self.assertLess(result["expires_at"], int(time.time()) + 8 * 86400)

    def test_creator_credit_refund_is_idempotent(self):
        first = check_and_consume_quota("user-pro", "creator_pack", audit_key="batch-item-1")
        self.assertTrue(first["allowed"])
        self.assertTrue(refund_quota_once("user-pro", "creator_credits", "batch-item-1"))
        self.assertFalse(refund_quota_once("user-pro", "creator_credits", "batch-item-1"))
```

- [ ] **Step 2: Run the focused test and verify it fails**

Run: `Push-Location backend; $env:PYTHONPATH='..\.venv\Lib\site-packages'; & 'D:\python\python.exe' -m unittest test_membership_creator -v; Pop-Location`

Expected: FAIL because the new action, fields, refund function, and weekly duration do not exist.

- [ ] **Step 3: Add dynamic quota keys and refund audit storage**

```python
ACTION_QUOTA_KEYS = {
    "download": "downloads", "summarize": "summaries", "mindmap": "summaries",
    "batch_parse": "batch_items", "translate": "creator_credits", "creator_pack": "creator_credits",
}

def refund_quota_once(user_id: str, quota_key: str, audit_key: str, reason: str = "") -> bool:
    # INSERT a unique (user_id, quota_key, audit_key) refund row first;
    # only then decrement the matching daily_usage_json counter in the same transaction.
```

Create a `quota_refunds` table with `UNIQUE(user_id, quota_key, audit_key)`. Add `daily_batch_items` and `daily_creator_credits` to each `PLAN_CONFIG` tier, expose them through `QuotaInfo`, and calculate limits from an explicit `QUOTA_CONFIG_KEYS` map instead of string replacement. Add `weekly: 7` without changing monthly/yearly/lifetime behavior.

- [ ] **Step 4: Run the membership tests and existing coupon tests**

Run: `Push-Location backend; $env:PYTHONPATH='..\.venv\Lib\site-packages'; & 'D:\python\python.exe' -m unittest test_membership_creator -v; Pop-Location`

Expected: PASS, including a second refund returning `False` and redeemed weekly Pro expiring in seven days.

- [ ] **Step 5: Commit the quota foundation**

```bash
git add backend/membership.py backend/test_membership_creator.py
git commit -m "feat: add creator membership quotas"
```

## Task 2: Persist creator artifacts in parse history

**Files:**
- Modify: `backend/parse_history.py:10-210`
- Create: `backend/test_parse_history_creator.py`

**Interfaces:**
- `ParseHistoryStore.upsert(..., artifacts={"translated_segments": ..., "translation_language": ..., "creator_pack": ...})` returns those artifacts.
- Existing records created before the migration return empty `translated_segments`, `translation_language`, and `creator_pack` fields.

- [ ] **Step 1: Write a failing migration/persistence test**

```python
def test_creator_artifacts_round_trip(tmp_path):
    store = ParseHistoryStore(tmp_path / "history.db")
    store.init_db()
    saved = store.upsert("user-1", {"record_key": "r1", "title": "Video"}, {
        "translated_segments": [{"start": 0, "end": 2, "text": "你好", "translation": "Hello"}],
        "translation_language": "en",
        "creator_pack": {"angle": "学习", "titles": ["标题一"]},
    })
    self.assertEqual(saved["translation_language"], "en")
    self.assertEqual(saved["creator_pack"]["titles"], ["标题一"])
```

- [ ] **Step 2: Run the test and verify it fails**

Run: `Push-Location backend; & 'D:\python\python.exe' -m unittest test_parse_history_creator -v; Pop-Location`

Expected: FAIL because the new artifact keys are filtered out.

- [ ] **Step 3: Add additive SQLite migration and validation**

```python
ARTIFACT_FIELDS |= {"translated_segments", "translation_language", "creator_pack"}

def _ensure_column(conn, table, name, definition):
    columns = {row["name"] for row in conn.execute(f"PRAGMA table_info({table})")}
    if name not in columns:
        conn.execute(f"ALTER TABLE {table} ADD COLUMN {name} {definition}")
```

Add JSON-size checks equivalent to existing `segments` limits, serialize the new fields in row conversion, and preserve old history data when only a new artifact is patched.

- [ ] **Step 4: Run focused and existing history tests**

Run: `Push-Location backend; & 'D:\python\python.exe' -m unittest test_parse_history_creator -v; Pop-Location`

Expected: PASS with both a fresh database and an existing-schema migration.

- [ ] **Step 5: Commit history artifacts**

```bash
git add backend/parse_history.py backend/test_parse_history_creator.py
git commit -m "feat: persist creator content artifacts"
```

## Task 3: Build and test local seller coupon operations

**Files:**
- Create: `backend/coupon_admin.py`
- Create: `backend/test_coupon_admin.py`

**Interfaces:**
- CLI: `python coupon_admin.py create --plan pro --type weekly --count 3 --note "xianyu-2026"`.
- CLI: `python coupon_admin.py list --status active` and `python coupon_admin.py revoke CODE`.
- Imports only `membership.create_membership_coupon` and membership's database helpers; it creates no FastAPI route.

- [ ] **Step 1: Write failing command tests using `unittest.mock.patch("sys.argv")`**

```python
def test_create_outputs_requested_single_use_codes(self):
    with patch("sys.argv", ["coupon_admin.py", "create", "--plan", "pro", "--type", "weekly", "--count", "2"]):
        lines = run_cli()
    self.assertEqual(len(lines), 2)
    self.assertTrue(all(line.startswith("JD-") for line in lines))
```

- [ ] **Step 2: Run the test and verify it fails**

Run: `Push-Location backend; & 'D:\python\python.exe' -m unittest test_coupon_admin -v; Pop-Location`

Expected: FAIL because `coupon_admin.py` and `run_cli()` do not exist.

- [ ] **Step 3: Implement argparse commands without HTTP exposure**

```python
parser_create = subparsers.add_parser("create")
parser_create.add_argument("--type", choices=("weekly", "monthly", "yearly"), required=True)
parser_create.add_argument("--count", type=int, default=1)
```

Use parameterized SQL for listing and revoking. Refuse `count < 1` or `count > 500`; print only newly generated codes for `create`, and print status plus redemption timestamps for `list`.

- [ ] **Step 4: Run all coupon tests**

Run: `Push-Location backend; & 'D:\python\python.exe' -m unittest test_coupon_admin test_membership_creator -v; Pop-Location`

Expected: PASS; no network listener is started.

- [ ] **Step 5: Commit seller operations**

```bash
git add backend/coupon_admin.py backend/test_coupon_admin.py
git commit -m "feat: add local coupon seller commands"
```

## Task 4: Add a persistent, bounded batch-job store and worker

**Files:**
- Create: `backend/batch_jobs.py`
- Create: `backend/test_batch_jobs.py`
- Modify: `backend/main.py:47-55,80-130,208-270`

**Interfaces:**
- `BatchJobStore.create_job(user_id: str, urls: list[str], max_items: int) -> dict`.
- `BatchJobStore.list_jobs(user_id: str) -> list[dict]` and `get_job(user_id: str, job_id: str) -> dict | None`.
- `BatchJobStore.claim_next_item() -> dict | None`, `mark_item_done(item_id, title, record_key)`, and `mark_item_failed(item_id, error) -> dict`.
- `BatchProcessor.run_once()` charges `batch_parse`, executes `parse_video(url)`, saves artifacts with `parse_history_store`, and refunds once on failure.

- [ ] **Step 1: Write failing job-state tests**

```python
def test_only_owner_can_read_job_and_only_one_active_batch_is_allowed(self):
    job = store.create_job("owner", ["https://example.com/a"], 5)
    self.assertIsNone(store.get_job("other", job["id"]))
    with self.assertRaises(ValueError):
        store.create_job("owner", ["https://example.com/b"], 5)

def test_failed_charged_item_is_refunded_once(self):
    item = store.claim_next_item()
    result = processor.process_item(item, parse=lambda url: (_ for _ in ()).throw(RuntimeError("blocked")))
    self.assertEqual(result["status"], "failed")
```

- [ ] **Step 2: Run the store tests and verify they fail**

Run: `Push-Location backend; & 'D:\python\python.exe' -m unittest test_batch_jobs -v; Pop-Location`

Expected: FAIL because the batch store is absent.

- [ ] **Step 3: Implement durable state transitions and a single worker**

```python
VALID_STATES = {"queued", "running", "completed", "failed"}

async def batch_worker_loop():
    while not app.state.batch_worker_stop.is_set():
        item = batch_processor.run_once()
        await asyncio.sleep(0.2 if item else 1.0)
```

Use SQLite transactions with `UPDATE ... WHERE status='queued'` when claiming an item. At startup requeue interrupted `running` rows. Initialize `BatchJobStore` in lifespan, start exactly one task, and signal/cancel it during shutdown. Validate URLs, reject empty/duplicate arrays, reject a second active job for the same user, and enforce `quota.can_batch_parse` plus its maximum before creating a job.

- [ ] **Step 4: Add authenticated API endpoints and integration tests**

```python
@app.post("/api/batch-jobs")
async def create_batch_job(req: BatchJobRequest, user: dict = Depends(get_current_user)):
    quota = get_user_quota(user["id"])
    return {"success": True, "job": batch_job_store.create_job(user["id"], req.urls, quota.batch_max_count)}
```

Add `GET /api/batch-jobs` and `GET /api/batch-jobs/{job_id}`. Test unauthenticated access yields 401, free users yield 403, a user cannot read another user's job, and completed parsed artifacts appear in the owner history.

- [ ] **Step 5: Run batch and membership tests**

Run: `Push-Location backend; $env:PYTHONPATH='..\.venv\Lib\site-packages'; & 'D:\python\python.exe' -m unittest test_batch_jobs test_membership_creator -v; Pop-Location`

Expected: PASS, including one global claimed item and one idempotent refund.

- [ ] **Step 6: Commit batch processing**

```bash
git add backend/batch_jobs.py backend/main.py backend/test_batch_jobs.py
git commit -m "feat: add bounded batch parse jobs"
```

## Task 5: Add structured translation and creator-pack backend APIs

**Files:**
- Create: `backend/creator_tools.py`
- Create: `backend/test_creator_tools.py`
- Modify: `backend/main.py:90-130,690-830`

**Interfaces:**
- `translate_segments(segments: list[dict], target_language: str) -> list[dict]` preserves `start`, `end`, and `text`, adding `translation`.
- `create_creator_pack(subtitles: str, segments: list[dict], title: str) -> dict` returns `angle`, `summary`, `titles`, `spoken_outline`, `xiaohongshu`, `wechat_summary`, and `highlights`.
- `POST /api/video/translate-subtitles` and `POST /api/video/creator-pack` require login and use `creator_credits`.

- [ ] **Step 1: Write failing structured-output tests with mocked DeepSeek responses**

```python
def test_translation_rejects_changed_timestamps(self):
    with patch("creator_tools._request_json", return_value=[{"index": 0, "translation": "Hello"}]):
        result = translate_segments([{ "start": 0, "end": 2, "text": "你好"}], "en")
    self.assertEqual(result[0]["start"], 0)
    self.assertEqual(result[0]["translation"], "Hello")

def test_creator_pack_requires_all_product_fields(self):
    with self.assertRaises(ValueError):
        validate_creator_pack({"angle": "only"})
```

- [ ] **Step 2: Run the tool tests and verify they fail**

Run: `Push-Location backend; $env:PYTHONPATH='..\.venv\Lib\site-packages'; & 'D:\python\python.exe' -m unittest test_creator_tools -v; Pop-Location`

Expected: FAIL because `creator_tools` does not exist.

- [ ] **Step 3: Implement chunked, validated DeepSeek calls**

```python
ALLOWED_TARGET_LANGUAGES = {"en": "English", "zh-CN": "Simplified Chinese"}
MAX_SEGMENTS_PER_TRANSLATION_REQUEST = 80

def validate_creator_pack(data: dict) -> dict:
    required = ("angle", "summary", "titles", "spoken_outline", "xiaohongshu", "wechat_summary", "highlights")
    if not all(data.get(key) for key in required):
        raise ValueError("AI 返回的创作包字段不完整")
    return data
```

Send numbered segment arrays to the model, merge translations by index, reject count mismatch/unknown index/empty translation, and cap title and copy lengths. Require subtitles of at least 20 characters for creator packs. Do not return raw model HTML.

- [ ] **Step 4: Implement endpoints with cache-first behavior and tests**

```python
@app.post("/api/video/creator-pack")
async def creator_pack(req: CreatorPackRequest, user: dict = Depends(get_current_user)):
    existing = parse_history_store.get_record(user["id"], req.record_key)
    if existing and existing.get("creator_pack"):
        return {"success": True, "data": existing["creator_pack"], "cached": True}
```

For a cache miss, consume the correct quota before the request, call the tool, persist artifacts, and refund on a model/network/validation failure. Apply the same pattern to translation keyed by target language. Test free-user denial, successful Pro generation, cache hit without a second consumption, invalid model output refund, and cross-user record denial.

- [ ] **Step 5: Run creator backend tests**

Run: `Push-Location backend; $env:PYTHONPATH='..\.venv\Lib\site-packages'; & 'D:\python\python.exe' -m unittest test_creator_tools test_parse_history_creator test_membership_creator -v; Pop-Location`

Expected: PASS without a live DeepSeek request.

- [ ] **Step 6: Commit creator APIs**

```bash
git add backend/creator_tools.py backend/main.py backend/test_creator_tools.py
git commit -m "feat: add creator content APIs"
```

## Task 6: Add reusable frontend data utilities and routes

**Files:**
- Modify: `frontend/src/services/appNavigation.js`
- Modify: `frontend/src/services/appNavigation.test.js`
- Create: `frontend/src/services/creatorPack.js`
- Create: `frontend/src/services/creatorPack.test.js`
- Modify: `frontend/src/App.jsx:1-365`
- Modify: `frontend/src/hooks/useQuota.js`

**Interfaces:**
- `getPageFromPath("/redeem") === "redeem"` and `getPathForPage("redeem") === "/redeem"`.
- `buildBilingualSrt(segments)`, `buildBilingualVtt(segments)`, and `buildCreatorPackMarkdown(pack, title)` are pure exports.
- `useQuota` exposes `redeemCode`, `quota`, and a safe `getAuthHeaders()` helper used by batch/content components.

- [ ] **Step 1: Write failing route and formatter tests**

```javascript
test("maps the dedicated redemption route", () => {
  assert.equal(getPageFromPath("/redeem"), "redeem");
  assert.equal(getPathForPage("redeem"), "/redeem");
});

test("builds bilingual SRT without modifying original timestamps", () => {
  assert.match(buildBilingualSrt([{ start: 0, end: 1, text: "你好", translation: "Hello" }]), /00:00:00,000/);
});
```

- [ ] **Step 2: Run the tests and verify they fail**

Run: `Push-Location frontend; & 'C:\Users\jrq\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe' --test src/services/appNavigation.test.js src/services/creatorPack.test.js; Pop-Location`

Expected: FAIL because the redeem route and creator utility module do not exist.

- [ ] **Step 3: Implement pure utilities and route state**

```javascript
export function buildBilingualSrt(segments) {
  return segments.map((segment, index) => `${index + 1}\n${toSrtTime(segment.start)} --> ${toSrtTime(segment.end)}\n${segment.text}\n${segment.translation}`).join("\n\n");
}
```

Add the route to the existing path helpers. In `App`, render `RedeemPage` only for the `redeem` page and preserve existing `/`, `/parse`, and `/profile` state. Keep API authorization in `useQuota`, not in multiple UI components.

- [ ] **Step 4: Run frontend unit tests**

Run: `Push-Location frontend; & 'C:\Users\jrq\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe' --test src/services/*.test.js; Pop-Location`

Expected: PASS for existing tests plus redeem routing and export formatting.

- [ ] **Step 5: Commit frontend foundations**

```bash
git add frontend/src/services frontend/src/App.jsx frontend/src/hooks/useQuota.js
git commit -m "feat: add creator frontend foundations"
```

## Task 7: Build redemption, quota, and batch UI

**Files:**
- Create: `frontend/src/components/RedeemPage.jsx`
- Create: `frontend/src/components/BatchParsePanel.jsx`
- Modify: `frontend/src/components/ParsePage.jsx`
- Modify: `frontend/src/components/ProfilePage.jsx`
- Modify: `frontend/src/components/PricingSection.jsx`
- Modify: `frontend/src/index.css`

**Interfaces:**
- `RedeemPage({ user, quota, onRedeemCode, onAuthClick, onNavigate })`.
- `BatchParsePanel({ user, quota, getAuthHeaders, onOpenRecord, onAuthClick, onUpgrade })`.
- `ParsePage` accepts `batchProps` and renders the batch switch before single-video input.

- [ ] **Step 1: Add component-level behavior tests for URL normalization**

```javascript
test("normalizes multiline batch URLs and removes duplicates", () => {
  assert.deepEqual(normalizeBatchUrls("https://a\n\nhttps://a\nhttps://b"), ["https://a", "https://b"]);
});
```

- [ ] **Step 2: Run the test and verify it fails**

Run: `Push-Location frontend; & 'C:\Users\jrq\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe' --test src/services/batchUrls.test.js; Pop-Location`

Expected: FAIL because `normalizeBatchUrls` does not exist.

- [ ] **Step 3: Implement the customer-facing flows**

```jsx
{quota?.can_batch_parse ? (
  <BatchParsePanel {...batchProps} />
) : (
  <button type="button" onClick={() => onUpgrade("批量解析是 Pro 专属权益")}>解锁批量解析</button>
)}
```

The redeem page must show an unauthenticated explanation and a login button, then show plan, exact expiry text, remaining batch items, remaining creator credits, and a primary “立即去解析” action after a successful redemption. The batch panel must poll only while a job is queued/running, stop polling on unmount, expose failed item messages, and let a user open completed history records. Profile and pricing should link to `/redeem`, not rely only on scrolling to the old coupon form.

- [ ] **Step 4: Add cinematic but accessible styling**

Use the existing dark/glass palette and visible focus states. Add `aria-live="polite"` for redemption and batch status, use regular buttons and labels, and disable polling/animation behavior under reduced-motion preferences.

- [ ] **Step 5: Run unit tests and production build**

Run: `Push-Location frontend; & 'C:\Users\jrq\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe' --test src/services/*.test.js; & 'C:\Users\jrq\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe' 'node_modules\vite\bin\vite.js' build; Pop-Location`

Expected: All Node tests PASS and Vite exits 0.

- [ ] **Step 6: Commit redemption and batch UI**

```bash
git add frontend/src/components/RedeemPage.jsx frontend/src/components/BatchParsePanel.jsx frontend/src/components/ParsePage.jsx frontend/src/components/ProfilePage.jsx frontend/src/components/PricingSection.jsx frontend/src/services/batchUrls.js frontend/src/services/batchUrls.test.js frontend/src/index.css
git commit -m "feat: add redemption and batch workspace"
```

## Task 8: Build translation and creator-pack UI with safe exports

**Files:**
- Create: `frontend/src/components/CreatorPackPanel.jsx`
- Modify: `frontend/src/components/VideoSubtitle.jsx:1-1157`
- Modify: `frontend/src/index.css`

**Interfaces:**
- `CreatorPackPanel({ recordKey, title, segments, subtitles, artifacts, user, quota, getAuthHeaders, onArtifactsChange, onUpgrade, consumeQuota })`.
- It invokes the two new APIs, exports only text files using `creatorPack` utilities, and publishes artifact patches to the existing parse-history flow.

- [ ] **Step 1: Write failing export tests**

```javascript
test("creator pack Markdown contains every customer-facing section", () => {
  const markdown = buildCreatorPackMarkdown(samplePack, "视频标题");
  assert.match(markdown, /## 小红书笔记/);
  assert.match(markdown, /## 高光时间点/);
});
```

- [ ] **Step 2: Run the test and verify it fails**

Run: `Push-Location frontend; & 'C:\Users\jrq\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe' --test src/services/creatorPack.test.js; Pop-Location`

Expected: FAIL until the Markdown builder covers all creator-pack fields.

- [ ] **Step 3: Implement tabs, cache display, and paywall states**

```jsx
<CreatorPackPanel
  recordKey={activeHistoryRecord?.record_key}
  title={titleCacheRef.current}
  segments={segments}
  subtitles={subtitlesCacheRef.current}
  artifacts={initialArtifacts}
  {...creatorProps}
/>
```

Add a translated-subtitle control in the existing subtitle area. Display original and translation side-by-side on wide screens and stacked on small screens. Add a creator-pack tab with loading, cached, error, empty-subtitle, free-user paywall, generate, copy, and `.md` export states. Use React text rendering for model output instead of `dangerouslySetInnerHTML`; leave existing summary rendering unchanged in this task, but do not route creator content through it.

- [ ] **Step 4: Verify interactions and build**

Run: `Push-Location frontend; & 'C:\Users\jrq\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe' --test src/services/*.test.js; & 'C:\Users\jrq\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe' 'node_modules\vite\bin\vite.js' build; Pop-Location`

Expected: PASS; no unresolved imports or build errors.

- [ ] **Step 5: Commit content-asset UI**

```bash
git add frontend/src/components/CreatorPackPanel.jsx frontend/src/components/VideoSubtitle.jsx frontend/src/services/creatorPack.js frontend/src/services/creatorPack.test.js frontend/src/index.css
git commit -m "feat: add bilingual subtitles and creator packs"
```

## Task 9: Run end-to-end verification and update user-facing documentation

**Files:**
- Modify: `README.md`
- Modify: `docs/需求分析.md`
- Modify: `docs/方案设计.md`
- Modify: `docs/superpowers/specs/2026-07-21-creator-content-pack-design.md` only if implementation reveals a factual correction.

- [ ] **Step 1: Add a documented Xianyu fulfillment runbook**

Document the seller flow: generate weekly/monthly/yearly code locally, send code, tell the buyer to register/login/visit `/redeem`, and explain where to see expiry and quota. Include support guidance for invalid/used/expired codes; never document bypassing paid/private sources.

- [ ] **Step 2: Run the full automated suite**

Run: `Push-Location backend; $env:PYTHONPATH='..\.venv\Lib\site-packages'; & 'D:\python\python.exe' -m unittest test_downloader_youtube_cookies test_membership_creator test_parse_history_creator test_coupon_admin test_batch_jobs test_creator_tools -v; Pop-Location; Push-Location frontend; & 'C:\Users\jrq\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe' --test src/services/*.test.js; & 'C:\Users\jrq\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe' 'node_modules\vite\bin\vite.js' build; Pop-Location`

Expected: Every named Python and Node test passes; Vite exits 0.

- [ ] **Step 3: Manually verify the complete customer flow**

Verify: guest opens `/redeem`; logged-in user redeems a weekly code; profile displays plan/expiry/new quotas; Pro submits a two-link batch and sees durable status; a parsed record creates bilingual SRT and a creator-pack Markdown export; free user sees clear upgrade states; a forced failed item refunds only once.

- [ ] **Step 4: Commit release documentation**

```bash
git add README.md docs/需求分析.md docs/方案设计.md docs/superpowers/specs/2026-07-21-creator-content-pack-design.md
git commit -m "docs: explain creator membership fulfillment"
```

## Plan Self-Review

- **Spec coverage:** Task 1 covers weekly codes and transparent quotas; Task 3 covers local seller operations; Task 4 covers persistent bounded batch jobs and refunds; Task 5 covers structured translation/creator APIs and cache behavior; Tasks 6–8 cover routes, redemption, batch, bilingual subtitle and creator-pack UX; Task 9 covers documentation and customer-flow verification.
- **Placeholder scan:** Every implementation step names files, interfaces, explicit failure behavior, tests, and verification commands.
- **Type consistency:** `creator_credits`, `batch_items`, `translated_segments`, `translation_language`, `creator_pack`, `record_key`, and `audit_key` use the same names in data storage, APIs, UI, and tests.
