// Test cho badge độ tươi dữ liệu trên trang Tổng quan (chữ "cập nhật …" / "dữ liệu cũ … giờ").
// Chạy: node --test tests/*.mjs
//
// Tách ra từ tests/refresh-jobs.test.mjs ngày 21/09/2026, khi nút "Cập nhật dữ liệu" và
// runner ở máy vận hành bị gỡ (dashboard nay chỉ cập nhật tự động 9h/15h qua
// cron-worker → refresh-data.yml). Badge thì GIỮ LẠI — nó là thứ duy nhất còn báo cho
// người xem biết số trên trang có cũ hay không, nên phần test này phải sống tiếp.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

// Trích thẳng hàm từ index.html theo đúng cách tests/brand-split-reconcile.test.mjs làm.
const html = readFileSync(new URL("../index.html", import.meta.url), "utf8");
const src = html.match(/^[ \t]*function freshnessLevel\(generatedAt, nowMs\)\{[\s\S]*?\n[ \t]*\}/m);
assert.ok(src, "không trích được freshnessLevel từ index.html");
const freshnessLevel = new Function(`${src[0]}\nreturn freshnessLevel;`)();

// generated_at là giờ VN (+07) → mốc quy về UTC.
const genVN = (iso) => iso;
const msVN = (y, mo, d, h, mi) => Date.UTC(y, mo - 1, d, h, mi) - 7 * 3600 * 1000;

test("snapshot dưới 24 giờ: bình thường", () => {
  const f = freshnessLevel(genVN("2026-08-17 15:50"), msVN(2026, 8, 18, 10, 0));
  assert.equal(f.level, "ok");
  assert.match(f.text, /cập nhật 2026-08-17 15:50/);
});

test("snapshot 24–72 giờ: cảnh báo vàng kèm số giờ", () => {
  const f = freshnessLevel(genVN("2026-08-14 17:01"), msVN(2026, 8, 16, 9, 1));
  assert.equal(f.level, "warn");
  assert.equal(f.hours, 40);
  assert.match(f.text, /dữ liệu đã cũ 40 giờ/);
});

test("snapshot quá 72 giờ: cảnh báo đỏ kèm số ngày", () => {
  // Đúng tình huống thật ngày 17/08/2026: dữ liệu đứng từ 14/08 vì GitHub khoá Actions.
  const f = freshnessLevel(genVN("2026-08-14 17:01"), msVN(2026, 8, 17, 20, 0));
  assert.equal(f.level, "bad");
  assert.match(f.text, /dữ liệu cũ 3 ngày/);
});

test("ranh giới 24h và 72h rơi đúng bậc", () => {
  assert.equal(freshnessLevel("2026-08-16 10:00", msVN(2026, 8, 17, 9, 59)).level, "ok");
  assert.equal(freshnessLevel("2026-08-16 10:00", msVN(2026, 8, 17, 10, 0)).level, "warn");
  assert.equal(freshnessLevel("2026-08-16 10:00", msVN(2026, 8, 19, 10, 0)).level, "warn");
  assert.equal(freshnessLevel("2026-08-16 10:00", msVN(2026, 8, 19, 11, 0)).level, "bad");
});

test("thiếu generated_at thì nói KHÔNG RÕ, không bịa là mới", () => {
  const f = freshnessLevel("", Date.now());
  assert.equal(f.level, "unknown");
  assert.equal(f.hours, null);
});

// ── 7. Badge phải soi CẢ snapshot doanh số, không chỉ file dashboard bọc ngoài ──
// Sự cố 19→24/08/2026: job fetch Pancake kẹt push (chỉ `git add` 1 trong 2 file nó
// ghi ra → rebase từ chối chạy → snapshot bị vứt). refresh-data vẫn dựng lại
// dashboard-data.json mỗi ngày nên D.generated_at luôn mới, badge xanh suốt 5 ngày,
// còn bảng doanh số thì đứng ở ngày 22 — chênh Pancake POS ~38 triệu.
const srcStalest = html.match(/^[ \t]*function stalestSnapshot\(parts, nowMs\)\{[\s\S]*?\n[ \t]*\}/m);
assert.ok(srcStalest, "không trích được stalestSnapshot từ index.html");
const stalestSnapshot = new Function(
  src[0] + "\n" + srcStalest[0] + "\nreturn stalestSnapshot;"
)();

test("dashboard mới nhưng snapshot doanh số cũ → vẫn phải báo động", () => {
  const f = stalestSnapshot([
    { label: "", at: "2026-08-24 09:01" },
    { label: "doanh số Pancake", at: "2026-08-22 05:37 UTC" },
  ], msVN(2026, 8, 24, 16, 0));
  assert.equal(f.level, "warn", "lấy mốc CŨ NHẤT, không lấy mốc mới nhất");
  assert.match(f.text, /doanh số Pancake/, "phải gọi tên nguồn đang cũ");
});

test("mốc có hậu tố UTC không bị lệch 7 giờ", () => {
  // 2026-08-22 05:37 UTC = 12:37 giờ VN. Sau đó đúng 2 giờ → 2 giờ tuổi, không phải 9.
  const f = freshnessLevel("2026-08-22 05:37 UTC", Date.UTC(2026, 7, 22, 7, 37));
  assert.equal(f.hours, 2);
});

test("mọi nguồn đều mới → badge xanh, không thêm chữ thừa", () => {
  const f = stalestSnapshot([
    { label: "", at: "2026-08-24 09:01" },
    { label: "doanh số Pancake", at: "2026-08-24 07:10 UTC" },
  ], msVN(2026, 8, 24, 16, 0));
  assert.equal(f.level, "ok");
  assert.doesNotMatch(f.text, /cũ nhất/);
});
