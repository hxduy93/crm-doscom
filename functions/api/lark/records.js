// GET /api/lark/records?url=<URL Lark>&limit=<n>&fields=a,b,c
//   (hoặc ?wiki=<node_token> / ?base=<app_token> kèm &table=<table_id>)
// Đọc bản ghi 1 bảng trong Lark Base.
//
// Cách dùng dễ nhất: dán NGUYÊN URL trên trình duyệt khi đang mở đúng bảng cần đọc —
// table_id và view_id tự lấy từ URL, khỏi khai thêm.
//
// Params:
//   url    URL Lark (.../wiki/<token>?table=tbl...&view=vew...) — tiện nhất
//   wiki   node token nếu Base nằm trong Wiki
//   base   app_token nếu Base độc lập
//   table  table_id — bắt buộc khi URL không kèm ?table=
//   view   view_id — lọc theo view có sẵn (mặc định lấy từ URL nếu có)
//   limit  số bản ghi tối đa (mặc định 500, trần 5000 — xem MAX_PAGES trong lib/lark.js)
//   fields danh sách cột ngăn bằng dấu phẩy — chỉ lấy cột cần cho nhẹ
//
// Trả: { ok, base, table, count, total, has_more, records: [{ record_id, fields }] }
//   has_more = true → còn dữ liệu chưa lấy hết, tăng limit hoặc lọc bớt bằng view/fields.
//
// Endpoint nằm sau Cloudflare Access nên không gate thêm token.

import { listRecords, resolveAppToken } from "../../lib/lark.js";

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
    const resolved = await resolveAppToken(env, env.INVENTORY, input);

    // table/view: ưu tiên param khai tay, sau đó tới cái bóc được từ URL, cuối cùng là env.
    const tableId = q.get("table") || resolved.tableId || env.LARK_TABLE_ID;
    const viewId = q.get("view") || resolved.viewId || undefined;
    if (!tableId) {
      return json({
        ok: false,
        error: "Thiếu table_id. Thêm &table=<table_id>, hoặc dùng URL có sẵn ?table= (dò bằng /api/lark/tables).",
      }, 400);
    }

    const fieldsRaw = q.get("fields");
    const out = await listRecords(env, env.INVENTORY, resolved.appToken, tableId, {
      maxRecords: Number(q.get("limit")) || 500,
      viewId,
      fieldNames: fieldsRaw ? fieldsRaw.split(",").map((s) => s.trim()).filter(Boolean) : undefined,
    });

    return json({
      ok: true,
      base: resolved.appToken,
      table: tableId,
      count: out.records.length,
      total: out.total,
      has_more: out.has_more,
      records: out.records,
    });
  } catch (e) {
    return json({ ok: false, error: String(e.message || e), code: e.code ?? null }, 502);
  }
}
