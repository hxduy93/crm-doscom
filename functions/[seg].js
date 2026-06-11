// GET /<seg> — trang landing CÔNG KHAI ở GỐC tên miền (không cần tiền tố /l/).
// Chỉ kích hoạt khi path là 1 đoạn, không trùng file tĩnh; _middleware đã cho qua nếu khớp landing.
import { serveLanding } from "./lib/serveLanding.js";

export async function onRequestGet({ env, params }) {
  return serveLanding(env, params.seg);
}
