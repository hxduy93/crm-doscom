// GET /api/messenger/conversations?page_id=…&days=30
// Khách đã nhắn Page trong N ngày gần đây + lần cuối KHÁCH nhắn (để chia nhóm 24h / 7d / cũ).
import { getIdentity } from "../../lib/access.js";
import { rutHoiThoai } from "../../lib/nhan-tin-lai.js";
import { json, graph, pageToken, giaiThichLoi, GRAPH } from "./_graph.js";

// 40 trang × 50 = tối đa 2.000 hội thoại/lần — giữ dưới giới hạn 50 subrequest của Workers.
const MAX_TRANG = 40;

export async function onRequestGet(context) {
  const id = await getIdentity(context);
  if (!id.all) return json({ ok: false, error: "Chỉ quản trị viên được dùng menu này" }, 403);
  const u = new URL(context.request.url);
  const pageId = (u.searchParams.get("page_id") || "").replace(/\D/g, "");
  const days = Math.min(365, Math.max(1, Number(u.searchParams.get("days")) || 30));
  if (!pageId) return json({ ok: false, error: "Thiếu page_id" }, 400);
  const cutoff = Date.now() - days * 86400000;

  try {
    const token = await pageToken(context.env, pageId);
    const rows = [];
    let truncated = false;
    let next = `${GRAPH}/${pageId}/conversations?${new URLSearchParams({
      platform: "messenger",
      // 10 tin gần nhất là đủ tìm tin cuối của khách trong gần như mọi hội thoại.
      fields: "id,updated_time,snippet,participants,messages.limit(10){from,created_time}",
      limit: "50",
      access_token: token,
    })}`;
    for (let i = 0; next; i++) {
      if (i >= MAX_TRANG) { truncated = true; break; }
      const d = await graph(next);
      let het = false;
      for (const c of d.data || []) {
        // Hội thoại xếp mới → cũ theo updated_time: gặp cái cũ hơn mốc là dừng.
        if (Date.parse(c.updated_time) < cutoff) { het = true; break; }
        const r = rutHoiThoai(c, pageId);
        if (r.psid) rows.push(r);
      }
      next = het ? null : d.paging && d.paging.next;
    }
    return json({ ok: true, page_id: pageId, days, truncated, count: rows.length, rows });
  } catch (e) {
    return json({ ok: false, error: giaiThichLoi(e) }, 502);
  }
}
