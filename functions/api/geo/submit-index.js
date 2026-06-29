// Endpoint: POST /api/geo/submit-index
//
// Chủ động "báo index" các bài đã PUBLISH: ping Google Indexing API + IndexNow
// (Bing/Yandex), ghi kết quả vào geo_index_log. Đây là nguồn của "tỉ lệ đã báo
// index (submit)" ở /api/geo/index-stats.
//
// Bài đăng mới đã tự được báo lúc publish (publish-wp.js → notifySearchEngines).
// Endpoint này để báo cho các bài CŨ (đăng trước khi cấu hình credential) hoặc
// báo lại thủ công.
//
// Body (JSON, optional):
//   brand          — "doscom" | "noma" | "all" (default all)
//   limit          — số URL tối đa 1 lần (default 25, max 100)
//   min_age_hours  — bỏ qua bài đã báo Google thành công trong ngần này (default 24); bỏ qua nếu force
//   force          — true để báo lại bất kể đã báo gần đây
//
// Cần env GOOGLE_INDEXING_SA_JSON + service account có quyền OWNER trên property GSC
// (Indexing API bắt buộc Owner, khác với URL Inspection chỉ cần Full).

import { submitUrlToGoogle } from "./_utils/google-indexing.js";
import { submitUrlToIndexNow } from "./_utils/indexnow.js";
import { parseServiceAccount } from "./_utils/google-auth.js";

function jsonResponse(data, status = 200) {
  return new Response(JSON.stringify(data, null, 2), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8" },
  });
}

export async function onRequestPost(context) {
  const { env } = context;
  if (!env.DB) return jsonResponse({ ok: false, error: "D1 binding 'DB' missing" }, 500);

  // Indexing API bắt buộc service account → fail sớm với thông báo rõ.
  const { error: saErr } = parseServiceAccount(env);
  if (saErr) {
    return jsonResponse({
      ok: false,
      error: `Chưa cấu hình Google Indexing: ${saErr}`,
      hint: "Set env GOOGLE_INDEXING_SA_JSON + service account phải là OWNER của property GSC.",
    }, 400);
  }

  let body = {};
  try { body = await context.request.json(); } catch {}

  const brand = body.brand || "all";
  const limit = Math.min(Math.max(parseInt(body.limit || "25", 10), 1), 100);
  const minAgeHours = Number.isFinite(body.min_age_hours) ? body.min_age_hours : 24;
  const force = body.force === true;
  const now = Math.floor(Date.now() / 1000);
  const cutoff = now - Math.round(minAgeHours * 3600);

  let brandWhere = "";
  const binds = [];
  if (brand !== "all" && ["doscom", "noma"].includes(brand)) {
    brandWhere = " AND q.brand = ?";
    binds.push(brand);
  }

  // Throttle: bỏ qua bài đã báo Google thành công trong vòng cutoff (trừ khi force).
  const freshClause = force
    ? ""
    : " AND NOT EXISTS (SELECT 1 FROM geo_index_log l WHERE l.article_id = q.id AND l.google_ok = 1 AND l.created_at > ?)";
  if (!force) binds.push(cutoff);
  binds.push(limit);

  const { results: rows } = await env.DB.prepare(
    `SELECT q.id, q.wp_post_url AS url, q.brand
     FROM geo_content_queue q
     WHERE q.status = 'published' AND q.wp_post_url IS NOT NULL AND q.wp_post_url <> ''${brandWhere}${freshClause}
     ORDER BY q.published_at DESC
     LIMIT ?`
  ).bind(...binds).all();

  if (!rows.length) {
    return jsonResponse({ ok: true, submitted: 0, message: "Không có bài nào cần báo (đã báo gần đây hoặc chưa publish bài nào)." });
  }

  let googleOk = 0, indexnowOk = 0;
  const details = [];

  for (const row of rows) {
    const [google, indexnow] = await Promise.all([
      submitUrlToGoogle(env, row.url, "URL_UPDATED"),
      submitUrlToIndexNow(env, row.url),
    ]);
    if (google.ok) googleOk += 1;
    if (indexnow.ok) indexnowOk += 1;

    await env.DB.prepare(`
      INSERT INTO geo_index_log (article_id, url, google_ok, google_msg, indexnow_ok, indexnow_msg, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).bind(
      row.id, row.url,
      google.ok ? 1 : 0,
      (google.ok ? "ok" : (google.error || "")).slice(0, 500),
      indexnow.ok ? 1 : 0,
      (indexnow.ok ? `${indexnow.status} ok` : (indexnow.error || "")).slice(0, 500),
      now
    ).run();

    details.push({ url: row.url, google: google.ok, indexnow: indexnow.ok, google_err: google.ok ? undefined : google.error });
  }

  return jsonResponse({
    ok: true,
    submitted: rows.length,
    google_ok: googleOk,
    indexnow_ok: indexnowOk,
    details,
  });
}
