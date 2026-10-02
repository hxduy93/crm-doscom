// Góc bài nối tiếp giữa các lần upload + né bài đã chạy (sự cố 02/10/2026:
// cả camp lên 4 ad cùng một content; lô sau lặp đúng góc của lô trước).
import { test } from "node:test";
import assert from "node:assert/strict";
import { pickAngle } from "../functions/lib/ad-formats.js";
import { buildUserPrompt } from "../functions/lib/ad-prompts.js";
import { PRODUCTS, getProduct } from "../functions/lib/product-catalog.js";
import { BAI_MAU_DA_DUYET } from "../functions/lib/ad-approved-examples.js";
import { onRequestPost, RECENT_KEEP } from "../functions/api/generate-ad-copy.js";

test("mọi SP: duyệt ĐỦ vấn đề × lợi ích rồi mới lặp (kể cả khi 2 danh sách dài bằng nhau)", () => {
  for (const [k, p] of Object.entries(PRODUCTS)) {
    const total = p.painPoints.length * p.usps.length;
    const cap = new Set();
    for (let s = 0; s < total; s++) {
      const g = pickAngle({ product: p, seed: k, slot: s });
      cap.add(`${g.painPoint}|${g.usp}`);
    }
    assert.equal(cap.size, total, `${k}: chỉ ra ${cap.size}/${total} cặp`);
    // Hết vòng thì quay lại đúng cặp đầu.
    const a = pickAngle({ product: p, seed: k, slot: 0 }), b = pickAngle({ product: p, seed: k, slot: total });
    assert.equal(`${a.painPoint}|${a.usp}`, `${b.painPoint}|${b.usp}`);
  }
});

test("NOMA 350 (5×5) không còn kẹt 5 cặp", () => {
  const p = getProduct("Noma 350");
  const cap = new Set(Array.from({ length: 25 }, (_, s) => {
    const g = pickAngle({ product: p, seed: "Noma 350", slot: s }); return `${g.painPoint}|${g.usp}`;
  }));
  assert.equal(cap.size, 25);
});

test("slotBase thắng rotate; bài gần đây được đưa vào prompt", () => {
  const p = getProduct("Noma 911");
  const base = { product: p, format: "OUTCOME_SALES", formatLabel: "Doanh số", cta: "Mua ngay",
    notes: "", promotion: "", formats: ["usp_bullet"], seed: "Noma 911" };
  const a = buildUserPrompt({ ...base, rotate: 0, slotBase: 7 });
  assert.match(a, /bài số 8 trong lô/);
  const b = buildUserPrompt({ ...base, rotate: 0, recent: [{ headline: "Kính ố? Dùng Noma 911", opening: "Dung dịch tẩy ố kính Noma 911" }] });
  assert.match(b, /BÀI ĐÃ CHẠY GẦN ĐÂY/);
  assert.match(b, /Kính ố\? Dùng Noma 911/);
  assert.doesNotMatch(buildUserPrompt({ ...base, rotate: 0 }), /BÀI ĐÃ CHẠY GẦN ĐÂY/);
});

function fakeKV() {
  const m = new Map();
  return { m, async get(k, t) { const v = m.get(k); return v == null ? null : t === "json" ? JSON.parse(v) : v; },
           async put(k, v) { m.set(k, String(v)); } };
}

test("API: 2 lần upload liên tiếp nối tiếp bộ đếm, lần sau thấy bài lần trước", async (t) => {
  const mau = BAI_MAU_DA_DUYET["Noma 911"][0];
  const prompts = [];
  const goc = globalThis.fetch;
  t.after(() => { globalThis.fetch = goc; });
  globalThis.fetch = async (url, init) => {
    const body = JSON.parse(init.body);
    prompts.push(body.messages[0].content);
    const text = JSON.stringify({ variants: [{ id: "A", style: "usp_bullet", headline: mau.headline,
      primary_text: mau.body, video_title: "Noma 911", description: mau.description }] });
    return new Response(JSON.stringify({ content: [{ type: "text", text }], model: "claude-test" }), { status: 200 });
  };
  const INVENTORY = fakeKV();
  const env = { ANTHROPIC_API_KEY: "k", INVENTORY };
  const goi = (rotate) => onRequestPost({ env, request: new Request("https://x/api/generate-ad-copy", {
    method: "POST", body: JSON.stringify({ product: "Noma 911", format: "OUTCOME_SALES", formatLabel: "Doanh số",
      cta: "Mua ngay", count: 1, seed: "Noma 911", rotate, continueRotation: true }) }) });

  const r1 = await goi(0);
  assert.equal(r1.status, 200, JSON.stringify(await r1.clone().json()).slice(0, 400));
  assert.equal(INVENTORY.m.get("adangle:Noma 911"), "1");
  // Lần upload sau: rotate lại về 0 nhưng góc bài vẫn đi tiếp (bài số 2).
  const r2 = await goi(0);
  assert.equal(r2.status, 200);
  assert.equal(INVENTORY.m.get("adangle:Noma 911"), "2");
  const cuoi = prompts[prompts.length - 1];
  assert.match(cuoi, /bài số 2 trong lô/);
  assert.match(cuoi, /BÀI ĐÃ CHẠY GẦN ĐÂY/);
  const ganDay = JSON.parse(INVENTORY.m.get("adrecent:Noma 911"));
  assert.equal(ganDay.length, 2);
  assert.ok(ganDay.length <= RECENT_KEEP);
});

test("API: không bật continueRotation thì không đụng KV (giữ hành vi cũ)", async (t) => {
  const goc = globalThis.fetch;
  t.after(() => { globalThis.fetch = goc; });
  const mau = BAI_MAU_DA_DUYET["Noma 911"][0];
  globalThis.fetch = async () => new Response(JSON.stringify({ content: [{ type: "text", text: JSON.stringify({ variants: [{
    id: "A", headline: mau.headline, primary_text: mau.body, video_title: "x", description: mau.description }] }) }] }), { status: 200 });
  const INVENTORY = fakeKV();
  await onRequestPost({ env: { ANTHROPIC_API_KEY: "k", INVENTORY }, request: new Request("https://x/", {
    method: "POST", body: JSON.stringify({ product: "Noma 911", count: 1, rotate: 0 }) }) });
  assert.equal(INVENTORY.m.size, 0);
});
