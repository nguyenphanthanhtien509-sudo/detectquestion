# Kiểm tra ảnh thực tế 30/10/2026

Kiểm tra backend EXE đang chạy, không thay firmware/backend. Ảnh thử tự tạo có số 7319, sau cắt bằng Chrome headless còn 8981 byte JPEG. Câu nhắc không chứa số đáp án. Ảnh cắt đã được xem trực tiếp để xác nhận đủ nội dung.

- Một model, lần đầu: không có đáp án. HTTPS_FAILED, HTTPClient -2 (gửi header thất bại), kết nối cũ để không 1950223 ms. Lỗi xảy ra trước khi gửi body ảnh.
- Nhiều model: cả ba model đọc đúng 7319, HTTP 200. Lượt tổng 42593 ms trả CONSENSUS_UNVERIFIED. Kiểm tra backward thất bại: -3 khi gửi body, tiếp theo -1 khi kết nối mới timeout khoảng 10 giây. Vì vậy không coi là AI_VERIFIED.
- Một model, thử riêng sau đó: kết nối mới timeout khoảng 10 giây, HTTPClient -1; không có đáp án. Không tiếp tục gọi API để tránh thêm phí khi mạng đang lỗi.

Kết luận: đường ảnh JPEG sau cắt đến API đã được chứng minh bằng ba model đọc đúng giá trị chỉ có trong ảnh. Chưa thể chứng nhận toàn bộ Alt+U/Y luôn hoạt động: lỗi kết nối vẫn xảy ra. Đây là kiểm tra đường xử lý phía sau thao tác chụp, không phải thao tác phím/chuột trên trang người dùng.

SVG: kiểm tra chuyển dữ liệu cục bộ trước đó cho thấy SVG không được chuyển thành ảnh đính kèm. PNG data URL sai base64 cũng có thể bị bỏ. Chưa sửa các hành vi này.

Chi tiết: test-artifacts/vision-live-audit.json và vision-single-fresh.json. Không đổi timeout, không tự replay POST. Script kiểm tra ảnh là tools/audit_vision_live.js, chỉ chạy chủ động vì có gọi API tính phí.

## Cập nhật sau khi đổi Wi-Fi và sửa ngày 30/10/2026

- Đã gửi lại gateway-config.json xuống NVS, không in SSID/mật khẩu. Sau nạp firmware, wifiConnected=true và clockReady=true.
- Firmware đóng kết nối cũ trước POST mới khi thời gian nhàn rỗi >=15 giây; không tự phát lại POST lỗi.
- Client chuyển SVG data URL sang PNG trong trình duyệt; ảnh không đọc được sẽ dừng thay vì bỏ ảnh.
- Toàn bộ npm.cmd test đạt. Kiểm thử Chrome thật xác nhận SVG chuyển thành PNG đúng màu và ảnh sai base64 bị từ chối.
- Ảnh thử chỉ chứa số 7319, prompt không chứa đáp án: lần đầu HTTP 200, đọc đúng, 5430 ms. Sau 16 giây nhàn rỗi: HTTP 200, đọc đúng, 4993 ms; reusedConnection=false và connectMs=2402, xác nhận mở kết nối mới.
- Đã đóng gói lại release/usb-preview/DetectQuestion.exe. Chưa khẳng định mọi lỗi mạng hoặc timeout đều được giải quyết.
