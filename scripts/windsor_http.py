"""Gọi Windsor.ai có retry — dùng chung cho 4 script fetch_google_ads_*.py.

VÌ SAO CÓ FILE NÀY (17/08/2026): job #4 — lượt bấm nút THẬT đầu tiên của người dùng —
chết ở bước 3 vì Windsor.ai trả `HTTP 500 Internal Server Error`. Chạy lại tay ngay sau đó
thì lấy được 871 dòng bình thường, tức chỉ là một cú nấc nhất thời. Nhưng 4 script gọi
Windsor đều `urlopen` đúng MỘT lần rồi `sys.exit(1)`, nên một cú nấc của bên thứ ba giết
cả pipeline 13 bước — kể cả những bước đã chạy xong trước đó và những bước không liên quan.

Hai thay đổi ở đây:
  1. Thử lại 4 lần với backoff cho lỗi 5xx / lỗi mạng (KHÔNG thử lại 4xx: sai key hay sai
     tham số thì thử lại bao nhiêu cũng vậy, cần hỏng to để người ta còn biết mà sửa).
  2. Hết lượt thử vẫn hỏng → trả None. Script gọi sẽ GIỮ NGUYÊN file dữ liệu cũ và thoát
     với mã 0 kèm dòng cảnh báo có chữ SKIP, để runner đếm thành cảnh báo và giao diện
     hiện "xong, có N cảnh báo" thay vì dừng cả dây chuyền.
     Đây đúng khuôn đã có sẵn trong các script: gặp `if not rows` thì cũng "[WARN] giữ
     nguyên file cũ, không overwrite" rồi exit 0.

KHÔNG đụng tới bất kỳ phép tính nào — chỉ là tầng mạng.
"""

import sys

# Console Windows mac dinh cp1252 -> print chuoi co "→", "↪", dau tieng Viet la
# UnicodeEncodeError, script chet giua chung. Ep stdout/stderr ve UTF-8 ngay tu dau.
# (22/08/2026: dung dung loi nay, ca duong ong du lieu dung o buoc 1/13.)
try:
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
    sys.stderr.reconfigure(encoding="utf-8", errors="replace")
except Exception:
    pass

import time
import urllib.request
import urllib.error


def windsor_get(url: str, timeout: int = 60, tries: int = 4, label: str = "Windsor.ai"):
    """Trả về nội dung phản hồi (str), hoặc None nếu hỏng hết mọi lượt thử."""
    backoff = 5
    for attempt in range(1, tries + 1):
        req = urllib.request.Request(url, headers={"Accept": "application/json"})
        try:
            with urllib.request.urlopen(req, timeout=timeout) as resp:
                return resp.read().decode("utf-8")

        except urllib.error.HTTPError as e:
            body = e.read().decode("utf-8", errors="ignore")[:300]
            # 4xx = lỗi của phía mình (key sai, tham số sai). Thử lại vô nghĩa → hỏng ngay.
            if e.code < 500:
                print(f"[FATAL] {label} HTTP {e.code}: {body}", file=sys.stderr)
                return None
            print(f"  [thử {attempt}/{tries}] {label} HTTP {e.code}: {body}", file=sys.stderr)

        except Exception as e:
            print(f"  [thử {attempt}/{tries}] {label} {type(e).__name__}: {e}", file=sys.stderr)

        if attempt < tries:
            print(f"  → chờ {backoff}s rồi thử lại…", file=sys.stderr)
            time.sleep(backoff)
            backoff *= 2  # 5 → 10 → 20 giây, tổng chờ tối đa 35 giây

    print(f"[WARN] {label} không phản hồi sau {tries} lượt thử.", file=sys.stderr)
    return None
