// GET /api/lark/tables?url=<URL Lark>   (hoặc ?wiki=<node_token> / ?base=<app_token>)
// Liệt kê các bảng trong 1 Lark Base — dùng để DÒ table_id khi mới nối Base mới.
//
// Cách dùng dễ nhất: dán NGUYÊN URL trên trình duyệt khi đang mở Base.
//   /api/lark/tables?url=https://doscom-holdings.sg.larksuite.com/wiki/JBVv...?table=tbl...
// Bỏ trống hết → dùng env LARK_WIKI_TOKEN / LARK_BASE_TOKEN.
//
// Trả: { ok, base, title, count, tables: [{ table_id, name, revision }] }
//
// Endpoint nằm sau Cloudflare Access nên không gate thêm token.

import { listTables, resolveAppToken } from "../../lib/lark.js";

function json(obj, status = 200) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8" },
  });
}

export async function onRequestGet(context) {
  const { request, env } = context;
  const q = new URL(request.url).searchParams;

  const input = {
    url: q.get("url") || undefined,
    wiki: q.get("wiki") || env.LARK_WIKI_TOKEN || undefined,
    base: q.get("base") || env.LARK_BASE_TOKEN || undefined,
  };
  if (!input.url && !input.wiki && !input.base) {
    return json({
      ok: false,
      error: "Thiếu nguồn Base. Truyền ?url=<URL Lark> (dễ nhất), hoặc ?wiki=<node_token> / ?base=<app_token>.",
    }, 400);
  }

  try {
    const { appToken, title } = await resolveAppToken(env, env.INVENTORY, input);
    const tables = await listTables(env, env.INVENTORY, appToken);
    return json({ ok: true, base: appToken, title, count: tables.length, tables });
  } catch (e) {
    return json({ ok: false, error: String(e.message || e), code: e.code ?? null }, 502);
  }
}
