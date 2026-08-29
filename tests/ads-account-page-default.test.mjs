import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

// SỰ CỐ 2026-08-29: chọn tkqc "CÔNG TY CP DOSCOM" ở tab "Tự động từ folder" thì ô Page
// KHÔNG còn nhảy về trang "Noma Việt Nam tích xanh" nữa. Nguyên nhân: đổi tkqc thì code
// lấy bừa `promote_pages[0]` — mà tkqc đó có 14 trang, Meta trả về theo bảng chữ cái nên
// trang đầu là "Camera 4G Không Dây Chuyên Dụng", còn trang tích xanh nằm CUỐI. Hai trang
// cùng tên "Noma Việt Nam" nên nhìn dropdown không phát hiện được → quảng cáo chạy sai trang.

const html = readFileSync(new URL("../ads-creator.html", import.meta.url), "utf8");
const grab = (re, name) => {
  const m = html.match(re);
  assert.ok(m, `không trích được ${name} từ ads-creator.html (cấu trúc đổi?)`);
  return m[0];
};

const accountPageBlock = grab(/const ACCOUNT_PAGE = \{[\s\S]*?\r?\n  \}/, "bảng ACCOUNT_PAGE");
const handlerBlock = grab(/const onAutoAccountChange = \(val\) => \{[\s\S]*?\r?\n  \}/, "hàm onAutoAccountChange");

// Dựng lại hàm đổi tài khoản với state giả — trả về trang/pixel mà nó đã chọn.
const doiTaiKhoan = (val, fbRes) => {
  const state = { account: null, page: null, pixel: null };
  const run = new Function("fbRes", "setAutoAccount", "setAutoPage", "setAutoPixel", `
    ${accountPageBlock}
    ${handlerBlock}
    return onAutoAccountChange
  `);
  run(fbRes, (v) => { state.account = v }, (v) => { state.page = v }, (v) => { state.pixel = v })(val);
  return state;
};

const CP_DOSCOM = "act_1254151326914021";
const TICH_XANH = "1101583133049069";

// promote_pages THẬT của tkqc CP DOSCOM (dò qua Meta 29/08/2026): trang tích xanh nằm CUỐI.
const fbResThat = {
  accounts: [{
    id: "1254151326914021",
    pages: [
      { id: "356111140921028", name: "Camera 4G Không Dây Chuyên Dụng" },
      { id: "116027498216695", name: "Camera Dùng Sim 4G Doscom" },
      { id: "110312205647152", name: "Doscom" },
      { id: "681202051750505", name: "Noma Việt Nam" },
      { id: TICH_XANH, name: "Noma Việt Nam" },
    ],
    pixels: [{ id: "811464414891137", name: "WINKI A100" }],
  }],
};

test("chọn tkqc CP DOSCOM → Page nhảy đúng trang Noma Việt Nam TÍCH XANH, không lấy trang đầu danh sách", () => {
  const s = doiTaiKhoan(CP_DOSCOM, fbResThat);
  assert.equal(s.account, CP_DOSCOM);
  assert.equal(s.page, TICH_XANH);
});

test("tkqc mất quyền chạy trang mặc định → rơi về trang đầu (UI có cảnh báo đỏ riêng)", () => {
  const fbRes = {
    accounts: [{
      id: "1254151326914021",
      pages: [{ id: "356111140921028", name: "Camera 4G Không Dây Chuyên Dụng" }],
      pixels: [],
    }],
  };
  assert.equal(doiTaiKhoan(CP_DOSCOM, fbRes).page, "356111140921028");
});

test("chưa tải được danh sách live → vẫn đặt trang mặc định của tkqc, không giữ trang tài khoản cũ", () => {
  assert.equal(doiTaiKhoan(CP_DOSCOM, null).page, TICH_XANH);
  assert.equal(doiTaiKhoan(CP_DOSCOM, { accounts: [] }).page, TICH_XANH);
});

test("tkqc không có trong bảng mặc định → giữ nguyên hành vi cũ (trang đầu của tkqc)", () => {
  const fbRes = {
    accounts: [{ id: "999999999999999", pages: [{ id: "110312205647152", name: "Doscom" }], pixels: [] }],
  };
  assert.equal(doiTaiKhoan("act_999999999999999", fbRes).page, "110312205647152");
});

test("bảng ACCOUNT_PAGE khớp cặp tkqc↔trang khai trong PRODUCTS (không để hai chỗ đá nhau)", () => {
  const productsBlock = grab(/const PRODUCTS = \{[\s\S]*?\r?\n  \}/, "bảng PRODUCTS");
  const PRODUCTS = new Function(`${productsBlock};
return PRODUCTS`)();
  const ACCOUNT_PAGE = new Function(`${accountPageBlock};
return ACCOUNT_PAGE`)();
  for (const [ten, cfg] of Object.entries(PRODUCTS)) {
    if (!cfg.account || !cfg.page) continue;             // SKU chưa chốt tkqc/trang → bỏ qua
    const mongMuon = ACCOUNT_PAGE[cfg.account];
    if (!mongMuon) continue;                              // tkqc chưa khai mặc định → bỏ qua
    assert.equal(mongMuon, cfg.page, `${ten}: PRODUCTS chạy ${cfg.account} trên trang ${cfg.page} nhưng ACCOUNT_PAGE lại mặc định ${mongMuon}`);
  }
});

test("tkqc chưa khai mặc định → chọn trang Meta ĐÃ xác nhận (promote), không lấy trang BM chưa xác minh", () => {
  const fbRes = {
    accounts: [{
      id: "999999999999999",
      pages: [
        { id: "356111140921028", name: "Camera 4G", nguon: "business", promote: false },
        { id: "110312205647152", name: "Doscom", nguon: "promote", promote: true },
      ],
      pixels: [],
    }],
  };
  assert.equal(doiTaiKhoan("act_999999999999999", fbRes).page, "110312205647152");
});
