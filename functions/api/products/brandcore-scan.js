// POST /api/products/brandcore-scan
// Menu "Sửa brandcore" — NẤC 1: quét sản phẩm NOMA đã đăng, tìm chỗ vi phạm Brand Core NOMA v3.
// KHÔNG ghi gì lên web ở endpoint này (chỉ đọc + đề xuất bản sửa).
//
// Body:
//   { site, target } — `target` chọn LOẠI nội dung muốn soát (mặc định "product"):
//     · "product" : sản phẩm WooCommerce (mô tả bán hàng)  → _wc.js
//     · "guide"   : BÀI HƯỚNG DẪN SỬ DỤNG (bài viết WordPress trong các danh mục
//                   "Hướng dẫn sử dụng / Hướng dẫn chăm sóc xe / Product Guide")
//                   trên doscom.vn và noma.vn → _wp-posts.js
//     Bốn mode dưới đây chạy được cho CẢ HAI target; khác nhau ở nguồn đọc/ghi.
//
//   { site: "doscom"|"noma"|"nomaauto", mode: "list" }
//     → liệt kê SP NOMA + cờ vi phạm (regex, không tốn AI).
//     Trả: { ok, site, scanned, noma_count, flagged_count, products:[{id,name,permalink,flags:[{type,quote}]}] }
//
//   { site, mode: "gap", ids?: [123,...] }
//     → ĐỐI CHIẾU bài đã đăng với HỒ SƠ SẢN PHẨM: chỉ ra phần nội dung CÒN THIẾU
//       trên web (thành phần, hạn dùng, đối tượng dùng…). KHÔNG tốn AI, KHÔNG ghi gì.
//       Khác "audit": audit chỉ tìm chữ SAI để thay; gap tìm chữ THIẾU để bổ sung.
//     Trả: { ok, results:[{id,name,permalink,diem,thieu[],khong_chac[],co[]}] }
//
//   { site, mode: "gap-draft", ids: [123,...] }
//     → AI SOẠN nội dung cho những mục còn thiếu (dựa NGUYÊN VĂN hồ sơ sản phẩm),
//       trả về description mới đã ghép sẵn để xem trước. KHÔNG ghi lên web —
//       ghi là việc của /api/products/brandcore-apply (đã có backup + hoàn tác).
//     Trả: { ok, cost_usd, results:[{id,name,permalink,added_html,new_description,thieu[]}] }
//
//   { site, mode: "audit", ids: [123,...] }   // các SP người dùng chọn để rà kỹ
//     → với mỗi SP: AI đối chiếu brand core, đề xuất bản sửa CHỈ ở chỗ vi phạm.
//     Trả: { ok, cost_usd, results:[{id,name,permalink,has_violations,violations:[{type,original,fixed,reason}],
//                                    fixed_description, fixed_short_description, regex_flags}] }
//
// Chống hại: chỉ đụng SP NOMA (isNomaProduct); AI được lệnh GIỮ NGUYÊN mọi phần khác, chỉ sửa cụm vi phạm.
import { callClaude } from "../geo/_utils/claude.js";
import {
  NOMA_BRAND_GUIDE, NOMA_BRAND_GUIDE_EN, NOMA_FORBIDDEN, NOMA_FORBIDDEN_EN,
  CLAIM_QUANG_CAO_CHUNG, QUY_TAC_QUANG_CAO_CHUNG,
  scanForbidden, applyFixes, deterministicFixes,
} from "../geo/_utils/noma-brandcore.js";
import { findSkuCode, skuSpecText, loadSkuSpecs } from "../geo/_utils/noma-sku-specs.js";
import { doiChieuSanPham, doiChieuBaiHdsd } from "./_gap.js";
import { siteCreds, isConfigured, listProducts, getProduct, isNomaProduct } from "./_wc.js";
import { listGuideCategories, listGuidePosts, getPost, laBaiNoma } from "./_wp-posts.js";

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

