// Test tự động cho agent noma680 — cùng ba luật với tests/noma911.test.mjs.
// Chạy bằng Node có sẵn (KHÔNG cần cài thêm gì):  node --test tests/
// Chỉ ĐỌC endpoint công khai /api/noma680/stats — không sửa, không ghi gì.
//
// Đổi URL nếu muốn test bản local:  BASE_URL=http://127.0.0.1:8788 node --test tests/
//
// LƯU Ý về lần deploy đầu tiên: deploy.yml chạy test TRƯỚC khi deploy. Ở đúng lần deploy
// sinh ra endpoint này, endpoint chưa tồn tại. Nếu test đỏ thì workflow không bao giờ
// deploy được nó (vòng lặp chết). Nên khi endpoint chưa có thì bỏ qua có thông báo; từ
// lần deploy thứ hai trở đi test chạy đầy đủ.
//
// Cách nhận diện "chưa có": Cloudflare Pages KHÔNG trả 404 cho route lạ — nó trả HTML
// fallback với HTTP 200. Nên phải kiểm content-type, không kiểm status.

import { test } from "node:test";
import assert from "node:assert/strict";

const BASE_URL = process.env.BASE_URL || "https://crm-doscom.pages.dev";

// Giá cố định từng combo (lấy đúng từ COMBO_META trong functions/api/noma680/order.js)
const GIA_COMBO = {
  "le-680": 99000,
  "combo-2x680": 198000,
  "combo-680-310": 298000,
  "combo-680-911": 318000,
  "combo-680-922": 298000,
};

// Gọi API 1 lần. Trả null nếu endpoint chưa deploy để test tự bỏ qua.
async function layThongKe() {
  const res = await fetch(`${BASE_URL}/api/noma680/stats?days=365`);
  if (res.status === 404) return null;
  // Pages trả HTML fallback 200 cho route chưa tồn tại → không phải JSON nghĩa là chưa có.
  if (!(res.headers.get("content-type") || "").includes("application/json")) return null;
  assert.equal(res.ok, true, `HTTP phải 200, nhận ${res.status}`);
  return res.json();
}

const CHUA_DEPLOY = "endpoint /api/noma680/stats chưa deploy — bỏ qua (bình thường ở lần deploy đầu)";

// ── TEST 1: CONTRACT — kết quả có đúng khuôn không? ──────────────────────
test("noma680/stats trả về đúng cấu trúc (contract)", async (t) => {
  const kq = await layThongKe();
  if (!kq) return t.skip(CHUA_DEPLOY);

  assert.ok(kq.summary, "thiếu khối 'summary'");
  assert.ok(Array.isArray(kq.by_combo), "'by_combo' phải là mảng");
  assert.ok(Array.isArray(kq.by_staff), "'by_staff' phải là mảng");
  assert.ok(kq.range, "thiếu khối 'range'");

  assert.equal(typeof kq.summary.orders, "number", "summary.orders phải là số");
  assert.equal(typeof kq.summary.revenue, "number", "summary.revenue phải là số");
});

// ── TEST 2: LUẬT DỮ LIỆU — doanh thu mỗi combo = số đơn × đúng giá? ──────
// Lá chắn chống "tính sai tiền": giá 680 nằm ở 3 nơi (HTML landing, Function landing,
// COMBO_META của CRM). Lệch một nơi là test này báo đỏ.
test("doanh thu mỗi combo = số đơn × đúng giá combo", async (t) => {
  const kq = await layThongKe();
  if (!kq) return t.skip(CHUA_DEPLOY);

  for (const dong of kq.by_combo) {
    const giaDung = GIA_COMBO[dong.combo];
    if (giaDung === undefined) continue; // combo lạ thì bỏ qua

    const mongDoi = dong.orders * giaDung;
    assert.equal(
      dong.revenue,
      mongDoi,
      `Combo "${dong.combo}": ${dong.orders} đơn × ${giaDung}đ phải = ${mongDoi}đ, ` +
        `nhưng API trả ${dong.revenue}đ → TÍNH SAI TIỀN!`
    );
  }
});

// ── TEST 3: LUẬT TOÀN VẸN — tổng doanh thu = cộng các combo lại? ─────────
test("tổng doanh thu = tổng doanh thu các combo", async (t) => {
  const kq = await layThongKe();
  if (!kq) return t.skip(CHUA_DEPLOY);

  const tongTuCombo = kq.by_combo.reduce((s, d) => s + d.revenue, 0);
  assert.equal(
    kq.summary.revenue,
    tongTuCombo,
    `summary.revenue (${kq.summary.revenue}) phải = tổng các combo (${tongTuCombo})`
  );
});

// ── TEST 4: TÁCH BẠCH — 680 không được lẫn combo của 911 ─────────────────
// Nếu ai đó trộn hai dòng sản phẩm vào một bảng, test này bắt được ngay.
test("by_combo chỉ chứa combo của NOMA 680", async (t) => {
  const kq = await layThongKe();
  if (!kq) return t.skip(CHUA_DEPLOY);

  for (const dong of kq.by_combo) {
    assert.ok(
      Object.prototype.hasOwnProperty.call(GIA_COMBO, dong.combo),
      `Combo lạ "${dong.combo}" lọt vào thống kê 680 → hai dòng sản phẩm đang bị trộn bảng`
    );
  }
});
