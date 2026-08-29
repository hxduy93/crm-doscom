// Test /api/fb-test-page — phần CHẨN ĐOÁN QUYỀN trên tài khoản QC (không gọi Meta thật).
//
// SỰ CỐ 29/08/2026: bấm "Kiểm tra trang" trên tkqc CÔNG TY CP DOSCOM trả về nguyên văn
// câu của Meta: "Object with ID 'act_1254151326914021' does not exist, cannot be loaded
// due to missing permissions..." ở bước POST /adimages — trong khi GET danh sách tkqc
// vẫn thấy tài khoản đó. Đọc câu đó thì tưởng tkqc bị xoá, đi tìm nhầm chỗ. Thực chất
// là token CHỈ ĐƯỢC XEM tkqc. Endpoint phải nói ra điều đó.
import { test } from "node:test";
import assert from "node:assert/strict";
import { onRequestGet } from "../functions/api/fb-test-page.js";

const ENV = { FB_ACCESS_TOKEN: "tok" };
const ACCT = "1254151326914021";
const PAGE = "1101583133049069";
const LOI_META =
  "Unsupported post request. Object with ID 'act_1254151326914021' does not exist, " +
  "cannot be loaded due to missing permissions, or does not support this operation.";

// handler(url, {method}) → { json, status }
function stubFetch(handler) {
  globalThis.fetch = async (url, init = {}) => {
    const res = handler(String(url), init.method || "GET");
    return new Response(JSON.stringify(res.json), {
      status: res.status || 200,
      headers: { "content-type": "application/json" },
    });
  };
}

const get = (qs = `account=${ACCT}&page=${PAGE}`) =>
  onRequestGet({ env: ENV, request: new Request(`https://x/api/fb-test-page?${qs}`) });

// Token chỉ có quyền XEM: GET act_ chạy, POST /adimages hỏng.
const stubChiDoc = (tasks) => stubFetch((url, method) => {
  if (url.includes("/me?")) return { json: { id: "1", name: "Token owner" } };
  if (method === "POST") return { status: 400, json: { error: { message: LOI_META, code: 100 } } };
  if (url.includes("user_tasks")) return { json: { account_id: ACCT, name: "CÔNG TY CP DOSCOM", account_status: 1, user_tasks: tasks } };
  return { json: { account_id: ACCT } };
});

test("token chỉ được XEM tkqc → nói thẳng là quyền, kèm cách xử lý; không để nguyên câu 'không tồn tại'", async () => {
  stubChiDoc(["ANALYZE"]);

  const r = await get();
  const d = await r.json();
  assert.equal(r.status, 502);
  assert.equal(d.ok, false);
  assert.equal(d.quyen.co_quyen_chay, false);
  assert.deepEqual(d.quyen.tasks, ["ANALYZE"]);
  assert.match(d.goi_y, /CHỈ ĐƯỢC XEM/);
  assert.match(d.goi_y, /ANALYZE/, "phải nêu đúng quyền Meta đang cấp");
  assert.match(d.goi_y, /Quản lý chiến dịch|ADVERTISE/, "phải chỉ ra cách sửa");
  assert.match(d.error, /does not exist/, "vẫn giữ câu gốc của Meta để tra cứu");
});

test("token có quyền ADVERTISE mà vẫn hỏng ghi → không đổ cho quyền tkqc", async () => {
  stubChiDoc(["ADVERTISE", "ANALYZE"]);

  const d = await (await get()).json();
  assert.equal(d.quyen.co_quyen_chay, true);
  // Câu lỗi vẫn có chữ "permissions" nên gợi ý chung được giữ, nhưng KHÔNG khẳng định
  // sai rằng token chỉ được xem.
  assert.doesNotMatch(d.goi_y || "", /CHỈ ĐƯỢC XEM/);
});

test("Meta không trả user_tasks → vẫn chạy, chỉ là không chốt được nguyên nhân", async () => {
  stubFetch((url, method) => {
    if (url.includes("/me?")) return { json: { id: "1", name: "Token owner" } };
    if (method === "POST") return { status: 400, json: { error: { message: LOI_META } } };
    return { json: { account_id: ACCT, name: "TK" } }; // không có user_tasks
  });

  const d = await (await get()).json();
  assert.equal(d.quyen.co_quyen_chay, null);
  assert.match(d.goi_y, /KHÔNG có nghĩa là tkqc bị xoá/);
});

test("hỏi quyền mà lỗi thì KHÔNG làm hỏng phép thử chính", async () => {
  let creativeDaXoa = false;
  stubFetch((url, method) => {
    if (url.includes("/me?")) return { json: { id: "1", name: "Token owner" } };
    if (url.includes("user_tasks")) return { status: 400, json: { error: { message: "Unknown field user_tasks" } } };
    if (method === "POST" && url.includes("adimages")) return { json: { images: { a: { hash: "h1" } } } };
    if (method === "POST" && url.includes("adcreatives")) return { json: { id: "cr1" } };
    if (method === "DELETE") { creativeDaXoa = true; return { json: { success: true } }; }
    return { json: {} };
  });

  const d = await (await get()).json();
  assert.equal(d.ok, true);
  assert.equal(d.results[0].verdict, "CHẠY ĐƯỢC");
  assert.match(d.quyen.error, /user_tasks/, "giữ lý do hỏi quyền hỏng để chẩn đoán");
  assert.equal(creativeDaXoa, true, "creative test phải được xoá ngay");
});

