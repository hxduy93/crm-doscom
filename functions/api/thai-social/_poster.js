// Ảnh bài đăng = ảnh GHÉP 3 lớp, không phải một tấm Flux vẽ thẳng ra.
//
//   1. NỀN   — model sinh nền ĐỒ HOẠ theo góc bán hàng. KHÔNG vẽ chai, KHÔNG vẽ chữ.
//   2. SẢN PHẨM — ảnh thật đã tách nền trong sku-images/, đè lên nền.
//   3. CHỮ   — vẽ bằng canvas trên trình duyệt, font Noto Sans Thai.
//
// Vì sao chia lớp thay vì bảo model vẽ hết:
//   - Model vẽ chai NOMA thì nhãn sai, tỉ lệ sai — đúng lý do ban đầu ta dựng thư viện ảnh.
//   - Model vẽ chữ THÁI thì hay sai dấu thanh. Tiếng Thái xếp chồng 2–3 tầng dấu, nhiều
//     chữ chỉ khác nhau một cái móc; sai một dấu là đổi nghĩa. Model sinh ảnh giỏi chữ
//     Latin, không giỏi chữ Thái. Canvas + font thật thì đúng 100%, không có xác suất sai.
//     Chủ dự án chốt 25/08/2026: không đánh đổi cái chắc chắn lấy cái may rủi.
//
// Vì sao ghép ở TRÌNH DUYỆT chứ không ở server: tài khoản chưa bật Cloudflare Images nên
// Function không ghép được ảnh; đổi lại, ghép lúc người dùng xem duyệt có cái lợi thật là
// họ thấy ĐÚNG tấm ảnh sẽ được đăng, sửa chữ là ảnh vẽ lại ngay.

/* Nền theo góc bán hàng — NHIỀU biến thể cho mỗi góc.

   Hai lần sửa, cùng một triệu chứng "ảnh nhìn đơn điệu":

   25/08/2026 (lần 1) — mỗi góc chỉ có ĐÚNG MỘT chuỗi cố định và không có seed, nên mọi
   bài cùng góc ra ảnh gần y hệt. Thêm biến thể + seed.

   25/08/2026 (lần 2) — vẫn phẳng, vì tôi bảo model vẽ "advertising background plate",
   tức một TẤM ẢNH CHỤP trơn cố ý để trống. Nó làm đúng thứ được yêu cầu, chỉ là thứ đó
   nhạt. Nay yêu cầu model dựng NỀN ĐỒ HOẠ thật: khối màu chéo, panel, tia sáng, hoạ tiết
   — như designer dựng poster. Chữ Thái vẫn do canvas vẽ bằng font thật, nên không đánh
   đổi rủi ro sai dấu để lấy cái đẹp.

   Mọi nền vẫn BẮT BUỘC sáng màu: ảnh sản phẩm trong thư viện giữ nguyên bóng đổ gốc của
   ảnh chụp nền trắng, đặt lên nền tối thì bóng đó thành vệt xám bẩn. */
export const SCENE_BY_ANGLE = {
  combo: [
    "bold diagonal colour-block poster background, deep blue and warm orange panels "
    + "meeting on a clean white field, crisp geometric edges",
    "soft 3D gradient blobs in sky blue and coral floating over an off-white canvas, "
    + "subtle grain, generous open area",
    "wide concentric arcs radiating from the lower right in blue and orange tints "
    + "on a bright cream background",
    "modern promo layout with a large rounded rectangle panel in gradient blue, "
    + "thin accent stripes, airy white margin",
  ],
  howto: [
    "step-by-step poster background, three soft rounded panels stacked diagonally "
    + "in pale blue tints on white, clean and instructional",
    "light grid pattern fading out, one highlighted rounded card area in mint, "
    + "minimal editorial layout",
    "numbered-flow poster backdrop with soft dotted connector lines and pale blue "
    + "circles on a bright canvas",
    "clean infographic background, gentle isometric planes in white and light blue, "
    + "soft ambient shadows",
  ],
  ba: [
    "split-screen poster background, left half hazy frosted texture, right half "
    + "crystal clear glossy blue, sharp vertical divider",
    "before-and-after layout with a bold diagonal split between dull grey and "
    + "vivid glossy cyan, high contrast graphic style",
    "abstract water-droplet graphic pattern in cyan on a bright white field, "
    + "large clear area on the left",
    "glossy blue ribbon sweeping across a white background with sparkling highlight "
    + "accents, transformation feel",
  ],
  vs_shop: [
    "comparison poster background split by a bold vertical band, muted grey side "
    + "versus bright optimistic yellow-orange side",
    "two rounded panels side by side, one dull slate and one warm sunny gradient, "
    + "clean modern layout",
    "graphic price-tag and clock icons rendered as flat abstract shapes in soft "
    + "orange on a bright neutral background",
    "bright sunburst rays in warm amber spreading from the right edge over a clean "
    + "off-white canvas",
  ],
};

