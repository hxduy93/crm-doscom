// Test 3 chế độ của /api/fb-upload-media (không gọi Meta thật — stub global fetch):
//   - file_url : gửi LINK, Facebook tự tải → dùng cho video TikTok, KHÔNG giới hạn dung lượng
//   - file     : đẩy byte qua Cloudflare (lối cũ, chỉ hợp video nhỏ)
//   - video_id : chỉ đợi tiếp video đã gửi lượt trước (khi lượt trước trả can_retry_poll)
// FB_MEDIA_BUDGET_MS rút ngân sách đợi xuống vài trăm ms để test chạy nhanh.
import { test } from "node:test";
import assert from "node:assert/strict";
import { onRequestPost } from "../functions/api/fb-upload-media.js";

const ENV = { FB_ACCESS_TOKEN: "tok", FB_MEDIA_BUDGET_MS: 400 };

// routes: [ (url, init) => object|null ] — trả object đầu tiên khớp.
function stubFetch(handler) {
  const calls = [];
  globalThis.fetch = async (url, init = {}) => {
    let body = init.body;
    if (typeof body === "string") body = Object.fromEntries(new URLSearchParams(body));
    calls.push({ url: String(url), method: init.method || "GET", body });
    const res = handler(String(url), calls[calls.length - 1]);
    return new Response(JSON.stringify(res.json), {
      status: res.status || 200,
      headers: { "content-type": "application/json" },
    });
  };
  return calls;
}

const post = (body, headers) =>
  onRequestPost({ env: ENV, request: new Request("https://x/api/fb-upload-media", { method: "POST", body, headers }) });

const jsonPost = (obj) => post(JSON.stringify(obj), { "content-type": "application/json" });

test("file_url: gửi link cho FB tự tải → trả video_id + thumbnail", async () => {
  const calls = stubFetch((url) => {
    if (url.includes("/advideos")) return { json: { id: "vid_1" } };
    if (url.includes("/thumbnails")) return { json: { data: [{ uri: "https://t/1.jpg", is_preferred: true }] } };
    return { json: { status: { video_status: "ready" } } };
  });

  const r = await jsonPost({ file_url: "https://cdn.tiktok/x.mp4", account_id: "act_9", kind: "video", name: "123.mp4" });
  const d = await r.json();
  assert.equal(d.ok, true);
  assert.equal(d.video_id, "vid_1");
  assert.equal(d.thumbnail_url, "https://t/1.jpg");

  const upload = calls.find((c) => c.url.includes("/advideos"));
  assert.equal(upload.body.file_url, "https://cdn.tiktok/x.mp4", "phải chuyển nguyên link cho Meta");
  assert.ok(!upload.url.includes("act_act_9"), "account_id phải bỏ tiền tố act_");
  assert.ok(upload.url.includes("/act_9/advideos"));
});

test("FB không tải được link → báo client tự tải file rồi upload lối thường", async () => {
  stubFetch(() => ({ status: 400, json: { error: { message: "Unable to fetch video file from URL", code: 389 } } }));

  const r = await jsonPost({ file_url: "https://cdn.tiktok/x.mp4", account_id: "9", kind: "video" });
  const d = await r.json();
  assert.equal(r.status, 502);
  assert.equal(d.ok, false);
  assert.equal(d.fallback_client_upload, true, "client cần biết để quay về lối tải qua trình duyệt");
});

test("video chưa xử lý xong → 202 kèm video_id để gọi lại đợi tiếp (không mất video)", async () => {
  stubFetch((url) => {
    if (url.includes("/advideos")) return { json: { id: "vid_2" } };
    return { json: { status: { video_status: "processing" } } };
  });

  const r = await jsonPost({ file_url: "https://cdn.tiktok/x.mp4", account_id: "9", kind: "video" });
  const d = await r.json();
  assert.equal(r.status, 202);
  assert.equal(d.can_retry_poll, true);
  assert.equal(d.video_id, "vid_2", "phải trả id để lượt sau đợi tiếp đúng video đó");
});

test("chế độ đợi tiếp: chỉ có video_id → KHÔNG upload lại, chỉ hỏi trạng thái", async () => {
  const calls = stubFetch((url) => {
    if (url.includes("/thumbnails")) return { json: { data: [{ uri: "https://t/2.jpg" }] } };
    return { json: { status: { video_status: "ready" } } };
  });

  const r = await jsonPost({ video_id: "vid_3" });
  const d = await r.json();
  assert.equal(d.ok, true);
  assert.equal(d.video_id, "vid_3");
  assert.equal(d.thumbnail_url, "https://t/2.jpg");
  assert.equal(calls.filter((c) => c.url.includes("/advideos")).length, 0, "không được upload lại");
});

test("FB báo video lỗi xử lý → 502, KHÔNG bảo client đợi tiếp vô ích", async () => {
  stubFetch((url) => {
    if (url.includes("/advideos")) return { json: { id: "vid_4" } };
    return { json: { status: { video_status: "error" } } };
  });

  const r = await jsonPost({ file_url: "https://cdn.tiktok/x.mp4", account_id: "9", kind: "video" });
  const d = await r.json();
  assert.equal(r.status, 502);
  assert.equal(d.can_retry_poll, undefined);
  assert.match(d.error, /video lỗi/);
});

test("lối cũ vẫn chạy: multipart file → upload qua Worker", async () => {
  const calls = stubFetch((url) => {
    if (url.includes("/advideos")) return { json: { id: "vid_5" } };
    if (url.includes("/thumbnails")) return { json: { data: [{ uri: "https://t/5.jpg" }] } };
    return { json: { status: { video_status: "ready" } } };
  });

  const fd = new FormData();
  fd.append("file", new File([new Uint8Array(2048)], "77.mp4", { type: "video/mp4" }), "77.mp4");
  fd.append("account_id", "act_9");
  const r = await post(fd);
  const d = await r.json();
  assert.equal(d.ok, true);
  assert.equal(d.video_id, "vid_5");
  assert.ok(calls.find((c) => c.url.includes("/act_9/advideos")));
});

test("thiếu cả file lẫn file_url/video_id → 400 nói rõ thiếu gì", async () => {
  stubFetch(() => ({ json: {} }));
  const r = await jsonPost({ account_id: "9", kind: "video" });
  const d = await r.json();
  assert.equal(r.status, 400);
  assert.match(d.error, /file_url/);
});

test("file_url phải là http/https công khai", async () => {
  stubFetch(() => ({ json: {} }));
  const r = await jsonPost({ file_url: "blob:abc", account_id: "9", kind: "video" });
  assert.equal(r.status, 400);
  assert.match((await r.json()).error, /http/);
});
