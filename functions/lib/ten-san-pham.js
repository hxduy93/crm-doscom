// Rút tên sản phẩm TikTok Shop về dạng ngắn để dùng làm TÊN TAB và tên thư mục video.
//
// Tên trên shop dài 90–150 ký tự ("Dung Dịch Tẩy Ố Kính Ô tô - NOMA 911 – Tẩy Cặn Canxi,
// Màng Dầu, Nâng cao tầm nhìn – Tích Hợp Cọ Chà Tiện Lợi"). Để nguyên thì tab tràn màn
// hình và thư mục tải video có tên vô nghĩa. Giữ lại MÃ MÁY + mô tả ngắn — mã là thứ
// người trong nhà nhìn phát hiểu.
//
// Dùng chung thuật toán với public/koc-tiktok.html bên sale-report-doscom (để hai
// dashboard gọi cùng một sản phẩm bằng cùng một cái tên), CỘNG THÊM mã kiểu Doscom.
// Bên kia chỉ có shop Noma Auto nên không cần, còn CRM có cả 3 shop: Noma đặt mã
// "NOMA 911", Doscom đặt "DR1" / "D1" / "DA8.1 PRO".

const rutGon = (s, n) => (s && s.length > n ? s.slice(0, n - 1) + "…" : (s || ""));

export function tenNganSP(s) {
  s = String(s || "").replace(/\s+/g, " ").trim();
  if (!s) return "(chưa rõ sản phẩm)";

  // Nhãn trong ngoặc vuông ở ĐẦU tên chính là thứ phân biệt các SKU cùng mặt hàng
  // ("[COMBO 2 CHAI]", "[Có Quà Tặng]") -> giữ nhãn, bỏ mô tả cho gọn.
  const tag = (s.match(/^\[([^\]]{1,24})\]/) || [])[1] || "";
  const than = s.replace(/^\[[^\]]*\]\s*/, "");

  // Mã Doscom: DR1, D1, DA3.1, DA8.1 PRO, CS2… Xét TRƯỚC mã Noma vì tên Doscom
  // cũng chứa số 3 chữ số lạc ("30 Tiếng", "50 MHz") dễ bị bắt nhầm thành mã Noma.
  const DOS = /\b(D[RAVIT]?\d+(?:\.\d+)?(?:\s?PRO)?|CS\d+)\b/gi;
  let ma = [...new Set((than.match(DOS) || []).map((x) => x.replace(/\s+/g, " ").toUpperCase()))].slice(0, 2);
  let dau = ma.join("+");

  if (!dau) {
    ma = (than.match(/noma\s*[-–]?\s*(\d{2,4})/gi) || []).map((x) => x.replace(/\D/g, ""));
    // Combo không viết chữ "Noma" trước số ("Bộ 2 Chai Tẩy Ố Kính 911 & Phủ Nano 922")
    // -> vớt bằng số 3 chữ số đứng riêng.
    if (!ma.length) ma = (than.match(/(?:^|\s)(\d{3})(?=\s|$|&)/g) || []).map((x) => x.trim());
    ma = [...new Set(ma)].slice(0, 2);
    dau = ma.length ? "NOMA " + ma.join("+") : "";
  }

  if (tag) return dau ? `${dau} · ${tag}` : tag;

  // Mô tả = đoạn chữ đầu tiên sau khi bỏ mã, cắt ở dấu phân cách chứ không cắt giữa chừng.
  // Bỏ mã xong hay còn khoảng trắng kép ("Dưỡng Ghế Da NOMA 686 2 Bước") -> ép lại 1 dấu cách.
  const mo = than.replace(DOS, " ").replace(/noma\s*[-–]?\s*\d{2,4}/gi, " ").split(/[-–—|(]/)
    .map((x) => x.replace(/\s+/g, " ").replace(/^[,;:.\s]+/, "").trim()).filter((x) => x.length > 3)[0] || than;
  return dau ? `${dau} · ${rutGon(mo, 26)}` : rutGon(mo, 40);
}

// Khoá gom nhóm. Shop Doscom không đặt mã kiểu NOMA nên tên rút gọn chính là khoá;
// dùng bản thường hoá để "NOMA 911 · Dung Dịch…" và "noma 911 · dung dịch…" không
// tách thành hai tab.
export const khoaSP = (ten) => tenNganSP(ten).toLowerCase();
