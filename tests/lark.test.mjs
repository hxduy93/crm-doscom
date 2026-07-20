// Test helper Lark Base — chỉ phần logic THUẦN, không gọi mạng.
// (Phần gọi API thật phải test tay bằng scripts/lark-probe.mjs vì cần app secret.)
import { test } from "node:test";
import assert from "node:assert/strict";
import { LarkError, listRecords, listTables, getTenantToken, parseLarkUrl, resolveAppToken } from "../functions/lib/lark.js";

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
