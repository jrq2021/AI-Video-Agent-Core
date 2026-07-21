import test from "node:test";
import assert from "node:assert/strict";
import { getFormatHeight, getFormatLabel } from "./videoFormats.js";

test("YouTube resolution 640x360 displays as 360p, not 640p", () => {
  const format = { resolution: "640x360", ext: "mp4" };

  assert.equal(getFormatHeight(format), 360);
  assert.equal(getFormatLabel(format), "360p");
});

test("direct height is preferred when backend provides it", () => {
  const format = { height: 1080, resolution: "1920x1080", format_note: "1080p" };

  assert.equal(getFormatHeight(format), 1080);
  assert.equal(getFormatLabel(format), "1080p");
});

test("format note can provide height when resolution is missing", () => {
  assert.equal(getFormatLabel({ format_note: "720p", ext: "mp4" }), "720p");
});
