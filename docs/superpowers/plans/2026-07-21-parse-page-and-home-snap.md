# 独立解析页与首页分屏滚动 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move the video parsing workspace to `/parse` and make only the homepage scroll snap between its visual sections.

**Architecture:** Keep the existing hand-written history router and all parse/auth/quota state in `App`. Extract the workspace markup to `ParsePage`; use small, pure route/navigation helpers for browser-path decisions. The homepage receives a dedicated scrolling element, and `ScrollExperience` uses that element as its GSAP scroller while native CSS scroll snap performs the section settling.

**Tech Stack:** React 18, Vite, Tailwind utility classes, existing GSAP/ScrollTrigger, native CSS scroll snap, Node's built-in test runner.

## Global Constraints

- Do not add a dependency or change FastAPI APIs, request shapes, quota behavior, SSE handling, or parse-history persistence.
- `/`, `/parse`, and `/profile` are the only client routes; unknown paths resolve to `/`.
- Scroll snap applies only to the homepage; it is relaxed on touch screens and disabled for reduced-motion preferences.
- Preserve all existing unrelated worktree modifications.

---

### Task 1: Add tested route and home-navigation helpers

**Files:**
- Create: `frontend/src/services/appNavigation.js`
- Create: `frontend/src/services/appNavigation.test.js`

**Interfaces:**
- Produces `getPageFromPath(pathname)`, `getPathForPage(page)`, and `isHomeSection(sectionId)`.
- `App` consumes the first two helpers; `Navbar` consumes `isHomeSection` through an `onNavigate` callback owned by `App`.

- [ ] **Step 1: Write the failing test**

```js
import test from "node:test";
import assert from "node:assert/strict";
import {
  getPageFromPath,
  getPathForPage,
  isHomeSection,
} from "./appNavigation.js";

test("maps parse and profile paths while unknown paths fall back home", () => {
  assert.equal(getPageFromPath("/parse"), "parse");
  assert.equal(getPageFromPath("/profile"), "profile");
  assert.equal(getPageFromPath("/anything-else"), "home");
});

test("builds stable page paths and recognises homepage anchors", () => {
  assert.equal(getPathForPage("parse"), "/parse");
  assert.equal(getPathForPage("profile"), "/profile");
  assert.equal(getPathForPage("home"), "/");
  assert.equal(isHomeSection("features"), true);
  assert.equal(isHomeSection("download-workspace"), false);
});
```

- [ ] **Step 2: Run the test to verify RED**

Run: `node --test src/services/appNavigation.test.js` from `frontend`.

Expected: FAIL because `appNavigation.js` does not yet exist.

- [ ] **Step 3: Write the minimal helper implementation**

```js
const PAGE_PATHS = { home: "/", parse: "/parse", profile: "/profile" };
const HOME_SECTION_IDS = new Set(["home", "features", "pricing", "faq", "contact"]);

export function getPageFromPath(pathname = "/") {
  return Object.entries(PAGE_PATHS).find(([, path]) => path === pathname)?.[0] || "home";
}

export function getPathForPage(page) {
  return PAGE_PATHS[page] || PAGE_PATHS.home;
}

export function isHomeSection(sectionId) {
  return HOME_SECTION_IDS.has(sectionId);
}
```

- [ ] **Step 4: Run the test to verify GREEN**

Run: `node --test src/services/appNavigation.test.js` from `frontend`.

Expected: 2 passing tests, 0 failures.

- [ ] **Step 5: Commit the isolated helper change**

```bash
git add frontend/src/services/appNavigation.js frontend/src/services/appNavigation.test.js
git commit -m "feat: add client page navigation helpers"
```

### Task 2: Extract the parser workspace into a focused page component

**Files:**
- Create: `frontend/src/components/ParsePage.jsx`
- Modify: `frontend/src/App.jsx`

**Interfaces:**
- `ParsePage` consumes `videoData`, `activeHistoryRecord`, `isLoading`, `error`, user/quota data, and the existing parse/download/artifact callbacks.
- `App` continues to own the callbacks and supplies `ParsePage` when `page === "parse"`.

- [ ] **Step 1: Confirm the existing render contract before editing**

Run: `rg -n "<VideoInput|<VideoInfo|<VideoSubtitle|handleAnalyze|handleArtifactsChange" src/App.jsx` from `frontend`.

Expected: all parsing callbacks remain in `App`; only their JSX presentation is moved.

- [ ] **Step 2: Create the page component**

Create `ParsePage` with the existing workspace heading, `VideoInput`, loading and error states, and the two-column `VideoInfo` / `VideoSubtitle` result grid. Its props must be exactly the values and callbacks previously passed by `App`; it must not call APIs or create independent auth/quota state.

```jsx
export default function ParsePage({ onAnalyze, videoData, ...props }) {
  return <main className="parse-page cinematic-content" aria-label="视频解析工作台">{/* existing workspace JSX */}</main>;
}
```

- [ ] **Step 3: Render it only for the parse route**

In `App`, import `ParsePage`, replace the inline `download-workspace` JSX with a `page === "parse"` branch, and pass the existing callbacks unchanged.

- [ ] **Step 4: Build to verify JSX compilation**

Run: `npm run build` from `frontend`.

Expected: Vite completes with exit code 0.

- [ ] **Step 5: Commit the extraction**

