import { useRef, useEffect, useState } from "react";
import { Transformer } from "markmap-lib";
import { Markmap } from "markmap-view";

/* ── 默认假数据（三级 Markdown 列表）──── */
const DEFAULT_MINDMAP = `# AI 视频总结
## 核心技术
### DeepSeek 大模型
### 语音识别 ASR
### 字幕提取
## 功能特点
### 多平台下载
### 字幕同步高亮
### 思维导图生成
### 一键复制导出
## 支持平台
### Bilibili
### YouTube
### TikTok
## 使用场景
### 学习笔记
### 会议复盘
### 内容创作
`;

/* ═══════════════════════════════════════════════════════════════════
 * MindMapView
 * - 接收 markdown 字符串，渲染为可缩放/拖拽的思维导图
 * - 内建 toolbar（zoom in/out, fit）
 * ═══════════════════════════════════════════════════════════════════ */
export default function MindMapView({ markdown }) {
  const containerRef = useRef(null);
  const svgRef = useRef(null);
  const mmRef = useRef(null);
  const [size, setSize] = useState({ width: 400, height: 460 });

  /* 测量容器宽度 */
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const ro = new ResizeObserver(([entry]) => {
      const { width } = entry.contentRect;
      if (width > 0) setSize({ width, height: 460 });
    });
    ro.observe(el);
    // 初始值
    const w = el.clientWidth;
    if (w > 0) setSize({ width: w, height: 460 });
    return () => ro.disconnect();
  }, []);

  /* 渲染 markmap */
  useEffect(() => {
    const el = svgRef.current;
    if (!el || size.width <= 0) return;

    // 设置显式 SVG 尺寸（避免 "Could not resolve relative length"）
    el.setAttribute("width", String(size.width));
    el.setAttribute("height", String(size.height));

    const source = markdown || DEFAULT_MINDMAP;
    const transformer = new Transformer();
    const { root } = transformer.transform(source);

    if (mmRef.current) {
      mmRef.current.setData(root);
      mmRef.current.fit();
    } else {
      mmRef.current = Markmap.create(el, { autoFit: true, duration: 400 }, root);
    }

    return () => {
      // 销毁 markmap 实例，阻止 d3 定时器在卸载后继续运行
      if (mmRef.current) {
        try { mmRef.current.destroy?.(); } catch {}
        mmRef.current = null;
      }
    };
  }, [markdown, size]);

  /* 窗口 resize 时自适应 */
  useEffect(() => {
    const onResize = () => mmRef.current?.fit();
    window.addEventListener("resize", onResize);
    return () => {
      window.removeEventListener("resize", onResize);
    };
  }, []);

  return (
    <div ref={containerRef} className="w-full rounded-xl overflow-hidden bg-white border border-dark-100">
      {/* 工具栏 */}
      <div className="flex items-center gap-1 px-3 py-1.5 border-b border-dark-100 bg-dark-25">
        <span className="text-xs text-dark-400 mr-2 select-none">思维导图</span>
        <div className="flex-1" />
        <button
          onClick={() => mmRef.current?.fit()}
          title="适应画面"
          className="p-1 text-dark-400 hover:text-dark-700 hover:bg-dark-100 rounded transition-colors"
        >
          <svg
            className="w-4 h-4"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={1.5}
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M3.75 3.75v4.5m0-4.5h4.5m-4.5 0L9 8.25M3.75 20.25v-4.5m0 4.5h4.5m-4.5 0L9 15.75M20.25 3.75h-4.5m4.5 0v4.5m0-4.5L15 8.25M20.25 20.25h-4.5m4.5 0v-4.5m0 4.5L15 15.75"
            />
          </svg>
        </button>
        <button
          onClick={() => mmRef.current?.rescale(1.3)}
          title="放大"
          className="p-1 text-dark-400 hover:text-dark-700 hover:bg-dark-100 rounded transition-colors"
        >
          <svg
            className="w-4 h-4"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={1.5}
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607zM10.5 7.5v6m3-3h-6"
            />
          </svg>
        </button>
        <button
          onClick={() => mmRef.current?.rescale(0.77)}
          title="缩小"
          className="p-1 text-dark-400 hover:text-dark-700 hover:bg-dark-100 rounded transition-colors"
        >
          <svg
            className="w-4 h-4"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={1.5}
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607zM13.5 10.5h-6"
            />
          </svg>
        </button>
      </div>

      {/* SVG 画布 */}
      <svg ref={svgRef} style={{ width: size.width, height: size.height, display: "block" }} />
    </div>
  );
}
