// /api/landings/:id — đọc / sửa / xoá 1 landing (admin-only qua session middleware).
// GET    -> bản ghi đầy đủ (config đã parse)
// PUT    -> cập nhật {slug?, title?, status?, config?}
// DELETE -> xoá

import { validSlug } from "./index.js";

function json(obj, status = 200) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8" },
  });
}

function parseConfig(str) {
  try { return JSON.parse(str || "{}"); } catch { return {}; }
}

export async function onRequestGet({ env, params }) {
  if (!env.DB) return json({ ok: false, error: "D1 binding 'DB' missing" }, 500);
  const id = Number(params.id);
  if (!Number.isInteger(id)) return json({ ok: false, error: "id không hợp lệ" }, 400);

  const row = await env.DB.prepare(
    "SELECT id, slug, title, status, config, created_at, updated_at, published_at FROM landings WHERE id = ?"
  ).bind(id).first();
  if (!row) return json({ ok: false, error: "không tìm thấy landing" }, 404);

  row.config = parseConfig(row.config);
  return json({ ok: true, landing: row });
}

export async function onRequestPut({ request, env, params }) {
  if (!env.DB) return json({ ok: false, error: "D1 binding 'DB' missing" }, 500);
  const id = Number(params.id);
  if (!Number.isInteger(id)) return json({ ok: false, error: "id không hợp lệ" }, 400);

  let d;
  try { d = await request.json(); } catch { return json({ ok: false, error: "invalid_json" }, 400); }

  const existing = await env.DB.prepare("SELECT id FROM landings WHERE id = ?").bind(id).first();
  if (!existing) return json({ ok: false, error: "không tìm thấy landing" }, 404);

  const sets = [];
  const binds = [];

  if (d.slug !== undefined) {
    const slug = String(d.slug).trim().toLowerCase();
    if (!validSlug(slug)) return json({ ok: false, error: "slug không hợp lệ" }, 400);
    const dup = await env.DB.prepare("SELECT id FROM landings WHERE slug = ? AND id != ?").bind(slug, id).first();
    if (dup) return json({ ok: false, error: "slug đã tồn tại" }, 409);
    sets.push("slug = ?"); binds.push(slug);
  }
  if (d.title !== undefined) {
    const title = String(d.title).trim();
    if (!title) return json({ ok: false, error: "thiếu tiêu đề" }, 400);
    sets.push("title = ?"); binds.push(title);
  }
  if (d.status !== undefined) {
    const status = String(d.status);
    if (status !== "draft" && status !== "published") return json({ ok: false, error: "status không hợp lệ" }, 400);
    sets.push("status = ?"); binds.push(status);
  }
  if (d.config !== undefined) {
    let configStr;
    try { configStr = JSON.stringify(d.config); } catch { return json({ ok: false, error: "config không hợp lệ" }, 400); }
    sets.push("config = ?"); binds.push(configStr);
  }

  if (!sets.length) return json({ ok: false, error: "không có gì để cập nhật" }, 400);

  sets.push("updated_at = ?"); binds.push(Math.floor(Date.now() / 1000));
  binds.push(id);

  try {
    await env.DB.prepare(`UPDATE landings SET ${sets.join(", ")} WHERE id = ?`).bind(...binds).run();
    return json({ ok: true });
  } catch (err) {
    return json({ ok: false, error: String(err?.message || err).slice(0, 300) }, 500);
  }
}

export async function onRequestDelete({ env, params }) {
  if (!env.DB) return json({ ok: false, error: "D1 binding 'DB' missing" }, 500);
  const id = Number(params.id);
  if (!Number.isInteger(id)) return json({ ok: false, error: "id không hợp lệ" }, 400);

  try {
    await env.DB.prepare("DELETE FROM landings WHERE id = ?").bind(id).run();
    return json({ ok: true });
  } catch (err) {
    return json({ ok: false, error: String(err?.message || err).slice(0, 300) }, 500);
  }
}
