// Test thư viện DẠNG BÀI quảng cáo + cách xoay vòng.
//
// Việc cần bảo vệ: chạy N video của cùng 1 sản phẩm phải ra N bài KHÁC KHUNG
// nhau. Bản cũ ép mọi bài đi chung 1 khung 8 bước nên cả campaign nhìn như một
// bài nhân bản — đó chính là lỗi tính năng này sinh ra để sửa.
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  AD_FORMATS, FORMAT_KEYS, getFormat, hashSeed, pickFormats,
} from "../functions/lib/ad-formats.js";
import { SYSTEM_PROMPT, buildUserPrompt } from "../functions/lib/ad-prompts.js";
import { getProduct, PRODUCTS } from "../functions/lib/product-catalog.js";
import { BRANDS, footerFor } from "../functions/lib/ad-brands.js";

test("mỗi dạng có đủ khung bài riêng, không dạng nào rỗng", () => {
  assert.ok(AD_FORMATS.length >= 8, "cần đủ dạng để 1 lô video không phải lặp khung");
  for (const f of AD_FORMATS) {
    assert.ok(f.key && f.label && f.bestFor && f.headline, `dạng ${f.key} thiếu metadata`);
    assert.ok(f.skeleton.length > 200, `dạng ${f.key} có khung quá sơ sài, AI sẽ tự bịa`);
  }
  assert.equal(new Set(FORMAT_KEYS).size, FORMAT_KEYS.length, "mã dạng không được trùng");
});

test("các dạng phải KHÁC KHUNG nhau, không chỉ khác giọng văn", () => {
  // Chỉ 1 dạng được phép có block bullet ✅ tính năng làm xương sống.
  const dungBulletLamXuong = AD_FORMATS.filter((f) => /5-7 bullet ✅/.test(f.skeleton));
  assert.equal(dungBulletLamXuong.length, 1, "chỉ dạng usp_bullet mới lấy bullet làm xương sống");
  assert.equal(dungBulletLamXuong[0].key, "usp_bullet");

  // Và phải có dạng nói thẳng "đừng dùng block bullet".
  const camBullet = AD_FORMATS.filter((f) => /KHÔNG dùng block bullet/i.test(f.skeleton));
  assert.ok(camBullet.length >= 2, "cần vài dạng cấm hẳn bullet thì bố cục mới thật sự khác");
});

test("xoay vòng: 10 video liên tiếp ăn 10 dạng KHÁC nhau", () => {
  const dùng = [];
  for (let i = 0; i < AD_FORMATS.length; i++) {
    const [f] = pickFormats({ seed: "D1:Noma", rotate: i, count: 1 });
    dùng.push(f.key);
  }
  assert.equal(new Set(dùng).size, AD_FORMATS.length, "không được lặp dạng trong 1 vòng");
});

test("lấy 3 dạng 1 lượt thì 3 dạng đó khác nhau, và lượt sau khác lượt trước", () => {
  const lượt1 = pickFormats({ seed: "D1", rotate: 1, count: 3 }).map((f) => f.key);
  const lượt2 = pickFormats({ seed: "D1", rotate: 2, count: 3 }).map((f) => f.key);
  assert.equal(new Set(lượt1).size, 3, "3 variant cùng lượt phải khác dạng nhau");
  assert.equal(lượt1.some((k) => lượt2.includes(k)), false, "bấm lại phải ra bộ dạng mới");
});

test("deterministic: cùng input luôn ra cùng dạng (chạy lại lô cũ không đẻ bài lạ)", () => {
  const a = pickFormats({ seed: "DR1:ghi am", rotate: 4, count: 3 }).map((f) => f.key);
  const b = pickFormats({ seed: "DR1:ghi am", rotate: 4, count: 3 }).map((f) => f.key);
  assert.deepEqual(a, b);
  assert.equal(hashSeed("DR1:ghi am"), hashSeed("DR1:ghi am"));
  assert.notEqual(hashSeed("DR1"), hashSeed("D1"), "seed khác phải ra điểm bắt đầu khác");
});

