# Bài 9 — Kiểm tra, sửa lỗi và đưa ứng dụng đến người dùng

![](img/rail-09.svg)

![](img/d09.svg)

**Bạn đang ở đâu:** Quyết định → Ý định → Công thức → Xây → Tự lái qua đêm → Ship. Bạn đang ở bước Ship, chuẩn bị đưa phiên bản đầu tiên ra sử dụng.

## Mục tiêu

Bạn sẽ biết phần nào của ứng dụng đã đạt, sửa những lỗi quan trọng còn lại và đưa một phiên bản đủ an toàn cho người dùng đầu tiên thử nghiệm.

## Cách 1 — Nhờ AI làm

Mở Claude Code hoặc công cụ AI đã dùng để xây ứng dụng.

Nếu bạn chạy tdrive, hãy cung cấp báo cáo buổi sáng và dấu vết những lần chạy (run traces) nếu có. Nếu xây thủ công, dùng kết quả build và kiểm thử hiện tại.

Dán:

```text
Hãy đọc báo cáo buổi sáng và các tdrive run traces nếu có.

Nếu không có tdrive, hãy dùng kết quả build và kiểm thử hiện tại.

Đối chiếu ứng dụng với bản ý định đã duyệt và những recipe liên quan.

Hãy phân loại:
1. Phần đã hoàn thành và được kiểm tra
2. Phần đã làm nhưng chưa kiểm tra
3. Phần chưa hoàn thành
4. Lỗi còn tồn tại
5. Việc mình cần làm trước khi ship

Sau đó lập checklist nghiệm thu, các điểm chưa an toàn và các bước đưa bản đầu tiên cho người dùng thử.

Không tự triển khai lên production hoặc dùng dữ liệu thật khi chưa được mình duyệt.
Đừng gọi là hoàn thành nếu chưa có bằng chứng.
```

AI có thể đọc báo cáo, kiểm tra dự án và đề xuất sửa lỗi khi được cấp quyền. Bạn vẫn phải duyệt việc sử dụng dữ liệu thật, cấu hình triển khai và việc cho người dùng truy cập.

## Cách 2 — Tự làm từng bước

1. Mở báo cáo lần chạy gần nhất, nếu có.
2. Chia công việc thành bốn nhóm: đã đạt, chưa kiểm tra, chưa làm, có lỗi.
3. Xem kết quả kiểm thử và run traces nếu có. Không mặc định mọi dòng "success" đều đồng nghĩa ứng dụng đạt yêu cầu.
4. So sánh từng kết quả với bản ý định và điều kiện nghiệm thu.
5. Sửa lỗi ảnh hưởng đến luồng chính, quyền truy cập và tính đúng đắn của dữ liệu.
6. Kiểm tra các tình huống lỗi, bao gồm thao tác trùng, dữ liệu thiếu, quyền không hợp lệ và kết nối thất bại.
7. Rà soát cấu hình production, thông tin bí mật, quyền truy cập và dữ liệu cá nhân.
8. Duyệt việc triển khai hoặc chia sẻ bản thử nghiệm an toàn.
9. Mời một người dùng thật thực hiện luồng chính và ghi nhận phản hồi.

## Kiểm tra đã xong

Một người dùng có thể truy cập phiên bản bạn chia sẻ, thực hiện luồng đã hứa và nhận đúng kết quả.

Các lỗi còn mở được ghi rõ, có mức độ ưu tiên và không còn lỗi nghiêm trọng đã biết làm cho luồng chính hoặc dữ liệu không an toàn.

Nếu chưa đạt, bạn có thể tiếp tục sửa hoặc chạy lại. Không cần mở rộng tính năng để gọi phiên bản này là hoàn chỉnh.

## Bị kẹt?

```text
Đây là kết quả nghiệm thu hiện tại. Hãy phân loại lỗi theo mức ảnh hưởng, chỉ ra những lỗi bắt buộc sửa trước khi đưa cho người dùng, rồi đề xuất thứ tự sửa ít rủi ro nhất. Với mỗi lỗi, cho mình một cách kiểm tra lại.
```

Hoặc hỏi trong kênh Discord #cookbook.

**Bước tiếp theo:** [Bài 10: Cập nhật và nhận hỗ trợ](10-cap-nhat-va-ho-tro.md).
