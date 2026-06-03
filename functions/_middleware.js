// Google OAuth gate for Cloudflare Pages
// Env vars required: GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, ALLOWED_EMAILS, SESSION_SECRET

const SESSION_COOKIE = "doscom_session";
const SESSION_MAX_AGE = 60 * 60 * 24 * 7; // 7 days

async function hmacSign(secret, data) {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign", "verify"]
  );
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(data));
  return btoa(String.fromCharCode(...new Uint8Array(sig)))
    .replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export async function verifySession(cookie, secret) {
  if (!cookie) return null;
  const parts = cookie.split(".");
  if (parts.length !== 3) return null;
  const [email, expiry, sig] = parts;
  const expected = await hmacSign(secret, `${email}.${expiry}`);
  if (expected !== sig) return null;
  if (Date.now() > parseInt(expiry, 10)) return null;
  return { email: atob(email.replace(/-/g, "+").replace(/_/g, "/")) };
}

export async function createSession(email, secret) {
  const emailB64 = btoa(email).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  const expiry = Date.now() + SESSION_MAX_AGE * 1000;
  const sig = await hmacSign(secret, `${emailB64}.${expiry}`);
  return `${emailB64}.${expiry}.${sig}`;
}

function getCookie(request, name) {
  const cookie = request.headers.get("Cookie") || "";
  const match = cookie.match(new RegExp(`(?:^|;\\s*)${name}=([^;]+)`));
  return match ? match[1] : null;
}

// Test bypass: header "X-Test-Token" khớp env.TEST_BYPASS_TOKEN.
// CHỈ áp dụng cho /api/agent-google-ai (testing prompt output) — các route khác vẫn yêu cầu session.
// Nếu env.TEST_BYPASS_TOKEN không set → không bypass nào hợp lệ.
export function hasTestBypass(request, env) {
  const t = request.headers.get("X-Test-Token");
  return !!(t && env.TEST_BYPASS_TOKEN && t === env.TEST_BYPASS_TOKEN);
}

export async function onRequest(context) {
  const { request, env, next } = context;
  const url = new URL(request.url);

  // Skip auth for login/callback routes
  if (url.pathname.startsWith("/auth/")) {
    return next();
  }

  // Landing Builder — ảnh landing CÔNG KHAI (read-only GET). Cho qua không cần session
  // để landing đã publish (khác origin) + preview trong dashboard đều load được.
  if (request.method === "GET" && url.pathname.startsWith("/api/landings/img/")) {
    return next();
  }

  // NOMA 911 landing ingest — server-to-server (landing _worker.js fan-out),
  // không có session cookie. Gate bằng token riêng X-Noma-Token = env.NOMA911_INGEST_TOKEN.
  if (url.pathname === "/api/noma911/order" && request.method === "POST") {
    const t = request.headers.get("X-Noma-Token");
    if (t && env.NOMA911_INGEST_TOKEN && t === env.NOMA911_INGEST_TOKEN) {
      return next();
    }
    return new Response(JSON.stringify({ ok: false, error: "unauthorized" }), {
      status: 401, headers: { "Content-Type": "application/json" },
    });
  }

  const sessionCookie = getCookie(request, SESSION_COOKIE);
  const session = await verifySession(sessionCookie, env.SESSION_SECRET);

  if (session) {
    return next();
  }

  // Test bypass — agent-google-ai (legacy) + GEO Monitor cron endpoints
  const BYPASS_PATHS = new Set([
    "/api/agent-google-ai",
    "/api/geo/run-batch",
    "/api/geo/jobs",
    "/api/noma911/sync-revenue",
  ]);
  if (BYPASS_PATHS.has(url.pathname) && hasTestBypass(request, env)) {
    return next();
  }

  // No valid session → redirect to login
  return Response.redirect(`${url.origin}/auth/login?redirect=${encodeURIComponent(url.pathname + url.search)}`, 302);
}
