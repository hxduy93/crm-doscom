// Menu "Nhắn lại khách Messenger" (12/10/2026) — phần LOGIC THUẦN, dùng chung cho
// Pages Functions (functions/api/messenger/*) và trình duyệt (dist/js/nhan-tin-lai.js).
//
// LUẬT GỬI CỦA META — lý do cả menu phải chia khách thành 3 nhóm:
//   1. "24h"  — khách nhắn Page trong 24 giờ qua → gửi chữ tự do, messaging_type RESPONSE.
//   2. "7d"   — 24 giờ → 7 ngày → chỉ gửi được với thẻ HUMAN_AGENT, và thẻ này CHỈ dành cho
//               NHÂN VIÊN trả lời câu hỏi khách bị sót. Dùng nó để gửi hàng loạt là lạm dụng,
//               Meta phát hiện được → UI để mặc định TẮT, phải tự bật.
//   3. "cu"   — quá 7 ngày (hoặc không xác định được) → CHỈ gửi được Utility Template
//               (mẫu tin cập nhật đơn/tài khoản, Meta duyệt, cấm nội dung quảng cáo).
// Thẻ POST_PURCHASE_UPDATE / ACCOUNT_UPDATE / CONFIRMED_EVENT_UPDATE ĐÃ BỊ KHAI TỬ từ
// 27/04/2026 (Meta trả lỗi 100) — đừng thêm lại.

export const H24 = 24 * 3600 * 1000;
export const D7 = 7 * 24 * 3600 * 1000;

export const NHOM_LABEL = {
  "24h": "Trong 24 giờ",
  "7d": "24 giờ – 7 ngày",
  cu: "Quá 7 ngày",
};

// Từ 1 hội thoại Graph (/{page}/conversations, fields participants + messages{from,created_time})
// rút ra: khách là ai, lần cuối KHÁCH nhắn lúc nào. Cửa sổ 24h tính theo tin của KHÁCH,
// không phải tin cuối cùng của hội thoại (Page nhắn sau không mở lại cửa sổ).
export function rutHoiThoai(conv, pageId) {
  const pid = String(pageId);
  const people = ((conv.participants && conv.participants.data) || []).filter((p) => String(p.id) !== pid);
  const khach = people[0] || {};
  let lastKhach = null;
  for (const m of (conv.messages && conv.messages.data) || []) {
    if (!m || !m.from || String(m.from.id) === pid) continue;
    const t = Date.parse(m.created_time);
    if (!Number.isNaN(t) && (lastKhach === null || t > lastKhach)) lastKhach = t;
  }
  return {
    conv_id: conv.id,
    psid: khach.id ? String(khach.id) : "",
    name: khach.name || "",
    updated: conv.updated_time || "",
    snippet: conv.snippet || "",
    // null = trong mấy tin gần nhất không có tin nào của khách → không biết chắc → xếp "cu".
    last_customer: lastKhach === null ? null : new Date(lastKhach).toISOString(),
  };
}

export function phanNhom(lastCustomerIso, now = Date.now()) {
  if (!lastCustomerIso) return "cu";
  const t = Date.parse(lastCustomerIso);
  if (Number.isNaN(t)) return "cu";
  const age = now - t;
  if (age < H24) return "24h";
  if (age < D7) return "7d";
  return "cu";
}

// Thay {ten} bằng tên khách. Tên rỗng thì bỏ luôn khoảng trắng thừa ("Chào {ten}," → "Chào,").
export function caNhanHoa(text, name) {
  const ten = String(name || "").trim();
  return String(text || "")
    .replace(/\s*\{ten\}/g, (m) => (ten ? m.replace("{ten}", ten) : ""))
    .trim();
}

// Payload gửi POST /{page_id}/messages cho 1 khách. Trả { body } hoặc { skip: "lý do" }.
// opts: { text, humanAgent:bool, template:{ name, language, params:[...] } }
export function taoPayload(row, nhom, opts) {
  const recipient = { id: row.psid };
  if (!row.psid) return { skip: "Không có PSID khách" };
  if (nhom === "24h" || (nhom === "7d" && opts.humanAgent)) {
    const text = caNhanHoa(opts.text, row.name);
    if (!text) return { skip: "Chưa nhập nội dung" };
    if (text.length > 2000) return { skip: "Nội dung quá 2000 ký tự" };
    return nhom === "24h"
      ? { body: { recipient, messaging_type: "RESPONSE", message: { text } } }
      : { body: { recipient, messaging_type: "MESSAGE_TAG", tag: "HUMAN_AGENT", message: { text } } };
  }
  if (nhom === "7d" && !opts.template) return { skip: "Quá 24 giờ: bật HUMAN_AGENT hoặc chọn mẫu Utility" };
  const tpl = opts.template;
  if (!tpl || !tpl.name) return { skip: "Quá 7 ngày: chỉ gửi được bằng mẫu Utility" };
  const params = (tpl.params || []).map((p) => ({
    type: "text",
    parameter_name: p,
    // Tham số duy nhất tự điền được là tên khách — mẫu cần số đơn/mã vận đơn thì không gửi
    // hàng loạt được (mỗi khách một giá trị), báo lỗi thay vì gửi tin trống.
    text: p === "customer_name" ? (String(row.name || "").trim() || "bạn") : "",
  }));
  if (params.some((p) => !p.text)) return { skip: `Mẫu cần tham số không tự điền được: ${tpl.params.join(", ")}` };
  const message = { template: { name: tpl.name, language: { code: tpl.language || "vi" } } };
  if (params.length) message.template.components = [{ type: "body", parameters: params }];
  return { body: { recipient, messaging_type: "UTILITY", message } };
}

// Lấy danh sách tham số {{ten_tham_so}} trong thân mẫu (mẫu NAMED).
export function thamSoMau(bodyText) {
  const out = [];
  for (const m of String(bodyText || "").matchAll(/\{\{\s*([a-z_][a-z0-9_]*)\s*\}\}/g)) {
    if (!out.includes(m[1])) out.push(m[1]);
  }
  return out;
}

// Tên mẫu Meta chỉ nhận chữ thường, số, gạch dưới.
export function tenMauHopLe(name) {
  return /^[a-z0-9_]{1,512}$/.test(String(name || ""));
}

export function demNhom(rows, now = Date.now()) {
  const c = { "24h": 0, "7d": 0, cu: 0 };
  for (const r of rows) c[phanNhom(r.last_customer, now)]++;
  return c;
}
