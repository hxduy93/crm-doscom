// POST /api/products/bulk-sale — menu "Giảm giá hàng loạt" (doscom.vn / noma.vn).
//
// Đặt GIÁ SALE HẸN GIỜ của WooCommerce cho nhiều SP: tới ngày bắt đầu web tự hiện giá giảm,
// hết ngày kết thúc tự về giá cũ. KHÔNG sửa giá gốc. Giá sale cũ lưu KV `salecamp:{site}:{id}`
// TRƯỚC khi ghi để kết thúc đợt trả về đúng giá đó. Logic thuần ở functions/lib/bulk-sale.js.
//
// Body (luôn trả JSON):
//   { site, mode:"list" }                       ĐỌC — SP + danh mục + đợt đang theo dõi + múi giờ web
//   { site, mode:"variations", id }             ĐỌC — biến thể của 1 SP
//   { site, mode:"create_category", name }      GHI — tạo danh mục (trùng tên → dùng cái có sẵn)
//   { site, mode:"apply", campaign, from, to, category_id?, items:[{id, pct?, sale_price?}] }   GHI
//   { site, mode:"end", ids:[..] }              GHI — trả giá cũ + gỡ danh mục tool đã gắn
//
// Bảo vệ (red line endpoint GHI phải có token): Access role != "open" → cho qua;
// "open" → cần X-Products-Token == env.PRODUCTS_TOKEN.
import { getIdentity } from "../../lib/access.js";
import {
  siteCreds, isConfigured, listProducts, fetchCategories, getProductFields, listVariations,
  updateProduct, updateVariationsBatch, createCategory, siteTimezone,
} from "./_wc.js";
import {
  BULK_SALE_SITES, campKey, campPrefix, validateRange, vnDateToGmt, planPrice, choosePrev,
  endUnitDecision, restorePayload, planCategories, endCategories, sameIds, variationLabel,
} from "../../lib/bulk-sale.js";

const READ_MODES = ["list", "variations"];
const WRITE_MODES = ["apply", "end", "create_category"];
const MAX_ITEMS = 10;
const P_FIELDS = "id,name,type,status,permalink,regular_price,sale_price,date_on_sale_from_gmt,date_on_sale_to_gmt,categories";

function json(o, s = 200) {
  return new Response(JSON.stringify(o), {
    status: s,
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" },
  });
}
const msg = (e) => String((e && e.message) || e);

async function readCamp(env, site, id) {
  const raw = await env.INVENTORY.get(campKey(site, id)).catch(() => null);
  if (!raw) return null;
  try { return JSON.parse(raw); } catch { return null; }
}

// Metadata (≤1KB) cho mode list đọc mọi đợt bằng 1 lần list. Giá cũ đầy đủ nằm trong value.
async function writeCamp(env, site, st) {
  await env.INVENTORY.put(campKey(site, st.id), JSON.stringify(st), {
    metadata: {
      campaign: st.campaign, from: st.from, to: st.to, pct: st.pct == null ? null : Math.round(st.pct),
      category_id: st.category_id, category_added: st.category_added, type: st.type, at: st.at,
    },
  });
}

async function rollbackCamp(env, site, id, prev) {
  if (prev) await writeCamp(env, site, prev).catch(() => {});
  else await env.INVENTORY.delete(campKey(site, id)).catch(() => {});
}

async function listCamps(env, site) {
  const out = new Map();
  if (!env.INVENTORY) return out;
  let cursor;
  for (let i = 0; i < 20; i++) {
    const r = await env.INVENTORY.list({ prefix: campPrefix(site), cursor });
    for (const k of r.keys || []) {
      const id = Number(k.name.slice(campPrefix(site).length));
      if (id) out.set(id, k.metadata || {});
    }
    if (r.list_complete || !r.cursor) break;
    cursor = r.cursor;
  }
  return out;
}

