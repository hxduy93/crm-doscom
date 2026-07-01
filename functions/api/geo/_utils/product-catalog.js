// Danh mục sản phẩm THẬT của Doscom + NOMA (nguồn: doscom.vn, noma.vn — cập nhật 2026-07).
//
// Mục đích: "neo" (grounding) các prompt sinh title & nội dung. AI CHỈ được nhắc sản phẩm
// có trong danh mục này, TUYỆT ĐỐI không bịa tên model. Mỗi title bài viết PHẢI giới thiệu
// đúng 1 sản phẩm có công dụng khớp chủ đề (vd bài về đèn pha ố vàng → "NOMA 620").
//
// Dữ liệu tĩnh → giữ AI output deterministic (red line dự án). Sửa danh mục thì sửa ở ĐÂY,
// cả analyze-gaps.js và generate-content.js đều đọc chung.

export const PRODUCT_CATALOG = {
  // Doscom = thiết bị an ninh & giám sát cá nhân/gia đình (KHÔNG phải phần mềm POS/ERP).
  doscom: [
    { name: "Doscom DA1 Pro",  use: "camera mini WiFi giám sát trong nhà" },
    { name: "Doscom DA6 Pro",  use: "camera 4G năng lượng mặt trời lắp ngoài trời" },
    { name: "Doscom DA8.1",    use: "camera gọi video 2 chiều" },
    { name: "Doscom D1",       use: "máy dò camera ẩn, thiết bị nghe lén và định vị" },
    { name: "Doscom D5",       use: "máy dò sóng chuyên nghiệp dải rộng 50MHz–12GHz" },
    { name: "Doscom DR1",      use: "máy ghi âm" },
    { name: "Doscom DI2",      use: "thiết bị chống & phá sóng ghi âm" },
    { name: "Doscom DV1 Pro",  use: "định vị GPS mini gắn xe/tài sản" },
    { name: "Doscom DV3",      use: "định vị GPS cắm cổng OBD-2 trên ô tô" },
    { name: "Doscom DV5",      use: "camera hành trình 4G 2 mắt cho ô tô" },
    { name: "Doscom chuông cửa thông minh", use: "chuông cửa có camera quan sát" },
  ],
  // NOMA = hóa chất chăm sóc & làm sạch ô tô công nghệ Mỹ, pH trung tính.
  noma: [
    { name: "NOMA 911", use: "tẩy ố và phủ chống bám nước trên kính ô tô" },
    { name: "NOMA 310", use: "chống mờ hơi nước và vết nước trên kính" },
    { name: "NOMA 890", use: "xịt làm bóng nhanh, phục hồi sơn" },
    { name: "NOMA 955", use: "xóa vết xước sơn" },
    { name: "NOMA 620", use: "phục hồi đèn pha bị ố vàng, mờ đục" },
    { name: "NOMA 250", use: "phục hồi nhựa nhám/nhựa đen bạc màu" },
    { name: "NOMA 692", use: "làm sạch ghế nỉ và ghế da" },
    { name: "NOMA 686", use: "bộ vệ sinh & dưỡng ghế da" },
    { name: "NOMA 668", use: "khử mùi nội thất ô tô" },
    { name: "NOMA 350", use: "vệ sinh đĩa phanh, bụi phanh trên mâm" },
    { name: "NOMA 330", use: "tẩy keo, decal, nhựa đường bám trên sơn" },
    { name: "NOMA 988", use: "bọt vệ sinh nội thất" },
    { name: "NOMA 998", use: "bơm và vá lốp khẩn cấp" },
  ],
};

// Chuỗi danh mục để nhét vào prompt. brand = "doscom" | "noma".
export function catalogText(brand) {
  const items = PRODUCT_CATALOG[brand] || [];
  return items.map((p) => `- ${p.name}: ${p.use}`).join("\n");
}

// Kiểm tra 1 tên sản phẩm có thật trong danh mục không (để test/validate, chống bịa).
export function isRealProduct(brand, name) {
  const items = PRODUCT_CATALOG[brand] || [];
  const n = String(name || "").trim().toLowerCase();
  return items.some((p) => p.name.toLowerCase() === n);
}

// Trả về danh sách tên sản phẩm THẬT (trong danh mục) xuất hiện trong text.
// Dùng cho guardrail: title/bài viết phải chứa ít nhất 1 sản phẩm thật.
export function findProductsInText(brand, text) {
  const items = PRODUCT_CATALOG[brand] || [];
  const t = String(text || "").toLowerCase();
  return items.filter((p) => t.includes(p.name.toLowerCase())).map((p) => p.name);
}

// Guardrail cho 1 idea (analyze-gaps): featured_product PHẢI là sản phẩm thật
// VÀ phải thực sự nằm trong title. Trả true nếu đạt, false nếu thiếu/bịa → sẽ bị loại/retry.
export function ideaHasValidProduct(brand, idea) {
  if (!idea || !idea.title || !idea.featured_product) return false;
  if (!isRealProduct(brand, idea.featured_product)) return false;
  return String(idea.title).toLowerCase().includes(String(idea.featured_product).toLowerCase());
}