test("2 sản phẩm khác nhau không mở màn cùng một dạng", () => {
  const d1 = pickFormats({ seed: "D1", rotate: 0, count: 1 })[0].key;
  const dr1 = pickFormats({ seed: "DR1", rotate: 0, count: 1 })[0].key;
  const noma = pickFormats({ seed: "NOMA911", rotate: 0, count: 1 })[0].key;
  assert.equal(new Set([d1, dr1, noma]).size >= 2, true);
});

test("allowed: chặn được dạng không hợp với 1 sản phẩm", () => {
  const got = pickFormats({ seed: "x", rotate: 0, count: 3, allowed: ["cau_chuyen", "hoi_dap"] });
  assert.equal(got.length, 2, "xin 3 mà chỉ cho 2 dạng thì trả 2, không lặp cho đủ số");
  assert.equal(got.every((f) => ["cau_chuyen", "hoi_dap"].includes(f.key)), true);
});

test("prompt hệ thống: giữ nguyên luật bất di bất dịch", () => {
  for (const phải_có of [
    "{{URL}}",
    "TUYỆT ĐỐI KHÔNG tự bịa",
    "thẻ nhớ mọi dung lượng",   // danh sách quà tặng cấm tự chèn
    "Nhân xưng",                // luật FB: chỉ xưng "bạn"
    "KHÔNG tự nới rộng phạm vi", // cam kết: dùng đúng chữ được cấp
  ]) {
    assert.ok(SYSTEM_PROMPT.includes(phải_có), `prompt mất luật: ${phải_có}`);
  }
  // Hotline/website nay nằm ở footer THEO THƯƠNG HIỆU, không ghi cứng trong prompt chung.
  assert.match(footerFor("DOSCOM"), /1900638597/);
  assert.match(footerFor("DOSCOM"), /doscom\.vn/);
  // Và phải nói rõ khung bài KHÔNG cố định — đây là điểm sửa cốt lõi.
  assert.match(SYSTEM_PROMPT, /KHÔNG CÓ KHUNG MẶC ĐỊNH/);
});

test("Noma 911: số liệu đúng bản chủ dự án xác nhận 2026-07-22", () => {
  const n = getProduct("Noma 911");
  assert.ok(n, "khoá sản phẩm là 'Noma 911' (có dấu cách) — ads-creator truyền đúng chuỗi này");
  assert.match(n.priceRange, /100ml/, "chai 100ml, không phải 200ml");
  assert.equal(n.guarantee, null, "hàng tiêu dùng → KHÔNG có bảo hành");
  assert.equal(n.brand, "NOMA", "để endpoint nạp Brand Core NOMA v3");
  const usp = n.usps.join(" ");
  assert.match(usp, /2-3 xe/, "1 chai dùng 2-3 xe");
  assert.match(usp, /hạt mài siêu nhỏ/, "công thức CÓ hạt mài siêu nhỏ");
  // "mưa axit" chỉ được phép xuất hiện ở câu CẤM dùng nó, không phải ở nội dung bán hàng.
  const noiDung = JSON.stringify([n.usps, n.painPoints, n.usage, n.category]);
  assert.equal(/axit/i.test(noiDung), false, "nước mưa chứa canxi, KHÔNG phải axit");
  assert.match(noiDung, /canxi/i);
  assert.match(n.fbPolicyNotes, /KHÔNG nói 'mưa axit'/, "phải cấm thẳng cụm sai cũ");
  assert.ok(n.usage && n.usage.length >= 4, "có quy trình chính thức để AI khỏi bịa thao tác");
});

test("Noma 911: nạp đủ từ cấm của Brand Core NOMA v3", () => {
  const n = getProduct("Noma 911");
  for (const w of ["100%", "tuyệt đối", "tốt nhất", "Made in USA", "chính hãng Mỹ"]) {
    assert.ok(n.avoidWords.includes(w), `thiếu từ cấm brand core: ${w}`);
  }
});

