// Công thức viết ads Doscom (lib/ad-formula.js) — nguồn duy nhất của cách AI viết.
import { test } from "node:test";
import assert from "node:assert/strict";
import { CONG_THUC, CONG_THUC_SAN_PHAM, khungBai, congThucSanPham } from "../functions/lib/ad-formula.js";
import { getFormat } from "../functions/lib/ad-formats.js";
import { SYSTEM_PROMPT, buildUserPrompt } from "../functions/lib/ad-prompts.js";
import { PRODUCTS, getProduct } from "../functions/lib/product-catalog.js";

const prompt = (key) => buildUserPrompt({
  product: getProduct(key), format: "x", formatLabel: "x", cta: "x", notes: "",
  promotion: "", formats: [getFormat("usp_bullet")], seed: key, rotate: 0,
});

test("công thức có đủ 5 bước theo đúng thứ tự", () => {
  assert.deepEqual(CONG_THUC.buoc.map((b) => b.ma), ["mo_bai", "van_de", "giai_phap", "tinh_nang", "chot"]);
});

test("dạng usp_bullet dùng đúng khung của công thức, không giữ bản chép tay", () => {
  assert.equal(getFormat("usp_bullet").skeleton, khungBai());
  assert.match(SYSTEM_PROMPT, /CÔNG THỨC DOSCOM 5 BƯỚC/);
});

test("mã sản phẩm trong công thức phải có thật trong catalog (gõ sai là mất hướng im lặng)", () => {
  for (const k of Object.keys(CONG_THUC_SAN_PHAM)) assert.ok(PRODUCTS[k], `không có SP "${k}" trong catalog`);
  for (const [k, p] of Object.entries(PRODUCTS)) assert.equal(p.contentFocus, undefined, `${k} còn contentFocus cũ`);
});

test("prompt của SP có hướng riêng thì kèm câu mở bài mẫu + điều tránh", () => {
  assert.match(prompt("Noma 130"), /công thức từ dầu silicone tinh khiết/);
  assert.match(prompt("D1"), /TRÁNH: KHÔNG dựng tình huống ai gắn định vị/);
  assert.equal(congThucSanPham("Noma 998"), "", "998 chưa có hướng riêng");
  assert.doesNotMatch(prompt("Noma 998"), /TRỌNG TÂM NỘI DUNG/);
});

test("vòng 3: các lời chê cuối cùng đã vào công thức", () => {
  const c = CONG_THUC_SAN_PHAM;
  assert.doesNotMatch(c["Noma 130"].dongMoBai.join(), /tạo ra từ/);
  assert.match(c["DA8.1"].trongTam.join(), /~10%/);
  assert.match(c["Noma 880"].tranh.join(), /nằm xưởng, chờ bảo hiểm/);
  assert.doesNotMatch(JSON.stringify(getProduct("Noma 880").painPoints), /xưởng|bảo hiểm/);
});
