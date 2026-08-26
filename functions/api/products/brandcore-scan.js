// POST /api/products/brandcore-scan
// Menu "Sửa brandcore" — NẤC 1: quét sản phẩm NOMA đã đăng, tìm chỗ vi phạm Brand Core NOMA v3.
// KHÔNG ghi gì lên web ở endpoint này (chỉ đọc + đề xuất bản sửa).
//
// Body:
//   { site, target } — `target` chọn LOẠI nội dung muốn soát (mặc định "product"):
//     · "product"      : sản phẩm WooCommerce (mô tả bán hàng)  → _wc.js
//     · "product-name" : TÊN sản phẩm trong danh mục — đối chiếu với cột "Tên sản phẩm"
//                        của hồ sơ rồi thay đúng nguyên văn. Chỉ có mode "list".
//     · "guide"   : BÀI VIẾT WordPress → _wp-posts.js. Phạm vi = ĐÚNG mục "Hướng dẫn
//                   sử dụng" của menu Kiến thức (noma.vn /danh-muc/huong-dan-su-dung,
//                   doscom.vn /category/huong-dan-su-dung) — cố ý BỎ bài SEO ở các danh
//                   mục "chăm sóc xe / DIY / so sánh". Trong mục đó, chỉ bài HDSD CHÍNH
//                   THỨC (tiêu đề "Hướng dẫn sử dụng NOMA <mã>: …") mới bị đối chiếu hồ
//                   sơ sản phẩm; bài khác chỉ soát brand core + tiêu đề.
//     Bốn mode dưới đây chạy được cho CẢ HAI target; khác nhau ở nguồn đọc/ghi.
//
//   { site, target: "guide", mode: "title" }
//     → soát TIÊU ĐỀ toàn bộ bài viết của web (không bó trong mục hướng dẫn): tiêu đề
//       rỗng, trái brand core, trùng tên, quá dài, sai khuôn bài HDSD. Không tốn AI.
//     Trả: { ok, scanned, tong_van_de, dem_theo_loai, results:[{id,name,tieu_de,van_de[]}] }
//
//   { site, target: "guide", mode: "title-draft", ids: [...] }
//     → AI đặt lại tiêu đề dựa nội dung THẬT của bài (tối đa 10 bài/lượt). Chỉ đề xuất,
//       ghi là việc của brandcore-apply với { id, title }.
//     Trả: { ok, cost_usd, results:[{id,tieu_de_cu,tieu_de_moi,do_dai,vi_pham[],trung_voi}] }
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
import { doiChieuSanPham, doiChieuBaiHdsd, boDau, boHtml as boHtmlNhe } from "./_gap.js";
import { siteCreds, isConfigured, listProducts, getProduct, isNomaProduct } from "./_wc.js";
import {
  listGuideCategories, listAllPosts, listPostsByIds, getPost,
  laBaiNoma, laBaiHdsdChinhThuc, laBaiHuongDanTheoTieuDe,
} from "./_wp-posts.js";
import {
  tenChuanSku, tenChuanSkuEN, tieuDeChuanHdsd, giongTieuDe,
} from "./_ten-chuan.js";
import { loadTenEn } from "./_ten-en.js";

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