const DRAFT_SYSTEM = `Bạn là biên tập viên nội dung sản phẩm NOMA. Nhiệm vụ: viết BỔ SUNG những mục còn THIẾU trên trang bán hàng, dựa trên HỒ SƠ SẢN PHẨM được cung cấp.

QUY TẮC BẤT DI BẤT DỊCH:
1. CHỈ dùng thông tin có trong hồ sơ. TUYỆT ĐỐI KHÔNG thêm số liệu, công dụng, chứng nhận hay cam kết không có trong hồ sơ. Thiếu dữ liệu thì viết ngắn lại, KHÔNG bịa cho đủ ý.
2. Giữ nguyên mọi CON SỐ trong hồ sơ (dung tích, thời gian, hạn dùng, tỷ lệ thành phần) — không làm tròn, không đổi đơn vị, không diễn giải lại.
3. Tuân thủ Brand Core: không dùng claim tuyệt đối ("100%", "vĩnh viễn", "tuyệt đối an toàn", "xóa hoàn toàn"), không "số 1/tốt nhất/vượt trội/đột phá", không nói "Made in USA / sản xuất tại Mỹ". Nếu hồ sơ có mục CLAIM CẤM DÙNG thì tránh đúng những cụm đó.
4. Viết tiếng Việt có dấu, giọng chuyên nghiệp, gọn. Mỗi mục 1 đoạn ngắn hoặc danh sách gạch đầu dòng.
5. Trả HTML ĐƠN GIẢN: chỉ dùng <h3>, <p>, <ul>, <li>, <strong>. KHÔNG dùng class, style, script, thẻ bảng.
6. Mục CẢNH BÁO AN TOÀN / SƠ CỨU / PPE: chép SÁT hồ sơ, không rút gọn, không diễn giải mềm đi.

TRẢ VỀ DUY NHẤT JSON hợp lệ (không markdown, không chữ ngoài JSON):
{
  "sections": [ { "truong": "mã trường được giao", "tieu_de": "Tiêu đề mục", "html": "<p>…</p>" } ]
}`;


/* ── Khối nội dung bổ sung ────────────────────────────────────────────────────
   Đánh dấu bằng cặp chú thích HTML để lần soạn sau THAY khối cũ thay vì nối thêm —
   không có mốc này thì chạy hai lần là bài có hai đoạn "Thành phần" giống nhau. */
const MARK_OPEN = "<!-- noma:bo-sung:start -->";
const MARK_CLOSE = "<!-- noma:bo-sung:end -->";

function escapeHtml(t) {
  return String(t).replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c]));
}

/* Chỉ giữ vài thẻ trình bày. AI được dặn dùng HTML đơn giản, nhưng nội dung nó trả về
   sẽ ĐI THẲNG vào trang bán hàng nên không tin lời dặn — lọc ở tay mình. */
function sanitizeHtml(html) {
  return String(html)
    .replace(/<(script|style|iframe|object|embed)[\s\S]*?<\/\1>/gi, "")
    .replace(/ on[a-z]+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, "")
    .replace(/<(?!\/?(h3|h4|p|ul|ol|li|strong|em|br)\b)[^>]*>/gi, "");
}

