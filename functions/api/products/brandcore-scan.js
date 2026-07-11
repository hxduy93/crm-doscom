// POST /api/products/brandcore-scan
// Menu "Sửa brandcore" — NẤC 1: quét sản phẩm NOMA đã đăng, tìm chỗ vi phạm Brand Core NOMA v3.
// KHÔNG ghi gì lên web ở endpoint này (chỉ đọc + đề xuất bản sửa).
//
// Body:
//   { site: "doscom"|"noma"|"nomaauto", mode: "list" }
//     → liệt kê SP NOMA + cờ vi phạm (regex, không tốn AI).
//     Trả: { ok, site, scanned, noma_count, flagged_count, products:[{id,name,permalink,flags:[{type,quote}]}] }
//
//   { site, mode: "audit", ids: [123,...] }   // các SP người dùng chọn để rà kỹ
//     → với mỗi SP: AI đối chiếu brand core, đề xuất bản sửa CHỈ ở chỗ vi phạm.
//     Trả: { ok, cost_usd, results:[{id,name,permalink,has_violations,violations:[{type,original,fixed,reason}],
//                                    fixed_description, fixed_short_description, regex_flags}] }
//
// Chống hại: chỉ đụng SP NOMA (isNomaProduct); AI được lệnh GIỮ NGUYÊN mọi phần khác, chỉ sửa cụm vi phạm.
import { callClaude } from "../geo/_utils/claude.js";
import { NOMA_BRAND_GUIDE, scanForbidden } from "../geo/_utils/noma-brandcore.js";
import { findSkuCode, skuSpecText } from "../geo/_utils/noma-sku-specs.js";
import { siteCreds, isConfigured, listProducts, getProduct, isNomaProduct } from "./_wc.js";

function json(o, s = 200) {
  return new Response(JSON.stringify(o), {
    status: s,
    headers: { "content-type": "application/json; charset=utf-8" },
  });
}

const AUDIT_SYSTEM = `Bạn là biên tập viên tuân thủ thương hiệu NOMA. Nhiệm vụ: soát 1 bài mô tả sản phẩm NOMA đã đăng và SỬA ĐÚNG những chỗ VI PHẠM Brand Core, GIỮ NGUYÊN mọi phần còn lại.

NGUYÊN TẮC SỬA (bắt buộc):
1. Sửa các cụm vi phạm brand core (xuất xứ sai kiểu "Made in USA/sản xuất tại Mỹ/công nghệ Mỹ/hàng Mỹ về", claim tuyệt đối "an toàn tuyệt đối/100%/vĩnh viễn/xoá hoàn toàn/bảo hành trọn đời", từ cấm "số 1/tốt nhất/vô địch/vượt trội/đột phá/tiên tiến/giá rẻ", claim "tiêu chuẩn/kiểm định quốc tế/SGS/Intertek", "Noma USA"). KHÔNG viết lại cả bài, KHÔNG đổi giọng.
2. GIỮ NGUYÊN cấu trúc HTML, thẻ, thứ tự đoạn, từ khoá SEO, link. Sửa tối thiểu — thay cụm vi phạm bằng cách nói ĐÚNG brand core (vd "Made in USA" → "thương hiệu gốc Mỹ, sản xuất qua đối tác OEM quốc tế"; "an toàn tuyệt đối" → "an toàn khi dùng đúng hướng dẫn"; "vượt trội/đột phá" → bỏ hoặc "hiệu quả").
3. ĐỐI CHIẾU THÔNG SỐ CHUẨN (nếu phần user prompt có): nếu HƯỚNG DẪN SỬ DỤNG hoặc THỜI GIAN trên bài SAI/THIẾU so với thông số chuẩn (vd bài nói "xong trong 5 phút" nhưng chuẩn phải "đợi 4 tiếng"; bài chà "dọc-ngang" nhưng chuẩn "1 đường thẳng cùng hướng") → SỬA HDSD/thời gian cho khớp thông số chuẩn. Đây là NGOẠI LỆ được phép chỉnh nội dung HDSD (ghi type "HDSD sai/thiếu so với chuẩn").
4. Nếu bài KHÔNG có vi phạm và HDSD đã khớp chuẩn: has_violations=false, để nguyên fixed_description = mô tả gốc.
5. ⚠️ TRONG HTML dùng nháy ĐƠN ' cho MỌI thuộc tính (href/style/class...). TUYỆT ĐỐI không dùng nháy kép " bên trong HTML (làm hỏng JSON).

TRẢ VỀ DUY NHẤT JSON hợp lệ (không markdown, không chữ ngoài JSON):
{
  "has_violations": true/false,
  "violations": [ { "type": "loại vi phạm ngắn gọn", "original": "cụm gốc vi phạm", "fixed": "cụm đã sửa", "reason": "vì sao trái brand core" } ],
  "fixed_description": "HTML mô tả dài đã sửa (chỉ đổi chỗ vi phạm, còn lại y nguyên)",
  "fixed_short_description": "HTML mô tả ngắn đã sửa (y nguyên nếu không có vi phạm)"
}`;

