// Endpoint: GET /api/geo/index-stats
//
// Tổng hợp 2 tỉ lệ index của các bài đã PUBLISH (geo_content_queue.status='published'):
//   1. submit_rate  — % bài đã ĐƯỢC BÁO index thành công (Google Indexing API / IndexNow).
//                     Nguồn: geo_index_log (ghi lúc publish-wp). KHÔNG cần setup thêm.
//   2. indexed_rate — % bài Google THỰC SỰ đã index (Search Console URL Inspection).
//                     Nguồn: cache geo_index_status (do /api/geo/check-index cập nhật).
//                     Nếu chưa kiểm tra bài nào → checked=0, FE hiển thị "chưa kiểm tra".
//
// Query params:
//   brand — "doscom" | "noma" | "all" (default all)
//
// KHÔNG bịa số liệu: rate luôn kèm tử/mẫu để người đọc biết đã phủ bao nhiêu.

function jsonResponse(data, status = 200) {
  return new Response(JSON.stringify(data, null, 2), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8" },
  });
}

// Hàm tính thuần (test được) — nhận dữ liệu đã gom từ D1, trả số liệu tỉ lệ.
//   published: [{ id, url }]                        — bài đã publish (có wp_post_url)
//   logAgg:    [{ article_id, google_ok, indexnow_ok }] — đã gom MAX theo article_id
//   statusAgg: [{ article_id, indexed }]            — cache GSC, đã gom theo article_id
export function computeIndexStats({ published, logAgg, statusAgg }) {
  const total = published.length;

  const logBy = new Map();
  for (const r of logAgg || []) logBy.set(r.article_id, r);
  const statusBy = new Map();
  for (const r of statusAgg || []) statusBy.set(r.article_id, r);

  let googleOk = 0, indexnowOk = 0, anyOk = 0;
  let checked = 0, indexed = 0;

  for (const a of published) {
    const log = logBy.get(a.id);
    if (log) {
      const g = log.google_ok ? 1 : 0;
      const n = log.indexnow_ok ? 1 : 0;
      googleOk += g;
      indexnowOk += n;
      if (g || n) anyOk += 1;
    }
    const st = statusBy.get(a.id);
    if (st) {
      checked += 1;
      if (st.indexed) indexed += 1;
    }
  }

  const rate = (num) => (total > 0 ? Number((num / total).toFixed(4)) : null);

  return {
    total_published: total,
    submit: {
      google_ok: googleOk,
      indexnow_ok: indexnowOk,
      any_ok: anyOk,
      rate: rate(anyOk),                 // % bài đã báo được ít nhất 1 search engine
      google_rate: rate(googleOk),
      indexnow_rate: rate(indexnowOk),
    },
    indexed: {
      checked,                           // số bài đã gọi Search Console kiểm tra
      indexed,                           // số bài Google đã index thật
      rate: rate(indexed),               // mẫu = tổng bài published (chưa kiểm tra coi như chưa index)
      coverage: rate(checked),           // % bài đã được kiểm tra (để biết số liệu đủ tin chưa)
    },
  };
}

export async function onRequestGet(context) {
  const { request, env } = context;
  if (!env.DB) return jsonResponse({ error: "D1 binding 'DB' missing" }, 500);

  const url = new URL(request.url);
  const brand = url.searchParams.get("brand") || "all";

  let brandWhere = "";
  const binds = [];
  if (brand !== "all" && ["doscom", "noma"].includes(brand)) {
    brandWhere = " AND brand = ?";
    binds.push(brand);
  }

  // Bài đã publish + có URL thật.
  const { results: published } = await env.DB.prepare(
    `SELECT id, wp_post_url AS url FROM geo_content_queue
     WHERE status = 'published' AND wp_post_url IS NOT NULL AND wp_post_url <> ''${brandWhere}`
  ).bind(...binds).all();

  if (!published.length) {
    return jsonResponse(computeIndexStats({ published: [], logAgg: [], statusAgg: [] }));
  }

  // Gom log submit: đã TỪNG báo thành công (MAX) theo article.
  const { results: logAgg } = await env.DB.prepare(
    `SELECT article_id,
            MAX(google_ok)   AS google_ok,
            MAX(indexnow_ok) AS indexnow_ok
     FROM geo_index_log GROUP BY article_id`
  ).all();

  // Cache trạng thái index thật theo article.
  const { results: statusAgg } = await env.DB.prepare(
    `SELECT article_id, MAX(indexed) AS indexed
     FROM geo_index_status WHERE article_id IS NOT NULL GROUP BY article_id`
  ).all();

  const stats = computeIndexStats({ published, logAgg, statusAgg });

  // Lần kiểm tra GSC gần nhất (để FE hiển thị "cập nhật lúc ...").
  const lastCheck = await env.DB.prepare(
    `SELECT MAX(checked_at) AS last FROM geo_index_status`
  ).first();
  stats.indexed.last_checked_at = lastCheck?.last || null;

  return jsonResponse(stats);
}
