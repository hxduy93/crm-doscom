// keyHealth.js — kiểm "sức khỏe" toàn bộ API key / token / link dịch vụ CRM đang dùng.
//
// NGUYÊN TẮC (bám RED LINES + LUẬT TÍNH DỮ LIỆU của dự án):
//  - KHÔNG BAO GIỜ trả giá trị secret ra ngoài. Chỉ trả: có cấu hình chưa, còn sống/chết,
//    ngày hết hạn (nếu dịch vụ cho biết), số ngày còn lại, mô tả ngắn.
//  - KHÔNG bịa số liệu. Sự thật về từng loại:
//      · Facebook token  → có NGÀY HẾT HẠN thật (Graph debug_token) + data_access_expires_at.
//      · Anthropic/OpenAI/Gemini → KHÔNG có API trả số dư tiền. Chỉ kiểm được còn sống / chết (401).
//      · Google service account, WordPress app-password → chỉ kiểm sống/chết.
//      · Token nội bộ mình tự đặt (OPTIMIZER/NOMA911/INDEXNOW/FB_EXPORT) → không có hạn/tiền.
//
// Tách phần LOGIC THUẦN (buildRegistry/classifyToken/summarize/buildAlertMessage) khỏi phần
// PROBE MẠNG (scanAll) để test offline được theo AGENTS.md.

import { getAccessToken } from "../api/geo/_utils/google-auth.js";

// Ngưỡng cảnh báo "sắp hết hạn" — báo trước 7 ngày.
export const WARN_DAYS = 7;

// Trạng thái được coi là VẤN ĐỀ NẶNG (cần xử lý ngay) và CẢNH BÁO NHẸ (sắp tới hạn).
export const HARD_STATUS = new Set(["expired", "dead", "link_down"]);
export const WARN_STATUS = new Set(["expiring"]);

function has(env, k) {
  return !!(env && env[k] && String(env[k]).trim());
}

function isoDate(sec) {
  // sec = epoch giây → 'YYYY-MM-DD'. Chỉ gọi trong probe (runtime có Date).
  return new Date(sec * 1000).toISOString().slice(0, 10);
}

