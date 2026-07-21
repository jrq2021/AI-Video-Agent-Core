import test from "node:test";
import assert from "node:assert/strict";
import {
  isFinalDownloadEvent,
  isIntermediateDownloadEvent,
  mergeDownloadProgress,
} from "./downloadProgress.js";

test("下载进度不会因为切换视频/音频流而回退", () => {
  const current = { percent: 90, speed: 1024, eta: 3 };
  const next = mergeDownloadProgress(current, {
    status: "downloading",
    percent: 5,
    speed: 2048,
    eta: 20,
    downloaded_bytes: 10,
    total_bytes: 200,
  });

  assert.equal(next.percent, 90);
  assert.equal(next.speed, 2048);
});

test("只有 completed 才表示最终文件可以保存", () => {
  assert.equal(isFinalDownloadEvent({ status: "finished" }), false);
  assert.equal(isFinalDownloadEvent({ status: "processing" }), false);
  assert.equal(isFinalDownloadEvent({ status: "completed" }), true);
});

test("finished/processing 只显示处理中，不触发最终完成", () => {
  assert.equal(isIntermediateDownloadEvent({ status: "finished" }), true);
  assert.equal(isIntermediateDownloadEvent({ status: "processing" }), true);

  const next = mergeDownloadProgress({ percent: 64 }, { status: "finished" });
  assert.equal(next.percent, 99);
  assert.equal(next.phaseLabel, "正在整理文件…");
});
