import test from "node:test";
import assert from "node:assert/strict";
import {
  getPageFromPath,
  getPathForPage,
  isHomeSection,
  shouldPreserveScrollForHistoryOpen,
} from "./appNavigation.js";

test("maps parse and profile paths while unknown paths fall back home", () => {
  assert.equal(getPageFromPath("/parse"), "parse");
  assert.equal(getPageFromPath("/profile"), "profile");
  assert.equal(getPageFromPath("/redeem"), "redeem");
  assert.equal(getPageFromPath("/admin"), "admin");
  assert.equal(getPageFromPath("/anything-else"), "home");
});

test("builds stable page paths and recognises homepage anchors", () => {
  assert.equal(getPathForPage("parse"), "/parse");
  assert.equal(getPathForPage("profile"), "/profile");
  assert.equal(getPathForPage("redeem"), "/redeem");
  assert.equal(getPathForPage("admin"), "/admin");
  assert.equal(getPathForPage("home"), "/");
  assert.equal(isHomeSection("features"), true);
  assert.equal(isHomeSection("download-workspace"), false);
});

test("only history opened inside parse page preserves window scroll", () => {
  assert.equal(shouldPreserveScrollForHistoryOpen("parse"), true);
  assert.equal(shouldPreserveScrollForHistoryOpen("profile"), false);
});