// ── Danh bạ tất cả key/token/link CRM đang dùng (kèm cờ đã-cấu-hình) ──────────
export function buildRegistry(env) {
  const wpOk = (p) => has(env, `WP_${p}_URL`) && has(env, `WP_${p}_USER`) && has(env, `WP_${p}_APP_PWD`);
  return [
    { id: "fb_access", key: "FB_ACCESS_TOKEN", label: "Token Facebook (Ads/Graph)", provider: "Facebook", category: "Quảng cáo", kind: "token", check: "fb",
      configured: has(env, "FB_ACCESS_TOKEN"), note: "Token tạo ads + kéo số liệu FB. Có ngày hết hạn thật." },
    { id: "anthropic", key: "ANTHROPIC_API_KEY", label: "Claude (Anthropic)", provider: "Anthropic", category: "AI", kind: "apikey", check: "anthropic",
      configured: has(env, "ANTHROPIC_API_KEY"), note: "Không có API số dư — chỉ biết còn sống / chết." },
    { id: "openai", key: "OPENAI_API_KEY", label: "OpenAI", provider: "OpenAI", category: "AI", kind: "apikey", check: "openai",
      configured: has(env, "OPENAI_API_KEY"), note: "Không có API số dư — chỉ biết còn sống / chết." },
    { id: "gemini", key: "GEMINI_API_KEY", label: "Gemini (Google AI)", provider: "Google", category: "AI", kind: "apikey", check: "gemini",
      configured: has(env, "GEMINI_API_KEY"), note: "Không có API số dư — chỉ biết còn sống / chết." },
    { id: "google_indexing_sa", key: "GOOGLE_INDEXING_SA_JSON", label: "Google Indexing / Search Console", provider: "Google", category: "SEO", kind: "sa", check: "google_sa",
      scope: "https://www.googleapis.com/auth/indexing", configured: has(env, "GOOGLE_INDEXING_SA_JSON"), note: "Service account — không hết hạn trừ khi xoá key." },
    { id: "ga_sa", key: "GA_SERVICE_ACCOUNT_JSON", label: "Google Analytics (GA4)", provider: "Google", category: "Analytics", kind: "sa", check: "google_sa",
      scope: "https://www.googleapis.com/auth/analytics.readonly", configured: has(env, "GA_SERVICE_ACCOUNT_JSON"), note: "Service account — không hết hạn trừ khi xoá key." },
    { id: "wp_noma", key: "WP_NOMA_APP_PWD", label: "WordPress Noma (app-password)", provider: "WordPress", category: "CMS", kind: "wp", check: "wp", prefix: "NOMA",
      configured: wpOk("NOMA"), note: "App-password đăng bài WordPress Noma." },
    { id: "wp_doscom", key: "WP_DOSCOM_APP_PWD", label: "WordPress Doscom (app-password)", provider: "WordPress", category: "CMS", kind: "wp", check: "wp", prefix: "DOSCOM",
      configured: wpOk("DOSCOM"), note: "App-password đăng bài WordPress Doscom." },
    // Link dịch vụ (endpoint) — kiểm có phản hồi không.
    { id: "optimizer_worker", key: "OPTIMIZER_WORKER_URL", label: "Worker tối ưu FB Ads", provider: "Cloudflare", category: "Link", kind: "link", check: "link",
      configured: has(env, "OPTIMIZER_WORKER_URL"), note: "Endpoint worker agent tối ưu." },
    { id: "fb_data_source", key: "FB_DATA_SOURCE_URL", label: "Nguồn data FB (dashboard cũ)", provider: "—", category: "Link", kind: "link", check: "link",
      configured: has(env, "FB_DATA_SOURCE_URL"), note: "Link kéo snapshot dữ liệu FB." },
    // Token NỘI BỘ mình tự đặt — không có hạn/tiền, chỉ hiện đã cấu hình chưa.
    { id: "optimizer_token", key: "OPTIMIZER_TOKEN", label: "OPTIMIZER_TOKEN (nội bộ)", provider: "Doscom", category: "Nội bộ", kind: "internal", check: "internal",
      configured: has(env, "OPTIMIZER_TOKEN"), note: "Mật khẩu lưu cấu hình tối ưu từ UI." },
    { id: "noma_ingest", key: "NOMA911_INGEST_TOKEN", label: "NOMA911_INGEST_TOKEN (nội bộ)", provider: "Doscom", category: "Nội bộ", kind: "internal", check: "internal",
      configured: has(env, "NOMA911_INGEST_TOKEN"), note: "Token bảo vệ endpoint nhận đơn Noma911." },
    { id: "fb_export", key: "FB_EXPORT_TOKEN", label: "FB_EXPORT_TOKEN (đối tác kéo data)", provider: "Doscom", category: "Nội bộ", kind: "internal", check: "internal",
      configured: has(env, "FB_EXPORT_TOKEN"), note: "Bearer cho đối tác kéo /api/export/fb-ad-spend." },
    { id: "indexnow", key: "INDEXNOW_KEY", label: "INDEXNOW_KEY (nội bộ)", provider: "Doscom", category: "Nội bộ", kind: "internal", check: "internal",
      configured: has(env, "INDEXNOW_KEY"), note: "Khoá đẩy IndexNow (Bing/Yandex)." },
  ];
}

// ── Phân loại trạng thái token-có-hạn (logic thuần, test được) ────────────────
export function classifyToken(expiresAtSec, nowSec, warnDays = WARN_DAYS, isValid = true) {
  if (isValid === false) return { status: "expired", daysLeft: 0 };
  if (!expiresAtSec) return { status: "ok", daysLeft: null };        // token vĩnh viễn (System User)
  const daysLeft = (expiresAtSec - nowSec) / 86400;
  if (daysLeft <= 0) return { status: "expired", daysLeft: 0 };
  if (daysLeft <= warnDays) return { status: "expiring", daysLeft: Math.round(daysLeft) };
  return { status: "ok", daysLeft: Math.round(daysLeft) };
}

