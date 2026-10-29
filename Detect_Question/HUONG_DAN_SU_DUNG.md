# Hướng dẫn sử dụng Detect Question

## 1. Mở ứng dụng

1. Double-click `release\\DetectQuestion.exe`.
2. Chọn số Chrome profile muốn mở (1–5). Mỗi cửa sổ có phiên đăng nhập riêng, phù hợp khi cần dùng nhiều tài khoản LMS.
3. Chờ Chrome tự mở ở trang **New Tab**. Backend chạy nền tại `127.0.0.1:8787`.
4. Dùng chính cửa sổ Chrome do ứng dụng mở để đăng nhập và mở trang bài thi/câu hỏi.

Máy dùng bản portable không cần cài Node.js hoặc chạy `npm install`. Ứng dụng cần có Google Chrome hoặc Microsoft Edge trên máy.

Khi chạy lại, ứng dụng sẽ thay tiến trình backend cũ đang chiếm cổng `8787`, rồi khởi động tiến trình mới.

> Không đóng Chrome do Detect Question mở nếu vẫn đang giải câu hỏi. Đóng Chrome sẽ dừng phần detector của phiên đó.

## 2. Phím tắt

| Phím tắt | Chức năng | Hành vi DOM / Auto-Apply |
| --- | --- | --- |
| `Alt + N` | Quét câu hỏi hiện tại và giải đầy đủ (multi-model debate + backward check). | **Tự động chọn đáp án** (Auto-Apply) khi đạt đồng thuận 3/3 (`eligibleForAutoApply: true`), hiển thị badge compact và lưu cache. |
| `Alt + M` | Quét câu hỏi hiện tại và giải nhanh bằng một model (Emergency). | **Display/copy-only**: Hiển thị badge, copy clipboard, lưu cache; không tự chọn DOM. |
| `Alt + Y` | Kéo chuột chọn một vùng màn hình, chụp và giải đầy đủ. | Hiển thị badge kết quả, copy clipboard; tự chọn nếu card câu hỏi được nhận diện chính xác. |
| `Alt + U` | Kéo chuột chọn một vùng màn hình, chụp và giải nhanh bằng một model. | Hiển thị badge kết quả, copy clipboard; không tự chọn DOM. |
| `Alt + K` | Giải nhanh liên tục toàn bộ câu chưa trả lời trên trang hiện tại. | Tự chọn đáp án với trạng thái unverified khi map đầy đủ vào form control. |
| `Alt + B` | **Xem lại đáp án đã lưu trong Cache** theo dấu vân tay câu hỏi. | **Không gọi AI, không thao tác DOM**: Hiển thị badge 5 giây và copy đáp án rút gọn. |
| `Esc` | Dừng tác vụ giải liên tục/đang chờ. | Hủy yêu cầu in-flight, ngăn không áp đáp án vào câu hỏi. |

Khi dùng `Alt + Y` hoặc `Alt + U`, kéo khung bao trọn phần đề, bảng, hình và đáp án cần đọc, sau đó thả chuột.

## 3. Kết quả hiển thị và Tự động chọn đáp án (Auto-Apply)

- **Tự động chọn đáp án**: Khi AI giải bằng `Alt + N` đạt đồng thuận (`AI_VERIFIED`), hệ thống tự động:
  - Trắc nghiệm 1 lựa chọn: click radio hoặc custom option card (`div.cursor-pointer`).
  - Trắc nghiệm nhiều lựa chọn: bỏ chọn các checkbox cũ không thuộc kết quả, click chọn chính xác các checkbox A, C, D...
  - Short answer: điền text/số chuẩn xác vào ô input hoặc textarea (không ghi vào ô readonly/combobox).
  - Dropdown / Matching: chọn đúng option tương ứng trên native `<select>` hoặc Ant Design / React Select.
- **Badge nhỏ gọn (Stealth Badge)**: Đáp án hiển thị ở góc dưới trang, tự ẩn sau thời gian quy định (hoặc 5 giây với `Alt + B`).
- **Clipboard**: Đáp án compact luôn được tự động copy vào clipboard để người dùng có thể dán thủ công bằng `Ctrl + V` khi cần.
- **Không tự động submit**: Hệ thống tuyệt đối không bấm nút "Nộp bài", "Finish attempt" hoặc tự ý chuyển trang gây mất bài thi.

### Quy ước đáp án rút gọn (Compact Answer)

