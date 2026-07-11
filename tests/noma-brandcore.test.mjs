import { test } from "node:test";
import assert from "node:assert/strict";
import {
  NOMA_BRAND,
  NOMA_BRAND_GUIDE,
} from "../functions/api/geo/_utils/noma-brandcore.js";

test("NOMA_BRAND có đủ field cho generator (name/short/site/voice/products/audience/usp/tagline)", () => {
  for (const k of ["name", "short", "site", "voice", "products", "audience", "usp", "tagline"]) {
    assert.ok(NOMA_BRAND[k] && typeof NOMA_BRAND[k] === "string", `thiếu field ${k}`);
  }
  assert.equal(NOMA_BRAND.usp, "Chăm xe chuẩn Mỹ — ai cũng tự làm được tại nhà.");
  assert.equal(NOMA_BRAND.tagline, "Chăm xe chuyên nghiệp.");
  assert.equal(NOMA_BRAND.site, "https://noma.vn");
});

test("NOMA_BRAND KHÔNG chứa cụm vi phạm red line (an toàn tuyệt đối / sản xuất từ Mỹ / công nghệ Mỹ)", () => {
  const blob = JSON.stringify(NOMA_BRAND).toLowerCase();
  for (const bad of ["an toàn tuyệt đối", "sản xuất từ mỹ", "công nghệ mỹ", "made in usa", "hàng mỹ về"]) {
    assert.ok(!blob.includes(bad), `NOMA_BRAND không được chứa "${bad}"`);
  }
});

test("NOMA_BRAND_GUIDE nêu đúng định danh v3 (OEM quốc tế + NOMA Technologies LLC)", () => {
  assert.ok(NOMA_BRAND_GUIDE.includes("NOMA Technologies LLC"), "phải nêu pháp nhân Mỹ");
  assert.ok(NOMA_BRAND_GUIDE.includes("OEM QUỐC TẾ"), "phải nêu sản xuất OEM quốc tế");
  assert.ok(NOMA_BRAND_GUIDE.includes("VẬN HÀNH & PHÂN PHỐI CHÍNH HÃNG"), "phải nêu vai trò NOMA VN");
});

test("NOMA_BRAND_GUIDE có nguyên tắc vàng xuất xứ + cấm Made in USA", () => {
  assert.ok(NOMA_BRAND_GUIDE.includes("NGUYÊN TẮC VÀNG"), "phải có nguyên tắc vàng");
  assert.ok(NOMA_BRAND_GUIDE.includes("Made in USA"), "phải liệt kê Made in USA vào danh sách cấm");
});

test("NOMA_BRAND_GUIDE có cảnh báo an toàn SKU (620 ăn mòn da, 922 dễ cháy)", () => {
  assert.ok(NOMA_BRAND_GUIDE.includes("NOMA 620"), "phải có cảnh báo 620");
  assert.ok(NOMA_BRAND_GUIDE.includes("NOMA 922"), "phải có cảnh báo 922");
  assert.ok(/ăn mòn da/i.test(NOMA_BRAND_GUIDE), "620 phải ghi ăn mòn da");
  assert.ok(/dễ cháy/i.test(NOMA_BRAND_GUIDE), "922 phải ghi dễ cháy");
});

// ── applyFixes: KHÔNG được đụng vào bên trong thẻ HTML ──
// Bom hẹn giờ đã vá: luật "claim: 100%" thay "100%" bằng RỖNG, mà tool đăng bài chèn ảnh với
// style="max-width:100%" → nếu thay cả trong thẻ thì style hỏng thành "max-width:;" → ảnh vỡ.
test("applyFixes chỉ sửa CHỮ, không đụng src/style/alt trong thẻ (ảnh không bị phá)", async () => {
  const { applyFixes } = await import("../functions/api/geo/_utils/noma-brandcore.js");
  const html = '<p>Bảo vệ 100% bề mặt sơn.</p>'
    + '<figure><img src="https://noma.vn/wp-content/uploads/2026/03/noma-890.webp" alt="phủ bóng 100%"'
    + ' style="display:block;max-width:100%;height:auto"/></figure>';
  const { fixed, applied } = applyFixes(html, [{ type: "claim: 100%", original: "100%", fixed: "" }]);
  assert.ok(applied.includes("claim: 100%"), "vẫn phải sửa được cụm trong chữ");
  assert.ok(!fixed.includes("Bảo vệ 100% bề mặt"), "chữ vi phạm phải bị thay");
  assert.ok(fixed.includes('style="display:block;max-width:100%;height:auto"'), "style ảnh phải NGUYÊN VẸN");
  assert.ok(fixed.includes('src="https://noma.vn/wp-content/uploads/2026/03/noma-890.webp"'), "src ảnh phải nguyên vẹn");
  assert.ok(!fixed.includes("max-width:;"), "không được để lại style hỏng");
});

test("applyFixes giữ nguyên layout: chỉ đổi đúng cụm chữ, không mất thẻ", async () => {
  const { applyFixes } = await import("../functions/api/geo/_utils/noma-brandcore.js");
  const html = "<h2>Ưu điểm</h2><ul><li>Hiệu quả vượt trội</li><li>Bền</li></ul>";
  const { fixed } = applyFixes(html, [{ type: "từ cấm: vượt trội", original: "vượt trội", fixed: "hiệu quả" }]);
  assert.equal(fixed, "<h2>Ưu điểm</h2><ul><li>Hiệu quả hiệu quả</li><li>Bền</li></ul>");
});
