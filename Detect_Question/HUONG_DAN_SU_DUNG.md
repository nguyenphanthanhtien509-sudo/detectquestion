# Hướng dẫn sử dụng Detect Question USB 0.3.0

Áp dụng cho ứng dụng và firmware **0.3.0**, cập nhật ngày 30/10/2026.

## 1. Mở ứng dụng

1. Bật hotspot Wi-Fi 2,4 GHz đã cấu hình cho ESP32.
2. Cắm ESP32-S3 vào laptop bằng cáp USB có truyền dữ liệu; đóng Serial Monitor để giải phóng COM.
3. Mở `Detect_Question/release/usb-preview/DetectQuestion.exe` tính từ thư mục dự án `auto`.
4. Ứng dụng tự mở **một Chrome profile**, không hỏi số lượng và không yêu cầu nhập MSV.
5. Dùng cửa sổ trình duyệt do ứng dụng mở để vào trang câu hỏi.

`usb-preview` là bản mặc định; `portable` cũ không phải bản đang cập nhật. Khi thay EXE, đóng phiên cũ rồi mở lại. Máy dùng EXE không cần cài Node.js hoặc chạy `npm install`, nhưng cần Google Chrome hoặc Microsoft Edge.

Backend chạy nền tại `127.0.0.1:8787`. Khi chạy lại, launcher thay backend cũ đang dùng cổng này. Giữ ESP được cắm và hotspot hoạt động trong lúc giải.

## 2. Phím tắt

| Phím | Chức năng | Hành vi |
| --- | --- | --- |
| `Alt + M` | Quét câu hiện tại, giải bằng một model. | Hiển thị/copy và lưu cache; không tự điền. |
| `Alt + U` | Kéo chọn vùng ảnh, giải bằng một model. | Hiển thị/copy; không tự điền. |
| `Alt + B` | Xem đáp án đã lưu của câu hiện tại. | Hiển thị 5 giây và copy; không gọi AI hoặc thay đổi ô trả lời. |
| `Esc` | Đóng vùng chọn ảnh hoặc dừng luồng giải trên giao diện. | Với API đang chạy, chủ yếu vô hiệu hóa kết quả; chưa bảo đảm hủy yêu cầu bên dưới. |


Click vào nội dung trang trước khi dùng phím tắt. Với `Alt + U`, tránh đặt con trỏ trong textarea/vùng soạn thảo; kéo khung bao đủ đề, hình, bảng và lựa chọn rồi thả. `Esc` khi chọn vùng sẽ đóng khung chọn.

Alt+N, Alt+K và Alt+Y đã được gỡ bỏ.

## 3. Kết quả

- `SINGLE_MODEL_UNVERIFIED`: kết quả từ một model, chưa kiểm chứng. `Alt + M/U` chỉ hiển thị/copy, không tự điền đáp án.
- `AI_VERIFIED`: backend chấp nhận sau luồng đối chiếu/kiểm tra AI; không bảo đảm đáp án đúng tuyệt đối.
- `CONSENSUS_UNVERIFIED`: có đồng thuận nhưng chưa hoàn tất kiểm chứng; chỉ dùng tham khảo, không tự nâng thành đã kiểm chứng.
- Luồng nhiều model vẫn tồn tại trong backend nhưng không còn được gọi bằng Alt+N/Y. Các phím giải hiện tại là Alt+M/U, chỉ hiển thị/copy.
- Không tự nộp bài và không tự chuyển trang sau khi giải.

Badge đáp án xuất hiện ở góc dưới trang. Nếu clipboard bị trang hoặc trình duyệt từ chối, đọc badge và sao chép thủ công.

Quy ước rút gọn: một lựa chọn hiện chữ cái; nhiều lựa chọn A/C/D có thể hiện `134`; nhiều dropdown hiện chỉ số option theo thứ tự trường; ô trả lời ngắn giữ chuỗi như `0xE9`. Nếu không xác nhận được danh sách lựa chọn, giữ nội dung trả về thay vì đoán chỉ số.

## 4. Ảnh, sơ đồ và bảng

Detector hỗ trợ các cấu trúc phổ biến: một/nhiều lựa chọn, ô trả lời ngắn, nhiều ô nhập, dropdown, bảng HTML và một số giao diện Moodle/React.

- Chọn đúng một câu, đủ rõ chữ và đủ phần đáp án. Ảnh chụp được cắt/nén trước khi gửi.
- Dữ liệu ảnh đi qua USB → ESP → API; API không phải truy cập URL ảnh trên laptop.
- SVG dạng data URL được chuyển thành PNG trong trình duyệt.
- Nếu ảnh đã chọn không đọc được hoặc không được hỗ trợ, client dừng thay vì âm thầm gửi câu thiếu hình.
- Không bảo đảm bộ quét lấy đủ mọi hình trên trang phức tạp. Dùng `Alt + U` để chụp trọn câu có nhiều ảnh hoặc cấu trúc lạ.

Nhiều model thường mất thời gian hơn một model vì ESP xử lý các yêu cầu HTTPS lần lượt. Nội dung ảnh, tốc độ mạng và API đều ảnh hưởng thời gian trả kết quả.

## 5. Wi-Fi và COM

