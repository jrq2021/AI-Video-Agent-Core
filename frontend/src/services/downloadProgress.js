export function toNumber(value, fallback = 0) {
  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

export function clampPercent(value) {
  return Math.min(100, Math.max(0, toNumber(value, 0)));
}

export function isFinalDownloadEvent(eventData) {
  return eventData?.status === "completed";
}

export function isIntermediateDownloadEvent(eventData) {
  return eventData?.status === "finished" || eventData?.status === "processing";
}

export function mergeDownloadProgress(current, eventData) {
  const previous = clampPercent(current?.percent || 0);

  if (eventData?.status === "downloading") {
    const incoming = clampPercent(eventData.percent);
    return {
      percent: Math.max(previous, incoming),
      speed: eventData.speed || 0,
      eta: eventData.eta || 0,
      downloaded: eventData.downloaded_bytes || current?.downloaded || 0,
      total: eventData.total_bytes || current?.total || 0,
      phaseLabel: "",
    };
  }

  if (isIntermediateDownloadEvent(eventData)) {
    return {
      ...(current || {}),
      percent: Math.max(previous, 99),
      speed: 0,
      eta: 0,
      phaseLabel: eventData.message || "正在整理文件…",
    };
  }

  return current || { percent: previous };
}
