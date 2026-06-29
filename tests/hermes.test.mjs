// Test cho Hermes chat agent — chạy OFFLINE (không gọi mạng, không đụng D1).
// Chạy:  node --test tests/
//
// Kiểm logic thuần `sanityCheck` (LUẬT TÍNH DỮ LIỆU: KHÔNG bịa số — số VND trong
// câu trả lời PHẢI khớp tool result, nếu không thì gắn cảnh báo).

import { test } from "node:test";
import assert from "node:assert/strict";
import { sanityCheck } from "../functions/lib/hermesAgent.js";
import { isComplexQuery, tryFastpath } from "../functions/lib/hermesFastpath.js";
import { TOOLS } from "../functions/lib/hermesTools.js";
import { resolveTimeRange } from "../functions/lib/fbAdsHelpers.js";

// ── TEST 1: số khớp tool result → ok = true ──────────────────────────────
test("sanityCheck: số VND có trong tool result → ok", () => {
  const toolResults = [{ total_spend_vnd: 227240568 }];
  const text = "Tổng spend Phương Nam tháng này là 227,240,568 VND.";
  const r = sanityCheck(text, toolResults);
  assert.equal(r.ok, true);
  assert.equal(r.suspicious_numbers.length, 0);
});

// ── TEST 2: số bịa (không có trong tool result) → ok = false + flag ──────
test("sanityCheck: số VND KHÔNG có trong tool result → suspicious", () => {
  const toolResults = [{ total_spend_vnd: 227240568 }];
  const text = "Tổng spend là 999,888,777 VND.";
  const r = sanityCheck(text, toolResults);
  assert.equal(r.ok, false);
  assert.ok(r.suspicious_numbers.length >= 1, "phải flag ít nhất 1 số");
});

// ── TEST 3: số nhỏ (<1000) bỏ qua, không flag ────────────────────────────
test("sanityCheck: số nhỏ <1000 không bị soi", () => {
  const r = sanityCheck("Có 250 đồng lẻ thôi.", [{}]);
  assert.equal(r.ok, true);
});

// ── TEST 4: không có số VND nào → luôn ok ────────────────────────────────
test("sanityCheck: text không có số tiền → ok", () => {
  const r = sanityCheck("Không có dữ liệu cho khoảng thời gian này.", []);
  assert.equal(r.ok, true);
  assert.equal(r.suspicious_numbers.length, 0);
});

// ── FASTPATH GUARD: câu phức (so sánh / đa-kỳ / ngày tùy chỉnh) phải nhường LLM ──

test("isComplexQuery: câu so sánh + ngày tùy chỉnh → complex", () => {
  // Đúng câu user gặp lỗi: fastpath KHÔNG được nuốt câu này.
  assert.equal(isComplexQuery("so sánh tuần trước về chi phí và doanh thu với khoảng thời gian từ 15-21/6"), true);
});

test("isComplexQuery: các biến thể so sánh / đa-kỳ → complex", () => {
  assert.equal(isComplexQuery("chi phí tuần này so với tuần trước"), true);
  assert.equal(isComplexQuery("spend tháng này và tháng trước"), true);
  assert.equal(isComplexQuery("doanh thu vs chi phí 15/6"), true);
  assert.equal(isComplexQuery("chi phí từ 15/6 đến 21/6"), true);
  assert.equal(isComplexQuery("spend ngày 15"), true);
});

test("isComplexQuery: câu đơn giản 1 kỳ → KHÔNG complex (giữ fastpath)", () => {
  assert.equal(isComplexQuery("spend Phương Nam tháng này"), false);
  assert.equal(isComplexQuery("chi phí tuần trước"), false);
  assert.equal(isComplexQuery("kpi"), false);
  assert.equal(isComplexQuery("geo chờ duyệt"), false);
  assert.equal(isComplexQuery("DUY tháng này"), false);
});

test("tryFastpath: câu phức → trả null (rớt xuống LLM), không gọi tool/mạng", async () => {
  const r = await tryFastpath(
    "so sánh tuần trước về chi phí và doanh thu với khoảng thời gian từ 15-21/6",
    { env: {}, origin: "http://x", cookieHeader: "", userEmail: "t@x" },
  );
  assert.equal(r, null);
});

// ── CUSTOM RANGE: tool phải nhận start+end để LLM lấy kỳ không có preset ──

test("get_fb_spend tool schema: có start + end cho khoảng tùy chỉnh", () => {
  const tool = TOOLS.find(t => t.name === "get_fb_spend");
  assert.ok(tool, "tool get_fb_spend phải tồn tại");
  assert.ok(tool.input_schema.properties.start, "phải có param start");
  assert.ok(tool.input_schema.properties.end, "phải có param end");
});

test("resolveTimeRange custom: trả đúng khoảng ngày user truyền (vd tuần trước nữa 15-21/6)", () => {
  const r = resolveTimeRange("custom", "2026-06-15", "2026-06-21");
  assert.equal(r.start, "2026-06-15");
  assert.equal(r.end, "2026-06-21");
  assert.equal(r.custom, true);
});

test("resolveTimeRange custom: thiếu start hoặc end → null (không bịa khoảng)", () => {
  assert.equal(resolveTimeRange("custom", "2026-06-15", null), null);
  assert.equal(resolveTimeRange("custom", null, "2026-06-21"), null);
});
