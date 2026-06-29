// Test cho endpoint /api/me — danh tính cho UI (badge user + Đăng xuất).
// Gọi handler TRỰC TIẾP với context giả (không cần mạng / không cần Access thật).
//   node --test tests/

import { test } from "node:test";
import assert from "node:assert/strict";
import { onRequestGet } from "../functions/api/me.js";

// Tạo context giả: chỉ cần request.headers (Map có .get) + env.
function ctx({ email, internalToken } = {}, env = {}) {
  const h = new Map();
  if (email) h.set("cf-access-authenticated-user-email", email);
  if (internalToken) h.set("x-internal-token", internalToken);
  return {
    env,
    request: {
      url: "https://crm-doscom.pages.dev/api/me",
      headers: { get: (k) => h.get(String(k).toLowerCase()) ?? null },
    },
  };
}

async function call(c) {
  const res = await onRequestGet(c);
  assert.equal(res.status, 200, `HTTP phải 200, nhận ${res.status}`);
  return res.json();
}

// ── TEST 1: CONTRACT — luôn trả logoutUrl Cloudflare Access ──────────────
test("/api/me trả đúng khuôn + logoutUrl cố định", async () => {
  const d = await call(ctx());
  assert.equal(d.ok, true, "ok phải true");
  assert.equal(d.logoutUrl, "/cdn-cgi/access/logout", "logoutUrl phải trỏ Access logout");
  assert.ok(Array.isArray(d.accounts), "accounts phải là mảng");
});

// ── TEST 2: Access CHƯA bật (không có header email) → role 'open', email null
test("Access chưa bật → role 'open', email null", async () => {
  const d = await call(ctx());
  assert.equal(d.email, null, "chưa có Access thì email = null (UI ẩn badge)");
  assert.equal(d.role, "open");
  assert.equal(d.all, true);
});

// ── TEST 3: Access bật, email lạ → mặc định admin (full quyền) ───────────
test("email qua Access (không nằm trong STAFF_ACCESS) → admin", async () => {
  const d = await call(ctx({ email: "kinhdoanh.doscom@gmail.com" }));
  assert.equal(d.email, "kinhdoanh.doscom@gmail.com");
  assert.equal(d.role, "admin");
  assert.equal(d.all, true);
});

// ── TEST 4: email trong STAFF_ACCESS → bị giới hạn theo nhân sự ──────────
test("email staff bị giới hạn account (all=false)", async () => {
  const d = await call(ctx({ email: "tranphuongnam.2010tb@gmail.com" }));
  assert.equal(d.role, "staff");
  assert.equal(d.all, false, "staff không được all=true");
  assert.ok(d.accounts.length > 0, "staff vẫn thấy account của mình");
  assert.ok(
    d.accounts.every((a) => a.staff === "PHUONG_NAM"),
    "staff chỉ thấy account đúng nhân sự của mình"
  );
});
