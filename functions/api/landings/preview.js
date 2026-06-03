// /api/landings/preview — render config (chưa cần lưu) thành HTML để xem trước trong iframe.
// POST body: config object (hoặc {config}). Trả raw HTML (text/html) -> UI gán iframe.srcdoc.
// Route đặt tên chính xác nên thắng dynamic [id].js.

import { renderLanding } from "./lib/renderLanding.js";

export async function onRequestPost({ request }) {
  let d;
  try { d = await request.json(); } catch {
    return new Response("invalid json", { status: 400, headers: { "Content-Type": "text/plain" } });
  }
  const config = d && d.config ? d.config : d;
  let html;
  try {
    html = renderLanding(config || {});
  } catch (err) {
    return new Response("render error: " + String(err && err.message || err), {
      status: 500, headers: { "Content-Type": "text/plain; charset=utf-8" },
    });
  }
  return new Response(html, { headers: { "Content-Type": "text/html; charset=utf-8" } });
}
