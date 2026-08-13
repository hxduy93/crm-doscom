// Bộ lọc thời gian của menu TikTok Shop: hôm nay / hôm qua / tuần này / tháng này.
//
// Vì sao cần test: mọi mốc đều tính theo GIỜ VN (UTC+7) trong khi Worker chạy theo UTC.
// Lúc 0h–7h sáng giờ VN thì ngày UTC vẫn là hôm qua — đúng khung giờ mà cron và người
// mở dashboard sớm hay chạm vào. Tuần lại phải bắt đầu từ THỨ HAI, không phải chủ nhật
// như mặc định của JS. Cả hai chỗ sai đều ra số "hợp lý" nên nhìn mắt thường không bắt được.
import test from "node:test";
import assert from "node:assert/strict";
import { khoangKy } from "../functions/api/lark/tiktok-videos.js";

// Mốc test: 13/08/2026 là THỨ NĂM.
const luc = (iso) => Date.parse(iso);
const TRUA_THU_NAM = luc("2026-08-13T05:00:00Z");   // 12:00 giờ VN
const RANG_THU_NAM = luc("2026-08-13T00:30:00Z");   // 07:30 giờ VN — UTC vẫn 13/08
const NUA_DEM_VN = luc("2026-08-12T17:30:00Z");     // 00:30 ngày 13/08 giờ VN, UTC còn 12/08

test("hôm nay / hôm qua theo giờ VN, không theo UTC", () => {
  assert.deepEqual(khoangKy("hom-nay", 14, TRUA_THU_NAM), { start: "2026-08-13", end: "2026-08-13", nhan: "hôm nay" });
  assert.deepEqual(khoangKy("hom-qua", 14, TRUA_THU_NAM), { start: "2026-08-12", end: "2026-08-12", nhan: "hôm qua" });
  // 00:30 giờ VN: UTC vẫn đang là 12/08. Nếu quên +7 giờ thì "hôm nay" ra 12/08 — sai cả ngày.
  assert.equal(khoangKy("hom-nay", 14, NUA_DEM_VN).start, "2026-08-13");
  assert.equal(khoangKy("hom-qua", 14, NUA_DEM_VN).start, "2026-08-12");
  assert.equal(khoangKy("hom-nay", 14, RANG_THU_NAM).start, "2026-08-13");
});

test("kỳ 1 ngày luôn có start === end (giao diện dựa vào đó để ghi nhãn gọn)", () => {
  for (const k of ["hom-nay", "hom-qua"]) {
    const r = khoangKy(k, 14, TRUA_THU_NAM);
    assert.equal(r.start, r.end, `${k} phải là khoảng 1 ngày`);
  }
});

test("tuần này bắt đầu THỨ HAI, không phải chủ nhật", () => {
  // Thứ năm 13/08 → thứ hai 10/08.
  assert.deepEqual(khoangKy("tuan-nay", 14, TRUA_THU_NAM), { start: "2026-08-10", end: "2026-08-13", nhan: "tuần này" });
  // Chủ nhật 16/08 vẫn thuộc tuần bắt đầu 10/08 — chỗ này mà sai thì chủ nhật hiện tuần mới rỗng.
  const cn = khoangKy("tuan-nay", 14, luc("2026-08-16T05:00:00Z"));
  assert.deepEqual(cn, { start: "2026-08-10", end: "2026-08-16", nhan: "tuần này" });
  // Đúng thứ hai 17/08 mới sang tuần mới, và là khoảng 1 ngày.
  const t2 = khoangKy("tuan-nay", 14, luc("2026-08-17T05:00:00Z"));
  assert.deepEqual(t2, { start: "2026-08-17", end: "2026-08-17", nhan: "tuần này" });
});

test("tháng này = mùng 1 tới hôm nay, kể cả khi hôm nay LÀ mùng 1", () => {
  assert.deepEqual(khoangKy("thang-nay", 14, TRUA_THU_NAM), { start: "2026-08-01", end: "2026-08-13", nhan: "tháng này" });
  const mung1 = khoangKy("thang-nay", 14, luc("2026-09-01T05:00:00Z"));
  assert.deepEqual(mung1, { start: "2026-09-01", end: "2026-09-01", nhan: "tháng này" });
  // 00:30 ngày 01/09 giờ VN (UTC còn 31/08) → vẫn phải là tháng 9, không tụt về 01/08.
  assert.equal(khoangKy("thang-nay", 14, luc("2026-08-31T17:30:00Z")).start, "2026-09-01");
});

test("không truyền kỳ có tên → giữ nguyên đường cũ N ngày gần nhất", () => {
  assert.deepEqual(khoangKy("", 14, TRUA_THU_NAM), { start: "2026-07-30", end: "2026-08-13", nhan: "14 ngày" });
  assert.deepEqual(khoangKy("", 7, TRUA_THU_NAM), { start: "2026-08-06", end: "2026-08-13", nhan: "7 ngày" });
  // Kỳ lạ hoắc cũng rơi về đường cũ chứ không ném lỗi hay trả khoảng rỗng.
  assert.equal(khoangKy("nam-ngoai", 30, TRUA_THU_NAM).start, "2026-07-14");
});

test("start không bao giờ lớn hơn end", () => {
  for (const k of ["hom-nay", "hom-qua", "tuan-nay", "thang-nay", ""]) {
    for (const t of [TRUA_THU_NAM, RANG_THU_NAM, NUA_DEM_VN, luc("2026-09-01T05:00:00Z")]) {
      const r = khoangKy(k, 14, t);
      assert.ok(r.start <= r.end, `${k}: ${r.start} > ${r.end}`);
    }
  }
});
