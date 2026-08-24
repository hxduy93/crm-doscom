// Test cho nút "Cập nhật dữ liệu" (openspec/changes/refresh-button).
// Chạy: node --test tests/*.mjs
//
// CỐ Ý không gọi endpoint thật: /api/refresh/* được chính runner gọi TRƯỚC khi deploy
// (bước "Chạy test" đứng trước bước "Deploy"), nên test dựa vào endpoint live sẽ đỏ ở
// đúng lần deploy sinh ra nó — vòng lặp chết như đã ghi trong tests/noma120.test.mjs.
// Ở đây dựng D1 giả trong bộ nhớ và gọi thẳng handler.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import { onRequestPost as requestPost } from "../functions/api/refresh/request.js";
import { onRequestGet as nextGet } from "../functions/api/refresh/next.js";
import { onRequestPost as reportPost } from "../functions/api/refresh/report.js";
import { onRequestGet as statusGet } from "../functions/api/refresh/status.js";
import { STEPS, STALE_SECONDS, NOMA_LANDINGS } from "../functions/api/refresh/_lib.js";

const TOKEN = "test-runner-token";

// ── D1 giả ──────────────────────────────────────────────────────────────────
// Chỉ hiểu đúng những câu lệnh mà 4 endpoint dùng. Không phải SQLite thật — mục đích là
// canh LUỒNG TRẠNG THÁI (pending → running → done/failed/stale), không phải canh SQL.
function makeDB(state) {
  const now = () => Math.floor(Date.now() / 1000);
  return {
    prepare(sql) {
      let args = [];
      const api = {
        bind(...a) { args = a; return api; },
        async first() {
          if (/FROM refresh_jobs WHERE status IN \('pending','running'\)/.test(sql)) {
            return [...state.jobs].reverse().find(j => j.status === "pending" || j.status === "running") || null;
          }
          if (/FROM refresh_jobs WHERE status = 'pending'/.test(sql)) {
            return state.jobs.find(j => j.status === "pending") || null;
          }
          if (/FROM refresh_jobs WHERE id = \?/.test(sql)) {
            return state.jobs.find(j => j.id === args[0]) || null;
          }
          if (/FROM refresh_jobs ORDER BY id DESC/.test(sql)) {
            return state.jobs.length ? state.jobs[state.jobs.length - 1] : null;
          }
          if (/FROM refresh_runner_state/.test(sql)) return state.runner;
          return null;
        },
        async run() {
          if (/^\s*UPDATE refresh_jobs SET status='stale'/.test(sql)) {
            const cutoff = args[1];
            for (const j of state.jobs) {
              if ((j.status === "pending" || j.status === "running") && (j.started_at ?? j.created_at) < cutoff) {
                j.status = "stale"; j.finished_at = args[0];
              }
            }
            return { meta: {} };
          }
          if (/INSERT INTO refresh_jobs/.test(sql)) {
            const job = {
              id: state.jobs.length + 1, status: "pending", created_at: args[0],
              started_at: null, finished_at: null, current_step: 0, current_step_name: null,
              total_steps: args[1], warnings: 0, warning_text: null,
              error_step: null, error_log: null, requested_by: args[2],
            };
            state.jobs.push(job);
            return { meta: { last_row_id: job.id } };
          }
          if (/INSERT INTO refresh_runner_state/.test(sql)) {
            state.runner = { last_seen_at: args[0], runner_version: args[1] };
            return { meta: {} };
          }
          if (/UPDATE refresh_jobs SET status='running'/.test(sql)) {
            const j = state.jobs.find(x => x.id === args[2]);
            if (j) { j.status = "running"; j.started_at = args[0]; j.total_steps = args[1]; }
            return { meta: {} };
          }
          if (/SET status='failed'/.test(sql)) {
            const j = state.jobs.find(x => x.id === args[6]);
            if (j) {
              j.status = "failed"; j.finished_at = args[0]; j.current_step = args[1];
              j.current_step_name = args[2]; j.error_step = args[3]; j.error_log = args[4];
              j.warnings = args[5];
            }
            return { meta: {} };
          }
          if (/SET status='done'/.test(sql)) {
            const j = state.jobs.find(x => x.id === args[5]);
            if (j) {
              j.status = "done"; j.finished_at = args[0]; j.current_step = args[1];
              j.current_step_name = args[2]; j.warnings = args[3]; j.warning_text = args[4];
            }
            return { meta: {} };
          }
          if (/SET current_step=\?/.test(sql)) {
            const j = state.jobs.find(x => x.id === args[5]);
            if (j) {
              j.current_step = args[0]; j.current_step_name = args[1];
              j.warnings = (j.warnings || 0) + args[2];
              if (args[3]) j.warning_text = ((j.warning_text || "") + "\n" + args[3]).trim();
            }
            return { meta: {} };
          }
          return { meta: {} };
        },
      };
      return api;
    },
    _now: now,
  };
}

