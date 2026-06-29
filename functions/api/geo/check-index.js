// Endpoint: POST /api/geo/check-index
//
// Quét các bài đã PUBLISH, gọi Google Search Console URL Inspection API để biết
// Google đã index từng URL chưa, rồi UPSERT vào cache geo_index_status.
// /api/geo/index-stats đọc cache này ra để tính "tỉ lệ Google đã index thật".
//
// Throttle: mặc định BỎ QUA bài đã kiểm tra trong vòng `min_age_hours` (default 12h)
// để tiết kiệm quota (~2000 lệnh/ngày/property). Gửi { force: true } để kiểm lại hết.
//
// Body (JSON, optional):
//   brand          — "doscom" | "noma" | "all" (default all)
//   limit          — số URL tối đa kiểm 1 lần (default 25, max 100)
//   min_age_hours  — chỉ kiểm lại URL cũ hơn ngần này (default 12); bỏ qua nếu force
//   force          — true để kiểm lại bất kể đã kiểm gần đây
//
// Cần env GOOGLE_INDEXING_SA_JSON + service account có quyền trên property GSC.
// Xem hướng dẫn ở _utils/google-searchconsole.js.

import { getGscToken, inspectUrl, resolvePropertyForSite } from "./_utils/google-searchconsole.js";

function jsonResponse(data, status = 200) {
  return new Response(JSON.stringify(data, null, 2), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8" },
  });
}

function hostOf(u) {
  try { return new URL(u).host; } catch { return null; }
}

export async function onRequestPost(context) {
  const { request, env } = context;
  if (!env.DB) return jsonResponse({ ok: false, error: "D1 binding 'DB' missing" }, 500);

  let body = {};
  try { body = await request.json(); } catch {}

  const brand = body.brand || "all";
  const limit = Math.min(Math.max(parseInt(body.limit || "25", 10), 1), 100);
  const minAgeHours = Number.isFinite(body.min_age_hours) ? body.min_age_hours : 12;
  const force = body.force === true;
  const now = Math.floor(Date.now() / 1000);
  const cutoff = now - Math.round(minAgeHours * 3600);

  // Lấy bài published + URL + brand. Throttle bằng LEFT JOIN với cache: bỏ qua bài
  // đã kiểm trong vòng cutoff (trừ khi force).
  let brandWhere = "";
  const binds = [];
  if (brand !== "all" && ["doscom", "noma"].includes(brand)) {
    brandWhere = " AND q.brand = ?";
    binds.push(brand);
  }

  const freshClause = force ? "" : " AND (s.checked_at IS NULL OR s.checked_at < ?)";
  if (!force) binds.push(cutoff);
  binds.push(limit);

  const { results: rows } = await env.DB.prepare(
    `SELECT q.id, q.wp_post_url AS url, q.brand
     FROM geo_content_queue q
     LEFT JOIN geo_index_status s ON s.url = q.wp_post_url
     WHERE q.status = 'published' AND q.wp_post_url IS NOT NULL AND q.wp_post_url <> ''${brandWhere}${freshClause}
     ORDER BY (s.checked_at IS NULL) DESC, q.published_at DESC
     LIMIT ?`
  ).bind(...binds).all();

  if (!rows.length) {
    return jsonResponse({ ok: true, checked: 0, message: "Không có bài nào cần kiểm (đã kiểm gần đây hoặc chưa publish bài nào).", skipped_reason: force ? "no_published" : "all_fresh" });
  }

  // 1 access token dùng chung cho cả batch.
  const { token, error: tokenErr } = await getGscToken(env);
  if (tokenErr) {
    return jsonResponse({
      ok: false,
      error: `Chưa cấu hình Google Search Console: ${tokenErr}`,
      hint: "Set env GOOGLE_INDEXING_SA_JSON + thêm service account vào property GSC. Xem _utils/google-searchconsole.js.",
    }, 400);
  }

  let okCount = 0, errCount = 0, indexedCount = 0;
  const details = [];

  for (const row of rows) {
    const site = row.brand === "noma" ? "noma" : "doscom";
    const host = hostOf(row.url);
    const siteUrl = resolvePropertyForSite(site, host, env);

    const r = await inspectUrl(token, { inspectionUrl: row.url, siteUrl });

    if (r.ok) {
      okCount += 1;
      if (r.indexed) indexedCount += 1;
      await env.DB.prepare(`
        INSERT INTO geo_index_status
          (url, article_id, site, indexed, verdict, coverage_state, last_crawl_time, robots_txt_state, page_fetch_state, error_msg, checked_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, ?)
        ON CONFLICT(url) DO UPDATE SET
          article_id=excluded.article_id, site=excluded.site, indexed=excluded.indexed,
          verdict=excluded.verdict, coverage_state=excluded.coverage_state,
          last_crawl_time=excluded.last_crawl_time, robots_txt_state=excluded.robots_txt_state,
          page_fetch_state=excluded.page_fetch_state, error_msg=NULL, checked_at=excluded.checked_at
      `).bind(
        row.url, row.id, site, r.indexed, r.verdict, r.coverage_state,
        r.last_crawl_time, r.robots_txt_state, r.page_fetch_state, now
      ).run();
      details.push({ url: row.url, indexed: !!r.indexed, verdict: r.verdict, coverage_state: r.coverage_state });
    } else {
      errCount += 1;
      // Lưu lỗi để debug nhưng KHÔNG đánh dấu indexed.
      await env.DB.prepare(`
        INSERT INTO geo_index_status (url, article_id, site, indexed, verdict, error_msg, checked_at)
        VALUES (?, ?, ?, 0, 'error', ?, ?)
        ON CONFLICT(url) DO UPDATE SET
          verdict='error', error_msg=excluded.error_msg, checked_at=excluded.checked_at
      `).bind(row.url, row.id, site, String(r.error).slice(0, 500), now).run();
      details.push({ url: row.url, error: r.error });
    }
  }

  return jsonResponse({
    ok: true,
    checked: rows.length,
    success: okCount,
    errors: errCount,
    indexed: indexedCount,
    details,
  });
}
