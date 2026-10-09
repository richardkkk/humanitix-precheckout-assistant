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
  assert.match(source, /<option value="apple-pay">Apple Pay<\/option>/);
  assert.match(source, /"apple-pay": \/\^Apple Pay\$\/i/);
});

test("reads the next displayed Humanitix release time with Sydney daylight offset", () => {
  const start = source.indexOf("function extractNextReleaseAt");
  const end = source.indexOf("\n\n  async function waitUntilRelease", start);
  assert.ok(start >= 0 && end > start);
  const extractNextReleaseAt = Function(`return (${source.slice(start, end)})`)();
  const result = extractNextReleaseAt(
    "Arc UNSW Student Second Release Sales start at Mon 12th Oct 2026, 12:00 pm AEDT",
    Date.parse("2026-10-09T00:00:00Z"),
  );
  assert.equal(result, "2026-10-12T01:00:00.000Z");
});
