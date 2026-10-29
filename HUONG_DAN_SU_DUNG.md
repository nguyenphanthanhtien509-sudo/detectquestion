# HƯỚNG DẪN SỬ DỤNG HỆ THỐNG ESP32 USB AI GATEWAY & DETECT QUESTION
*(Bản hoàn chỉnh — Tối ưu thực chiến, tàng hình và an toàn)*

---

## 1. TỔNG QUAN HỆ THỐNG & NGUYÊN LÝ HOẠT ĐỘNG

Hệ thống là giải pháp **giải đề thi trắc nghiệm online tàng hình (Stealth AI Exam Solver)** kết hợp giữa phần cứng và phần mềm:

```text
       [ĐIỆN THOẠI TRONG TÚI] (Phát Wi-Fi 4G riêng: "Thanh Tien")
                                      ▲
                                      │ Wi-Fi 2.4 GHz
                                      ▼
[LAPTOP PHÒNG THI] ──(USB Serial)──► [DONGLE ESP32-S3] ──(HTTPS)──► [SERVER AI / KEY4U]
  - Quét DOM đề thi / Chụp ảnh         - Bắt Wi-Fi riêng             - Gemini 3.8 / 2.5 Flash
  - Mở Chrome, tự click đáp án         - Giữ API Key trong Flash     - Đồng thuận 3/3
  - Không có kết nối mạng ra AI        - Bắn request & nhận kết quả  - Suy luận ngược Backward
```

- **ESP32-S3 Super Mini (Hardware Dongle)**: Đóng vai trò trạm trung chuyển mạng. Chip tự kết nối Wi-Fi 4G riêng phát từ điện thoại của bạn, giữ API Key bên trong bộ nhớ Flash (NVS) và trực tiếp gọi HTTPS đến AI. Card mạng của laptop **hoàn toàn không có dữ liệu nào kết nối ra AI**, vượt qua mọi phần mềm giám sát thi (Safe Exam Browser, Proctoring) và hệ thống soi gói tin của trường.
- **Laptop (`DetectQuestion.exe`)**: Bản portable độc lập, tự mở cửa sổ Chrome riêng để quét đề, hiển thị badge đáp án và tự click chọn đáp án. Không lưu API key, không lưu danh tính học viên (đã bỏ phần nhập MSV).

---

## 2. CHUẨN BỊ PHẦN CỨNG & BẢO VỆ VẬT LÝ

> [!WARNING] **Bắt buộc bọc cách điện cho ESP32-S3 Super Mini**
> Bản Super Mini có linh kiện siêu nhỏ lộ thiên. Ngón tay chạm trực tiếp vào nút **Reset (EN)**, chân linh kiện hoặc **thạch anh 40MHz** sẽ gây tụt áp / lệch xung nhịp làm **chip bị Reset ngay lập tức**!

1. **Dán cách điện**: Dán 1–2 lớp băng dính cách điện (băng dính đen hoặc băng dính trong) bọc kín cả mặt trên và mặt dưới của bo mạch ESP32 (chỉ chừa lại đúng đầu cắm USB-C). Hoặc lồng màng co nhiệt rồi hơ nhẹ.
2. **Cáp kết nối**: Dùng cáp USB-C ngắn, chất lượng tốt, có hỗ trợ truyền dữ liệu (Data). Tránh dùng cáp sạc điện thoại giá rẻ chỉ có 2 dây nguồn vì sẽ không nhận cổng COM.
3. **Cổng cắm**: Cắm trực tiếp vào cổng USB trên thân laptop, tránh cắm qua hub chia cổng USB rẻ tiền vì dễ sụt áp.

---

## 3. CẤU HÌNH BAN ĐẦU (CHỈ CẦN LÀM 1 LẦN)

### A. Cấu hình điểm phát sóng Wi-Fi (Hotspot trên điện thoại)
- **Tên Wi-Fi (SSID)**: Đặt đúng theo file cấu hình (mặc định: `Thanh Tien`).
- **Mật khẩu**: Mặc định `11111111`.
- **Băng tần phát sóng (BẮT BUỘC 2.4 GHz)**:
  - **Trên iPhone**: Vào *Cài đặt* -> *Điểm truy cập cá nhân* -> **BẬT "Tối đa hóa khả năng tương thích" (Maximize Compatibility)**. Nếu không bật, iPhone sẽ phát 5 GHz và ESP32 sẽ không thể nhìn thấy mạng.
  - **Trên Android**: Vào cấu hình Điểm phát sóng -> Đổi *Băng tần AP* sang **2.4 GHz**, bảo mật **WPA2-Personal**.

