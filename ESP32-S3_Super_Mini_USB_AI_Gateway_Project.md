# ESP32-S3 Super Mini USB AI Gateway

> **Mô tả dự án:** Thiết bị USB nhỏ gọn sử dụng ESP32-S3 Super Mini làm cầu nối giữa phần mềm đọc câu hỏi trên laptop và một API giải đáp chạy trên Internet. Mục tiêu là mang thiết bị tới một máy Windows mới, cắm vào và khởi động công cụ một cách thuận tiện, trong khi ESP32 đảm nhiệm toàn bộ việc kết nối Wi-Fi và trao đổi dữ liệu với API.

## 1. Ý tưởng tổng quan

Dự án hướng tới một thiết bị dạng **USB AI Dongle**. Người dùng cắm ESP32-S3 Super Mini vào laptop thông qua cáp USB-C. Phần mềm chạy trên laptop chịu trách nhiệm lấy nội dung hiển thị trên màn hình (khi người dùng cho phép), nhận diện câu hỏi bằng OCR hoặc phương pháp phân tích phù hợp, sau đó chuyển câu hỏi qua USB cho ESP32-S3.

ESP32-S3 **không chụp màn hình, không chạy OCR và không tự giải câu hỏi**. Board chỉ đóng vai trò **trạm trung chuyển/API Gateway**: nhận dữ liệu từ laptop, dùng kết nối Wi-Fi 2,4 GHz của chính nó để gửi yêu cầu HTTPS tới dịch vụ API đã cấu hình, nhận kết quả từ dịch vụ rồi chuyển ngược về laptop bằng USB. Phần mềm trên laptop nhận kết quả và hiển thị cho người dùng.

Một mục tiêu quan trọng khác là giảm tối đa thao tác thiết lập trên máy mới. Tác giả dự định **đưa phần mềm laptop lên GitHub** và để thiết bị USB hỗ trợ khởi chạy hoặc tải công cụ khi được cắm vào. Phương án mong muốn là ESP32-S3 sử dụng giao diện **USB HID** (giả lập bàn phím) để hỗ trợ mở CMD/PowerShell, tải ứng dụng từ GitHub và chạy ứng dụng lần đầu. Tuy nhiên, cần phân biệt rõ **mục tiêu trải nghiệm** với **khả năng được hệ điều hành cho phép**: Windows hiện đại không bảo đảm cho một USB bất kỳ tự tải/chạy chương trình trên máy chưa được thiết lập, không có thao tác chấp thuận. Việc triển khai thực tế cần có cơ chế kích hoạt minh bạch, do chủ máy cho phép.

## 2. Mục tiêu của dự án

- Tạo thiết bị có kích thước nhỏ, tận dụng **ESP32-S3 Super Mini**, cắm vào cổng USB của laptop.
- Chạy phần mềm đọc màn hình/OCR **trên laptop**, không đặt gánh nặng xử lý hình ảnh lên ESP32.
- Trao đổi dữ liệu hai chiều giữa laptop và ESP32 qua **USB**.
- Để **ESP32 tự kết nối Wi-Fi và gọi API qua HTTPS**; phần mềm laptop không cần trực tiếp giữ khóa API hoặc thực hiện lời gọi tới dịch vụ giải đáp.
- Hỗ trợ phần mềm dạng **portable**, phát hành qua **GitHub Releases**, tránh yêu cầu cài môi trường Python/Node.js trên máy mới.
- Hướng tới trải nghiệm **plug-and-play** trên Windows: cắm thiết bị, thực hiện một bước kích hoạt được người dùng chấp thuận trong lần đầu; các lần sau trên máy đã thiết lập có thể tự mở ứng dụng bằng một tác nhân được cài và cấp quyền từ trước.
- Thiết kế đủ rõ ràng để sau này phát triển thành thiết bị thương mại nhỏ gọn.

## 3. Phân chia nhiệm vụ

| Thành phần | Nhiệm vụ chính |
| --- | --- |
| **Laptop (ứng dụng Windows)** | Chụp vùng màn hình được phép truy cập; OCR, phát hiện và chuẩn hóa câu hỏi; đóng gói yêu cầu; trao đổi USB; hiển thị đáp án. |
| **ESP32-S3 Super Mini** | Nhận yêu cầu qua USB; giữ kết nối Wi-Fi; gửi HTTPS tới API; nhận và chuyển tiếp phản hồi; quản lý trạng thái và lỗi. |
| **API Server** | Phân tích câu hỏi và trả về đáp án hoặc lời giải dưới dạng có cấu trúc. |
| **GitHub Releases** | Lưu bản phát hành ứng dụng laptop (ví dụ `AI-Tool.exe`), thông tin phiên bản và checksum. |
| **Launcher/Bootstrapper** | Trên máy mới, kiểm tra/tải đúng phiên bản ứng dụng, xác minh nguồn phát hành rồi mở ứng dụng sau khi người dùng chấp thuận. |

