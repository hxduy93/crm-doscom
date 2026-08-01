// Gộp video từ Lark + TikTok Shop rồi khử trùng.
// Sai ở đây là hỏng nặng nhất: gộp nhầm 2 video khác nhau → nhân sự chạy ads sai
// creative; bỏ sót trùng → cùng 1 video hiện 2 dòng, 2 người cùng nhận.
import test from "node:test";
import assert from "node:assert/strict";
import { gopVideo, phangTuSaleReport, idTuLink, khoaPhu } from "../functions/lib/gop-video.js";

const lark = (o) => ({ title: "", link: null, username: "", shop: "Noma Auto", product: "", gmv: 0, orders: 0, views: 0, ...o });
const tts = (o) => ({ video_id: "", link: null, title: "", username: "", shop: "Noma Auto", product: "", gmv: 0, orders: 0, views: 0, ...o });

test("idTuLink: chỉ link đầy đủ mới bóc được mã, link rút gọn thì không", () => {
  assert.equal(idTuLink("https://www.tiktok.com/@abc/video/7662595889189375252"), "7662595889189375252");
  assert.equal(idTuLink("https://vt.tiktok.com/ZSUyrPEkU/"), null);
  assert.equal(idTuLink(""), null);
});

test("khoáPhụ bỏ hashtag/emoji để hai nguồn cùng video ra cùng khoá", () => {
  const a = khoaPhu("@toanmanshop", "Kính sạch trong veo ae ơi #tayokinh #noma911");
  const b = khoaPhu("toanmanshop", "Kính sạch trong veo ae ơi   #chamsocxe");
  assert.equal(a, b);
  assert.equal(khoaPhu("", "abc"), null);
});

test("trùng theo MÃ VIDEO → 1 dòng, mỗi chỉ số lấy số ĐO CAO NHẤT", () => {
  const { videos, thong_ke } = gopVideo(
    [lark({ link: "https://www.tiktok.com/@a/video/111", title: "t", username: "a", gmv: 180_300_000, orders: 905, views: 602_404 })],
    [tts({ video_id: "111", link: "https://www.tiktok.com/@a/video/111", title: "t", username: "a", gmv: 46_397_204, orders: 235, views: 16_003, sku: "1732804218954024507" })],
  );
  assert.equal(videos.length, 1);
  assert.equal(thong_ke.trung_ma, 1);
  assert.equal(videos[0].gmv, 180_300_000);   // Lark đo được cao hơn
  assert.equal(videos[0].orders, 905);
  assert.equal(videos[0].views, 602_404);
  assert.equal(videos[0].sku, "1732804218954024507"); // mã SKU chỉ nguồn kia có
  assert.equal(videos[0].nguon, "ca-hai");
});

test("lấy cao nhất theo TỪNG chỉ số, không lấy trọn dòng của bên thắng GMV", () => {
  const { videos } = gopVideo(
    [lark({ link: "https://www.tiktok.com/@a/video/222", title: "t", username: "a", gmv: 100, orders: 1, views: 9999 })],
    [tts({ video_id: "222", title: "t", username: "a", gmv: 50, orders: 77, views: 3 })],
  );
  assert.equal(videos[0].gmv, 100);
  assert.equal(videos[0].orders, 77);     // bên thua GMV nhưng đo được nhiều đơn hơn
  assert.equal(videos[0].views, 9999);
});

test("Lark link rút gọn (không có mã) vẫn khớp được nhờ kênh + tiêu đề, và ĐƯỢC NÂNG CẤP lên link có mã", () => {
  const { videos, thong_ke } = gopVideo(
    [lark({ link: "https://vt.tiktok.com/ZSUyrPEkU/", title: "Tẩy ố kính xe #tayokinh", username: "hoang.real.review", gmv: 900 })],
    [tts({ video_id: "333", link: "https://www.tiktok.com/@hoang.real.review/video/333", title: "Tẩy ố kính xe", username: "hoang.real.review", gmv: 100 })],
  );
  assert.equal(videos.length, 1, "phải gộp thành 1 dòng");
  assert.equal(thong_ke.trung_ten, 1);
  assert.equal(videos[0].gmv, 900);
  // Quan trọng: link phải là bản CÓ MÃ, vì sổ nhận video khoá theo mã — giữ link
  // rút gọn thì video này vĩnh viễn không tick chạy ads được.
  assert.equal(idTuLink(videos[0].link), "333");
  assert.equal(videos[0].video_id, "333");
});

