// Test bộ bóc dữ liệu trang Shopee (phần thuần logic, không gọi mạng).
//
// Việc cần bảo vệ: trang Shopee do JS dựng nên HTML nhận về rất bẩn — link ảnh
// bị escape (\/), giá dính ký tự ₫, tên kèm đuôi "| Shopee Việt Nam". Bóc sai
// một chỗ là sản phẩm lên web sai giá hoặc thiếu ảnh, mà nhìn vẫn có vẻ chạy.
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  parseShopeeUrl, parsePrices, parseImages, parseName, parseDescription,
} from "../functions/api/products/shopee-import.js";

test("bóc shop_id + item_id từ link Shopee", () => {
  const ok = parseShopeeUrl("https://shopee.vn/NOMA-911-Dung-dich-i.1343630849.46751925957");
  assert.equal(ok.shop_id, "1343630849");
  assert.equal(ok.item_id, "46751925957");
  assert.equal(ok.url, "https://shopee.vn/NOMA-911-Dung-dich-i.1343630849.46751925957");

  // có query phía sau vẫn phải nhận, và URL trả về đã bỏ query cho gọn
  const q = parseShopeeUrl("https://shopee.vn/abc-i.123.456?sp_atk=xyz&xptdk=1");
  assert.equal(q.item_id, "456");
  assert.ok(!q.url.includes("sp_atk"));
});

test("từ chối link không phải sản phẩm Shopee", () => {
  assert.equal(parseShopeeUrl("https://shopee.vn/mall/search?keyword=noma"), null);
  assert.equal(parseShopeeUrl("https://lazada.vn/products/abc-i.1.2"), null);
  assert.equal(parseShopeeUrl("khong-phai-url"), null);
  assert.equal(parseShopeeUrl(""), null);
});

test("bóc giá: lấy giá thấp nhất làm giá bán, cao nhất làm giá gạch", () => {
  const p = parsePrices("<div>₫219.000</div><span>₫438.000</span>");
  assert.deepEqual(p, [219000, 438000]);
  assert.equal(Math.min(...p), 219000);
});

test("bỏ qua con số rác không phải giá", () => {
  // 12 = số lượt đánh giá, 999.999.999.999 = rác → không được lọt vào danh sách giá
  const p = parsePrices("<i>12</i> ₫999.999.999.999 <b>₫99.000</b>");
  assert.deepEqual(p, [99000]);
});

test("bóc link ảnh CDN, gộp trùng và bỏ đuôi thumbnail", () => {
  const html = [
    'src="https://down-vn.img.susercontent.com/file/aaaaaaaa_tn"',
    'style="background-image:url(https://down-vn.img.susercontent.com/file/aaaaaaaa)"',
    '"https:\\/\\/down-vn.img.susercontent.com\\/file\\/bbbbbbbb"',
    'src="https://down-vn.img.susercontent.com/file/cccccccc.webp"',
  ].join(" ");
  const imgs = parseImages(html);
  assert.deepEqual(imgs, [
    "https://down-vn.img.susercontent.com/file/aaaaaaaa",
    "https://down-vn.img.susercontent.com/file/bbbbbbbb",
    "https://down-vn.img.susercontent.com/file/cccccccc",
  ], "ảnh trùng hash phải gộp làm một, đuôi _tn và .webp phải bỏ");
});

test("bóc tên sản phẩm, cắt đuôi Shopee và tiền tố Mua", () => {
  const og = parseName('<meta property="og:title" content="Mua NOMA 911 tẩy ố kính | Shopee Việt Nam">');
  assert.equal(og, "NOMA 911 tẩy ố kính");

  const title = parseName("<title>Mua Dung dịch NOMA 911 giá tốt | Shopee Việt Nam</title>");
  assert.equal(title, "Dung dịch NOMA 911 giá tốt");

  const h1 = parseName("<h1><span>NOMA 680 bọt tuyết</span></h1>");
  assert.equal(h1, "NOMA 680 bọt tuyết");

  assert.equal(parseName("<div>không có gì</div>"), "");
});

test("giải mã thực thể HTML trong tên", () => {
  assert.equal(parseName("<title>NOMA 911 &amp; 922 &#8211; combo</title>"), "NOMA 911 & 922 – combo");
});

test("bóc mô tả từ khối MÔ TẢ SẢN PHẨM, trả về văn bản thuần", () => {
  const html = "<div>lung tung</div><div>MÔ TẢ SẢN PHẨM</div><p>Dung tích <b>100ml</b></p>";
  const d = parseDescription(html);
  assert.ok(d.includes("Dung tích"), "phải giữ nội dung");
  assert.ok(d.includes("100ml"));
  assert.ok(!d.includes("<b>"), "không được để lọt thẻ HTML sang bài đăng");
});

test("không có khối mô tả thì trả rỗng chứ không đoán bừa", () => {
  assert.equal(parseDescription("<div>trang lỗi</div>"), "");
});
