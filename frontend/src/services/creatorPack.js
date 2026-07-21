function pad(value, length = 2) {
  return String(Math.max(0, value)).padStart(length, "0");
}

function toTimestamp(seconds, separator) {
  const totalMilliseconds = Math.max(0, Math.round(Number(seconds || 0) * 1000));
  const hours = Math.floor(totalMilliseconds / 3_600_000);
  const minutes = Math.floor((totalMilliseconds % 3_600_000) / 60_000);
  const wholeSeconds = Math.floor((totalMilliseconds % 60_000) / 1_000);
  const milliseconds = totalMilliseconds % 1_000;
  return `${pad(hours)}:${pad(minutes)}:${pad(wholeSeconds)}${separator}${pad(milliseconds, 3)}`;
}

function toClock(seconds) {
  return toTimestamp(seconds, ".").slice(0, -4);
}

export function buildBilingualSrt(segments = []) {
  return segments
    .map(
      (segment, index) =>
        `${index + 1}\n${toTimestamp(segment.start, ",")} --> ${toTimestamp(segment.end, ",")}\n${segment.text || ""}\n${segment.translation || ""}`,
    )
    .join("\n\n");
}

export function buildBilingualVtt(segments = []) {
  const cues = segments
    .map(
      (segment) =>
        `${toTimestamp(segment.start, ".")} --> ${toTimestamp(segment.end, ".")}\n${segment.text || ""}\n${segment.translation || ""}`,
    )
    .join("\n\n");
  return `WEBVTT\n\n${cues}`;
}

export function buildCreatorPackMarkdown(pack = {}, title = "") {
  const titles = Array.isArray(pack.titles)
    ? pack.titles.map((item) => `- ${item}`).join("\n")
    : "";
  const highlights = Array.isArray(pack.highlights)
    ? pack.highlights
        .map(
          (item) =>
            `- ${toClock(item.start)} - ${toClock(item.end)}｜${item.title || ""}：${item.reason || ""}`,
        )
        .join("\n")
    : "";
  return `# ${title || "创作内容包"}\n\n## 内容角度\n${pack.angle || ""}\n\n## 一句话摘要\n${pack.summary || ""}\n\n## 标题建议\n${titles}\n\n## 60 秒口播提纲\n${pack.spoken_outline || ""}\n\n## 小红书笔记\n${pack.xiaohongshu || ""}\n\n## 公众号摘要\n${pack.wechat_summary || ""}\n\n## 高光时间点\n${highlights}\n`;
}