export async function onRequestPost(context) {
  const { request, env } = context;

  let body;
  try { body = await request.json(); } catch { return json({ ok: false, error: "body_not_json" }, 400); }
  if (!body || typeof body !== "object") return json({ ok: false, error: "body_not_json" }, 400);

  const site = String(body.site || "").toLowerCase();
  if (!BULK_SALE_SITES.includes(site)) return json({ ok: false, error: `Web không hỗ trợ: '${site}' (chỉ doscom, noma)` }, 400);
  const mode = String(body.mode || "list");
  if (![...READ_MODES, ...WRITE_MODES].includes(mode)) return json({ ok: false, error: `mode không hợp lệ: ${mode}` }, 400);

  if (WRITE_MODES.includes(mode)) {
    const identity = await getIdentity(context);
    if (identity.role === "open") {
      if (!env.PRODUCTS_TOKEN || request.headers.get("X-Products-Token") !== env.PRODUCTS_TOKEN) {
        return json({ ok: false, error: "unauthorized — thiếu/sai X-Products-Token" }, 401);
      }
    }
    if (!env.INVENTORY) return json({ ok: false, error: "Thiếu KV INVENTORY — không lưu được giá cũ nên không cho ghi" }, 500);
  }

  const c = siteCreds(site, env);
  if (!isConfigured(c)) return json({ ok: false, error: `Web '${site}' chưa cấu hình credential WooCommerce/WordPress` }, 400);

  try {
    if (mode === "list") return json(await doList(c, env, site));
    if (mode === "variations") {
      const id = Number(body.id);
      if (!id) return json({ ok: false, error: "Thiếu id" }, 400);
      const vars = await listVariations(c, id);
      return json({ ok: true, id, variations: vars.map((v) => ({ ...v, label: variationLabel(v) })) });
    }
    if (mode === "create_category") {
      const name = String(body.name || "").trim().slice(0, 60);
      if (!name) return json({ ok: false, error: "Thiếu tên danh mục" }, 400);
      return json({ ok: true, category: await createCategory(c, name) });
    }
    if (mode === "apply") {
      const r = await doApply(c, env, site, body);
      return json(r, r.ok ? 200 : 400);
    }
    const r = await doEnd(c, env, site, body);
    return json(r, r.ok ? 200 : 400);
  } catch (e) {
    return json({ ok: false, error: msg(e) }, 502);
  }
}

async function doList(c, env, site) {
  const fields = "id,name,sku,type,status,permalink,regular_price,sale_price,date_on_sale_from_gmt,date_on_sale_to_gmt,categories,images";
  const [all, categories, camps, timezone] = await Promise.all([
    (async () => {
      const out = [];
      for (let page = 1; page <= 10; page++) {
        const { items, totalPages } = await listProducts(c, { perPage: 100, page, fields });
        out.push(...items);
        if (page >= totalPages || !items.length) break;
      }
      return out;
    })(),
    fetchCategories(c),
    listCamps(env, site),
    siteTimezone(c),
  ]);
  const products = all.map((p) => ({
    id: p.id, name: p.name, sku: p.sku || "", type: p.type, permalink: p.permalink,
    regular_price: p.regular_price || "", sale_price: p.sale_price || "",
    date_on_sale_from_gmt: p.date_on_sale_from_gmt || "", date_on_sale_to_gmt: p.date_on_sale_to_gmt || "",
    category_ids: (p.categories || []).map((x) => x.id),
    thumb: (p.images && p.images[0] && p.images[0].src) || "",
    camp: camps.get(p.id) || null,
  }));
  const orphan = [...camps.keys()].filter((id) => !all.some((p) => p.id === id));
  return {
    ok: true, site, products,
    categories: categories.map((x) => ({ id: x.id, name: x.name, parent: x.parent, count: x.count })),
    camp_count: camps.size, orphan_camp_ids: orphan, timezone,
  };
}