### B. Nạp cấu hình vào USB ESP32
Cắm ESP32 vào cổng USB (ví dụ `COM7`). Mở PowerShell tại thư mục `Detect_Question` chạy lệnh:
```powershell
node tools/esp32_gateway.js configure COM7 D:/Nhung/Projects/ESP32/auto/gateway-config.json
```
*(Hoặc dùng file exe: `.\DetectQuestionBackend.exe --gateway configure COM7 D:/Nhung/Projects/ESP32/auto/gateway-config.json`)*

### C. Ý nghĩa đèn LED trạng thái (RGB GPIO 48)
- **Nhấp nháy vàng cam (chu kỳ 0.5s)**: Đang khởi động hoặc đang tìm kiếm kết nối Wi-Fi.
- **Sáng xanh lá cố định (Solid Green)**: Đã kết nối Wi-Fi thành công, sẵn sàng nhận lệnh giải đề.

---

## 4. QUY TRÌNH THỰC CHIẾN TRONG PHÒNG THI (MÁY MỚI HOẶC MÁY CŨ)

Khi vào phòng thi, thực hiện **chuẩn xác theo thứ tự 4 bước sau**:

```text
[Bước 1] Bật Wi-Fi điện thoại ──► [Bước 2] Cắm USB ESP32 (Đèn xanh đứng yên) 
                                                │
[Bước 4] Mở trang thi & giải đề ◄── [Bước 3] Mở DetectQuestion.exe
```

1. **Bước 1**: Mở điện thoại, bật **Điểm phát sóng cá nhân**. Mở sáng màn hình ở trang Hotspot khoảng 5–10 giây để điện thoại phát tín hiệu beacon.
2. **Bước 2**: Cắm chiếc USB ESP32 vào cổng USB laptop. Chờ khoảng 3–5 giây quan sát đèn LED chuyển từ **nhấp nháy sang XANH LÁ CỐ ĐỊNH**.
3. **Bước 3**: Click đúp mở file **`DetectQuestion.exe`**.
   - Cửa sổ trình duyệt Google Chrome được quản lý sẽ tự động mở ra.
   - Không cần nhập MSV, không cần cài Node.js hay môi trường gì khác.
4. **Bước 4**: Dùng chính cửa sổ Chrome do tool mở ra để đăng nhập vào trang thi trắc nghiệm (Moodle, LMS, Canvas...) và làm bài.

---

## 5. BẢNG PHÍM TẮT & CÁC MODEL AI ĐƯỢC SỬ DỤNG

### A. Bảng tổng hợp các tổ hợp phím

| Phím tắt | Tên chế độ | Các Model AI được gọi | Hành vi AI & Giao diện | Cơ chế Click tự động (Auto-Apply) |
| :---: | :---: | :--- | :--- | :--- |
| **`Alt + N`** | **Giải đầy đủ (Full Consensus)** | **4 lượt gọi Model:**<br>• Vòng giải: `gemini-3.8-flash`, `gemini-2.5-flash`, `gemini-2.5-flash-lite`<br>• Vòng Backward: `gemini-3.6-flash` | Quét câu hỏi hiện tại -> 3 model giải độc lập -> Chạy đối chiếu ngược Backward -> Hiển thị badge kết quả. | **TỰ ĐỘNG CLICK ĐÁP ÁN** khi đạt đồng thuận 3/3 (`eligibleForAutoApply: true`). |
| **`Alt + M`** | **Giải nhanh 1 Model (Emergency)** | **1 lượt gọi duy nhất:**<br>• `gemini-3.8-flash` | Quét câu hỏi hiện tại -> Giải nhanh bằng 1 model -> Hiển thị badge góc màn hình và tự copy vào Clipboard. | **KHÔNG TỰ CLICK**. Người dùng tự dán hoặc tự click để đảm bảo an toàn tối đa. |
| **`Alt + Y`** | **Chụp vùng màn hình (Full Vision)** | **4 lượt gọi Model (Vision):**<br>• Vòng giải: `gemini-3.8-flash`, `gemini-2.5-flash`, `gemini-2.5-flash-lite`<br>• Vòng Backward: `gemini-3.6-flash` | Hiện con trỏ chữ thập -> Kéo chuột khoanh trọn vùng câu hỏi có đồ thị, bảng biểu, hình vẽ -> Giải đầy đủ qua AI Vision. | **TỰ ĐỘNG CLICK ĐÁP ÁN** nếu card câu hỏi trên web được nhận diện khớp. |
| **`Alt + U`** | **Chụp vùng màn hình (Fast Vision)** | **1 lượt gọi duy nhất (Vision):**<br>• `gemini-3.8-flash` | Kéo chuột khoanh vùng câu hỏi -> Giải nhanh bằng 1 model Vision -> Hiện badge + copy đáp án. | **KHÔNG TỰ CLICK**. |
| **`Alt + K`** | **Nước rút liên tục (Continuous Solve)** | **1 Model cho mỗi câu:**<br>• `gemini-3.8-flash` | Tự động quét và giải một mạch toàn bộ các câu chưa làm trên bài thi từ trên xuống dưới. | **Tự động click** từng câu với trạng thái unverified. |
| **`Alt + B`** | **Xem Cache (Không tốn API)** | **0 Model** *(Không gọi AI)* | Tra cứu dấu vân tay câu hỏi trong bộ nhớ cache cục bộ -> Hiện badge trong 5 giây và copy đáp án. | **KHÔNG GỌI AI, KHÔNG CLICK DOM**. |
| **`Esc`** | **HỦY TÁC VỤ (CỰC KỲ QUAN TRỌNG)** | **0 Model** *(Gửi lệnh Cancel)* | Ngắt ngay lập tức tác vụ giải đang chạy dở trên ESP32, hủy cờ busy, ngăn đáp án cũ áp vào câu mới. | **Dừng toàn bộ thao tác click**. |

