// VÍ DỤ TEST TỰ ĐỘNG cho agent noma911 — minh hoạ cách "máy tự kiểm thay người".
// Chạy bằng Node có sẵn (KHÔNG cần cài thêm gì):  node --test tests/
// Chỉ ĐỌC endpoint công khai /api/noma911/stats — không sửa, không ghi gì.
//
// Đổi URL nếu muốn test bản local:  BASE_URL=http://127.0.0.1:8788 node --test tests/

import { test } from "node:test";
import assert from "node:assert/strict";

const BASE_URL = process.env.BASE_URL || "https://crm-doscom.pages.dev";

// Giá từng combo (lấy đúng từ COMBO_META trong functions/api/noma911/order.js).
// Ngày 03/08/2026 giá tăng, nên trong cùng một khoảng thống kê có thể lẫn CẢ HAI mức:
// đơn cũ lưu giá cũ (đúng — hồi đó bán giá đó), đơn mới lưu giá mới. Vì vậy test không
// thể so bằng một mức giá duy nhất, xem TEST 2 bên dưới.
const GIA_COMBO = {
  "le-911":        { cu: 199000, moi: 219000 },
  "combo-2x911":   { cu: 398000, moi: 438000 },
  "combo-911-310": { cu: 398000, moi: 418000 },
  "combo-911-922": { cu: 398000, moi: 438000 },
  "le-922":        { cu: 199000, moi: 219000 },
};

// Gọi API 1 lần, dùng lại cho mọi test
async function layThongKe() {
  const res = await fetch(`${BASE_URL}/api/noma911/stats?days=365`);
  assert.equal(res.ok, true, `HTTP phải 200, nhận ${res.status}`);
  return res.json();
}

// ── TEST 1: CONTRACT — kết quả có đúng khuôn không? ──────────────────────
test("noma911/stats trả về đúng cấu trúc (contract)", async () => {
  const kq = await layThongKe();

  // Phải có các khối chính
  assert.ok(kq.summary, "thiếu khối 'summary'");
  assert.ok(Array.isArray(kq.by_combo), "'by_combo' phải là mảng");
  assert.ok(kq.range, "thiếu khối 'range'");

  // summary phải có 3 con số
  assert.equal(typeof kq.summary.orders, "number", "summary.orders phải là số");
  assert.equal(typeof kq.summary.revenue, "number", "summary.revenue phải là số");
});

// ── TEST 2: LUẬT DỮ LIỆU — doanh thu mỗi combo = số đơn × đúng giá? ──────
// Đây là lá chắn chống "tính sai tiền": nếu ai lỡ đổi giá combo hay tính nhầm,
// test này BÁO ĐỎ ngay.
// Doanh thu phải chia hết thành: (số đơn giá cũ × giá cũ) + (số đơn giá mới × giá mới),
// với tổng hai nhóm đúng bằng số đơn. Bất kỳ mức giá lạ nào lọt vào cũng phá điều kiện
// này ngay — chặt như so bằng một giá, mà vẫn đúng khi giá đổi giữa kỳ.
test("doanh thu mỗi combo = số đơn × đúng giá combo", async () => {
  const kq = await layThongKe();

  for (const dong of kq.by_combo) {
    const gia = GIA_COMBO[dong.combo];
    if (!gia) continue; // combo lạ thì bỏ qua

    const min = dong.orders * gia.cu;
    const max = dong.orders * gia.moi;
    const buoc = gia.moi - gia.cu;

    assert.ok(
      dong.revenue >= min && dong.revenue <= max,
      `Combo "${dong.combo}": ${dong.orders} đơn thì doanh thu phải nằm giữa ${min}đ ` +
        `(toàn giá cũ ${gia.cu}) và ${max}đ (toàn giá mới ${gia.moi}), nhưng API trả ` +
        `${dong.revenue}đ → TÍNH SAI TIỀN!`
    );
    assert.equal(
      (dong.revenue - min) % buoc,
      0,
      `Combo "${dong.combo}": doanh thu ${dong.revenue}đ không ghép được từ ${gia.cu}đ ` +
        `và ${gia.moi}đ → có đơn mang mức giá lạ, kiểm tra COMBO_META.`
    );
  }
});

// ── TEST 3: LUẬT TOÀN VẸN — tổng doanh thu = cộng các combo lại? ─────────
// "Tổng phải bằng cộng các phần" — bắt lỗi sót/đúp dữ liệu.
test("tổng doanh thu = tổng doanh thu các combo", async () => {
  const kq = await layThongKe();

  const tongTuCombo = kq.by_combo.reduce((s, d) => s + d.revenue, 0);
  assert.equal(
    kq.summary.revenue,
    tongTuCombo,
    `summary.revenue (${kq.summary.revenue}) phải = tổng các combo (${tongTuCombo})`
  );
});