// ── Tổng hợp con số cho UI ────────────────────────────────────────────────────
export function summarize(items) {
  const s = { total: items.length, ok: 0, problem: 0, warning: 0, internal: 0, missing: 0, unknown: 0 };
  for (const it of items) {
    if (HARD_STATUS.has(it.status)) s.problem++;
    else if (WARN_STATUS.has(it.status)) s.warning++;
    else if (it.status === "internal") s.internal++;
    else if (it.status === "missing") s.missing++;
    else if (it.status === "unknown") s.unknown++;
    else if (it.status === "ok") s.ok++;
  }
  return s;
}

// ── Soạn thông điệp cảnh báo cho Hermes (null = không có gì để báo) ────────────
export function buildAlertMessage(items) {
  const hard = items.filter((it) => HARD_STATUS.has(it.status));
  const warn = items.filter((it) => WARN_STATUS.has(it.status));
  if (!hard.length && !warn.length) return null;

  const lines = [];
  for (const it of hard) {
    const what = it.status === "expired" ? "ĐÃ HẾT HẠN"
      : it.status === "link_down" ? "LINK CHẾT"
      : "KEY CHẾT / hết hiệu lực";
    lines.push(`• ${it.label}: ${what}`);
  }
  for (const it of warn) {
    const exp = it.expiresAt ? `, hết ${it.expiresAt}` : "";
    lines.push(`• ${it.label}: sắp hết hạn (còn ${it.daysLeft} ngày${exp})`);
  }
  const head = hard.length
    ? `⚠️ Có ${hard.length} API/token ĐÃ CHẾT/HẾT HẠN cần xử lý NGAY:`
    : `⏳ Có ${warn.length} API/token sắp hết hạn:`;
  return head + "\n" + lines.join("\n");
}

// ═══════════════ PHẦN PROBE MẠNG (không unit-test — cần fetch thật) ════════════
const T = (ms = 12000) => AbortSignal.timeout(ms);

async function probeFb(env, item, now) {
  const token = env.FB_ACCESS_TOKEN;
  const r = await fetch(
    `https://graph.facebook.com/v21.0/debug_token?input_token=${encodeURIComponent(token)}&access_token=${encodeURIComponent(token)}`,
    { signal: T() },
  );
  const d = (await r.json())?.data || {};
  const exp = d.expires_at || 0;                 // 0 = token vĩnh viễn
  const dataExp = d.data_access_expires_at || 0;
  const c = classifyToken(exp, now, WARN_DAYS, d.is_valid);
  return {
    status: c.status,
    daysLeft: c.daysLeft,
    expiresAt: exp ? isoDate(exp) : null,
    detail: exp
      ? `Hết hạn ${isoDate(exp)}${dataExp ? ` · data-access hết ${isoDate(dataExp)}` : ""}`
      : "Token vĩnh viễn (System User).",
  };
}

async function probeAnthropic(env) {
  const r = await fetch("https://api.anthropic.com/v1/models?limit=1", {
    headers: { "x-api-key": env.ANTHROPIC_API_KEY, "anthropic-version": "2023-06-01" },
    signal: T(),
  });
  if (r.status === 200) return { status: "ok", detail: "Key còn sống (200). Số dư tiền không có API để đọc." };
  if (r.status === 401) return { status: "dead", detail: "Key chết / sai (401)." };
  return { status: "unknown", detail: `HTTP ${r.status} — chưa rõ.` };
}

async function probeOpenAI(env) {
  const r = await fetch("https://api.openai.com/v1/models", {
    headers: { Authorization: `Bearer ${env.OPENAI_API_KEY}` },
    signal: T(),
  });
  if (r.status === 200) return { status: "ok", detail: "Key còn sống (200). Số dư không có API để đọc." };
  if (r.status === 401) return { status: "dead", detail: "Key chết / sai (401)." };
  return { status: "unknown", detail: `HTTP ${r.status} — chưa rõ.` };
}

