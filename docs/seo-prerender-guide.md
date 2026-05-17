# SEO 预渲染指南（方案C）— Vite + React SPA

> **适用场景**：工具型单页应用，页面数量少（1~5 页），不想大改切换到 Next.js/Nuxt。

---

## 一、方案对比速查

| 方案             | 原理                                             | SEO 效果   | 实施成本 | 适合场景         |
| ---------------- | ------------------------------------------------ | ---------- | -------- | ---------------- |
| **A. Meta 优化** | 静态 HTML 中写死 TDK                             | ⭐⭐       | 1 小时   | 已实施，快速垫底 |
| **C. 预渲染**    | 构建时启动 headless 浏览器抓取 SPA 生成静态 HTML | ⭐⭐⭐⭐   | 半天     | **当前推荐**     |
| **B. SSR**       | 服务端渲染（Next.js）                            | ⭐⭐⭐⭐⭐ | 2~3 天   | 页面多、动态路由 |

---

## 二、推荐方案：`vite-plugin-prerender`

### 为什么选它？

- 原生 Vite 插件，零配置即可启动
- 基于 Puppeteer，能完整执行 JS 后再输出 HTML（搜索引擎抓取到的是渲染后的内容）
- 只预渲染你指定的路由，不影响开发体验

### 2.1 安装

```bash
cd frontend
npm install -D vite-plugin-prerender puppeteer
# 如果 puppeteer 下载 Chromium 失败（国内常见），换用以下方式：
# npm install -D vite-plugin-prerender puppeteer-core
# 然后手动指定本地 Chrome 路径（见下方配置）
```

### 2.2 配置 `vite.config.js`

```js
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import prerender from "vite-plugin-prerender";

export default defineConfig({
  plugins: [
    react(),
    prerender({
      // 要预渲染的路由列表（你的 SPA 目前就一个首页）
      routes: ["/"],

      // 预渲染输出目录（默认就是 dist，与 vite build 一致）
      // staticDir: 'dist',

      // 预渲染后 HTML 文件存放位置
      renderDir: "dist",

      // ===== 关键：Puppeteer 配置 =====
      puppeteerOptions: {
        // 方案一：使用内置 Chromium（需要完整下载 ~300MB）
        // headless: 'new',  // Puppeteer 22+ 的新 headless 模式

        // 方案二：使用系统已安装的 Chrome/Edge（推荐国内用户）
        executablePath:
          "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
        // 或 Edge：'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe'
        // macOS：'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'

        args: [
          "--no-sandbox",
          "--disable-setuid-sandbox",
          "--disable-dev-shm-usage",
          "--disable-gpu",
        ],
      },

      // ===== 后处理：注入额外的 meta / script 标签 =====
      postProcess(renderedRoute) {
        // 去掉预渲染时注入的 modulepreload / script 标签（避免与真实 SPA hydration 冲突）
        renderedRoute.html = renderedRoute.html
          .replace(/<link rel="modulepreload"[^>]*>/g, "")
          .replace(/<script type="module" crossorigin[^>]*><\/script>/g, "");

        return renderedRoute;
      },
    }),
  ],

  server: {
    port: 5173,
    proxy: {
      "/api": "http://localhost:8000",
    },
  },
});
```

### 2.3 构建命令

```bash
# 生产构建 + 预渲染
npm run build
# vite-plugin-prerender 会在 vite build 完成后自动启动 Puppeteer 抓取页面

# 预览预渲染结果
npm run preview
```

构建后 `dist/` 目录中的 `index.html` 将包含**完整的渲染后 DOM**，而非空的 `<div id="root"></div>`。

---

## 三、🔴 避坑指南（重要！）

### 坑1：API 请求在预渲染时失败

**现象**：预渲染出的 HTML 中 VideoInput 正常，但 HeroSection 等静态内容也在，而依赖 API 的组件（如 VideoInfo）是空的。

**原因**：Puppeteer 打开页面时，React 会发起 `/api/...` 请求，但构建时后端没运行。

**解决**：

```js
// vite.config.js 中 prerender 配置增加等待策略
prerender({
  routes: ["/"],

  // 等待网络空闲后再抓取（0 个 pending 请求超过 500ms）
  networkIdleTimeout: 3000,

  // 或者：渲染前先等待指定时间
  // renderAfterTime: 5000,

  // 或者：等待某个 DOM 元素出现
  // renderAfterDocumentEvent: 'prerender-ready',
});
```

然后在 `App.jsx` 中，当组件挂载完成后派发事件：

```jsx
useEffect(() => {
  // 延迟派发，确保 React 渲染完成
  const timer = setTimeout(() => {
    document.dispatchEvent(new Event("prerender-ready"));
  }, 2000);
  return () => clearTimeout(timer);
}, []);
```

### 坑2：动态导入的组件被忽略

**现象**：`React.lazy()` 加载的组件在预渲染 HTML 中不出现。

**解决**：预渲染时不做代码分割，或确保 `renderAfterDocumentEvent` 等待足够久。

