import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { PRODUCTS } from "../functions/lib/product-catalog.js";
import { CONG_THUC_SAN_PHAM } from "../functions/lib/ad-formula.js";
import { buildUserPrompt } from "../functions/lib/ad-prompts.js";
import { getFormat } from "../functions/lib/ad-formats.js";

// 22/10/2026: thêm NOMA 922 + 686 vào trang Tạo ads. Giá phải khớp PRICING của landing,
// cảnh báo an toàn phải đi vào prompt và vào câu bắt buộc của bộ kiểm bài.

test("giá trong catalog khớp PRICING landing 922 / 686", () => {
  assert.match(PRODUCTS["Noma 922"].priceRange, /219\.000đ \/ chai 100ml/);
  assert.match(PRODUCTS["Noma 922"].priceRange, /438\.000đ/);
  assert.match(PRODUCTS["Noma 686"].priceRange, /399\.000đ \/ bộ 2 chai/);
  assert.match(PRODUCTS["Noma 686"].priceRange, /618\.000đ/);
  assert.match(PRODUCTS["Noma 686"].priceRange, /598\.000đ/);
  assert.match(PRODUCTS["Noma 686"].priceRange, /798\.000đ/);
});

test("922: đợi 4 tiếng + dễ cháy nằm trong catalog, prompt và câu bắt buộc", () => {
  const p = PRODUCTS["Noma 922"];
  assert.ok(p.limits.some((l) => /DỄ CHÁY/.test(l)));
  assert.ok(p.limits.some((l) => /4 tiếng/.test(l)));
  assert.ok(p.avoidWords.includes("khô trong 20 phút"), "ảnh hãng in sai 20 phút — phải cấm");
  const prompt = buildUserPrompt({ product: p, format: "x", formatLabel: "x", cta: "x",
    notes: "", promotion: "", formats: [getFormat("huong_dan")] });
  assert.match(prompt, /4 tiếng/);
  assert.match(prompt, /DỄ CHÁY/);
  const bb = CONG_THUC_SAN_PHAM["Noma 922"].batBuoc.map((b) => new RegExp(b.re, "iu"));
  assert.ok(bb.some((r) => r.test("đợi tối thiểu 4 tiếng")) && bb.some((r) => r.test("tránh xa lửa")));
});

test("686: không hứa phục hồi da rách, đúng thứ tự 2 bước", () => {
  const p = PRODUCTS["Noma 686"];
  assert.ok(p.limits.some((l) => /rách/.test(l)));
  assert.ok(p.limits.some((l) => /TRƯỚC[\s\S]*SAU/.test(l)));
  assert.ok(p.avoidWords.includes("phục hồi da rách"));
});

test("trang tạo ads khai pixel + link của 922 và 686, có tên pixel 686", () => {
  const html = readFileSync(new URL("../ads-creator.html", import.meta.url), "utf8");
  const P = new Function(`${html.match(/const PRODUCTS = \{[\s\S]*?\r?\n  \}/)[0]};\nreturn PRODUCTS`)();
  const X = new Function(`${html.match(/const PIXELS = \{[\s\S]*?\r?\n  \}/)[0]};\nreturn PIXELS`)();
  assert.deepEqual([P["Noma 922"].pixel, P["Noma 922"].link, P["Noma 922"].linkPn],
    ["24397685376567889", "https://www.noma.io.vn/n922d", "https://www.noma.io.vn/n922tpn"]);
  assert.deepEqual([P["Noma 686"].pixel, P["Noma 686"].link, P["Noma 686"].linkPn],
    ["2134423364111772", "https://noma110.cloud/n686d", "https://noma110.cloud/n686tpn"]);
  assert.equal(X["2134423364111772"], "NOMA 686");
  assert.equal(X["24397685376567889"], "NOMA 911");
});
