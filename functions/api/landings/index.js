// /api/landings  — danh sách + tạo mới landing (admin-only qua session middleware).
// GET  -> [{id, slug, title, status, updated_at, published_at}]
// POST -> tạo landing mới {slug, title, config} -> trả bản ghi vừa tạo.

function json(obj, status = 200) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8" },
  });
}

// slug hợp lệ: chữ thường + số + gạch ngang, 1..40 ký tự, không bắt đầu/kết thúc bằng gạch.
export function validSlug(s) {
  return typeof s === "string" && /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(s) && s.length <= 40;
}

export async function onRequestGet({ env }) {
  if (!env.DB) return json({ ok: false, error: "D1 binding 'DB' missing" }, 500);
  const { results } = await env.DB.prepare(
    "SELECT id, slug, title, status, created_at, updated_at, published_at FROM landings ORDER BY updated_at DESC"
  ).all();
  return json({ ok: true, landings: results || [] });
}

export async function onRequestPost({ request, env }) {
  if (!env.DB) return json({ ok: false, error: "D1 binding 'DB' missing" }, 500);

  let d;
  try { d = await request.json(); } catch { return json({ ok: false, error: "invalid_json" }, 400); }

  const slug = String(d.slug || "").trim().toLowerCase();
  const title = String(d.title || "").trim();
  if (!validSlug(slug)) return json({ ok: false, error: "slug không hợp lệ (chỉ a-z, 0-9, gạch ngang)" }, 400);
  if (!title) return json({ ok: false, error: "thiếu tiêu đề" }, 400);

  let configStr;
  try { configStr = JSON.stringify(d.config || {}); } catch { return json({ ok: false, error: "config không hợp lệ" }, 400); }

  // slug trùng?
  const dup = await env.DB.prepare("SELECT id FROM landings WHERE slug = ?").bind(slug).first();
  if (dup) return json({ ok: false, error: "slug đã tồn tại" }, 409);

  const now = Math.floor(Date.now() / 1000);
  try {
    const res = await env.DB.prepare(
      "INSERT INTO landings (slug, title, status, config, created_at, updated_at) VALUES (?, ?, 'draft', ?, ?, ?)"
    ).bind(slug, title, configStr, now, now).run();
    const id = res.meta?.last_row_id;
    return json({ ok: true, landing: { id, slug, title, status: "draft", config: d.config || {}, created_at: now, updated_at: now } });
  } catch (err) {
    return json({ ok: false, error: String(err?.message || err).slice(0, 300) }, 500);
  }
}
