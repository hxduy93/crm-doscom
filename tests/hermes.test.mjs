// Test cho Hermes chat agent — chạy OFFLINE (không gọi mạng, không đụng D1).
// Chạy:  node --test tests/
//
// Kiểm logic thuần `sanityCheck` (LUẬT TÍNH DỮ LIỆU: KHÔNG bịa số — số VND trong
// câu trả lời PHẢI khớp tool result, nếu không thì gắn cảnh báo).

import { test } from "node:test";
import assert from "node:assert/strict";
import { sanityCheck } from "../functions/lib/hermesAgent.js";

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
