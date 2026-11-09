import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { PRODUCTS } from "../functions/lib/product-catalog.js";
import { CONG_THUC_SAN_PHAM } from "../functions/lib/ad-formula.js";
import { buildUserPrompt } from "../functions/lib/ad-prompts.js";
import { getFormat } from "../functions/lib/ad-formats.js";

// 09/11/2026: thêm NOMA 955 + 620 vào trang Tạo ads. Giá phải khớp PRICING của landing,
// cảnh báo an toàn của 620 (ăn mòn) phải đi vào prompt và vào câu bắt buộc của bộ kiểm bài.

test("giá trong catalog khớp PRICING landing 955 / 620", () => {
  const p955 = PRODUCTS["Noma 955"].priceRange;
  for (const gia of ["200.000đ / chai 120ml", "400.000đ", "419.000đ", "490.000đ", "590.000đ", "NOMA 230"]) {
    assert.ok(p955.includes(gia), gia);
  }
  const p620 = PRODUCTS["Noma 620"].priceRange;
  for (const gia of ["179.000đ / bộ", "358.000đ", "398.000đ", "NOMA 110"]) {
    assert.ok(p620.includes(gia), gia);
  }
});

test("620: cảnh báo ăn mòn nằm trong catalog, prompt và câu bắt buộc", () => {
  const p = PRODUCTS["Noma 620"];
  assert.ok(p.limits.some((l) => /ĂN MÒN/.test(l) && /găng tay/.test(l)));
  assert.ok(p.limits.some((l) => /MẶT NGOÀI/.test(l)));
  for (const cam of ["không axit", "không ăn mòn", "an toàn cho người sử dụng"]) {
    assert.ok(p.avoidWords.includes(cam), `claim sai của ảnh hãng phải bị cấm: ${cam}`);
  }
  const prompt = buildUserPrompt({ product: p, format: "x", formatLabel: "x", cta: "x",
    notes: "", promotion: "", formats: [getFormat("huong_dan")] });
  assert.match(prompt, /ĂN MÒN/);
  assert.match(prompt, /găng tay/);
  const bb = CONG_THUC_SAN_PHAM["Noma 620"].batBuoc.map((b) => new RegExp(b.re, "iu"));
  assert.ok(bb.some((r) => r.test("nhớ đeo găng tay khi làm")));
  assert.ok(bb.some((r) => r.test("chỉ xử lý ố ở mặt ngoài đèn")));
});

test("955: không hứa xoá vết xước sâu, cấm claim sai của ảnh hãng", () => {
  const p = PRODUCTS["Noma 955"];
  assert.ok(p.limits.some((l) => /ăn vào lớp sơn/.test(l)));
  assert.ok(p.avoidWords.includes("không silicone"));
  const bb = CONG_THUC_SAN_PHAM["Noma 955"].batBuoc.map((b) => new RegExp(b.re, "iu"));
  assert.ok(bb.some((r) => r.test("vết đã ăn vào lớp sơn chỉ làm mờ được phần nào")));
});

test("trang tạo ads khai pixel riêng + link của 955 và 620, có tên pixel", () => {
  const html = readFileSync(new URL("../ads-creator.html", import.meta.url), "utf8");
  const P = new Function(`${html.match(/const PRODUCTS = \{[\s\S]*?\r?\n  \}/)[0]};\nreturn PRODUCTS`)();
  const X = new Function(`${html.match(/const PIXELS = \{[\s\S]*?\r?\n  \}/)[0]};\nreturn PIXELS`)();
  assert.deepEqual([P["Noma 955"].pixel, P["Noma 955"].link, P["Noma 955"].linkPn],
    ["2137725140314106", "https://noma880.io.vn/n955d", "https://noma880.io.vn/n955tpn"]);
  assert.deepEqual([P["Noma 620"].pixel, P["Noma 620"].link, P["Noma 620"].linkPn],
    ["1543671373419026", "https://noma620-lp.pages.dev/n620d", "https://noma620-lp.pages.dev/n620tpn"]);
  assert.equal(X["2137725140314106"], "NOMA 955");
  assert.equal(X["1543671373419026"], "NOMA 620");
});