ESP kết nối hotspot và dùng mạng điện thoại gọi API. Hostname Wi-Fi hiện tại là **USB**; điện thoại có thể lưu tên cũ hoặc hiển thị theo cách riêng. Hostname này không đổi tên USB Serial/JTAG trong Device Manager.

Ứng dụng tự tìm COM khi chỉ có một thiết bị Espressif phù hợp. COM7 đổi thành COM12 trên laptop khác vẫn có thể tự nhận. Nếu có nhiều thiết bị phù hợp hoặc đã đặt `ESP32_SERIAL_PORT`, cần chỉ định đúng cổng. Muốn tự nhận, không ép `ESP32_SERIAL_PORT=COM7` trong cấu hình riêng.

SSID, mật khẩu và cấu hình API nằm trong NVS của từng ESP. Sửa `gateway-config.json` hoặc nạp firmware thông thường không tự gửi nội dung file này xuống board.

Sau khi sửa và lưu cấu hình, chạy từ thư mục `auto/Detect_Question`:

```powershell
node tools/esp32_gateway.js configure COM7 ../gateway-config.json
node tools/esp32_gateway.js status COM7
```

Thay `COM7` bằng cổng thực tế. Công cụ mã nguồn cần Node.js và phụ thuộc dự án. Nếu có backend EXE trong bộ build, có thể dùng:

```powershell
.\release\usb-preview\DetectQuestionBackend.exe --gateway configure COM7 ..\gateway-config.json
.\release\usb-preview\DetectQuestionBackend.exe --gateway status COM7
```

Kết quả cần kiểm tra: `wifiConnected: true`, `clockReady: true`, `firmware: "0.3.0"`. Không xóa flash/NVS nếu muốn giữ cấu hình. Không đưa file cấu hình thật chứa mật khẩu/khóa API lên GitHub.

## 6. Xem log và phiên bản

Mở PowerShell tại thư mục chứa EXE:

```powershell
.\DetectQuestion.exe --logs
```

File log: `%LOCALAPPDATA%\DetectQuestionBackend\standalone.log`.

| Trường hoặc sự kiện | Ý nghĩa |
| --- | --- |
| `appVersion: "0.3.0"` | Phiên bản ứng dụng ghi log. |
| `gateway.version`, `firmwareVersion` | Phiên bản ESP thực sự trả về khi bắt tay; ghi lần đầu hoặc khi phiên bản thay đổi. |
| `page.hotkey`, `page.scanner.result` | Nhận phím và kết quả quét. |
| `solve.started`, `pipeline`, `request.completed`, `solve.completed` | Tiến trình và kết quả yêu cầu. |
| `queueWaitMs`, `serviceMs` | Thời gian xếp hàng và xử lý phía PC. |
| `providerDiagnostics.gateway` | Mã HTTP/TLS, thời gian DNS/kết nối/POST/body, kết nối tái sử dụng và bộ nhớ do firmware cung cấp. |

Các khoảng đo có thể bao hàm nhau; không cộng tất cả để tính tổng. Xem [NETWORK_DIAGNOSTICS.md](../NETWORK_DIAGNOSTICS.md) và [IMAGE_AUDIT_REPORT.md](IMAGE_AUDIT_REPORT.md).

## 7. Xử lý lỗi

| Hiện tượng | Cách kiểm tra |
| --- | --- |
| Alt+N không phản hồi | Phím đã được gỡ; dùng Alt+M hoặc Alt+U. |
| Phím khác không phản hồi | Click nội dung trang; kiểm tra ô đang nhập/vùng chọn, xem `page.hotkey`. |
| Không tìm được câu | Cuộn để câu được render; dùng chọn vùng ảnh nếu cấu trúc trang chưa hỗ trợ. |
| Không mở được COM | Đóng Serial Monitor/ứng dụng chiếm COM; kiểm tra cáp và nhận diện thiết bị Windows. |
| `WIFI_OFFLINE` | Kiểm tra hotspot và cấu hình đã gửi xuống đúng ESP. |
| `HTTPS_FAILED`, `MODEL_TIMEOUT` | Đọc mã HTTPClient/TLS và thời gian trong log; không kết luận là lỗi ảnh, tránh gửi liên tục khi mạng đang lỗi. |
| `INVALID_RESPONSE` | Phản hồi sai định dạng; luồng một model có tối đa một lượt sửa JSON nếu còn thời gian. |
| Không đọc được ảnh | Chọn lại vùng rõ và đầy đủ, chờ ảnh tải xong. Client không gửi tiếp nếu từ chối ảnh. |
| Mở nhầm bản cũ | Dùng EXE trong `release/usb-preview`, mở lại và kiểm tra phiên bản trong log mới. |

## 8. Cache và giới hạn

Bản EXE lưu cache tại `%LOCALAPPDATA%\DetectQuestionBackend\answer-cache.json`; extension lưu trong `chrome.storage.local`. `Alt + B` chỉ có kết quả khi đã lưu đúng câu theo website và dấu vân tay nội dung.

Kiểm tra lại đáp án, đặc biệt với ảnh mờ, bảng dài hoặc dữ kiện thiếu. Kiểm thử đã qua không chứng minh mọi trang/câu hỏi và mọi thời điểm mạng đều hoạt động đúng. Dùng log mới và `status` của ESP để xác định phiên bản hiện tại, không dựa vào báo cáo lịch sử.
