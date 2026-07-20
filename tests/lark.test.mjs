// Test helper Lark Base — chỉ phần logic THUẦN, không gọi mạng.
// (Phần gọi API thật phải test tay bằng scripts/lark-probe.mjs vì cần app secret.)
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  LarkError, listRecords, listTables, getTenantToken, parseLarkUrl, resolveAppToken,
  larkText, larkNum, larkLinkIds, redactSensitive,
} from "../functions/lib/lark.js";

// ── Chuẩn hoá field ─────────────────────────────────────────────────────────
// GET /records và POST /records/search trả CÙNG cột theo 2 định dạng khác nhau.
// Không chuẩn hoá thì tiêu đề video in ra "[object Object]" (đã dính thật).

test("larkText: dạng rich-text của /records/search → chuỗi thường", () => {
  assert.equal(larkText([{ text: "Tẩy ố kính", type: "text" }]), "Tẩy ố kính");
  assert.equal(larkText([{ text: "a" }, { text: "b" }]), "ab");
});

test("larkText: dạng {type,value} (cột Link video trong search) → chuỗi", () => {
  assert.equal(larkText({ type: 1, value: [{ text: "tiktok.com/@x/video/1" }] }), "tiktok.com/@x/video/1");
});

test("larkText: dạng chuỗi thường của GET /records → giữ nguyên", () => {
  assert.equal(larkText("Noma Auto"), "Noma Auto");
  assert.equal(larkText(""), null);
  assert.equal(larkText(null), null);
});

test("larkNum: số dạng CHUỖI (GET) và dạng số (search) đều ra number", () => {
  assert.equal(larkNum("4118543"), 4118543);   // GET /records
  assert.equal(larkNum(4118543), 4118543);     // POST /records/search
  assert.equal(larkNum("1,234"), 1234);
  assert.equal(larkNum(null), 0);
  assert.equal(larkNum("abc"), 0);
});

test("larkLinkIds: cột liên kết ở cả 2 định dạng → mảng record_id", () => {
  assert.deepEqual(larkLinkIds({ link_record_ids: ["rec1", "rec2"] }), ["rec1", "rec2"]);
  assert.deepEqual(larkLinkIds([{ record_ids: ["rec1"], text: "Noma Auto" }]), ["rec1"]);
  assert.deepEqual(larkLinkIds(null), []);
});

// ── Che secret ──────────────────────────────────────────────────────────────
// Base có bảng tiktok_shop_credentials chứa access_token/app_secret THẬT, mà
// /api/lark/records đọc được bất kỳ bảng nào theo tham số URL.

test("redactSensitive: che token/secret/cipher nhưng GIỮ cột thường", () => {
  const { fields, redacted } = redactSensitive({
    shop_name: "Noma Auto",
    access_token: "ROW_cV0biwAAAA",
    app_secret: "31b5d3edf891",
    refresh_token: "x",
    shop_cipher: "y",
    app_key: "6jqpfbs7b0hmh",
  });
  assert.equal(fields.shop_name, "Noma Auto", "cột thường phải giữ nguyên");
  assert.equal(fields.access_token, "***");
  assert.equal(fields.app_secret, "***");
  assert.equal(fields.refresh_token, "***");
  assert.equal(fields.shop_cipher, "***");
  assert.equal(redacted, 4);
});

test("redactSensitive: không sửa object gốc", () => {
  const orig = { access_token: "bí mật" };
  redactSensitive(orig);
  assert.equal(orig.access_token, "bí mật");
});

// ── parseLarkUrl ────────────────────────────────────────────────────────────
// Base của Doscom nằm trong WIKI → mã trên URL là node token, KHÔNG phải app_token.
// Gọi thẳng bitable bằng node token sẽ ăn 91402 NOTEXIST rất khó đoán.

test("parseLarkUrl: link wiki thật của Doscom → kind=wiki + lấy đúng table/view", () => {
  const p = parseLarkUrl("https://doscom-holdings.sg.larksuite.com/wiki/JBVvwm5veis1lbkUpTZlMqhFg6e?table=tblpIc7Z8iIrmCJK&view=vewqJmfUxc");
  assert.equal(p.kind, "wiki");
  assert.equal(p.token, "JBVvwm5veis1lbkUpTZlMqhFg6e");
  assert.equal(p.tableId, "tblpIc7Z8iIrmCJK");
  assert.equal(p.viewId, "vewqJmfUxc");
});

test("parseLarkUrl: link /base/ (Base độc lập) → kind=base", () => {
  const p = parseLarkUrl("https://x.larksuite.com/base/Sdv5b0LfoaEiIZsS6yHlTX41gid?table=tblAbc");
  assert.equal(p.kind, "base");
  assert.equal(p.token, "Sdv5b0LfoaEiIZsS6yHlTX41gid");
  assert.equal(p.tableId, "tblAbc");
});

test("parseLarkUrl: URL không có /wiki/ hay /base/ (vd applink tin nhắn) → null", () => {
  assert.equal(parseLarkUrl("https://applink.larksuite.com/client/message/link/open?token=AmnF5rb"), null);
  assert.equal(parseLarkUrl("https://open.larksuite.com/app/cli_aad2f84671b85ed1/baseinfo"), null);
  assert.equal(parseLarkUrl(""), null);
  assert.equal(parseLarkUrl(null), null);
});

test("resolveAppToken: link /base/ không cần gọi mạng, trả thẳng app_token", async () => {
  const r = await resolveAppToken({}, null, { url: "https://x.larksuite.com/base/ABC123?table=tblZ" });
  assert.equal(r.appToken, "ABC123");
  assert.equal(r.tableId, "tblZ");
});

test("resolveAppToken: URL rác → báo lỗi rõ, không gọi mạng", async () => {
  await assert.rejects(
    () => resolveAppToken({}, null, { url: "https://applink.larksuite.com/client/message/link/open?token=x" }),
    /URL Lark không hợp lệ/
  );
});

test("resolveAppToken: không truyền gì → báo thiếu input", async () => {
  await assert.rejects(() => resolveAppToken({}, null, {}), /Thiếu url \/ wiki \/ base/);
});

test("LarkError: mã 91402 kèm gợi ý 'thêm app vào Base' (lỗi hay gặp nhất)", () => {
  const e = new LarkError(91402, "not found", "Thêm app làm cộng tác viên của Base.");
  assert.equal(e.code, 91402);
  assert.match(e.message, /91402/);
  assert.match(e.message, /cộng tác viên/);
});

test("LarkError: không có gợi ý thì message vẫn giữ code + msg", () => {
  const e = new LarkError(12345, "lỗi lạ");
  assert.equal(e.message, "[Lark 12345] lỗi lạ");
});

test("listRecords: thiếu app_token → ném lỗi TRƯỚC khi gọi mạng", async () => {
  await assert.rejects(
    () => listRecords({}, null, "", "tblXXX"),
    /Thiếu app_token/
  );
});

test("listRecords: thiếu table_id → ném lỗi TRƯỚC khi gọi mạng", async () => {
  await assert.rejects(
    () => listRecords({}, null, "bascnXXX", ""),
    /Thiếu table_id/
  );
});

test("listTables: thiếu app_token → ném lỗi", async () => {
  await assert.rejects(() => listTables({}, null, ""), /Thiếu app_token/);
});

test("getTenantToken: thiếu APP_ID/APP_SECRET → báo rõ thiếu env, không gọi mạng", async () => {
  await assert.rejects(
    () => getTenantToken({}, null),
    /LARK_APP_ID/
  );
});