// ── Ảnh cho creative test (29/08/2026) ───────────────────────────────────────
// Sau khi thay token đủ quyền, phép thử VẪN hỏng: Meta trả "Chúng tôi không xử lý được
// hình ảnh bạn đã tải lên" — chê tấm PNG 320x320 đặc một màu. Phép thử sinh ra để kiểm
// QUYỀN TRANG, không được chết vì chuyện phụ như ảnh → mượn ảnh có sẵn của tkqc trước.

test("có ảnh sẵn trong tkqc → MƯỢN, không upload ảnh test (không vứt rác vào thư viện)", async () => {
  let daUpload = false;
  stubFetch((url, method) => {
    if (url.includes("/me?")) return { json: { id: "1", name: "Token owner" } };
    if (url.includes("user_tasks")) return { json: { account_id: ACCT, user_tasks: ["ADVERTISE"] } };
    if (method === "GET" && url.includes("adimages")) return { json: { data: [{ hash: "hash_co_san" }] } };
    if (method === "POST" && url.includes("adimages")) { daUpload = true; return { json: { images: { a: { hash: "h_moi" } } } }; }
    if (method === "POST" && url.includes("adcreatives")) {
      assert.match(decodeURIComponent(url), /adcreatives/);
      return { json: { id: "cr1" } };
    }
    return { json: {} };
  });

  const d = await (await get()).json();
  assert.equal(d.ok, true);
  assert.equal(d.results[0].verdict, "CHẠY ĐƯỢC");
  assert.equal(daUpload, false, "đã có ảnh sẵn thì KHÔNG được upload thêm");
  assert.match(d.anh_nguon, /có sẵn/);
});

test("tkqc chưa có ảnh nào → mới upload ảnh test", async () => {
  let daUpload = false;
  stubFetch((url, method) => {
    if (url.includes("/me?")) return { json: { id: "1", name: "Token owner" } };
    if (url.includes("user_tasks")) return { json: { account_id: ACCT, user_tasks: ["ADVERTISE"] } };
    if (method === "GET" && url.includes("adimages")) return { json: { data: [] } };
    if (method === "POST" && url.includes("adimages")) { daUpload = true; return { json: { images: { a: { hash: "h_moi" } } } }; }
    if (method === "POST" && url.includes("adcreatives")) return { json: { id: "cr1" } };
    return { json: {} };
  });

  const d = await (await get()).json();
  assert.equal(d.ok, true);
  assert.equal(daUpload, true);
  assert.match(d.anh_nguon, /vừa upload/);
});

test("Meta chê ảnh upload → nói rõ là lỗi ẢNH, KHÔNG đổ cho quyền", async () => {
  stubFetch((url, method) => {
    if (url.includes("/me?")) return { json: { id: "1", name: "Token owner" } };
    if (url.includes("user_tasks")) return { json: { account_id: ACCT, user_tasks: ["ADVERTISE"] } };
    if (method === "GET" && url.includes("adimages")) return { json: { data: [] } };
    if (method === "POST" && url.includes("adimages")) {
      return { status: 400, json: { error: { error_user_msg: "Chúng tôi không xử lý được hình ảnh bạn đã tải lên. Vui lòng thử lại hoặc tải hình ảnh khác lên." } } };
    }
    return { json: {} };
  });

  const d = await (await get()).json();
  assert.equal(d.ok, false);
  assert.match(d.goi_y, /CHÊ TẤM ẢNH/);
  assert.doesNotMatch(d.goi_y, /CHỈ ĐƯỢC XEM|không ghi được/, "đừng đổ cho quyền khi lỗi là ảnh");
});

test("đọc thư viện ảnh hỏng → vẫn rơi xuống đường upload, không sập phép thử", async () => {
  stubFetch((url, method) => {
    if (url.includes("/me?")) return { json: { id: "1", name: "Token owner" } };
    if (url.includes("user_tasks")) return { json: { account_id: ACCT, user_tasks: ["ADVERTISE"] } };
    if (method === "GET" && url.includes("adimages")) return { status: 400, json: { error: { message: "temporary" } } };
    if (method === "POST" && url.includes("adimages")) return { json: { images: { a: { hash: "h_moi" } } } };
    if (method === "POST" && url.includes("adcreatives")) return { json: { id: "cr1" } };
    return { json: {} };
  });

  const d = await (await get()).json();
  assert.equal(d.ok, true);
  assert.equal(d.results[0].verdict, "CHẠY ĐƯỢC");
});
