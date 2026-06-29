/**
 * Danh tính người đang đăng nhập — cho UI hiển thị badge user + nút Đăng xuất.
 *   GET /api/me → { ok:true, email, role, all, accounts:[{id,name,staff}],
 *                   logoutUrl:"/cdn-cgi/access/logout" }
 *
 * Nguồn danh tính: Cloudflare Access (header Cf-Access-Authenticated-User-Email),
 * tra quyền qua functions/lib/access.js. Khi Access CHƯA bật → role "open",
 * email = null (UI sẽ ẩn badge / hiện "chưa bật đăng nhập").
 */
import { getIdentity, visibleAccounts } from "../lib/access.js";

function json(obj, status = 200) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
    },
  });
}

export async function onRequestGet(context) {
  try {
    const id = await getIdentity(context);
    return json({
      ok: true,
      email: id.email,
      role: id.role,
      all: id.all,
      accounts: visibleAccounts(id),
      // Cloudflare Access logout: xoá cookie CF_Authorization của phiên hiện tại.
      logoutUrl: "/cdn-cgi/access/logout",
    });
  } catch (err) {
    return json({ ok: false, error: String(err && err.message || err) }, 500);
  }
}
