# Kiểm tra firmware 0.2.x và ứng dụng USB

## Đo công suất thực tế và sửa thời điểm STA_START

- Sau cấp lại gateway-config.json cho mạng Thanh Tien, bản chỉ gọi setTxPower trong setup vẫn báo wifiTxPowerQuarterDbm=80 (20 dBm), không đạt mức 8,5 dBm yêu cầu.
- Mã Arduino Core 2.0.17 trả false từ setTxPower nếu STA_STARTED_BIT chưa được đặt; mode(WIFI_STA) gọi esp_wifi_start nhưng không chờ sự kiện STA_START.
- Thêm đúng một callback ARDUINO_EVENT_WIFI_STA_START để đặt 8,5 dBm khi driver sẵn sàng. Giữ các lệnh setup theo yêu cầu, auto-reconnect true, NVS và loop không đổi; không thêm retry, scan hay radio reset.
- Sau build/nạp, đo được wifiTxPowerQuarterDbm=34 (8,5 dBm), wifiConnected=true, status 3 trên mạng Thanh Tien, không cấp lại cấu hình sau lần nạp đó.
- Helper Windows đọc status thành công. Một lượt API HTTP 200 gặp USB_SIZE_MISMATCH; lượt kiểm tra riêng tiếp theo nhận đúng 473 byte/1 chunk, model gemini-2.5-flash-lite trả OK, HTTP 200. Chưa coi đường USB đã ổn định hoàn toàn.
- Người dùng đã rút nguồn khoảng 3 giây rồi cắm lại, không BOOT/RESET. Ba lần đọc liên tiếp sau đó đều wifiConnected=true, wifiStatusCode=3, wifiTxPowerQuarterDbm=34, clockReady=true, configured=true. Không cấu hình lại NVS hoặc gửi lệnh reconnect trong lượt kiểm tra này: tự kết nối sau mất nguồn đã qua thử nghiệm.
- Chưa kết luận brownout là nguyên nhân đã được chứng minh; kết quả chắc chắn là công suất trước sửa sai mức yêu cầu, sau callback đã đúng 8,5 dBm và kết nối sau rút/cắm thành công.

## Hiện tại: dọn gọn Wi-Fi 0.2.4 theo yêu cầu người dùng

- Setup dùng đúng trình tự Arduino-ESP32: persistent(false), WIFI_STA, auto-reconnect true, công suất 8,5 dBm, begin bằng SSID/password lấy từ cấu hình đã lưu.
- Xóa toàn bộ retry Wi-Fi tự viết, bộ đếm/thời gian phục hồi, scan task, tắt/bật radio và các lệnh chẩn đoán tạm. Logic Wi-Fi trong loop chỉ cập nhật LED theo WL_CONNECTED; xử lý USB/upload vẫn giữ nguyên.
- Xóa src/wifi_probe.cpp và environment esp32s3_wifi_probe. Chỉ còn environment gateway.
- Giữ nguyên namespace ai-gateway, blob configV1, cách đọc/ghi Preferences và dữ liệu cấu hình của client.
- Build esp32s3_usb_gateway thành công: RAM tĩnh 45.992 byte, flash app 869.685 byte. Chưa nạp hoặc kiểm chứng kết nối thực tế cho bản sửa này.
- Các mục bên dưới là lịch sử chẩn đoán của các phiên bản trước; logic retry/scan trong đó không còn thuộc mã nguồn hiện tại.

## Lượt kiểm tra sau đổi cáp/cổng USB

- Windows vẫn nhận COM7, VID 303A/PID 1001. Có lần đọc gateway 0.2.3 thành công, rồi lại mất phản hồi. Đổi cáp chưa đủ để xác nhận kết nối ổn định.
- `--before usb_reset` đọc được chip trong một số lần mà reset mặc định thất bại. Thử restart riêng USB Composite Device bằng pnputil bị Windows từ chối quyền.
- Đã build và thử app Wi-Fi tối giản: công suất mặc định, 8,5 dBm, rồi bỏ LED. Các lượt không thu được status đáng tin cậy. Không dùng những lượt này để kết luận nguồn/radio/LED hỏng: đã xác nhận có lần chip còn ở bootloader sau hard reset của esptool (`--before no_reset --no-stub` vẫn đọc được ROM).
- Đã khôi phục gateway 0.2.3 từ binary ứng dụng hợp lệ `backups/gateway-0.2.3-before-wifi-probe.bin`, ghi tại 0x20000 và kiểm tra hash thành công. NVS không thay đổi. Đây là bản sao app hiện tại, không phải bản backup toàn bộ firmware cũ.
- Lệnh thoát bootloader bằng ROM soft reset chạy xong, nhưng status sau đó vẫn chưa đọc được; đã yêu cầu thả BOOT và bấm RESET để xác nhận ứng dụng thực sự chạy. Chưa khẳng định tự bắt Wi-Fi đã được sửa.
- `esp32s3_wifi_probe` là environment chẩn đoán riêng; default environment vẫn là `esp32s3_usb_gateway`. Không dùng bản probe để chạy ứng dụng AI.

