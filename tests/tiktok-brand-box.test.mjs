// Ô brand trong menu TikTok Shop: video rơi ĐÚNG hộp Noma / Doscom.
//
// Vì sao cần test: brand không có sẵn trong dữ liệu, phải suy từ tên sản phẩm + tên shop.
// Kho TikTok Shop API đóng cứng shop = "Noma Auto" cho MỌI dòng nó trả về (xem
// functions/lib/gop-video.js), nên nếu ai đó sửa brandOf() thành "tin tên shop trước"
// thì toàn bộ hàng Doscom bán trong shop đó nhảy sang hộp Noma — nhìn giao diện vẫn
// bình thường, chỉ có số là sai.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";

const html = fs.readFileSync(new URL("../index.html", import.meta.url), "utf8");

// Cắt một khai báo (function/var) từ index.html theo ngoặc cân bằng.
function layKhoi(moc, mo, dong) {
  const dau = html.indexOf(moc);
  assert.ok(dau > 0, `khong tim thay "${moc}" trong index.html`);
  let sau = 0;
  for (let i = dau; i < html.length; i++) {
    if (html[i] === mo) sau++;
    else if (html[i] === dong && --sau === 0) return html.slice(dau, i + 1);
  }
  throw new Error(`khong dong duoc ngoac cua "${moc}"`);
}

// Nạp đúng 4 mảnh mã cần cho phép gom, chạy trên dữ liệu tự đặt.
function napLogic(videos) {
  const ctx = { lastVideos: videos, Object, Map, Array, Number, String, JSON, Math };
  vm.createContext(ctx);
  vm.runInContext([
    layKhoi("var BRANDS=[", "[", "]") + ";",
    layKhoi("function spKeyOf(", "{", "}"),
    layKhoi("function brandOf(", "{", "}"),
    layKhoi("function gomTheoBrand(", "{", "}"),
  ].join("\n"), ctx);
  return ctx;
}

const v = (product, shop, gmv = 0) => ({ product_short: product, product, shop, gmv });

test("tên sản phẩm quyết định brand, KHÔNG phải tên shop", () => {
  const { brandOf } = napLogic([]);
  // Hàng Doscom nằm trong shop "Noma Auto" (kho TikTok Shop API gán cứng) → vẫn là Doscom.
  assert.equal(brandOf(v("DR1 · Thiết Bị Ghi Âm Doscom", "Noma Auto")), "doscom");
  assert.equal(brandOf(v("D1 · Thiết Bị Dò Camera Ẩn", "Noma Auto")), "doscom");
  assert.equal(brandOf(v("DA8.1 · Camera Gọi Video Hai Chiều", "Doscom Mart")), "doscom");
  assert.equal(brandOf(v("DT2 · DÀNH CHO IPHONE", "Bao Mat Doscom")), "doscom");
  assert.equal(brandOf(v("Camera Gọi Video 2 Chiều Doscom D DA", "Bao Mat Doscom")), "doscom");
  assert.equal(brandOf(v("NOMA 911 · Dung Dịch Tẩy Ố Kính Ô tô", "Noma Auto")), "noma");
  assert.equal(brandOf(v("NOMA 911+922 · Combo Chăm Sóc Kính Xe", "Noma Auto")), "noma");
});

test("thiếu tên sản phẩm thì mới xét tên shop", () => {
  const { brandOf } = napLogic([]);
  assert.equal(brandOf(v("(chưa rõ sản phẩm)", "Noma Auto")), "noma");
  assert.equal(brandOf(v("KOC", "Bao Mat Doscom")), "doscom");
  assert.equal(brandOf(v("", "Doscom Mart")), "doscom");
  // Không đoán bừa: không có manh mối nào thì vào hộp "Khác", không nhét đại vào Noma.
  assert.equal(brandOf(v("", "")), "khac");
  assert.equal(brandOf(v("Chai xịt lạ", "Shop lạ")), "khac");
});

test("gom sản phẩm vào đúng hộp brand, cộng đủ GMV, xếp GMV giảm dần", () => {
  const { gomTheoBrand } = napLogic([
    v("NOMA 911 · Dung Dịch Tẩy Ố Kính Ô tô", "Noma Auto", 10_000_000),
    v("NOMA 911 · Dung Dịch Tẩy Ố Kính Ô tô", "Noma Auto", 12_600_000),
    v("NOMA 922 · Dung Dịch Phủ Nano", "Noma Auto", 3_000_000),
    v("DR1 · Thiết Bị Ghi Âm Doscom", "Doscom Mart", 5_000_000),
    v("D1 · Thiết Bị Dò Camera Ẩn", "Bao Mat Doscom", 900_000),
  ]);
  const { noma, doscom, khac } = gomTheoBrand().theoBrand;

  assert.equal(noma.sp.length, 2);
  assert.equal(noma.n, 3);
  assert.equal(noma.gmv, 25_600_000);
  assert.equal(noma.sp[0].name, "NOMA 911 · Dung Dịch Tẩy Ố Kính Ô tô");   // GMV cao nhất đứng đầu
  assert.equal(noma.sp[0].n, 2);
  assert.equal(noma.sp[0].gmv, 22_600_000);

  assert.equal(doscom.sp.length, 2);
  assert.equal(doscom.gmv, 5_900_000);
  assert.equal(doscom.sp[0].name, "DR1 · Thiết Bị Ghi Âm Doscom");
  assert.equal(khac.sp.length, 0);
});

test("brand của 1 sản phẩm theo SỐ PHIẾU, một dòng lẻ thiếu tên không kéo cả nhóm đi", () => {
  // Cùng product_key (khoá gom là product_key nếu có) nhưng một dòng mất tên sản phẩm.
  const chung = (product, shop) => ({ product_key: "noma 911", product_short: product, product, shop, gmv: 1 });
  const { gomTheoBrand } = napLogic([
    chung("", ""),                                            // dòng lẻ → "khac"
    chung("NOMA 911 · Dung Dịch Tẩy Ố Kính", "Noma Auto"),
    chung("NOMA 911 · Dung Dịch Tẩy Ố Kính", "Noma Auto"),
  ]);
  const { theoBrand } = gomTheoBrand();
  assert.equal(theoBrand.noma.sp.length, 1);
  assert.equal(theoBrand.noma.sp[0].n, 3);
  assert.equal(theoBrand.khac.sp.length, 0);
});

test("giao diện: có ô #tt-brands và nút Tất cả, không còn dải tab ngang cũ", () => {
  assert.match(html, /id="tt-brands"/);
  assert.match(html, /class="tt-all/);
  assert.ok(!/id="tt-tabs"/.test(html), "van con id tt-tabs cu trong index.html");
  assert.ok(!/renderTabs\(\);\s*\n\s*applyFilters\(\)/.test(html), "renderVideos van goi renderTabs cu");
});