test("sản phẩm không khai guarantee → vẫn dùng bảo hành mặc định của Doscom", () => {
  const d1 = getProduct("D1");
  assert.equal(d1.guarantee, undefined);
  const p = buildUserPrompt({
    product: d1, format: "x", formatLabel: "x", cta: "x", notes: "", promotion: "",
    formats: [getFormat("usp_bullet")],
  });
  assert.ok(p.includes("Bảo hành 12 tháng"), "SP Doscom vẫn giữ dòng bảo hành");
});

test("Noma 911: prompt cấm hẳn dòng bảo hành + cấp quy trình dùng thật", () => {
  const p = buildUserPrompt({
    product: getProduct("Noma 911"), format: "x", formatLabel: "x", cta: "x",
    notes: "", promotion: "", formats: [getFormat("huong_dan")],
  });
  assert.match(p, /DÒNG CAM KẾT: KHÔNG CÓ/);
  assert.match(p, /không tự bịa "bảo hành 12 tháng"/);
  assert.equal(p.includes("🎁 Bảo hành 12 tháng"), false, "không được lọt dòng bảo hành vào prompt");
  assert.match(p, /QUY TRÌNH SỬ DỤNG CHÍNH THỨC/);
  assert.match(p, /Bóp dung dịch lên bề mặt kính/, "dùng thao tác chính thức, không để AI bịa");
});

test("mọi sản phẩm đều khai thương hiệu — không để endpoint đoán", () => {
  for (const [key, p] of Object.entries(PRODUCTS)) {
    assert.ok(p.brand, `sản phẩm ${key} chưa khai brand`);
    assert.ok(BRANDS[p.brand], `sản phẩm ${key} khai brand lạ: ${p.brand}`);
  }
  assert.equal(PRODUCTS["Noma 911"].brand, "NOMA");
  for (const k of ["D1", "DR1", "DA8.1", "DA8.1 Pro"]) {
    assert.equal(PRODUCTS[k].brand, "DOSCOM", `${k} ký tên Doscom`);
  }
});

test("footer NOMA khác footer Doscom, không lẫn pháp nhân", () => {
  const noma = footerFor("NOMA"), doscom = footerFor("DOSCOM");
  assert.match(noma, /Công ty TNHH Noma Auto/);
  assert.match(noma, /noma\.vn/);
  assert.equal(/Doscom/i.test(noma), false, "footer NOMA không được dính tên Doscom");

  assert.match(doscom, /Công ty TNHH Doscom Holdings/);
  assert.match(doscom, /doscom\.vn/);

  // Hotline + địa chỉ dùng chung (chủ dự án xác nhận), kẻ ngang giữ đúng 26 ký tự.
  for (const f of [noma, doscom]) {
    assert.match(f, /1900638597/);
    assert.match(f, /38B Triệu Việt Vương/);
    assert.match(f, /KĐT City Land/);
    assert.equal(f.split("\n")[0], "━".repeat(26), "kẻ ngang phải đúng 26 ký tự ━");
  }
});

test("prompt bài NOMA cấp footer NOMA và cấm gắn 'của Doscom'", () => {
  const p = buildUserPrompt({
    product: getProduct("Noma 911"), format: "x", formatLabel: "x", cta: "x",
    notes: "", promotion: "", formats: [getFormat("usp_bullet")],
  });
  assert.match(p, /Công ty TNHH Noma Auto/);
  assert.match(p, /KHÔNG gắn "của Doscom"/);
  assert.equal(p.includes("Doscom Holdings"), false, "không được lọt footer Doscom vào bài NOMA");
});

test("prompt bài Doscom vẫn cấp footer Doscom như cũ", () => {
  const p = buildUserPrompt({
    product: getProduct("D1"), format: "x", formatLabel: "x", cta: "x",
    notes: "", promotion: "", formats: [getFormat("usp_bullet")],
  });
  assert.match(p, /Công ty TNHH Doscom Holdings/);
  assert.match(p, /Được phép gắn "của Doscom"/);
  assert.equal(p.includes("Noma Auto"), false);
});

