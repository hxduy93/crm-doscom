import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

// Có HAI đường deploy lên Cloudflare Pages:
//   deploy.yml       — khi push code lên master
//   refresh-data.yml — khi cron kéo dữ liệu mới (3 lần/ngày, do Cloudflare Worker dispatch)
// Đường thứ hai từng THIẾU cổng test và chép tay lại danh sách file, nên:
//   · code hỏng vẫn lên web qua đường cron
//   · thêm trang mới vào deploy.yml mà quên refresh-data.yml → cron deploy đè, XOÁ MẤT trang đó
// Test này canh cả hai đường luôn dùng chung scripts/build-dist.sh và đều có cổng test.

const dir = new URL("../.github/workflows/", import.meta.url);
const deploy = readFileSync(new URL("deploy.yml", dir), "utf8");
const refresh = readFileSync(new URL("refresh-data.yml", dir), "utf8");
const buildSh = readFileSync(new URL("../scripts/build-dist.sh", import.meta.url), "utf8");

test("cả hai workflow dựng dist bằng scripts/build-dist.sh", () => {
  for (const [name, wf] of [["deploy.yml", deploy], ["refresh-data.yml", refresh]]) {
    assert.match(wf, /bash scripts\/build-dist\.sh/, name + " không gọi build-dist.sh");
  }
});

test("không workflow nào chép tay lại danh sách trang", () => {
  for (const [name, wf] of [["deploy.yml", deploy], ["refresh-data.yml", refresh]]) {
    assert.doesNotMatch(wf, /for page in .*\.html/, name + " lại chép tay danh sách trang — sẽ lệch");
    assert.doesNotMatch(wf, /rm -rf dist/, name + " tự dựng dist thay vì dùng script chung");
  }
});

test("cả hai đường deploy đều qua cổng test", () => {
  for (const [name, wf] of [["deploy.yml", deploy], ["refresh-data.yml", refresh]]) {
    assert.match(wf, /node --test tests\/\*\.mjs/, name + " deploy mà KHÔNG chạy test");
  }
});

test("build-dist.sh dừng ngay khi lỗi, không deploy dist thiếu file", () => {
  assert.match(buildSh, /set -euo pipefail/, "thiếu set -e → lỗi copy vẫn deploy tiếp");
});

test("build-dist.sh có copy đủ những thứ web cần", () => {
  for (const must of ["index.html", "data", "demos", "_headers"]) {
    assert.match(buildSh, new RegExp(must.replace(".", "\\.")), "thiếu " + must);
  }
  // 6 trang standalone nhúng iframe trong CRM
  for (const page of ["agent-geo-doscom.html", "ads-creator.html", "product-publisher.html",
    "brandcore-fix.html", "fix-images.html", "sync-us.html"]) {
    assert.match(buildSh, new RegExp(page.replace(/\./g, "\\.")), "thiếu trang " + page);
  }
});