## 4. Luồng hoạt động chính

```text
                       LAPTOP WINDOWS
        ┌─────────────────────────────────────┐
        │  AI Tool (chạy trên laptop)          │
        │  - Người dùng cho phép chụp màn hình │
        │  - OCR / phát hiện câu hỏi           │
        │  - Đóng gói dữ liệu                  │
        └──────────────────┬──────────────────┘
                           │ USB CDC (Serial)
                           ▼
                ┌──────────────────────┐
                │ ESP32-S3 Super Mini  │
                │ - USB Device         │
                │ - Wi-Fi Client       │
                │ - HTTPS Client       │
                └──────────┬───────────┘
                           │ Wi-Fi / Internet
                           ▼
                  ┌─────────────────┐
                  │  API giải đáp   │
                  └────────┬────────┘
                           │ HTTPS response
                           ▼
                     ESP32-S3
                           │ USB CDC
                           ▼
                   AI Tool trên laptop
                           │
                           ▼
                    Hiển thị đáp án
```

**Trình tự:**

1. Người dùng cắm ESP32-S3 vào laptop qua cáp USB có truyền dữ liệu.
2. Trên máy lần đầu sử dụng, người dùng đồng ý mở launcher hoặc chạy bản portable; launcher lấy bản ứng dụng tin cậy từ GitHub nếu cần.
3. Ứng dụng phát hiện cổng USB CDC của ESP32 và kiểm tra trạng thái kết nối.
4. Người dùng cho phép ứng dụng chụp vùng màn hình cần phân tích.
5. Ứng dụng trích xuất câu hỏi và các lựa chọn (nếu có), sau đó gửi yêu cầu qua USB.
6. ESP32 gửi yêu cầu đến API thông qua Wi-Fi riêng của nó.
7. ESP32 nhận kết quả và trả phản hồi về laptop qua USB.
8. Ứng dụng hiển thị câu trả lời; ESP32 tiếp tục sẵn sàng nhận yêu cầu tiếp theo.

## 5. Yêu cầu khởi chạy trên máy tính mới

### 5.1. Trải nghiệm mong muốn

Theo ý tưởng ban đầu, khi cắm ESP32-S3 vào một laptop Windows chưa có phần mềm, thiết bị sẽ hỗ trợ **mở CMD/PowerShell, tải tool từ GitHub và chạy file lần đầu**. Sau khi công cụ khởi chạy, ESP32 trở về vai trò trung gian API. Người dùng không muốn phải sao chép phần mềm hoặc cài nhiều phụ thuộc bằng tay trên mỗi laptop.

### 5.2. Giới hạn kỹ thuật và bảo mật

- ESP32 **không thể tự thực thi lệnh Windows**; ở chế độ USB HID, nó chỉ có thể gửi tín hiệu giống thao tác bàn phím.
- Windows **không cho phép USB lưu trữ tự động chạy file EXE một cách đáng tin cậy** trên mọi máy mới. Các cơ chế bảo mật, quyền người dùng, chính sách doanh nghiệp, màn hình khóa và phần mềm chống mã độc có thể chặn quá trình này.
- Mô hình **USB HID tự gửi lệnh để tải và thực thi phần mềm khi chưa được chủ máy chấp thuận** không nên được sử dụng làm cơ chế mặc định. Nó thiếu tính minh bạch, không đáng tin cậy và có thể bị xem là hành vi BadUSB.
- Nếu **laptop không có Internet**, máy sẽ không thể trực tiếp tải GitHub. Kết nối Wi-Fi của ESP32 không tự động biến thành Internet của laptop. Muốn ESP32 tải file hộ, cần thiết kế thêm kênh chuyển file và bộ nhận trên laptop, hoặc giải pháp lưu trữ/phát hành phần mềm khác.

### 5.3. Phương án triển khai khuyến nghị

**Lần đầu trên máy mới:**

1. Cắm ESP32; Windows nhận diện thiết bị USB.
2. Người dùng chủ động kích hoạt công cụ (chẳng hạn mở một launcher portable được phân phối qua GitHub hoặc từ bộ nhớ USB có sẵn).
3. Launcher tải bản phát hành phù hợp từ GitHub Releases (nếu chưa có), **xác minh checksum/chữ ký**, sau đó mở tool.
4. Người dùng cấp quyền chụp màn hình nếu tính năng yêu cầu.
5. Tool kết nối USB CDC và bắt đầu sử dụng ESP32 như API Gateway.

