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

import { parseServiceAccount, getAccessToken } from "./google-auth.js";

const INDEXING_URL = "https://indexing.googleapis.com/v3/urlNotifications:publish";
const SCOPE        = "https://www.googleapis.com/auth/indexing";

// Public API
//
// Submit 1 URL lên Google Indexing API.
// type: "URL_UPDATED" (default — bài mới hoặc cập nhật) | "URL_DELETED"
//
// Trả về { ok: true, url_notification_metadata } khi thành công,
// hoặc { ok: false, error } khi fail. KHÔNG throw — để caller fire-and-forget.
export async function submitUrlToGoogle(env, url, type = "URL_UPDATED") {
  if (!url) return { ok: false, error: "Missing url" };

  const { sa, error } = parseServiceAccount(env);
  if (error) return { ok: false, error };

  try {
    const accessToken = await getAccessToken(sa, SCOPE);

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