test("hai video KHÁC MÃ của cùng kênh, tiêu đề giống nhau → KHÔNG được gộp", () => {
  const { videos } = gopVideo(
    [lark({ link: "https://www.tiktok.com/@a/video/444", title: "review noma 911", username: "a", gmv: 10 })],
    [tts({ video_id: "555", link: "https://www.tiktok.com/@a/video/555", title: "review noma 911", username: "a", gmv: 20 })],
  );
  assert.equal(videos.length, 2);
});

test("video chỉ có ở MỘT nguồn thì vẫn giữ đủ, không rơi mất", () => {
  const { videos, thong_ke } = gopVideo(
    [lark({ link: "https://www.tiktok.com/@a/video/1", title: "x", username: "a", gmv: 5, shop: "Doscom Mart" })],
    [tts({ video_id: "2", link: "https://www.tiktok.com/@b/video/2", title: "y", username: "b", gmv: 7 })],
  );
  assert.equal(videos.length, 2);
  assert.equal(thong_ke.lark, 1);
  assert.equal(thong_ke.tts, 1);
  // Shop của Lark không bị nguồn kia (luôn "Noma Auto") ghi đè.
  assert.equal(videos.find((v) => v.video_id === "1").shop, "Doscom Mart");
});

test("dòng không mã, không kênh/tiêu đề → vẫn giữ, thà thừa còn hơn mất video", () => {
  const { videos } = gopVideo([lark({ link: "https://vt.tiktok.com/AAA/" }), lark({ link: "https://vt.tiktok.com/BBB/" })], []);
  assert.equal(videos.length, 2);
});

test("kết quả xếp GMV giảm dần để cắt `top` không chặt nhầm video mạnh", () => {
  const { videos } = gopVideo(
    [lark({ link: "https://www.tiktok.com/@a/video/1", gmv: 1 }), lark({ link: "https://www.tiktok.com/@a/video/2", gmv: 300 })],
    [tts({ video_id: "3", gmv: 50 })],
  );
  assert.deepEqual(videos.map((v) => v.gmv), [300, 50, 1]);
});

test("nguồn phụ rỗng/hỏng → trả nguyên dữ liệu Lark, không ném lỗi", () => {
  for (const x of [[], null, undefined]) {
    const { videos } = gopVideo([lark({ link: "https://www.tiktok.com/@a/video/9", gmv: 3 })], x);
    assert.equal(videos.length, 1);
    assert.equal(videos[0].gmv, 3);
  }
});

test("phangTuSaleReport: bẻ by_koc → danh sách video phẳng, bỏ dòng thiếu mã", () => {
  const ra = phangTuSaleReport({ by_koc: {
    toanmanshop: { staff: "le-thi-thuy-anh", videos: [
      { video_id: "7662595889189375252", link: "https://www.tiktok.com/@toanmanshop/video/7662595889189375252",
        caption: "Kính sạch", product: "Noma 911", sku: "173280", views: 71247, orders: 283, revenue: 56771801, ngay_dang: "2026-07-15" },
      { video_id: "", link: null, caption: "hỏng" },
    ] },
  } });
  assert.equal(ra.length, 1);
  assert.equal(ra[0].username, "toanmanshop");
  assert.equal(ra[0].title, "Kính sạch");
  assert.equal(ra[0].gmv, 56771801);
  assert.equal(ra[0].shop, "Noma Auto");
});

test("phangTuSaleReport: dữ liệu rỗng/hỏng → mảng rỗng, không ném", () => {
  for (const x of [null, undefined, {}, { by_koc: null }]) assert.deepEqual(phangTuSaleReport(x), []);
});
