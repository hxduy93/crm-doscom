// Google Indexing API client cho Cloudflare Workers/Pages Functions.
//
// LƯU Ý PHÁP LÝ: Google chính thức nói Indexing API CHỈ dùng cho schema
// JobPosting và BroadcastEvent. Submit URL blog post là "grey area" — trong
// thực tế vẫn trigger Googlebot crawl 80% trường hợp, nhưng KHÔNG bảo đảm
// được index. Đây là cách nhiều SEO tools (Rank Math Pro, Yoast Pro) đang làm.
//
// Setup yêu cầu:
//   1. Tạo Google Cloud project, enable Indexing API
//   2. Tạo service account, tải JSON key file
//   3. Set env var GOOGLE_INDEXING_SA_JSON = nội dung file JSON (1 chuỗi)
//   4. Verify domain trong Google Search Console
//   5. Add service account email làm Owner của property trong GSC
//
// Reference: https://developers.google.com/search/apis/indexing-api/v3/quickstart

const TOKEN_URL    = "https://oauth2.googleapis.com/token";
const INDEXING_URL = "https://indexing.googleapis.com/v3/urlNotifications:publish";
const SCOPE        = "https://www.googleapis.com/auth/indexing";

// Convert URL-safe base64 (JWT standard) — no padding, +/ → -_
function b64url(input) {
  const bytes = typeof input === "string"
    ? new TextEncoder().encode(input)
    : new Uint8Array(input);
  let str = "";
  for (let i = 0; i < bytes.length; i++) str += String.fromCharCode(bytes[i]);
  return btoa(str).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

// Convert PEM private key → CryptoKey for RS256 signing
async function importPrivateKey(pem) {
  const pemBody = pem
    .replace(/-----BEGIN PRIVATE KEY-----/, "")
    .replace(/-----END PRIVATE KEY-----/, "")
    .replace(/\s+/g, "");
  const binary = atob(pemBody);
  const buf = new ArrayBuffer(binary.length);
  const view = new Uint8Array(buf);
  for (let i = 0; i < binary.length; i++) view[i] = binary.charCodeAt(i);

  return crypto.subtle.importKey(
    "pkcs8",
    buf,
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["sign"]
  );
}

// Build + sign JWT cho service account
async function buildJwt(serviceAccount) {
  const now = Math.floor(Date.now() / 1000);
  const header  = b64url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const payload = b64url(JSON.stringify({
    iss:   serviceAccount.client_email,
    scope: SCOPE,
    aud:   TOKEN_URL,
    iat:   now,
    exp:   now + 3600,
  }));

  const signingInput = `${header}.${payload}`;
  const key = await importPrivateKey(serviceAccount.private_key);
  const sig = await crypto.subtle.sign(
    "RSASSA-PKCS1-v1_5",
    key,
    new TextEncoder().encode(signingInput)
  );

  return `${signingInput}.${b64url(sig)}`;
}

async function exchangeJwtForAccessToken(jwt) {
  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion:  jwt,
    }).toString(),
  });

  if (!res.ok) {
    const txt = (await res.text()).slice(0, 400);
    throw new Error(`OAuth token exchange failed ${res.status}: ${txt}`);
  }
  const data = await res.json();
  if (!data.access_token) throw new Error("No access_token in OAuth response");
  return data.access_token;
}

// Public API
//
// Submit 1 URL lên Google Indexing API.
// type: "URL_UPDATED" (default — bài mới hoặc cập nhật) | "URL_DELETED"
//
// Trả về { ok: true, url_notification_metadata } khi thành công,
// hoặc { ok: false, error } khi fail. KHÔNG throw — để caller fire-and-forget.
export async function submitUrlToGoogle(env, url, type = "URL_UPDATED") {
  if (!env.GOOGLE_INDEXING_SA_JSON) {
    return { ok: false, error: "GOOGLE_INDEXING_SA_JSON env var missing" };
  }
  if (!url) return { ok: false, error: "Missing url" };

  let sa;
  try {
    sa = JSON.parse(env.GOOGLE_INDEXING_SA_JSON);
  } catch (e) {
    return { ok: false, error: `Invalid SA JSON: ${e.message}` };
  }
  if (!sa.client_email || !sa.private_key) {
    return { ok: false, error: "SA JSON thiếu client_email hoặc private_key" };
  }

  try {
    const jwt = await buildJwt(sa);
    const accessToken = await exchangeJwtForAccessToken(jwt);

    const res = await fetch(INDEXING_URL, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${accessToken}`,
        "Content-Type":  "application/json",
      },
      body: JSON.stringify({ url, type }),
    });

    if (!res.ok) {
      const txt = (await res.text()).slice(0, 400);
      return {
        ok: false,
        error: `Indexing API ${res.status}: ${txt}`,
        url, type,
      };
    }

    const data = await res.json();
    return {
      ok: true,
      url,
      type,
      url_notification_metadata: data.urlNotificationMetadata || null,
    };
  } catch (err) {
    return { ok: false, error: String(err?.message || err).slice(0, 400), url, type };
  }
}
