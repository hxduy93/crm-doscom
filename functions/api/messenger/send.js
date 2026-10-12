// POST /api/messenger/send
// { page_id, text, human_agent:bool, template:{name,language,params}|null,
//   items:[{psid,name,last_customer}] }  — tối đa 25 khách/lần, trình duyệt tự chia lô.
// Nhóm của từng khách TÍNH LẠI ở server từ last_customer — không tin nhãn trình duyệt gửi.
import { getIdentity } from "../../lib/access.js";
import { phanNhom, taoPayload } from "../../lib/nhan-tin-lai.js";
import { json, graph, pageToken, giaiThichLoi } from "./_graph.js";

const MAX_LO = 25;

export async function onRequestPost(context) {
  const id = await getIdentity(context);
  if (!id.all) return json({ ok: false, error: "Chỉ quản trị viên được dùng menu này" }, 403);
  let b;
  try { b = await context.request.json(); } catch { return json({ ok: false, error: "Body không phải JSON" }, 400); }
  const pageId = String(b.page_id || "").replace(/\D/g, "");
  const items = Array.isArray(b.items) ? b.items.slice(0, MAX_LO) : [];
  if (!pageId || !items.length) return json({ ok: false, error: "Thiếu page_id hoặc danh sách khách" }, 400);

  let token;
  try { token = await pageToken(context.env, pageId); }
  catch (e) { return json({ ok: false, error: giaiThichLoi(e) }, 502); }

  const opts = { text: b.text || "", humanAgent: b.human_agent === true, template: b.template || null };
  const results = [];
  let stop = "";
  for (const it of items) {
    const nhom = phanNhom(it.last_customer);
    const p = taoPayload({ psid: String(it.psid || ""), name: it.name || "" }, nhom, opts);
    if (p.skip) { results.push({ psid: it.psid, ok: false, skipped: true, nhom, error: p.skip }); continue; }
    try {
      const r = await graph(`/${pageId}/messages`, { token, method: "POST", body: p.body });
      results.push({ psid: it.psid, ok: true, nhom, message_id: r.message_id });
    } catch (e) {
      results.push({ psid: it.psid, ok: false, nhom, error: giaiThichLoi(e) });
      // Bị giới hạn tốc độ / token chết thì gửi tiếp chỉ làm nặng thêm → dừng cả đợt.
      if ([4, 32, 613, 190].includes(Number(e.code))) { stop = giaiThichLoi(e); break; }
    }
  }
  return json({ ok: true, stop: stop || undefined, results });
}
