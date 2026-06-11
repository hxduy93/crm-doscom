// Khớp 1 path-segment với 1 landing trong D1 (theo slug landing, hoặc đường dẫn/hậu tố
// nhân sự tự điền). Trả { cfg, slug, staff } hoặc null.
// Dùng chung cho: route /l/<seg>, route gốc /<seg>, và _middleware (quyết định public).
// FAIL-SAFE: lỗi DB / không khớp -> trả null (middleware sẽ gate như bình thường).
export async function matchLanding(db, segRaw) {
  const seg = String(segRaw || "").trim();
  if (!seg || !db) return null;

  let rows;
  try {
    rows = await db.prepare("SELECT id, slug, status, config FROM landings").all();
  } catch {
    return null;
  }
  const list = (rows && rows.results) || [];

  for (const L of list) {
    let cfg;
    try { cfg = JSON.parse(L.config || "{}"); } catch { cfg = {}; }
    const r = (cfg && cfg.routing) || {};

    // slug landing (trang gốc, không gắn nhân sự)
    if (seg === L.slug) return { cfg, slug: L.slug, staff: cfg.staff || "" };

    // Danh sách nhân sự động: routing.staff = [{name, suffix}] — suffix = TOÀN BỘ đường dẫn
    const staffArr = Array.isArray(r.staff) ? r.staff : [];
    const hit = staffArr.find((p) => p && p.suffix && seg === p.suffix);
    if (hit) return { cfg, slug: L.slug, staff: hit.key || hit.name || "" };

    // Back-compat config cũ (slug + hậu tố)
    if (r.duySuffix && seg === (L.slug + r.duySuffix)) return { cfg, slug: L.slug, staff: "duy" };
    if (r.pnSuffix && seg === (L.slug + r.pnSuffix)) return { cfg, slug: L.slug, staff: "pn" };
  }
  return null;
}
