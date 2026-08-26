// GET /api/thai-social/repost/image/:id/:idx
//
// Trả ảnh ĐÃ VẼ LẠI bằng tiếng Thái để UI xem trước. Ảnh nằm ở KV (xem _repost-lib.js),
// endpoint này chỉ là cửa đọc — không nhồi base64 vào JSON danh sách bài, vì mỗi tấm ~1,4MB
// và danh sách hàng chờ sẽ nặng vài chục MB.
//
// Chỉ ĐỌC, không cần token ghi: trang này vốn nằm sau Cloudflare Access.

import { fail, requireDB } from "../../../_lib.js";
import { readImageCache } from "../../../_repost-lib.js";
import { base64ToBytes } from "../../../_image-translate.js";

export async function onRequestGet({ params, env }) {
  const bad = requireDB(env);
  if (bad) return bad;

  const id = Number(params.id);
  const idx = Number(params.idx);
  if (!id || !Number.isInteger(idx) || idx < 0) return fail("bad_params");

  const row = await env.DB.prepare(`SELECT images FROM thai_repost_queue WHERE id = ?`).bind(id).first();
  if (!row) return fail("post_not_found", 404);

  let list = [];
  try { list = JSON.parse(row.images || "[]"); } catch { list = []; }
  const im = list[idx];
  if (!im) return fail("image_not_found", 404);
  if (!im.kv_key) return fail("chua_ve_lai", 404, { detail: "Ảnh này chưa có bản vẽ lại — xem ảnh gốc ở link Facebook." });

  const cached = await readImageCache(env, im.kv_key);
  if (!cached || !cached.b64) {
    return fail("anh_het_han", 410, {
      detail: "Bản ảnh vẽ lại đã hết hạn lưu tạm (7 ngày). Bấm “Dịch lại” để làm lại ảnh.",
    });
  }

  const bytes = base64ToBytes(cached.b64);
  return new Response(bytes, {
    headers: {
      "Content-Type": cached.mime || "image/png",
      // Ảnh gắn với đúng bài + đúng khoá KV, đổi là đổi khoá → cache lâu được.
      "Cache-Control": "private, max-age=3600",
    },
  });
}
