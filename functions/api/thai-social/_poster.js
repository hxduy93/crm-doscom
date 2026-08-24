// Ảnh bài đăng = ảnh GHÉP 3 lớp, không phải một tấm Flux vẽ thẳng ra.
//
//   1. NỀN   — Flux sinh cảnh theo góc bán hàng. KHÔNG vẽ chai, KHÔNG vẽ chữ.
//   2. SẢN PHẨM — ảnh thật đã tách nền trong sku-images/, đè lên nền.
//   3. CHỮ   — vẽ bằng canvas trên trình duyệt, font Noto Sans Thai.
//
// Vì sao chia lớp thay vì bảo Flux vẽ hết:
//   - Flux vẽ chai NOMA thì nhãn sai, tỉ lệ sai — đúng lý do ban đầu ta dựng thư viện ảnh.
//   - Flux viết chữ Thái thì méo và sai dấu. Chữ vẽ bằng canvas mới chuẩn.
//
// Vì sao ghép ở TRÌNH DUYỆT chứ không ở server: tài khoản chưa bật Cloudflare Images nên
// Function không ghép được ảnh; đổi lại, ghép lúc người dùng xem duyệt có cái lợi thật là
// họ thấy ĐÚNG tấm ảnh sẽ được đăng, sửa chữ là ảnh vẽ lại ngay.

/* Cảnh nền theo từng góc bán hàng.
   Mọi cảnh đều BẮT BUỘC sáng màu: ảnh sản phẩm trong thư viện giữ nguyên bóng đổ gốc của
   ảnh chụp nền trắng — đặt lên nền tối thì bóng đó thành vệt xám bẩn. Nền sáng vừa giấu
   được nó vừa hợp kiểu ảnh quảng cáo sản phẩm. */
export const SCENE_BY_ANGLE = {
  combo:
    "bright clean product photography backdrop, soft gradient from white to pale blue, "
    + "subtle light rays, minimal, airy, lots of empty space on the left side",
  howto:
    "bright modern car interior seen through the windshield, soft morning daylight, "
    + "clean dashboard, shallow depth of field, airy and light, empty space on the left",
  ba:
    "close up of a clean car windshield with water beading, bright daylight, "
    + "crisp and glossy, light background, plenty of empty space on the left",
  vs_shop:
    "bright home driveway on a sunny morning, clean concrete, soft shadows, "
    + "blurred house in the background, minimal, empty space on the left",
};

/* Dựng prompt nền cho Flux.
   `scene` là gợi ý riêng do AI viết theo nội dung bài; nếu thiếu thì rơi về cảnh mặc định
   của góc bán hàng. Phần khoá phía sau là BẤT BIẾN, không cho AI ghi đè:
   không chữ, không chai, chừa chỗ trống bên trái để đặt tiêu đề. */
export function buildScenePrompt(angle, scene) {
  const base = String(scene || "").trim() || SCENE_BY_ANGLE[angle] || SCENE_BY_ANGLE.combo;
  return [
    base,
    "advertising background plate, bright and light, high key lighting,",
    "NO text, NO letters, NO words, NO logo, NO watermark,",
    "NO bottle, NO product, NO packaging, NO people, NO hands,",
    "clean empty composition with copy space",
  ].join(" ");
}

/* Khuôn ảnh. Trình duyệt vẽ theo đúng những con số này (xem thai-social.html).
   Để ở server để một chỗ đổi là cả hai bên đổi theo, và test khoá được. */
export const POSTER = {
  size: 1080,
  // Dải sáng phủ bên trái để chữ luôn đọc được dù nền Flux ra thế nào.
  scrim: { from: 0.0, to: 0.62, alpha: 0.82 },
  title: { x: 72, y: 150, maxWidth: 560, fontSize: 76, lineHeight: 92, maxLines: 3 },
  sub:   { x: 72, gap: 26, maxWidth: 540, fontSize: 38, lineHeight: 52, maxLines: 3 },
  // Sản phẩm nằm bên phải, đáy cách mép dưới một chút.
  product: { rightPad: 56, bottomPad: 56, maxHeightRatio: 0.74, maxWidthRatio: 0.46 },
};

/* Giới hạn độ dài chữ trên ảnh. Tiếng Thái không có dấu cách giữa từ nên đếm KÝ TỰ,
   đếm từ là vô nghĩa. Quá dài thì canvas phải thu nhỏ chữ và bố cục vỡ. */
export const POSTER_LIMITS = { title: 42, sub: 90 };

export function clipPosterText(s, max) {
  const t = String(s || "").replace(/\s+/g, " ").trim();
  return t.length <= max ? t : t.slice(0, max).trim();
}
