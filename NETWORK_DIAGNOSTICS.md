# Chẩn đoán yêu cầu AI qua ESP

Bản mã nguồn này bổ sung số đo, chưa thay đổi timeout HTTP, tự gửi lại POST,
chính sách giữ kết nối hoặc giao diện. Cần nạp firmware mới và chạy backend mới
để thu thập đầy đủ số đo; bản exe cũ chưa có phần xử lý này.

Trong log `request.completed`, xem `provenance[].providerDiagnostics.gateway`:

- `httpCode`: mã HTTP dương hoặc mã lỗi HTTPClient âm, giữ nguyên giá trị gốc.
- `tlsCode`: mã TLS nếu có; bằng 0 không chứng minh toàn bộ đường mạng bình thường.
- `dnsMs`: thời gian phân giải DNS của lượt hiện tại.
- `connectMs`: TCP và TLS gộp chung, không bao gồm DNS. Không phải số đo TLS riêng.
- `postAndHeadersMs`: toàn bộ lời gọi gửi POST và chờ HTTP header, bao gồm kết nối
  mới nếu cần. Không cộng số này với `dnsMs` và `connectMs` để tính tổng.
- `bodyMs`, `bodyResult`: thời gian và kết quả đọc HTTP body.
- `networkMs`: thời gian worker đến lúc tạo thông tin chẩn đoán; chưa gồm gửi
  khung kết thúc USB và dọn dẹp cuối cùng.
- `reusedConnection`, `idleMs`: kết nối đã được coi là còn mở trước yêu cầu và
  khoảng thời gian từ lần kết thúc phiên thành công trước. Đây không phải bằng
  chứng server vẫn giữ kết nối hoạt động.
- `heapBefore`, `freeHeap`, `largestHeapBlock`: bộ nhớ tại các điểm đo, không
  phải mức thấp nhất trong toàn bộ lời gọi.
- `cancelDrainMs`: thời gian từ lúc firmware nhận lệnh hủy đến thời điểm đo.
  Khi PC đã hủy và không còn chờ khung lỗi, đọc `status.lastCancelDrainMs` sau
  khi `busy=false` để xem thời gian dọn worker gần nhất. Chưa đo thời gian USB
  từ lúc PC phát lệnh hủy tới lúc firmware nhận lệnh.

Thông tin được lọc theo danh sách trường số/boolean; không ghi cấu hình, API
key, mật khẩu, URL hay nội dung phản hồi lỗi từ server vào phần chẩn đoán này.
Firmware cũ vẫn được hỗ trợ nhưng không cung cấp các số đo mới.

Đối chiếu cùng request ID và model để phân biệt lỗi mạng, thời gian xếp hàng
(`queueWaitMs`) và thời gian xử lý từ phía PC (`serviceMs`). Cần thu thập số đo
trên phần cứng trước khi kết luận nguyên nhân hoặc đổi timeout/keep-alive.
