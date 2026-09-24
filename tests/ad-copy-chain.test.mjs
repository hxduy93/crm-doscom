// Chuỗi dự phòng viết content ads + bộ kiểm tra cấu trúc (24/09/2026).
// Chủ dự án yêu cầu: model nào viết cũng phải ra đúng cấu trúc đã duyệt.
import { test } from "node:test";
import assert from "node:assert/strict";
import { kiemTraBai, ganFooter, tachThanBai } from "../functions/lib/ad-copy-validate.js";
import { vietVoiDuPhong, tachVariants } from "../functions/lib/ad-copy-chain.js";
import { chuoiDuPhong } from "../functions/lib/ad-copy-providers.js";
import { BAI_MAU_DA_DUYET } from "../functions/lib/ad-approved-examples.js";
import { getProduct } from "../functions/lib/product-catalog.js";

const ctx = (k) => ({ productKey: k, product: getProduct(k) });
const mau = (k, i = 0) => {
  const m = BAI_MAU_DA_DUYET[k][i];
  return { headline: m.headline, description: m.description, primary_text: m.body, video_title: "x" };
};
const json = (...v) => JSON.stringify({ variants: v });

test("bộ kiểm tra cho qua cả 22 bài chủ dự án đã duyệt (không khắt khe sai)", () => {
  for (const [k, list] of Object.entries(BAI_MAU_DA_DUYET)) {
    list.forEach((_, i) => assert.deepEqual(kiemTraBai(mau(k, i), ctx(k)), [], `${k} bài ${i + 1} bị đánh rớt oan`));
  }
});

test("bộ kiểm tra bắt đúng các lỗi chủ dự án từng chê", () => {
  const base = mau("Noma 350");
  const sai = (patch) => kiemTraBai({ ...base, ...patch }, ctx("Noma 350")).join(" | ");
  assert.match(sai({ primary_text: base.primary_text.replace(/nguội/g, "mát") }), /nguội/);
  assert.match(sai({ primary_text: base.primary_text.replace("✅", "Đó là lý do ✅") }), /mùi AI/);
  assert.match(sai({ primary_text: base.primary_text.replace(/💼[^\n]*/, "") }), /Phù hợp cho/);
  assert.match(sai({ primary_text: base.primary_text + "\n🎁 Bảo hành 12 tháng" }), /không có bảo hành/);
  assert.match(sai({ primary_text: base.primary_text.replace(/✅[^\n]*\n/g, "") }), /dòng ✅/);
  assert.match(sai({ primary_text: "🔧 Ngắn quá.\n👉 {{URL}}" }), /quá ngắn/);
  assert.match(kiemTraBai(mau("DR1"), ctx("DR1")).concat(
    kiemTraBai({ ...mau("DR1"), primary_text: mau("DR1").primary_text.replace(/Bảo hành[^\n]*/g, "") }, ctx("DR1"))).join(), /thiếu dòng bảo hành/);
});

test("footer do server gắn, bỏ footer model tự chép", () => {
  const out = ganFooter("Thân bài\n\n━━━ footer bịa\nHotline: 0000", "━━━\nFOOTER THẬT");
  assert.equal(out, "Thân bài\n\n━━━\nFOOTER THẬT");
  assert.equal(tachThanBai(out), "Thân bài");
});

test("tách JSON chịu được ```json fence và chữ thừa", () => {
  assert.equal(tachVariants("```json\n" + json(mau("D1")) + "\n```").length, 1);
  assert.equal(tachVariants("Đây là bài: " + json(mau("D1")) + " hết").length, 1);
  assert.throws(() => tachVariants("không có json"), /JSON/);
});

const provider = (outputs, log, id) => ({
  label: id,
  call: async (_env, _s, user) => {
    log.push({ id, user });
    const o = outputs.shift();
    if (o instanceof Error) throw o;
    return { text: o, model: `${id}-model` };
  },
});

test("Claude viết đạt ngay → dùng Claude, không gọi tầng sau", async () => {
  const log = [];
  const r = await vietVoiDuPhong({
    env: {}, systemPrompt: "s", userPrompt: "u", ...ctx("Noma 911"), soBai: 2,
    chain: ["anthropic", "gemini"],
    providers: { anthropic: provider([json(mau("Noma 911", 0), mau("Noma 911", 1))], log, "anthropic"),
                 gemini: provider([], log, "gemini") },
  });
  assert.equal(r.ok, true);
  assert.equal(r.provider, "anthropic");
  assert.equal(log.length, 1);
});

test("Claude hết tiền → chuyển Gemini; Gemini viết sai thì được sửa 1 lần kèm danh sách lỗi", async () => {
  const log = [];
  const saiCauTruc = { ...mau("Noma 350"), primary_text: mau("Noma 350").primary_text.replace(/nguội/g, "mát") };
  const r = await vietVoiDuPhong({
    env: {}, systemPrompt: "s", userPrompt: "u", ...ctx("Noma 350"), soBai: 1,
    chain: ["anthropic", "gemini"],
    providers: {
      anthropic: provider([new Error("Your credit balance is too low")], log, "anthropic"),
      gemini: provider([json(saiCauTruc), json(mau("Noma 350"))], log, "gemini"),
    },
  });
  assert.equal(r.ok, true);
  assert.equal(r.provider, "gemini");
  assert.equal(log.length, 3, "Claude 1 lần + Gemini viết + Gemini sửa");
  assert.match(log[2].user, /BỊ CODE KIỂM TRA TRẢ LẠI[\s\S]*nguội/, "prompt sửa phải kèm đúng lỗi");
  assert.match(r.attempts[0].error, /credit balance/);
});

test("model sửa rồi vẫn sai → sang tầng kế; hết chuỗi mà không bài nào đạt → báo lỗi, KHÔNG trả bài sai", async () => {
  const log = [];
  const sai = json({ ...mau("Noma 230"), primary_text: "🚗 Noma 230 ngắn.\n👉 {{URL}}" });
  const r = await vietVoiDuPhong({
    env: {}, systemPrompt: "s", userPrompt: "u", ...ctx("Noma 230"), soBai: 1,
    chain: ["gemini", "workers"],
    providers: { gemini: provider([sai, sai], log, "gemini"), workers: provider([sai, sai], log, "workers") },
  });
  assert.equal(r.ok, false);
  assert.equal(r.variants, undefined);
  assert.equal(log.length, 4);
});

test("hết chuỗi nhưng có bài đạt một phần → chỉ trả các bài đạt, gắn cờ partial", async () => {
  const log = [];
  const sai = { ...mau("D1"), primary_text: "🔎 D1 ngắn.\n👉 {{URL}}" };
  const r = await vietVoiDuPhong({
    env: {}, systemPrompt: "s", userPrompt: "u", ...ctx("D1"), soBai: 2,
    chain: ["openai"],
    providers: { openai: provider([json(mau("D1"), sai), json(mau("D1"), sai)], log, "openai") },
  });
  assert.equal(r.ok, true);
  assert.equal(r.partial, true);
  assert.equal(r.variants.length, 1);
});

test("chuỗi mặc định bỏ tầng chưa cấu hình; env AD_COPY_CHAIN đổi được thứ tự", () => {
  assert.deepEqual(chuoiDuPhong({ ANTHROPIC_API_KEY: "k", AI: { run() {} } }), ["anthropic", "workers"]);
  assert.deepEqual(chuoiDuPhong({ GEMINI_API_KEY: "k", OPENAI_API_KEY: "k", AD_COPY_CHAIN: "openai,gemini" }), ["openai", "gemini"]);
  assert.deepEqual(chuoiDuPhong({}), []);
});
