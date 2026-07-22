# 解析工作台体验调整 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 压缩解析页顶部信息、让批量记录打开时保持滚动位置，并将创作包默认目标语言改为简体中文。

**Architecture:** `App.jsx` 为历史记录打开操作显式传递保持滚动位置选项，仅对已经位于解析页的批量记录生效。标题使用紧凑修饰类控制字号和间距；创作工具默认语言提取为纯函数，确保历史记录仍优先恢复已保存语言。

**Tech Stack:** React 19、Vite、现有 CSS、Node `node:test`。

## Global Constraints

- 不修改后端 API、数据库、卡券、套餐或解析逻辑。
- 不新增依赖、图片、动画或外部资源。
- 已保存 `translation_language` 必须优先于默认语言。
- 仅在 `/parse` 内从批量结果打开记录时保持滚动位置；跨页面导航仍回到页首。

---

### Task 1: 测试并实现导航判断与创作语言默认值

**Files:**
- Modify: `frontend/src/services/appNavigation.js`
- Modify: `frontend/src/services/appNavigation.test.js`
- Modify: `frontend/src/services/creatorPack.js`
- Modify: `frontend/src/services/creatorPack.test.js`
- Modify: `frontend/src/components/CreatorPackPanel.jsx:42-55`

**Interfaces:**
- Produces: `shouldPreserveScrollForHistoryOpen(page: string): boolean`
- Produces: `getCreatorTargetLanguage(artifacts?: object): string`

- [ ] **Step 1: 写入失败测试。**

```js
import { shouldPreserveScrollForHistoryOpen } from "./appNavigation.js";
import { getCreatorTargetLanguage } from "./creatorPack.js";

test("only parse-page history opening preserves scroll", () => {
  assert.equal(shouldPreserveScrollForHistoryOpen("parse"), true);
  assert.equal(shouldPreserveScrollForHistoryOpen("profile"), false);
});

test("creator tools default to Chinese and restore saved language", () => {
  assert.equal(getCreatorTargetLanguage(), "zh-CN");
  assert.equal(getCreatorTargetLanguage({ translation_language: "en" }), "en");
});
```

- [ ] **Step 2: 运行失败测试。**

```powershell
Push-Location frontend
& 'C:\Users\jrq\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe' --test src/services/appNavigation.test.js src/services/creatorPack.test.js
Pop-Location
```

Expected: FAIL，提示两个导出不存在。

- [ ] **Step 3: 添加最小实现并接入创作面板。**

```js
// appNavigation.js
export function shouldPreserveScrollForHistoryOpen(page) {
  return page === "parse";
}

// creatorPack.js
export function getCreatorTargetLanguage(artifacts = {}) {
  return artifacts?.translation_language || "zh-CN";
}
```

```jsx
// CreatorPackPanel.jsx
const [targetLanguage, setTargetLanguage] = useState("zh-CN");

useEffect(() => {
  setTargetLanguage(getCreatorTargetLanguage(artifacts));
  // 其余 artifacts 状态恢复保持不变
}, [artifacts, recordKey]);
```

- [ ] **Step 4: 重跑 Step 2 命令并提交。**

Expected: PASS。

```powershell
git add frontend/src/services/appNavigation.js frontend/src/services/appNavigation.test.js frontend/src/services/creatorPack.js frontend/src/services/creatorPack.test.js frontend/src/components/CreatorPackPanel.jsx
git commit -m "feat: refine parse workspace defaults"
```

### Task 2: 实现紧凑顶部与批量打开位置保持

**Files:**
- Modify: `frontend/src/App.jsx:133-151,216-227`
- Modify: `frontend/src/components/ParsePage.jsx:27-35`
- Modify: `frontend/src/index.css:1377-1383`

**Interfaces:**
- Consumes: `shouldPreserveScrollForHistoryOpen(page)`。
- Extends: `navigateTo(nextPage, { replace, sectionId, preserveScroll })`，其中 `preserveScroll` 默认为 `false`。
- Produces: `.workspace-title--compact`。

- [ ] **Step 1: 为导航函数加入显式保留滚动选项。**

```jsx
const navigateTo = useCallback((nextPage, {
  replace = false,
  sectionId,
  preserveScroll = false,
} = {}) => {
  // 保持既有 history 与 setPage 逻辑
  window.requestAnimationFrame(() => {
    if (preserveScroll) return;
    if (nextPage === "home") {
      scrollHomeTo(isHomeSection(sectionId) ? sectionId : "home", sectionId ? "smooth" : "auto");
      return;
    }
    window.scrollTo({ top: 0, behavior: "auto" });
  });
}, [scrollHomeTo]);

const handleContinueHistory = useCallback((item) => {
  const sourceUrl = item.webpage_url || item.url;
  if (!sourceUrl) return;
  navigateTo("parse", { preserveScroll: shouldPreserveScrollForHistoryOpen(page) });
  window.requestAnimationFrame(() => handleAnalyze(sourceUrl, item));
}, [handleAnalyze, navigateTo, page]);
```

- [ ] **Step 2: 应用 A 方案的紧凑顶部布局。**

```jsx
<div className="mx-auto max-w-5xl px-4 py-12 sm:px-6 sm:py-14 md:py-16">
  <header className="section-heading mb-6 text-center">
    <p className="section-kicker">VIDEO WORKSPACE</p>
    <h1 className="workspace-title workspace-title--compact">带来链接，留住此刻。</h1>
    <p className="mx-auto mt-3 max-w-2xl text-sm leading-6 text-dark-500">
      粘贴视频链接，快速解析画质、音频与字幕。
    </p>
  </header>
</div>
```

```css
.workspace-title--compact {
  font-size: clamp(1.625rem, 2.5vw, 1.875rem);
  line-height: 1.16;
}
```

- [ ] **Step 3: 跑全量前端测试和生产构建。**

```powershell
Push-Location frontend
& 'C:\Users\jrq\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe' --test src/services/*.test.js
& 'C:\Users\jrq\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe' 'node_modules\vite\bin\vite.js' build
Pop-Location
```

Expected: 全部测试通过且 Vite 构建成功。

- [ ] **Step 4: 在 `http://127.0.0.1:5175/parse` 手工验收后提交。**

Check: 输入区明显上移；批量列表滚动后点“打开”不回顶部；跨页进入 `/parse` 仍回页首；新记录默认“简体中文”，历史记录保留原语言。

```powershell
git add frontend/src/App.jsx frontend/src/components/ParsePage.jsx frontend/src/index.css
git commit -m "fix: preserve batch parse scroll position"
```
