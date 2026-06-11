// GET /l/<seg> — trang landing CÔNG KHAI (GIỮ để tương thích link cũ đã chia sẻ).
// Link mới chạy thẳng ở gốc /<seg> (functions/[seg].js). Cùng dùng serveLanding.
import { serveLanding } from "../lib/serveLanding.js";

export async function onRequestGet({ env, params }) {
  return serveLanding(env, params.seg);
}
