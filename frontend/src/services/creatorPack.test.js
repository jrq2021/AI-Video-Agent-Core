import test from "node:test";
import assert from "node:assert/strict";
import {
  buildBilingualSrt,
  buildBilingualVtt,
  buildCreatorPackMarkdown,
  getCreatorTargetLanguage,
} from "./creatorPack.js";

test("builds bilingual subtitles without modifying original timestamps", () => {
  const segments = [{ start: 0, end: 1.2, text: "你好", translation: "Hello" }];

  assert.match(buildBilingualSrt(segments), /00:00:00,000 --> 00:00:01,200/);
  assert.match(buildBilingualVtt(segments), /00:00:00.000 --> 00:00:01.200/);
});

test("creator pack Markdown contains every customer-facing section", () => {
  const markdown = buildCreatorPackMarkdown(
    {
      angle: "学习方法",
      summary: "一句话摘要",
      titles: ["标题一"],
      spoken_outline: "开场\n要点",
      xiaohongshu: "小红书正文",
      wechat_summary: "公众号摘要",
      highlights: [{ start: 0, end: 5, title: "高光", reason: "重点" }],
    },
    "视频标题",
  );

  assert.match(markdown, /## 小红书笔记/);
  assert.match(markdown, /## 高光时间点/);
});

test("creator tools default to Simplified Chinese and restore saved language", () => {
  assert.equal(getCreatorTargetLanguage(), "zh-CN");
  assert.equal(getCreatorTargetLanguage({ translation_language: "en" }), "en");
});