function makeEnv(state) {
  return { DB: makeDB(state), REFRESH_RUNNER_TOKEN: TOKEN };
}

const req = (url, opts = {}) => new Request(url, opts);
const withToken = (t = TOKEN) => ({ headers: { "X-Refresh-Token": t } });

// ── 1. Một job tại một thời điểm ────────────────────────────────────────────
// Hai lượt pipeline cùng ghi data/*.json rồi cùng deploy là đúng kiểu race đã làm hỏng
// workflow GitHub trước đây (2 workflow cùng cron → push reject).
test("bấm nút lần 2 khi đang chạy: KHÔNG tạo job mới, trả lại job đang chạy", async () => {
  const state = { jobs: [], runner: null };
  const env = makeEnv(state);

  const r1 = await (await requestPost({ request: req("https://x/api/refresh/request", { method: "POST" }), env })).json();
  assert.equal(r1.ok, true);
  assert.equal(r1.data.already_running, false);
  assert.equal(state.jobs.length, 1);

  const r2 = await (await requestPost({ request: req("https://x/api/refresh/request", { method: "POST" }), env })).json();
  assert.equal(r2.data.already_running, true);
  assert.equal(r2.data.job_id, r1.data.job_id);
  assert.equal(state.jobs.length, 1, "không được tạo job thứ hai");
});

test("job treo quá 90 phút bị đánh dấu stale và cho bấm nút lại", async () => {
  const old = Math.floor(Date.now() / 1000) - STALE_SECONDS - 60;
  const state = {
    jobs: [{ id: 1, status: "running", created_at: old, started_at: old, current_step: 3, total_steps: 13, warnings: 0 }],
    runner: null,
  };
  const env = makeEnv(state);

  const r = await (await requestPost({ request: req("https://x/api/refresh/request", { method: "POST" }), env })).json();
  assert.equal(state.jobs[0].status, "stale", "job cũ phải thành stale");
  assert.equal(r.data.already_running, false, "phải cho tạo job mới");
  assert.equal(state.jobs.length, 2);
});

// ── 2. Token ────────────────────────────────────────────────────────────────
test("endpoint runner trả 401 khi sai token hoặc thiếu token", async () => {
  const state = { jobs: [{ id: 1, status: "pending", created_at: Math.floor(Date.now() / 1000), total_steps: 13 }], runner: null };
  const env = makeEnv(state);

  for (const opts of [{}, withToken("sai-token")]) {
    const res = await nextGet({ request: req("https://x/api/refresh/next", opts), env });
    assert.equal(res.status, 401);
    const body = await res.json();
    assert.equal(body.ok, false);
    assert.ok(!("data" in body), "401 không được tiết lộ có job hay không");
  }
  assert.equal(state.jobs[0].status, "pending", "sai token thì không được đụng vào job");

  const res2 = await reportPost({
    request: req("https://x/api/refresh/report", { method: "POST", body: "{}" }), env,
  });
  assert.equal(res2.status, 401);
});

// ── 3. Luồng trạng thái ─────────────────────────────────────────────────────
test("runner nhận job: pending → running, và ghi nhịp tim kể cả khi không có job", async () => {
  const state = { jobs: [], runner: null };
  const env = makeEnv(state);

  const empty = await (await nextGet({ request: req("https://x/api/refresh/next?v=1.0", withToken()), env })).json();
  assert.equal(empty.data, null);
  assert.ok(state.runner && state.runner.last_seen_at > 0, "phải ghi nhịp tim dù không có job");

  await requestPost({ request: req("https://x/api/refresh/request", { method: "POST" }), env });
  const got = await (await nextGet({ request: req("https://x/api/refresh/next?v=1.0", withToken()), env })).json();
  assert.equal(got.data.job_id, 1);
  assert.equal(state.jobs[0].status, "running");
  assert.equal(got.data.steps.length, STEPS.length);
  assert.deepEqual(got.data.noma_landings, NOMA_LANDINGS);
});

