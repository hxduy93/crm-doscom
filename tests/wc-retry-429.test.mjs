import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { wcFetch, loiWc } from "../functions/api/products/_wc.js";

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
test("429 giải thích là host chặn, KHÔNG để người đọc tưởng sai key WooCommerce", () => {
  const g = loiWc("doscom", 429, "{}");
  assert.match(g, /gọi quá nhanh/);
  assert.match(g, /Hostinger/);
  assert.doesNotMatch(g, /CK\s*\/\s*WC_DOSCOM_CS sai/, "429 không phải lỗi key");
});

test("giữ nguyên các gợi ý cũ cho lỗi quyền", () => {
  assert.match(loiWc("noma", 401, ""), /không đủ quyền/);
  assert.match(loiWc("noma", 403, "woocommerce_rest_cannot_view"), /Read\/Write/);
  assert.equal(loiWc("noma", 200, "{}"), null);
});

// ── chống tái phát ──
const wc = readFileSync(new URL("../functions/api/products/_wc.js", import.meta.url), "utf8");

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

test("vòng chạy hàng loạt có nghỉ giữa các sản phẩm", () => {
  assert.match(html, /const NGHI_GIUA_SP = \d+/);
  assert.match(html, /const NGHI_SAU_429 = \d+/);
  const khoi = html.slice(html.indexOf("async function runJobs"));
  assert.match(khoi, /await doi\(cho\)/, "phải thật sự chờ giữa hai SP, không chỉ khai hằng số");
});

test("dính 429 thì nghỉ dài hơn hẳn nhịp thường", () => {
  const thuong = Number(html.match(/const NGHI_GIUA_SP = (\d+)/)[1]);
  const sau429 = Number(html.match(/const NGHI_SAU_429 = (\d+)/)[1]);
  assert.ok(sau429 >= thuong * 5, `nghỉ sau 429 (${sau429}ms) phải dài hơn nhịp thường (${thuong}ms)`);
});
