// Google service-account OAuth2 cho Cloudflare Workers/Pages Functions.
//
// Dùng chung cho mọi Google API gọi bằng service account (Indexing API,
// Search Console API...). Build + ký JWT RS256 → đổi lấy access_token.
//
// Service account JSON nằm ở env.GOOGLE_INDEXING_SA_JSON (1 chuỗi JSON).
// Cùng 1 service account dùng được cho nhiều scope, miễn là đã được cấp quyền
// trên property tương ứng trong Google Search Console.

const TOKEN_URL = "https://oauth2.googleapis.com/token";

// Convert URL-safe base64 (JWT standard) — no padding, +/ → -_
export function b64url(input) {
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

// Build + sign JWT cho service account với scope cho trước.
async function buildJwt(serviceAccount, scope) {
  const now = Math.floor(Date.now() / 1000);
  const header  = b64url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const payload = b64url(JSON.stringify({
    iss:   serviceAccount.client_email,
    scope,
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

// Parse service account JSON từ env. Trả { sa } hoặc { error }.
export function parseServiceAccount(env) {
  if (!env.GOOGLE_INDEXING_SA_JSON) {
    return { error: "GOOGLE_INDEXING_SA_JSON env var missing" };
  }
  let sa;
  try {
    sa = JSON.parse(env.GOOGLE_INDEXING_SA_JSON);
  } catch (e) {
    return { error: `Invalid SA JSON: ${e.message}` };
  }
  if (!sa.client_email || !sa.private_key) {
    return { error: "SA JSON thiếu client_email hoặc private_key" };
  }
  return { sa };
}

// Lấy access_token cho 1 scope. Throw nếu lỗi.
export async function getAccessToken(serviceAccount, scope) {
  const jwt = await buildJwt(serviceAccount, scope);
  return exchangeJwtForAccessToken(jwt);
}
