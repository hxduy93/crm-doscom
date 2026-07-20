// Tải video TikTok đã chọn trên CRM về máy, KHÔNG watermark, xếp sẵn theo thư mục
// sản phẩm để đưa thẳng vào "Tạo Ads tự động".
//
// LUỒNG ĐẦY ĐỦ:
//   1. CRM → menu TikTok Shop → tick video muốn chạy → bấm "Tải danh sách (.json)"
//   2. Chạy script này với file vừa tải
//   3. Mở CRM → "Tạo Ads tự động" → chọn thư mục đích ở bước 2 → chạy như thường
//
// CHẠY:
//   node scripts/tiktok-to-ads.mjs <file.json> [thư-mục-đích]
//   vd: node scripts/tiktok-to-ads.mjs C:\Users\HXDUy\Downloads\tiktok-ads-2026-07-20.json D:\video-ads
//
// Thư mục đích mặc định: ./tiktok-ads-videos
// Mỗi sản phẩm 1 thư mục con — ads-creator lấy TÊN THƯ MỤC làm tên sản phẩm
// trong tên campaign, nên đặt tên thư mục cho gọn và dễ đọc.
//
// CẦN: yt-dlp (cài: pip install -U yt-dlp). yt-dlp lấy bản không watermark của
// TikTok. ffmpeg không bắt buộc nhưng nên có để ghép luồng tốt hơn.
//
// ⚠️ BẢN QUYỀN: video của creator affiliate thuộc về họ. File .json có cờ
// `own_channel` — script sẽ CẢNH BÁO và hỏi lại nếu trong danh sách có video
// không phải kênh nhà. Chạy quảng cáo trả tiền bằng video của creator mà chưa
// có thoả thuận thì có thể bị khiếu nại bản quyền hoặc Facebook gỡ quảng cáo.

import fs from "node:fs";
import path from "node:path";
import readline from "node:readline";
import { spawn, spawnSync } from "node:child_process";

const [fileArg, outArg] = process.argv.slice(2);

if (!fileArg) {
  console.error(`Thiếu file danh sách.

  node scripts/tiktok-to-ads.mjs <file.json> [thư-mục-đích]

File .json lấy ở CRM → menu TikTok Shop → tick video → "Tải danh sách (.json)".`);
  process.exit(1);
}
if (!fs.existsSync(fileArg)) {
  console.error(`Không thấy file: ${fileArg}`);
  process.exit(1);
}

// ── Kiểm tra yt-dlp ──
const ytdlpCmd = process.platform === "win32" ? "yt-dlp.exe" : "yt-dlp";
const probe = spawnSync(ytdlpCmd, ["--version"], { encoding: "utf8" });
if (probe.error) {
  console.error(`Chưa có yt-dlp — đây là công cụ tải video.

  Cài bằng:  pip install -U yt-dlp

Rồi chạy lại script này.`);
  process.exit(1);
}
console.log(`yt-dlp ${String(probe.stdout).trim()}\n`);

// ── Đọc danh sách ──
let data;
try {
  data = JSON.parse(fs.readFileSync(fileArg, "utf8"));
} catch (e) {
  console.error(`File .json hỏng: ${e.message}`);
  process.exit(1);
}
const videos = (data.videos || []).filter((v) => v && v.link);
if (!videos.length) {
  console.error("Danh sách không có video nào có link.");
  process.exit(1);
}