```js
// 简单粗暴：预渲染时关闭 lazy loading
// 在 App.jsx 顶部
const isPrerender = navigator.userAgent.includes("HeadlessChrome");
// 如果是预渲染环境，直接 import 而非 lazy
```

> **你的项目目前没有用 `React.lazy()`，所以不受影响。**

### 坑3：CSS-in-JS 样式丢失

**现象**：预渲染 HTML 缺少 Tailwind 样式。

**原因**：Tailwind 是构建时通过扫描源码生成 CSS 的，Puppeteer 渲染的是 JS 执行后的 DOM，如果 Vite 的 CSS 提取有问题会导致样式丢失。

**解决**：Tailwind + Vite 一般不会有这个问题。如果遇到，检查：

```js
// postcss.config.js 确保存在
module.exports = {
  plugins: {
    tailwindcss: {},
    autoprefixer: {},
  },
};
```

### 坑4：`localStorage` / `sessionStorage` 报错

**现象**：`ReferenceError: localStorage is not defined` 或预渲染崩溃。

**原因**：Puppeteer 运行在 headless 环境中，`localStorage` 等 Web API 可能存在但不一定有数据。

**解决**：给所有 `localStorage` 访问加 try-catch（你的 `DownloadHistory` 组件已经做了 ✅）。

### 坑5：预渲染后的 HTML 与 SPA hydration 冲突

**现象**：用户打开页面后，React 重新渲染导致页面闪烁。

**解决**：这就是上面 `postProcess` 配置的意义——清理掉预渲染时残留的 `<script>` 标签，让浏览器加载真实的 SPA bundle。React 18 的 `hydrateRoot` 会自动处理这种差异。

### 坑6：国内 Puppeteer 下载 Chromium 失败

**解决**（三选一）：

```bash
# 方案1：设置国内镜像
set PUPPETEER_DOWNLOAD_HOST=https://registry.npmmirror.com/-/binary/chromium-browser-snapshots
npm install puppeteer

# 方案2：使用 puppeteer-core + 系统 Chrome
npm install -D puppeteer-core
# 然后在配置中指定 executablePath（见上方配置）

# 方案3：跳过 Chromium 下载，用系统 Edge
set PUPPETEER_SKIP_DOWNLOAD=true
npm install puppeteer-core
# executablePath 指向 msedge.exe
```

---

## 四、进阶：多路由预渲染

如果你未来增加了独立页面（如 `/about`、`/pricing`），只需在 `routes` 中追加：

```js
prerender({
  routes: [
    "/",
    "/about",
    "/pricing",
    "/blog/how-to-download-video",
    // 动态路由可以用函数生成
    // ...Array.from({ length: 10 }, (_, i) => `/post/${i + 1}`),
  ],
});
```

每个路由会生成对应的 `dist/about/index.html`、`dist/pricing/index.html` 等。

---

## 五、预渲染效果验证

### 5.1 本地验证

```bash
npm run build
# 检查 dist/index.html 的内容
# 搜索关键字：'万能视频下载' 应该在 HTML 源码中可见
# 确认不再是空的 <div id="root"></div>
```

### 5.2 模拟搜索引擎抓取

```bash
# 用 curl 模拟 Googlebot 查看
curl -A "Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)" http://localhost:5173

# 或用 Chrome DevTools → Network → 右键请求 → Copy as cURL
```

### 5.3 Google Search Console 验证

上线后提交 sitemap，使用 URL 检查工具查看 Google 抓取到的页面内容。

---

## 六、部署注意事项

### Vercel 部署

预渲染后的 `dist/` 目录直接部署即可，无需额外配置：

```bash
# vercel.json（如果需要 SPA fallback）
{
    "rewrites": [
        { "source": "/(.*)", "destination": "/index.html" }
    ]
}
```

> ⚠️ 但预渲染后每个路由都有独立 HTML 了，其实不需要 SPA fallback。

### 独立域名部署后需要做的事

1. **更新 `sitemap.xml`** 中所有 `your-domain.com` → 实际域名
2. **更新 `robots.txt`** 中 `Sitemap:` URL
3. **更新 `index.html`** 中：
   - `<link rel="canonical">` → 实际域名
   - `og:url` → 实际域名
   - `og:image` → 上传一张 1200×630 的 OG 图到 CDN
4. **提交 sitemap** 到 Google Search Console 和 Bing Webmaster Tools
5. **申请收录**：在 Search Console 中手动提交首页 URL

---

## 七、总结：你当前的最佳路径

```
当前状态（方案A 已实施）
    │
    ├─ 1. 购买独立域名 → 全局替换 your-domain.com
    │
    ├─ 2. 部署上线 → 提交 sitemap 到 Google/Bing
    │
    └─ 3. 观察 2~4 周收录情况
         │
         ├─ 收录正常 → 继续优化内容，定期更新 sitemap
         │
         └─ 收录差 / 只有首页被收录
              │
              └─ 实施方案C（预渲染），让搜索引擎抓取到完整 DOM 内容
```

> **核心建议**：先用方案A上线跑 2 周，如果 Google 只收录了首页 title 没有抓取到正文内容，再上方案C——因为预渲染会显著增加构建时间（每次 build 多 15~30 秒）。