// Ghép khối bổ sung vào cuối mô tả; đã có khối cũ thì thay đúng chỗ đó.
function ghepBoSung(desc, block) {
  const d = String(desc || "");
  const i = d.indexOf(MARK_OPEN);
  const j = d.indexOf(MARK_CLOSE);
  if (i >= 0 && j > i) return d.slice(0, i) + block + d.slice(j + MARK_CLOSE.length);
  return d.trimEnd() + "\n" + block;
}

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

  // Hồ sơ sản phẩm người dùng tải lên (KV `noma_sku_specs:v2`); chưa tải thì rơi về
  // bảng dự phòng trong noma-sku-specs.js. Đọc MỘT LẦN cho cả lượt quét.
  const { specs: skuSpecs } = await loadSkuSpecs(env);

  const site = String(body.site || "").toLowerCase();
  const mode = String(body.mode || "list");
  const target = String(body.target || "product").toLowerCase();
  const c = siteCreds(site, env);
  if (!isConfigured(c)) return json({ ok: false, error: `Site '${site}' chưa cấu hình credential WooCommerce` }, 400);

  // Bài hướng dẫn đi đường riêng (WordPress posts) — xem khối cuối file.
  if (target === "guide") {
    try { return await soatBaiHuongDan({ env, c, site, mode, body, skuSpecs }); }
    catch (e) { return json({ ok: false, error: String(e.message || e) }, 502); }
  }
  if (target !== "product") return json({ ok: false, error: `target không hợp lệ: ${target}` }, 400);

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

    /* ── ĐỐI CHIẾU HỒ SƠ: tìm nội dung CÒN THIẾU trên web ──────────────────────
       Chạy bằng luật, KHÔNG gọi AI: chạy được cho cả trăm SP mà không tốn tiền, và
       cùng đầu vào luôn cho cùng kết luận (AI thì mỗi lần một khác, không đối chiếu
       lịch sử được). Kết quả chia ba mức có/không chắc/thiếu kèm bằng chứng. */
    if (mode === "gap") {
      const ids = Array.isArray(body.ids) ? body.ids.map(Number).filter(Boolean) : null;
      const all = await listNomaProducts(c, site);
      const chon = ids ? all.products.filter((p) => ids.includes(p.id)) : all.products;

      const results = [];
      let chuaCoHoSo = 0;
      for (const item of chon) {
        const p = await getProduct(c, item.id);
        const code = findSkuCode(p.name, skuSpecs);
        const spec = code ? skuSpecs[code] : null;
        const kq = doiChieuSanPham(p, spec);
        if (!kq.co_ho_so) chuaCoHoSo++;
        results.push({
          id: p.id, name: p.name, permalink: p.permalink, sku: code,
          co_ho_so: kq.co_ho_so, diem: kq.diem,
          thieu: kq.thieu, khong_chac: kq.khong_chac,
          so_co: kq.co.length,
        });
      }
      // Thiếu phần TRỌNG YẾU xếp lên trước — đó là thứ phải sửa ngay.
      results.sort((a, b) => {
        const w = (r) => (r.thieu || []).filter((x) => x.trong_yeu).length;
        return w(b) - w(a) || (a.diem ?? 101) - (b.diem ?? 101);
      });

      return json({
        ok: true, site, mode: "gap",
        scanned: chon.length,
        chua_co_ho_so: chuaCoHoSo,   // SP không dò được mã SKU hoặc hồ sơ còn ở dạng cũ
        results,
      });
    }

    /* ── SOẠN nội dung bổ sung cho các mục còn thiếu ────────────────────────────
       Chỉ SOẠN và trả về để xem trước. Việc ghi lên web giao cho brandcore-apply —
       chỗ đó đã có sao lưu + hoàn tác, không dựng thêm đường ghi thứ hai. */
    if (mode === "gap-draft") {
      const ids = (Array.isArray(body.ids) ? body.ids.map(Number).filter(Boolean) : []).slice(0, 10);
      if (!ids.length) return json({ ok: false, error: "chưa chọn sản phẩm nào" }, 400);
      // Brand core phải khai TẠI ĐÂY: bản trong nhánh "audit" nằm phía dưới nên nhánh
      // này không thấy (lỗi "brandGuide is not defined" — chủ dự án gặp 22/08/2026).
      const brandGuide = site === "nomaauto" ? NOMA_BRAND_GUIDE_EN : NOMA_BRAND_GUIDE;

      let cost = 0;
      const results = [];
      for (const id of ids) {
        const p = await getProduct(c, id);
        const code = findSkuCode(p.name, skuSpecs);
        const spec = code ? skuSpecs[code] : null;
        const kq = doiChieuSanPham(p, spec);

        if (!kq.co_ho_so || !kq.thieu.length) {
          results.push({ id, name: p.name, permalink: p.permalink, bo_qua: kq.co_ho_so ? "khong_thieu_gi" : "chua_co_ho_so" });
          continue;
        }

        const lieuKe = kq.thieu
          .map((x) => `### ${x.nhan} (mã trường: ${x.truong})\n${x.trich_ho_so}`)
          .join("\n\n");
        const userPrompt =
          `SẢN PHẨM: ${p.name}\n\n` +
          `CÁC MỤC CÒN THIẾU TRÊN WEB — viết bổ sung đúng ${kq.thieu.length} mục này, giữ nguyên số liệu:\n\n${lieuKe}\n\n` +
          `Trả JSON đúng schema, mỗi mục một phần tử trong "sections".`;

        try {
          const res = await callClaude(env, {
            model: "haiku",
            systemPrompt: `${DRAFT_SYSTEM}\n\n${brandGuide}`,
            userPrompt,
            maxTokens: 4000,
            jsonOutput: true,
          });
          cost += res.cost_usd || 0;
          const sections = Array.isArray(res.parsed?.sections) ? res.parsed.sections : [];
          if (!sections.length) {
            results.push({ id, name: p.name, permalink: p.permalink, error: "AI không trả được nội dung" });
            continue;
          }

          const added = sections
            .map((sec) => `<h3>${escapeHtml(sec.tieu_de || "")}</h3>\n${sanitizeHtml(sec.html || "")}`)
            .join("\n");
          const block = `${MARK_OPEN}\n${added}\n${MARK_CLOSE}`;

          results.push({
            id, name: p.name, permalink: p.permalink,
            sku: code,
            thieu: kq.thieu.map((x) => x.nhan),
            added_html: block,
            new_description: ghepBoSung(p.description || "", block),
            description_cu: p.description || "",
          });
        } catch (e) {
          results.push({ id, name: p.name, permalink: p.permalink, error: String(e.message || e).slice(0, 200) });
        }
      }

      return json({ ok: true, site, mode: "gap-draft", cost_usd: Number(cost.toFixed(6)), results });
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
        const specCode = isEN ? null : findSkuCode(p.name, skuSpecs);
        const specBlock = specCode ? `\n${skuSpecText(specCode, skuSpecs)}\n\n` : "";
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
          const aiViolations = Array.isArray(g.violations) ? g.violations : [];
          // DETERMINISTIC: tạo cặp sửa cho MỌI cụm regex bắt được (đảm bảo sửa, không phụ thuộc AI
          // — vì AI hay bỏ qua cụm "ranh giới" như "tiêu chuẩn quốc tế" khiến apply báo "bỏ qua").
          const detPairs = deterministicFixes(editableText, forbidden || undefined);
          const seenOrig = new Set(detPairs.map((v) => v.original));
          // gộp: det trước (chắc chắn), thêm cặp AI không trùng original (AI bắt được cái regex bỏ sót/HDSD)
          const violations = [
            ...detPairs,
            ...aiViolations.filter((v) => v && typeof v.original === "string" && v.original && !seenOrig.has(v.original)),
          ];
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
            // dựa trên cặp sửa THẬT (gồm det) — KHÔNG phụ thuộc cờ has_violations của AI,
            // vì AI hay báo "không vi phạm" với cụm ranh giới mà regex đã bắt được.
            has_violations: violations.length > 0,
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

/* ══════════════════════════════════════════════════════════════════════════════
   PHẦN HƯỚNG DẪN SỬ DỤNG — soát BÀI VIẾT WordPress (doscom.vn & noma.vn)

   Vì sao phải có: trước đây tool chỉ soát MÔ TẢ SẢN PHẨM. Nhưng phần lớn chữ về cách
   dùng sản phẩm lại nằm ở BÀI HƯỚNG DẪN trên blog (noma.vn có hơn 20 bài "HƯỚNG DẪN SỬ
   DỤNG NOMA …", doscom.vn hơn 90 bài) — do agent GEO viết. Sản phẩm sạch brand core mà
   bài hướng dẫn vẫn "Made in USA / an toàn 100%" thì coi như chưa sửa được gì.

   Ba điểm KHÁC sản phẩm, cố ý:
   1. doscom.vn trộn bài Doscom (camera, máy dò) với bài NOMA trong cùng danh mục hướng
      dẫn. Bài KHÔNG nói về NOMA chỉ soát bằng luật quảng cáo chung — không đem định danh
      thương hiệu NOMA áp vào (xem CLAIM_QUANG_CAO_CHUNG).
   2. Đối chiếu hồ sơ dùng bộ trường riêng cho bài hướng dẫn (GAP_FIELDS_HDSD): bài hướng
      dẫn không có nghĩa vụ nhắc dung tích/bảo hành, nhưng thiếu bước dùng/lưu ý/PPE/sơ cứu
      thì nguy hiểm thật.
   3. Nội dung phải đọc bằng `content.raw` (context=edit). Đọc nhầm bản rendered rồi ghi
      lại là xoá sạch khối Gutenberg của bài — nên bài nào không lấy được raw thì báo rõ
      `raw:false` và brandcore-apply sẽ TỪ CHỐI ghi.
   ══════════════════════════════════════════════════════════════════════════════ */

const GUIDE_NOTE = `\n\n⚠️ LOẠI NỘI DUNG: đây là BÀI HƯỚNG DẪN SỬ DỤNG trên blog, KHÔNG phải mô tả sản phẩm. Bài gồm các BƯỚC LÀM: TUYỆT ĐỐI KHÔNG xoá bước, không đổi thứ tự, không rút gọn, không gộp bước. Chỉ thay đúng cụm chữ vi phạm.`;
const GUIDE_NOTE_NGOAI_NOMA = `\n\n⚠️ Bài này KHÔNG nói về NOMA (là bài sản phẩm Doscom). TUYỆT ĐỐI KHÔNG chèn tên, định danh hay xuất xứ NOMA vào bài. Chỉ sửa claim quảng cáo quá đà.`;

// Bài đang soát chịu bộ luật nào: EN → brand core EN; bài NOMA → brand core v3;
// bài không phải NOMA → chỉ luật quảng cáo chung (không đụng tới định danh thương hiệu).
function luatChoBai(site, laNoma) {
  if (site === "nomaauto") {
    return { forbidden: NOMA_FORBIDDEN_EN, guide: NOMA_BRAND_GUIDE_EN, note: GUIDE_NOTE, ap_ho_so: false };
  }
  if (laNoma) {
    return { forbidden: NOMA_FORBIDDEN, guide: NOMA_BRAND_GUIDE, note: GUIDE_NOTE, ap_ho_so: true };
  }
  return {
    forbidden: CLAIM_QUANG_CAO_CHUNG,
    guide: QUY_TAC_QUANG_CAO_CHUNG,
    note: GUIDE_NOTE + GUIDE_NOTE_NGOAI_NOMA,
    ap_ho_so: false,
  };
}

// Mã SKU của bài: ưu tiên TIÊU ĐỀ. Trong thân bài thường nhắc SKU khác ("dùng kèm
// NOMA 310") — dò theo thân bài trước là đối chiếu nhầm sang hồ sơ sản phẩm khác.
const skuCuaBai = (bai, specs) => findSkuCode(bai.name, specs) || findSkuCode(bai.content, specs);

async function napBaiHuongDan(c) {
  const cats = await listGuideCategories(c);
  const { items, het, raw_ok } = await listGuidePosts(c, { catIds: cats.map((x) => x.id) });
  return { cats, items, het, raw_ok };
}

async function soatBaiHuongDan({ env, c, site, mode, body, skuSpecs }) {
  if (mode === "list") {
    const { cats, items, het, raw_ok } = await napBaiHuongDan(c);
    const ds = items.map((p) => {
      const laNoma = laBaiNoma(p);
      const { forbidden } = luatChoBai(site, laNoma);
      return {
        id: p.id, name: p.name, permalink: p.permalink, status: p.status,
        la_noma: laNoma, raw: p.raw,
        sku: skuCuaBai(p, skuSpecs),
        flags: scanForbidden(`${p.name} ${p.content}`, forbidden),
      };
    });
    return json({
      ok: true, site, target: "guide",
      scanned: ds.length,
      noma_count: ds.filter((x) => x.la_noma).length,
      flagged_count: ds.filter((x) => x.flags.length).length,
      guide_categories: cats,
      con_bai_chua_quet: !het,   // chạm trần số trang → nói thẳng, không giấu phần chưa soát
      raw_ok,
      items: ds,
    });
  }

  /* ── Đối chiếu hồ sơ: bài hướng dẫn còn thiếu mục nào ──────────────────────── */
  if (mode === "gap") {
    const ids = Array.isArray(body.ids) ? body.ids.map(Number).filter(Boolean) : null;
    const { items } = await napBaiHuongDan(c);
    const chon = ids ? items.filter((p) => ids.includes(p.id)) : items;

    const results = [];
    let chuaCoHoSo = 0;
    for (const p of chon) {
      const laNoma = laBaiNoma(p);
      const code = laNoma ? skuCuaBai(p, skuSpecs) : null;
      const spec = code ? skuSpecs[code] : null;
      const kq = doiChieuBaiHdsd(p, spec);
      if (!kq.co_ho_so) chuaCoHoSo++;
      results.push({
        id: p.id, name: p.name, permalink: p.permalink, sku: code, la_noma: laNoma,
        co_ho_so: kq.co_ho_so, diem: kq.diem,
        thieu: kq.thieu, khong_chac: kq.khong_chac, so_co: kq.co.length,
      });
    }
    // Thiếu phần TRỌNG YẾU (bước dùng, lưu ý, PPE, sơ cứu) xếp lên đầu.
    results.sort((a, b) => {
      const w = (r) => (r.thieu || []).filter((x) => x.trong_yeu).length;
      return w(b) - w(a) || (a.diem ?? 101) - (b.diem ?? 101);
    });
    return json({
      ok: true, site, target: "guide", mode: "gap",
      scanned: chon.length, chua_co_ho_so: chuaCoHoSo, results,
    });
  }

  /* ── AI soạn phần còn thiếu, ghép vào cuối bài (CHỈ xem trước, không ghi) ──── */
  if (mode === "gap-draft") {
    if (env.USE_CLAUDE === "false") return json({ ok: false, error: "AI đang tắt (USE_CLAUDE=false)" }, 503);
    const ids = (Array.isArray(body.ids) ? body.ids.map(Number).filter(Boolean) : []).slice(0, 10);
    if (!ids.length) return json({ ok: false, error: "chưa chọn bài nào" }, 400);

    let cost = 0;
    const results = [];
    for (const id of ids) {
      const p = await getPost(c, id);
      const laNoma = laBaiNoma(p);
      const code = laNoma ? skuCuaBai(p, skuSpecs) : null;
      const spec = code ? skuSpecs[code] : null;
      const kq = doiChieuBaiHdsd(p, spec);

      if (!kq.co_ho_so || !kq.thieu.length) {
        results.push({ id, name: p.name, permalink: p.permalink, bo_qua: kq.co_ho_so ? "khong_thieu_gi" : "chua_co_ho_so" });
        continue;
      }
      // Soạn ra rồi không ghi được thì chỉ tổ tốn tiền AI → chặn ngay từ đây.
      if (!p.raw) {
        results.push({ id, name: p.name, permalink: p.permalink, error: "không đọc được nội dung gốc (raw) — tài khoản WordPress thiếu quyền sửa bài" });
        continue;
      }

      const lieuKe = kq.thieu.map((x) => `### ${x.nhan} (mã trường: ${x.truong})\n${x.trich_ho_so}`).join("\n\n");
      const userPrompt =
        `BÀI HƯỚNG DẪN: ${p.name}\n\n` +
        `CÁC MỤC CÒN THIẾU TRONG BÀI — viết bổ sung đúng ${kq.thieu.length} mục này, giữ nguyên số liệu:\n\n${lieuKe}\n\n` +
        `Trả JSON đúng schema, mỗi mục một phần tử trong "sections".`;

      try {
        const res = await callClaude(env, {
          model: "haiku",
          systemPrompt: `${DRAFT_SYSTEM}\n\n${NOMA_BRAND_GUIDE}`,
          userPrompt,
          maxTokens: 4000,
          jsonOutput: true,
        });
        cost += res.cost_usd || 0;
        const sections = Array.isArray(res.parsed?.sections) ? res.parsed.sections : [];
        if (!sections.length) {
          results.push({ id, name: p.name, permalink: p.permalink, error: "AI không trả được nội dung" });
          continue;
        }
        const added = sections
          .map((sec) => `<h3>${escapeHtml(sec.tieu_de || "")}</h3>\n${sanitizeHtml(sec.html || "")}`)
          .join("\n");
        const block = `${MARK_OPEN}\n${added}\n${MARK_CLOSE}`;
        results.push({
          id, name: p.name, permalink: p.permalink, sku: code,
          thieu: kq.thieu.map((x) => x.nhan),
          added_html: block,
          new_content: ghepBoSung(p.content, block),
          noi_dung_cu: p.content,
        });
      } catch (e) {
        results.push({ id, name: p.name, permalink: p.permalink, error: String(e.message || e).slice(0, 200) });
      }
    }
    return json({ ok: true, site, target: "guide", mode: "gap-draft", cost_usd: Number(cost.toFixed(6)), results });
  }

  /* ── Rà bằng AI: đề xuất cặp sửa cho từng bài ──────────────────────────────── */
  if (mode === "audit") {
    if (env.USE_CLAUDE === "false") return json({ ok: false, error: "AI đang tắt (USE_CLAUDE=false)" }, 503);
    const ids = Array.isArray(body.ids) ? body.ids.slice(0, 20) : [];
    if (!ids.length) return json({ ok: false, error: "Thiếu danh sách ids để rà" }, 400);

    const isEN = site === "nomaauto";
    const langNote = isEN
      ? `\n\n⚠️ NGÔN NGỮ: nội dung bài LÀ TIẾNG ANH (nomaauto.us). "original" và "fixed" trong JSON PHẢI bằng TIẾNG ANH, KHÔNG dịch sang tiếng Việt.`
      : "";

    const results = [];
    let cost = 0;
    for (const id of ids) {
      let p;
      try { p = await getPost(c, id); }
      catch (e) { results.push({ id, error: String(e.message || e) }); continue; }

      const laNoma = laBaiNoma(p);
      const { forbidden, guide, note, ap_ho_so } = luatChoBai(site, laNoma);
      const noiDung = p.content || "";
      const bodyFlags = scanForbidden(noiDung, forbidden);      // sửa được (nằm trong thân bài)
      const nameFlags = scanForbidden(p.name, forbidden);       // nằm ở TIÊU ĐỀ → tool không tự sửa
      const regexFlags = scanForbidden(`${p.name} ${noiDung}`, forbidden);

      const mustFix = bodyFlags.length
        ? `\nCÁC CỤM VI PHẠM ĐÃ DÒ ĐƯỢC trong bài (BẮT BUỘC tạo 1 cặp sửa cho MỖI cụm, "original" copy đúng cụm này): ${bodyFlags.map((f) => `"${f.quote}"`).join(", ")}.\n`
        : "";
      const specCode = ap_ho_so ? skuCuaBai(p, skuSpecs) : null;
      const specBlock = specCode ? `\n${skuSpecText(specCode, skuSpecs)}\n\n` : "";
      const userPrompt =
        `TIÊU ĐỀ BÀI: ${p.name}\n\n` +
        specBlock +
        `NỘI DUNG BÀI (HTML):\n${noiDung || "(trống)"}\n` +
        mustFix +
        `\nHãy trả JSON đúng schema. Sửa HẾT chỗ vi phạm${specCode ? ", và sửa HDSD/thời gian nếu lệch thông số chuẩn ở trên" : ""}; giữ nguyên phần còn lại.`;

      try {
        const res = await callClaude(env, {
          model: "haiku",
          systemPrompt: `${AUDIT_SYSTEM}${langNote}${note}\n\n${guide}`,
          userPrompt,
          maxTokens: 4000,
          jsonOutput: true,
        });
        cost += res.cost_usd || 0;
        const aiViolations = Array.isArray(res.parsed?.violations) ? res.parsed.violations : [];
        // Cặp sửa chắc chắn (regex) đi trước, cặp AI không trùng original bổ sung sau —
        // giống hệt nhánh sản phẩm để hai loại nội dung cho ra cùng kiểu kết quả.
        const detPairs = deterministicFixes(noiDung, forbidden);
        const seenOrig = new Set(detPairs.map((v) => v.original));
        const violations = [
          ...detPairs,
          ...aiViolations.filter((v) => v && typeof v.original === "string" && v.original && !seenOrig.has(v.original)),
        ];
        const fc = applyFixes(noiDung, violations);
        const appliedSet = new Set(fc.applied);
        const notApplied = violations
          .map((v) => (v && v.type) || (v && v.original) || "")
          .filter((lbl) => lbl && !appliedSet.has(lbl));

        results.push({
          id, name: p.name, permalink: p.permalink, status: p.status,
          la_noma: laNoma, sku: specCode, raw: p.raw,
          // Không đọc được raw thì CẤM áp — báo ngay để giao diện chặn trước;
          // brandcore-apply vẫn kiểm lại lần nữa ở phía server.
          khong_ghi_duoc: p.raw ? null : "không đọc được nội dung gốc (raw) — tài khoản WordPress thiếu quyền sửa bài",
          has_violations: violations.length > 0,
          violations,
          original_content: noiDung,
          fixed_content: fc.fixed,
          not_applied: [...new Set(notApplied)],
          regex_flags: regexFlags,
          name_flags: nameFlags.map((f) => f.type),
        });
      } catch (e) {
        results.push({ id, name: p.name, permalink: p.permalink, error: String(e.message || e), regex_flags: regexFlags });
      }
    }
    return json({ ok: true, site, target: "guide", cost_usd: Number(cost.toFixed(6)), results });
  }

  return json({ ok: false, error: `mode không hợp lệ: ${mode}` }, 400);
}
