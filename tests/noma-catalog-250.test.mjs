import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { PRODUCTS } from "../functions/lib/product-catalog.js";
import { CONG_THUC_SAN_PHAM } from "../functions/lib/ad-formula.js";
import { buildUserPrompt } from "../functions/lib/ad-prompts.js";
import { getFormat } from "../functions/lib/ad-formats.js";

// 25/11/2026: thêm NOMA 250 vào trang Tạo ads + AI viết content.

test("giá 250 trong catalog khớp PRICING landing", () => {
  const p = PRODUCTS["Noma 250"].priceRange;
  for (const gia of ["99.000đ / chai", "198.000đ", "297.000đ", "NOMA 230"]) assert.ok(p.includes(gia), gia);
});

test("250: giới hạn nhựa nhám + kích ứng da đi vào prompt, cấm claim sai của ảnh hãng", () => {
  const p = PRODUCTS["Noma 250"];
  assert.ok(p.limits.some((l) => /nhựa NHÁM/.test(l)));
  assert.ok(p.limits.some((l) => /H315/.test(l) && /găng tay/.test(l)));
  for (const cam of ["an toàn tuyệt đối", "chỉ 01 lần", "vĩnh viễn", "bóng loáng"]) assert.ok(p.avoidWords.includes(cam), cam);
  const prompt = buildUserPrompt({ product: p, format: "x", formatLabel: "x", cta: "x",
    notes: "", promotion: "", formats: [getFormat("huong_dan")] });
  assert.match(prompt, /nhựa NHÁM/);
  assert.match(prompt, /một chiều|cùng một hướng/i);
  const bb = CONG_THUC_SAN_PHAM["Noma 250"].batBuoc.map((b) => new RegExp(b.re, "iu"));
  assert.ok(bb.some((r) => r.test("chỉ dùng cho nhựa nhám")));
});

test("trang tạo ads khai pixel + link của 250", () => {
  const html = readFileSync(new URL("../ads-creator.html", import.meta.url), "utf8");
  const P = new Function(`${html.match(/const PRODUCTS = \{[\s\S]*?\r?\n  \}/)[0]};\nreturn PRODUCTS`)();
  const X = new Function(`${html.match(/const PIXELS = \{[\s\S]*?\r?\n  \}/)[0]};\nreturn PIXELS`)();
  assert.deepEqual([P["Noma 250"].pixel, P["Noma 250"].link, P["Noma 250"].linkPn],
    ["1122531556349711", "https://www.noma.io.vn/n250d", "https://www.noma.io.vn/n250tpn"]);
  assert.equal(X["1122531556349711"], "NOMA 250");
});
