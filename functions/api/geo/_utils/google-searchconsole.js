// Google Search Console — URL Inspection API client.
//
// Trả lời câu hỏi "Google ĐÃ index URL này chưa?" (khác với Indexing API chỉ là
// SUBMIT/yêu cầu crawl). Đây là số liệu index THẬT mà dân SEO quan tâm.
//
// Setup yêu cầu (ngoài service account đã có cho Indexing API):
//   1. Bật "Google Search Console API" trong cùng GCP project.
//   2. Thêm service account email (client_email trong SA JSON) làm user của
//      property doscom.vn + noma.vn trong Search Console (quyền Full/Owner).
//   3. (Tùy chọn) Set env GSC_PROPERTY_DOSCOM / GSC_PROPERTY_NOMA nếu property
//      KHÔNG phải dạng domain ("sc-domain:doscom.vn"). Ví dụ url-prefix:
//      GSC_PROPERTY_DOSCOM="https://doscom.vn/".
//
// Quota: ~2000 lệnh/ngày + 600/phút mỗi property → cache kết quả, đừng gọi mỗi F5.
//
// API: POST https://searchconsole.googleapis.com/v1/urlInspection/index:inspect
// Reference: https://developers.google.com/webmaster-tools/v1/urlInspection.index/inspect

import { parseServiceAccount, getAccessToken } from "./google-auth.js";

const INSPECT_URL = "https://searchconsole.googleapis.com/v1/urlInspection/index:inspect";
export const GSC_SCOPE = "https://www.googleapis.com/auth/webmasters.readonly";

// Suy ra siteUrl (GSC property) từ host của bài + env override.
// Mặc định dùng domain property "sc-domain:<host>" — phổ biến nhất.
export function resolvePropertyForSite(site, host, env) {
  if (site === "doscom" && env.GSC_PROPERTY_DOSCOM) return env.GSC_PROPERTY_DOSCOM;
  if (site === "noma"   && env.GSC_PROPERTY_NOMA)   return env.GSC_PROPERTY_NOMA;
  return host ? `sc-domain:${host}` : null;
}

// Map kết quả inspection thô → record gọn để lưu D1.
// indexed = true CHỈ khi verdict PASS (Google docs: PASS = "URL is on Google").
export function parseInspection(result) {
  const idx = (result && result.indexStatusResult) || {};
  const verdict = idx.verdict || "VERDICT_UNSPECIFIED";
  return {
    indexed: verdict === "PASS" ? 1 : 0,
    verdict,
    coverage_state:   idx.coverageState   || null,
    last_crawl_time:  idx.lastCrawlTime    || null,
    robots_txt_state: idx.robotsTxtState   || null,
    page_fetch_state: idx.pageFetchState   || null,
  };
}

// Inspect 1 URL. KHÔNG throw — trả { ok, ...record } hoặc { ok:false, error }.
// accessToken truyền vào để tái dùng cho nhiều URL trong 1 batch (đỡ exchange JWT mỗi lần).
export async function inspectUrl(accessToken, { inspectionUrl, siteUrl, languageCode = "vi-VN" }) {
  if (!inspectionUrl || !siteUrl) {
    return { ok: false, error: "Thiếu inspectionUrl hoặc siteUrl" };
  }
  try {
    const res = await fetch(INSPECT_URL, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ inspectionUrl, siteUrl, languageCode }),
    });

    if (!res.ok) {
      const txt = (await res.text()).slice(0, 400);
      return { ok: false, error: `URL Inspection ${res.status}: ${txt}` };
    }

    const data = await res.json();
    return { ok: true, ...parseInspection(data.inspectionResult) };
  } catch (err) {
    return { ok: false, error: String(err?.message || err).slice(0, 400) };
  }
}

// Lấy access token GSC từ env (scope webmasters.readonly). Trả { token } hoặc { error }.
export async function getGscToken(env) {
  const { sa, error } = parseServiceAccount(env);
  if (error) return { error };
  try {
    const token = await getAccessToken(sa, GSC_SCOPE);
    return { token };
  } catch (err) {
    return { error: String(err?.message || err).slice(0, 400) };
  }
}
