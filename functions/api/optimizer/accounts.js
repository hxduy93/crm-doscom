/**
 * GET /api/optimizer/accounts
 * Trả danh sách tài khoản QC mà NGƯỜI ĐANG ĐĂNG NHẬP được xem (cho dropdown UI).
 * - Nhân sự: chỉ tài khoản của họ (staff trùng trong account_to_groups).
 * - Admin / Access chưa bật / Worker(internal): tất cả tài khoản active.
 */
import { getIdentity, visibleAccounts } from "../../lib/access.js";

function json(obj, status = 200) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { "content-type": "application/json; charset=utf-8" },
  });
}

export async function onRequestGet(context) {
  const id = await getIdentity(context);
  return json({
    ok: true,
    role: id.role,
    email: id.email,
    staff: id.staff || null,
    accounts: visibleAccounts(id),
  });
}
