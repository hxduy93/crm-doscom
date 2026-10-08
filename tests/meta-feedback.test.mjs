// Module "Đẩy đơn về Meta": luật xếp loại trạng thái và luật bật hộp thoại.
//
// Vì sao phải có test: đây là phần KHÔNG thể thử bằng cách mở trang. Muốn thấy
// trạng thái "đã ngừng" thì phải đợi job ngừng thật 26 tiếng; muốn thấy "token
// chết" thì phải đợi token hết hạn. Mà xếp sai thì hậu quả đúng bằng việc không
// có module: đường đẩy chết mà không ai được báo.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { xepLoai } from "../functions/api/health/meta-feedback.js";

const GIO = 3600;
const NOW = 1760000000;
const TOKEN_OK = { tinhTrang: "ok" };
const TOKEN_CHET = { tinhTrang: "chet", note: "token hết hạn" };
const TOKEN_CHUA_CO = { tinhTrang: "chua_co" };
const SACH = { tong7: 10, ok7: 10, loi7: 0, loi24: 0 };

test("chưa chạy lần nào → 'chua_bat' và KHÔNG bật hộp thoại", () => {
  // Lúc mới dựng, job chưa chạy là bình thường. Bật popup ở đây thì ngày nào mở
  // CRM cũng bị chặn mặt bằng một tin không cần hành động → người dùng học cách
  // bấm "Để sau" theo phản xạ, và lần hỏng thật cũng bị bấm qua luôn.
  const r = xepLoai({ nhip: null, token: TOKEN_OK, nhatKy: { tong7: 0, ok7: 0, loi7: 0, loi24: 0 }, now: NOW });
  assert.equal(r.state, "chua_bat");
  assert.equal(r.popup, false);
});

test("chạy 2 giờ trước, không lỗi → 'ok', không hộp thoại", () => {
  const r = xepLoai({ nhip: { at: NOW - 2 * GIO, ok: 10, fail: 0 }, token: TOKEN_OK, nhatKy: SACH, now: NOW });
  assert.equal(r.state, "ok");
  assert.equal(r.popup, false);
  assert.match(r.lines.join(" "), /7 ngày qua: 10 đơn/);
});

test("job ngừng quá 26 giờ → 'tre' và BẬT hộp thoại", () => {
  const r = xepLoai({ nhip: { at: NOW - 40 * GIO, ok: 10, fail: 0 }, token: TOKEN_OK, nhatKy: SACH, now: NOW });
  assert.equal(r.state, "tre");
  assert.equal(r.popup, true);
  assert.match(r.lines.join(" "), /không chạy đã 40 giờ/);
});

test("đúng ngưỡng 26 giờ vẫn chưa coi là ngừng", () => {
  // Cron chạy 9h và 15h mỗi ngày → khoảng cách dài nhất giữa hai lượt là 18 giờ.
  // Ngưỡng 26 giờ chừa 8 tiếng trễ; sát ngưỡng thì chưa báo, vượt mới báo.
  const vua = xepLoai({ nhip: { at: NOW - 26 * GIO, ok: 5, fail: 0 }, token: TOKEN_OK, nhatKy: SACH, now: NOW });
  assert.equal(vua.state, "ok");
  const qua = xepLoai({ nhip: { at: NOW - 27 * GIO, ok: 5, fail: 0 }, token: TOKEN_OK, nhatKy: SACH, now: NOW });
  assert.equal(qua.state, "tre");
});

test("token chết → 'hong', ghi đè cả trạng thái chạy đúng giờ", () => {
  const r = xepLoai({ nhip: { at: NOW - 2 * GIO, ok: 10, fail: 0 }, token: TOKEN_CHET, nhatKy: SACH, now: NOW });
  assert.equal(r.state, "hong");
  assert.equal(r.popup, true);
  assert.match(r.lines.join(" "), /không ghi được vào pixel/);
});

test("có đơn bị Meta từ chối trong 24h → 'hong'", () => {
  const r = xepLoai({
    nhip: { at: NOW - 2 * GIO, ok: 9, fail: 1 },
    token: TOKEN_OK, nhatKy: { ...SACH, loi24: 1 }, now: NOW,
  });
  assert.equal(r.state, "hong");
  assert.equal(r.popup, true);
  assert.match(r.lines.join(" "), /1 đơn bị Meta từ chối/);
});

test("thiếu secret token → 'khong_ro', KHÔNG bật hộp thoại", () => {
  // Không kiểm được khác với biết là hỏng. Báo trên màn hình module thì đúng,
  // chặn mặt bằng hộp thoại thì sai — chưa có bằng chứng nào là đường đẩy chết.
  const r = xepLoai({ nhip: { at: NOW - 2 * GIO, ok: 10, fail: 0 }, token: TOKEN_CHUA_CO, nhatKy: SACH, now: NOW });
  assert.equal(r.state, "khong_ro");
  assert.equal(r.popup, false);
});

test("lỗi nặng ghi đè lỗi nhẹ: vừa ngừng chạy vừa token chết → 'hong'", () => {
  const r = xepLoai({ nhip: { at: NOW - 40 * GIO, ok: 0, fail: 0 }, token: TOKEN_CHET, nhatKy: SACH, now: NOW });
  assert.equal(r.state, "hong");
  // Vẫn phải nói CẢ HAI chuyện, không được im một cái.
  const chu = r.lines.join(" ");
  assert.match(chu, /không chạy đã 40 giờ/);
  assert.match(chu, /không ghi được vào pixel/);
});

test("module được nối đủ vào CRM: nav, view, tên, hộp thoại", () => {
  const root = new URL("../", import.meta.url);
  const index = readFileSync(new URL("index.html", root), "utf8");
  assert.match(index, /data-view="meta-feedback"/);
  assert.match(index, /id="view-meta-feedback"/);
  assert.match(index, /'meta-feedback':'Đẩy đơn về Meta'/);
  // Hộp thoại phải gọi đúng endpoint và chỉ bật theo cờ popup của server —
  // KHÔNG tự suy từ state ở phía trình duyệt, để luật nằm một chỗ duy nhất.
  assert.match(index, /\/api\/health\/meta-feedback/);
  assert.match(index, /if\(!j\|\|!j\.popup\) return;/);
});
