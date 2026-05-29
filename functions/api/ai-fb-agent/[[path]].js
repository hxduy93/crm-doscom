// Proxy /api/ai-fb-agent/* → FB Ads Auto Agent Worker
// Tránh CORS + giấu worker auth key khỏi browser. Required env vars:
//   AI_FB_AGENT_WORKER_URL  — vd "https://fb-ads-auto-agent.YOUR_SUBDOMAIN.workers.dev"
//   AI_FB_AGENT_API_KEY     — last 8 chars của ANTHROPIC_API_KEY của worker (auth gate)
// Set qua Cloudflare Pages → Settings → Environment variables.

import { verifySession, hasTestBypass } from "../../_middleware.js";

const SESSION_COOKIE = "doscom_session";

export async function onRequest(context) {
  const { request, env, params } = context;

  if (!hasTestBypass(request, env)) {
    const cookie = request.headers.get("Cookie") || "";
    const session = await verifySession(cookie, env, SESSION_COOKIE);
    if (!session) {
      return new Response(JSON.stringify({ error: "unauthorized" }), {
        status: 401,
        headers: { "Content-Type": "application/json" },
      });
    }
  }

  const workerUrl = env.AI_FB_AGENT_WORKER_URL;
  const apiKey = env.AI_FB_AGENT_API_KEY;
  if (!workerUrl) {
    return new Response(
      JSON.stringify({
        error: "AI_FB_AGENT_WORKER_URL chưa set trong Cloudflare Pages env vars",
        configured: false,
      }),
      { status: 503, headers: { "Content-Type": "application/json" } }
    );
  }

  const slug = Array.isArray(params.path) ? params.path.join("/") : params.path || "";
  const url = new URL(`${workerUrl.replace(/\/$/, "")}/${slug}`);
  const reqUrl = new URL(request.url);
  for (const [k, v] of reqUrl.searchParams) url.searchParams.set(k, v);
  if (apiKey && (slug === "run" || slug === "")) {
    url.searchParams.set("key", apiKey);
  }

  try {
    const upstream = await fetch(url.toString(), {
      method: request.method,
      headers: { "Content-Type": request.headers.get("Content-Type") || "application/json" },
      body: ["GET", "HEAD"].includes(request.method) ? undefined : await request.text(),
    });
    const body = await upstream.text();
    return new Response(body, {
      status: upstream.status,
      headers: {
        "Content-Type": upstream.headers.get("Content-Type") || "application/json",
        "Cache-Control": "no-store",
      },
    });
  } catch (e) {
    return new Response(
      JSON.stringify({ error: `proxy_failed: ${e.message}`, worker_url: workerUrl }),
      { status: 502, headers: { "Content-Type": "application/json" } }
    );
  }
}
