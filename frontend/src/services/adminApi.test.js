import test from "node:test";
import assert from "node:assert/strict";
import {
  buildTrendPoints,
  buildUserQuery,
  requestAdmin,
  validateCouponBatch,
} from "./adminApi.js";

test("admin request forwards bearer token and surfaces API detail", async () => {
  let received = null;
  const fetchImpl = async (url, options) => {
    received = { url, options };
    return new Response(JSON.stringify({ detail: "管理员权限不足" }), {
      status: 403,
      headers: { "Content-Type": "application/json" },
    });
  };

  await assert.rejects(
    () => requestAdmin("/overview", {}, "token-123", fetchImpl),
    /管理员权限不足/,
  );
  assert.equal(received.url, "/api/admin/overview");
  assert.equal(received.options.headers.Authorization, "Bearer token-123");
});

test("buildTrendPoints preserves zero-value dates", () => {
  const points = buildTrendPoints(
    [
      { date: "2026-07-20", count: 0 },
      { date: "2026-07-21", count: 3 },
    ],
    300,
    120,
  );

  assert.equal(points.length, 2);
  assert.match(points[0], /^0,/);
});

test("buildUserQuery omits empty filters and preserves page", () => {
  assert.equal(
    buildUserQuery({ query: "", status: "all", plan: "pro", page: 2 }),
    "?plan=pro&page=2&page_size=20",
  );
});

test("validateCouponBatch rejects count outside 1 to 100", () => {
  assert.equal(validateCouponBatch({ count: 0 }).count, "数量需为 1-100");
  assert.deepEqual(
    validateCouponBatch({
      plan: "pro",
      order_type: "weekly",
      count: 2,
      expires_days: 0,
      max_redemptions: 1,
    }),
    {},
  );
});
