import { useRef, useEffect, useState, useCallback } from "react";
import { Transformer } from "markmap-lib";
import { Markmap } from "markmap-view";
import { toPng } from "html-to-image";

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
  const [isExporting, setIsExporting] = useState(false);
  const exportingRef = useRef(false);

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
      mmRef.current = Markmap.create(
        el,
        { autoFit: true, duration: 400 },
        root,
      );
    }

    return () => {
      // 销毁 markmap 实例，阻止 d3 定时器在卸载后继续运行
      if (mmRef.current) {
        try {
          mmRef.current.destroy?.();
        } catch {}
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

  /* ──── 导出 SVG ──── */
  const handleExportSVG = useCallback(() => {
    const svgEl = svgRef.current;
    if (!svgEl) return;

    // 克隆 SVG 避免修改原始 DOM
    const clone = svgEl.cloneNode(true);
    // 设置显式宽高（确保导出完整）
    const bbox = svgEl.getBBox?.();
    const w = Math.ceil(bbox?.width || size.width);
    const h = Math.ceil(bbox?.height || size.height);
    clone.setAttribute("width", String(w));
    clone.setAttribute("height", String(h));
    clone.setAttribute("viewBox", `0 0 ${w} ${h}`);
    // 白色背景
    clone.style.backgroundColor = "#ffffff";

    const serializer = new XMLSerializer();
    const svgStr = `<?xml version="1.0" encoding="UTF-8"?>\n${serializer.serializeToString(clone)}`;
    const blob = new Blob([svgStr], { type: "image/svg+xml;charset=utf-8" });
    downloadBlob(blob, "思维导图.svg");
  }, [size]);

  /* ──── 导出高清 PNG ──── */
  const handleExportPNG = useCallback(async () => {
    if (exportingRef.current) return;
    exportingRef.current = true;
    setIsExporting(true);
    try {
      // 先 fit 确保导图完整展示
      mmRef.current?.fit();
      await new Promise((r) => setTimeout(r, 400)); // 等待动画完成

      const el = containerRef.current;
      if (!el) return;
      const dataUrl = await toPng(el, {
        pixelRatio: 2,
        backgroundColor: "#ffffff",
        cacheBust: true,
      });
      const res = await fetch(dataUrl);
      const blob = await res.blob();
      downloadBlob(blob, "思维导图.png");
    } catch (err) {
      console.error("导出 PNG 失败:", err);
      handleExportSVG();
    } finally {
      setIsExporting(false);
      exportingRef.current = false;
    }
  }, [handleExportSVG]);

  /* ──── 工具函数：触发浏览器下载 ──── */
  function downloadBlob(blob, filename) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  return (
    <div
      ref={containerRef}
      className="w-full rounded-xl overflow-hidden bg-white border border-dark-100"
    >
      {/* 工具栏 */}
      <div className="flex items-center gap-1 px-3 py-1.5 border-b border-dark-100 bg-dark-25">
        <span className="text-xs text-dark-400 mr-2 select-none">思维导图</span>
        <div className="flex-1" />
        {/* 导出 PNG */}
        <button
          onClick={handleExportPNG}
          disabled={isExporting}
          title="下载高清 PNG 图片"
          className="p-1 text-dark-400 hover:text-dark-700 hover:bg-dark-100 rounded transition-colors disabled:opacity-50"
        >
          {isExporting ? (
            <svg
              className="w-4 h-4 animate-spin"
              fill="none"
              viewBox="0 0 24 24"
            >
              <circle
                className="opacity-25"
                cx="12"
                cy="12"
                r="10"
                stroke="currentColor"
                strokeWidth="4"
              />
              <path
                className="opacity-75"
                fill="currentColor"
                d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
              />
            </svg>
          ) : (
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
                d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M16.5 12L12 16.5m0 0L7.5 12m4.5 4.5V3"
              />
            </svg>
          )}
        </button>
        {/* 导出 SVG */}
        <button
          onClick={handleExportSVG}
          title="下载 SVG 矢量图"
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
              d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m2.25 0H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z"
            />
          </svg>
        </button>
        <span className="w-px h-4 bg-dark-200 mx-0.5" />
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
      <svg
        ref={svgRef}
        style={{ width: size.width, height: size.height, display: "block" }}
      />
    </div>
  );
}