/* Biến điệu — xoay vòng để hai bài cùng nền vẫn ra hai tấm khác nhau. */
const MOODS = [
  "warm amber and cream palette", "cool blue and white palette",
  "fresh mint and teal palette", "soft coral and ivory palette",
  "clean high-key whites with one bold accent", "muted pastel palette with crisp edges",
];

/* Kiểu đồ hoạ — thay cho danh sách ống kính của bản cũ. Nền giờ là thiết kế, không phải
   ảnh chụp, nên nói về phong cách dựng hình mới đúng việc. */
const STYLES = [
  "flat vector shapes with crisp edges",
  "soft 3D gradient forms with gentle shadows",
  "glassmorphism panels with subtle blur",
  "clean editorial layout with generous white space",
  "bold geometric blocking with thin accent lines",
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
  const style = STYLES[(seed >> 7) % STYLES.length];
  return [
    base + ",",
    mood + ",", style + ",",
    "graphic design poster background, advertising key visual, bright and light,",
    "left half kept clean and uncluttered for headline text,",
    "NO text, NO letters, NO words, NO numbers, NO logo, NO watermark,",
    "NO bottle, NO product, NO packaging, NO people, NO hands",
  ].join(" ");
}

/* BRIEF cho model dòng gpt-image.

   Khác hẳn prompt cho model khuếch tán: chuỗi tag ngắt bằng dấu phẩy ("flat vector, bright,
   NO text") là ngôn ngữ của Flux/SD. gpt-image nghe BRIEF viết bằng câu như giao việc cho
   designer, và tuân lệnh phủ định viết bằng lời rõ ràng — nên không cần negative_prompt,
   chỉ cần nói thẳng "không được có chữ".

   Cố ý mô tả cả BỐ CỤC: nửa phải chừa chỗ cho ảnh sản phẩm thật sẽ dán đè, nửa trái chừa
   cho chữ Thái. Không nói ra thì model dựng thiết kế kín khung, dán sản phẩm lên là đè
   mất trọng tâm. */
export function buildDesignBrief(angle, scene, seed = 0) {
  const bank = SCENE_BY_ANGLE[angle] || SCENE_BY_ANGLE.combo;
  const base = String(scene || "").trim() || bank[seed % bank.length];
  const mood = MOODS[(seed >> 3) % MOODS.length];
  const style = STYLES[(seed >> 7) % STYLES.length];

  return [
    "Design a square background artwork for a Facebook product advertisement.",
    `The visual direction is: ${base}.`,
    `Use a ${mood}, rendered as ${style}.`,
    "",
    "Composition requirements:",
    "- Keep the LEFT half visually calm and uncluttered. A headline will be placed there later.",
    "- Keep the LOWER RIGHT area relatively simple. A product photo will be placed there later.",
    "- Overall brightness must be light; avoid dark or heavy areas.",
    "",
    "Strict rules:",
    "- Do NOT draw any text, letters, numbers, words, captions, labels or signatures.",
    "- Do NOT draw any bottle, spray can, product or packaging.",
    "- Do NOT draw people, hands, faces, cars or vehicles.",
    "- Do NOT add any logo or watermark.",
    "",
    "The result should look like a polished advertising key visual made by a graphic designer,",
    "not a photograph and not a cluttered collage.",
  ].join("\n");
}

/* Prompt phủ định — model nào nhận `negative_prompt` thì dùng cái này.

   flux-1-schnell KHÔNG nhận negative_prompt, nên với nó những chữ "NO bottle" ở trên chỉ
   là từ nằm trong prompt thuận: mô hình thấy chữ "bottle" và đôi khi vẽ thêm chai vào.
   Đây là một lý do nữa khiến ảnh cũ vừa đơn điệu vừa hay lạc đề. */
export const NEGATIVE_PROMPT =
  "text, letters, words, typography, logo, watermark, signature, "
  + "bottle, spray can, product packaging, label, people, hands, faces, "
  + "cluttered, busy background, dark, low quality, blurry, distorted, "
  + "car, vehicle, gibberish letters, fake writing, garbled script";

/* Khuôn ảnh. Trình duyệt vẽ theo đúng những con số này (xem thai-social.html).
   Để ở server để một chỗ đổi là cả hai bên đổi theo, và test khoá được. */
export const POSTER = {
  size: 1080,
  /* Dải sáng phủ bên trái. HẠ từ 0,82 xuống 0,55 khi chuyển sang nền đồ hoạ: phủ dày như
     cũ thì thiết kế bên dưới bị rửa trắng, quay lại đúng cái phẳng mà ta vừa sửa. Chữ giữ
     đọc được bằng quầng sáng quanh chữ (textHalo) thay vì bằng lớp phủ dày. */
  scrim: { from: 0.0, to: 0.58, alpha: 0.55 },
  textHalo: { color: "rgba(255,255,255,.92)", blur: 20 },
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
