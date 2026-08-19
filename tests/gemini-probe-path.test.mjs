import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

/* Health check của Gemini phải đi CÙNG ĐƯỜNG với phần quét GEO (qua Cloudflare AI Gateway).

   Sự cố 19/08/2026: bản cũ gọi thẳng generativelanguage.googleapis.com từ Worker. Worker của
   tài khoản này chạy ở colo Hong Kong, Google chặn Gemini theo vị trí địa lý → 400
   "User location is not supported", và code quy mọi 400 thành "key chết". Banner đỏ "Gemini
   KEY CHẾT" trong khi geo_runs ghi 372 lượt quét Gemini liên tiếp không lỗi. Báo động giả
   khiến người ta đi thay key thay vì tìm lỗi thật.

   Test canh 2 việc: đi đúng đường, và phân biệt được "key chết" với "bị chặn vị trí". */

const src = readFileSync(new URL("../functions/lib/keyHealth.js", import.meta.url), "utf8");
const probe = src.slice(src.indexOf("async function probeGemini"), src.indexOf("async function probeGoogleSA"));

test("probe Gemini đi qua AI Gateway, không gọi thẳng Google từ Worker", () => {
  assert.match(probe, /gateway\.ai\.cloudflare\.com/, "probe không còn đi qua AI Gateway");
  assert.match(probe, /doscom-erp\/google-ai-studio/, "sai gateway/provider path so với phần quét GEO");
});

test("đọc nội dung lỗi Google trả về, không quy hết 400 thành key chết", () => {
  assert.match(probe, /error\?\.message/, "không đọc message của Google → mất manh mối");
  assert.match(probe, /api key not valid/i, "thiếu nhánh nhận diện key chết thật");
  assert.match(probe, /user location is not supported/i, "thiếu nhánh nhận diện chặn theo vị trí");
});

test("bị chặn vị trí KHÔNG được xếp là 'dead' — chỉ 'dead' khi Google nói key sai", () => {
  const locBranch = probe.slice(probe.indexOf("user location is not supported"));
  const firstReturn = locBranch.slice(0, locBranch.indexOf("}") + 1);
  assert.match(firstReturn, /status: "unknown"/, "chặn vị trí mà báo 'dead' là đẩy người ta đi thay key oan");
});