test("SYSTEM_PROMPT không còn ghi cứng footer của bất kỳ thương hiệu nào", () => {
  assert.equal(SYSTEM_PROMPT.includes("Doscom Holdings"), false,
    "footer ghi cứng trong prompt chung là lý do bài NOMA từng ký tên Doscom");
  assert.match(SYSTEM_PROMPT, /Footer KHÁC NHAU theo thương hiệu/);
});

test("thông số 3 SP Doscom khớp trang bán doscom.vn (đối chiếu 2026-07-22)", () => {
  const specs = (k) => PRODUCTS[k].specs.join(" | ");

  // D1 — bản cũ ghi "pin 8 tiếng", trang bán ghi 12 giờ.
  assert.match(specs("D1"), /12 giờ liên tục/);
  assert.match(specs("D1"), /30 MHz – 1\.5 GHz/);
  assert.match(specs("D1"), /66 g/);
  assert.equal(/pin 8 tiếng/i.test(JSON.stringify(PRODUCTS.D1)), false);

  // DR1 — bản cũ ghi "16-32GB"; ví dụ mẫu trong prompt còn ghi "8g" và "280 giờ".
  assert.match(specs("DR1"), /16GB — lưu file đến 192 giờ/);
  assert.match(specs("DR1"), /nặng 41 g/);
  assert.equal(/16-32GB/.test(JSON.stringify(PRODUCTS.DR1)), false, "chỉ có bản 16GB");

  // DA8.1 — bản cũ ghi dọc 60° và thẻ 128GB.
  assert.match(specs("DA8.1"), /Xoay ngang 350°, xoay dọc 90°/);
  assert.match(specs("DA8.1"), /tối đa 256GB/);
  assert.match(specs("DA8.1"), /5 – 10 mét/);
  const da = JSON.stringify(PRODUCTS["DA8.1"]);
  assert.equal(/60° dọc/.test(da), false);
  assert.equal(/128GB/.test(da), false);
  assert.equal(/đầu tiên/.test(da), false, "claim 'camera đầu tiên' không có nguồn");
});

test("ví dụ mẫu trong prompt KHÔNG được chứa thông số bịa", () => {
  // Ví dụ mẫu là mỏ neo chất lượng — sai số ở đây là dạy model bịa số.
  assert.equal(SYSTEM_PROMPT.includes("280 giờ"), false, "DR1 lưu 192 giờ, không phải 280");
  assert.equal(/Thiết kế 8g/.test(SYSTEM_PROMPT), false, "DR1 nặng 41g, không phải 8g");
  assert.match(SYSTEM_PROMPT, /192 giờ/);
  assert.match(SYSTEM_PROMPT, /41g/);
});

test("có bảng thông số → prompt KHOÁ mọi con số vào bảng đó", () => {
  const p = buildUserPrompt({
    product: getProduct("DR1"), format: "x", formatLabel: "x", cta: "x",
    notes: "", promotion: "", formats: [getFormat("thong_so")],
  });
  assert.match(p, /THÔNG SỐ ĐÃ XÁC MINH/);
  assert.match(p, /MỌI CON SỐ trong bài phải lấy từ danh sách trên/);
  assert.match(p, /không suy ra số mới/);
  assert.match(p, /nặng 41 g/);
});

test("SP chưa có bảng thông số → prompt cấm tự chế thông số", () => {
  const pro = getProduct("DA8.1 Pro");
  assert.equal(pro.unverified, true, "doscom.vn không có trang bán bản Pro");
  assert.ok(!pro.specs, "chưa đối chiếu được thì không dựng bảng thông số giả");
  const p = buildUserPrompt({
    product: pro, format: "x", formatLabel: "x", cta: "x",
    notes: "", promotion: "", formats: [getFormat("usp_bullet")],
  });
  assert.match(p, /CHƯA có bảng thông số đối chiếu/);
  assert.match(p, /không tự chế thêm thông số/);
});

