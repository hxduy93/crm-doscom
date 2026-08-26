/* POST /api/products/names-en — dựng & lưu BẢNG TÊN TIẾNG ANH của các mã SKU NOMA.
   GET  /api/products/names-en — xem bảng đang dùng (không đụng gì).

   Vì sao có: phần "Sửa brandcore" đổi tên sản phẩm và tiêu đề bài hướng dẫn theo tên
   trong hồ sơ. Hồ sơ chỉ có tên TIẾNG VIỆT, nên trên nomaauto.us không có gì để đối
   chiếu — trước đây chọn site đó là công cụ đem tên tiếng Việt đi rủ đổi, tức là suýt
   ghi tên tiếng Việt lên trang bán hàng cho khách Mỹ.

   BA NẤC TÁCH RỜI (giống phần soát nội dung thiếu — chốt 22/08/2026):
     soạn     mode "draft"  → đề xuất tên EN, KHÔNG ghi. Nguồn theo thứ tự ưu tiên:
                              bảng đang có → tên sản phẩm sẵn trên nomaauto.us → AI dịch.
     áp       mode "save"   → ghi bảng vào KV (bản cũ giữ ở …:prev).
     hoàn tác mode "revert" → trả lại bản trước.
   Gộp một nút thì tên do AI dịch lên thẳng trang bán hàng mà không ai đọc lại.

   Ưu tiên tên ĐANG CÓ trên nomaauto.us hơn bản dịch mới: 16 sản phẩm bên đó đã có tên
   tiếng Anh do người duyệt (chỉ lệch khuôn "Noma 998 –" và hoa/thường), dịch đè lên là
   đổi tên hàng loạt sản phẩm đang chạy quảng cáo để lấy về đúng… một cách viết khác.

   Bảo vệ: giống brandcore-import.js — Access role != "open" cho qua, "open" cần token.
*/
import { getIdentity } from "../../lib/access.js";
import { loadSkuSpecs, findSkuCode } from "../geo/_utils/noma-sku-specs.js";
import { callClaude } from "../geo/_utils/claude.js";
import { siteCreds, isConfigured, listProducts, isNomaProduct } from "./_wc.js";
import { chuanHoaTen, tenChuanSku } from "./_ten-chuan.js";
import { EN_NAMES_KV_KEY, EN_NAMES_PREV_KEY, EN_NAMES_DRAFT_KEY, loadTenEn } from "./_ten-en.js";

function json(o, s = 200) {
  return new Response(JSON.stringify(o), {
    status: s,
    headers: { "content-type": "application/json; charset=utf-8" },
  });
}

async function chanTruyCap(context) {
  const identity = await getIdentity(context);
  if (identity.role !== "open") return null;
  const { request, env } = context;
  if (!env.PRODUCTS_TOKEN || request.headers.get("X-Products-Token") !== env.PRODUCTS_TOKEN) {
    return json({ ok: false, error: "unauthorized — thiếu/sai X-Products-Token" }, 401);
  }
  return null;
}

export async function onRequestOptions() {
  return new Response(null, {
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, X-Products-Token",
    },
  });
}

export async function onRequestGet({ env }) {
  const [bang, ho] = await Promise.all([loadTenEn(env), loadSkuSpecs(env)]);
  const ma = Object.keys(ho.specs).sort();
  // Bản soạn lần trước (nếu có) trả luôn theo — mở lại trang là thấy, khỏi dịch lại.
  let banNhap = null;
  try {
    const raw = env.INVENTORY ? await env.INVENTORY.get(EN_NAMES_DRAFT_KEY) : null;
    if (raw) banNhap = JSON.parse(raw);
  } catch (e) { /* bản soạn hỏng thì bỏ qua, không làm gãy trang */ }
  return json({
    ok: true,
    data: {
      nguon: bang.nguon, so_ten: bang.so_ten, cap_nhat: bang.cap_nhat,
      names: bang.names,
      thieu: ma.filter((k) => !bang.names[k]),
      co_ban_hoan_tac: Boolean(env.INVENTORY && (await env.INVENTORY.get(EN_NAMES_PREV_KEY))),
      ban_nhap: banNhap,
    },
  });
}

/* Tên tiếng Anh ĐANG CÓ trên nomaauto.us, tra theo mã SKU trong tên sản phẩm.
   Lỗi mạng/credential ở đây KHÔNG được làm hỏng cả lời gọi: thiếu nguồn này thì chỉ là
   phải dịch nhiều hơn, còn ném lỗi thì người dùng mất luôn nút. */
