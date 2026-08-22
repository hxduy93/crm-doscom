import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

/* Canh lỗi "vùng chết biến" (temporal dead zone) trong create-campaign.js.

   22/08/2026 chủ dự án gặp:
     [create_ads] [Ad #1 - thêm vào ad set sẵn có]
     Cannot access 'currentAdSubStep' before initialization

   Nguyên nhân: nhánh `cfg.existing_adset_id` (thêm creative vào ad set đang chạy)
   gọi createAdForAdset() rồi THOÁT SỚM. Hàm đó gán `currentAdSubStep`, nhưng biến
   được khai bằng `let` ở PHÍA DƯỚI nhánh này nên chưa khởi tạo → ném lỗi ngay.
   Hàm khai bằng `function` thì được kéo lên đầu (gọi được), còn `let` thì KHÔNG —
   đó là chỗ đánh lừa.

   Hậu quả: tính năng "đổ vào ad set đang chạy" hỏng 100% từ lúc ra đời (05/08/2026).
   Cú pháp vẫn hợp lệ nên `node --check` không bắt được — chỉ lộ khi chạy thật.
*/
const SRC = readFileSync(new URL("../functions/api/create-campaign.js", import.meta.url), "utf8")
  .split("\r\n").join("\n");

test("biến trạng thái phải khai TRƯỚC mọi nhánh gọi createAdForAdset", () => {
  const iKhai = SRC.indexOf("let currentAdSubStep");
  const iKhaiIdx = SRC.indexOf("let currentAdIndex");
  assert.ok(iKhai > 0 && iKhaiIdx > 0, "mất khai báo biến trạng thái");

  /* Chỉ bắt LỆNH GỌI THẬT (`await createAdForAdset(`). Bản test đầu tiên của tôi
     dò mọi chỗ có chữ "createAdForAdset(" nên bắt nhầm cả tên hàm trong CHÚ THÍCH
     nằm phía trên khai báo → báo đỏ trên chính bản đã sửa. */
  const viTriGoi = [];
  const re = /await\s+createAdForAdset\s*\(/g;
  let m;
  while ((m = re.exec(SRC))) viTriGoi.push(m.index);
  assert.ok(viTriGoi.length >= 2, "phải có ít nhất 2 chỗ gọi (ad set mới + ad set sẵn có)");
  for (const v of viTriGoi) {
    assert.ok(v > iKhai && v > iKhaiIdx,
      "có chỗ gọi createAdForAdset nằm TRƯỚC khai báo let → sẽ ném " +
      "\"Cannot access 'currentAdSubStep' before initialization\" khi chạy thật");
  }
});

test("nhánh 'đổ vào ad set đang chạy' vẫn còn và vẫn thoát sớm", () => {
  // Đây là nhánh đã hỏng — giữ test để nếu ai viết lại thì vẫn bị soi thứ tự khai báo.
  const i = SRC.indexOf("if (cfg.existing_adset_id)");
  assert.ok(i > 0, "mất nhánh thêm creative vào ad set đang chạy");
  assert.ok(SRC.indexOf("let currentAdSubStep") < i,
    "khai báo phải đứng trước nhánh này");
  assert.match(SRC.slice(i, i + 1600), /reused_adset: true/,
    "nhánh này phải trả reused_adset để UI biết là không tạo campaign mới");
});

test("giữ nguyên tắc KHÔNG đụng ngân sách ad set đang chạy", () => {
  // Sửa ngân sách là reset giai đoạn máy học — đúng thứ tính năng này sinh ra để tránh.
  const i = SRC.indexOf("if (cfg.existing_adset_id)");
  const khoi = SRC.slice(i, SRC.indexOf("return json(", i));
  assert.ok(!/withAdsetBudget|daily_budget|lifetime_budget/.test(khoi),
    "nhánh dùng lại ad set KHÔNG được sửa ngân sách");
});
