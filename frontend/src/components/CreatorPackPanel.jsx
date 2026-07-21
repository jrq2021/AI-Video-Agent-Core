import { useEffect, useMemo, useState } from "react";
import { Copy, Download, Languages, LoaderCircle, Sparkles } from "lucide-react";
import {
  buildBilingualSrt,
  buildBilingualVtt,
  buildCreatorPackMarkdown,
} from "../services/creatorPack";

function downloadText(text, filename, type = "text/plain;charset=utf-8") {
  const link = document.createElement("a");
  link.href = URL.createObjectURL(new Blob([text], { type }));
  link.download = filename;
  link.click();
  URL.revokeObjectURL(link.href);
}

function timecode(seconds = 0) {
  const total = Math.max(0, Math.floor(Number(seconds) || 0));
  const hours = String(Math.floor(total / 3600)).padStart(2, "0");
  const minutes = String(Math.floor((total % 3600) / 60)).padStart(2, "0");
  const secs = String(total % 60).padStart(2, "0");
  return `${hours}:${minutes}:${secs}`;
}

export default function CreatorPackPanel({
  recordKey,
  title,
  segments,
  subtitles,
  artifacts,
  user,
  quota,
  getAuthHeaders,
  onArtifactsChange,
  onUpgrade,
  onAuthClick,
  consumeQuota,
}) {
  const [targetLanguage, setTargetLanguage] = useState("en");
  const [translatedSegments, setTranslatedSegments] = useState([]);
  const [translationState, setTranslationState] = useState("idle");
  const [pack, setPack] = useState({});
  const [packState, setPackState] = useState("idle");
  const [message, setMessage] = useState("");
  const creatorRemaining = Math.max(0, (quota?.daily_creator_credits_limit || 0) - (quota?.daily_creator_credits_used || 0));
  const canUseCreatorTools = Boolean(user && recordKey && creatorRemaining > 0);
  const resolvedSegments = Array.isArray(segments) ? segments : [];
  const resolvedSubtitles = String(subtitles || "");

  useEffect(() => {
    const nextLanguage = artifacts?.translation_language || "en";
    setTargetLanguage(nextLanguage);
    setTranslatedSegments(Array.isArray(artifacts?.translated_segments) ? artifacts.translated_segments : []);
    setPack(artifacts?.creator_pack || {});
    setTranslationState(artifacts?.translated_segments?.length ? "done" : "idle");
    setPackState(artifacts?.creator_pack ? "done" : "idle");
    setMessage("");
  }, [artifacts, recordKey]);

  const requireAccess = () => {
    if (!user) {
      setMessage("登录后可生成双语字幕和创作包。");
      onAuthClick?.();
      return false;
    }
    if (!recordKey) {
      setMessage("请先完成视频解析，再生成创作内容。");
      return false;
    }
    if (creatorRemaining <= 0) {
      setMessage("今日创作额度已用完，请明天再试或兑换会员码。");
      onUpgrade?.("双语字幕与创作包需要可用的创作额度");
      return false;
    }
    return true;
  };

  const translate = async () => {
    if (!requireAccess()) return;
    if (!resolvedSegments.length) {
      setMessage("请先提取带时间轴的字幕。");
      return;
    }
    setTranslationState("loading");
    setMessage("");
    try {
      const response = await fetch("/api/video/translate-subtitles", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...getAuthHeaders?.() },
        body: JSON.stringify({ record_key: recordKey, target_language: targetLanguage }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok || !data.success) throw new Error(data.detail || "双语字幕生成失败");
      setTranslatedSegments(data.data || []);
      setTranslationState("done");
      onArtifactsChange?.({ translated_segments: data.data || [], translation_language: targetLanguage });
      if (!data.cached) consumeQuota?.();
    } catch (error) {
      setTranslationState("error");
      setMessage(error.message || "双语字幕生成失败");
    }
  };

  const generatePack = async () => {
    if (!requireAccess()) return;
    if (resolvedSubtitles.trim().length < 20) {
      setMessage("请先提取至少一段有效字幕，再生成创作包。");
      return;
    }
    setPackState("loading");
    setMessage("");
    try {
      const response = await fetch("/api/video/creator-pack", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...getAuthHeaders?.() },
        body: JSON.stringify({ record_key: recordKey }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok || !data.success) throw new Error(data.detail || "创作包生成失败");
      setPack(data.data || {});
      setPackState("done");
      onArtifactsChange?.({ creator_pack: data.data || {} });
      if (!data.cached) consumeQuota?.();
    } catch (error) {
      setPackState("error");
      setMessage(error.message || "创作包生成失败");
    }
  };

  const packMarkdown = useMemo(() => buildCreatorPackMarkdown(pack, title), [pack, title]);

  return (
    <section className="creator-pack-panel" aria-label="双语字幕与创作包">
      <div className="creator-pack-panel__intro">
        <div>
          <span>CREATOR ASSETS</span>
          <h3>双语字幕与内容创作包</h3>
          <p>翻译或生成创作包各消耗 1 次今日创作额度；同一记录命中缓存不重复扣费。</p>
        </div>
        <strong>{creatorRemaining} <small>次额度</small></strong>
      </div>

      <div className="creator-pack-panel__actions">
        <label>
          目标语言
          <select value={targetLanguage} onChange={(event) => setTargetLanguage(event.target.value)}>
            <option value="en">English</option>
            <option value="zh-CN">简体中文</option>
          </select>
        </label>
        <button type="button" onClick={translate} disabled={translationState === "loading" || !canUseCreatorTools}>
          {translationState === "loading" ? <LoaderCircle className="is-spinning" /> : <Languages />}
          生成双语字幕
        </button>
        <button type="button" onClick={generatePack} disabled={packState === "loading" || !canUseCreatorTools}>
          {packState === "loading" ? <LoaderCircle className="is-spinning" /> : <Sparkles />}
          生成创作包
        </button>
      </div>
      {message ? <p className="creator-pack-panel__message" aria-live="polite">{message}</p> : null}

      {translatedSegments.length ? (
        <div className="bilingual-subtitles">
          <header>
            <h4>双语字幕</h4>
            <div>
              <button type="button" onClick={() => downloadText(buildBilingualSrt(translatedSegments), "bilingual-subtitles.srt")}>导出 SRT</button>
              <button type="button" onClick={() => downloadText(buildBilingualVtt(translatedSegments), "bilingual-subtitles.vtt")}>导出 VTT</button>
            </div>
          </header>
          <ul>
            {translatedSegments.map((segment, index) => (
              <li key={`${segment.start}-${segment.end}-${index}`}>
                <time>{timecode(segment.start)} — {timecode(segment.end)}</time>
                <p>{segment.text}</p>
                <p>{segment.translation}</p>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {packState === "done" && pack?.angle ? (
        <div className="creator-pack-output">
          <header>
            <h4>创作包</h4>
            <div>
              <button type="button" onClick={() => navigator.clipboard.writeText(packMarkdown)}><Copy /> 复制</button>
              <button type="button" onClick={() => downloadText(packMarkdown, "creator-pack.md", "text/markdown;charset=utf-8")}><Download /> 导出 .md</button>
            </div>
          </header>
          <section><h5>内容角度</h5><p>{pack.angle}</p></section>
          <section><h5>一句话摘要</h5><p>{pack.summary}</p></section>
          <section><h5>标题建议</h5><ol>{(pack.titles || []).map((item) => <li key={item}>{item}</li>)}</ol></section>
          <section><h5>60 秒口播提纲</h5><p className="creator-pack-output__pre">{pack.spoken_outline}</p></section>
          <section><h5>小红书笔记</h5><p className="creator-pack-output__pre">{pack.xiaohongshu}</p></section>
          <section><h5>公众号摘要</h5><p className="creator-pack-output__pre">{pack.wechat_summary}</p></section>
          <section><h5>高光时间点</h5><ul>{(pack.highlights || []).map((item) => <li key={`${item.start}-${item.end}`}><time>{timecode(item.start)} — {timecode(item.end)}</time><strong>{item.title}</strong><span>{item.reason}</span></li>)}</ul></section>
        </div>
      ) : null}
    </section>
  );
}