test("báo bước lỗi: job thành failed, giữ tên bước và log", async () => {
  const ts = Math.floor(Date.now() / 1000);
  const state = { jobs: [{ id: 1, status: "running", created_at: ts, started_at: ts, current_step: 0, total_steps: 13, warnings: 0 }], runner: null };
  const env = makeEnv(state);

  const body = JSON.stringify({ job_id: 1, step_index: 12, step: "Chạy test", status: "failed", message: "x".repeat(5000) });
  const res = await reportPost({ request: req("https://x/api/refresh/report", { method: "POST", body, ...withToken() }), env });
  assert.equal(res.status, 200);

  const j = state.jobs[0];
  assert.equal(j.status, "failed");
  assert.equal(j.error_step, "Chạy test");
  assert.equal(j.error_log.length, 2000, "log phải cắt còn 2000 ký tự cuối");
});

// Lỗi đã dính khi kiểm thử thật 17/08/2026: runner gửi warnings=0 ở lần báo "done",
// mà nhánh done GHI ĐÈ cột warnings (không cộng dồn) → mọi cảnh báo tích luỹ ở các bước
// trước bị xoá sạch, giao diện báo "xong" trơn tru dù có SKIP. Runner nay gửi TỔNG.
test("báo done phải mang TỔNG cảnh báo, không được xoá cảnh báo các bước trước", async () => {
  const ts = Math.floor(Date.now() / 1000);
  const state = { jobs: [{ id: 1, status: "running", created_at: ts, started_at: ts, current_step: 0, total_steps: 13, warnings: 0 }], runner: null };
  const env = makeEnv(state);
  const post = (b) => reportPost({ request: req("https://x/api/refresh/report", { method: "POST", body: JSON.stringify(b), ...withToken() }), env });

  await post({ job_id: 1, step_index: 2, step: "Facebook Ads", status: "ok", warnings: 2, message: "2 SKIP" });
  assert.equal(state.jobs[0].warnings, 2);

  await post({ job_id: 1, step_index: 13, step: "Hoàn tất", status: "done", warnings: 2, message: "tổng kết" });
  assert.equal(state.jobs[0].warnings, 2, "done không được đưa warnings về 0");
});

test("báo done kèm cảnh báo: job done nhưng warnings được giữ", async () => {
  const ts = Math.floor(Date.now() / 1000);
  const state = { jobs: [{ id: 1, status: "running", created_at: ts, started_at: ts, current_step: 12, total_steps: 13, warnings: 0 }], runner: null };
  const env = makeEnv(state);

  const body = JSON.stringify({ job_id: 1, step_index: 13, step: "Hoàn tất", status: "done", warnings: 0, message: "Ráp dashboard : SKIP ad-level 764394829882083" });
  await reportPost({ request: req("https://x/api/refresh/report", { method: "POST", body, ...withToken() }), env });

  assert.equal(state.jobs[0].status, "done");
  assert.match(state.jobs[0].warning_text, /764394829882083/);
});

// Trong lúc chạy job ~40 phút, runner KHÔNG gọi /next lần nào. Nếu nhịp tim chỉ đến từ
// /next thì giao diện sẽ báo "runner chưa chạy" ngay giữa lúc runner đang chạy thật.
test("báo cáo bước cũng làm tươi nhịp tim của runner", async () => {
  const ts = Math.floor(Date.now() / 1000);
  const state = {
    jobs: [{ id: 1, status: "running", created_at: ts, started_at: ts, current_step: 0, total_steps: 13, warnings: 0 }],
    runner: { last_seen_at: ts - 30 * 60, runner_version: "1.0" },
  };
  const env = makeEnv(state);

  await reportPost({
    request: req("https://x/api/refresh/report", {
      method: "POST", body: JSON.stringify({ job_id: 1, step_index: 8, step: "Contacts CRM Pancake", status: "ok" }), ...withToken(),
    }), env,
  });

  assert.ok(state.runner.last_seen_at >= ts, "nhịp tim phải được cập nhật khi runner báo bước");
});

