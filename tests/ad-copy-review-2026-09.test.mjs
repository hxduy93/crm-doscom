// Khoá các luật rút ra khi chủ dự án duyệt 22 bài AI viết thật (24/09/2026).
// Mỗi test ứng với một lời chê cụ thể — gỡ luật nào là lỗi đó quay lại.
import { test } from "node:test";
import assert from "node:assert/strict";
import { HEADLINE_STYLES, getFormat } from "../functions/lib/ad-formats.js";
import { SYSTEM_PROMPT, buildUserPrompt } from "../functions/lib/ad-prompts.js";
import { getProduct, PRODUCTS } from "../functions/lib/product-catalog.js";
import { cutAtWord } from "../functions/api/generate-ad-copy.js";

const prompt = (key) => buildUserPrompt({
  product: getProduct(key), format: "x", formatLabel: "x", cta: "x", notes: "",
  promotion: "", formats: [getFormat("usp_bullet")], seed: key, rotate: 0,
});

test("không còn kiểu tiêu đề bắt AI bịa số người mua", () => {
  assert.equal(HEADLINE_STYLES.some((h) => h.key === "social_proof"), false);
  assert.equal(HEADLINE_STYLES.some((h) => /\d{1,3}\.\d{3}\.\d{3}/.test(h.example)), false);
  assert.match(SYSTEM_PROMPT, /KHÔNG nêu số người đã mua/);
  assert.doesNotMatch(SYSTEM_PROMPT, /số hợp lý 1-5 triệu/);
});

test("kiểu tiêu đề nào cũng phải có giải pháp — không còn kiểu chỉ nêu vấn đề", () => {
  for (const k of ["cau_hoi", "doi_tuong", "he_qua"]) {
    assert.equal(HEADLINE_STYLES.some((h) => h.key === k), false, `${k} đã bị chê vô nghĩa`);
  }
  for (const h of HEADLINE_STYLES) {
    assert.ok(Array.from(h.example.replace(/"/g, "")).length <= 40, `ví dụ ${h.key} dài quá 40`);
  }
  assert.match(SYSTEM_PROMPT, /chỉ nêu VẤN ĐỀ \/ HẬU QUẢ mà không có giải pháp/);
});

test("khung usp_bullet: vấn đề rồi giới thiệu sản phẩm ngay, cấm câu chuyển mùi AI", () => {
  const s = getFormat("usp_bullet").skeleton;
  assert.match(s, /GIỚI THIỆU SP NGAY câu tiếp theo/);
  assert.match(s, /KHÔNG dùng câu chuyển kiểu "👉 Đó là lý do…"/);
  assert.match(SYSTEM_PROMPT, /Tình huống quen thuộc/);
  assert.match(SYSTEM_PROMPT, /thân 450-850 ký tự/);
});

test("cấm trộn tiếng Anh: video call phải thành gọi điện", () => {
  assert.match(SYSTEM_PROMPT, /video call → gọi điện/);
  assert.doesNotMatch(JSON.stringify(getProduct("DA8.1").painPoints), /video call/i);
  assert.doesNotMatch(getProduct("DA8.1").category, /video call/i);
  assert.doesNotMatch(getProduct("Noma 350").fullName, /non-chlorinated/);
});

test("trọng tâm nội dung chủ dự án chốt được đưa vào prompt", () => {
  const cases = {
    "D1": /ĐỊNH VỊ GPS gắn lén trên XE/,
    "DA8.1": /ÔNG BÀ \/ NGƯỜI GIÀ/,
    "Noma 911": /Dùng ngay dung dịch tẩy ố kính Noma 911/,
    "Noma 680": /SẠCH BONG VẾT BẨN CHỈ SAU 90 GIÂY/,
    "Noma 880": /XƯỚC XOÁY/,
  };
  for (const [k, re] of Object.entries(cases)) {
    const p = prompt(k);
    assert.match(p, /TRỌNG TÂM NỘI DUNG/, `${k} thiếu mục trọng tâm`);
    assert.match(p, re, `${k} sai trọng tâm`);
  }
  // Angle trẻ nhỏ của DA8.1 đã gỡ: để lại thì AI dựng cả bài quanh nó.
  assert.doesNotMatch(prompt("DA8.1"), /CON Ở NHÀ MỘT MÌNH/);
});

test("câu bắt buộc AI từng bỏ sót nay nằm trong mục GIỚI HẠN bắt buộc", () => {
  assert.match(prompt("Noma 350"), /GIỚI HẠN[\s\S]*NGUỘI, tránh xa nguồn lửa/);
  assert.match(prompt("Noma 230"), /GIỚI HẠN[\s\S]*tuỳ tình trạng nhựa/);
});

test("dữ liệu sản phẩm NOMA không tự chứa từ cấm hay claim chưa có bằng chứng", () => {
  for (const [k, p] of Object.entries(PRODUCTS)) {
    if (p.brand !== "NOMA") continue;
    const text = JSON.stringify({ u: p.usps, pp: p.painPoints, us: p.usage || [] });
    assert.doesNotMatch(text, /hoàn toàn/, `${k}: "hoàn toàn" là từ cấm`);
    assert.doesNotMatch(text, /(^|[^\p{L}])rẻ(?![\p{L}])/u, `${k}: "rẻ" là từ cấm`);
    assert.doesNotMatch(text, /tin dùng/, `${k}: "tin dùng" chưa có bằng chứng`);
  }
  const p911 = getProduct("Noma 911");
  assert.doesNotMatch(JSON.stringify([p911.usps, p911.painPoints]), /nước cứng/);
});

test("cutAtWord: cắt ở ranh giới từ, không chẻ chữ", () => {
  assert.equal(cutAtWord("Ngắn gọn", 40), "Ngắn gọn");
  const h = "Ông bà ở quê không dùng smartphone, làm sao liên lạc được";
  const c = cutAtWord(h, 40);
  assert.ok(Array.from(c).length <= 40);
  assert.ok(h.startsWith(c) && h[c.length] === " " || h[c.length] === ",", `cắt giữa chữ: "${c}"`);
  assert.doesNotMatch(c, /[\s,–-]$/);
  assert.equal(cutAtWord("Xịt sạch bụi phanh – bay hơi 30-60 giây", 30), "Xịt sạch bụi phanh – bay hơi");
});
