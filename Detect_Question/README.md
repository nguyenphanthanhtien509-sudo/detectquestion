# Question Detect

Chrome Extension Manifest V3 hỗ trợ phát hiện câu hỏi trên trang web, giải bằng AI và tự chọn đáp án trên giao diện. Dự án hỗ trợ câu hỏi trắc nghiệm một lựa chọn, nhóm Đúng/Sai, nội dung Moodle và chế độ giải từ ảnh chụp màn hình.

## Tính năng

- Quét câu hỏi từ Moodle và các cấu trúc HTML phổ biến.
- Gửi cùng câu hỏi tới 3 model Gemini chạy song song:
  - `gemini-3.8-flash`
  - `gemini-2.5-flash`
  - `gemini-2.5-flash-lite`
- Chỉ chấp nhận đáp án khi cả 3 model đồng thuận.
- Nếu có bất đồng, chạy debate/retry tối đa 2 vòng.
- Không tự chọn kết quả chưa đạt consensus.
- Hỗ trợ câu hỏi Đúng/Sai với schema được chuẩn hóa và kiểm tra hợp lệ.
- AI Vision cho vùng câu hỏi được chọn bằng chuột.
- Tự click radio, checkbox, label và các giao diện custom.
- Có thể tự động chuyển sang trang tiếp theo trong chế độ giải liên tục.
- Popup giao diện thông báo nổi ở góc màn hình đã được vô hiệu hóa.

## Kiến trúc

```text
Chrome page
  -> Content script
     -> Scanner -> ConsensusSolverEngine -> Background service worker
                                      -> Key4U API
  -> DomAnswerClicker

Screenshot selection
  -> Background capture solver
     -> 3 Gemini models
     -> unanimous result
     -> Content script -> page controls
```

Các module chính:

- `src/content/scanner/`: phát hiện và chuẩn hóa câu hỏi.
- `src/content/solver/ConsensusSolverEngine.js`: giải độc lập, debate và kiểm tra consensus.
- `src/content/clicker/DomAnswerClicker.js`: chọn đáp án trên trang.
- `src/background/Key4uApiClient.js`: gọi API tương thích OpenAI Chat Completions của Key4U.
- `src/background/StealthCaptureSolver.js`: xử lý chụp ảnh và AI Vision.
- `src/background/index.js`: service worker và message routing.
- `src/config/runtime-config.js`: cấu hình runtime được sinh từ `.env`.

## Yêu cầu

- Google Chrome hoặc Chromium hỗ trợ Manifest V3.
- Node.js 18 trở lên.
- Một API key hợp lệ của Key4U.
- Tài khoản/session học viên hợp lệ nếu backend yêu cầu xác thực.

## Cài đặt phát triển

```powershell
git clone https://github.com/buitanphat247/Question_Detect.git
cd Question_Detect
npm install
Copy-Item .env.example .env
```

Mở `.env` bằng trình soạn thảo và thiết lập các giá trị cần thiết. Không commit file này.

Ví dụ cấu hình tối thiểu:

```env
ENABLE_REASONING=true
REASONING_EFFORT=high
DEFAULT_MODEL=gemini-3.8-flash
CONSENSUS_MODEL=gemini-3.8-flash
DETECT_MODEL=gemini-3.8-flash
KEY4U_API_KEY=your-api-key
```

Đồng bộ cấu hình và build:

```powershell
npm run sync:config
npm run build
```

Lệnh build tạo extension đã obfuscate tại thư mục `dist/`.

## Cài extension vào Chrome

1. Mở `chrome://extensions`.
2. Bật **Developer mode**.
3. Chọn **Load unpacked**.
4. Chọn thư mục `dist/`.
5. Mở popup extension và nhập API key vào cấu hình local nếu chưa có.
6. Reload trang cần xử lý sau khi cài hoặc rebuild extension.

Không load thư mục source thay cho `dist/`; manifest sản phẩm và các file đã build nằm trong `dist/`.

## Cách sử dụng

### Giải một câu

- Nhấn `Alt+H`, hoặc dùng action của extension.
- Extension quét câu hỏi chưa trả lời, gửi tới 3 model và chỉ click khi đạt đồng thuận.

### Giải liên tục

- Nhấn `Alt+K`.
- Extension lần lượt giải các câu chưa trả lời, click đáp án unanimous và chuyển trang nếu có nút tiếp theo.
- Dừng bằng phím tắt dừng trong extension hoặc reload trang.

### Giải từ ảnh

- Nhấn `Alt+Y`.
- Kéo chuột chọn vùng chứa câu hỏi.
- AI Vision xử lý ảnh bằng cùng cơ chế 3 model và chỉ gửi các đáp án unanimous về trang.

### Context menu

Extension cũng đăng ký context menu cho giải một câu, giải liên tục và chụp vùng màn hình.

## Consensus flow

```text
3 models parallel
  -> chuẩn hóa JSON/schema
  -> A = B = C: trả kết quả
  -> bất đồng: debate round song song
  -> vẫn bất đồng: retry tối đa 2 vòng
  -> hết retry: unresolved, không click
```

Đáp án AI phải là JSON hợp lệ. Với trắc nghiệm một lựa chọn:

```json
{"answer":"A"}
```

Với Đúng/Sai:

```json
{"answers":{"A":"Đúng","B":"Sai","C":"Đúng","D":"Sai"}}
```

Không dùng regex để đoán đáp án từ văn bản tự do. Nội dung JSON không hợp lệ hoặc đáp án ngoài schema sẽ bị loại khỏi vòng consensus.

## Bảo mật

- Không đưa API key thật vào source code, `runtime-config.js`, README hoặc Git.
- `.env` đã nằm trong `.gitignore`; chỉ dùng để cấu hình local.
- API key runtime được lấy từ `chrome.storage.local`.
- Nếu key đã từng xuất hiện trong lịch sử Git, hãy revoke và tạo key mới.
- Extension có `host_permissions` rộng để quét trang; chỉ cài bản build từ nguồn đáng tin cậy.

## Kiểm tra chất lượng

```powershell
node --check src/content/solver/ConsensusSolverEngine.js
node --check src/background/StealthCaptureSolver.js
npm run build
git diff --check
```

Hiện dự án chưa có test runner riêng. Có thể kiểm tra parser consensus bằng Node với các module CommonJS tương ứng trước khi build.

## Tài liệu bổ sung

- [Kiến trúc](docs/ARCHITECTURE.md)
- [Cấu hình](docs/CONFIGURATION.md)

## Giấy phép

Chưa khai báo giấy phép mã nguồn mở. Không sử dụng lại hoặc phân phối dự án như một package công khai nếu chưa được chủ dự án cho phép.
