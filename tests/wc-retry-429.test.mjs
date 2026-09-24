import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { wcFetch, loiWc, moTaPhanHoi } from "../functions/api/products/_wc.js";

/* SỰ CỐ 24/09/2026: menu "Ảnh sale" đổ lỗi hàng loạt trên doscom.vn với thông báo
   "WC get full 429: {}" và "WP media 429 (doscom):".
   Chẩn đoán: doscom.vn/noma.vn chạy Hostinger (LiteSpeed), KHÔNG qua Cloudflare, chặn
   theo IP; CRM gọi từ dải IP dùng chung của Cloudflare nên chạm ngưỡng. Đo thật từ máy
   cá nhân cùng lúc: 20 request liên tiếp + upload ảnh 900KB đều OK → site khoẻ, lỗi nằm
   ở nhịp gọi. Trước đó CHỈ uploadMedia biết thử lại; mọi hàm khác chết ngay 429 đầu tiên. */

function gaFetch(chuoi) {
  // chuoi: [{status, headers?}] — trả lần lượt mỗi lần gọi
  let i = 0;
  const goi = [];
  globalThis.fetch = async (url, init) => {
    const b = chuoi[Math.min(i, chuoi.length - 1)];
    i++;
    goi.push({ url: String(url), method: (init && init.method) || "GET" });
    return {
      ok: b.status >= 200 && b.status < 300,
      status: b.status,
      headers: { get: (k) => (b.headers || {})[k.toLowerCase()] ?? null },
      async json() { return b.body ?? {}; },
      async text() { return JSON.stringify(b.body ?? {}); },
    };
  };
  return { soLan: () => i, goi };
}

const fetchGoc = globalThis.fetch;
test.afterEach(() => { globalThis.fetch = fetchGoc; });

test("429 thì thử lại, không chết ngay lần đầu", async () => {
  const g = gaFetch([{ status: 429, headers: { "retry-after": "0" } },
                     { status: 429, headers: { "retry-after": "0" } },
                     { status: 200 }]);
  const r = await wcFetch("https://doscom.vn/wp-json/wc/v3/products/1", {}, { retries: 3 });
  assert.equal(r.status, 200);
  assert.equal(g.soLan(), 3, "phải gọi lại đủ 3 lần mới thành công");
});

test("hết lượt thử vẫn 429 thì trả Response để chỗ gọi tự báo lỗi, KHÔNG ném", async () => {
  gaFetch([{ status: 429, headers: { "retry-after": "0" } }]);
  const r = await wcFetch("https://doscom.vn/x", {}, { retries: 2 });
  assert.equal(r.status, 429, "trả response cuối, giữ nguyên cách dựng thông báo cũ");
});

test("lỗi KHÔNG tạm thời (401/403/404) thì dừng ngay, đừng phí thời gian", async () => {
  for (const st of [400, 401, 403, 404]) {
    const g = gaFetch([{ status: st }]);
    const r = await wcFetch("https://doscom.vn/x", {}, { retries: 3 });
    assert.equal(r.status, st);
    assert.equal(g.soLan(), 1, `status ${st} không được thử lại`);
  }
});

test("nghe theo Retry-After của host thay vì tự đoán", async () => {
  gaFetch([{ status: 503, headers: { "retry-after": "1" } }, { status: 200 }]);
  const t0 = Date.now();
  const r = await wcFetch("https://doscom.vn/x", {}, { retries: 2 });
  const hết = Date.now() - t0;
  assert.equal(r.status, 200);
  assert.ok(hết >= 900, `phải chờ ~1s theo Retry-After, thực tế ${hết}ms`);
  assert.ok(hết < 4000, `không được chờ lâu hơn host yêu cầu, thực tế ${hết}ms`);
});

test("mạng đứt hết mọi lần thử thì mới ném", async () => {
  let n = 0;
  globalThis.fetch = async () => { n++; throw new Error("network down"); };
  await assert.rejects(() => wcFetch("https://doscom.vn/x", {}, { retries: 1 }), /network down/);
  assert.equal(n, 2, "thử lại đúng số lần rồi mới bỏ cuộc");
});

// ── thông báo phải nói đúng chuyện ──
/* 24/09/2026 — ĐÃ BÁC BỎ giả thuyết "Hostinger chặn dải IP Cloudflare": chạy một Worker
   trên chính mạng Cloudflare, gọi 8 lần liên tiếp sang doscom.vn, không lần nào 429
   (chỉ 200 và 404 vì ID thử là ID bịa). Từ máy cá nhân 100 request tuần tự cũng 200 hết.
   Vì vậy thông báo lỗi KHÔNG được khẳng định ai chặn — phải đọc header thật. */
test("429 nêu dữ kiện, KHÔNG đoán bừa ai chặn", () => {
  const g = loiWc("doscom", 429, "{}");
  assert.match(g, /429/);
  assert.match(g, /sai key trả 401/i, "phải loại trừ giả thuyết sai key");
  assert.doesNotMatch(g, /Hostinger/, "đã đo và bác bỏ, đừng khẳng định lại");
  assert.doesNotMatch(g, /dải IP dùng chung của Cloudflare/, "cùng lý do");
});

test("thông báo kèm header để biết Cloudflare hay LiteSpeed trả 429", () => {
  const cfRes = { headers: { get: (k) => ({ server: "cloudflare", "cf-ray": "abc-HKG" })[k.toLowerCase()] ?? null } };
  const lsRes = { headers: { get: (k) => ({ server: "LiteSpeed", platform: "hostinger" })[k.toLowerCase()] ?? null } };
  assert.match(moTaPhanHoi(cfRes), /server=cloudflare/);
  assert.match(moTaPhanHoi(cfRes), /cf-ray=abc-HKG/);
  assert.match(moTaPhanHoi(lsRes), /platform=hostinger/);
  assert.equal(moTaPhanHoi(null), "");
  assert.equal(moTaPhanHoi({}), "");
});