async function tenTrenWebUS(env, specs) {
  const c = siteCreds("nomaauto", env);
  if (!isConfigured(c)) return { theoMa: {}, loi: "nomaauto.us chưa cấu hình credential WooCommerce" };
  const theoMa = {};
  try {
    for (let page = 1; page <= 4; page++) {
      const { items, totalPages } = await listProducts(c, { perPage: 50, page });
      for (const p of items) {
        if (!isNomaProduct(p)) continue;
        const ma = findSkuCode(p.name, specs);
        if (ma && !theoMa[ma]) theoMa[ma] = p.name;
      }
      if (page >= totalPages || !items.length) break;
    }
  } catch (e) {
    return { theoMa, loi: String(e.message || e).slice(0, 200) };
  }
  return { theoMa, loi: null };
}

const DICH_SYS = [
  "You name automotive-care products for a US e-commerce site.",
  "Translate each Vietnamese product name into a short, natural American English product name.",
  "RULES:",
  '- Keep the exact "NOMA <code> - " prefix, then the English description of what the product IS.',
  '- Title Case, no ALL CAPS, no hype, no claim words ("best", "100%", "permanent", "made in USA").',
  "- Under 70 characters total; name the product type (spray, kit, cleaner, coating...).",
  '- Return ONLY one JSON object mapping code to name, e.g. {"911":"NOMA 911 - Deep Glass Water Spot Remover"}.',
].join("\n");

/* Cache theo NGÀY VN + đúng danh sách tên đem dịch (red line: mode AI tốn tiền phải có
   cache KV để bấm lại trong ngày không tốn credit). Danh sách đổi → khoá đổi → dịch lại,
   nên cache không bao giờ trả tên của sản phẩm khác. */
const khoaCacheDich = (cans) => {
  const dateVN = new Date(Date.now() + 7 * 3600 * 1000).toISOString().slice(0, 10);
  const dau = cans.map((x) => `${x.ma}=${x.ten_vn}`).join("|");
  let h = 0;
  for (let i = 0; i < dau.length; i++) h = (h * 31 + dau.charCodeAt(i)) >>> 0;
  return `nameen:dich:v1:${dateVN}:${cans.length}:${h.toString(36)}`;
};

async function dichTen(env, cans) {
  if (!cans.length) return { names: {}, cost_usd: 0, loi: null };
  const cacheKey = khoaCacheDich(cans);
  if (env.INVENTORY) {
    const hit = await env.INVENTORY.get(cacheKey).catch(() => null);
    if (hit) { try { return { names: JSON.parse(hit), cost_usd: 0, loi: null, cached: true }; } catch { /* cache hỏng → dịch lại */ } }
  }
  const userPrompt = "Translate these Vietnamese product names:\n" +
    cans.map((x) => `${x.ma}: ${x.ten_vn}`).join("\n");
  try {
    const res = await callClaude(env, {
      model: "haiku", systemPrompt: DICH_SYS, userPrompt,
      maxTokens: 2000, jsonOutput: true,
    });
    const p = res.parsed || {};
    const names = {};
    for (const x of cans) {
      const t = p[x.ma] || p[String(x.ma)];
      if (typeof t === "string" && t.trim()) names[x.ma] = t.trim();
    }
    if (env.INVENTORY && Object.keys(names).length) {
      await env.INVENTORY.put(cacheKey, JSON.stringify(names), { expirationTtl: 86400 }).catch(() => {});
    }
    return { names, cost_usd: res.cost_usd || 0, loi: null };
  } catch (e) {
    // Dịch hỏng → trả về phần dịch được (rỗng) kèm lý do, KHÔNG bịa tên.
    return { names: {}, cost_usd: 0, loi: String(e.message || e).slice(0, 200) };
  }
}

