import { useCallback, useEffect, useMemo, useState } from "react";
import { Clock3, FileVideo2, ListChecks, LoaderCircle, Sparkles } from "lucide-react";
import { normalizeBatchUrls } from "../services/batchUrls";

function remaining(limit = 0, used = 0) {
  return Math.max(0, Number(limit || 0) - Number(used || 0));
}

export default function BatchParsePanel({
  user,
  quota,
  getAuthHeaders,
  onOpenRecord,
  onAuthClick,
  onUpgrade,
}) {
  const [rawUrls, setRawUrls] = useState("");
  const [jobs, setJobs] = useState([]);
  const [message, setMessage] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const urls = useMemo(() => normalizeBatchUrls(rawUrls), [rawUrls]);
  const maxItems = quota?.batch_max_count || 0;
  const batchRemaining = remaining(
    quota?.daily_batch_items_limit,
    quota?.daily_batch_items_used,
  );

  const loadJobs = useCallback(async () => {
    if (!user) {
      setJobs([]);
      return;
    }
    const response = await fetch("/api/batch-jobs", { headers: getAuthHeaders?.() });
    if (!response.ok) throw new Error("无法读取批量任务");
    const data = await response.json();
    const summaries = data.jobs || [];
    const fullJobs = await Promise.all(
      summaries.map(async (job) => {
        const detail = await fetch(`/api/batch-jobs/${encodeURIComponent(job.id)}`, {
          headers: getAuthHeaders?.(),
        });
        if (!detail.ok) return job;
        const payload = await detail.json();
        return payload.job || job;
      }),
    );
    setJobs(fullJobs);
  }, [getAuthHeaders, user]);

  useEffect(() => {
    loadJobs().catch(() => {});
  }, [loadJobs]);

  const hasActiveJob = jobs.some((job) => ["queued", "running"].includes(job.status));
  useEffect(() => {
    if (!hasActiveJob) return undefined;
    const timer = window.setInterval(() => {
      loadJobs().catch(() => {});
    }, 2_000);
    return () => window.clearInterval(timer);
  }, [hasActiveJob, loadJobs]);

  const submit = async (event) => {
    event.preventDefault();
    setMessage("");
    if (!user) {
      onAuthClick?.();
      return;
    }
    if (!quota?.can_batch_parse) {
      onUpgrade?.("批量解析是 Pro 会员专属权益");
      return;
    }
    if (!urls.length) {
      setMessage("请粘贴至少一个公开视频链接。");
      return;
    }
    if (urls.length > maxItems) {
      setMessage(`当前套餐每批最多 ${maxItems} 条，请删减后再提交。`);
      return;
    }
    if (urls.length > batchRemaining) {
      setMessage(`今日批量额度还剩 ${batchRemaining} 条，请明天再试或减少链接。`);
      return;
    }

    setIsSubmitting(true);
    try {
      const response = await fetch("/api/batch-jobs", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...getAuthHeaders?.() },
        body: JSON.stringify({ urls }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok || !data.success) throw new Error(data.detail || "批量任务创建失败");
      setRawUrls("");
      setMessage("任务已进入队列，会逐条解析并保存到你的历史记录。");
      await loadJobs();
    } catch (error) {
      setMessage(error.message || "批量任务创建失败");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <section className="batch-parse-panel" aria-label="批量解析">
      <header className="batch-parse-panel__header">
        <div>
          <span>PRO WORKFLOW</span>
          <h2>批量解析公开视频</h2>
          <p>一次提交多条链接，系统按顺序解析字幕，不会自动下载视频或消耗创作额度。</p>
        </div>
        <div className="batch-parse-panel__quota" aria-label="批量解析额度">
          <ListChecks aria-hidden="true" />
          <span>今日剩余</span>
          <strong>{batchRemaining}</strong>
          <small>/ {quota?.daily_batch_items_limit || 0} 条</small>
        </div>
      </header>

      <form className="batch-parse-panel__form" onSubmit={submit}>
        <label htmlFor="batch-video-urls">每行一个公开视频链接</label>
        <textarea
          id="batch-video-urls"
          value={rawUrls}
          onChange={(event) => setRawUrls(event.target.value)}
          placeholder={"https://example.com/video-a\nhttps://example.com/video-b"}
          rows={5}
        />
        <div className="batch-parse-panel__actions">
          <p>已识别 <strong>{urls.length}</strong> 条去重链接；当前每批上限 {maxItems || "—"} 条。</p>
          <button type="submit" disabled={isSubmitting}>
            {isSubmitting ? <LoaderCircle className="is-spinning" aria-hidden="true" /> : <Sparkles aria-hidden="true" />}
            {isSubmitting ? "正在创建…" : "提交批量解析"}
          </button>
        </div>
        {message ? <p className="batch-parse-panel__message" aria-live="polite">{message}</p> : null}
      </form>

      {jobs.length ? (
        <div className="batch-job-list" aria-live="polite">
          {jobs.map((job) => (
            <article key={job.id} className={`batch-job-card is-${job.status}`}>
              <header>
                <div>
                  <span>批次 {job.id.slice(0, 8)}</span>
                  <strong>{job.completed_count || 0} / {job.total_count || 0} 已完成</strong>
                </div>
                <span className="batch-job-card__status">
                  <Clock3 aria-hidden="true" />
                  {job.status === "queued" ? "排队中" : job.status === "running" ? "解析中" : job.status === "completed" ? "已完成" : "部分失败"}
                </span>
              </header>
              {job.items?.length ? (
                <ul>
                  {job.items.map((item) => (
                    <li key={item.id} className={`is-${item.status}`}>
                      <FileVideo2 aria-hidden="true" />
                      <div>
                        <strong>{item.title || item.url}</strong>
                        <span>{item.status === "failed" ? item.error_message || "解析失败" : item.status === "completed" ? "解析完成" : item.status === "running" ? "正在解析" : "等待处理"}</span>
                      </div>
                      {item.record_key ? (
                        <button type="button" onClick={() => onOpenRecord?.(item.record_key)}>打开</button>
                      ) : null}
                    </li>
                  ))}
                </ul>
              ) : null}
            </article>
          ))}
        </div>
      ) : null}
    </section>
  );
}
