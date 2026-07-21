export function getFormatHeight(format = {}) {
  const directHeight = Number.parseInt(format.height, 10);
  if (Number.isFinite(directHeight) && directHeight > 0) return directHeight;

  const candidates = [format.resolution, format.format_note]
    .filter(Boolean)
    .map(String);

  for (const value of candidates) {
    const explicit = value.match(/(\d{3,4})p\b/i);
    if (explicit) return Number.parseInt(explicit[1], 10);

    const dimensions = value.match(/\b\d{3,5}\s*x\s*(\d{3,4})\b/i);
    if (dimensions) return Number.parseInt(dimensions[1], 10);
  }

  return 0;
}

export function getFormatLabel(format = {}) {
  const height = getFormatHeight(format);
  if (height) return `${height}p`;
  return format.format_note || format.resolution || format.ext || "未知";
}
