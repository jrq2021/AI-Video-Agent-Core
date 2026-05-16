# 🎬 AI Video — 万能视频下载 & AI 智能分析平台

一个集**多平台视频下载**、**AI 字幕提取**、**视频内容总结**与**思维导图生成**于一体的全栈 Web 应用。

---

## ✨ 核心功能

| 功能               | 说明                                                   |
| ------------------ | ------------------------------------------------------ |
| 🌐 **多平台解析**  | 支持 Bilibili、抖音、YouTube、TikTok 等主流平台        |
| 🎥 **视频下载**    | 实时 SSE 推送下载进度，支持多清晰度选择                |
| 📝 **字幕提取**    | 优先使用官方字幕，无字幕时自动 ASR 语音识别（Whisper） |
| 🤖 **AI 视频总结** | 基于 DeepSeek 大模型，流式生成视频摘要与核心要点       |
| 🧠 **思维导图**    | 自动提炼视频逻辑结构，渲染为可缩放交互式思维导图       |
| 📋 **下载历史**    | 本地存储历史记录，支持一键重新解析                     |

---

## 🛠 技术栈

### 前端

- **React 18** + Vite
- **Tailwind CSS** — 原子化样式
- **markmap** — Markdown → 思维导图渲染

### 后端

- **FastAPI** — 高性能异步 Web 框架
- **yt-dlp** — 多平台视频解析与下载
- **faster-whisper** — 本地语音识别（ASR）
- **DeepSeek API** — 大模型总结与结构提炼
- **PyJWT** — 用户认证

---

## 📁 项目结构

```
ai-video/
├── frontend/                  # React 前端
│   ├── src/
│   │   ├── App.jsx            # 根组件
│   │   ├── components/
│   │   │   ├── VideoInput.jsx      # 视频链接输入
│   │   │   ├── VideoInfo.jsx       # 视频信息与下载
│   │   │   ├── VideoSubtitle.jsx   # 字幕 / 总结 / 思维导图（三 Tab）
│   │   │   ├── MindMapView.jsx     # markmap 思维导图渲染
│   │   │   ├── DownloadHistory.jsx # 下载历史记录
│   │   │   ├── DownloadProgress.jsx # 下载进度 SSE
│   │   │   ├── AuthModal.jsx       # 登录/注册弹窗
│   │   │   └── ...
│   │   └── hooks/
│   │       └── useVideoSync.js     # 视频 ↔ 字幕同步 Hook
│   ├── vite.config.js         # Vite 配置（含 API 代理）
│   └── package.json
├── backend/                   # FastAPI 后端
│   ├── main.py                # API 路由入口
│   ├── summarizer.py          # DeepSeek 总结 + 思维导图生成
│   ├── transcriber.py         # 字幕提取 + Whisper 转录
│   ├── downloader.py          # yt-dlp 下载封装
│   ├── douyin.py              # 抖音无水印解析
│   ├── auth.py                # JWT 用户认证
│   ├── requirements.txt
│   └── .env                   # 环境变量（API Key 等）
└── downloads/                 # 下载文件存放目录
```

---

## 🚀 快速开始

### 1. 环境要求

- **Python** ≥ 3.10
- **Node.js** ≥ 18
- **ffmpeg**（音频处理必需）

### 2. 后端启动

```bash
cd backend

# 创建虚拟环境
python -m venv .venv
.venv\Scripts\activate   # Windows
# source .venv/bin/activate  # macOS/Linux

# 安装依赖
pip install -r requirements.txt

# 配置环境变量（创建 backend/.env）
echo DEEPSEEK_API_KEY=sk-your-key-here > .env

# 启动服务（端口 8000，自动重载）
python -m uvicorn main:app --host 0.0.0.0 --port 8000 --reload
```

### 3. 前端启动

```bash
cd frontend

# 安装依赖
npm install

# 启动开发服务器（端口 5173，自动代理 /api 到后端）
npm run dev
```

访问 `http://localhost:5173` 即可使用。

---

## 📡 API 接口

### 视频解析与下载

| 端点             | 方法 | 说明                                     |
| ---------------- | ---- | ---------------------------------------- |
| `/api/info`      | POST | 获取视频元数据（标题、缩略图、格式列表） |
| `/api/download`  | POST | 下载视频（SSE 推送实时进度）             |
| `/api/thumbnail` | GET  | 缩略图代理（绕过防盗链）                 |

### AI 智能分析

| 端点                        | 方法 | 说明                                         |
| --------------------------- | ---- | -------------------------------------------- |
| `/api/transcribe`           | POST | 字幕提取（SSE 流，返回带时间戳的 segments）  |
| `/api/video/parse`          | POST | 基础解析（元数据 + 字幕纯文本，含 ASR 兜底） |
| `/api/video/summarize-text` | POST | AI 总结（SSE 流，基于 DeepSeek）             |
| `/api/video/mindmap-text`   | POST | 思维导图生成（返回 Markdown）                |

### 用户认证

| 端点                 | 方法 | 说明             |
| -------------------- | ---- | ---------------- |
| `/api/auth/register` | POST | 用户注册         |
| `/api/auth/login`    | POST | 用户登录         |
| `/api/auth/me`       | GET  | 获取当前用户信息 |

---

## 🔧 环境变量

在 `backend/.env` 中配置：

```env
# DeepSeek API Key（必需）
DEEPSEEK_API_KEY=sk-your-key-here

# Whisper 模型大小（可选，默认 base）
# 可选值: tiny / base / small / medium / large
WHISPER_MODEL=base
```

---

## 🎯 使用流程

1. **输入链接** — 粘贴 B站/抖音/YouTube 等视频 URL
2. **解析视频** — 自动获取标题、封面、可选清晰度
3. **下载视频** — 选择格式，实时查看下载进度
4. **AI 分析**（三个独立 Tab）：
   - **核心总结** — DeepSeek 生成视频要点摘要
   - **完整字幕** — 提取/转录带时间轴的字幕，支持导出 VTT
   - **思维导图** — 自动提炼逻辑结构，可缩放拖拽

---

## 📄 License

MIT License
