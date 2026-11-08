# Bài 8 — Để tdrive chạy việc xây dựng qua đêm

![](img/rail-08.svg)

![](img/d08.svg)

**Bạn đang ở đâu:** Quyết định → Ý định → Công thức → Xây → Tự lái qua đêm → Ship. Bạn đang ở bước Tự lái qua đêm, dành cho môi trường đủ điều kiện.

**Không có Mac hoặc chưa có AgentKit/Buildflow? Bỏ qua bài này, xây thủ công theo bài 6.**

Để tdrive tự xây ứng dụng, kể cả qua đêm, bạn cần [AgentKit](https://go.arealisticdreamer.com/agentkit) hoặc [Buildflow](https://arealisticdreamer.com/ship-with-claude), cùng Claude Code đã đăng nhập, máy Mac và tmux; script preflight sẽ báo nếu thiếu. Với AgentKit, lệnh `ak` cần hoạt động. Nếu đã có AgentKit, bạn cứ để tdrive điều khiển, không cần học cách chạy AgentKit trước.

tdrive hoạt động độc lập, có hoặc không có The Cookbook. Bạn chỉ cần đưa cho tdrive một bản brief đã được duyệt hoặc một dự án đang có, rồi để nó điều khiển AgentKit hoặc Buildflow thực hiện công việc. Nếu bạn dùng The Cookbook, các công thức liên quan đã được tự động đưa vào tài liệu bàn giao để builder sử dụng.

## Mục tiêu

Bạn sẽ xác nhận tdrive đã sẵn sàng, chuẩn bị công việc từ bản ý định được duyệt và bắt đầu một lần xây dựng có thể tiếp tục khi bạn không trực tiếp điều khiển.

## Cài tdrive

`setup.sh` **đã xử lý phần cài đặt tdrive ở Bài 3.**

Nếu máy Mac đủ điều kiện, script đã cài tdrive. Nếu báo cáo ghi `tdrive needs: ...`, hãy đọc dòng `fix:` đi kèm, sửa điều kiện còn thiếu rồi chạy lại `bash setup.sh`.

Xem [Trang cài đặt đầy đủ, Bước 3](https://arealisticdreamer.com/cookbook/install) để biết cách kiểm tra, sửa lỗi và cài lại khi cần.

Bạn không cần chạy một quy trình cài đặt khác nếu tdrive đã sẵn sàng.

## Chuẩn bị và bắt đầu xây

tdrive là công cụ tổ chức những lần xây dựng tự động trên macOS, dựa vào builder và các điều kiện kiểm tra đã chuẩn bị.

Trước khi bắt đầu:

1. **Chuẩn bị công việc:** Dùng kết quả từ bản ý định đã duyệt để chuẩn bị công việc xây dựng.
2. **Kiểm tra builder:** Xác nhận sẽ sử dụng AgentKit hay Buildflow và môi trường đã đủ điều kiện.
3. **Duyệt phạm vi:** Xem lại phần nào được phép xây, điều kiện kiểm tra và cấu hình chạy.
4. **Bắt đầu tdrive:** Làm theo hướng dẫn của bản beta đã cài. Giữ môi trường chạy ở trạng thái phù hợp trong suốt phiên làm việc.
5. **Xem kết quả:** Khi hoàn tất, đọc báo cáo và các kết quả kiểm tra trước khi quyết định bước tiếp theo.

Nếu muốn nhờ Claude chuẩn bị, bạn có thể nói:

```text
Mình muốn chuẩn bị một lần xây dựng bằng tdrive.

Hãy đọc bản ý định đã được duyệt và hướng dẫn
tdrive của bản beta đang cài.

Giúp mình kiểm tra builder, phạm vi công việc,
điều kiện kiểm tra và những quyền sẽ được sử dụng.

Nếu còn điều kiện chưa đạt, hãy giải thích và
đề xuất cách xử lý an toàn.

Chưa bắt đầu chạy cho đến khi mình duyệt.
```

Bạn cần xác nhận phạm vi công việc và những quyền mà runner được sử dụng.

**Lưu ý an toàn:** Chỉ chạy công việc đã được duyệt. Những thao tác liên quan đến thanh toán thật, dữ liệu cá nhân, thông tin bí mật, xóa dữ liệu hoặc triển khai production phải được xác nhận riêng.

Việc để tdrive chạy không có nghĩa là cho phép tự triển khai ứng dụng lên môi trường thật.

## Kiểm tra đã xong

Preflight báo đủ điều kiện, tdrive tiếp nhận công việc và bắt đầu chạy.

Khi hoàn tất, bạn có thể xem báo cáo cùng những kết quả kiểm tra được ghi lại.

Nếu môi trường chưa phù hợp, việc chuyển sang xây thủ công cũng là kết quả hợp lệ.

## Bị kẹt?

Nếu gặp `tdrive needs: ...`, làm theo dòng `fix:` và xem [Trang cài đặt đầy đủ, Bước 3](https://arealisticdreamer.com/cookbook/install).

Nếu gặp lỗi trong lúc chuẩn bị hoặc chạy, bạn có thể gửi Claude:

```text
Đây là kết quả preflight hoặc lỗi tdrive của mình. Hãy giải thích điều kiện nào chưa đạt, cách sửa an toàn nếu được hỗ trợ, và khi nào nên chuyển sang chạy thủ công. Đừng bỏ qua lỗi để cố chạy.
```

Nếu vẫn chưa xử lý được, hỏi trong Discord **#cookbook**. Không gửi token, file `.env` hoặc thông tin đăng nhập.

**Bước tiếp theo:** [Bài 9: Kiểm tra, sửa lỗi và đưa ứng dụng đến người dùng](09-kiem-tra-va-ship.md). Nếu đã bỏ qua tdrive, dùng kết quả xây thủ công ở Bài 6 để tiếp tục.
