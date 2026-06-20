// Sổ tài khoản + phân quyền cho access control (nằm TRONG functions/ để import chắc chắn).
// Đồng bộ account_to_groups với data/fb-config.json. staff_access do admin quản ở đây.
//
// staff_access: email (chữ thường) → { role: "admin"|"staff", staff: TÊN khớp account_to_groups }.
//   admin = thấy MỌI tài khoản; staff = chỉ tài khoản có staff trùng.

export const ACCOUNT_TO_GROUPS = {
  "1449385949897024": { name: "CÔNG TY TNHH DOSCOM HOLDINGS - Công nghệ nâng tầm cuộc sống", staff: "DUY", active: true },
  "927390616363424": { name: "Doscom - Công nghệ nâng tầm cuộc sống", staff: "DUY", active: true },
  "1655506672244826": { name: "CÔNG TY TNHH DOSCOM HOLDINGS - Noma Việt Nam", staff: "DUY", active: true },
  "764394829882083": { name: "Doscom - Noma.vn - Giải Pháp Chăm Sóc Xe Hơi Toàn Diện", staff: "PHUONG_NAM", active: true },
  "906015559004892": { name: "Doscom Mart", staff: "PHUONG_NAM", active: true },
  "1416634670476226": { name: "CÔNG TY TNHH DOSCOM HOLDINGS - Doscom Mart", staff: "PHUONG_NAM", active: true },
  "1418124406240173": { name: "DA8.1 mới (PN, chưa chạy)", staff: "PHUONG_NAM", active: true },
};

export const STAFF_ACCESS = {
  "kinhdoanh.doscom@gmail.com": { role: "admin" },
  "doscom.vietnam@gmail.com": { role: "admin" },
  // Thêm email nhân sự ở đây, vd:
  // "namphuong@gmail.com": { role: "staff", staff: "PHUONG_NAM" },
};
