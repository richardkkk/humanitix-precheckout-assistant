import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const source = await readFile(new URL("../userscript/humanitix-precheckout.user.js", import.meta.url), "utf8");

test("userscript has install and update metadata", () => {
  assert.match(source, /@downloadURL\s+https:\/\/raw\.githubusercontent\.com\/richardkkk\/humanitix-precheckout-assistant\/main\/userscript\/humanitix-precheckout\.user\.js/);
  assert.match(source, /@updateURL\s+https:\/\/raw\.githubusercontent\.com\/richardkkk\/humanitix-precheckout-assistant\/main\/userscript\/humanitix-precheckout\.user\.js/);
});

test("public userscript starts with an empty local profile", () => {
  assert.match(source, /firstName:\s*""/);
  assert.match(source, /lastName:\s*""/);
  assert.match(source, /email:\s*""/);
  assert.match(source, /mobile:\s*""/);
  assert.match(source, /zid:\s*""/);
});

test("first-run setup and payment boundary are present", () => {
  assert.match(source, /Humanitix 助手首次设置/);
  assert.match(source, /打开 Google Pay/);
  assert.match(source, /autoStartScheduledEvents/);
});
