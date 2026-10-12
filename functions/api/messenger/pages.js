// GET /api/messenger/pages — fanpage token quản trị CÓ quyền nhắn tin (không kèm token).
import { getIdentity } from "../../lib/access.js";
import { json, dsPage, giaiThichLoi } from "./_graph.js";

export async function onRequestGet(context) {
  const id = await getIdentity(context);
  // Nhắn tin hàng loạt thay mặt Page = việc của quản trị, staff không dùng.
  if (!id.all) return json({ ok: false, error: "Chỉ quản trị viên được dùng menu này" }, 403);
  try {
    return json({ ok: true, pages: await dsPage(context.env, false) });
  } catch (e) {
    return json({ ok: false, error: giaiThichLoi(e) }, 502);
  }
}
