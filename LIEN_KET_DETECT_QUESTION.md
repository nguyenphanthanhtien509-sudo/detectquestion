# Liên kết ESP32 USB AI Gateway với Detect Question

Ngày đối chiếu: 28/10/2026.

> Đây là bản đối chiếu ban đầu trước khi viết code. Firmware, provider USB và bản EXE thử nghiệm đã được bổ sung sau đó; xem [README triển khai](README.md) để biết trạng thái, cách build và giới hạn hiện tại.

## 1. Hai dự án bổ sung cho nhau như thế nào?

- `C:\Users\Tien\Downloads\Detect_Question`: đã có mã nguồn ứng dụng Windows portable, extension Chrome, bộ quét câu hỏi, chụp vùng trình duyệt, backend điều phối AI, cache và quản lý tài khoản.
- `D:\Nhung\Projects\ESP32\auto`: hiện có tài liệu `ESP32-S3_Super_Mini_USB_AI_Gateway_Project.md`; chưa có firmware, cấu hình build hoặc chương trình USB Serial.

Detect Question có thể đảm nhiệm phần mềm laptop trong thiết kế ESP32. Phần cần phát triển thêm là giao tiếp USB và firmware chuyển tiếp HTTPS. Đây là bản đối chiếu và thiết kế tích hợp; hai dự án chưa giao tiếp thực tế.

## 2. Kiến trúc tích hợp đề xuất

```text
Chrome do DetectQuestion.exe mở
  -> Bộ quét DOM / chụp vùng trình duyệt
  -> AdaptiveDebateApiClient
  -> Backend cục bộ 127.0.0.1:8787
  -> AdaptiveDebateOrchestrator
  -> Esp32UsbProvider (cần viết)
  -> USB CDC
  -> Firmware ESP32 (cần viết)
  -> Wi-Fi của ESP32 -> HTTPS API AI
  -> Kết quả đi ngược về orchestrator
  -> Kiểm tra schema / đồng thuận / backward
  -> Hiển thị, copy, cache, hoặc điền đáp án theo chế độ
```

Trong phương án này, ESP32 chuyển tiếp từng lời gọi model. Laptop tiếp tục chạy logic tranh luận và xác minh đã có. Không chuyển toàn bộ orchestrator sang firmware.

Một phương án khác là đặt orchestrator trên máy chủ Internet và để ESP32 chuyển tiếp toàn bộ yêu cầu `/v1/solve`. Phương án đó cần thêm triển khai máy chủ, xác thực và vận hành; hiện chưa có bằng chứng dự án đã triển khai theo cách này.

## 3. Ánh xạ thành phần

| Nhu cầu của thiết kế ESP32 | Thành phần Detect Question | Công việc còn thiếu |
| --- | --- | --- |
| Phát hiện câu hỏi | `src/content/scanner/`, `src/content/core/` | Tái sử dụng các scanner hiện có |
| Chụp vùng câu hỏi | `CaptureSelectionOverlay.js`, background capture và standalone bridge | Tái sử dụng trong trình duyệt được quản lý |
| Chuẩn hóa nhiều dạng câu | `AdaptiveDebateApiClient.js`, `orchestrator/lib/contracts.js` | Bảo toàn schema khi truyền USB |
| Giải bằng AI | `orchestrator/lib/orchestrator.js` | Thêm provider USB vào điểm khởi tạo server |
| Gọi HTTPS | Hiện nằm ở `orchestrator/lib/provider.js` trên laptop | Chuyển phần mạng tới firmware cho chế độ USB |
| Portable Windows | `DetectQuestionLauncher.cs`, các script build | Đóng gói thêm thư viện Serial và cấu hình transport |
| Quản lý tài khoản | `LicenseService.js`, Supabase Edge Functions | Thiết kế đường truyền xác thực qua ESP32 nếu laptop không có Internet |
| Hiển thị/copy/cache | `ContinuousSolveRunner.js`, notifier và standalone bridge | Giữ các trạng thái xác minh chính xác |
| Phát hành/cập nhật GitHub | Hiện có script build EXE | Chưa có luồng updater được xác nhận từ mã đã đối chiếu |

Phần chụp ảnh hiện có tập trung vào nội dung trình duyệt. Chụp mọi ứng dụng Windows và OCR cục bộ là phạm vi bổ sung; chưa thể xem là tính năng đã có.

## 4. Điểm nối trong mã nguồn

`orchestrator/server.js` tạo provider và truyền vào `AdaptiveDebateOrchestrator`. Đây là nơi chọn chế độ gọi trực tiếp hoặc qua ESP32.

Provider mới cần tương thích giao diện hiện tại:

```js
complete({ model, messages, signal, maxRetries })
// -> { content, actualModel, providerRequestId, usage, retryAttempts }
```

- `content` phải giữ nguyên nội dung trả về để parser kiểm tra schema.
- `actualModel` phải lấy từ phản hồi API. Orchestrator hiện từ chối kết quả thiếu hoặc khác model yêu cầu; không tự điền tên model để vượt kiểm tra.
- `messages` bao gồm cả text và dữ liệu ảnh khi sử dụng Vision.
- Provider cần ánh xạ lỗi USB, mất Wi-Fi, timeout và lỗi HTTP sang lỗi mà orchestrator xử lý được.
- Cả forward và backward phải dùng provider USB trong chế độ dongle; chỉ đổi một bên sẽ còn lời gọi Internet trực tiếp trên laptop.

