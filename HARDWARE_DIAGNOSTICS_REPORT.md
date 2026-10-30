# Kiểm tra phần cứng ngày 30/10/2026

Đã nạp firmware chẩn đoán vào COM7, xác minh hash flash đạt. Cấu hình NVS được giữ nguyên. Các lượt thử sử dụng backend từ mã nguồn hiện tại, giao thức HTTP nội bộ thật và API qua ESP/hotspot; không dùng đáp án giả lập.

| Thử nghiệm | Kết quả | Thời gian |
|---|---|---|
| Một model, kết nối mới | Có đáp án, HTTP 200 | 3990 ms |
| Một model, giữ kết nối | Có đáp án, HTTP 200 | 1418 ms |
| Ba model và kiểm tra đáp án | AI_VERIFIED, 4 lượt thành công | 11870 ms |
| Hủy sau khoảng 1 giây | CANCELLED, không trả đáp án | PC trả sau 13 ms từ lúc gửi hủy |
| Worker sau hủy | Thoát trạng thái bận | 198 ms từ khi ESP nhận hủy |
| Yêu cầu ngay sau hủy | Có đáp án, HTTP 200, busy=false | 4497 ms |

Lượt đầu: DNS 251 ms, TCP/TLS gộp 2256 ms, POST và chờ header 3951 ms (bao gồm DNS/kết nối). Lượt giữ kết nối: POST/header 1382 ms, body 11 ms. Trong lượt nhiều model, thời gian chờ hàng đợi của model thứ hai/thứ ba là 5520/6953 ms, được tách khỏi thời gian xử lý.

Nhận định: kết nối tái sử dụng hoạt động trong mẫu thử này và tiết kiệm chi phí DNS/TLS. Hủy yêu cầu không làm kẹt yêu cầu kế tiếp trong mẫu thử. Chưa tái hiện lỗi 30 giây, chưa có căn cứ thay timeout hoặc tắt giữ kết nối. Bài thử đơn giản không đại diện cho mọi câu dài/ảnh hoặc thời điểm API quá tải.

Việc sửa JSON thiếu trường đã qua kiểm thử tự động, nhưng các phản hồi thật trong lượt thử này không gây lỗi JSON để xác nhận nhánh sửa trên phần cứng. Không coi đây là bằng chứng lỗi này sẽ không tái diễn.

Số đo chi tiết: HARDWARE_DIAGNOSTICS_RESULTS.json. Toàn bộ npm.cmd test đã qua, gồm 18 kiểm thử USB. Chưa thay timeout HTTP 30 giây hoặc tự gửi lại POST lỗi.
