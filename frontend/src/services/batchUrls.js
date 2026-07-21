export function normalizeBatchUrls(value = "") {
  const seen = new Set();
  return String(value)
    .split(/\r?\n/)
    .map((item) => item.trim())
    .filter((item) => {
      if (!item || seen.has(item)) return false;
      seen.add(item);
      return true;
    });
}