---

### B. Chi tiết luồng hoạt động của các Model theo từng phím

#### 1. Khi bấm `Alt + N` hoặc `Alt + Y` (Chế độ tối đa độ chính xác — 4 Model calls)
Đây là chế độ mạnh nhất của hệ thống, sử dụng quy trình tranh luận đa tác nhân kết hợp kiểm định ngược:
- **Bước 1 — Vòng giải ban đầu (3 Model song song)**:
  - `gemini-3.8-flash`: Model chủ lực, khả năng suy luận ngữ cảnh và hiểu bẫy đề thi sâu nhất.
  - `gemini-2.5-flash`: Model phản hồi nhanh, giải độc lập để đối chiếu chéo.
  - `gemini-2.5-flash-lite`: Model siêu nhẹ, cung cấp góc nhìn thứ ba độc lập.
  - *Yêu cầu:* Cả 3 model phải ra kết quả đồng thuận 3/3 (A = B = C). Nếu có bất đồng, hệ thống chạy tối đa 2 vòng tranh luận (Debate).
- **Bước 2 — Vòng kiểm định ngược (Backward Reasoning - Model thứ 4)**:
  - Model: `gemini-3.6-flash` *(kèm danh sách dự phòng tự động: `gemini-3.7-flash`, `gemini-3.5-flash`, `gemini-2.5-flash`, `gemini-3.1-flash-lite`)*.
  - *Cách thức:* Đóng vai trò "Giám khảo độc lập mù", không nhìn quá trình giải của 3 model trước. Nó chỉ nhận đề bài và đáp án ứng viên, sau đó **suy luận ngược từ đáp án xem có mâu thuẫn với bất kỳ dữ kiện nào của đề hay không**.
  - Chỉ khi Backward trả về trạng thái `MATCHED` (Không phát hiện mâu thuẫn), đáp án mới được gắn cờ `eligibleForAutoApply: true` để **tự động click chọn trên màn hình**.

#### 2. Khi bấm `Alt + M` hoặc `Alt + U` (Chế độ khẩn cấp — 1 Model call)
- Sử dụng duy nhất model **`gemini-3.8-flash`** (được cấu hình qua `DEFAULT_MODEL` / `DETECT_MODEL`).
- Không chạy vòng tranh luận, không chạy kiểm định ngược Backward.
- **Tốc độ:** Phản hồi siêu tốc trong **1 – 2 giây**, thích hợp khi bài thi gần hết giờ hoặc khi bạn muốn tự tay click cho an toàn.

#### 3. Khi bấm `Alt + K` (Chế độ cày cuốc tự động toàn bài)
- Gọi tuần tự model **`gemini-3.8-flash`** cho từng câu hỏi chưa làm trên trang web.
- Tự động điền đáp án dạng unverified và chuyển sang câu tiếp theo.

#### 4. Khi bấm `Alt + B` (Đọc Cache)
- **Hoàn toàn KHÔNG gọi AI**: Không gửi bất kỳ dữ liệu nào qua USB, không tốn 1 xu chi phí API.
- Chỉ đọc file cache `%LOCALAPPDATA%\DetectQuestionBackend\answer-cache.json` hoặc storage trình duyệt để lấy lại đáp án của câu hỏi đã từng giải trước đó.

---

## 6. NGUYÊN TẮC "SỐNG CÒN" CHỐNG LỆCH ĐÁP ÁN