const TITLE_SYSTEM = `Bạn là biên tập viên nội dung. Nhiệm vụ: đặt TIÊU ĐỀ cho 1 bài viết ĐÃ ĐĂNG, dựa trên nội dung thật của bài (nhiều bài bị mất tiêu đề khi đăng nên phải đặt lại).

QUY TẮC BẤT DI BẤT DỊCH:
1. Tiêu đề phải phản ánh ĐÚNG nội dung bài. TUYỆT ĐỐI KHÔNG bịa công dụng, số liệu, chứng nhận, cam kết không có trong bài.
2. Tiếng Việt có dấu. Dài 45–65 ký tự, KHÔNG quá 70. Không kết thúc bằng dấu chấm. Không dùng dấu ngoặc kép bao quanh.
3. Tuân thủ brand core ở dưới: không claim tuyệt đối ("100%", "tuyệt đối", "vĩnh viễn"), không từ thổi phồng ("số 1", "tốt nhất", "vượt trội", "đột phá", "tiên tiến"), không nói "Made in USA / sản xuất tại Mỹ / công nghệ Mỹ".
4. Khuôn "Hướng dẫn sử dụng NOMA <mã>: <công dụng chính>" CHỈ dành cho bài hướng dẫn sử dụng CHÍNH THỨC của sản phẩm đó. Mỗi sản phẩm chỉ có MỘT bài như vậy: nếu user prompt báo khuôn này đã có bài giữ rồi thì TUYỆT ĐỐI KHÔNG dùng lại — bài đang đặt là bài kiến thức/mẹo, hãy đặt tiêu đề theo góc riêng của nó (vấn đề gặp phải, tình huống, cách làm cụ thể).
5. Nếu là bài kiến thức/so sánh/mẹo → tiêu đề mô tả đúng nội dung, đặt từ khoá chính lên đầu, KHÔNG gắn khuôn "Hướng dẫn sử dụng".
6. KHÔNG đặt trùng hoặc na ná các tiêu đề đã dùng được liệt kê trong user prompt.

TRẢ VỀ DUY NHẤT JSON hợp lệ (không markdown, không chữ ngoài JSON):
{ "tieu_de": "tiêu đề mới", "ly_do": "một câu vì sao đặt vậy" }`;

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

  /* Web tiếng Anh dùng BẢNG TÊN EN (KV `noma_sku_names:en:v1`) làm tên chuẩn thay cho
     cột tên tiếng Việt của hồ sơ — không thì công cụ đem tên tiếng Việt đi rủ đổi tên
     sản phẩm trên trang bán cho khách Mỹ. Bảng trống → báo "chưa có tên tiếng Anh"
     chứ không đề xuất gì. */
  const tenEn = site === "nomaauto" ? (await loadTenEn(env)).names : null;

  // Bài hướng dẫn đi đường riêng (WordPress posts) — xem khối cuối file.
  if (target === "guide") {
    try { return await soatBaiHuongDan({ env, c, site, mode, body, skuSpecs, tenEn }); }
    catch (e) { return json({ ok: false, error: String(e.message || e) }, 502); }
  }
  // Soát TÊN sản phẩm trong danh mục — xem khối cuối file.
  if (target === "product-name") {
    try { return await soatTenSanPham({ c, site, mode, skuSpecs, tenEn }); }
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

/* ── Khuôn đặt tên: xem functions/api/products/_ten-chuan.js ───────────────────
   NGUỒN DUY NHẤT của tên sản phẩm là cột "Tên sản phẩm" trong hồ sơ (file
   "_Hồ sơ sản phẩm cập nhật" tải lên KV) — với nomaauto.us là bảng tên tiếng Anh
   (KV `noma_sku_names:en:v1`, dựng ở /api/products/names-en) — chứ không phải chữ ai đó
   gõ trên WordPress. Luật viết hoa và khuôn "NOMA <mã> - <tính năng>" nằm trong module
   đó để tên sản phẩm và tiêu đề bài không bao giờ lệch luật nhau. */

// Bộ tra tên chuẩn cho MỘT lượt quét: chọn sẵn nguồn theo web đang soát.
function boTenChuan({ site, skuSpecs, tenEn }) {
  const en = site === "nomaauto";
  return {
    en,
    ten: (code) => (en ? tenChuanSkuEN(code, tenEn) : tenChuanSku(code, skuSpecs)),
    tieuDe: (code) => tieuDeChuanHdsd(code, { specs: skuSpecs, namesEn: tenEn, en }),
  };
}

/* Tiêu đề đang mô tả sản phẩm NÀO — để bắt bài gắn nhầm mã.
   Có thật trên noma.vn: "Hướng dẫn sử dụng bộ vệ sinh và dưỡng ghế da Noma 692" mang
   tên sản phẩm của NOMA 686, trong khi 692 là dung dịch vệ sinh nội thất và trần xe.
   Loại này KHÔNG tự sửa được: hoặc sai mã, hoặc sai phần mô tả — phải người quyết. */
function khopTenNhat(tieuDe, specs, tc) {
  const t = boDau(tieuDe);
  let best = null;
  for (const code of Object.keys(specs || {})) {
    const ten = tc.ten(code);
    if (!ten) continue;
    const tu = boDau(ten).split(" ").filter((w) => w.length >= 3 && w !== "noma" && !/^\d+$/.test(w));
    if (tu.length < 3) continue;
    const diem = tu.filter((w) => t.includes(w)).length / tu.length;
    if (!best || diem > best.diem) best = { code, diem };
  }
  return best;
}

/* Phạm vi quét: MỌI bài có "hướng dẫn sử dụng" trong TIÊU ĐỀ, trên toàn web.

   Trước đây bám theo danh mục nên vừa sót (bài hướng dẫn nằm ngoài mục) vừa thừa (bài
   SEO nằm trong mục). Chủ dự án chốt 25/08/2026: quét đúng bài có tiêu đề hướng dẫn sử
   dụng, không kèm bài nào khác.
   Hai bước: đọc TIÊU ĐỀ toàn site (nhẹ) → lọc → lấy nội dung của đúng số bài đó bằng
   một lời gọi `include=`. */
async function napBaiHuongDan(c, en = false) {
  const { items: tatCa, het } = await listAllPosts(c);
  const ids = tatCa.filter((p) => laBaiHuongDanTheoTieuDe(p.tieu_de, en)).map((p) => p.id);
  if (!ids.length) return { items: [], het, raw_ok: true, tong_bai: tatCa.length };
  const { items, raw_ok } = await listPostsByIds(c, ids);
  return { items, het, raw_ok, tong_bai: tatCa.length };
}

async function soatBaiHuongDan({ env, c, site, mode, body, skuSpecs, tenEn }) {
  const tc = boTenChuan({ site, skuSpecs, tenEn });
  if (mode === "list") {
    const { items, het, raw_ok, tong_bai } = await napBaiHuongDan(c, tc.en);
    // Hai bài cùng một mã thì không đề xuất đổi tên — đổi cả hai về một tiêu đề là trùng khít.
    const demSku = new Map();
    for (const p of items) {
      const ma = findSkuCode(p.name, skuSpecs);
      if (ma) demSku.set(ma, (demSku.get(ma) || 0) + 1);
    }
    const ds = items.map((p) => {
      const laNoma = laBaiNoma(p);
      const { forbidden } = luatChoBai(site, laNoma);
      /* Tiêu đề chuẩn = "Hướng dẫn sử dụng " ("How to Use " bên nomaauto.us) + tên sản
         phẩm chuẩn. Không cắt gọt, không thêm đuôi quảng cáo ("…ĐÚNG CÁCH TẠI NHÀ",
         "…CHUYÊN SÂU"), không nhờ AI nghĩ hộ — hồ sơ/bảng tên là nguồn duy nhất. */
      const ma = findSkuCode(p.name, skuSpecs);
      const chuan = ma ? tc.tieuDe(ma) : null;
      const trungMa = ma ? (demSku.get(ma) || 0) > 1 : false;
      return {
        id: p.id, name: p.name, permalink: p.permalink, status: p.status,
        la_noma: laNoma, raw: p.raw,
        tieu_de_rong: p.tieu_de_rong,
        sku: ma,
        ten_chuan: chuan,
        // Có tên chuẩn, đang lệch, và không trùng mã → thay được ngay bằng một nút.
        can_doi_ten: Boolean(chuan && !giongTieuDe(p.name, chuan) && !trungMa),
        trung_ma: trungMa,
        /* Bên nomaauto.us: dò ra mã nhưng bảng tên tiếng Anh chưa có mã đó — nói rõ,
           im lặng bỏ qua là người dùng tưởng bài đã đúng tên. */
        chua_co_ten_en: Boolean(tc.en && ma && !chuan),
        flags: scanForbidden(`${p.name} ${p.content}`, forbidden),
      };
    });
    return json({
      ok: true, site, target: "guide",
      scanned: ds.length,
      tong_bai_tren_web: tong_bai,
      noma_count: ds.filter((x) => x.la_noma).length,
      flagged_count: ds.filter((x) => x.flags.length).length,
      doi_ten_count: ds.filter((x) => x.can_doi_ten).length,
      trung_ma_count: ds.filter((x) => x.trung_ma).length,
      chua_co_ten_en_count: ds.filter((x) => x.chua_co_ten_en).length,
      con_bai_chua_quet: !het,   // chạm trần số trang → nói thẳng, không giấu phần chưa soát
      raw_ok,
      items: ds,
    });
  }

  /* ── Đối chiếu hồ sơ: bài hướng dẫn còn thiếu mục nào ──────────────────────── */
  if (mode === "gap") {
    const ids = Array.isArray(body.ids) ? body.ids.map(Number).filter(Boolean) : null;
    const { items } = await napBaiHuongDan(c, tc.en);
    const chon = ids ? items.filter((p) => ids.includes(p.id)) : items;

    /* Phạm vi đã lọc theo tiêu đề nên mọi bài ở đây đều là bài hướng dẫn sử dụng.
       Bài nào không dò ra mã NOMA (bài hướng dẫn thiết bị Doscom) thì không có hồ sơ để
       đối chiếu — nói rõ "chưa có hồ sơ", không báo thiếu bừa. */
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
      scanned: chon.length,
      chua_co_ho_so: chuaCoHoSo,
      results,
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

  /* ── SOÁT TIÊU ĐỀ BÀI VIẾT ──────────────────────────────────────────────────
     Phạm vi KHÁC các mode trên: quét TOÀN BỘ bài của site, không bó trong danh mục
     hướng dẫn. Lý do: 25/08/2026 đo được 46/111 bài noma.vn có post_title RỖNG (trang
     thật hiện `<title>- Noma</title>`, `<h1></h1>`) và chúng nằm rải khắp danh mục —
     bó vào mục hướng dẫn là không nhìn thấy chúng.
     Chỉ đọc tiêu đề, KHÔNG kéo nội dung → nhẹ, chạy được cả web vài trăm bài. */
  if (mode === "title") {
    const cats = await listGuideCategories(c, { en: tc.en });
    const idMucHdsd = new Set(cats.map((x) => x.id));
    const { items, het } = await listAllPosts(c);

    // Đếm trùng tiêu đề trên bản bỏ dấu — "Tẩy ố kính" và "TẨY Ố KÍNH" là một.
    const theoTen = new Map();
    for (const p of items) {
      if (!p.tieu_de) continue;
      const k = boDau(p.tieu_de);
      theoTen.set(k, [...(theoTen.get(k) || []), p.id]);
    }

    /* Hai bài HDSD cho cùng một mã (có thật: 2 bài NOMA 350, 2 bài NOMA 692) thì KHÔNG
       đề xuất tên chuẩn — đổi cả hai về cùng một tiêu đề là biến trùng lặp thành trùng
       khít. Phải gộp/xoá bớt trước, đó là việc của người. */
    const baiTheoSku = new Map();
    for (const p of items) {
      if (p.tieu_de_rong || !laBaiHdsdChinhThuc(p.tieu_de, tc.en)) continue;
      const ma = findSkuCode(p.tieu_de, skuSpecs);
      if (ma) baiTheoSku.set(ma, [...(baiTheoSku.get(ma) || []), p.id]);
    }

    const results = [];
    const dem = { rong: 0, brandcore: 0, dai: 0, trung: 0, khuon: 0, ten_sp: 0, sai_sku: 0, trung_sku: 0 };
    for (const p of items) {
      const trongMucHdsd = p.categories.some((id) => idMucHdsd.has(id));
      const tenNoma = /\bnoma\b/i.test(p.tieu_de);
      const forbidden = site === "nomaauto"
        ? NOMA_FORBIDDEN_EN
        : (tenNoma ? NOMA_FORBIDDEN : CLAIM_QUANG_CAO_CHUNG);

      // Bài HDSD chính thức: tên sản phẩm trong tiêu đề phải khớp hồ sơ.
      const maHdsd = (!p.tieu_de_rong && laBaiHdsdChinhThuc(p.tieu_de, tc.en)) ? findSkuCode(p.tieu_de, skuSpecs) : null;
      const chuan = maHdsd ? tc.tieuDe(maHdsd) : null;
      const laChuan = chuan ? giongTieuDe(p.tieu_de, chuan) : false;
      let deXuat = null;

      const vanDe = [];
      if (p.tieu_de_rong) {
        vanDe.push({ ma: "rong", nhan: "Chưa có tiêu đề", chi_tiet: "post_title rỗng — trang mất thẻ <title> và <h1>" });
      } else {
        for (const f of scanForbidden(p.tieu_de, forbidden)) {
          vanDe.push({ ma: "brandcore", nhan: `Trái brand core: ${f.type}`, chi_tiet: f.quote });
        }
        /* Tên chuẩn của vài SKU vốn đã dài hơn 70 ký tự (NOMA 130 chẳng hạn). Giữa
           "đúng tên sản phẩm theo hồ sơ" và "gọn cho Google", brand core thắng — nên
           tiêu đề ĐÃ đúng chuẩn thì không nhắc chuyện dài nữa. */
        if (p.tieu_de.length > 70 && !laChuan) {
          vanDe.push({ ma: "dai", nhan: `Dài ${p.tieu_de.length} ký tự`, chi_tiet: "Google cắt tiêu đề quanh 60–70 ký tự" });
        }
        const cungTen = (theoTen.get(boDau(p.tieu_de)) || []).filter((x) => x !== p.id);
        if (cungTen.length) {
          vanDe.push({ ma: "trung", nhan: "Trùng tiêu đề bài khác", chi_tiet: `trùng với #${cungTen.join(", #")}` });
        }
        /* Khuôn "Hướng dẫn sử dụng NOMA <mã>: <công dụng>" CHỈ đòi ở bài trong mục hướng
           dẫn có nhắc NOMA. Bài hướng dẫn camera Doscom không có khuôn nào cả — bắt theo
           khuôn NOMA là 93 bài doscom.vn cùng báo lỗi một lượt, vô nghĩa. */
        if (trongMucHdsd && tenNoma && !laBaiHdsdChinhThuc(p.tieu_de, tc.en)) {
          vanDe.push({
            ma: "khuon", nhan: "Không theo khuôn bài hướng dẫn sử dụng",
            chi_tiet: 'nằm trong mục Hướng dẫn sử dụng nhưng tiêu đề không có dạng "Hướng dẫn sử dụng NOMA <mã> - <tính năng>"',
          });
        }

        if (maHdsd && !laChuan) {
          const khop = khopTenNhat(p.tieu_de, skuSpecs, tc);
          const cungMa = baiTheoSku.get(maHdsd) || [];
          if (khop && khop.code !== maHdsd && khop.diem >= 0.8) {
            // Gắn nhầm mã — không tự sửa, vì không biết sai ở mã hay ở phần mô tả.
            vanDe.push({
              ma: "sai_sku",
              nhan: `Tiêu đề mang tên sản phẩm của NOMA ${khop.code}`,
              chi_tiet: `hồ sơ: NOMA ${maHdsd} = "${tc.ten(maHdsd)}" · NOMA ${khop.code} = "${tc.ten(khop.code)}" — kiểm lại bài này viết về sản phẩm nào rồi sửa tay`,
            });
          } else if (cungMa.length > 1) {
            vanDe.push({
              ma: "trung_sku",
              nhan: `Có ${cungMa.length} bài hướng dẫn cho NOMA ${maHdsd}`,
              chi_tiet: `bài #${cungMa.join(", #")} — gộp hoặc xoá bớt trước, đổi tên cả hai về cùng một tiêu đề chỉ làm trùng khít hơn`,
            });
          } else if (chuan) {
            vanDe.push({
              ma: "ten_sp",
              nhan: "Tên sản phẩm không khớp hồ sơ",
              chi_tiet: `theo hồ sơ phải là: "${chuan}"`,
            });
            deXuat = chuan;     // sửa được ngay, không cần AI
          }
        }
      }
      if (!vanDe.length) continue;
      for (const v of vanDe) dem[v.ma] = (dem[v.ma] || 0) + 1;
      results.push({
        id: p.id, name: p.name, permalink: p.permalink,
        tieu_de: p.tieu_de, tieu_de_rong: p.tieu_de_rong,
        trong_muc_hdsd: trongMucHdsd,
        sku: maHdsd,
        de_xuat: deXuat,      // tên chuẩn dựng từ hồ sơ — điền sẵn cho người duyệt
        van_de: vanDe,
      });
    }
    // Bài mất tiêu đề lên đầu — đó là cái hỏng nặng nhất và sửa được ngay.
    results.sort((a, b) =>
      Number(b.tieu_de_rong) - Number(a.tieu_de_rong) ||
      Number(Boolean(b.de_xuat)) - Number(Boolean(a.de_xuat)) ||
      b.van_de.length - a.van_de.length);

    return json({
      ok: true, site, target: "guide", mode: "title",
      scanned: items.length,
      con_bai_chua_quet: !het,
      tong_van_de: results.length,
      dem_theo_loai: dem,
      results,
    });
  }

  /* ── AI ĐẶT LẠI TIÊU ĐỀ (chỉ đề xuất, chưa ghi) ────────────────────────────── */
  if (mode === "title-draft") {
    if (env.USE_CLAUDE === "false") return json({ ok: false, error: "AI đang tắt (USE_CLAUDE=false)" }, 503);
    const ids = (Array.isArray(body.ids) ? body.ids.map(Number).filter(Boolean) : []).slice(0, 10);
    if (!ids.length) return json({ ok: false, error: "chưa chọn bài nào" }, 400);

    // Danh sách tiêu đề đang dùng → ép AI không đặt trùng, và tự kiểm lại sau khi AI trả.
    const { items: tatCa } = await listAllPosts(c);
    const dangDung = new Map(tatCa.filter((x) => x.tieu_de).map((x) => [boDau(x.tieu_de), x.id]));

    let cost = 0;
    const results = [];
    for (const id of ids) {
      let p;
      try { p = await getPost(c, id); }
      catch (e) { results.push({ id, error: String(e.message || e) }); continue; }

      const laNoma = laBaiNoma(p);
      const code = laNoma ? skuCuaBai(p, skuSpecs) : null;
      const spec = code ? skuSpecText(code, skuSpecs) : "";
      const forbidden = site === "nomaauto"
        ? NOMA_FORBIDDEN_EN
        : (laNoma ? NOMA_FORBIDDEN : CLAIM_QUANG_CAO_CHUNG);
      const guide = site === "nomaauto"
        ? NOMA_BRAND_GUIDE_EN
        : (laNoma ? NOMA_BRAND_GUIDE : QUY_TAC_QUANG_CAO_CHUNG);

      // Slug thường giữ đúng chủ đề bài kể cả khi tiêu đề đã mất → là gợi ý tốt cho AI.
      const slug = (p.permalink || "").replace(/\/+$/, "").split("/").pop() || "";
      const than = boHtmlNhe(p.content).slice(0, 3500);
      const cungSku = tatCa
        .filter((x) => x.tieu_de && code && new RegExp(`noma\\s?${code}\\b`, "i").test(x.tieu_de))
        .map((x) => `- ${x.tieu_de}`).slice(0, 12).join("\n");
      /* Bài HDSD chính thức của SKU này đã có chủ chưa. Nếu rồi thì bài đang đặt KHÔNG
         được mang khuôn đó: hai bài cùng khuôn cho một sản phẩm là tự cắn từ khoá của
         nhau (đã suýt xảy ra khi AI đặt "Hướng dẫn sử dụng NOMA 620: Xóa ố vàng đèn pha"
         cho một bài mẹo, trong khi bài HDSD 620 chính thức đang chạy). */
      const chuKhuon = code
        ? tatCa.find((x) => x.id !== id && laBaiHdsdChinhThuc(x.tieu_de, tc.en) &&
            new RegExp(`noma\\s?${code}\\b`, "i").test(x.tieu_de))
        : null;

      const userPrompt =
        `TIÊU ĐỀ HIỆN TẠI: ${p.tieu_de || "(TRỐNG — bài chưa có tiêu đề)"}\n` +
        `ĐƯỜNG DẪN (slug): ${slug}\n` +
        (code ? `SẢN PHẨM ĐƯỢC NHẮC: NOMA ${code}\n${spec}\n` : "") +
        `\nNỘI DUNG BÀI (đã bỏ thẻ HTML, cắt bớt):\n${than}\n` +
        (cungSku ? `\nTIÊU ĐỀ ĐÃ DÙNG CHO SẢN PHẨM NÀY (KHÔNG được đặt trùng hoặc na ná):\n${cungSku}\n` : "") +
        (chuKhuon ? `\n⛔ Bài HƯỚNG DẪN SỬ DỤNG CHÍNH THỨC của NOMA ${code} ĐÃ CÓ: "${chuKhuon.tieu_de}". Bài bạn đang đặt KHÔNG phải bài đó — TUYỆT ĐỐI không dùng khuôn "Hướng dẫn sử dụng NOMA ${code}".\n` : "") +
        `\nĐặt 1 tiêu đề mới. Trả JSON đúng schema.`;

      try {
        const res = await callClaude(env, {
          model: "haiku",
          systemPrompt: `${TITLE_SYSTEM}\n\n${guide}`,
          userPrompt,
          maxTokens: 500,
          jsonOutput: true,
        });
        cost += res.cost_usd || 0;
        let moi = String(res.parsed?.tieu_de || "").replace(/^["'\s]+|["'\s.]+$/g, "").replace(/\s+/g, " ");
        if (!moi) { results.push({ id, name: p.name, permalink: p.permalink, error: "AI không trả được tiêu đề" }); continue; }

        /* Tự kiểm lại tiêu đề AI vừa đặt. Đây là chữ sẽ thành <title> + <h1> của bài —
           tin lời dặn trong prompt là đủ để một hôm nào đó "NOMA 911 tốt nhất" lên web. */
        const viPham = scanForbidden(moi, forbidden);
        const idTrung = dangDung.get(boDau(moi));
        results.push({
          id, name: p.name, permalink: p.permalink,
          tieu_de_cu: p.tieu_de,
          tieu_de_moi: moi,
          do_dai: moi.length,
          sku: code,
          ly_do: String(res.parsed?.ly_do || "").slice(0, 300),
          vi_pham: viPham,                                    // có phần tử → KHÔNG cho ghi
          trung_voi: idTrung && idTrung !== id ? idTrung : null,
          // AI vẫn cướp khuôn HDSD của bài khác → chặn ở đây, không tin mỗi lời dặn.
          trung_khuon: chuKhuon && laBaiHdsdChinhThuc(moi, tc.en) ? { id: chuKhuon.id, tieu_de: chuKhuon.tieu_de } : null,
          qua_dai: moi.length > 70 ? moi.length : null,
        });
      } catch (e) {
        results.push({ id, name: p.name, permalink: p.permalink, error: String(e.message || e).slice(0, 200) });
      }
    }
    return json({ ok: true, site, target: "guide", mode: "title-draft", cost_usd: Number(cost.toFixed(6)), results });
  }

  return json({ ok: false, error: `mode không hợp lệ: ${mode}` }, 400);
}

/* ══════════════════════════════════════════════════════════════════════════════
   SOÁT TÊN SẢN PHẨM trong danh mục bán hàng (target "product-name").

   Cùng một luật đặt tên với bài hướng dẫn: nguồn duy nhất là cột "Tên sản phẩm" của hồ
   sơ. Trên web tên đang mỗi nơi một kiểu — "Dung Dịch Tẩy Ố Kính Chuyên Sâu - Noma 911"
   (đảo ngược), "NOMA 250 - … NGUYÊN BẢN" (thêm đuôi), "NOMA 890 - DUNG DỊCH XỊT  BÓNG"
   (thiếu chữ "phủ", thừa dấu cách) — nên khách, quảng cáo và bài viết gọi ba tên khác
   nhau cho một sản phẩm.

   KHÔNG đụng slug/đường dẫn: WooCommerce giữ nguyên slug khi đổi tên, nên URL và mọi
   liên kết đang chạy vẫn sống. Combo (không có mã NOMA trong tên) thì không có hồ sơ →
   bỏ qua, không đoán bừa.
   ══════════════════════════════════════════════════════════════════════════════ */
async function soatTenSanPham({ c, site, mode, skuSpecs, tenEn }) {
  if (mode !== "list") return json({ ok: false, error: `target 'product-name' chỉ có mode "list"` }, 400);

  const tc = boTenChuan({ site, skuSpecs, tenEn });
  const { products, scanned } = await listNomaProducts(c, site);

  // Hai sản phẩm cùng mã thì không tự đổi — đổi cả hai về một tên là tạo trùng lặp mới.
  const demSku = new Map();
  for (const p of products) {
    const ma = findSkuCode(p.name, skuSpecs);
    if (ma) demSku.set(ma, (demSku.get(ma) || 0) + 1);
  }

  const items = products.map((p) => {
    const ma = findSkuCode(p.name, skuSpecs);
    const chuan = ma ? tc.ten(ma) : null;
    const trungMa = ma ? (demSku.get(ma) || 0) > 1 : false;
    return {
      id: p.id, name: p.name, permalink: p.permalink, status: p.status,
      sku: ma,
      ten_chuan: chuan,
      can_doi_ten: Boolean(chuan && !giongTieuDe(p.name, chuan) && !trungMa),
      trung_ma: trungMa,
      // Không dò ra mã: combo, hoặc tên thiếu hẳn mã sản phẩm — nói rõ để còn sửa tay.
      chua_co_ho_so: !ma,
      // Có mã nhưng bảng tên tiếng Anh chưa có — phải dựng bảng tên trước khi đổi.
      chua_co_ten_en: Boolean(tc.en && ma && !chuan),
      flags: p.flags,
    };
  });

  return json({
    ok: true, site, target: "product-name",
    scanned: items.length,
    da_quet: scanned,
    doi_ten_count: items.filter((x) => x.can_doi_ten).length,
    trung_ma_count: items.filter((x) => x.trung_ma).length,
    chua_co_ho_so_count: items.filter((x) => x.chua_co_ho_so).length,
    chua_co_ten_en_count: items.filter((x) => x.chua_co_ten_en).length,
    flagged_count: items.filter((x) => x.flags.length).length,
    items,
  });
}
