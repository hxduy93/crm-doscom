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

test("probe Gemini KHÔNG gọi thẳng Google từ Worker mà đi qua lib/ai-endpoint.js", () => {
  // 19/08/2026 (bản 2): đường ra do lib/ai-endpoint.js chọn — proxy ghim vùng Bắc Mỹ nếu có
  // (worker ai-proxy), không có thì AI Gateway. Gọi thẳng generativelanguage.googleapis.com
  // từ Worker là dính chặn vị trí, đó là cả gốc rễ vụ này.
  assert.match(probe, /googleAiBase\(env\)/, "probe không dùng bộ chọn đường chung");
  assert.match(probe, /proxyHeaders\(env\)/, "thiếu header xác thực với proxy");
  assert.doesNotMatch(probe, /https:\/\/generativelanguage\.googleapis\.com/,
    "vẫn còn gọi thẳng Google trong probe");

  const helper = readFileSync(new URL("../functions/lib/ai-endpoint.js", import.meta.url), "utf8");
  assert.match(helper, /AI_PROXY_URL/, "helper mất cấu hình proxy");
  assert.match(helper, /gateway\.ai\.cloudflare\.com/, "helper phải còn đường lui AI Gateway khi chưa cấu hình proxy");
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