async function probeGemini(env) {
  const r = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models?key=${encodeURIComponent(env.GEMINI_API_KEY)}&pageSize=1`,
    { signal: T() },
  );
  if (r.status === 200) return { status: "ok", detail: "Key còn sống (200)." };
  if (r.status === 400 || r.status === 403) return { status: "dead", detail: `Key chết / sai (HTTP ${r.status}).` };
  return { status: "unknown", detail: `HTTP ${r.status} — chưa rõ.` };
}

async function probeGoogleSA(env, item) {
  let sa;
  try {
    sa = JSON.parse(env[item.key]);
  } catch {
    return { status: "dead", detail: "JSON service account hỏng — không parse được." };
  }
  if (!sa.client_email || !sa.private_key) return { status: "dead", detail: "SA thiếu client_email/private_key." };
  try {
    await getAccessToken(sa, item.scope);
    return { status: "ok", detail: `SA còn hiệu lực · ${sa.client_email}` };
  } catch (e) {
    return { status: "dead", detail: `Lấy token SA lỗi: ${String((e && e.message) || e).slice(0, 120)}` };
  }
}

async function probeWp(env, item) {
  const base = String(env[`WP_${item.prefix}_URL`]).replace(/\/+$/, "");
  const auth = btoa(`${env[`WP_${item.prefix}_USER`]}:${env[`WP_${item.prefix}_APP_PWD`]}`);
  const r = await fetch(`${base}/wp-json/wp/v2/users/me?context=edit`, {
    headers: { Authorization: `Basic ${auth}` },
    signal: T(),
  });
  if (r.status === 200) return { status: "ok", detail: "App-password còn hiệu lực (200)." };
  if (r.status === 401 || r.status === 403) return { status: "dead", detail: `App-password chết / sai (HTTP ${r.status}).` };
  return { status: "unknown", detail: `HTTP ${r.status} — chưa rõ.` };
}

async function probeLink(env, item) {
  const url = env[item.key];
  try {
    const r = await fetch(url, { method: "GET", signal: T(8000) });
    if (r.status < 500) return { status: "ok", detail: `Link phản hồi HTTP ${r.status}.` };
    return { status: "link_down", detail: `Link lỗi HTTP ${r.status}.` };
  } catch (e) {
    return { status: "link_down", detail: `Không kết nối được: ${String((e && e.message) || e).slice(0, 80)}` };
  }
}

// Quét toàn bộ — chạy các probe SONG SONG. Mỗi probe tự bọc try/catch → 1 lỗi không kéo đổ cả bảng.
export async function scanAll(env, nowSec) {
  const now = nowSec ?? Math.floor(Date.now() / 1000);
  const registry = buildRegistry(env);

  return Promise.all(registry.map(async (item) => {
    // Chỉ giữ field public — bỏ scope/prefix nội bộ.
    const base = {
      id: item.id, key: item.key, label: item.label, provider: item.provider,
      category: item.category, kind: item.kind, configured: item.configured,
      note: item.note, expiresAt: null, daysLeft: null,
    };
    if (!item.configured) return { ...base, status: "missing", detail: "Chưa cấu hình secret này." };
    if (item.kind === "internal") return { ...base, status: "internal", detail: "Token nội bộ tự đặt — không có hạn/tiền." };

    try {
      let res;
      switch (item.check) {
        case "fb":        res = await probeFb(env, item, now); break;
        case "anthropic": res = await probeAnthropic(env); break;
        case "openai":    res = await probeOpenAI(env); break;
        case "gemini":    res = await probeGemini(env); break;
        case "google_sa": res = await probeGoogleSA(env, item); break;
        case "wp":        res = await probeWp(env, item); break;
        case "link":      res = await probeLink(env, item); break;
        default:          res = { status: "unknown", detail: "Chưa hỗ trợ kiểm loại này." };
      }
      return { ...base, ...res };
    } catch (e) {
      return { ...base, status: "unknown", detail: `Lỗi kiểm: ${String((e && e.message) || e).slice(0, 120)}` };
    }
  }));
}
