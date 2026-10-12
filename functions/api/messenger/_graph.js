// Graph API cho menu "Nhắn lại khách Messenger".
//
// Token: FB_MESSAGING_TOKEN (nếu đặt) → FB_ACCESS_TOKEN. Là token NGƯỜI DÙNG của quản trị
// viên Page; từ nó lấy PAGE TOKEN của từng fanpage qua /me/accounts (Messenger bắt buộc page
// token). Token phải có scope:
//   pages_messaging          — đọc hội thoại + gửi tin (THIẾU là lỗi #200 khi đọc conversations)
//   page_utility_messaging   — chỉ cần cho nhóm "quá 7 ngày" (mẫu Utility)
// Kiểm 12/10/2026: FB_ACCESS_TOKEN hiện tại CHƯA có pages_messaging → phải cấp token mới.
// KHÔNG BAO GIỜ trả page token ra trình duyệt.

export const GRAPH = "https://graph.facebook.com/v21.0";

export function json(obj, status = 200) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" },
  });
}

export function userToken(env) {
  return (env && (env.FB_MESSAGING_TOKEN || env.FB_ACCESS_TOKEN)) || "";
}

export class GraphError extends Error {
  constructor(e, status) {
    super((e && e.message) || `Graph HTTP ${status}`);
    this.code = e && e.code;
    this.subcode = e && e.error_subcode;
  }
}

// Câu tiếng Việt nói rõ phải làm gì — đừng bắt user đoán từ câu tiếng Anh của Facebook.
export function giaiThichLoi(err) {
  const code = Number(err && err.code);
  const msg = String((err && err.message) || err || "");
  if (code === 190) return "Token Facebook hết hạn hoặc bị thu hồi — cấp token mới (FB_MESSAGING_TOKEN).";
  if (/pages_messaging/.test(msg)) return "Token chưa có quyền pages_messaging — cấp lại token có quyền này (FB_MESSAGING_TOKEN).";
  if (/page_utility_messaging/.test(msg)) return "Token chưa có quyền page_utility_messaging — cần quyền này để gửi mẫu Utility.";
  if (code === 10 && /outside of allowed window|24 hour/i.test(msg)) return "Khách đã quá cửa sổ cho phép — tin tự do không gửi được.";
  if (code === 551 || /isn't available|not available right now/i.test(msg)) return "Khách đã chặn Page hoặc không nhận tin được.";
  if (code === 4 || code === 613 || code === 32) return "Facebook giới hạn tốc độ — dừng vài phút rồi gửi tiếp.";
  return msg.slice(0, 300);
}

export async function graph(path, { token, method = "GET", params, body } = {}) {
  const qs = new URLSearchParams(params || {});
  if (token) qs.set("access_token", token);
  const url = path.startsWith("http") ? path : `${GRAPH}${path}?${qs}`;
  const init = { method, signal: AbortSignal.timeout(25000) };
  if (body) {
    init.headers = { "content-type": "application/json" };
    init.body = JSON.stringify(body);
  }
  const r = await fetch(url, init);
  const data = await r.json().catch(() => null);
  if (!r.ok || !data || data.error) throw new GraphError(data && data.error, r.status);
  return data;
}

// Danh sách Page token quản trị, chỉ Page có quyền MESSAGING. withToken=false khi trả cho UI.
export async function dsPage(env, withToken) {
  const token = userToken(env);
  if (!token) throw new Error("Chưa cấu hình FB_MESSAGING_TOKEN / FB_ACCESS_TOKEN");
  const out = [];
  let next = `${GRAPH}/me/accounts?${new URLSearchParams({ fields: "id,name,tasks,access_token", limit: "100", access_token: token })}`;
  for (let i = 0; i < 3 && next; i++) {
    const d = await graph(next);
    for (const p of d.data || []) {
      if (!(p.tasks || []).includes("MESSAGING")) continue;
      out.push(withToken ? { id: String(p.id), name: p.name, token: p.access_token } : { id: String(p.id), name: p.name });
    }
    next = d.paging && d.paging.next;
  }
  return out;
}

export async function pageToken(env, pageId) {
  const p = (await dsPage(env, true)).find((x) => x.id === String(pageId));
  if (!p) throw new Error("Token không quản trị Page này hoặc không có quyền nhắn tin trên Page");
  return p.token;
}
