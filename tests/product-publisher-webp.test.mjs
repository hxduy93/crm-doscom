// Ảnh "Đăng sản phẩm" phải lên web dạng WebP.
//
// Việc cần bảo vệ: trước 08/10/2026 toPubImage() giữ PNG là PNG → thumbnail 450–760KB/ảnh,
// trang Khuyến mãi doscom.vn nặng 9,2MB trên mobile (Lighthouse). Test bóc đúng hàm trong
// product-publisher.html ra chạy với canvas giả, đối chiếu định dạng gửi đi.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

function loadPubFns() {
  const html = fs.readFileSync(new URL("../product-publisher.html", import.meta.url), "utf8");
  const pick = (re, label) => {
    const m = html.match(re);
    assert.ok(m, "không tìm thấy " + label + " trong product-publisher.html");
    return m[0];
  };
  return [
    pick(/function downscale\([\s\S]*?\n/, "downscale"),
    pick(/const PUB_MAXDIM = \d+;/, "PUB_MAXDIM"),
    pick(/const PUB_WEBP_QUALITY = [\d.]+;/, "PUB_WEBP_QUALITY"),
    pick(/function encodeImage\([\s\S]*?\n/, "encodeImage"),
    pick(/async function toPubImage\(im\)\{[\s\S]*?\n\}/, "toPubImage"),
  ].join("\n");
}

// canvas giả: ghi lại type yêu cầu; supportsWebp=false mô phỏng trình duyệt trả PNG khi xin WebP
function sandbox({ supportsWebp, w = 4000, h = 3000 }) {
  const calls = [];
  class FakeImage {
    set src(v) { this._src = v; this.width = w; this.height = h; queueMicrotask(() => this.onload()); }
  }
  const document = {
    createElement: () => ({
      width: 0, height: 0,
      getContext: () => ({ drawImage() {} }),
      toDataURL(type, q) {
        calls.push({ type, q, w: this.width, h: this.height });
        const out = type === "image/webp" && !supportsWebp ? "image/png" : type;
        return `data:${out};base64,QUJD`;
      },
    }),
  };
  const fn = new Function("Image", "document", loadPubFns() + "\nreturn toPubImage;");
  return { toPubImage: fn(FakeImage, document), calls };
}

test("ảnh PNG/JPEG được xuất WebP, cạnh dài tối đa 1600px", async () => {
  const { toPubImage, calls } = sandbox({ supportsWebp: true });
  for (const media_type of ["image/png", "image/jpeg"]) {
    const r = await toPubImage({ url: "data:" + media_type + ";base64,AAAA", media_type });
    assert.equal(r.media_type, "image/webp");
    assert.equal(r.data, "QUJD");
  }
  assert.ok(calls.every((c) => c.type === "image/webp" && Math.max(c.w, c.h) === 1600));
});

test("trình duyệt không mã hoá được WebP → quay về PNG/JPEG như cũ", async () => {
  const { toPubImage } = sandbox({ supportsWebp: false });
  const png = await toPubImage({ url: "data:image/png;base64,AAAA", media_type: "image/png" });
  const jpg = await toPubImage({ url: "data:image/jpeg;base64,AAAA", media_type: "image/jpeg" });
  assert.equal(png.media_type, "image/png");
  assert.equal(jpg.media_type, "image/jpeg");
});
