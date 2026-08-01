// Tên sản phẩm rút gọn — dùng làm TÊN TAB trong menu TikTok Shop và TÊN THƯ MỤC
// khi tải video về. Sai ở đây thì tab gộp nhầm 2 sản phẩm vào một, hoặc tách một
// sản phẩm thành nhiều tab — cả hai đều làm nhân sự chạy ads nhầm creative.
import test from "node:test";
import assert from "node:assert/strict";
import { tenNganSP, khoaSP } from "../functions/lib/ten-san-pham.js";

test("giữ mã Noma làm đầu tên, bỏ đuôi mô tả", () => {
  assert.equal(
    tenNganSP("Dung Dịch Tẩy Ố Kính Ô tô - NOMA 911 – Tẩy Cặn Canxi, Màng Dầu, Nâng cao tầm nhìn – Tích Hợp Cọ Chà"),
    "NOMA 911 · Dung Dịch Tẩy Ố Kính Ô tô");
});

test("mã đứng đầu tên vẫn bóc đúng, không để lại dấu gạch thừa", () => {
  assert.equal(
    tenNganSP("NOMA 692 Làm Sạch Nỉ & Da Nội Thất Ô Tô – Tẩy Ghế Nỉ, Da, Trần Xe | Sạch Sâu - 300ml"),
    "NOMA 692 · Làm Sạch Nỉ & Da Nội Thất…");
});

test("mã kiểu Doscom (DR1 / D1 / DA8.1 PRO) — không nhầm '30 Tiếng' thành mã Noma", () => {
  assert.equal(
    tenNganSP("Thiết Bị Ghi Âm DR1 Doscom, Ghi Âm Liên Tục 30 Tiếng Liên Tục Chất Lượng Cao"),
    "DR1 · Thiết Bị Ghi Âm Doscom, G…");
  assert.ok(tenNganSP("Máy dò DA8.1 PRO Doscom quét sóng").startsWith("DA8.1 PRO ·"));
});

test("nhãn [trong ngoặc] là thứ phân biệt biến thể → giữ nhãn, bỏ mô tả", () => {
  assert.equal(tenNganSP("[COMBO 2 CHAI] Dung Dịch Tẩy Ố Kính Ô tô - NOMA 911 – Tẩy Màng Dầu"),
    "NOMA 911 · COMBO 2 CHAI");
  assert.equal(tenNganSP("[Có Quà Tặng] NOMA 911 Tẩy Ố Kính Ô Tô – Xóa Màng Dầu"),
    "NOMA 911 · Có Quà Tặng");
});

test("combo không viết chữ 'Noma' trước số vẫn bắt được cả 2 mã", () => {
  assert.equal(
    tenNganSP("Combo Chăm Sóc Kính Xe Chuẩn Mỹ - Bộ 2 Chai Tẩy Ố Kính 911 & Phủ Nano 922 - Sạch Sâu"),
    "NOMA 911+922 · Combo Chăm Sóc Kính Xe Ch…");
});

test("tên rỗng / thiếu sản phẩm → nhãn rõ ràng, không ra chuỗi rỗng", () => {
  for (const x of ["", null, undefined, "   "]) assert.equal(tenNganSP(x), "(chưa rõ sản phẩm)");
});

test("mọi tên thật đều ngắn hơn 45 ký tự (tab không được tràn màn hình)", () => {
  const that = [
    "Dung Dịch Tẩy Ố Kính Ô tô - NOMA 911 – Tẩy Cặn Canxi, Màng Dầu, Nâng cao tầm nhìn  – Tích Hợp Cọ Chà Tiện Lợi",
    "Bộ Tẩy Ố, Làm Mới, Bảo Vệ Đèn Xe NOMA 620 - Loại Bỏ Mảng Ố, Mờ Đục, Khôi Phục Độ Trong Suốt - Bộ Sản Phẩm - Dễ Dùng Tại Nhà",
    "Combo Phục Hồi Sơn Xe Toàn Diện - Bộ 2 Chai Xóa Vết Trầy Noma 955 & Phủ Nano Bảo Vệ Sơn Xe Noma 890 - Xe Đẹp Như Mới",
    "Thiết Bị Dò Camera Ẩn, Định Vị, Ghi Âm D1 Doscom D, Dải tần số: 50 MHz - 12 GHz, Độ Nhạy Cao",
  ];
  for (const s of that) assert.ok(tenNganSP(s).length <= 45, `quá dài: ${tenNganSP(s)}`);
});

test("khoá gom nhóm: hai biến thể khác nhau KHÔNG bị gộp chung một tab", () => {
  const a = khoaSP("Dung Dịch Tẩy Ố Kính Ô tô - NOMA 911 – Tẩy Cặn Canxi");
  const b = khoaSP("[COMBO 2 CHAI] Dung Dịch Tẩy Ố Kính Ô tô - NOMA 911 – Tẩy Màng Dầu");
  assert.notEqual(a, b);
});

test("khoá gom nhóm: khác nhau mỗi hoa/thường thì phải CHUNG một tab", () => {
  assert.equal(
    khoaSP("Dung Dịch Tẩy Ố Kính Ô tô - NOMA 911 – abcd"),
    khoaSP("DUNG DỊCH TẨY Ố KÍNH Ô TÔ - noma 911 – abcd"));
});
