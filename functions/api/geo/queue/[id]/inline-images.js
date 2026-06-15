// Endpoint: GET /api/geo/queue/:id/inline-images
//
// List inline images đã gen cho 1 article — UI dùng để render preview grid trong modal.
// Include image_base64 nếu chưa publish (default), bỏ qua khi đã có wp_media_id (đã upload).

function jsonResponse(data, status = 200) {
  return new Response(JSON.stringify(data, null, 2), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8" },
  });
}

export async function onRequestGet(context) {
  const { env, params, request } = context;
  if (!env.DB) return jsonResponse({ error: "D1 binding 'DB' missing" }, 500);

  const articleId = params.id;
  if (!articleId) return jsonResponse({ error: "Missing article id" }, 400);

  const url = new URL(request.url);
  const includeBase64 = url.searchParams.get("include_base64") !== "0"; // default include

  const cols = includeBase64
    ? "id, position, after_heading, prompt, alt, image_base64, image_url, wp_media_id, width, height, steps, neurons_used, cost_usd, created_at"
    : "id, position, after_heading, prompt, alt, image_url, wp_media_id, width, height, steps, neurons_used, cost_usd, created_at";

  const { results } = await env.DB.prepare(
    `SELECT ${cols} FROM geo_inline_images WHERE article_id = ? ORDER BY position ASC`
  ).bind(articleId).all();

  return jsonResponse({
    article_id: articleId,
    count: results?.length || 0,
    items: results || [],
  });
}

export async function onRequestDelete(context) {
  const { env, params, request } = context;
  if (!env.DB) return jsonResponse({ error: "D1 binding 'DB' missing" }, 500);

  const articleId = params.id;
  if (!articleId) return jsonResponse({ error: "Missing article id" }, 400);

  const url = new URL(request.url);
  const position = url.searchParams.get("position");

  let sql, binds;
  if (position !== null && position !== "") {
    sql = `DELETE FROM geo_inline_images WHERE article_id = ? AND position = ?`;
    binds = [articleId, parseInt(position)];
  } else {
    sql = `DELETE FROM geo_inline_images WHERE article_id = ?`;
    binds = [articleId];
  }

  const result = await env.DB.prepare(sql).bind(...binds).run();
  return jsonResponse({ deleted: true, article_id: articleId, position });
}