## Kiểm tra lại tự kết nối: firmware 0.2.3

- Người dùng báo board chưa tự bắt Wi-Fi. Trên 0.2.2, đã đối chiếu hotspot lưu trong NVS: SSID/mật khẩu khớp hotspot người dùng đã cung cấp, khác file cấu hình router cũ. Scan thấy hotspot kênh 9, RSSI -55 dBm, WPA2 PSK; vẫn AUTH_EXPIRE (2).
- Phát hiện thứ tự `WiFi.persistent(false)` sau `WiFi.mode(WIFI_STA)` không áp dụng storage RAM trong lần low-level init đầu của Arduino Core 2.0.17. Đã chuyển lên trước mode; đây là sửa lỗi thứ tự có căn cứ từ mã thư viện, chưa chứng minh là nguyên nhân duy nhất của lỗi kết nối.
- Đã build/nạp 0.2.3, giữ nguyên cấu hình NVS. Retry chờ 250 ms sau disconnect; sau ba lượt thất bại thử tắt/bật radio. Status thêm uptime, resetReason, số lượt phục hồi radio.
- Lượt theo dõi thực tế: firmware 0.2.3, uptime tăng từ 10.881 đến 75.171 ms, reason 2, retry từ 0 đến 2, chưa kết nối. Sau đó USB ngắt; chưa thu được status xác nhận bước phục hồi radio hoàn tất.
- Đọc status tiếp theo timeout; esptool đọc chip ID/reset qua USB cũng không nhận dữ liệu. Đã đề nghị thử cáp/cổng USB khác. Chưa kết luận nguyên nhân USB là phần cứng, nguồn hay firmware; chưa xác nhận tự kết nối Wi-Fi đã được khắc phục.
- Các lần API thành công được ghi bên dưới là kết quả phiên trước trên 0.2.2, không bảo đảm trạng thái tự kết nối của phiên hiện tại.

## Kết quả mới nhất: hotspot, DNS và API đã thành công

- Firmware đang nạp: 0.2.2. Người dùng bật hotspot Xiaomi 13T Pro rồi đổi sang băng tần 2,4 GHz; ESP32 kết nối thành công, RSSI -38 dBm.
- Trước khi đổi băng tần, board báo NO_AP_FOUND (201). Sau đổi, Wi-Fi sẵn sàng. Điều này xác nhận board kết nối được mạng đối chứng; chưa xác định nguyên nhân lỗi xác thực với router cũ.
- Resolver dự phòng thực sự đã được sử dụng trên board: `dnsResolved=true`, `dnsFallback=true`, DNS 1.1.1.1/8.8.8.8, phân giải `api.key4u.vn` thành 213.35.127.164 trong 8.836 ms. Đây là IP tại thời điểm kiểm tra, không ghim trong firmware.
- Hai request Chat Completions rất ngắn (`Reply with exactly OK.`, tối đa 32 token) qua ESP32 đều HTTP 200, actual model `gemini-2.5-flash-lite`, nội dung `OK`, không lỗi TLS.

| Lượt | Thời gian phía laptop | POST trên board | Đọc response | Kết nối tái sử dụng tích lũy |
| --- | ---: | ---: | ---: | ---: |
| 1 | 8.282 ms | 7.154 ms | 8 ms | 0 |
| 2 | 1.505 ms | 1.482 ms | 8 ms | 1 |

Chênh lệch hai lượt có thể gồm TLS, thời gian xử lý provider và biến động mạng; không dùng để cam kết tiết kiệm cố định hoặc tốc độ giải câu hỏi thực tế.

