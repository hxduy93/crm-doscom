// Test module Sức khỏe API & Token — chạy OFFLINE (chỉ logic thuần, không gọi mạng).
//   node --test tests/

import { test } from "node:test";
import assert from "node:assert/strict";
import {
  buildRegistry, classifyToken, summarize, buildAlertMessage, WARN_DAYS,
} from "../functions/lib/keyHealth.js";

// ── buildRegistry: cờ configured đọc đúng từ env, KHÔNG lộ giá trị ──────────────
test("buildRegistry: đủ mục & configured đúng theo env", () => {
  const reg = buildRegistry({ FB_ACCESS_TOKEN: "x", ANTHROPIC_API_KEY: "  " });
  const fb = reg.find((r) => r.id === "fb_access");
  const anth = reg.find((r) => r.id === "anthropic");
  const openai = reg.find((r) => r.id === "openai");
  assert.equal(fb.configured, true);
  assert.equal(anth.configured, false, "chuỗi toàn khoảng trắng = chưa cấu hình");
  assert.equal(openai.configured, false, "thiếu env = chưa cấu hình");
  // Không bao giờ nhét giá trị secret vào registry.
  assert.ok(!JSON.stringify(reg).includes('"x"'), "registry KHÔNG được chứa giá trị secret");
});

test("buildRegistry: WordPress cần đủ 3 biến (URL+USER+APP_PWD) mới tính configured", () => {
  const partial = buildRegistry({ WP_NOMA_URL: "https://n", WP_NOMA_USER: "u" });
  assert.equal(partial.find((r) => r.id === "wp_noma").configured, false);
  const full = buildRegistry({ WP_NOMA_URL: "https://n", WP_NOMA_USER: "u", WP_NOMA_APP_PWD: "p" });
  assert.equal(full.find((r) => r.id === "wp_noma").configured, true);
});

// ── classifyToken: phân loại hạn token ─────────────────────────────────────────
const NOW = 1_700_000_000; // mốc cố định (không dùng Date.now để test deterministic)

test("classifyToken: is_valid=false → expired ngay", () => {
  const r = classifyToken(NOW + 999999, NOW, WARN_DAYS, false);
  assert.equal(r.status, "expired");
  assert.equal(r.daysLeft, 0);
});

test("classifyToken: exp=0 (System User) → ok, vĩnh viễn", () => {
  const r = classifyToken(0, NOW);
  assert.equal(r.status, "ok");
  assert.equal(r.daysLeft, null);
});

test("classifyToken: đã quá hạn → expired", () => {
  assert.equal(classifyToken(NOW - 86400, NOW).status, "expired");
});

test("classifyToken: còn trong ngưỡng cảnh báo → expiring + số ngày tròn", () => {
  const r = classifyToken(NOW + 3 * 86400, NOW, 7); // còn 3 ngày, ngưỡng 7
  assert.equal(r.status, "expiring");
  assert.equal(r.daysLeft, 3);
});

test("classifyToken: còn xa hạn → ok", () => {
  const r = classifyToken(NOW + 40 * 86400, NOW, 7);
  assert.equal(r.status, "ok");
  assert.equal(r.daysLeft, 40);
});

// ── summarize: đếm đúng từng nhóm ──────────────────────────────────────────────
test("summarize: đếm đúng problem/warning/ok/internal/missing/unknown", () => {
  const items = [
    { status: "expired" }, { status: "dead" }, { status: "link_down" }, // 3 problem
    { status: "expiring" },                                             // 1 warning
    { status: "ok" }, { status: "ok" },                                // 2 ok
    { status: "internal" },                                            // 1 internal
    { status: "missing" },                                             // 1 missing
    { status: "unknown" },                                             // 1 unknown
  ];
  const s = summarize(items);
  assert.equal(s.total, 9);
  assert.equal(s.problem, 3);
  assert.equal(s.warning, 1);
  assert.equal(s.ok, 2);
  assert.equal(s.internal, 1);
  assert.equal(s.missing, 1);
  assert.equal(s.unknown, 1);
});

// ── buildAlertMessage: chỉ báo khi có vấn đề, ưu tiên "cứng" ────────────────────
test("buildAlertMessage: không có vấn đề → null (không cảnh báo sai)", () => {
  assert.equal(buildAlertMessage([{ status: "ok" }, { status: "internal" }, { status: "missing" }]), null);
});

test("buildAlertMessage: có key chết → message liệt kê + đầu đề khẩn", () => {
  const msg = buildAlertMessage([
    { status: "dead", label: "OpenAI" },
    { status: "expiring", label: "Token Facebook (Ads/Graph)", daysLeft: 2, expiresAt: "2026-07-05" },
    { status: "ok", label: "Claude" },
  ]);
  assert.match(msg, /ĐÃ CHẾT\/HẾT HẠN cần xử lý NGAY/);
  assert.match(msg, /OpenAI/);
  assert.match(msg, /Token Facebook.*còn 2 ngày/);
  assert.ok(!msg.includes("Claude"), "mục còn sống không được xuất hiện trong cảnh báo");
});

test("buildAlertMessage: chỉ có sắp hết hạn → đầu đề nhẹ (không kêu 'chết')", () => {
  const msg = buildAlertMessage([{ status: "expiring", label: "Token FB", daysLeft: 5, expiresAt: "2026-07-10" }]);
  assert.match(msg, /sắp hết hạn/);
  assert.ok(!/CHẾT/.test(msg));
});
