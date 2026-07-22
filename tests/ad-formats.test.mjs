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
import { getProduct } from "../functions/lib/product-catalog.js";

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
    "Bảo hành 12 tháng",
    "1900638597",
    "{{URL}}",
    "TUYỆT ĐỐI KHÔNG tự bịa",
    "thẻ nhớ mọi dung lượng",   // danh sách quà tặng cấm tự chèn
    "doscom.vn",
    "Nhân xưng",                // luật FB: chỉ xưng "bạn"
  ]) {
    assert.ok(SYSTEM_PROMPT.includes(phải_có), `prompt mất luật: ${phải_có}`);
  }
  // Và phải nói rõ khung bài KHÔNG cố định — đây là điểm sửa cốt lõi.
  assert.match(SYSTEM_PROMPT, /KHÔNG CÓ KHUNG MẶC ĐỊNH/);
});

test("user prompt: nhét đúng khung của từng dạng + brandcore sản phẩm", () => {
  const product = getProduct("NOMA911") || getProduct("D1");
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
