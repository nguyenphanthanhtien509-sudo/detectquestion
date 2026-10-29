# ESP32-S3 USB AI Gateway — bản thử nghiệm 0.2

Firmware nằm ở `src/main.cpp`. Phần mềm laptop tích hợp ở `C:\Users\Tien\Downloads\Detect_Question`.

Firmware 0.2.4 đã nạp và xác nhận tự kết nối Wi-Fi sau rút/cắm nguồn: ba lần đọc liên tiếp đều WL_CONNECTED và công suất thực tế 8,5 dBm. Auto-reconnect nguyên bản Arduino-ESP32 được bật; NVS Preferences giữ nguyên cấu trúc. Xem [kết quả phiên bản 0.2](PERFORMANCE_REPORT_0.2.md).

Firmware hi?n t?i **0.2.9** s?a l?i m?t khung ph?n h?i USB b?ng c?ch ghim worker HTTPS v?o core Arduino ?ang x? l? ng?t HWCDC. ?? n?p v? ki?m tra ba request AI li?n ti?p: 9.426 / 2.246 / 1.438 ms, ??u nh?n ??ng k?t qu?. Xem [b?o c?o s?a ph?n h?i](RESPONSE_FIX_REPORT.md).

## Chức năng đã viết

- Giao tiếp USB Serial native của ESP32-S3, giao thức JSON từng dòng có phiên bản và ID.
- Cấu hình Wi-Fi, HTTPS endpoint, API key và CA certificate qua USB; lưu trong NVS.
- Tự kết nối lại Wi-Fi, đồng bộ giờ để kiểm tra chứng chỉ TLS.
- LED nhấp nháy khi chưa có Wi-Fi, sáng liên tục khi kết nối và nhấp nháy lại khi mất mạng.
- Chuyển tiếp lời gọi Chat Completions, giữ nguyên model thực tế và usage.
- Chuyển tiếp xác thực license Supabase qua kết nối Wi-Fi của board.
- Chia yêu cầu thành khối 2048 byte có thứ tự và ACK; giữ request trong PSRAM, không ghi file tạm vào flash.
- Trả HTTP response theo khối, kiểm tra số byte và số khối trên laptop.
- Báo lỗi khi thiếu cấu hình, mất mạng, lỗi HTTPS, lỗi HTTP, sai kích thước và timeout.
- Laptop xếp hàng các lời gọi để không trộn dữ liệu khi ba model hoặc nhiều profile cùng yêu cầu.
- Windows sử dụng helper .NET SerialPort được đóng gói cùng backend để tránh timeout của native SerialPort addon trên máy đã kiểm tra.
- Cấu hình chứa CA dài được lưu dạng NVS blob; các lần nạp sau bỏ image OTA không dùng để bảo toàn vùng NVS.

Board chỉ chuyển tiếp mạng. Bộ quét DOM, capture, debate, backward, cache và điền đáp án tiếp tục chạy ở Detect Question.

## 1. Xác nhận phần cứng rồi nạp firmware

Cấu hình hiện tại dùng target ESP32-S3 generic, Arduino Core 2.0.17, flash layout 4 MB và yêu cầu PSRAM. Board tại COM7 đã được esptool xác nhận ESP32-S3 rev v0.2, flash 4 MB và PSRAM 2 MB. Không dùng bản này cho ESP32-C3 hoặc ESP32 thường.

Ứng dụng nằm tại `0x20000` theo `partitions.csv`; `board_upload.offset_address` phải giữ đúng giá trị này. Script `scripts/validate_flash_layout.py` kiểm tra địa chỉ và loại `boot_app0.bin` khỏi lệnh nạp vì dự án dùng phân vùng factory, không dùng OTA.

### LED Wi-Fi

