import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { rutHoiThoai, phanNhom, taoPayload, caNhanHoa, thamSoMau, tenMauHopLe, demNhom } from "../functions/lib/nhan-tin-lai.js";

// Menu "Nhắn lại khách Messenger" (12/10/2026). Canh:
//   1. cửa sổ 24h tính theo tin cuối của KHÁCH, không theo tin cuối hội thoại;
//   2. đúng loại gửi cho từng nhóm (RESPONSE / HUMAN_AGENT / UTILITY), không bao giờ dùng
//      thẻ đã khai tử POST_PURCHASE_UPDATE;
//   3. trang + menu + build-dist được nối đủ.

const NOW = Date.parse("2026-10-12T10:00:00Z");
const ago = (h) => new Date(NOW - h * 3600000).toISOString();
const PAGE = "1101583133049069";

test("lấy tin cuối của khách, bỏ qua tin Page gửi sau", () => {
  const r = rutHoiThoai({
    id: "t_1", updated_time: ago(1), snippet: "Dạ shop gửi ạ",
    participants: { data: [{ id: PAGE, name: "Noma" }, { id: "999", name: "Anh Minh" }] },
    messages: { data: [
      { from: { id: PAGE }, created_time: ago(1) },
      { from: { id: "999" }, created_time: ago(30) },
      { from: { id: "999" }, created_time: ago(40) },
    ] },
  }, PAGE);
  assert.equal(r.psid, "999");
  assert.equal(r.name, "Anh Minh");
  assert.equal(r.last_customer, ago(30));
  assert.equal(phanNhom(r.last_customer, NOW), "7d");
});

test("không thấy tin khách → không xác định → xếp nhóm quá 7 ngày", () => {
  const r = rutHoiThoai({ id: "t", participants: { data: [{ id: PAGE }, { id: "1" }] },
    messages: { data: [{ from: { id: PAGE }, created_time: ago(1) }] } }, PAGE);
  assert.equal(r.last_customer, null);
  assert.equal(phanNhom(r.last_customer, NOW), "cu");
});

test("ranh giới nhóm", () => {
  assert.equal(phanNhom(ago(23.9), NOW), "24h");
  assert.equal(phanNhom(ago(24), NOW), "7d");
  assert.equal(phanNhom(ago(167.9), NOW), "7d");
  assert.equal(phanNhom(ago(168), NOW), "cu");
  assert.equal(phanNhom("rác", NOW), "cu");
  assert.deepEqual(demNhom([{ last_customer: ago(1) }, { last_customer: ago(50) }, { last_customer: null }], NOW),
    { "24h": 1, "7d": 1, cu: 1 });
});

test("cá nhân hoá {ten}", () => {
  assert.equal(caNhanHoa("Chào {ten}, cảm ơn {ten}!", "Lan"), "Chào Lan, cảm ơn Lan!");
  assert.equal(caNhanHoa("Chào {ten}, shop hỏi thăm", ""), "Chào, shop hỏi thăm");
});

const row = { psid: "999", name: "Minh" };
const tpl = { name: "cham_soc", language: "vi", params: ["customer_name"] };

test("24h → RESPONSE chữ tự do", () => {
  const p = taoPayload(row, "24h", { text: "Chào {ten}" });
  assert.deepEqual(p.body, { recipient: { id: "999" }, messaging_type: "RESPONSE", message: { text: "Chào Minh" } });
  assert.match(taoPayload(row, "24h", { text: "  " }).skip, /nội dung/);
  assert.match(taoPayload(row, "24h", { text: "x".repeat(2001) }).skip, /2000/);
});

test("7 ngày: chỉ HUMAN_AGENT khi tự bật, không thì dùng mẫu hoặc bỏ qua", () => {
  const ha = taoPayload(row, "7d", { text: "Dạ", humanAgent: true });
  assert.equal(ha.body.messaging_type, "MESSAGE_TAG");
  assert.equal(ha.body.tag, "HUMAN_AGENT");
  assert.ok(taoPayload(row, "7d", { text: "Dạ" }).skip);
  assert.equal(taoPayload(row, "7d", { text: "Dạ", template: tpl }).body.messaging_type, "UTILITY");
});

test("quá 7 ngày → chỉ mẫu Utility, HUMAN_AGENT không mở được", () => {
  assert.ok(taoPayload(row, "cu", { text: "Dạ", humanAgent: true }).skip);
  const p = taoPayload(row, "cu", { template: tpl });
  assert.deepEqual(p.body, {
    recipient: { id: "999" }, messaging_type: "UTILITY",
    message: { template: { name: "cham_soc", language: { code: "vi" },
      components: [{ type: "body", parameters: [{ type: "text", parameter_name: "customer_name", text: "Minh" }] }] } },
  });
  assert.equal(taoPayload({ psid: "1", name: "" }, "cu", { template: tpl }).body.message.template.components[0].parameters[0].text, "bạn");
  assert.match(taoPayload(row, "cu", { template: { name: "x", params: ["order_id"] } }).skip, /order_id/);
  assert.equal(taoPayload(row, "cu", { template: { name: "x", params: [] } }).body.message.template.components, undefined);
});

test("không dùng thẻ đã khai tử 27/04/2026", () => {
  for (const f of ["functions/lib/nhan-tin-lai.js", "functions/api/messenger/send.js"]) {
    const src = readFileSync(new URL("../" + f, import.meta.url), "utf8")
      .split("\n").filter((l) => !l.trim().startsWith("//")).join("\n");
    assert.doesNotMatch(src, /POST_PURCHASE_UPDATE|ACCOUNT_UPDATE|CONFIRMED_EVENT_UPDATE/);
  }
});

test("tham số + tên mẫu", () => {
  assert.deepEqual(thamSoMau("Chào {{customer_name}}, đơn {{ order_id }} {{customer_name}}"), ["customer_name", "order_id"]);
  assert.ok(tenMauHopLe("cham_soc_1"));
  assert.ok(!tenMauHopLe("Chăm sóc"));
});

test("trang được nối đủ vào CRM và build-dist", () => {
  const read = (p) => readFileSync(new URL("../" + p, import.meta.url), "utf8");
  const idx = read("index.html");
  assert.match(idx, /data-view="nhan-tin-lai"/);
  assert.match(idx, /id="view-nhan-tin-lai"/);
  assert.match(idx, /lazyFrame\('nhan-tin-lai',\s*'ntl-frame',\s*'\/nhan-tin-lai'\)/);
  const sh = read("scripts/build-dist.sh");
  assert.match(sh, /nhan-tin-lai\.html/);
  assert.match(sh, /functions\/lib\/nhan-tin-lai\.js/);
  assert.match(read("nhan-tin-lai.html"), /\.\/js\/nhan-tin-lai\.js/);
  assert.match(read("_headers"), /\/nhan-tin-lai/);
});