test("3 SP đã đối chiếu đều ghi nguồn để lần sau rà lại được", () => {
  for (const k of ["D1", "DR1", "DA8.1", "Noma 911"]) {
    if (k === "Noma 911") continue; // nguồn là brandcore nội bộ, không phải trang bán
    assert.match(PRODUCTS[k].source, /^https:\/\/doscom\.vn\/product\//, `${k} thiếu link nguồn`);
    assert.match(PRODUCTS[k].source, /2026-07-22/, `${k} thiếu ngày đối chiếu`);
  }
});

test("cấm bịa lời chứng thực khách hàng ở mọi dạng", () => {
  assert.match(SYSTEM_PROMPT, /KHÔNG BỊA LỜI CHỨNG THỰC/);
  assert.equal(
    AD_FORMATS.some((f) => /testimonial/i.test(f.skeleton)),
    false,
    "không dạng nào được yêu cầu viết testimonial nữa"
  );
  const moc = getFormat("trai_nghiem_theo_moc");
  assert.ok(moc, "dạng review cũ đã đổi thành trải nghiệm theo mốc");
  assert.equal(getFormat("review_nguoi_dung"), null, "mã dạng cũ phải biến mất");
  assert.match(moc.skeleton, /KHÔNG DÙNG LỜI CHỨNG THỰC/);
});

test("headline: các dạng từng bị chê cụt/lạc đề nay có hướng dẫn rõ", () => {
  assert.match(getFormat("huong_dan").headline, /TÊN SẢN PHẨM/,
    "hướng dẫn dùng: headline phải nêu tên SP, không chỉ nêu thao tác");
  assert.match(getFormat("huong_dan").skeleton, /GIỚI THIỆU SẢN PHẨM \(BẮT BUỘC/,
    "phải có khối giới thiệu SP trước các bước");
  assert.match(getFormat("so_sanh_cach_lam").headline, /KHÔNG phải câu so sánh mở/);
});

test("user prompt: nhét đúng khung của từng dạng + brandcore sản phẩm", () => {
  const product = getProduct("Noma 911");
  const formats = [getFormat("cau_chuyen"), getFormat("hoi_dap")];
  const p = buildUserPrompt({
    product, format: "OUTCOME_SALES", formatLabel: "Doanh số",
    cta: "ORDER_NOW", notes: "", promotion: "", formats,
  });

  assert.ok(p.includes("Kể chuyện một tình huống"), "phải kèm tên dạng");
  assert.ok(p.includes("Hỏi - Đáp"));
  assert.ok(p.includes(formats[0].skeleton.slice(0, 60)), "phải kèm KHUNG BÀI, không chỉ tên dạng");
  assert.ok(p.includes(product.fullName), "phải kèm brandcore: tên SP");
  assert.ok(p.includes(product.tonePreferred), "phải kèm brandcore: tone");
  assert.ok(p.includes(product.usps[0]), "phải kèm brandcore: USP");
  assert.match(p, /KHÔNG CÓ\. → BỎ HẲN phần khuyến mãi/, "không có KM thì phải cấm bịa");
});

test("user prompt: từ cấm của sản phẩm luôn được nhắc", () => {
  const d1 = getProduct("D1");
  const p = buildUserPrompt({
    product: d1, format: "x", formatLabel: "x", cta: "x", notes: "", promotion: "",
    formats: [getFormat("checklist")],
  });
  for (const w of d1.avoidWords) assert.ok(p.includes(w), `thiếu từ cấm: ${w}`);
});

test("user prompt: có khuyến mãi thì dùng đúng chữ người dùng đưa, không thêm", () => {
  const p = buildUserPrompt({
    product: getProduct("D1"), format: "x", formatLabel: "x", cta: "x", notes: "",
    promotion: "Giảm 300K, hết 30/8", formats: [getFormat("usp_bullet")],
  });
  assert.ok(p.includes("Giảm 300K, hết 30/8"));
  assert.match(p, /không bịa thêm/);
});

test("user prompt: thiếu dạng bài thì báo lỗi thay vì im lặng viết bừa", () => {
  assert.throws(
    () => buildUserPrompt({ product: getProduct("D1"), formats: [] }),
    /thiếu danh sách dạng bài/
  );
});