- Chưa cấu hình Wi-Fi, đang kết nối hoặc mất Wi-Fi: LED bật/tắt mỗi 500 ms (một chu kỳ mỗi giây).
- Đã kết nối access point: LED sáng liên tục. Trạng thái này chỉ báo kết nối Wi-Fi, chưa xác nhận Internet/API.
- Với RGB: nhấp nháy màu vàng cam khi chờ, sáng xanh lá khi kết nối.
- LED được cập nhật bằng `millis()`, không thêm thời gian chờ vào luồng USB.

Mặc định thử LED RGB WS2812 tại GPIO48. Thông tin chip qua esptool không xác định được cách nối LED của từng board Super Mini. Nếu LED thực tế dùng chân khác, sửa `GATEWAY_LED_PIN` trong `platformio.ini`. Nếu là LED một màu điều khiển GPIO, đổi `GATEWAY_LED_RGB=0`; dùng `GATEWAY_LED_ACTIVE_LOW=1` nếu LED sáng khi GPIO ở mức thấp. Đèn nguồn nối thẳng nguồn không điều khiển được bằng firmware.

Tại thư mục `auto`:

```powershell
pio run
pio device list
# Thay COM7 bằng đúng cổng của board; bước này sẽ ghi firmware và phân vùng mới.
pio run --target upload --upload-port COM7
```

Không cần upload filesystem image: firmware 0.2 không dùng LittleFS. Bảng phân vùng được giữ để tương thích layout hiện tại. Nếu cần vào chế độ bootloader lần đầu, xem hướng dẫn nút BOOT/RESET của đúng board.