// Tên thư mục: bỏ dấu tiếng Việt + ký tự Windows cấm, cắt cho ngắn.
function slugFolder(s) {
  return String(s || "chua-phan-loai")
    .normalize("NFD").replace(/[̀-ͯ]/g, "")
    .replace(/đ/g, "d").replace(/Đ/g, "D")
    .replace(/[<>:"/\\|?*]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 60) || "chua-phan-loai";
}

// Tên file: thêm id video để 2 video cùng sản phẩm không đè nhau.
function videoId(link) {
  const m = String(link).match(/\/video\/(\d+)/);
  return m ? m[1] : String(Math.abs(hash(link)));
}
function hash(s) {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return h;
}

const outRoot = path.resolve(outArg || "./tiktok-ads-videos");
const external = videos.filter((v) => !v.own_channel);

console.log(`Danh sách: ${videos.length} video → ${outRoot}`);
const groups = new Map();
for (const v of videos) {
  const g = slugFolder(v.product);
  if (!groups.has(g)) groups.set(g, []);
  groups.get(g).push(v);
}
for (const [g, list] of groups) console.log(`  ${g}/  (${list.length} video)`);

if (external.length) {
  console.log(`\n⚠️  ${external.length}/${videos.length} video KHÔNG phải kênh nhà:`);
  for (const v of external.slice(0, 10)) {
    console.log(`   @${v.username || "?"} — ${String(v.title || "").slice(0, 55)}`);
  }
  if (external.length > 10) console.log(`   … và ${external.length - 10} video nữa`);
  console.log(`   Video của creator thuộc bản quyền của họ. Chạy quảng cáo trả tiền`);
  console.log(`   khi chưa có thoả thuận có thể bị khiếu nại / Facebook gỡ quảng cáo.`);

  const ok = await ask("\nVẫn tải tất cả? (gõ 'co' để tiếp, Enter để chỉ tải kênh nhà): ");
  if (ok.trim().toLowerCase() !== "co") {
    const before = videos.length;
    videos.length = 0;
    videos.push(...data.videos.filter((v) => v && v.link && v.own_channel));
    console.log(`→ Chỉ tải ${videos.length}/${before} video kênh nhà.\n`);
    if (!videos.length) { console.log("Không còn video nào để tải."); process.exit(0); }
    groups.clear();
    for (const v of videos) {
      const g = slugFolder(v.product);
      if (!groups.has(g)) groups.set(g, []);
      groups.get(g).push(v);
    }
  } else {
    console.log("");
  }
}

// ── Tải ──
let done = 0, failed = 0, skipped = 0;
for (const [folder, list] of groups) {
  const dir = path.join(outRoot, folder);
  fs.mkdirSync(dir, { recursive: true });
  for (const v of list) {
    const id = videoId(v.link);
    const target = path.join(dir, `${id}.mp4`);
    if (fs.existsSync(target)) {
      console.log(`  ⏭  đã có ${folder}/${id}.mp4`);
      skipped++;
      continue;
    }
    process.stdout.write(`  ⬇  ${folder}/${id}.mp4 … `);
    const code = await run(ytdlpCmd, [
      v.link,
      "-o", target,
      "-f", "mp4",
      "--no-playlist",
      "--no-warnings",
      "--quiet",
    ]);
    if (code === 0 && fs.existsSync(target)) {
      const mb = (fs.statSync(target).size / 1048576).toFixed(1);
      console.log(`xong (${mb} MB)`);
      done++;
    } else {
      console.log(`LỖI (mã ${code})`);
      failed++;
    }
  }
}

console.log(`\n──────────────────────────────`);
console.log(`Tải xong: ${done} · bỏ qua (đã có): ${skipped} · lỗi: ${failed}`);
console.log(`Thư mục: ${outRoot}`);
console.log(`\nBước tiếp: mở CRM → "Tạo Ads tự động" → chọn thư mục trên.`);
if (failed) {
  console.log(`\n${failed} video lỗi — thường do video bị xoá/để riêng tư, hoặc yt-dlp cũ.`);
  console.log(`Thử: pip install -U yt-dlp  rồi chạy lại (video đã tải sẽ được bỏ qua).`);
}

function run(cmd, args) {
  return new Promise((resolve) => {
    const p = spawn(cmd, args, { stdio: ["ignore", "ignore", "ignore"] });
    p.on("close", resolve);
    p.on("error", () => resolve(-1));
  });
}

function ask(q) {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((res) => rl.question(q, (a) => { rl.close(); res(a); }));
}