> [!CAUTION] **QUY TẮC: ESC -> CHUYỂN CÂU -> BẤM GIẢI**
> Con ESP32 xử lý tuần tự từng lượt gọi. Nếu câu 2 giải lâu mà bạn sốt ruột cuộn chuột sang câu 3 rồi bấm tiếp:
> 1. Lệnh của câu 3 **bị bỏ qua** vì hệ thống đang bận (`busy`).
> 2. Vài giây sau, đáp án của câu 2 trả về -> Badge hiện chữ của câu 2 dù mắt bạn đang nhìn câu 3!
> 3. **Hậu quả**: Bạn tưởng đó là đáp án câu 3 và bấm theo -> **BỊ ĐÁNH SAI OAN UỔNG**.

**Cách xử lý chuẩn xác 100% khi gặp câu giải lâu:**
- Nếu chờ quá 5–7 giây chưa thấy đáp án: **BẤM PHÍM `Esc`**.
- Sau khi bấm `Esc`, cuộn sang câu mới.
- Bấm `Alt + N` hoặc `Alt + M` để giải câu mới.

---

## 7. MANG SANG MÁY TÍNH MỚI TOANH (PORTABLE WORKFLOW)

Khi đi thi trên máy tính phòng máy của trường:

1. **Chuẩn bị trước ở nhà**:
   - Nén file `release/DetectQuestion.exe` thành file `.zip` (dung lượng chỉ khoảng **20 MB – 25 MB**).
   - Tải lên Google Drive cá nhân, hoặc tạo link rút gọn siêu ngắn (ví dụ: `tinyurl.com/tool-thi`).
2. **Tại phòng máy trường**:
   - Mở trình duyệt, gõ link rút gọn tải file `.zip` về (mất 2–3 giây).
   - Giải nén ra Desktop hoặc thư mục Downloads.
   - Bật phát Wi-Fi điện thoại, cắm chiếc USB ESP32 vào máy.
   - Chờ đèn trên USB **sáng xanh lá cố định**.
   - Mở `DetectQuestion.exe` -> Đăng nhập vào trang thi và làm bài!

*(Máy mới không cần cài Node.js, Python, Git hay driver; Windows 10/11 tự nhận cổng Serial ngay lập tức).*

---

## 8. BẢNG TRA CỨU & XỬ LÝ NHANH LỖI THƯỜNG GẶP

| Hiện tượng | Nguyên nhân | Cách khắc phục |
| :--- | :--- | :--- |
| **Đèn LED nhấp nháy vàng cam mãi không sáng xanh** | Điện thoại chưa bật hotspot 2.4 GHz, hoặc hotspot đang "ngủ gật" do tắt màn hình. | Mở sáng màn hình điện thoại vào đúng mục *Điểm truy cập cá nhân*. Với iPhone, kiểm tra đã gạt bật *"Tối đa hóa khả năng tương thích"* chưa. |
| **Đụng tay vào con chip là bị khởi động lại** | Tĩnh điện hoặc điện dung ngón tay chạm vào nút Reset / thạch anh 40MHz. | Dán băng dính cách điện bọc kín thân bo mạch ESP32. Chỉ cầm vào đầu kim loại USB khi cắm/rút. |
| **Bấm phím tắt không thấy phản hồi gì** | Con trỏ chuột đang nằm ngoài trang web (ví dụ đang click vào thanh URL). | Click chuột trái 1 cái vào khoảng trắng giữa nội dung bài thi rồi bấm lại phím tắt. |
| **Báo lỗi `WIFI_OFFLINE`** | Mất kết nối Wi-Fi giữa ESP32 và điện thoại. | Kiểm tra lại 4G trên điện thoại, đảm bảo đèn LED trên USB đang sáng xanh lá cố định trước khi bấm giải. |
| **Báo lỗi `MODEL_TIMEOUT`** | Mạng 4G chập chờn hoặc API AI phản hồi quá lâu (>60s). | Bấm phím `Esc` để hủy lượt cũ, sau đó bấm lại `Alt + M` hoặc `Alt + N`. |
| **`No supported question detected`** | Khung câu hỏi nằm ngoài vùng hiển thị của màn hình. | Cuộn trang sao cho câu hỏi và các đáp án A, B, C, D nằm trọn trong màn hình. Với câu có giao diện lạ, dùng `Alt + Y` khoanh vùng. |
| **Không mở được cổng COM / `USB_OPEN_FAILED`** | Cổng COM đang bị một chương trình khác chiếm giữ (VS Code monitor, tab terminal cũ). | Đóng các cửa sổ terminal hoặc app cũ đang mở rồi chạy lại `DetectQuestion.exe`. |

---

*Tài liệu được cập nhật và tối ưu đồng bộ với Firmware ESP32 v0.2.4 và Detect Question Portable.*