test("status trả runner offline khi nhịp tim quá 5 phút", async () => {
  const ts = Math.floor(Date.now() / 1000);
  const state = { jobs: [], runner: { last_seen_at: ts - 6 * 60, runner_version: "1.0" } };
  const env = makeEnv(state);

  const s = await (await statusGet({ env })).json();
  assert.equal(s.data.runner.online, false);

  state.runner.last_seen_at = ts - 30;
  const s2 = await (await statusGet({ env })).json();
  assert.equal(s2.data.runner.online, true);
});

// ── 4. Danh sách bước ───────────────────────────────────────────────────────
// Runner chỉ chạy đúng danh sách cố định này, KHÔNG nhận lệnh tuỳ ý từ D1. Đó là thứ
// giới hạn thiệt hại nếu token runner lộ.
test("danh sách bước: khoá đúng thứ tự CI, không trùng key, deploy phải đứng sau test", async () => {
  const keys = STEPS.map(s => s.key);
  assert.equal(new Set(keys).size, keys.length, "key bị trùng");
  assert.equal(keys[0], "pancake_revenue", "doanh thu Pancake phải chạy đầu như CI");
  assert.equal(keys[keys.length - 1], "deploy", "deploy phải là bước cuối");
  assert.ok(keys.indexOf("tests") < keys.indexOf("deploy"), "cổng test phải đứng TRƯỚC deploy");
  assert.ok(keys.indexOf("dashboard") < keys.indexOf("tests"), "phải ráp dashboard xong mới chạy test");
  assert.ok(keys.indexOf("lead_to_order") > keys.indexOf("crm_contacts"), "lead→order cần contacts trước");
  assert.equal(NOMA_LANDINGS.length, 5);
});

// ── 5. Runner script ────────────────────────────────────────────────────────
// Đã cắn HAI LẦN ngày 17/08/2026: một dấu "—" trong comment làm Windows PowerShell 5.1
// vỡ cú pháp toàn file. Lý do: PowerShell 5.1 đọc .ps1 KHÔNG có BOM theo ANSI, nên ký tự
// nhiều byte biến thành rác giữa chuỗi. Runner chạy nền bằng Task Scheduler nên vỡ kiểu
// này là im lặng — không ai thấy cho tới khi bấm nút mà không có gì xảy ra.
test("runner/refresh-runner.ps1 chỉ được chứa ký tự ASCII", () => {
  const ps1 = readFileSync(new URL("../runner/refresh-runner.ps1", import.meta.url), "utf8");
  const bad = [...ps1.matchAll(/[^\x00-\x7F]/g)].map(m => m[0]);
  assert.equal(bad.length, 0,
    `còn ${bad.length} ký tự non-ASCII (${[...new Set(bad)].join(" ")}) — PowerShell 5.1 sẽ vỡ cú pháp`);
});

