// IndexNow protocol — submit URL tới Bing/Yandex/Naver (instant indexing).
// Google KHÔNG hỗ trợ IndexNow (dùng google-indexing.js riêng cho Google).
//
// Setup:
//   1. Generate 1 key string ngẫu nhiên 32 ký tự a-z0-9 (vd: openssl rand -hex 16)
//   2. Upload file `<key>.txt` lên root mỗi WP site, nội dung file = chính key đó
//      vd: https://doscom.vn/abc123def456.txt  → file chỉ chứa "abc123def456"
//   3. Set env var INDEXNOW_KEY = "abc123def456"
//
// Reference: https://www.indexnow.org/documentation
//
// Note: Rank Math / Yoast SEO plugins thường đã tự ping IndexNow khi publish.
// Ping từ Cloudflare-side là duplicate vô hại — IndexNow xử lý duplicate gracefully.

const INDEXNOW_ENDPOINT = "https://api.indexnow.org/IndexNow";

// Submit 1 URL hoặc nhiều URL (mảng) tới IndexNow.
// Trả về { ok, status, error? } — KHÔNG throw.
export async function submitUrlToIndexNow(env, urls) {
  if (!env.INDEXNOW_KEY) {
    return { ok: false, error: "INDEXNOW_KEY env var missing" };
  }
  const urlList = Array.isArray(urls) ? urls : [urls];
  if (urlList.length === 0) return { ok: false, error: "Empty url list" };

  // host = domain của URL đầu tiên (IndexNow yêu cầu cùng host cho 1 batch)
  let host;
  try { host = new URL(urlList[0]).host; }
  catch { return { ok: false, error: "Invalid url" }; }

  const key = env.INDEXNOW_KEY.trim();
  const keyLocation = `https://${host}/${key}.txt`;

  try {
    const res = await fetch(INDEXNOW_ENDPOINT, {
      method: "POST",
      headers: {
        "Content-Type": "application/json; charset=utf-8",
        "Host":         "api.indexnow.org",
      },
      body: JSON.stringify({
        host,
        key,
        keyLocation,
        urlList,
      }),
    });

    // IndexNow trả về:
    //   200 OK = đã accept
    //   202 Accepted = đã accept, key sẽ verify async
    //   400/403/422 = lỗi key/format
    const ok = res.status === 200 || res.status === 202;
    if (!ok) {
      const txt = (await res.text()).slice(0, 300);
      return { ok: false, status: res.status, error: txt, urls: urlList };
    }
    return { ok: true, status: res.status, urls: urlList, host };
  } catch (err) {
    return { ok: false, error: String(err?.message || err).slice(0, 300), urls: urlList };
  }
}