- Trắc nghiệm một lựa chọn: Hiện chữ cái đáp án chuẩn (ví dụ `C`).
- Trắc nghiệm nhiều lựa chọn: A, C, D được rút gọn thành số thứ tự lựa chọn nối liền: `134`.
- Câu ghép nối / nhiều dropdown: Giá trị được chuyển đổi theo số thứ tự option từ trên xuống dưới theo thứ tự các trường trên giao diện. Ví dụ CX = `FE67` (option dòng 5), BX = `67FE` (option dòng 4) sẽ hiện là `54`.
- Short answer: Giữ nguyên định dạng chuỗi do AI trả về (ví dụ `0xE9`).
- Nếu detector không xác nhận được danh sách option thực tế, hệ thống giữ nguyên text trả về thay vì đoán bừa số thứ tự.

## 4. Dạng nội dung detector có thể gửi lên model

Detector ưu tiên vùng câu hỏi đang nhìn thấy và hỗ trợ:

- Chọn một đáp án: radio, label, hoặc giao diện đáp án dạng `div` tùy biến.
- Chọn nhiều đáp án: checkbox.
- Dropdown/select, kể cả câu có nhiều select.
- Ant Design/React Select (kể cả dropdown đóng và option đang virtualized) khi trang còn cung cấp danh sách lựa chọn qua React.
- Ô điền ngắn: text, number, textarea và câu có nhiều ô nhập.
- Hình trong câu hỏi hoặc đáp án: ảnh được gửi dưới dạng dữ liệu ảnh, không dùng URL `localhost`.
- Bảng HTML trong phần đề/đáp án: giữ nội dung theo hàng/cột để model suy luận số liệu.
- Moodle và các trang quiz React/Vue có cấu trúc card phổ biến.

Với giao diện lạ hoặc câu có sơ đồ/bảng phức tạp, dùng `Alt + Y`/`Alt + U` và khoanh đúng vùng câu hỏi thường cho kết quả tốt hơn quét DOM.

## 5. Xem log trực tiếp

Mở PowerShell tại thư mục `release` và chạy:

```powershell
.\DetectQuestion.exe --logs
```

Log được cập nhật liên tục, gồm các mốc như:

- `page.hotkey`: đã nhận phím tắt.
- `page.scanner.result`: số câu detector tìm được.
- `solve.started`: đã gửi yêu cầu giải.
- `pipeline`: từng bước model/debate/verification.
- `solve.completed`: backend trả kết quả.
- `page.extension.answer`: đáp án đã trả về extension.
- `page.error`, `hotkey.failed` hoặc `solve.failed`: lỗi cần kiểm tra.

File log nằm tại:

```text
%LOCALAPPDATA%\DetectQuestionBackend\standalone.log
```

## 6. Xử lý nhanh khi gặp lỗi

| Hiện tượng | Cách xử lý |
| --- | --- |
| Bấm phím tắt không có phản hồi | Click vào nội dung trang thi rồi bấm lại; sau đó xem `page.hotkey` trong log. |
| Có `page.hotkey` nhưng `page.scanner.result` là `count:0` | Trang hiện tại chưa có card câu hỏi trong DOM hoặc tab đang dùng script cũ. Nhấn `Ctrl+R`, cuộn để câu hỏi được render, rồi thử lại; với UI lạ dùng `Alt + U`/`Alt + Y` khoanh đúng vùng. |
| `No supported question detected` | Cuộn để card câu hỏi nằm trong vùng nhìn thấy; nếu trang có UI lạ, dùng `Alt + U` hoặc `Alt + Y` để chọn vùng câu hỏi. |
| `Invalid arguments: should be exactly one string` | Đóng phiên Detect Question cũ, chạy lại `DetectQuestion.exe` bản mới và nhấn `Ctrl+R` ở tab đề. Lỗi bridge này đã được sửa trong bản portable mới. |
| Có log `MODEL_TIMEOUT` | Thử lại một lần. Bản hiện tại đã tăng timeout tổng và timeout backward để hạn chế kết quả về muộn. |
| Không có đáp án | Kiểm tra log từ `solve.started` đến `solve.completed`; lỗi provider/network sẽ hiện ở đó. |
| Trang LMS không vào được | Kiểm tra mạng/DNS của máy; Chrome do ứng dụng mở đã dùng DNS-over-HTTPS riêng để tăng khả năng phân giải tên miền. |
| `chrome://extensions` trắng/đơ | Đóng Chrome do app mở, chạy lại `DetectQuestion.exe`. Bản hiện tại không inject detector vào trang nội bộ Chrome. |
| Chrome hỏi `Restore pages?` | Bấm dấu `×` để đóng; cảnh báo này thường xuất hiện sau lúc app được cập nhật/restart cưỡng bức. |