Các tệp dự kiến bổ sung, chưa được tạo:

- `desktop/usb/Esp32SerialTransport.js`: tìm thiết bị, handshake, phân khung, request ID, timeout và ngắt kết nối.
- `orchestrator/lib/esp32-usb-provider.js`: adapter theo giao diện `complete()`.
- Firmware dưới thư mục `auto`: USB CDC, Wi-Fi, TLS, API adapter và trạng thái thiết bị.

Tên tệp trên là đề xuất để phân chia trách nhiệm, không phải thành phần hiện hữu.

## 5. Hợp đồng USB cần thống nhất

Ví dụ JSON câu hỏi đơn trong tài liệu ESP32 chưa đủ để thay trực tiếp provider hiện tại. Cần chuyển được model, messages và metadata.

Các loại thông điệp đề xuất:

| Loại | Mục đích |
| --- | --- |
| `hello` / `status` | Nhận diện firmware, phiên bản giao thức, trạng thái Wi-Fi và giới hạn dữ liệu |
| `configure_wifi` | Cấu hình mạng theo thao tác người dùng |
| `complete` | Chuyển một yêu cầu model |
| `complete_result` | Trả nội dung, model thực tế, usage và ID của provider |
| `error` | Trả lỗi có mã, ID liên quan và khả năng thử lại |
| `cancel` | Yêu cầu dừng một tác vụ nếu tầng xử lý hỗ trợ |

Mỗi tác vụ cần một ID riêng. Truyền qua Serial phải có phân khung; không giả định một lần đọc tương ứng một JSON hoàn chỉnh. Dữ liệu ảnh cần cơ chế chia khối với giới hạn kích thước và kiểm tra tính đầy đủ.

Đặc biệt, orchestrator hiện gọi ba model song song, và ứng dụng hỗ trợ nhiều Chrome profile. Thiết kế USB phải định tuyến đúng phản hồi theo ID và có giới hạn số tác vụ/hàng đợi. Nếu firmware xử lý tuần tự, cần điều chỉnh timeout theo kết quả đo; không mặc định độ trễ giữ nguyên như đường gọi trực tiếp.

## 6. Các khác biệt cần xử lý trước khi chạy thực tế

1. **Xác thực vẫn gọi Internet trên laptop.** `desktop/LicenseService.js` gọi Supabase trước khi khởi động backend. Chỉ chuyển AI qua USB chưa đáp ứng mục tiêu laptop không có Internet riêng. Cần đường truyền license qua dongle hoặc một chính sách offline được thiết kế riêng.
2. **Trang LMS vẫn cần được tải.** Wi-Fi của ESP32 phục vụ API không đồng nghĩa Chrome có Internet. Trang web online vẫn cần kết nối mạng của laptop, hoặc nội dung đã có sẵn theo một cơ chế khác.
3. **Ảnh lớn hơn câu hỏi text.** Hợp đồng hiện tại cho phép ảnh base64; transport và firmware phải có giới hạn/chia khối thay vì nạp tùy ý toàn bộ dữ liệu.
4. **Khóa API hiện ở cấu hình laptop.** Bản portable nhúng `.env`. Khi chuyển sang dongle, cần loại khóa provider khỏi cấu hình phân phối trên laptop và thiết kế cách cấp/đổi khóa cho thiết bị. Token backend loopback có vai trò khác khóa API AI.
5. **Esc chưa hủy xuyên suốt.** Runner hiện vô hiệu hóa kết quả về muộn; muốn hủy tới USB/HTTPS cần nối cancellation qua các tầng.
6. **Chưa có bootstrap USB.** Bản EXE hiện là launcher portable; chưa có firmware HID hay agent tự mở khi cắm thiết bị.

## 7. Hành vi Detect Question cần được bảo toàn

- `Alt+N`: giải nhiều model và backward; tự điền theo `eligibleForAutoApply`.
- `Alt+Y`: thêm ảnh vùng chọn; tự điền khi xác định được câu hỏi và đủ điều kiện.
- `Alt+M`, `Alt+U`: giải một model, hiển thị/copy.
- `Alt+K`: luồng một model cho các câu chưa trả lời, cho phép điền theo lệnh người dùng; kết quả vẫn chưa xác minh.
- `Alt+B`: đọc cache, không gọi AI.

Tài liệu hướng dẫn hiện có đoạn mâu thuẫn về `Alt+K`; khi triển khai cần đối chiếu luồng code và cập nhật tài liệu. Transport USB không được tự nâng kết quả một model thành kết quả đã xác minh.

## 8. Thứ tự triển khai để kiểm chứng liên kết

1. Xây handshake và gửi/nhận text qua USB với một yêu cầu mẫu.
2. Firmware gọi HTTPS và trả nguyên nội dung cùng metadata model.
3. Viết provider USB, thử luồng một model của Detect Question.
4. Kiểm tra ba lời gọi đồng thời, debate, backward và định tuyến ID.
5. Bổ sung truyền ảnh theo khối, timeout, rút/cắm USB và khôi phục mạng.
6. Hoàn thiện đường xác thực license và cấu hình Wi-Fi.
7. Đóng gói EXE, kiểm thử trên máy Windows mới và xây quy trình phân phối/cập nhật.

Chưa flash board, chưa chạy thử phần cứng và chưa thay đổi mã nguồn Detect Question trong bước đọc/đối chiếu này.
