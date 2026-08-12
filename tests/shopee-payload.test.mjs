// Test bộ chuẩn hoá dữ liệu bookmarklet Shopee gửi về.
//
// Việc cần bảo vệ: bookmarklet bóc từ DOM nên gói dữ liệu rất bẩn — giá lẫn số
// lượt bán, ảnh trùng và dính đuôi _tn, mô tả kèm nút "Xem thêm"/"Chat ngay".
// Để lọt là sản phẩm lên doscom.vn sai giá hoặc bài viết dính rác giao diện.
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  cleanPrices, cleanImages, cleanDescription, cleanName, normalizeShopeePayload, SHOPEE_CDN,
} from "../functions/lib/shopee-payload.js";

test("giá: bỏ số rác, gộp trùng, sắp tăng dần", () => {
  // 12 = lượt đánh giá · 999.999.999.999 = rác · 219.000 lặp 2 lần
  assert.deepEqual(cleanPrices(["219.000", "12", "438.000", "219.000", "999.999.999.999"]),
    [219000, 438000]);
  assert.deepEqual(cleanPrices([]), []);
});

test("giá nhận cả số lẫn chuỗi", () => {
  assert.deepEqual(cleanPrices([219000, "₫438.000"]), [219000, 438000]);
});

test("ảnh: chỉ nhận CDN Shopee, gộp trùng, bỏ _tn và đuôi định dạng", () => {
  const got = cleanImages([
    "https://down-vn.img.susercontent.com/file/abc12345_tn",
    "https://down-vn.img.susercontent.com/file/abc12345",
    "https://down-vn.img.susercontent.com/file/def67890.webp",
    "https://evil.example.com/file/xxxxxxxx",      // khác host → loại
    "khong-phai-url",
  ]);
  assert.deepEqual(got, [SHOPEE_CDN + "abc12345", SHOPEE_CDN + "def67890"]);
});

test("ảnh: tôn trọng trần số lượng", () => {
  const many = Array.from({ length: 30 }, (_, i) => SHOPEE_CDN + "hash" + String(i).padStart(5, "0"));
  assert.equal(cleanImages(many, 20).length, 20);
});

test("mô tả: bỏ tiêu đề khối và nút giao diện", () => {
  const d = cleanDescription("MÔ TẢ SẢN PHẨM\nDung tích 100ml\nXem thêm\nChat ngay\nBảo hành 12 tháng");
  assert.ok(d.startsWith("Dung tích"), "phải cắt tiêu đề khối");
  assert.ok(d.includes("Bảo hành 12 tháng"));
  assert.ok(!d.includes("Xem thêm"));
  assert.ok(!d.includes("Chat ngay"));
});

test("tên: cắt đuôi Shopee và tiền tố Mua", () => {
  assert.equal(cleanName("Mua NOMA 911 tẩy ố kính | Shopee Việt Nam"), "NOMA 911 tẩy ố kính");
  assert.equal(cleanName("  NOMA   680   "), "NOMA 680");
});

test("gói đầy đủ → dữ liệu sạch, không cảnh báo", () => {
  const r = normalizeShopeePayload({
    name: "Mua NOMA 911 | Shopee Việt Nam",
    prices: ["219.000", "438.000"],
    images: [SHOPEE_CDN + "aaaaaaaa", SHOPEE_CDN + "aaaaaaaa_tn"],
    description: "MÔ TẢ SẢN PHẨM\nDung tích 100ml",
    breadcrumb: ["Chăm sóc xe", "Khác"],
    url: "https://shopee.vn/x-i.1.2",
  });
  assert.equal(r.name, "NOMA 911");
  assert.equal(r.price, 219000);
  assert.equal(r.old_price, 438000);
  assert.equal(r.images.length, 1, "2 link cùng hash phải gộp làm 1");
  assert.equal(r.description, "Dung tích 100ml");
  assert.deepEqual(r.warnings, []);
});

test("gói thiếu → vẫn trả dữ liệu, kèm cảnh báo đúng chỗ thiếu", () => {
  const r = normalizeShopeePayload({ name: "NOMA 350" });
  assert.equal(r.name, "NOMA 350");
  assert.equal(r.price, 0);
  assert.deepEqual(r.images, []);
  assert.equal(r.warnings.length, 3, "thiếu giá + ảnh + mô tả");
});

test("gói rác không được làm sập", () => {
  for (const bad of [null, undefined, 42, "chuỗi", []]) {
    const r = normalizeShopeePayload(bad);
    assert.equal(r.name, "");
    assert.ok(Array.isArray(r.images));
  }
});

test("giá chỉ có một mức thì không bịa ra giá gạch", () => {
  const r = normalizeShopeePayload({ name: "X", prices: ["199.000"] });
  assert.equal(r.price, 199000);
  assert.equal(r.old_price, 0);
});