async function doApply(c, env, site, body) {
  const campaign = String(body.campaign || "").trim().slice(0, 60);
  if (!campaign) return { ok: false, error: "Thiếu tên đợt giảm giá" };
  const bad = validateRange(body.from, body.to);
  if (bad) return { ok: false, error: bad };
  const items = Array.isArray(body.items) ? body.items.slice(0, MAX_ITEMS) : [];
  if (!items.length) return { ok: false, error: "Chưa chọn sản phẩm" };

  const camp = {
    campaign, from: body.from, to: body.to,
    fromGmt: vnDateToGmt(body.from), toGmt: vnDateToGmt(body.to, "end"),
    catId: Number(body.category_id) || null,
  };
  const out = [];
  for (const it of items) {
    try { out.push(await applyOne(c, env, site, it, camp)); }
    catch (e) { out.push({ id: Number(it && it.id) || null, error: msg(e) }); }
  }
  return {
    ok: true, site, campaign,
    applied: out.filter((x) => x.applied).length,
    skipped: out.filter((x) => x.skipped).length,
    failed: out.filter((x) => x.error).length,
    items: out,
  };
}

async function applyOne(c, env, site, it, camp) {
  const id = Number(it && it.id);
  if (!id) return { id: null, error: "thiếu id" };
  const p = await getProductFields(c, id, P_FIELDS);
  const base = { id, name: p.name, permalink: p.permalink, type: p.type };
  const prevState = await readCamp(env, site, id);
  const curCats = (p.categories || []).map((x) => x.id);
  const cats = planCategories(curCats, camp.catId, prevState);
  const dates = { date_on_sale_from_gmt: camp.fromGmt, date_on_sale_to_gmt: camp.toGmt };
  const prevUnits = (prevState && prevState.units) || {};

  const makeState = (units, pct) => ({
    id, site, name: p.name, type: p.type, campaign: camp.campaign, from: camp.from, to: camp.to,
    category_id: cats.category_id, category_added: cats.category_added, units, pct,
    at: new Date().toISOString(),
  });

  if (p.type === "simple") {
    const plan = planPrice(p, { pct: it.pct, sale_price: it.sale_price });
    if (!plan.ok) return { ...base, skipped: plan.reason };
    const state = makeState({ [id]: { prev: choosePrev(p, prevUnits[id]), set_sale: plan.sale_price } }, plan.pct);
    await writeCamp(env, site, state); // ghi giá cũ TRƯỚC — lỗi thì dừng, chưa đụng web
    try {
      await updateProduct(c, id, { sale_price: plan.sale_price, ...dates, categories: cats.ids.map((x) => ({ id: x })) });
    } catch (e) {
      await rollbackCamp(env, site, id, prevState);
      return { ...base, error: msg(e) };
    }
    return { ...base, applied: true, regular: plan.regular, sale_price: plan.sale_price, pct: plan.pct, warnings: plan.warnings, category_added: cats.category_added };
  }

  if (p.type === "variable") {
    const vars = await listVariations(c, id);
    const units = {}, updates = [], skippedVars = [], warnings = new Set();
    for (const v of vars) {
      const plan = planPrice(v, { pct: it.pct });
      if (!plan.ok) {
        skippedVars.push(`${variationLabel(v)}: ${plan.reason}`);
        if (prevUnits[v.id]) units[v.id] = prevUnits[v.id]; // vẫn nhớ giá cũ của đợt trước
        continue;
      }
      units[v.id] = { prev: choosePrev(v, prevUnits[v.id]), set_sale: plan.sale_price };
      updates.push({ id: v.id, sale_price: plan.sale_price, ...dates });
      plan.warnings.forEach((w) => warnings.add(w));
    }
    if (!updates.length) {
      return { ...base, skipped: "không biến thể nào đặt được giá sale" + (skippedVars.length ? " — " + skippedVars.join("; ") : "") };
    }
    const state = makeState(units, Number(String(it.pct).replace(",", ".")) || null);
    await writeCamp(env, site, state);
    try {
      const r = await updateVariationsBatch(c, id, updates);
      if (r.errors.length) {
        // Hoàn nguyên các biến thể đã ghi được — không để SP nửa giảm nửa không.
        const back = r.updated.map((vid) => ({ id: vid, ...restorePayload(units[vid].prev) }));
        if (back.length) await updateVariationsBatch(c, id, back).catch(() => {});
        throw new Error(`${r.errors.length}/${updates.length} biến thể lỗi — ` + r.errors.map((x) => `#${x.id}: ${x.message}`).join(" · "));
      }
    } catch (e) {
      await rollbackCamp(env, site, id, prevState);
      return { ...base, error: msg(e) };
    }
    let catWarn = "";
    if (!sameIds(cats.ids, curCats)) {
      try { await updateProduct(c, id, { categories: cats.ids.map((x) => ({ id: x })) }); }
      catch (e) { catWarn = `giá đã đặt nhưng không gắn được danh mục: ${msg(e)}`; }
    }
    return {
      ...base, applied: true, variations_set: updates.length, variations_skipped: skippedVars,
      pct: state.pct, warnings: [...warnings, ...(catWarn ? [catWarn] : [])], category_added: cats.category_added,
    };
  }

  return { ...base, skipped: `loại sản phẩm "${p.type}" không hỗ trợ` };
}

