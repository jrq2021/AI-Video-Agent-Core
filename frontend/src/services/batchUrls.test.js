import test from "node:test";
import assert from "node:assert/strict";
import { normalizeBatchUrls } from "./batchUrls.js";

test("normalizes multiline batch URLs and removes duplicates", () => {
  assert.deepEqual(
    normalizeBatchUrls("https://a.example/video\n\nhttps://a.example/video\nhttps://b.example/video"),
    ["https://a.example/video", "https://b.example/video"],
  );
});
