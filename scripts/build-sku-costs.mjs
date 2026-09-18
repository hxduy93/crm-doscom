// Rút bảng giá vốn từng SKU NOMA ra dist/data/sku-costs.json cho công cụ "ROAS mục tiêu".
//
// Vì sao phải rút riêng: nguồn giá vốn là data/cost-source/skus-extended.json, mà cả thư mục
// cost-source/ KHÔNG được đẩy lên web (nó đi kèm file kho tổng). Trang roas-tool.html chạy
// trong trình duyệt nên cần một file nhỏ, công khai trong dist.
//
// Khoá là MÃ SỐ ("230", "911") để khớp thẳng mã gói trên landing ('le-230', 'combo-230-911').
import { readFileSync, writeFileSync } from "node:fs";

const ext = JSON.parse(readFileSync("data/cost-source/skus-extended.json", "utf8"));
const gia = {};
for (const [ten, v] of Object.entries(ext.price_overrides_vnd || {})) {
  const m = String(ten).match(/^Noma\s*(\d{3})$/i);
  if (m && typeof v === "number" && v > 0) gia[m[1]] = v;
}

const n = Object.keys(gia).length;
if (n < 10) {
  console.error(`[build-sku-costs] chỉ rút được ${n} SKU giá vốn — kiểm lại price_overrides_vnd trong skus-extended.json`);
  process.exit(1);
}

writeFileSync("dist/data/sku-costs.json", JSON.stringify({
  nguon: "data/cost-source/skus-extended.json",
  cap_nhat: new Date().toISOString().slice(0, 10),
  gia_von: gia,
}, null, 2));
console.log(`  ✓ sku-costs.json: ${n} SKU`);
