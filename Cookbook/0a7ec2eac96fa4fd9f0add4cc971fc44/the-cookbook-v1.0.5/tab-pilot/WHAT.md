---
summary: tab-pilot là extension Chrome cho phép Claude Code hoặc một kịch bản tự động thao tác trên ChatGPT, Gemini, Substack, LinkedIn, TikTok, Viblo và dev.to bằng chính tài khoản bạn đang đăng nhập.
audience: ["Người đã dùng Claude Code và muốn giao cho agent việc lặp lại trên ChatGPT, Substack, LinkedIn, TikTok", "Người viết nội dung muốn một bài luận đi từ ChatGPT tới Substack và LinkedIn mà không chép tay"]
needs: ["Chrome 116 trở lên", "Node.js 18 trở lên", "Tài khoản Cloudflare (gói miễn phí là đủ)", "Claude Code (hoặc agent nào gọi được MCP / HTTP)", "Tài khoản GitHub nếu muốn cập nhật bằng git (không bắt buộc, có file .zip)"]
lessons: ["b7bac20a-96ff-479b-b4d2-d27b118ff2d6", "a72c4938-1646-4577-a632-d2feb1468100"]
version: 0.4.0
---

## Nó làm gì

Bạn cài extension vào Chrome đang đăng nhập sẵn ChatGPT, Gemini, Substack, LinkedIn, TikTok, Viblo, dev.to. Sau đó Claude Code gọi được các việc như: gửi prompt cho ChatGPT trong một project và lấy kết quả về (chữ, code, ảnh); tạo bản nháp Substack có ảnh rồi xuất bản; đăng bài hoặc article lên LinkedIn rồi bình luận dẫn link; tải video lên TikTok kèm caption; viết, sửa, xuất bản, xoá bài và bình luận trên Viblo; gom số liệu các trang.

Extension mở tab riêng trong một nhóm tab "tab-pilot", làm xong thì tự đóng, không chiếm màn hình bạn đang dùng. Agent không cần mật khẩu hay API key của từng trang, vì nó dùng phiên đăng nhập có sẵn trong Chrome.

## Nó giúp bạn thế nào

Lệnh đi qua một relay nhỏ chạy trên tài khoản Cloudflare của chính bạn, nên agent ở đâu cũng gọi được Chrome ở nhà: một lịch chạy lúc 7 giờ sáng gom số liệu, hoặc bạn nhắn từ điện thoại "đăng video này lên TikTok".

Bạn giữ quyền chốt. Mặc định extension từ chối mọi thao tác đăng công khai cho tới khi bạn tick "Allow publishing" ngay trong Chrome, kể cả khi token bị lộ. Mỗi lệnh được ghi lại 90 ngày để bạn xem agent đã làm gì. Quy trình đăng chéo có bước duyệt: agent chuẩn bị bản Substack và bản LinkedIn, bạn xem rồi mới cho đăng.

## Bạn cần gì

Chrome 116 trở lên, Node.js 18 trở lên, một tài khoản Cloudflare gói miễn phí, và Claude Code. Repo là private: Insider và học viên Ship With Claude, Claude Code Foundation K1, K2 mới mở được bài này.

## Bắt đầu

Nếu không dùng GitHub: bấm "Tải mã nguồn (.zip)", giải nén, mở thư mục đó bằng Claude Code rồi nói: "Đọc README.md và cài tab-pilot cho mình theo phần Cài đặt." Claude sẽ chạy `./scripts/setup.sh` để dựng relay trên Cloudflare của bạn, rồi hướng dẫn bạn nạp extension vào Chrome. Bạn chỉ cần đăng nhập Cloudflare một lần khi trình duyệt mở ra.

Nếu dùng GitHub: nhận lời mời GitHub trong bài, rồi `git clone https://github.com/vibery-studio/tab-pilot.git` và làm như trên. Cập nhật sau này chỉ cần `git pull`.

Cài xong, chạy `./tp health_check` để xem từng trang đã đăng nhập và còn khớp giao diện chưa.

## Có gì mới

0.5.0: thêm Gemini (chat, file, chọn model, mặc định 3.8 Flash Medium) và dev.to (nháp, hẹn giờ, xuất bản, bình luận, hồ sơ, số liệu); Viblo hẹn giờ xuất bản bằng tính năng lên lịch của Viblo; ChatGPT mỗi việc một tab riêng, link chat đúng tab và project, prompt dài gửi thành file; tự đánh thức tab nền bị Chrome tạm dừng.

0.4.0: thêm Viblo: đọc bài và bình luận, tạo bản nháp, sửa, xuất bản, xoá bài, bình luận và trả lời bình luận; tìm bài nổi bật theo toàn trang, theo tag hoặc từ khoá, lọc theo số ngày gần đây.

0.3.0: bản đầu tiên chia sẻ cho thành viên. ChatGPT, Substack, LinkedIn, TikTok; kho file cho video lớn; việc chạy lâu chạy nền; khoá quyền đăng bài; nhật ký 90 ngày.
