// Sổ ghi hộp quảng cáo (bảng D1 `ad_boxes`) — xem migrations/0027_ad_boxes.sql.
//
// Hộp = (tài khoản, sản phẩm, nhóm TEST/SCALE) -> đúng MỘT campaign + MỘT ad set.
// Sổ neo vào ID nên đổi tên bên Trình quản lý QC không làm lạc hộp. Tên chỉ còn là nhãn.

export const NHOM = ["TEST", "SCALE"];

// Khoá sản phẩm: bỏ khoảng trắng thừa + hạ chữ thường. Phải DÙNG CHUNG ở mọi chỗ tra sổ,
// nếu không "NOMA 230" và "noma  230" thành hai hộp khác nhau.
export function chuanSanPham(s) {
  return String(s || "").trim().replace(/\s+/g, " ").toLowerCase();
}

export function chuanNhom(s) {
  const g = String(s || "").trim().toUpperCase();
  return NHOM.includes(g) ? g : null;
}

export function khoaHop(product, group) {
  return `${chuanSanPham(product)}|${chuanNhom(group) || ""}`;
}

/**
 * Đọc cả sổ của một tài khoản -> Map khoaHop() -> { campaign_id, adset_id, product_raw }.
 * Bảng chưa có (chưa chạy migration) hoặc D1 lỗi thì trả Map RỖNG, KHÔNG ném:
 * mất sổ chỉ làm mất gợi ý mặc định, không được làm sập cả trang tạo ads.
 */
export async function docSo(db, accountId) {
  const out = new Map();
  if (!db || !accountId) return out;
  try {
    const rs = await db.prepare(
      "SELECT product, grp, campaign_id, adset_id, product_raw FROM ad_boxes WHERE account_id = ?"
    ).bind(String(accountId).replace(/^act_/, "")).all();
    for (const r of rs.results || []) {
      out.set(khoaHop(r.product, r.grp), {
        campaign_id: r.campaign_id ? String(r.campaign_id) : null,
        adset_id: r.adset_id ? String(r.adset_id) : null,
        product_raw: r.product_raw || r.product || null,
      });
    }
  } catch (e) { /* chưa có bảng / D1 lỗi -> coi như sổ trống */ }
  return out;
}

/**
 * Ghi (hoặc cập nhật) một dòng sổ. Trả true nếu ghi được.
 * Cũng KHÔNG ném: tạo ads xong mà ghi sổ hỏng thì vẫn phải báo thành công, lần sau dò
 * theo tên là ra — mất sổ không đáng để vứt bỏ campaign vừa tạo.
 */
export async function ghiSo(db, { account_id, product, group, campaign_id, adset_id }) {
  const grp = chuanNhom(group);
  const acct = String(account_id || "").replace(/^act_/, "");
  if (!db || !acct || !grp || !adset_id) return false;
  const p = chuanSanPham(product);
  if (!p) return false;
  try {
    await db.prepare(
      `INSERT INTO ad_boxes (account_id, product, grp, campaign_id, adset_id, product_raw, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(account_id, product, grp) DO UPDATE SET
         campaign_id = excluded.campaign_id,
         adset_id    = excluded.adset_id,
         product_raw = excluded.product_raw,
         updated_at  = excluded.updated_at`
    ).bind(acct, p, grp, String(campaign_id || ""), String(adset_id),
           String(product || "").trim().replace(/\s+/g, " "), Math.floor(Date.now() / 1000)).run();
    return true;
  } catch (e) {
    return false;
  }
}

/**
 * Thời điểm "mới nhất" của một ad set, tính bằng ad mới nhất trong đó.
 * KHÔNG dùng ID ad set để so: ID của Meta không đảm bảo tăng dần theo thời gian.
 */
export function moiNhat(adset) {
  let t = 0;
  for (const a of (adset && adset.ads) || []) {
    const v = Date.parse(a && a.created_time || "");
    if (Number.isFinite(v) && v > t) t = v;
  }
  return t;
}

/**
 * Chọn ad set mặc định cho dropdown, theo thứ tự ưu tiên:
 *   1. Ad set mà SỔ đang trỏ tới, nếu nó còn tồn tại trong danh sách.
 *   2. Ad set ĐANG CHẠY (ACTIVE) có ad mới nhất.
 *   3. Ad set có ad mới nhất, bất kể trạng thái.
 * Không có ad set nào -> null (chỗ gọi sẽ hiểu là "tạo hộp mới").
 *
 * Luật này CHỈ quyết định giá trị chọn sẵn trong dropdown — người chạy luôn đổi được.
 */
export function chonMacDinh(adsets, savedAdsetId) {
  const ds = (adsets || []).filter(Boolean);
  if (!ds.length) return null;
  if (savedAdsetId) {
    const theoSo = ds.find(a => String(a.adset_id) === String(savedAdsetId));
    if (theoSo) return theoSo;
  }
  const dangChay = ds.filter(a => a.adset_status === "ACTIVE");
  const nguon = dangChay.length ? dangChay : ds;
  return nguon.slice().sort((a, b) => moiNhat(b) - moiNhat(a))[0] || null;
}
