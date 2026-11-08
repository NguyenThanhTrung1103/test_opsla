# Oops La Book Store — Claude Design System Preview

Bộ giao diện thiết kế lại (Redesign Mockup) cho nền tảng thương mại chuyên khảo kiến trúc **Oops La Book Store**, lấy cảm hứng từ phong cách tinh tế, chuẩn xác và hiện đại của **Claude Code / Claude Design**.

---

## 1. Cấu Trúc Thư Mục `design-preview/`

- **`index.html`**: Giao diện Storefront hoàn chỉnh cho khách hàng & nhà sưu tầm kiến trúc:
  - Hero Showcase tương tác (chuyển đổi bìa áo Dust Jacket, bìa vải xanh Cerulean Cloth, và bản vẽ mặt cắt tỷ lệ 1:20).
  - Thanh tìm kiếm tức thời kiểu Command Bar (`⌘K`).
  - Thư mục chuyên khảo với bộ lọc phân loại (Monograph, Technical Drawings, Urban Theory, Sumo Edition) & kích thước (Standard vs SUMO).
  - Trình đọc lật trang theo trục dọc liên tục (**Continuous Vertical Viewer**) với kính lúp tỷ lệ 1:20 (**Blueprint ZoomLens**).
  - Túi ấn phẩm sưu tầm (**Shopping Bag Drawer**) với tính toán tổng tiền VNĐ chuẩn xác.
  - Hộp thoại gửi yêu cầu sưu tầm với bộ lọc regex số điện thoại Việt Nam.
  - Hộp thoại xuất mã **Facebook Messenger** 1-click clipboard tiện lợi.
- **`dashboard.html`**: Giao diện quản trị vận hành (**Admin CMS Console**):
  - Bộ chuyển đổi vai trò trực tiếp (**Dual-Role Switcher**): `OWNER` vs `STAFF` để kiểm thử cơ chế bảo vệ bất biến phân quyền **AC-11** (chỉ Owner được duyệt chốt & trừ kho) và **OD-01** (Staff không thể hủy đơn đã duyệt).
  - Bảng chỉ số điều hành (Doanh thu đã chốt, Đơn chờ liên hệ, Cảnh báo quá 48 giờ, Ấn bản sắp hết).
  - Bảng quản lý quy trình đơn hàng với thẻ cảnh báo **Quá 48H**.
  - Bảng điều chỉnh kho ấn bản tức thời.
- **`components.html`**: Sổ tay quy chuẩn thành phần (**Design System Specimen Book**):
  - Bảng mẫu mã màu (Color Tokens) đã được kiểm định toán học.
  - Phân cấp kiểu chữ (Cormorant Garamond + Inter + JetBrains Mono).
  - Các biến thể nút bấm, ô nhập liệu và huy hiệu trạng thái (In Stock, One Copy Left, Sold Out, Stale 48h).
- **`styles.css`**: CSS variables, tokens và lớp tiện ích Claude Design.
- **`preview.js`**: Bộ điều khiển tương tác mô phỏng toàn diện logic nghiệp vụ.
- **`tweaks-panel.js`**: Bảng điều khiển vi chỉnh trực tiếp (Dark/Light mode, Accent color, Corner Radius).

---

## 2. Cách Xem Bản Thiết Kế Trực Quan

### Cách 1: Mở trực tiếp bằng Trình Duyệt Web (Edge / Chrome / Brave)
Vì tất cả các file HTML được thiết kế hoàn toàn khép kín và hỗ trợ tải cục bộ, bạn có thể mở trực tiếp:
- `D:/VibeCode/Oops La Bookstore/design-preview/index.html`
- `D:/VibeCode/Oops La Bookstore/design-preview/dashboard.html`
- `D:/VibeCode/Oops La Bookstore/design-preview/components.html`

### Cách 2: Chạy Preview Server của Universal Design (Port 4780)
Chạy lệnh Node.js sau từ thư mục gốc dự án:
```bash
node "C:\Users\nguyen.thanh-trung9\.gemini\config\skills\universal-design\scripts\serve.mjs" --dir design-preview --port 4780
```
Sau đó truy cập: [http://localhost:4780](http://localhost:4780)

---

## 3. Cổng Phê Duyệt (Review Gate)

Theo quy định nghiêm ngặt của quy trình:
- **Hiện tại đang ở Phase D — Review Gate**.
- **Không có bất kỳ file mã nguồn nào của ứng dụng thực tế bị thay đổi.**
- Chỉ khi nhận được xác nhận: **`APPROVED — IMPLEMENT UI`**, tiến trình mới bước vào Phase E để áp dụng thiết kế vào ứng dụng chính.
