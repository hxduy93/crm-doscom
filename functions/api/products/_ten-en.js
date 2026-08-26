/* Bảng TÊN TIẾNG ANH của từng mã SKU — nguồn tên chuẩn cho nomaauto.us.

   Vì sao phải là một BẢNG LƯU LẠI chứ không dịch tại chỗ mỗi lần quét: bản dịch không
   tất định. Dịch lại mỗi lần thì cùng một sản phẩm mỗi lần ra một tên khác, công cụ sẽ
   rủ đổi tên mãi không hết, tên trên web không bao giờ đứng yên và mọi bản ghi cũ (bài
   hướng dẫn, quảng cáo) gọi một tên khác với danh mục.

   KV `noma_sku_names:en:v1` = { names: { "911": "NOMA 911 - …" }, cap_nhat, nguon_seed }.
   Bản trước giữ ở `…:prev` cho nút Hoàn tác — giống hệt khuôn của hồ sơ sản phẩm. */

export const EN_NAMES_KV_KEY = "noma_sku_names:en:v1";
export const EN_NAMES_PREV_KEY = EN_NAMES_KV_KEY + ":prev";
/* Bản SOẠN (chưa duyệt). Giữ riêng, KHÔNG bao giờ được dùng làm tên chuẩn — nhưng phải
   lưu lại: soạn xong mà đóng trang là mất công dịch, lần sau tốn tiền AI lần nữa. */
export const EN_NAMES_DRAFT_KEY = EN_NAMES_KV_KEY + ":draft";

export async function loadTenEn(env) {
  try {
    const raw = env && env.INVENTORY ? await env.INVENTORY.get(EN_NAMES_KV_KEY) : null;
    if (raw) {
      const d = JSON.parse(raw);
      if (d && d.names && Object.keys(d.names).length) {
        return { names: d.names, nguon: "kv", cap_nhat: d.cap_nhat || null,
                 so_ten: Object.keys(d.names).length };
      }
    }
  } catch (e) { /* KV hỏng → coi như chưa có bảng; phần quét sẽ nói rõ "chưa có tên EN" */ }
  return { names: {}, nguon: "trong", cap_nhat: null, so_ten: 0 };
}