Board hiện lưu Wi-Fi hotspot để tiếp tục dùng mạng đã kiểm tra. File `gateway-config.json` trên máy vẫn giữ mạng router cũ theo chủ đích thử đối chứng; cấp lại file đó sẽ chuyển board về router cũ. Không ghi mật khẩu vào báo cáo. EXE USB hiện có tương thích giao thức firmware 0.2.2; phần sửa DNS/Wi-Fi chạy trong firmware nên không cần build lại EXE cho thay đổi này.

Chưa xác nhận toàn bộ UI/license/luồng nhiều model hoặc kết nối ổn định với router cũ. Các mục bên dưới ghi lại tiến trình và giới hạn của những lần kiểm tra trước, không thay thế kết quả mới nhất này.

## Cập nhật firmware DNS 0.2.1

- Build/nạp 0.2.1 thành công, giữ NVS. DNS dự phòng chỉ được thử sau khi DNS hiện tại thất bại. Không đổi IP/gateway DHCP, không tắt xác minh TLS và không ghim IP API.
- TLS kết nối bằng IP vừa phân giải nhưng giữ hostname gốc cho SNI/xác minh chứng chỉ. Không tra DNS lần thứ hai ngay trước TLS.
- Nếu cả hai lượt DNS thất bại, khôi phục DNS ban đầu và trả `DNS_FAILED`. Không gửi lại POST tự động.
- Thêm `lastDnsMs`, `lastDnsFallback` vào status; probe trả `dnsFallback` và sử dụng cùng resolver.
- 13 test USB/model đã qua, gồm lỗi DNS không gây gọi AI trùng và probe không tải payload AI.
- Lần kiểm tra sau nạp: nhận đúng firmware 0.2.1, nhưng Wi-Fi chưa kết nối (reason 2). Đang chờ rút/cắm lại nguồn để kiểm thử DNS dự phòng/API thực tế. Chưa tuyên bố khắc phục DNS trên phần cứng.
- Sau khi người dùng rút/cắm lại, board còn báo lỗi kết nối Wi-Fi 205, rồi USB ngắt trong lúc kiểm tra. Windows sau đó vẫn thấy COM7 nhưng lệnh status không được trả lời trong 60 giây. Đã yêu cầu bấm RESET/RST một lần; chưa chạy API hoặc xác nhận DNS dự phòng thành công.

Báo cáo này cập nhật và thay thế các kết luận về LittleFS/PSRAM, số test và trạng thái đóng gói trong HARDWARE_TEST_REPORT.md của phiên bản 0.1.

## Cập nhật Wi-Fi 0.2.2

- Sau RESET của người dùng, firmware USB lại trả lời, nhưng Wi-Fi vẫn báo AUTH_EXPIRE (2)/CONNECTION_FAIL (205).
- Đã build và nạp 0.2.2: bỏ retry chồng giữa Arduino auto-reconnect và gateway; gateway thử lại sau 30 giây. Quét tất cả kênh, ưu tiên AP mạnh, tắt modem sleep.
- Quét mạng trên worker riêng đã hoàn tất trên board thật: tìm thấy mạng đã cấu hình, kênh 9, RSSI -67 dBm, auth mode 4 (WPA/WPA2 PSK). Cấu hình Wi-Fi lưu trên board khớp file.
- Sau thay đổi, Wi-Fi vẫn chưa kết nối thành công trong lượt kiểm tra này. Đã đề nghị hotspot 2,4 GHz đối chứng; chưa kết luận router, mật khẩu hay phần cứng là nguyên nhân.
- Chưa chạy được kiểm tra DNS dự phòng/API vì Wi-Fi chưa sẵn sàng. Không coi build thành công hoặc test giả lập là bằng chứng kết nối API hoạt động.
- Benchmark USB thật trên 0.2.2 vẫn qua: tải 65.464 byte mất 737 ms, 130.991 byte mất 1.475 ms; echo khớp hoàn toàn, PSRAM trống 2.014.371 byte qua các lượt, kiểm tra hủy upload thu hồi bộ nhớ thành công. Không gọi API.

## Đã xác nhận

