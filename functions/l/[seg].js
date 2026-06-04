// GET /l/<seg> — trang landing CÔNG KHAI render từ D1 (Landing Builder).
// seg = slug, hoặc slug+hậu tố Duy/Phương Nam (config.routing.duySuffix / pnSuffix).
// Public read-only (middleware bypass /l/). Order submit hoàn thiện ở Phase 3.

import { renderLanding } from "../api/landings/lib/renderLanding.js";

function notFound() {
  return new Response("<!doctype html><meta charset=utf-8><h1>404</h1><p>Không tìm thấy landing.</p>", {
    status: 404, headers: { "Content-Type": "text/html; charset=utf-8" },
  });
}

export async function onRequestGet({ env, params }) {
  if (!env.DB) return new Response("DB binding missing", { status: 500 });
  const seg = String(params.seg || "").trim();
  if (!seg) return notFound();

  let rows;
  try {
    rows = await env.DB.prepare("SELECT id, slug, status, config FROM landings").all();
  } catch (err) {
    return new Response("DB error: " + String(err?.message || err), { status: 500 });
  }
  const list = (rows && rows.results) || [];

  let match = null;
  for (const L of list) {
    let cfg;
    try { cfg = JSON.parse(L.config || "{}"); } catch { cfg = {}; }
    const r = (cfg && cfg.routing) || {};
    if (seg === L.slug) { match = { cfg, slug: L.slug, staff: cfg.staff || "" }; break; }
    // Danh sách nhân sự động: routing.staff = [{name, suffix}]
    const staffArr = Array.isArray(r.staff) ? r.staff : [];
    const hit = staffArr.find((p) => p && p.suffix && seg === (L.slug + p.suffix));
    if (hit) { match = { cfg, slug: L.slug, staff: hit.key || hit.name || "" }; break; }
    // Back-compat config cũ
    if (r.duySuffix && seg === (L.slug + r.duySuffix)) { match = { cfg, slug: L.slug, staff: "duy" }; break; }
    if (r.pnSuffix && seg === (L.slug + r.pnSuffix)) { match = { cfg, slug: L.slug, staff: "pn" }; break; }
  }
  if (!match) return notFound();

  const cfg = { ...match.cfg, slug: match.slug };
  if (match.staff) cfg.staff = match.staff;
  // KHÔNG để lộ secret tích hợp ra HTML công khai
  delete cfg.integrations;

  let html;
  try { html = renderLanding(cfg); } catch (err) {
    return new Response("Render error: " + String(err?.message || err), { status: 500 });
  }

  return new Response(html, {
    headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" },
  });
}
