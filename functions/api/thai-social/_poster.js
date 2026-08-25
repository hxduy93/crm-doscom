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

/* Cảnh nền theo góc bán hàng — NHIỀU biến thể cho mỗi góc.

   Trước 25/08/2026 mỗi góc chỉ có ĐÚNG MỘT chuỗi cố định, nên mọi bài cùng góc ra ảnh
   gần như y hệt nhau. Người dùng phản ánh "ảnh hơi đơn điệu" — và đó là lỗi prompt chứ
   không phải lỗi model.

   Mọi cảnh vẫn BẮT BUỘC sáng màu: ảnh sản phẩm trong thư viện giữ nguyên bóng đổ gốc của
   ảnh chụp nền trắng, đặt lên nền tối thì bóng đó thành vệt xám bẩn. */
export const SCENE_BY_ANGLE = {
  combo: [
    "clean studio backdrop with a soft blue-to-white gradient and gentle light rays",
    "pale mint studio sweep with soft circular light falloff and a subtle floor reflection",
    "warm sand-toned studio wall with soft afternoon window light and long gentle shadows",
    "cool grey concrete wall with a bright diagonal shaft of sunlight",
  ],
  howto: [
    "modern car interior seen from the passenger seat, morning light through the windshield",
    "close view of a clean dashboard and steering wheel, sunlight falling across the trim",
    "open car door with the side mirror in frame, bright driveway visible beyond",
    "tidy car cabin with a microfibre cloth resting on the seat, soft daylight",
  ],
  ba: [
    "extreme close up of a windshield with water beading into round droplets, backlit",
    "rain-streaked side window with sharp city bokeh behind it, bright overcast light",
    "half-cleaned car glass showing a crisp line between hazy and clear, daylight",
    "wet glass surface catching morning sun, sharp highlights on the droplets",
  ],
  vs_shop: [
    "sunny home driveway with clean concrete and a blurred house behind",
    "quiet residential carport in bright late morning light, soft shadows on the ground",
    "front yard parking spot with green hedges out of focus, clear blue sky",
    "tidy garage entrance opening onto a bright sunlit yard",
  ],
};

/* Biến điệu — xoay vòng để hai bài cùng cảnh vẫn ra hai tấm khác nhau. */
const MOODS = [
  "golden hour warmth", "cool morning blue tones", "soft overcast diffusion",
  "crisp midday clarity", "gentle pastel palette", "clean high-key whites",
];
const LENSES = [
  "35mm wide angle", "50mm natural perspective", "85mm compressed background",
  "low angle hero shot", "slight top-down three-quarter view",
];

// Băm chuỗi → số. Cùng một bài luôn ra cùng ảnh; đổi seed là đổi tấm.
export function seedFrom(str) {
  let h = 2166136261;
  for (let i = 0; i < String(str).length; i++) {
    h ^= String(str).charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return Math.abs(h) % 2147483647;
}

/* Dựng prompt nền cho model sinh ảnh.

   `scene` là gợi ý riêng AI viết theo nội dung bài; thiếu thì lấy một biến thể của góc
   bán hàng theo seed. Phần khoá phía sau là BẤT BIẾN, không cho AI ghi đè. */
export function buildScenePrompt(angle, scene, seed = 0) {
  const bank = SCENE_BY_ANGLE[angle] || SCENE_BY_ANGLE.combo;
  const base = String(scene || "").trim() || bank[seed % bank.length];
  const mood = MOODS[(seed >> 3) % MOODS.length];
  const lens = LENSES[(seed >> 7) % LENSES.length];
  return [
    base + ",",
    mood + ",", lens + ",",
    "advertising background plate, photographic, bright and light, shallow depth of field,",
    "clean empty space on the left half for headline text,",
    "NO text, NO letters, NO words, NO logo, NO watermark,",
    "NO bottle, NO product, NO packaging, NO people, NO hands",
  ].join(" ");
}

/* Prompt phủ định — model nào nhận `negative_prompt` thì dùng cái này.

   flux-1-schnell KHÔNG nhận negative_prompt, nên với nó những chữ "NO bottle" ở trên chỉ
   là từ nằm trong prompt thuận: mô hình thấy chữ "bottle" và đôi khi vẽ thêm chai vào.
   Đây là một lý do nữa khiến ảnh cũ vừa đơn điệu vừa hay lạc đề. */
export const NEGATIVE_PROMPT =
  "text, letters, words, typography, logo, watermark, signature, "
  + "bottle, spray can, product packaging, label, people, hands, faces, "
  + "cluttered, busy background, dark, low quality, blurry, distorted";

/* Khuôn ảnh. Trình duyệt vẽ theo đúng những con số này (xem thai-social.html).
   Để ở server để một chỗ đổi là cả hai bên đổi theo, và test khoá được. */
export const POSTER = {
  size: 1080,
  // Dải sáng phủ bên trái để chữ luôn đọc được dù nền sinh ra thế nào.
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
