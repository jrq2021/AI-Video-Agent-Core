const ADMIN_API_PREFIX = "/api/admin";

export function buildTrendPoints(trend = [], width = 300, height = 120) {
  if (!trend.length) return [];
  const maxCount = Math.max(1, ...trend.map((item) => Number(item.count) || 0));
  const lastIndex = Math.max(1, trend.length - 1);
  return trend.map((item, index) => {
    const x = (width / lastIndex) * index;
    const y = height - ((Number(item.count) || 0) / maxCount) * height;
    return `${Number(x.toFixed(2))},${Number(y.toFixed(2))}`;
  });
}

export function buildUserQuery({ query = "", status = "all", plan = "all", page = 1 } = {}) {
  const params = new URLSearchParams();
  if (query.trim()) params.set("query", query.trim());
  if (status !== "all") params.set("status", status);
  if (plan !== "all") params.set("plan", plan);
  params.set("page", String(Math.max(1, Number(page) || 1)));
  params.set("page_size", "20");
  return `?${params.toString()}`;
}

export function validateCouponBatch(values = {}) {
  const errors = {};
  const count = Number(values.count);
  const expiresDays = Number(values.expires_days);
  const maxRedemptions = Number(values.max_redemptions);
  if (!values.plan) errors.plan = "请选择套餐";
  if (!values.order_type) errors.order_type = "请选择套餐类型";
  if (!Number.isInteger(count) || count < 1 || count > 100) {
    errors.count = "数量需为 1-100";
  }
  if (!Number.isInteger(expiresDays) || expiresDays < 0 || expiresDays > 3650) {
    errors.expires_days = "有效期需为 0-3650 天";
  }
  if (!Number.isInteger(maxRedemptions) || maxRedemptions < 1 || maxRedemptions > 100) {
    errors.max_redemptions = "每张使用次数需为 1-100";
  }
  if (String(values.note || "").length > 120) errors.note = "备注不能超过 120 个字符";
  if (values.plan === "pro" && values.order_type === "lifetime") {
    errors.order_type = "Pro 仅支持周卡、月卡或年卡";
  }
  if (values.plan === "ultra" && values.order_type !== "lifetime") {
    errors.order_type = "Ultra 仅支持终身卡";
  }
  return errors;
}

function getAdminPath(path) {
  return `${ADMIN_API_PREFIX}${path.startsWith("/") ? path : `/${path}`}`;
}

async function readApiPayload(response) {
  const contentType = response.headers.get("content-type") || "";
  if (!contentType.includes("application/json")) return null;
  try {
    return await response.json();
  } catch {
    return null;
  }
}

function getApiError(payload, fallback) {
  if (payload && typeof payload.detail === "string") return payload.detail;
  return fallback;
}

export async function requestAdmin(path, options = {}, token = "", fetchImpl = fetch) {
  const { headers = {}, body, ...requestOptions } = options;
  const requestHeaders = {
    Accept: "application/json",
    ...headers,
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
  const shouldEncodeJson = body !== undefined && !(body instanceof FormData) && typeof body !== "string";
  if (shouldEncodeJson && !requestHeaders["Content-Type"]) {
    requestHeaders["Content-Type"] = "application/json";
  }

  const response = await fetchImpl(getAdminPath(path), {
    ...requestOptions,
    headers: requestHeaders,
    ...(body === undefined ? {} : { body: shouldEncodeJson ? JSON.stringify(body) : body }),
  });
  const payload = await readApiPayload(response);
  if (!response.ok) {
    throw new Error(getApiError(payload, `请求失败（${response.status}）`));
  }
  return payload;
}

export async function downloadCouponCsv(
  token,
  status = "all",
  fetchImpl = fetch,
  documentImpl = document,
  urlImpl = URL,
) {
  const response = await fetchImpl(`${getAdminPath("/coupons/export")}?status=${encodeURIComponent(status)}`, {
    headers: {
      Accept: "text/csv",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
  });
  if (!response.ok) {
    throw new Error(getApiError(await readApiPayload(response), `导出失败（${response.status}）`));
  }
  const objectUrl = urlImpl.createObjectURL(await response.blob());
  const link = documentImpl.createElement("a");
  link.href = objectUrl;
  link.download = "coupons.csv";
  documentImpl.body.appendChild(link);
  link.click();
  link.remove();
  urlImpl.revokeObjectURL(objectUrl);
}
