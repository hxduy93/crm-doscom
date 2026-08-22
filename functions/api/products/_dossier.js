/* ══════════════════════════════════════════════════════════════════════════════
   ĐỌC FILE "HỒ SƠ SẢN PHẨM" → bảng dữ liệu chuẩn cho phần Sửa brandcore.

   Vì sao tự viết thay vì dùng thư viện: Pages Functions không cài npm package cho
   runtime, và toàn bộ việc ở đây chỉ là bung ZIP + quét XML — dùng
   DecompressionStream("deflate-raw") có sẵn của Workers là đủ.

   Định dạng đọc được:
     .xlsx  — bung ZIP, đọc sharedStrings.xml + sheet đầu tiên (kể cả ô gộp/rỗng).
     .docx  — bung ZIP, lấy chữ trong word/document.xml.
     .csv .tsv — tách theo dấu phẩy/tab, hiểu ô có dấu nháy kép.
     .json  — mảng object hoặc { products: [...] }.
     .txt .md và mọi loại khác — đọc thẳng dạng chữ.
   .pdf và .doc (bản cũ, không phải .docx) KHÔNG đọc được — nén/ mã hoá riêng, cần
   thư viện nặng. Gặp hai loại này thì báo rõ để người dùng xuất lại sang xlsx/docx,
   KHÔNG đoán bừa nội dung.
   ══════════════════════════════════════════════════════════════════════════════ */

/* ─────────────────────────────── ZIP ─────────────────────────────── */

// Đọc theo CENTRAL DIRECTORY chứ không quét local header: Excel hay ghi kích thước
// vào "data descriptor" phía sau khối dữ liệu, lúc đó local header ghi size = 0 và
// đọc theo nó sẽ ra file rỗng mà không báo lỗi gì.
function findEOCD(buf) {
  for (let i = buf.length - 22; i >= Math.max(0, buf.length - 66000); i--) {
    if (buf[i] === 0x50 && buf[i + 1] === 0x4b && buf[i + 2] === 0x05 && buf[i + 3] === 0x06) return i;
  }
  return -1;
}

async function inflateRaw(bytes) {
  const ds = new DecompressionStream("deflate-raw");
  const stream = new Blob([bytes]).stream().pipeThrough(ds);
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

/** Bung ZIP → Map<tên file, Uint8Array>. Chỉ bung những file mà `want(name)` nhận. */
async function unzip(buf, want) {
  const dv = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  const eocd = findEOCD(buf);
  if (eocd < 0) throw new Error("khong_phai_file_zip");

  const total = dv.getUint16(eocd + 10, true);
  let p = dv.getUint32(eocd + 16, true);
  const out = new Map();
  const dec = new TextDecoder();

  for (let i = 0; i < total && p + 46 <= buf.length; i++) {
    if (dv.getUint32(p, true) !== 0x02014b50) break;          // PK\x01\x02
    const method = dv.getUint16(p + 10, true);
    const compSize = dv.getUint32(p + 20, true);
    const nameLen = dv.getUint16(p + 28, true);
    const extraLen = dv.getUint16(p + 30, true);
    const cmtLen = dv.getUint16(p + 32, true);
    const localOff = dv.getUint32(p + 42, true);
    const name = dec.decode(buf.subarray(p + 46, p + 46 + nameLen));
    p += 46 + nameLen + extraLen + cmtLen;

    if (!want(name)) continue;

    // Nhảy qua local header để tới đúng khối dữ liệu (độ dài name/extra ở local
    // header CÓ THỂ khác central directory — phải đọc lại tại chỗ).
    const lNameLen = dv.getUint16(localOff + 26, true);
    const lExtraLen = dv.getUint16(localOff + 28, true);
    const start = localOff + 30 + lNameLen + lExtraLen;
    const raw = buf.subarray(start, start + compSize);
    out.set(name, method === 0 ? raw : await inflateRaw(raw));
  }
  return out;
}

/* ─────────────────────────────── XLSX ─────────────────────────────── */

const XML_ENT = { "&amp;": "&", "&lt;": "<", "&gt;": ">", "&quot;": '"', "&apos;": "'" };
const unxml = (s) =>
  String(s).replace(/&(amp|lt|gt|quot|apos);/g, (m) => XML_ENT[m])
           .replace(/&#(\d+);/g, (_, d) => String.fromCharCode(+d))
           .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCharCode(parseInt(h, 16)));

// "B12" → { c: 1, r: 11 } (đều đếm từ 0)
function cellRef(ref) {
  const m = /^([A-Z]+)(\d+)$/.exec(ref || "");
  if (!m) return null;
  let c = 0;
  for (const ch of m[1]) c = c * 26 + (ch.charCodeAt(0) - 64);
  return { c: c - 1, r: +m[2] - 1 };
}

function sharedStrings(xml) {
  const out = [];
  // Mỗi <si> có thể gồm nhiều <t> (chữ bị chia khúc do định dạng) → nối hết lại,
  // nếu chỉ lấy <t> đầu thì mất chữ mà không ai để ý.
  for (const si of xml.split("<si>").slice(1)) {
    const body = si.split("</si>")[0];
    let s = "";
    for (const m of body.matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g)) s += unxml(m[1]);
    out.push(s);
  }
  return out;
}