test("giữ nguyên các gợi ý cũ cho lỗi quyền", () => {
  assert.match(loiWc("noma", 401, ""), /không đủ quyền/);
  assert.match(loiWc("noma", 403, "woocommerce_rest_cannot_view"), /Read\/Write/);
  assert.equal(loiWc("noma", 200, "{}"), null);
});

// ── chống tái phát ──
const wc = readFileSync(new URL("../functions/api/products/_wc.js", import.meta.url), "utf8");

test("lỗi WC đính kèm mô tả nguồn chặn, không chỉ có body rỗng", () => {
  // Body 429 là HTML nên .json() ra {} — thiếu header thì thông báo trống rỗng như
  // "WC get full 429: {}" và không ai biết phải gỡ ở đâu.
  assert.match(wc, /nemLoiWc\("get full", c\.site, r\.status, JSON\.stringify\(d\), r\)/);
  assert.match(wc, /export function moTaPhanHoi/);
});

test("mọi lời gọi sang doscom.vn/noma.vn đi qua wcFetch, không gọi fetch trần", () => {
  const tran = [...wc.matchAll(/await fetch\(`\$\{c\.url\}/g)];
  assert.equal(tran.length, 0,
    "còn chỗ gọi fetch thẳng tới site → chỗ đó sẽ chết ngay ở 429 đầu tiên");
});

test("chỉ khai RETRYABLE và sleep một lần", () => {
  assert.equal((wc.match(/const RETRYABLE\b/g) || []).length, 1);
  assert.equal((wc.match(/const sleep\b/g) || []).length, 1);
});

test("uploadMedia KHÔNG còn vòng thử lại riêng (tránh thử lại lồng nhau)", () => {
  const khoi = wc.slice(wc.indexOf("export async function uploadMedia"),
                        wc.indexOf("// ---------- Menu \"Giảm giá hàng loạt\" ----------"));
  assert.doesNotMatch(khoi, /for \(let attempt/, "vòng riêng nhân với wcFetch thành 3×4 lần chờ");
  assert.match(khoi, /wcFetch\(/);
});

// ── giao diện phải giãn nhịp ──
const html = readFileSync(new URL("../sale-images.html", import.meta.url), "utf8");

test("vòng chạy hàng loạt có nghỉ giữa các sản phẩm, nhịp do người dùng chọn", () => {
  assert.match(html, /const nhipGoc = \(\) =>/, "nhịp lấy từ ô Tốc độ chạy");
  assert.match(html, /id="tocDo"/, "phải có ô chọn tốc độ trên giao diện");
  const khoi = html.slice(html.indexOf("async function runJobs"));
  assert.match(khoi, /await doi\(cho\)/, "phải thật sự chờ giữa hai SP");
});

/* 24/09/2026 — đọc header thật của 429: có `platform=hostinger` → CHÍNH WEB trả 429,
   không phải Cloudflare. Ngưỡng phụ thuộc tải nên vài SP thì lọt, nhiều SP thì dính.
   Vì vậy nhịp phải TỰ GIÃN và GIỮ mức giãn, không phải nghỉ một lần rồi về như cũ. */
test("dính 429 thì giãn nhịp và GIỮ, không quay lại nhịp cũ ngay", () => {
  const khoi = html.slice(html.indexOf("async function runJobs"));
  assert.match(khoi, /nhip = Math\.min\(nhip \* 2, NHIP_TOI_DA\)/, "gặp 429 phải giãn gấp đôi");
  assert.match(khoi, /nhip > nhipGoc\(\)/, "chạy êm mới được rút ngắn dần");
  assert.match(html, /const NHIP_TOI_DA = \d+/, "phải có trần giãn, tránh chạy vô tận");
});

test("SP dính 429 được chạy lại một lượt ở cuối", () => {
  const khoi = html.slice(html.indexOf("async function runJobs"));
  assert.match(khoi, /loi429\.push\(ids\[i\]\)/, "phải ghi lại SP dính 429");
  assert.match(khoi, /if \(loi429\.length\)/, "phải có lượt chạy lại");
  assert.match(khoi, /ok\+\+; fail--/, "chạy lại được thì phải sửa lại số đếm");
});

// ── Ẩn SP đã gắn ảnh sale khỏi bảng chọn ──
test("mặc định ẩn SP đã gắn ảnh sale, nhưng vẫn hiện SP bị lệch", () => {
  assert.match(html, /id="hideDone" checked/, "mặc định bật");
  assert.match(html, /function daGan\(p\) \{\s*return !!\(p\.sale && !p\.sale_mismatch\);/,
    "SP lệch vẫn phải hiện vì đó là SP cần gắn lại");
  const f = html.slice(html.indexOf("function filtered(q)"), html.indexOf("function saleTag"));
  assert.match(f, /S\.products\.filter\(\(p\) => !daGan\(p\)\)/);
});

test("SP đã gắn cũng rời khỏi vùng chọn, để nút không đếm SP đang bị ẩn", () => {
  assert.match(html, /if \(p && daGan\(p\)\) S\.makeSel\.delete\(id\)/, "bật ô ẩn thì bỏ chọn luôn");
  const l = html.slice(html.indexOf("async function load()"), html.indexOf("const noImg"));
  assert.match(l, /daGan\(p\)/, "tải lại danh sách cũng phải bỏ SP vừa gắn xong khỏi vùng chọn");
});