async function listNomaProducts(c, site) {
  const products = [];
  let scanned = 0;
  // doscom.vn trộn cả SP an ninh → search="NOMA" + lọc isNomaProduct.
  // noma.vn / nomaauto.us: MỌI SP đều là NOMA → không search, không lọc (khỏi sót SP không có chữ "noma" trong tên).
  const isMixed = site === "doscom";
  for (let page = 1; page <= 6; page++) {
    const { items, totalPages } = await listProducts(c, { search: isMixed ? "NOMA" : "", perPage: 50, page });
    scanned += items.length;
    for (const p of items) {
      if (isMixed && !isNomaProduct(p)) continue;
      const flags = scanForbidden(`${p.name} ${p.short_description || ""} ${p.description || ""}`);
      products.push({ id: p.id, name: p.name, permalink: p.permalink, status: p.status, flags });
    }
    if (page >= totalPages || !items.length) break;
  }
  return { products, scanned };
}

export async function onRequestPost({ request, env }) {
  let body;
  try { body = await request.json(); } catch { return json({ ok: false, error: "Body không phải JSON" }, 400); }

  const site = String(body.site || "").toLowerCase();
  const mode = String(body.mode || "list");
  const c = siteCreds(site, env);
  if (!isConfigured(c)) return json({ ok: false, error: `Site '${site}' chưa cấu hình credential WooCommerce` }, 400);

  try {
    if (mode === "list") {
      const { products, scanned } = await listNomaProducts(c, site);
      const flagged = products.filter((p) => p.flags.length > 0);
      return json({
        ok: true, site,
        scanned, noma_count: products.length, flagged_count: flagged.length,
        products,
      });
    }

    if (mode === "audit") {
      if (env.USE_CLAUDE === "false") return json({ ok: false, error: "AI đang tắt (USE_CLAUDE=false)" }, 503);
      const ids = Array.isArray(body.ids) ? body.ids.slice(0, 20) : [];
      if (!ids.length) return json({ ok: false, error: "Thiếu danh sách ids để rà" }, 400);

      const results = [];
      let cost = 0;
      for (const id of ids) {
        let p;
        try { p = await getProduct(c, id); }
        catch (e) { results.push({ id, error: String(e.message || e) }); continue; }
        if (site === "doscom" && !isNomaProduct(p)) { results.push({ id, name: p.name, skipped: "không phải SP NOMA" }); continue; }

        const regexFlags = scanForbidden(`${p.name} ${p.short_description || ""} ${p.description || ""}`);
        const specCode = findSkuCode(p.name);
        const specBlock = specCode ? `\n${skuSpecText(specCode)}\n\n` : "";
        const userPrompt =
          `TÊN SẢN PHẨM: ${p.name}\n\n` +
          specBlock +
          `MÔ TẢ NGẮN (short_description, HTML):\n${p.short_description || "(trống)"}\n\n` +
          `MÔ TẢ DÀI (description, HTML):\n${p.description || "(trống)"}\n\n` +
          `Hãy trả JSON đúng schema. Sửa chỗ vi phạm brand core, và sửa HDSD/thời gian nếu lệch thông số chuẩn ở trên; giữ nguyên phần còn lại.`;

        try {
          const res = await callClaude(env, {
            model: "haiku",
            systemPrompt: `${AUDIT_SYSTEM}\n\n${NOMA_BRAND_GUIDE}`,
            userPrompt,
            maxTokens: 8000,
            jsonOutput: true,
          });
          cost += res.cost_usd || 0;
          const g = res.parsed || {};
          results.push({
            id, name: p.name, permalink: p.permalink, status: p.status,
            has_violations: !!g.has_violations,
            violations: Array.isArray(g.violations) ? g.violations : [],
            original_description: p.description || "",
            original_short_description: p.short_description || "",
            fixed_description: typeof g.fixed_description === "string" ? g.fixed_description : (p.description || ""),
            fixed_short_description: typeof g.fixed_short_description === "string" ? g.fixed_short_description : (p.short_description || ""),
            regex_flags: regexFlags,
          });
        } catch (e) {
          results.push({ id, name: p.name, permalink: p.permalink, error: String(e.message || e), regex_flags: regexFlags });
        }
      }
      return json({ ok: true, site, cost_usd: Number(cost.toFixed(6)), results });
    }

    return json({ ok: false, error: `mode không hợp lệ: ${mode}` }, 400);
  } catch (e) {
    return json({ ok: false, error: String(e.message || e) }, 502);
  }
}