function sheetRows(xml, strings) {
  const rows = [];
  for (const rm of xml.matchAll(/<row[^>]*>([\s\S]*?)<\/row>/g)) {
    const cells = [];
    for (const cm of rm[1].matchAll(/<c\s([^>]*)>([\s\S]*?)<\/c>|<c\s([^>]*)\/>/g)) {
      const attrs = cm[1] || cm[3] || "";
      const body = cm[2] || "";
      const pos = cellRef((/r="([A-Z]+\d+)"/.exec(attrs) || [])[1]);
      const type = (/t="([^"]+)"/.exec(attrs) || [])[1];
      let val = "";
      if (type === "inlineStr") {
        for (const m of body.matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g)) val += unxml(m[1]);
      } else {
        const v = (/<v>([\s\S]*?)<\/v>/.exec(body) || [])[1];
        if (v != null) val = type === "s" ? (strings[+v] ?? "") : unxml(v);
      }
      if (pos) { cells[pos.c] = val; if (!rows[pos.r]) rows[pos.r] = []; }
      const r = pos ? pos.r : rows.length;
      if (!rows[r]) rows[r] = [];
      if (pos) rows[r][pos.c] = val;
    }
    void cells;
  }
  // Vá lỗ hổng: hàng/ô trống trong xlsx không sinh thẻ nào.
  const width = rows.reduce((m, r) => Math.max(m, (r || []).length), 0);
  return rows.map((r) => Array.from({ length: width }, (_, i) => (r && r[i] != null ? String(r[i]) : "")));
}

async function readXlsx(buf) {
  const files = await unzip(buf, (n) => n === "xl/sharedStrings.xml" || /^xl\/worksheets\/sheet\d+\.xml$/.test(n));
  const dec = new TextDecoder();
  const ss = files.get("xl/sharedStrings.xml") ? sharedStrings(dec.decode(files.get("xl/sharedStrings.xml"))) : [];
  const sheetName = [...files.keys()].filter((n) => n.startsWith("xl/worksheets/")).sort()[0];
  if (!sheetName) throw new Error("xlsx_khong_co_sheet");
  return sheetRows(dec.decode(files.get(sheetName)), ss);
}

/* ─────────────────────────── các định dạng khác ─────────────────────────── */

async function readDocxText(buf) {
  const files = await unzip(buf, (n) => n === "word/document.xml");
  const xml = new TextDecoder().decode(files.get("word/document.xml") || new Uint8Array());
  return unxml(xml.replace(/<\/w:p>/g, "\n").replace(/<[^>]+>/g, ""));
}

