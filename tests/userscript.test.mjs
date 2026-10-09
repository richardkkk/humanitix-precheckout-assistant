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

test("optional buyer fields are skipped when an event omits them", () => {
  assert.match(source, /fillInputById\("emailConfirmation", profile\.email\);/);
  assert.match(source, /if \(zid\) setNativeValue\(zid, profile\.zid\);/);
});

test("supports alternate UNSW ticket questions and continue label", () => {
  assert.match(source, /Are you a UNSW Student/);
  assert.match(source, /UNSW Student zID/);
  assert.match(source, /What is your enrolment type/);
  assert.match(source, /What is your level of study/);
  assert.match(source, /Continue\(\?: to Payment\)\?/);
});

test("stops for confirmation when buyer Continue may submit a free booking", () => {
  assert.match(source, /Continue to \(\?:Ticket info\|Payment\)/);
  assert.match(source, /这个 Continue 可能直接完成免费报名/);
  assert.match(source, /await waitFor\(\(\) => !inputById\("firstName"\)/);
});

test("waits for conditional Food Hub questions after selecting student status", () => {
  assert.match(source, /const hasStudentQuestion = await chooseCombobox/);
  assert.match(source, /选择 UNSW Student 后显示后续问题/);
  assert.match(source, /确认已选择 \$\{value\}/);
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

test("uses a 150ms precision window but never reloads before release", async () => {
  const start = source.indexOf("async function waitUntilRelease");
  const end = source.indexOf("\n\n  async function handleTicketPage", start);
  assert.ok(start >= 0 && end > start);
  const functionSource = source.slice(start, end);
  const runHarness = Function(`
    return async () => {
      const RealDate = globalThis.Date;
      let now = 1000;
      let running = true;
      let reloadAt = null;
      const sleeps = [];
      class FakeDate extends RealDate {
        static now() { return now; }
      }
      const Date = FakeDate;
      const sleep = async (milliseconds) => {
        sleeps.push(milliseconds);
        now += milliseconds;
      };
      const setStatus = () => {};
      const location = { reload() { reloadAt = now; } };
      ${functionSource}
      await waitUntilRelease({ releaseAt: new RealDate(3500).toISOString() });
      return { reloadAt, sleeps };
    };
  `)();
  const result = await runHarness();
  assert.equal(result.reloadAt, 3500);
  assert.ok(result.sleeps.some((milliseconds) => milliseconds <= 10));
});