**Các lần cắm sau trên máy đã thiết lập:** Có thể có một **agent/ứng dụng nền đã được người dùng cài và cho phép trước đó** để phát hiện USB rồi tự mở tool. Không nên giả định khả năng này tồn tại sẵn trên một máy Windows bất kỳ.

**Tùy chọn nghiên cứu:** Sử dụng **USB Composite Device** gồm USB CDC + USB HID, trong đó HID chỉ kích hoạt quy trình khởi chạy khi có hành động đồng ý rõ ràng của chủ máy (ví dụ nhấn nút trên dongle), và không cố gắng vượt qua chính sách bảo mật hệ điều hành. Có thể nghiên cứu thêm USB Mass Storage để mang launcher, nhưng dung lượng flash của board có thể không đủ cho một EXE hoàn chỉnh.

## 6. Kiến trúc kỹ thuật đề xuất

### Phần cứng

- ESP32-S3 Super Mini có USB native.
- Cáp USB-C **hỗ trợ truyền dữ liệu**.
- Wi-Fi 2,4 GHz để gọi HTTPS API.
- LED trạng thái có sẵn trên board (nếu tương thích chân và firmware).
- Tùy chọn: nút kích hoạt và bộ nhớ ngoài nếu cần lưu tệp lớn.

### Firmware ESP32

- Viết bằng **ESP-IDF** (ưu tiên cho kiểm soát USB/TLS) hoặc Arduino Core nếu nguyên mẫu đơn giản.
- USB CDC để nhận/gửi JSON hoặc thông điệp có đánh dấu độ dài.
- Wi-Fi Manager: lưu cấu hình, kết nối lại khi mất sóng.
- HTTPS Client: xác minh chứng chỉ TLS, timeout, kiểm soát số lần thử lại.
- API Adapter: chuyển dữ liệu đầu vào sang cấu trúc yêu cầu của dịch vụ API đang dùng.
- Response Streaming: chia khối phản hồi dài để tránh thiếu RAM.
- Status/Diagnostics: báo trạng thái kết nối và mã lỗi cho ứng dụng laptop.
- Có thể bổ sung USB HID nếu thật sự cần một thao tác khởi chạy được người dùng chủ động kích hoạt.

### Phần mềm laptop

- Chạy trên Windows 10/11, đóng gói thành **EXE portable**.
- Mô-đun chụp màn hình theo lựa chọn/quyền của người dùng.
- Mô-đun OCR và trích xuất câu hỏi.
- Mô-đun USB Serial tự tìm ESP32 theo VID/PID và giao thức nhận diện.
- Giao diện hiển thị kết quả, trạng thái Wi-Fi/API và thông báo lỗi.
- Tùy chọn kiểm tra phiên bản và cập nhật từ GitHub Releases.

## 7. Giao thức laptop ↔ ESP32 (ví dụ)

**Yêu cầu từ laptop:**

```json
{
  "id": "q-0001",
  "type": "solve",
  "question": "Thủ đô của Nhật Bản là gì?",
  "options": {
    "A": "Seoul",
    "B": "Tokyo",
    "C": "Bangkok",
    "D": "Bắc Kinh"
  }
}
```

**Phản hồi từ ESP32:**

```json
{
  "id": "q-0001",
  "status": "success",
  "answer": "B",
  "explanation": "Tokyo là thủ đô của Nhật Bản."
}
```

Đây chỉ là **ví dụ giao thức nội bộ**, không phải định dạng cố định của API bên ngoài. Khi triển khai cần thống nhất cách phân khung dữ liệu qua USB (ví dụ JSON từng dòng đối với dữ liệu nhỏ hoặc length-prefix đối với dữ liệu lớn), hỗ trợ UTF-8, ID đối chiếu yêu cầu/phản hồi, timeout và trạng thái lỗi.

## 8. Điều kiện Internet và cấu hình

- **Khi sử dụng:** Laptop không nhất thiết có kết nối Internet riêng, miễn là phần mềm đã chạy và ESP32 có Wi-Fi truy cập được API.
- **Khi tải phần mềm trên máy mới:** Nếu launcher trên laptop tải GitHub trực tiếp, laptop phải có Internet; nếu không cần triển khai phương án phân phối khác.
- **Wi-Fi mới:** Cần cơ chế cấu hình SSID/mật khẩu cho ESP32 (ví dụ màn hình cấu hình trong tool qua USB). Không thể mặc định mọi nơi đều có Wi-Fi đã được ESP32 biết trước.
- **API key:** Có thể lưu trong ESP32, nhưng không mặc nhiên bảo mật tuyệt đối. Nếu triển khai thương mại, nên cân nhắc backend trung gian, xác thực thiết bị, giới hạn lưu lượng và phương án xoay vòng khóa.