// Tách CSV/TSV có hiểu ô bọc nháy kép (ô mô tả sản phẩm hay chứa dấu phẩy + xuống dòng).
function parseDelimited(text, sep) {
  const rows = [[]];
  let cur = "", q = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (q) {
      if (ch === '"' && text[i + 1] === '"') { cur += '"'; i++; }
      else if (ch === '"') q = false;
      else cur += ch;
    } else if (ch === '"') q = true;
    else if (ch === sep) { rows[rows.length - 1].push(cur); cur = ""; }
    else if (ch === "\n") { rows[rows.length - 1].push(cur); cur = ""; rows.push([]); }
    else if (ch !== "\r") cur += ch;
  }
  rows[rows.length - 1].push(cur);
  return rows.filter((r) => r.some((c) => String(c).trim()));
}

/** Đọc file bất kỳ → { kind: "rows"|"text"|"json", rows?, text?, json? } */
export async function readAnyFile(name, bytes) {
  const ext = (String(name).match(/\.([a-z0-9]+)$/i) || [])[1]?.toLowerCase() || "";
  const isZip = bytes[0] === 0x50 && bytes[1] === 0x4b;

  if (ext === "pdf" || (bytes[0] === 0x25 && bytes[1] === 0x50 && bytes[2] === 0x44)) {
    throw new Error("pdf_khong_doc_duoc — xuất lại sang .xlsx hoặc .docx rồi tải lên");
  }
  if (ext === "doc" && !isZip) {
    throw new Error("doc_ban_cu_khong_doc_duoc — lưu lại thành .docx rồi tải lên");
  }
  if (ext === "xlsx" || ext === "xlsm" || (isZip && ext !== "docx")) {
    return { kind: "rows", rows: await readXlsx(bytes) };
  }
  if (ext === "docx" || isZip) {
    return { kind: "text", text: await readDocxText(bytes) };
  }

  const text = new TextDecoder().decode(bytes);
  if (ext === "json" || /^\s*[[{]/.test(text)) {
    try { return { kind: "json", json: JSON.parse(text) }; } catch { /* rơi xuống dạng chữ */ }
  }
  if (ext === "csv") return { kind: "rows", rows: parseDelimited(text, ",") };
  if (ext === "tsv") return { kind: "rows", rows: parseDelimited(text, "\t") };
  return { kind: "text", text };
}

/* ──────────────────── bảng → hồ sơ sản phẩm chuẩn ──────────────────── */

const norm = (s) =>
  String(s || "").toLowerCase()
    .normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/đ/g, "d")
    .replace(/[^a-z0-9]+/g, " ").trim();

/* Tên cột trong file → khoá chuẩn. So bằng chuỗi ĐÃ BỎ DẤU và gộp khoảng trắng, để
   file sau có sửa hoa/thường, thêm bớt dấu câu hay xuống dòng thì vẫn khớp. */
const COL_MAP = [
  ["ten san pham", "ten"], ["ma san pham", "ma"], ["ma sku", "sku"],
  ["danh muc san pham", "danh_muc"], ["gia ban", "gia"],
  ["mo ta ngan", "mo_ta"], ["cong dung khac", "cong_dung_khac"],
  ["tinh nang noi bat", "tinh_nang"], ["cong nghe", "cong_nghe"],
  ["co che hoat dong", "co_che"], ["thanh phan", "thanh_phan"],
  ["the san pham", "the_sp"], ["dung tich", "dung_tich"],
  ["mui huong mau sac", "mui_mau"], ["usp", "usp"],
  ["huong dan su dung", "hdsd"], ["doi tuong su dung phu hop", "doi_tuong"],
  ["luu y khi su dung bao quan", "luu_y"], ["han su dung", "hsd"],
  ["bao hanh", "bao_hanh"], ["thoi gian duy tri", "thoi_gian"],
  ["loi ich ly tinh", "loi_ich_ly_tinh"], ["loi ich cam tinh", "loi_ich_cam_tinh"],
  ["thoi gian hieu qua", "thoi_gian_hieu_qua"], ["so lan su dung san pham", "so_lan_dung"],
  ["boi canh mua hang", "boi_canh"], ["khach hang muc tieu", "khach_muc_tieu"],
  ["noi dau khach hang pain points", "pain"], ["insight khach hang", "insight"],
  ["mong muon", "mong_muon"], ["giai dap thac mac thuong gap faq", "faq"],
  ["dong luc mua hang triggers", "trigger"],
  ["concept win va noi dung uu tien", "concept"], ["y tuong noi dung theo concept", "y_tuong"],
  ["giai phap ma san pham mang lai", "giai_phap"],
  ["loi ich khach hang nhan duoc", "loi_ich_khach"],
  ["cam nhan khach hang dat duoc", "cam_nhan"],
  ["keyword chinh", "keyword"], ["tu khoa lien quan", "tu_khoa"], ["hashtag", "hashtag"],
  ["idea goi y khai thac noi dung", "idea"],
  ["key truyen thong bat buoc co trong video", "key_video"],
  ["ppe bat buoc", "ppe"], ["so cuu chuyen biet", "so_cuu"],
  ["claim duoc phep dung", "claim_duoc"], ["claim khong duoc phep dung", "claim_cam"],
  // Nhóm ĐỐI THỦ CẠNH TRANH — tên cột ngắn nên phải khớp CHÍNH XÁC, đừng dùng
  // startsWith kẻo "ten sp" nuốt luôn "ten san pham" của chính mình.
  ["thuong hieu", "doi_thu_brand"], ["ten sp", "doi_thu_ten"], ["thong tin sp", "doi_thu_info"],
];

const EXACT_ONLY = new Set(["ten sp", "thuong hieu", "thong tin sp", "usp", "hashtag"]);

function keyOfHeader(h) {
  const n = norm(h);
  if (!n) return null;
  for (const [pat, key] of COL_MAP) {
    if (n === pat) return key;
    if (!EXACT_ONLY.has(pat) && n.startsWith(pat)) return key;
  }
  return null;
}

/** Bảng thô → { specs: {code: {...}}, so_san_pham, cot_bo_qua } */
export function rowsToSpecs(rows) {
  // Dòng tiêu đề = dòng đầu tiên có ô "Tên sản phẩm". File mẫu có dòng 1 là tên NHÓM
  // cột (gộp ô) và dòng 3 là câu hướng dẫn nhập — cả hai đều phải bỏ qua.
  let head = -1;
  for (let i = 0; i < Math.min(rows.length, 20); i++) {
    if ((rows[i] || []).some((c) => norm(c) === "ten san pham")) { head = i; break; }
  }
  if (head < 0) throw new Error("khong_thay_dong_tieu_de — file phải có cột 'Tên sản phẩm'");

  /* Hai cột có thể ra cùng một khoá — file mẫu có "Giá bán" ở cả nhóm sản phẩm lẫn
     nhóm đối thủ. Cột sau được thêm hậu tố _2 thay vì đè lên cột trước: đè là giá
     sản phẩm bị thay bằng giá đối thủ mà không có dấu hiệu gì. */
  const seen = new Set();
  const headers = rows[head].map((h) => {
    let k = keyOfHeader(h);
    if (!k) return null;
    if (seen.has(k)) { let i = 2; while (seen.has(`${k}_${i}`)) i++; k = `${k}_${i}`; }
    seen.add(k);
    return k;
  });
  const boQua = rows[head].filter((h, i) => String(h || "").trim() && !headers[i]);

  const specs = {};
  for (let i = head + 1; i < rows.length; i++) {
    const r = rows[i] || [];
    const get = (key) => {
      const idx = headers.indexOf(key);
      return idx < 0 ? "" : String(r[idx] || "").trim();
    };
    const ma = get("ma") || get("ten");
    const code = (String(ma).match(/(\d{3})/) || [])[1];
    if (!code) continue;                       // dòng hướng dẫn/trống → bỏ
    if (!get("ten") && !get("mo_ta")) continue;

    const o = {};
    for (const key of new Set(headers.filter(Boolean))) {
      const v = get(key);
      if (v) o[key] = v;
    }
    o.code = code;
    specs[code] = o;
  }
  return { specs, so_san_pham: Object.keys(specs).length, cot_bo_qua: boQua };
}
