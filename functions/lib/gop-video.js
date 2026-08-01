// Gộp video TikTok từ HAI nguồn rồi khử trùng.
//
//   • Lark  (bảng hieu_suat_video)  — đủ 3 shop, lịch sử dài, nhưng nhiều link rút gọn
//                                      dạng vt.tiktok.com/ZSxxx (không bóc được mã video).
//   • TikTok Shop API (qua sale-report) — CHỈ shop Noma Auto, nhưng mọi video đều có mã
//                                      thật + mã SKU, và phủ rộng hơn nhiều (2.660 vs 457).
//
// Vì sao phải gộp: mỗi bên thiếu một nửa. Lark có Doscom Mart / Bao Mat Doscom mà bên kia
// không có; bên kia có hàng nghìn video Noma mà Lark chưa từng thấy.
//
// KHỬ TRÙNG — hai tầng khoá, cố ý theo thứ tự này:
//   1. Mã video TikTok. Chắc chắn tuyệt đối. Lark chỉ có mã khi link là dạng đầy đủ.
//   2. (kênh + tiêu đề đã chuẩn hoá). Chỉ dùng khi MỘT trong hai bên không có mã —
//      không bao giờ dùng để gộp hai dòng mà cả hai đều có mã khác nhau, vì hai video
//      khác nhau của cùng một kênh có thể trùng tiêu đề.
//
// SỐ LIỆU khi trùng: lấy giá trị ĐO ĐƯỢC CAO NHẤT cho từng chỉ số, độc lập nhau.
// Cố ý không lấy trọn dòng của bên thắng GMV: hai nguồn đo trên hai khoảng thời gian
// khác nhau và cột lượt xem bên TikTok Shop đang lưu "ngày cao nhất" chứ không phải
// tổng kỳ, nên bên nào đo được nhiều hơn ở chỉ số nào thì tin bên đó ở chỉ số ấy.

export function idTuLink(link) {
  const m = String(link || "").match(/\/video\/(\d+)/);
  return m ? m[1] : null;
}

// Tiêu đề TikTok đầy hashtag, emoji và khoảng trắng lạ — chuẩn hoá mạnh tay trước khi
// đem so, nếu không cùng một video ở hai nguồn vẫn ra hai khoá khác nhau.
export function khoaPhu(username, title) {
  const u = String(username || "").replace(/^@/, "").trim().toLowerCase();
  const t = String(title || "")
    .toLowerCase()
    .replace(/#[^\s#]+/g, " ")          // bỏ hashtag
    .replace(/[^\p{L}\p{N}]+/gu, " ")   // bỏ dấu câu / emoji
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 60);
  if (!u || !t) return null;
  return `${u}|${t}`;
}

const so = (x) => { const n = Number(x); return Number.isFinite(n) ? n : 0; };
// Link đầy đủ (bóc được mã) luôn hơn link rút gọn: rút gọn thì không nhận video được,
// mà không nhận được thì không chạy ads được.
const linkTot = (a, b) => (idTuLink(a) ? a : (idTuLink(b) ? b : (a || b)));
const chuTot = (a, b) => (String(a || "").trim() ? a : b);

function tron(cu, moi) {
  cu.gmv = Math.max(so(cu.gmv), so(moi.gmv));
  cu.orders = Math.max(so(cu.orders), so(moi.orders));
  cu.views = Math.max(so(cu.views), so(moi.views));
  cu.link = linkTot(cu.link, moi.link);
  cu.title = chuTot(cu.title, moi.title);
  cu.username = chuTot(cu.username, moi.username);
  cu.shop = chuTot(cu.shop, moi.shop);
  cu.product = chuTot(cu.product, moi.product);
  cu.sku = chuTot(cu.sku, moi.sku);
  cu.posted = chuTot(cu.posted, moi.posted);
  cu.last_date = (cu.last_date || "") >= (moi.last_date || "") ? cu.last_date : moi.last_date;
  if (moi.nguon && cu.nguon && moi.nguon !== cu.nguon) cu.nguon = "ca-hai";
  return cu;
}

/**
 * @param {Array} lark   video từ Lark, đã gộp theo video ở tầng trên
 * @param {Array} tts    video từ TikTok Shop API
 * @returns {{videos:Array, thong_ke:object}}
 */
export function gopVideo(lark, tts) {
  const theoId = new Map();     // mã video  → bản ghi
  const theoPhu = new Map();    // kênh|tiêu đề → bản ghi (chỉ dòng CHƯA có mã)
  const tk = { lark: 0, tts: 0, trung_ma: 0, trung_ten: 0 };

  const nap = (ds, nhan) => {
    for (const v0 of (ds || [])) {
      const v = { ...v0, nguon: nhan };
      tk[nhan]++;
      const id = v.video_id ? String(v.video_id) : idTuLink(v.link);
      const phu = khoaPhu(v.username, v.title);

      if (id) {
        const da = theoId.get(id);
        if (da) { tron(da, v); tk.trung_ma++; continue; }
        // Dòng cùng kênh+tiêu đề đã vào trước mà CHƯA có mã → chính là nó, nâng cấp
        // dòng đó lên có mã thay vì tạo bản ghi thứ hai.
        const cu = phu && theoPhu.get(phu);
        if (cu && !cu.video_id) {
          tron(cu, v); cu.video_id = id; theoId.set(id, cu); tk.trung_ten++; continue;
        }
        v.video_id = id;
        theoId.set(id, v);
        if (phu) theoPhu.set(phu, v);
        continue;
      }

      if (phu) {
        const da = theoPhu.get(phu);
        if (da) { tron(da, v); tk.trung_ten++; continue; }
        theoPhu.set(phu, v);
        continue;
      }
      // Không mã, không khoá phụ → không có cách nào biết trùng hay không. Giữ lại,
      // thà thừa một dòng còn hơn mất video.
      theoPhu.set(`__le_${theoPhu.size}`, v);
    }
  };

  nap(lark, "lark");
  nap(tts, "tts");

  const ra = [];
  const daCo = new Set();
  for (const v of theoId.values()) { ra.push(v); daCo.add(v); }
  for (const v of theoPhu.values()) if (!daCo.has(v)) ra.push(v);

  ra.sort((a, b) => so(b.gmv) - so(a.gmv));
  return { videos: ra, thong_ke: { ...tk, sau_khi_gop: ra.length } };
}

// Bẻ phẳng dữ liệu sale-report (/api/koc-daily?by=koc) về đúng hình dạng video của Lark.
export function phangTuSaleReport(j) {
  const out = [];
  for (const [handle, v] of Object.entries((j && j.by_koc) || {})) {
    for (const x of (v.videos || [])) {
      if (!x.video_id) continue;
      out.push({
        video_id: String(x.video_id),
        link: x.link || null,
        title: x.caption || x.title || "",
        username: handle,
        shop: "Noma Auto",              // kho TikTok Shop hiện chỉ uỷ quyền shop này
        product: x.product || "",
        sku: x.sku ? String(x.sku) : "",
        gmv: so(x.revenue), orders: so(x.orders), views: so(x.views),
        posted: x.ngay_dang || null, last_date: x.ngay_dang || null,
      });
    }
  }
  return out;
}