async function doEnd(c, env, site, body) {
  const ids = (Array.isArray(body.ids) ? body.ids : []).map(Number).filter(Boolean).slice(0, MAX_ITEMS);
  if (!ids.length) return { ok: false, error: "Chưa chọn sản phẩm" };
  const out = [];
  for (const id of ids) {
    try { out.push(await endOne(c, env, site, id)); }
    catch (e) { out.push({ id, error: msg(e) }); }
  }
  return {
    ok: true, site,
    ended: out.filter((x) => x.ended).length,
    skipped: out.filter((x) => x.skipped).length,
    failed: out.filter((x) => x.error).length,
    items: out,
  };
}

async function endOne(c, env, site, id) {
  const state = await readCamp(env, site, id);
  if (!state) return { id, skipped: "SP không nằm trong đợt giảm giá nào của tool" };
  const p = await getProductFields(c, id, P_FIELDS);
  const base = { id, name: p.name, permalink: p.permalink, type: p.type };
  const units = state.units || {};
  const cats = endCategories((p.categories || []).map((x) => x.id), state);
  let restored = 0, manual = 0;

  if (p.type === "variable") {
    const vars = await listVariations(c, id);
    const back = [];
    for (const v of vars) {
      const u = units[v.id];
      if (!u) continue;
      if (endUnitDecision(v, u) === "restore") back.push({ id: v.id, ...restorePayload(u.prev) });
      else manual++;
    }
    if (back.length) {
      const r = await updateVariationsBatch(c, id, back);
      restored = r.updated.length;
      // Giữ bản ghi KV để bấm kết thúc lại được phần lỗi.
      if (r.errors.length) return { ...base, error: `${r.errors.length} biến thể chưa trả được giá — ` + r.errors.map((x) => `#${x.id}: ${x.message}`).join(" · ") };
    }
    if (cats.changed) await updateProduct(c, id, { categories: cats.ids.map((x) => ({ id: x })) });
  } else {
    const payload = {};
    const u = units[id];
    if (u) {
      if (endUnitDecision(p, u) === "restore") { Object.assign(payload, restorePayload(u.prev)); restored = 1; }
      else manual = 1;
    }
    if (cats.changed) payload.categories = cats.ids.map((x) => ({ id: x }));
    if (Object.keys(payload).length) await updateProduct(c, id, payload);
  }

  await env.INVENTORY.delete(campKey(site, id));
  return {
    ...base, ended: true, restored, manual, category_removed: cats.changed,
    note: manual ? `${manual} giá đã bị sửa tay sau khi áp đợt — giữ nguyên, không đè` : "",
  };
}