## 7. Lưu ý sử dụng

- Detector chỉ chạy trên trang web bình thường (`http`, `https`, `file`, `data`), không chạy trên các trang nội bộ `chrome://...`.
- Kiểm tra lại đáp án trước khi nộp bài, đặc biệt với câu có hình, bảng dài hoặc dữ kiện thiếu.
- Không cần sửa `.env` để sử dụng bản portable đã cấu hình sẵn. Không chia sẻ file `.env` hay log có thông tin nhạy cảm.

## 8. Auto-apply và cache

- `Alt + N`, `Alt + Y` và `Alt + K` chỉ tự áp dụng khi backend trả kết quả có `eligibleForAutoApply = true`. Kết quả một model (`Alt + M`, `Alt + U`) hoặc `CONSENSUS_UNVERIFIED` chỉ hiển thị/copy, không thay đổi đáp án trên trang.
- Ứng dụng kiểm tra lại fingerprint, question block và DOM trước khi bấm/nhập. Nếu người dùng đã chuyển câu hoặc giao diện đổi, thao tác sẽ fail-closed.
- `Alt + B` chỉ đọc cache theo website + fingerprint, hiển thị badge trong 5 giây và copy đáp án ngắn. Phím này không gọi Gemini API và không tự chọn đáp án.
- `Alt + K` là lệnh auto-apply do người dùng chủ động bật: nó vẫn giữ trạng thái `SINGLE_MODEL_UNVERIFIED`, không gắn sai thành `AI_VERIFIED`; đáp án không map đủ hoặc DOM đã thay đổi sẽ bị bỏ qua.
- Bản portable lưu cache tại `%LOCALAPPDATA%\DetectQuestionBackend\answer-cache.json`; extension lưu bằng `chrome.storage.local`.
- Không có bước nào tự submit hoặc chuyển trang sau khi áp dụng đáp án.


## B?n USB: s?a qu?t ?? v? ph?m ch?p (29/10/2026)

M? `release/usb-preview/DetectQuestion.exe` trong th? m?c d? ?n ? Downloads.

- `Alt + M`: gi?i nhanh m?t c?u, hi?n/copy k?t qu?; kh?ng t? ch?n.
- `Alt + N`: gi?i v? ki?m tra nhi?u model; ch? ch?n khi k?t qu? ?? ?i?u ki?n. C? th? m?t l?u h?n m?t model.
- `Alt + K`: gi?i nhanh li?n t?c v? ch?n ??p ?n. `Esc` d?ng.
- `Alt + U`: ch?p v?ng ?? gi?i nhanh. Nh?n ph?m, r?i gi? chu?t tr?i k?o bao tr?n ?? v? c?c l?a ch?n, th? chu?t ?? g?i.
- `Alt + Y`: ch?n v?ng t??ng t?, d?ng lu?ng ki?m tra nhi?u model.
- `Esc`: h?y v?ng ch?p ?ang m?.
- `Alt + B`: xem k?t qu? ?? l?u cho ??ng c?u; ch?a gi?i c?u ?? th? ch?a c? cache.

?? s?a l?i ch? l?y nh?n ?C?u 1:? m? thi?u ??, l?i l?p to?n t? MathJax, khung v?ng ch?n kh?ng hi?n th? v? Esc kh?ng ??ng v?ng ch?n. ?? ki?m tra qu?t ?? 30 c?u tr?n trang luy?n t?p th?c t?; tr?n c?u m?u 2 + 2, Alt+M tr? B, Alt+N ??t AI_VERIFIED v? Alt+K ch?n B. Alt+U/Y ?? ki?m tra m?/h?y v?ng ch?n v? c?u n?i ch?p m?n h?nh. C?c k?t qu? n?y kh?ng b?o ??m m?i ??p ?n AI lu?n ??ng.


## Khởi động bản USB không cần MSV

Bản Detect USB hiện không yêu cầu nhập MSV, không gọi máy chủ cấp phép khi khởi động. Mở `release/usb-preview/DetectQuestion.exe`, chọn số Chrome profile rồi dùng các phím tắt bình thường. ESP32 vẫn cần được cắm, có cấu hình Wi-Fi và API hợp lệ. Không cần nạp lại firmware cho thay đổi này.
