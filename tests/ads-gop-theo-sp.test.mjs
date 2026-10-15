import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

// 15/10/2026: hai listing TikTok Shop cùng là NOMA 911 từng đẻ ra HAI campaign trùng tên
// "15/10 - Noma911 - 1 creative test". Nay gộp theo mã SP → 1 campaign.

const html = readFileSync(new URL("../ads-creator.html", import.meta.url), "utf8");
const grab = (re, name) => {
  const m = html.match(re);
  assert.ok(m, `không trích được ${name} từ ads-creator.html`);
  return m[0];
};
const gopTheoSP = new Function(`
  ${grab(/function spNgan\(product\) \{[\s\S]*?\n\}/, "spNgan")}
  ${grab(/function gopTheoSP\(groups\) \{[\s\S]*?\n\}/, "gopTheoSP")}
  return gopTheoSP;
`)();

test("hai listing cùng NOMA 911 gộp thành 1 nhóm, giữ listing gốc trên từng file", () => {
  const out = gopTheoSP([
    { product: "NOMA 911 · Kem Tay O Kinh, Can Canxi", files: [{ name: "a.mp4" }] },
    { product: "NOMA 911 · Dung Dich Tay O Kinh O to", files: [{ name: "b.mp4" }] },
    { product: "NOMA 680 · Bot Tuyet", files: [{ name: "c.mp4" }] },
  ]);
  assert.equal(out.length, 2);
  const n911 = out.find(g => g.files.length === 2);
  assert.equal(n911.product, "NOMA 911");
  assert.deepEqual(n911.files.map(f => f.sp), [
    "NOMA 911 · Kem Tay O Kinh, Can Canxi",
    "NOMA 911 · Dung Dich Tay O Kinh O to",
  ]);
  assert.equal(n911.nguon.length, 2);
  const n680 = out.find(g => g.files.length === 1);
  assert.equal(n680.product, "NOMA 680 · Bot Tuyet");   // 1 listing thì giữ nguyên tên
});

test("folder không có mã SP khác nhau thì KHÔNG gộp", () => {
  const out = gopTheoSP([
    { product: "video tuan 1", files: [{ name: "a.mp4" }] },
    { product: "video tuan 2", files: [{ name: "b.mp4" }] },
  ]);
  assert.equal(out.length, 2);
});
