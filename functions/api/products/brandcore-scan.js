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
import { NOMA_BRAND_GUIDE, NOMA_BRAND_GUIDE_EN, NOMA_FORBIDDEN_EN, scanForbidden, applyFixes } from "../geo/_utils/noma-brandcore.js";
import { findSkuCode, skuSpecText } from "../geo/_utils/noma-sku-specs.js";
import { siteCreds, isConfigured, listProducts, getProduct, isNomaProduct } from "./_wc.js";

function json(o, s = 200) {
  return new Response(JSON.stringify(o), {
    status: s,
    headers: { "content-type": "application/json; charset=utf-8" },
  });
}

const AUDIT_SYSTEM = `Bạn là biên tập viên tuân thủ thương hiệu NOMA. Nhiệm vụ: soát 1 bài mô tả sản phẩm NOMA đã đăng và LIỆT KÊ các cụm chữ VI PHẠM Brand Core cùng cách sửa. Hệ thống sẽ TỰ thay chuỗi trong HTML gốc — nên bạn KHÔNG cần và KHÔNG được viết lại HTML.

BẠN CHỈ TRẢ VỀ CÁC CẶP SỬA (original → fixed). Quy tắc:
1. Phát hiện các cụm vi phạm: xuất xứ sai ("Made in USA/sản xuất tại Mỹ/công nghệ Mỹ/hàng Mỹ về/Noma USA"), claim tuyệt đối ("an toàn tuyệt đối/100%/vĩnh viễn/xoá hoàn toàn/bảo hành trọn đời"), từ cấm ("số 1/tốt nhất/vô địch/vượt trội/đột phá/tiên tiến/giá rẻ"), claim "tiêu chuẩn/kiểm định quốc tế/SGS/Intertek".
2. "original" PHẢI là đoạn text COPY NGUYÊN VĂN, CHÍNH XÁC TỪNG KÝ TỰ như trong mô tả (kể cả dấu, hoa thường) — vì hệ thống thay chuỗi khớp tuyệt đối. Chọn cụm NGẮN GỌN nhất chứa lỗi (vài từ), KHÔNG copy cả câu/cả đoạn, KHÔNG kèm thẻ HTML.
3. "fixed" = cụm thay thế theo brand core (vd "Made in USA" → "thương hiệu gốc Mỹ, sản xuất qua đối tác OEM quốc tế"; "an toàn tuyệt đối" → "an toàn khi dùng đúng hướng dẫn"; "vượt trội" → "hiệu quả"; "đột phá" → ""). Giữ nguyên phong cách, không thêm chữ thừa.
4. ĐỐI CHIẾU THÔNG SỐ CHUẨN (nếu user prompt có): nếu HDSD/THỜI GIAN trên bài sai so với chuẩn (vd bài "xong trong 5 phút" nhưng chuẩn "đợi 4 tiếng"; "dọc-ngang" nhưng chuẩn "1 đường thẳng cùng hướng") → thêm 1 cặp sửa với "original" là cụm chữ sai copy nguyên văn, "fixed" là cụm đúng. Chỉ sửa được khi cụm sai là 1 đoạn chữ liền có thể thay — KHÔNG chèn mục/bước mới.
5. ⚠️ CẢNH BÁO AN TOÀN: TUYỆT ĐỐI KHÔNG đụng — không thêm/sửa/xóa. Thiếu cũng để nguyên, không coi là vi phạm.
6. Nếu không có vi phạm: has_violations=false, violations=[].

TRẢ VỀ DUY NHẤT JSON hợp lệ (không markdown, không chữ ngoài JSON):
{
  "has_violations": true/false,
  "violations": [ { "type": "loại vi phạm ngắn gọn", "original": "cụm gốc COPY NGUYÊN VĂN", "fixed": "cụm thay thế", "reason": "vì sao trái brand core" } ]
}`;

// nomaauto.us = bản tiếng Anh → dùng bộ từ cấm EN; doscom.vn/noma.vn = tiếng Việt.
const forbiddenFor = (site) => (site === "nomaauto" ? NOMA_FORBIDDEN_EN : undefined);

