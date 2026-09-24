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

test("bài mẫu đã duyệt: đúng mã SP, không kèm footer, không dính luật cấm", async () => {
  const { BAI_MAU_DA_DUYET } = await import("../functions/lib/ad-approved-examples.js");
  const cam = [/Đó là lý do/i, /Tình huống quen thuộc/i, /video call/i, /\bDIY\b|detailing/i, /xoáy|mạng nhện/i, /hàng triệu/i];
  for (const [k, list] of Object.entries(BAI_MAU_DA_DUYET)) {
    assert.ok(PRODUCTS[k], `bài mẫu cho SP không có trong catalog: ${k}`);
    for (const m of list) {
      assert.ok(Array.from(m.headline).length <= 40, `${k}: headline mẫu quá 40`);
      assert.ok(Array.from(m.description).length <= 30, `${k}: description mẫu quá 30`);
      assert.doesNotMatch(m.body, /━|Hotline|Công ty TNHH/, `${k}: bài mẫu không được kèm footer`);
      assert.match(m.body, /\{\{URL\}\}/, `${k}: bài mẫu phải giữ placeholder {{URL}}`);
      for (const re of cam) assert.doesNotMatch(m.body, re, `${k}: bài mẫu dính ${re}`);
    }
  }
  assert.match(prompt("Noma 911"), /BÀI MẪU ĐÃ DUYỆT CỦA SẢN PHẨM NÀY/);
  assert.match(prompt("Noma 911"), /KHÔNG chép nguyên câu từ bài mẫu/);
});

test("prompt đặt công thức lên đầu và nói rõ thứ tự ưu tiên", () => {
  const i = SYSTEM_PROMPT.indexOf("CÔNG THỨC DOSCOM 5 BƯỚC");
  assert.ok(i > 0 && i < SYSTEM_PROMPT.indexOf("LUẬT BẤT DI BẤT DỊCH"), "công thức phải đứng trước các luật chi tiết");
  assert.match(SYSTEM_PROMPT, /ưu tiên theo thứ tự/);
  assert.doesNotMatch(SYSTEM_PROMPT, /5-7 bullet/, "luật 5-7 bullet cũ mâu thuẫn với công thức 3-5 bullet");
});