export async function onRequestPost(context) {
  const { request, env } = context;
  const chan = await chanTruyCap(context);
  if (chan) return chan;
  if (!env.INVENTORY) return json({ ok: false, error: "thiếu binding KV INVENTORY" }, 500);

  let body;
  try { body = await request.json(); } catch { return json({ ok: false, error: "Body không phải JSON" }, 400); }
  const mode = String(body.mode || "draft").toLowerCase();

  if (mode === "revert") {
    const prev = await env.INVENTORY.get(EN_NAMES_PREV_KEY);
    if (!prev) return json({ ok: false, error: "không có bản trước để hoàn tác" }, 404);
    await env.INVENTORY.put(EN_NAMES_KV_KEY, prev);
    await env.INVENTORY.delete(EN_NAMES_PREV_KEY);
    const d = JSON.parse(prev);
    return json({ ok: true, data: { hoan_tac: true, so_ten: Object.keys(d.names || {}).length } });
  }

  if (mode === "save") {
    const vao = body.names && typeof body.names === "object" ? body.names : null;
    if (!vao || !Object.keys(vao).length) return json({ ok: false, error: "thiếu names" }, 400);
    /* Chuẩn hoá lại lần cuối ngay trước khi ghi: người dùng có thể vừa sửa tay trong ô
       nhập, mà bảng này đi thẳng lên tên sản phẩm khách nhìn thấy. */
    const names = {};
    for (const [ma, ten] of Object.entries(vao)) {
      const t = chuanHoaTen(ten, { en: true });
      if (t) names[String(ma)] = t;
    }
    if (!Object.keys(names).length) return json({ ok: false, error: "không có tên nào hợp lệ" }, 400);

    const cu = await loadTenEn(env);
    if (cu.nguon === "kv") {
      const old = await env.INVENTORY.get(EN_NAMES_KV_KEY);
      if (old) await env.INVENTORY.put(EN_NAMES_PREV_KEY, old);
    }
    await env.INVENTORY.put(EN_NAMES_KV_KEY, JSON.stringify({
      names, cap_nhat: new Date().toISOString(), nguon_seed: body.nguon_seed || null,
    }));
    await env.INVENTORY.delete(EN_NAMES_DRAFT_KEY).catch(() => {});
    return json({ ok: true, data: { so_ten: Object.keys(names).length, luu: true } });
  }

  if (mode !== "draft") return json({ ok: false, error: `mode không hợp lệ: ${mode}` }, 400);

  const { specs } = await loadSkuSpecs(env);
  const bang = await loadTenEn(env);
  const { theoMa, loi: loiWeb } = await tenTrenWebUS(env, specs);

  /* `dich_lai: true` → bỏ qua bảng cũ và tên trên web, dịch lại từ đầu (dùng khi tên EN
     hiện tại sai hẳn). Mặc định KHÔNG, để một cú bấm không kéo theo đổi tên hàng loạt. */
  const dichLai = body.dich_lai === true;
  const chiMa = Array.isArray(body.codes) && body.codes.length ? body.codes.map(String) : null;

  const ma = Object.keys(specs).filter((k) => !chiMa || chiMa.includes(k)).sort();
  const items = ma.map((k) => ({
    ma: k,
    ten_vn: tenChuanSku(k, specs),
    dang_co: bang.names[k] ? chuanHoaTen(bang.names[k], { en: true }) : null,
    tren_web_us: theoMa[k] ? chuanHoaTen(theoMa[k], { en: true }) : null,
  }));

  const canDich = items.filter((x) => dichLai || (!x.dang_co && !x.tren_web_us));
  const { names: dich, cost_usd, loi: loiDich } = await dichTen(env, canDich);

  for (const x of items) {
    const tuDich = dich[x.ma] ? chuanHoaTen(dich[x.ma], { en: true }) : null;
    x.de_xuat = dichLai
      ? (tuDich || x.dang_co || x.tren_web_us || null)
      : (x.dang_co || x.tren_web_us || tuDich || null);
    x.nguon = x.de_xuat == null ? "chua_co"
      : x.de_xuat === x.dang_co ? "bang"
      : x.de_xuat === x.tren_web_us ? "web_us"
      : "dich";
    /* Bảng đã có tên nhưng lệch khuôn/hoa-thường → nói rõ, để người duyệt hiểu bấm Lưu
       chỉ nắn lại cách viết chứ không đổi nội dung tên. */
    x.doi_khuon = Boolean(x.de_xuat && bang.names[x.ma] && bang.names[x.ma] !== x.de_xuat);
  }

  /* Cất bản soạn lại (90 ngày): tiền AI đã tiêu rồi, đóng trang mà mất là phải dịch
     lần nữa. Đây KHÔNG phải nguồn tên chuẩn — muốn dùng vẫn phải bấm Lưu bảng tên. */
  if (env.INVENTORY) {
    await env.INVENTORY.put(EN_NAMES_DRAFT_KEY,
      JSON.stringify({ items, cap_nhat: new Date().toISOString(), so_dich: Object.keys(dich).length }),
      { expirationTtl: 90 * 86400 }).catch(() => {});
  }

  return json({
    ok: true,
    data: {
      items,
      so_dich: Object.keys(dich).length,
      cost_usd: Number((cost_usd || 0).toFixed(6)),
      canh_bao: [loiWeb, loiDich].filter(Boolean),
      dang_dung: { nguon: bang.nguon, so_ten: bang.so_ten, cap_nhat: bang.cap_nhat },
    },
  });
}