## 9. Yêu cầu phi chức năng

- **Dễ sử dụng:** Hạn chế cài đặt, ưu tiên EXE portable, trạng thái hiển thị dễ hiểu.
- **Ổn định:** Tự kết nối lại Wi-Fi; thông báo khi USB bị rút hoặc API không phản hồi.
- **Hiệu năng:** Giữ kết nối Wi-Fi; tránh tải toàn bộ phản hồi dài vào RAM cùng lúc.
- **Bảo mật:** Xác thực TLS; không chạy lệnh tải/thực thi phần mềm ẩn; chỉ chụp màn hình khi được người dùng cho phép; kiểm chứng bản phát hành từ GitHub.
- **Quyền riêng tư:** Thông báo rõ câu hỏi trích xuất từ màn hình sẽ được gửi tới dịch vụ API bên ngoài; hạn chế lưu dữ liệu nhạy cảm.
- **Tương thích:** Ưu tiên Windows trước. Android là một giai đoạn riêng vì cách truy cập USB và cấp quyền khác Windows.

## 10. Lộ trình triển khai

| Giai đoạn | Kết quả cần đạt |
| --- | --- |
| **1. Proof of Concept** | Laptop gửi câu hỏi mẫu qua USB CDC → ESP32 gọi API bằng Wi-Fi → laptop nhận câu trả lời. |
| **2. Tool laptop** | Chụp màn hình theo quyền người dùng, OCR, trích xuất câu hỏi và hiển thị đáp án. |
| **3. Phát hành GitHub** | Đóng gói EXE portable; tự kiểm tra phiên bản và tải từ GitHub Releases bằng launcher minh bạch. |
| **4. Trải nghiệm USB** | Tự phát hiện board, cấu hình Wi-Fi, trạng thái LED, giao thức USB ổn định. |
| **5. Tự khởi động trên máy đã thiết lập** | Agent đã được người dùng cho phép phát hiện sự kiện cắm USB và mở tool. |
| **6. Hoàn thiện sản phẩm** | Vỏ nhỏ gọn, bảo mật khóa API, nhật ký lỗi, cập nhật firmware, tài liệu sử dụng. |

## 11. Tiêu chí hoàn thành bản đầu tiên (MVP)

Bản MVP được coi là đạt khi:

1. ESP32-S3 Super Mini kết nối Wi-Fi ổn định và gọi thành công API thử nghiệm qua HTTPS.
2. Laptop gửi câu hỏi qua USB và nhận được kết quả đúng ID, không cần laptop trực tiếp gọi API.
3. Phần mềm laptop trích xuất được câu hỏi từ vùng màn hình người dùng chọn.
4. Ứng dụng laptop có bản EXE portable tải được từ GitHub Releases, không yêu cầu cài môi trường phát triển.
5. Trên máy Windows mới, người dùng có thể chủ động chạy launcher và sử dụng thiết bị sau các bước cấp quyền cần thiết.
6. Khi mất Wi-Fi, lỗi API hoặc rút USB, tool hiển thị lỗi rõ ràng và có khả năng phục hồi.

## 12. Phạm vi chưa có trong bản đầu tiên

- Tự thực thi EXE không cần sự chấp thuận trên bất kỳ laptop Windows nào.
- Vượt qua chính sách quản trị, màn hình khóa hay cơ chế bảo mật của hệ điều hành.
- Tự hoạt động trên mọi điện thoại Android/iPhone ngay từ phiên bản đầu.
- Chạy OCR hoặc mô hình AI trên ESP32.
- Bảo đảm đáp án API luôn đúng hoặc bảo đảm vận hành khi hoàn toàn không có Internet.

## 13. Kết luận

**ESP32-S3 Super Mini USB AI Gateway** là dự án kết hợp phần mềm xử lý màn hình trên laptop với một thiết bị USB có kết nối Wi-Fi riêng. Giá trị cốt lõi nằm ở việc **tách nhiệm vụ**: laptop phụ trách nhận dạng và giao diện; ESP32 phụ trách giao tiếp USB, mạng và API; GitHub phụ trách phân phối phần mềm.

Mục tiêu dài hạn là trải nghiệm **cắm thiết bị và dùng nhanh trên nhiều máy**. Với Windows, thiết kế khả thi và đáng tin cậy nhất là **lần đầu người dùng chấp thuận khởi chạy launcher**, còn những lần sau có thể tự mở khi máy đã được thiết lập trước. Hướng này vẫn giữ được ý tưởng sản phẩm nhỏ gọn, dễ mang theo, không cần cài Python và dễ cập nhật phần mềm, đồng thời tránh phụ thuộc vào các cơ chế tự thực thi USB không được bảo đảm.
