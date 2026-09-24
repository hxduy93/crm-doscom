// CHUỖI DỰ PHÒNG viết content ads — ghép nhà cung cấp (ad-copy-providers.js) với bộ
// kiểm tra cấu trúc (ad-copy-validate.js).
//
// Với từng nhà cung cấp theo thứ tự:
//   1. Viết bài.
//   2. Code kiểm từng bài theo công thức đã duyệt.
//   3. Có bài rớt → gửi lại ĐÚNG danh sách lỗi cho chính model đó sửa 1 lần.
//   4. Vẫn rớt → chuyển model kế tiếp.
// Hết chuỗi mà chưa model nào ra đủ bài đạt → trả các bài ĐẠT tốt nhất đã có (nếu có),
// không có bài nào đạt → báo lỗi. Tuyệt đối không trả bài chưa qua kiểm tra.

import { kiemTraBai } from "./ad-copy-validate.js";
import { PROVIDERS, chuoiDuPhong } from "./ad-copy-providers.js";

/** Lấy mảng variants từ text model trả (chịu được ```json fence, chữ thừa quanh JSON). */
export function tachVariants(text) {
  const t = String(text || "").replace(/^```(?:json)?\s*|\s*```$/g, "").trim();
  let parsed;
  try { parsed = JSON.parse(t); } catch {
    const m = t.match(/\{[\s\S]*\}/);
    if (!m) throw new Error("model không trả JSON");
    try { parsed = JSON.parse(m[0]); } catch { throw new Error("model trả JSON hỏng"); }
  }
  const v = Array.isArray(parsed) ? parsed : parsed?.variants;
  if (!Array.isArray(v) || !v.length) throw new Error("JSON không có mảng variants");
  return v;
}

function danhGia(variants, soBai, ctx) {
  const ket = [];
  for (let i = 0; i < soBai; i++) {
    const v = variants[i];
    ket.push(v ? { v, loi: kiemTraBai(v, ctx) } : { v: null, loi: ["thiếu bài (model trả ít bài hơn yêu cầu)"] });
  }
  return ket;
}

function promptSua(userPrompt, text, ket) {
  const dsLoi = ket
    .map((k, i) => (k.loi.length ? `- Bài ${String.fromCharCode(65 + i)}: ${k.loi.join("; ")}` : null))
    .filter(Boolean)
    .join("\n");
  return `${userPrompt}

═══════════════════════════════════════════════════════════════════
⚠️ LẦN VIẾT TRƯỚC BỊ CODE KIỂM TRA TRẢ LẠI
═══════════════════════════════════════════════════════════════════
Bài bạn vừa viết:
${String(text).slice(0, 6000)}

Lỗi cần sửa:
${dsLoi}

Viết lại TOÀN BỘ JSON: sửa đúng các lỗi trên, giữ nguyên mọi luật khác, cùng số bài.`;
}

/**
 * @returns {Promise<{ok:boolean, provider?:string, model?:string, variants?:object[],
 *   partial?:boolean, attempts:object[], error?:string}>}
 */
export async function vietVoiDuPhong({ env, systemPrompt, userPrompt, productKey, product, soBai,
                                       providers = PROVIDERS, chain }) {
  const ctx = { productKey, product };
  const thuTu = chain || chuoiDuPhong(env);
  const attempts = [];
  let tot = null; // bộ có nhiều bài đạt nhất: { provider, model, variants }

  for (const id of thuTu) {
    const p = providers[id];
    if (!p) continue;
    let prompt = userPrompt;
    for (let lan = 1; lan <= 2; lan++) {
      let text, model;
      try {
        ({ text, model } = await p.call(env, systemPrompt, prompt));
      } catch (e) {
        // Lỗi gọi API (hết tiền, key chết, chặn vùng…) → không sửa được, sang model kế.
        attempts.push({ provider: id, lan, ok: false, error: String(e?.message || e).slice(0, 300) });
        break;
      }
      let ket;
      try {
        ket = danhGia(tachVariants(text), soBai, ctx);
      } catch (e) {
        attempts.push({ provider: id, model, lan, ok: false, error: String(e.message) });
        if (lan === 1) { prompt = `${userPrompt}\n\n⚠️ Lần trước bạn không trả JSON hợp lệ (${e.message}). Chỉ trả đúng 1 object JSON theo schema.`; continue; }
        break;
      }
      const dat = ket.filter((k) => !k.loi.length).map((k) => k.v);
      attempts.push({
        provider: id, model, lan, ok: dat.length === soBai,
        loi: ket.map((k) => k.loi).filter((l) => l.length),
      });
      if (dat.length === soBai) return { ok: true, provider: id, model, variants: dat, attempts };
      if (!tot || dat.length > tot.variants.length) tot = { provider: id, model, variants: dat };
      prompt = promptSua(userPrompt, text, ket);
    }
  }

  if (tot && tot.variants.length) {
    return { ok: true, partial: true, provider: tot.provider, model: tot.model, variants: tot.variants, attempts };
  }
  return {
    ok: false, attempts,
    error: thuTu.length ? "Không model nào viết được bài đạt cấu trúc đã duyệt" : "Chưa cấu hình model AI nào",
  };
}
