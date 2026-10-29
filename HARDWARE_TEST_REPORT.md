# Kết quả kiểm tra board COM7

> Báo cáo lịch sử phiên bản 0.1. Xem [kết quả phiên bản 0.2](PERFORMANCE_REPORT_0.2.md) cho PSRAM, tốc độ USB, kiểm thử ảnh và trạng thái hiện tại.

## Đã xác nhận bằng phần cứng

- Chip ESP32-S3 revision v0.2, flash 4 MB, PSRAM 2 MB, USB Serial/JTAG.
- Firmware được nạp và kiểm tra hash tại đúng địa chỉ ứng dụng `0x20000`.
- USB trả JSON status có ID đối chiếu, filesystem hoạt động.
- Cấu hình đã được cấp qua USB và lưu dạng NVS blob; sau reset vẫn báo `configured=true`.
- Có phiên board báo đồng thời `wifiConnected=true` và `clockReady=true`.
- Sau lần rút/cắm USB gần nhất, firmware 0.1.2 tiếp tục báo Wi-Fi và đồng hồ sẵn sàng. Đã đối chiếu dữ liệu lưu trên board bằng `wifi_verify`: tên mạng và mật khẩu khớp file cấu hình và ảnh người dùng, không in mật khẩu.
- Windows .NET SerialPort giao tiếp được với board; mã laptop được bổ sung helper này sau khi native SerialPort addon gặp timeout.
- Bộ test hiện có của Detect Question và 8 test USB giả lập đã pass trong phiên làm việc.

## Các sửa lỗi đã thực hiện

1. Khớp địa chỉ nạp PlatformIO với phân vùng factory (`0x20000`).
2. Không đưa `boot_app0.bin` tại `0xe000` vào lệnh nạp, vì vùng đó thuộc NVS trong bảng phân vùng hiện tại.
3. Tăng RX buffer USB và cấu hình DTR/RTS trên Windows.
4. Dùng bridge .NET cho giao tiếp cổng COM trên Windows, giữ SerialPort addon để liệt kê thiết bị và cho nền tảng khác.
5. Lưu cấu hình CA/Wi-Fi bằng `putBytes`/`getBytes`, thay cho chuỗi NVS giới hạn 4000 byte. Tham khảo [Espressif NVS](https://docs.espressif.com/projects/esp-idf/en/v6.0/esp32s3/api-reference/storage/nvs_flash.html).
6. Bổ sung thử lại Wi-Fi định kỳ, mã trạng thái/nguyên nhân disconnect, thống kê heap và trạng thái đồng hồ.
7. Có script cập nhật CA bundle gồm các CA trung gian/gốc trong chuỗi đã được Windows xác thực; không thêm chứng chỉ leaf và không tắt TLS verification.

## Chưa vượt qua kiểm tra

- Đã ghi nhận các lần `AUTH_FAIL (202)`/`AUTH_EXPIRE (2)` sau soft reset; sau rút/cắm nguồn lại đã kết nối thành công. Chưa kết luận nguyên nhân đầy đủ của khác biệt giữa soft reset và cold boot, không coi đây là bằng chứng mật khẩu/router sai.
- Lời gọi API chưa thành công: đã gặp `HTTPS_FAILED`, timeout, hoặc mạng chưa sẵn sàng. Không được coi các test giả lập hoặc kết nối Wi-Fi là bằng chứng API đã hoạt động.
- Chưa xác nhận luồng license, ba model/debate/backward, ảnh lớn và toàn bộ UI trên phần cứng.
- Bản sao lưu toàn bộ firmware cũ trước lần nạp đầu chưa hoàn tất. Không coi thư mục backups là một bản khôi phục đã được xác minh.

## Bước tiếp theo

1. Kiểm tra đúng SSID, mật khẩu và chế độ bảo mật mạng 2,4 GHz trên router; nếu đang WPA3-only, thử WPA2-Personal/AES.
2. Đọc lại `status` cho đến khi Wi-Fi và đồng hồ sẵn sàng, rồi xác nhận vẫn tự kết nối sau reset.
3. Chạy một lần smoke API có chủ đích, xác nhận model thực tế/nội dung và TLS.
4. Sau khi smoke thành công mới kiểm tra license và các phím tắt của Detect Question.