Tài liệu USB native: [Espressif USB CDC](https://docs.espressif.com/projects/arduino-esp32/en/latest/tutorials/cdc_dfu_flash.html).

## 2. Cấp cấu hình cho board

Dùng `gateway-config.json` hiện có. Điền Wi-Fi 2,4 GHz và cấu hình dịch vụ bạn sử dụng. `caCertFile` là đường dẫn tới PEM CA tin cậy cho API; `licenseCaFile` dùng cho Supabase. Lấy CA phù hợp từ nhà cung cấp/chuỗi chứng chỉ đã xác minh. Firmware không dùng `setInsecure()` và không đi theo HTTP redirect.

- `apiUrl`: endpoint Chat Completions tương thích mà tài khoản được phép dùng.
- `apiKey`: khóa provider, sẽ được cấp vào board.
- `licenseUrl`: URL đầy đủ tới Edge Function `license-session` đã deploy.
- `anonKey`: Supabase public anon key, tuyệt đối không dùng service-role key.
- Nếu chỉ thử gateway AI chưa dùng desktop có license, có thể bỏ ba trường `licenseUrl`, `anonKey`, `licenseCaFile`.

Chạy từ thư mục Detect Question, sau `npm.cmd install`:

```powershell
npm.cmd run build:serial-bridge
node tools/esp32_gateway.js configure COM7 D:/Nhung/Projects/ESP32/auto/gateway-config.json
node tools/esp32_gateway.js status COM7
```

Chờ `wifiConnected` và `clockReady` đều là `true`. Lệnh status không trả SSID, mật khẩu hoặc API key.

Có thể cấu hình bằng backend EXE của bản USB preview để không cần Node trên máy đích:

```powershell
.\DetectQuestionBackend.exe --gateway configure COM7 D:/path/to/gateway-config.json
.\DetectQuestionBackend.exe --gateway status COM7
```

Đóng ứng dụng Detect Question đang dùng cổng COM trước khi chạy công cụ cấu hình. Mỗi cổng được một tiến trình sở hữu tại một thời điểm.

## 3. Thử một lời gọi API có chủ đích

Đây là lệnh thử có phát sinh lời gọi API, không tự chạy trong build/test:

```powershell
$env:ESP32_SMOKE_MODEL = 'your-supported-model'
node tools/esp32_gateway.js smoke COM7
# Hoặc dùng bản backend EXE:
.\DetectQuestionBackend.exe --gateway smoke COM7
```

Kiểm tra model thực tế và nội dung trả về. Các tên model mẫu trong Detect Question phải được điều chỉnh theo model API của bạn hỗ trợ; firmware không xác nhận sự tồn tại của tên model.

## 4. Chạy Detect Question qua ESP32

Với mã nguồn, ghép các biến trong `detect-question-usb.env.example` vào `.env` của Detect Question. Sửa `ESP32_SERIAL_PORT` thành cổng thật. Ở chế độ `AI_TRANSPORT=esp32`, provider key và cấu hình Supabase của các lời gọi này được lấy từ board, không đọc khóa AI trong `.env` laptop.

```powershell
node desktop/DetectQuestionBackend.js --standalone --student-id YOUR_MSV --profiles 1
```

Giữ phím tắt như trước: `Alt+M/U` giải một model; `Alt+N/Y` chạy luồng xác minh; `Alt+K` giải nhanh liên tục; `Alt+B` đọc cache. Việc chấm trạng thái xác minh và cho phép điền đáp án vẫn do code Detect Question quyết định.

### Build portable riêng cho chế độ USB

Tại Detect Question:

```powershell
npm.cmd run build:usb-app
```

Kết quả ở `release/usb-preview/`, tách khỏi bản `release/DetectQuestion.exe` đang có:

- `DetectQuestion.exe`: launcher có cấu hình USB được nhúng, không nhúng khóa Wi-Fi/provider/Supabase.
- `DetectQuestionBackend.exe`: dùng provisioning/status, hoặc chạy thủ công bằng `--standalone --student-id ...`.
- `.env`: cấu hình backend USB; nếu đã có thì script build giữ nguyên.

Launcher tự tìm thiết bị Espressif duy nhất nếu không đặt `ESP32_SERIAL_PORT`. Nếu có nhiều board/cổng Espressif, điền cổng vào `.env` preview rồi build lại để nhúng đúng cấu hình. Sau khi cấp cấu hình board, launcher là file người dùng mở để dùng ứng dụng; đóng gói native SerialPort đã được kiểm tra bằng `--usb-diagnostics` trên máy phát triển, còn máy Windows mới vẫn cần kiểm thử thực tế.

## 5. Giới hạn bản thử nghiệm

- Một HTTPS worker trên board; các model vẫn giải độc lập nhưng lời gọi được thực thi lần lượt. Timeout mẫu là điểm khởi đầu. Dữ liệu ảnh lớn hoặc API chậm có thể làm luồng 3 model hết thời gian và trả trạng thái chưa giải được.
- Giới hạn request body là 1.500.000 byte, HTTP response là 262.144 byte. Toàn bộ JSON request, gồm base64 ảnh, phải nằm trong giới hạn. Firmware không nén ảnh tự động.
- Request nằm trong PSRAM và được giải phóng khi hoàn tất/hủy/lỗi. Không nhận PSRAM sẽ trả `PSRAM_UNAVAILABLE`, không chuyển sang ghi flash.
- Wi-Fi/key/CA lưu trong NVS chưa mã hóa; chưa triển khai Secure Boot, Flash Encryption, OTA hoặc khóa danh tính phần cứng.
- Transport có hủy upload, bỏ kết quả sau khi hủy và đợi worker rảnh. HTTPS đang đợi mạng không luôn dừng tức thì. Phím Esc hiện tại của runner vẫn chỉ chặn kết quả về muộn tác động lên trang, chưa nối hủy xuyên suốt từ UI.
- Có thể cấu hình lại board qua cổng USB bằng công cụ cấp cấu hình; chưa có xác thực quản trị cho giao thức USB.
- Laptop gửi `sync_time` khi đồng hồ chưa hợp lệ; SNTP tiếp tục đồng bộ khi có mạng. Lệnh USB không thay đổi đồng hồ đã hợp lệ. TLS vẫn kiểm tra chứng chỉ.
- `wifiDisconnectReason=202` là lỗi xác thực với Wi-Fi. Kiểm tra đúng SSID/mật khẩu và chế độ bảo mật của router; đây là lỗi trước bước gọi API. `wifiStatusCode=3` nghĩa là đã kết nối access point.
- Wi-Fi của dongle phục vụ API/license; không biến thành mạng Internet cho Chrome. Laptop vẫn cần mạng để tải LMS online.
- Chưa có HID tự gõ lệnh, agent tự chạy khi cắm USB, cập nhật GitHub tự động hoặc OCR toàn màn hình Windows. Bản hiện tại dùng launcher do người dùng mở và detector/capture trong trình duyệt.

## 6. Kiểm thử

Tại Detect Question:

```powershell
npm.cmd run test:esp32
npm.cmd test
```

Test mới dùng cổng USB giả lập: dữ liệu UTF-8/ảnh chia khối, yêu cầu đồng thời, ACK sai, response thiếu byte, rút USB, hủy khi xếp hàng, payload quá lớn, chuyển tiếp license và metadata model. Không phát sinh lời gọi API thật.

Sau khi có board, cần kiểm chứng: nạp/nhận cổng; cấp Wi-Fi và CA; status; smoke API; MSV hợp lệ/bị khóa; Alt+M; Alt+N; ảnh lớn; rút cáp giữa chừng; Wi-Fi mất/kết nối lại; chạy EXE trên một máy mới.

Chi tiết ánh xạ ban đầu: [Liên kết Detect Question](LIEN_KET_DETECT_QUESTION.md).

## Tối ưu phiên bản 0.2

DNS dự phòng: thử DNS đang được cấp trước; nếu lỗi thì thử `1.1.1.1` và `8.8.8.8` cho station, giữ nguyên IP/gateway DHCP. Giữ DNS dự phòng nếu tra cứu thành công, khôi phục DNS ban đầu nếu vẫn thất bại. DHCP có thể cấp lại DNS khi kết nối mạng mới. Không ghim IP API; TLS vẫn xác minh tên miền gốc. `DNS_FAILED` được báo riêng, không tự gửi lại POST.

Wi-Fi 0.2.4 khởi tạo theo thứ tự `persistent(false)` → `mode(WIFI_STA)` → `setAutoReconnect(true)` → `setTxPower(WIFI_POWER_8_5dBm)` → `begin(ssid, password)`. Callback chuẩn `STA_START` đặt lại mức 8,5 dBm khi driver sẵn sàng: bản chỉ gọi trong setup đã đo ra 20 dBm do sự kiện khởi động chưa tới. Driver tự kết nối lại; trong loop chỉ cập nhật LED cho trạng thái Wi-Fi. Đã bỏ retry theo thời gian, scan task, tắt/bật radio và các lệnh chẩn đoán tạm.

- JPEG nén tại laptop: mục tiêu 96 KB, giới hạn 512 KB, cạnh dài tối đa 1800 px; giữ màu. Mẫu canvas kiểm thử: 85.987 byte, 1105×736. Không bảo đảm mọi ảnh đạt 96 KB.
- HTTP/1.1 keep-alive cho request liên tiếp cùng URL/key/CA; chỉ giữ kết nối khi đọc hết response thành công. Không tự gửi lại POST khi lỗi để tránh gọi API trùng. Đã xác nhận `reusedConnections=1` qua hai lời gọi thật trên hotspot; số đo không bảo đảm tốc độ mọi câu hỏi.
- Chế độ một model hiện có dùng `ORCHESTRATOR_EMERGENCY_MODEL`, mặc định server `gemini-2.5-flash-lite`. Provider phải hỗ trợ tên model này. Kết quả vẫn là `SINGLE_MODEL_UNVERIFIED`, không chạy backward. Giữ các phím tắt hiện có.

Kiểm tra từ thư mục Detect Question:

```powershell
npm.cmd run test:images
```

Các lệnh firmware chẩn đoán `wifi_scan`, `wifi_verify`, `network_probe`, `transport_test` đã được bỏ khỏi 0.2.4. Số đo của phiên bản trước được lưu trong [báo cáo phiên bản 0.2](PERFORMANCE_REPORT_0.2.md).