// Lỗi thứ hai cùng ngày: runner gọi "bash" theo PATH, trúng
// C:\Program Files\Git\usr\bin\bash.exe (bản MSYS) → build-dist.sh chết, job failed ở
// bước deploy. Bản chạy được là Git\bin\bash.exe.
test("runner phải ưu tiên Git\\bin\\bash.exe, không gọi bash trần theo PATH", () => {
  const ps1 = readFileSync(new URL("../runner/refresh-runner.ps1", import.meta.url), "utf8");
  assert.match(ps1, /Program Files\\Git\\bin\\bash\.exe/, "phải thử đường dẫn Git\\bin\\bash.exe trước");
  assert.doesNotMatch(ps1, /&\s*bash\s+scripts\//, "không được gọi `bash` trần — PATH trỏ nhầm bản MSYS");
});

// ── 6. Cảnh báo snapshot cũ ─────────────────────────────────────────────────
// Trích thẳng hàm từ index.html theo đúng cách tests/brand-split-reconcile.test.mjs làm.
const html = readFileSync(new URL("../index.html", import.meta.url), "utf8");
const src = html.match(/^[ \t]*function freshnessLevel\(generatedAt, nowMs\)\{[\s\S]*?\n[ \t]*\}/m);
assert.ok(src, "không trích được freshnessLevel từ index.html");
const freshnessLevel = new Function(`${src[0]}\nreturn freshnessLevel;`)();

// generated_at là giờ VN (+07) → mốc quy về UTC.
const genVN = (iso) => iso;
const msVN = (y, mo, d, h, mi) => Date.UTC(y, mo - 1, d, h, mi) - 7 * 3600 * 1000;

test("snapshot dưới 24 giờ: bình thường", () => {
  const f = freshnessLevel(genVN("2026-08-17 15:50"), msVN(2026, 8, 18, 10, 0));
  assert.equal(f.level, "ok");
  assert.match(f.text, /cập nhật 2026-08-17 15:50/);
});

test("snapshot 24–72 giờ: cảnh báo vàng kèm số giờ", () => {
  const f = freshnessLevel(genVN("2026-08-14 17:01"), msVN(2026, 8, 16, 9, 1));
  assert.equal(f.level, "warn");
  assert.equal(f.hours, 40);
  assert.match(f.text, /dữ liệu đã cũ 40 giờ/);
});

test("snapshot quá 72 giờ: cảnh báo đỏ kèm số ngày", () => {
  // Đúng tình huống thật ngày 17/08/2026: dữ liệu đứng từ 14/08 vì GitHub khoá Actions.
  const f = freshnessLevel(genVN("2026-08-14 17:01"), msVN(2026, 8, 17, 20, 0));
  assert.equal(f.level, "bad");
  assert.match(f.text, /dữ liệu cũ 3 ngày/);
});

test("ranh giới 24h và 72h rơi đúng bậc", () => {
  assert.equal(freshnessLevel("2026-08-16 10:00", msVN(2026, 8, 17, 9, 59)).level, "ok");
  assert.equal(freshnessLevel("2026-08-16 10:00", msVN(2026, 8, 17, 10, 0)).level, "warn");
  assert.equal(freshnessLevel("2026-08-16 10:00", msVN(2026, 8, 19, 10, 0)).level, "warn");
  assert.equal(freshnessLevel("2026-08-16 10:00", msVN(2026, 8, 19, 11, 0)).level, "bad");
});

test("thiếu generated_at thì nói KHÔNG RÕ, không bịa là mới", () => {
  const f = freshnessLevel("", Date.now());
  assert.equal(f.level, "unknown");
  assert.equal(f.hours, null);
});

// ── 7. Badge phải soi CẢ snapshot doanh số, không chỉ file dashboard bọc ngoài ──
// Sự cố 19→24/08/2026: job fetch Pancake kẹt push (chỉ `git add` 1 trong 2 file nó
// ghi ra → rebase từ chối chạy → snapshot bị vứt). refresh-data vẫn dựng lại
// dashboard-data.json mỗi ngày nên D.generated_at luôn mới, badge xanh suốt 5 ngày,
// còn bảng doanh số thì đứng ở ngày 22 — chênh Pancake POS ~38 triệu.
const srcStalest = html.match(/^[ \t]*function stalestSnapshot\(parts, nowMs\)\{[\s\S]*?\n[ \t]*\}/m);
assert.ok(srcStalest, "không trích được stalestSnapshot từ index.html");
const stalestSnapshot = new Function(
  src[0] + "\n" + srcStalest[0] + "\nreturn stalestSnapshot;"
)();

test("dashboard mới nhưng snapshot doanh số cũ → vẫn phải báo động", () => {
  const f = stalestSnapshot([
    { label: "", at: "2026-08-24 09:01" },
    { label: "doanh số Pancake", at: "2026-08-22 05:37 UTC" },
  ], msVN(2026, 8, 24, 16, 0));
  assert.equal(f.level, "warn", "lấy mốc CŨ NHẤT, không lấy mốc mới nhất");
  assert.match(f.text, /doanh số Pancake/, "phải gọi tên nguồn đang cũ");
});

test("mốc có hậu tố UTC không bị lệch 7 giờ", () => {
  // 2026-08-22 05:37 UTC = 12:37 giờ VN. Sau đó đúng 2 giờ → 2 giờ tuổi, không phải 9.
  const f = freshnessLevel("2026-08-22 05:37 UTC", Date.UTC(2026, 7, 22, 7, 37));
  assert.equal(f.hours, 2);
});

test("mọi nguồn đều mới → badge xanh, không thêm chữ thừa", () => {
  const f = stalestSnapshot([
    { label: "", at: "2026-08-24 09:01" },
    { label: "doanh số Pancake", at: "2026-08-24 07:10 UTC" },
  ], msVN(2026, 8, 24, 16, 0));
  assert.equal(f.level, "ok");
  assert.doesNotMatch(f.text, /cũ nhất/);
});
