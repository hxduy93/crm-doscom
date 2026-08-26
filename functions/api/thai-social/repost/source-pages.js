// GET /api/thai-social/repost/source-pages
//
// Danh sách fanpage mà token đọc (FB_PAGE_READ_TOKEN) đang quản trị — để UI cho CHỌN
// fanpage nguồn thay vì bắt người dùng đi tìm ID.
//
// KHÔNG BAO GIỜ trả page access_token ra client: token đó đăng được bài lên fanpage thật,
// lọt ra là ai mở DevTools cũng đăng được. Cùng luật với publicPage() của thai-social.
//
// Chỉ ĐỌC, không cần token ghi — trang này vốn nằm sau Cloudflare Access.

import { ok, fail } from "../_lib.js";
import { sourcePages } from "../_fb-source.js";

export async function onRequestGet({ env }) {
  try {
    const pages = await sourcePages(env);
    return ok({ pages, count: pages.length });
  } catch (e) {
    return fail(e.kind === "no_token" ? "thieu_token_doc" : "khong_lay_duoc_danh_sach",
                e.kind === "no_token" ? 500 : 502,
                { detail: String(e.message || e) });
  }
}