- Board COM7: ESP32-S3 revision v0.2, flash 4 MB, PSRAM 2 MB, USB Serial/JTAG.
- Firmware 0.2.0 đã build và nạp thành công, hash được kiểm tra. Ứng dụng nạp tại `0x20000`; không ghi `boot_app0.bin` vào vùng NVS.
- Runtime nhận PSRAM khoảng 2 MB. Request không còn ghi LittleFS; cấu hình vẫn lưu NVS và còn sau nạp/reset.
- Wi-Fi và SNTP đã kết nối thành công trong phiên kiểm tra trước lần nạp cuối. Lần reset mềm cuối lại báo Wi-Fi mất kết nối, reason 2. Cần xác nhận sau rút/cắm nguồn; chưa kết luận mật khẩu/router sai.
- Đã sửa ACK USB trễ bằng flush từng frame trên HWCDC. Helper Windows gửi trực tiếp, không chờ giữa các đoạn nhỏ.

## Đo USB thật, không gọi API

Payload UTF-8 gửi lên và echo về khớp hoàn toàn. Chunk 2048 byte.

| Payload | Tải lên | Gửi và nhận về |
| --- | ---: | ---: |
| 16.328 byte | 190 ms | 270 ms |
| 65.464 byte | 770 ms | 1.066 ms |
| 130.991 byte | 1.544 ms | 2.135 ms |

PSRAM trống 2.013.343 byte qua các lần đo. Hủy upload 65.536 byte thu hồi bộ nhớ và cho nhận việc tiếp theo. Đây là thời gian USB, không phải thời gian AI giải bài; chưa có đối chứng đủ tương đương để công bố hệ số tăng tốc.

## Kiểm thử mã và ảnh

- `npm.cmd test`: toàn bộ suite hiện có đã qua, gồm 11 test USB/model nhanh.
- Test giả lập kiểm tra UTF-8, ACK sai, mất kết nối, xếp hàng, timeout/hủy, giới hạn payload, license, metadata, chunk 2 KB và đồng bộ giờ USB.
- Test canvas bằng Chrome thật đã qua: ảnh màu/chữ 2400×1600 thành JPEG 85.987 byte, 1105×736; giữ tỷ lệ và màu. Đây là mẫu tổng hợp, chưa bảo đảm độ đọc của mọi ảnh thực tế.
- Extension `dist` đã build lại thành công sau thay đổi nén ảnh.
- Đã đóng gói lại `release/usb-preview/DetectQuestion.exe` và `DetectQuestionBackend.exe`. EXE mới liệt kê được thiết bị Espressif và đọc status COM7 thành công: firmware 0.2.0, PSRAM sẵn sàng, chunk 2048 byte, cấu hình và đồng hồ hợp lệ.

## Chưa xác nhận

- Smoke API chưa thành công: lần gần nhất trước lần nạp cuối trả `HTTPS_FAILED`, HTTP -1, TLS code 0, thời gian POST khoảng 13.975 ms. Chưa phân biệt dứt điểm DNS/TCP/TLS.
- Keep-alive đã triển khai nhưng chưa xác nhận tái sử dụng qua hai response HTTPS thành công. Chưa công bố mức tiết kiệm thời gian hoặc cam kết tốc độ model.
- Chưa kiểm thử license và toàn bộ luồng nhiều model/ảnh/UI qua phần cứng.
- Kiểm tra tiếp sau báo cáo đèn nhấp nháy: cấu hình Wi-Fi lưu trên board khớp file; board tự kết nối trở lại (`wifiConnected=true`, status 3), SNTP đồng bộ thành công. Status sau probe vẫn giữ kết nối. Reason 2 là lỗi lần ngắt trước, không có nghĩa hiện đang mất Wi-Fi.
- Probe DNS endpoint API thất bại sau 13.837 ms, DNS đang dùng `192.168.1.1` và `123.26.26.26`. Đây là lỗi phân giải tên sau khi Wi-Fi kết nối, phù hợp với HTTP -1/TLS code 0 trước đó; chưa xác nhận nguyên nhân của DNS hoặc HTTPS thành công.

## Tiếp tục kiểm tra

Sau khi rút/cắm lại board và đóng Serial Monitor, chạy tại thư mục Detect Question:

```powershell
node tools/esp32_gateway.js status COM7
node tools/esp32_gateway.js probe COM7
```

Probe chỉ phân giải DNS endpoint đã cấu hình, không gửi khóa hoặc gọi AI. Khi Wi-Fi và DNS sẵn sàng, chạy smoke HTTPS có chủ đích rồi kiểm tra hai lần gọi liên tiếp để đo `reusedConnections`. Bản portable mới đã đóng gói xong và vượt qua kiểm tra USB status; chưa kiểm thử toàn bộ UI/license/API.
