// Render trang landing CÔNG KHAI (read-only) từ D1 cho 1 path-segment.
// Dùng chung cho route /l/<seg> (giữ tương thích) và route gốc /<seg>.
import { renderLanding } from "../api/landings/lib/renderLanding.js";
import { matchLanding } from "./landingMatch.js";

function notFound() {
  return new Response(
    "<!doctype html><meta charset=utf-8><h1>404</h1><p>Không tìm thấy landing.</p>",
    { status: 404, headers: { "Content-Type": "text/html; charset=utf-8" } }
  );
}

export async function serveLanding(env, segRaw) {
  if (!env.DB) return new Response("DB binding missing", { status: 500 });

  const match = await matchLanding(env.DB, segRaw);
  if (!match) return notFound();

  const cfg = { ...match.cfg, slug: match.slug };
  if (match.staff) cfg.staff = match.staff;
  // KHÔNG để lộ secret tích hợp / API key nhân sự ra HTML công khai
  delete cfg.integrations;
  delete cfg.routing;

  let html;
  try {
    html = renderLanding(cfg);
  } catch (err) {
    return new Response("Render error: " + String(err?.message || err), { status: 500 });
  }

  return new Response(html, {
    headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" },
  });
}
