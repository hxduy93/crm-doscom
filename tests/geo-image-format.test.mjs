import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import { detectImageType } from "../functions/api/geo/publish-wp.js";

// SỰ CỐ 2026-08-16: Cloudflare đổi @cf/black-forest-labs/flux-1-schnell.
//
// Hai hệ quả, cùng một gốc:
//  1) Input schema bỏ width/height → mọi lượt gen fail
//     "5006: Additional or unevaluated properties '/width, /height' at '/' not allowed".
//  2) Output đổi từ PNG sang JPEG (magic ff d8 ff) — đo được trên ảnh thật sinh ngày 17/08.
//
// Lỗi (2) âm thầm hơn: publish-wp.js trước đây hard-code Content-Type "image/png" + đuôi
// .png. WordPress đối chiếu nội dung file với đuôi/MIME (wp_check_filetype_and_ext) nên
// gửi JPEG mà khai PNG sẽ bị chặn "file type is not permitted for security reasons".
//
// Bất biến: MIME + đuôi file LUÔN suy ra từ magic bytes của chính ảnh, không bao giờ
// giả định theo model đang dùng — model đổi output lần nữa thì code vẫn khai đúng.

// Dựng base64 từ danh sách byte đầu file (đủ để hàm dò magic bytes).
function b64FromBytes(bytes) {
  const padded = [...bytes, ...new Array(Math.max(0, 24 - bytes.length)).fill(0)];
  return Buffer.from(padded).toString("base64");
}

const JPEG_JFIF = [0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46];
const JPEG_EXIF = [0xff, 0xd8, 0xff, 0xe1, 0x00, 0x10, 0x45, 0x78, 0x69, 0x66];
const PNG       = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
const WEBP      = [0x52, 0x49, 0x46, 0x46, 0x24, 0x00, 0x00, 0x00, 0x57, 0x45, 0x42, 0x50];

test("JPEG (thứ Flux trả về từ 16/08) → image/jpeg + đuôi jpg", () => {
  assert.deepEqual(detectImageType(b64FromBytes(JPEG_JFIF)), { mime: "image/jpeg", ext: "jpg" });
});

test("JPEG biến thể EXIF cũng nhận đúng, không chỉ JFIF", () => {
  assert.deepEqual(detectImageType(b64FromBytes(JPEG_EXIF)), { mime: "image/jpeg", ext: "jpg" });
});

test("PNG (ảnh cũ đã lưu trong DB) vẫn nhận đúng → không vỡ bài cũ", () => {
  assert.deepEqual(detectImageType(b64FromBytes(PNG)), { mime: "image/png", ext: "png" });
});

test("WebP nhận đúng — RIFF....WEBP, không nhầm với AVI cùng tiền tố RIFF", () => {
  assert.deepEqual(detectImageType(b64FromBytes(WEBP)), { mime: "image/webp", ext: "webp" });
  const avi = [0x52, 0x49, 0x46, 0x46, 0x24, 0x00, 0x00, 0x00, 0x41, 0x56, 0x49, 0x20];
  assert.notEqual(detectImageType(b64FromBytes(avi)).ext, "webp");
});

test("byte lạ → mặc định JPEG (định dạng Flux đang trả), không đoán bừa PNG", () => {
  assert.deepEqual(detectImageType(b64FromBytes([0x00, 0x01, 0x02, 0x03])), {
    mime: "image/jpeg", ext: "jpg",
  });
});

// Chống tái diễn lỗi (1): không được gửi width/height lên Workers AI nữa.
const HERO   = readFileSync(new URL("../functions/api/geo/generate-image.js", import.meta.url), "utf8");
const INLINE = readFileSync(new URL("../functions/api/geo/generate-inline-images.js", import.meta.url), "utf8");

for (const [ten, src] of [["generate-image", HERO], ["generate-inline-images", INLINE]]) {
  test(`${ten}: KHÔNG gán width/height vào inputs gửi Workers AI (schema Flux đã bỏ)`, () => {
    assert.doesNotMatch(src, /inputs\.width/,  `${ten} vẫn gán inputs.width → Flux trả lỗi 5006`);
    assert.doesNotMatch(src, /inputs\.height/, `${ten} vẫn gán inputs.height → Flux trả lỗi 5006`);
  });

  test(`${ten}: inputs gửi Flux chỉ gồm prompt + steps`, () => {
    const m = src.match(/const inputs = \{([^}]*)\}/);
    assert.ok(m, `${ten} không tìm thấy khai báo inputs`);
    const keys = m[1].split(",").map((k) => k.trim()).filter(Boolean).sort();
    assert.deepEqual(keys, ["prompt", "steps"]);
  });
}

// Chống tái diễn lỗi (2): publish không được hard-code image/png nữa.
const PUBLISH = readFileSync(new URL("../functions/api/geo/publish-wp.js", import.meta.url), "utf8");

test("publish-wp: Content-Type upload lấy từ magic bytes, không hard-code image/png", () => {
  assert.doesNotMatch(
    PUBLISH,
    /"Content-Type":\s*"image\/png"/,
    'publish-wp vẫn hard-code "image/png" → WordPress chặn khi Flux trả JPEG'
  );
  assert.match(PUBLISH, /"Content-Type":\s*mime/);
});