```bash
git add frontend/src/components/ParsePage.jsx frontend/src/App.jsx
git commit -m "feat: move parser workspace to dedicated page"
```

### Task 3: Connect navigation and history continuation to `/parse`

**Files:**
- Modify: `frontend/src/App.jsx`
- Modify: `frontend/src/components/Navbar.jsx`
- Modify: `frontend/src/components/HeroSection.jsx`
- Modify: `frontend/src/components/FeaturesSection.jsx`

**Interfaces:**
- `App.navigateTo(page, { sectionId, replace })` consumes a page name and optional homepage section ID.
- `Navbar`, `HeroSection`, and `FeaturesSection` consume callback props rather than directly scrolling to `#download-workspace`.

- [ ] **Step 1: Extend routing from the tested helpers**

Use `getPageFromPath` for initial state and `popstate`; use `getPathForPage` when calling `history.pushState`. Update titles for `/parse` and call the homepage scroll element's `scrollTo` only after its route has rendered.

- [ ] **Step 2: Restore history on the new page**

Replace the old `navigateTo("home")` plus `#download-workspace` scroll in `handleContinueHistory` with `navigateTo("parse")`, then invoke `handleAnalyze(item.webpage_url, item)` on the next animation frame.

- [ ] **Step 3: Make navigation context-aware**

Make `Navbar` emit `onNavigate({ page: "parse" })` for its workspace item and CTA. For home-section items, emit `onNavigate({ page: "home", sectionId: "features" })` and analogous IDs. The logo emits `{ page: "home", sectionId: "home" }`. The callbacks close mobile/account menus before navigating.

- [ ] **Step 4: Replace marketing CTA anchors**

Pass `onStartParse` from `App` to `HeroSection` and `FeaturesSection`; their CTAs call it instead of using `href="#download-workspace"`.

- [ ] **Step 5: Run navigation and build checks**

Run:

```bash
node --test src/services/appNavigation.test.js
npm run build
```

Expected: route tests pass and Vite exits 0.

- [ ] **Step 6: Commit the navigation integration**

```bash
git add frontend/src/App.jsx frontend/src/components/Navbar.jsx frontend/src/components/HeroSection.jsx frontend/src/components/FeaturesSection.jsx
git commit -m "feat: route parser entry points to parse page"
```

### Task 4: Scope native scroll snap and retarget ScrollExperience

**Files:**
- Modify: `frontend/src/App.jsx`
- Modify: `frontend/src/components/ScrollExperience.jsx`
- Modify: `frontend/src/index.css`

**Interfaces:**
- `App` creates `homeScrollRef` and passes it to `ScrollExperience`.
- `ScrollExperience({ scrollerRef })` registers GSAP triggers against that element and does not implement its own delayed snapping.

- [ ] **Step 1: Add the homepage scroll container**

Wrap the homepage hero, content sections, and footer in `<div ref={homeScrollRef} className="home-scroll">`. Keep parser/profile pages outside this container so they retain document scrolling.

- [ ] **Step 2: Retarget GSAP without scroll hijacking**

Remove `SNAP_*`, `getNearestSnapTop`, the window `scroll` listener, and the `gsap.to(window, { scrollTo })` call. Add `scroller: scrollerRef.current` to every ScrollTrigger configuration and use the ref when refreshing and cleaning up. Keep the current parallax/reveal animations and their cleanup functions.

- [ ] **Step 3: Add scoped CSS snap rules**

```css
.home-scroll {
  height: 100dvh;
  overflow-y: auto;
  overscroll-behavior-y: contain;
  scroll-behavior: smooth;
  scroll-snap-type: y mandatory;
}

.home-scroll > #home,
.home-scroll #features,
.home-scroll #pricing,
.home-scroll #faq,
.home-scroll #contact,
.home-scroll .cinematic-footer {
  scroll-snap-align: start;
  scroll-snap-stop: normal;
}

@media (max-width: 768px) {
  .home-scroll { scroll-snap-type: y proximity; }
}

@media (prefers-reduced-motion: reduce) {
  .home-scroll { scroll-behavior: auto; scroll-snap-type: none; }
}
```

Remove global rules that give the now-removed `#download-workspace` a snap alignment, minimum viewport height, or content-visibility behavior.

- [ ] **Step 4: Verify production compilation and manual acceptance**

Run: `npm run build` from `frontend`.

Then verify in the browser:

1. `/` snaps among home, features, pricing, FAQ, contact and footer on desktop.
2. `/parse` and `/profile` scroll normally.
3. Hero/nav/features CTAs open `/parse`.
4. A profile history item opens `/parse` and restores its saved artifacts.

- [ ] **Step 5: Commit the scoped scroll behavior**

```bash
git add frontend/src/App.jsx frontend/src/components/ScrollExperience.jsx frontend/src/index.css
git commit -m "feat: add homepage scroll snap navigation"
```

### Task 5: Final regression verification

**Files:**
- Verify only.

- [ ] **Step 1: Run all frontend unit tests**

Run: `node --test src/services/*.test.js` from `frontend`.

Expected: all existing and new tests pass.

- [ ] **Step 2: Run the production build**

Run: `npm run build` from `frontend`.

Expected: Vite exits 0.

- [ ] **Step 3: Inspect scoped changes**

Run: `git diff --check` and `git status --short` from the repository root.

Expected: no whitespace errors; only the planned frontend files and this plan appear in the implementation diff, in addition to pre-existing user changes.