async function listNomaProducts(c, site) {
  const products = [];
  let scanned = 0;
  // doscom.vn trộn cả SP an ninh → search="NOMA" + lọc isNomaProduct.
  // noma.vn / nomaauto.us: MỌI SP đều là NOMA → không search, không lọc (khỏi sót SP không có chữ "noma" trong tên).
  const isMixed = site === "doscom";
  const list = forbiddenFor(site);
  for (let page = 1; page <= 6; page++) {
    const { items, totalPages } = await listProducts(c, { search: isMixed ? "NOMA" : "", perPage: 50, page });
    scanned += items.length;
    for (const p of items) {
      if (isMixed && !isNomaProduct(p)) continue;
      const flags = scanForbidden(`${p.name} ${p.short_description || ""} ${p.description || ""}`, list);
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
      const isEN = site === "nomaauto";
      const brandGuide = isEN ? NOMA_BRAND_GUIDE_EN : NOMA_BRAND_GUIDE;
      const forbidden = forbiddenFor(site);
      const langNote = isEN
        ? `\n\n⚠️ NGÔN NGỮ: nội dung bài LÀ TIẾNG ANH (nomaauto.us). "original" và "fixed" trong JSON PHẢI bằng TIẾNG ANH, KHÔNG dịch sang tiếng Việt.`
        : "";
      for (const id of ids) {
        let p;
        try { p = await getProduct(c, id); }
        catch (e) { results.push({ id, error: String(e.message || e) }); continue; }
        if (site === "doscom" && !isNomaProduct(p)) { results.push({ id, name: p.name, skipped: "không phải SP NOMA" }); continue; }

        // Quét riêng phần SỬA ĐƯỢC (mô tả), KHÔNG gồm name — vì tool không sửa tên SP.
        const editableText = `${p.short_description || ""} ${p.description || ""}`;
        const editFlags = scanForbidden(editableText, forbidden);
        const nameFlags = scanForbidden(p.name, forbidden); // lỗi nằm ở TÊN → không tự sửa được
        const regexFlags = scanForbidden(`${p.name} ${editableText}`, forbidden);
        // Ép AI phải tạo cặp sửa cho MỌI cụm regex bắt được trong mô tả (tránh AI bỏ sót → quét lại vẫn báo).
        const mustFix = editFlags.length
          ? `\nCÁC CỤM VI PHẠM ĐÃ DÒ ĐƯỢC trong mô tả (BẮT BUỘC tạo 1 cặp sửa cho MỖI cụm, "original" copy đúng cụm này): ${editFlags.map(f => `"${f.quote}"`).join(", ")}.\n`
          : "";
        // Thông số chuẩn HDSD đang là tiếng Việt → chỉ nhét cho site tiếng Việt (bỏ với nomaauto EN).
        const specCode = isEN ? null : findSkuCode(p.name);
        const specBlock = specCode ? `\n${skuSpecText(specCode)}\n\n` : "";
        const userPrompt =
          `TÊN SẢN PHẨM: ${p.name}\n\n` +
          specBlock +
          `MÔ TẢ NGẮN (short_description, HTML):\n${p.short_description || "(trống)"}\n\n` +
          `MÔ TẢ DÀI (description, HTML):\n${p.description || "(trống)"}\n` +
          mustFix +
          `\nHãy trả JSON đúng schema. Sửa HẾT chỗ vi phạm brand core${specCode ? ", và sửa HDSD/thời gian nếu lệch thông số chuẩn ở trên" : ""}; giữ nguyên phần còn lại.`;

        try {
          const res = await callClaude(env, {
            model: "haiku",
            systemPrompt: `${AUDIT_SYSTEM}${langNote}\n\n${brandGuide}`,
            userPrompt,
            maxTokens: 8000,
            jsonOutput: true,
          });
          cost += res.cost_usd || 0;
          const g = res.parsed || {};
          const violations = Array.isArray(g.violations) ? g.violations : [];
          // TỰ thay chuỗi nguyên văn trên HTML gốc → giữ nguyên 100% layout (không rewrite HTML).
          const fd = applyFixes(p.description || "", violations);
          const fs = applyFixes(p.short_description || "", violations);
          const appliedSet = new Set([...fd.applied, ...fs.applied]);
          // cặp nào AI đề xuất nhưng KHÔNG khớp chuỗi gốc ở cả 2 field → không áp được, báo để biết
          const notApplied = violations
            .map(v => (v && v.type) || (v && v.original) || "")
            .filter((lbl, i) => {
              const v = violations[i];
              const label = (v && v.type) || (v && v.original) || "";
              return label && !appliedSet.has(label);
            });
          results.push({
            id, name: p.name, permalink: p.permalink, status: p.status,
            has_violations: !!g.has_violations && violations.length > 0,
            violations,
            original_description: p.description || "",
            original_short_description: p.short_description || "",
            fixed_description: fd.fixed,
            fixed_short_description: fs.fixed,
            not_applied: [...new Set(notApplied)],
            regex_flags: regexFlags,
            name_flags: nameFlags.map(f => f.type), // lỗi nằm ở TÊN SP → tool KHÔNG tự sửa được (phải sửa tên tay trên WP)
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
