# Execution Plan: Fix Production Readiness & Security Hardening

Date: 2026-11-07
Status: Completed
Authority: `docs/production-readiness-review-2026-11-07.md`, `Oops_La_Book_Store_BRD_Final_v2.md`, `INTENT.md`, `AGENTS.md`

## 1. Mục Tiêu Tối Thượng (Outcome)
Khắc phục triệt để toàn bộ 13 phát hiện (R01–R13) từ bản review ngày 07/11/2026 cùng 5 tử huyệt bảo mật/kiến trúc được phát hiện, bảo đảm nền tảng Oops La Book Store đạt chuẩn sản xuất (Production-Ready) với dữ liệu bền vững, phân quyền nghiêm ngặt, bảo vệ kho hàng nguyên tử và bộ kiểm thử thực chứng toàn diện (loại bỏ hoàn toàn bẫy TDD Trap).

---

## 2. Danh Mục Các Hạng Mục Đã Giải Quyết

### Trận 1: Cố Bản Triệt Nguyên (Lưu Trữ Bền Vững & An Ninh Biên Giới)
- [x] **R02**: Chuyển đổi `src/storage/indexed-db.ts` sang cơ chế lưu trữ bền vững (Persistent JSON File Store) trên Node.js server (zero-dependency), bảo toàn dữ liệu qua restart.
- [x] **R05 & Security**: Vá phân quyền tại `src/server/app.ts`:
  - Loại bỏ hoàn toàn việc fallback `STAFF` khi thiếu auth token.
  - Áp dụng nguyên tắc Fail-Closed cho `ADMIN_SECRET_KEY`.
  - Khắc phục lỗ hổng Path Traversal / Arbitrary File Read tại endpoint static files.
  - Ngăn chặn IP Spoofing qua `x-forwarded-for`.
  - Bổ sung dọn rác TTL cho in-memory rate limiter để chống Memory Leak.
- [x] **R06**: Kiểm soát chặt chẽ payload `POST /api/orders` tại boundary:
  - Kiểm tra `quantity` là số nguyên dương $> 0$.
  - Xác thực `bookId` tồn tại trong kho.
  - Lấy giá sách trực tiếp từ server catalog, vô hiệu hóa giá do client gửi lên.
- [x] **R11**: Triệt tiêu rủi ro XSS: Áp dụng `escapeHtml` cho `SearchAndFilter.ts` và toàn bộ các thành phần hiển thị.

### Trận 2: Thiết Lập Kỷ Cương (State Machine & Toàn Vẹn Kho Hàng)
- [x] **R01**: Bổ sung `confirmOrder` và `cancelOrder` vào `src/services/orderService.ts` khớp contract của `app.ts`.
- [x] **R07 & R08**: Củng cố máy trạng thái (Order Finite State Machine):
  - Kiểm tra tổng lượng tồn của từng sách trước khi duyệt.
  - Trừ kho nguyên tử và đánh dấu `stockDeducted: true`.
  - Cấm chuyển ngược từ `CONFIRMED` về trạng thái trước để trừ kho lặp lại hoặc lách quyền hủy của Owner.
  - Khóa vĩnh viễn đơn hàng ở trạng thái `CANCELLED` (Terminal state).
- [x] **R12**: Cập nhật `src/types/domain.ts`: Hỗ trợ `priceVND: number | null` (chờ định giá), `stockDeducted`, và cờ xuất bản `isPublished`.

### Trận 3: Hợp Nhất Tiền Đồn & Hậu Phương (CMS, Viewer & Frontend Artifact)
- [x] **R09**: Bổ sung các API vận hành cốt lõi trong `src/server/app.ts`:
  - `GET /api/admin/orders` (danh sách đơn hàng cho CMS).
  - `GET /api/admin/orders/:id` (chi tiết đơn hàng).
  - `POST /api/admin/orders/:id/status` (chuyển trạng thái sang CONTACTED / CANCELLED / CONFIRMED).
  - `POST /api/admin/stock` (điều chỉnh tồn kho thủ công khi bán ngoài quầy).
- [x] **R03**: Tạo entrypoint `dist/index.html` và tập lệnh `npm run build` trong `package.json`.
- [x] **R04**: Nối luồng gửi đơn thật giữa Storefront và Backend:
  - Cập nhật form đặt sách gọi `POST /api/orders`.
  - Đồng nhất mã đơn `OLS-xxxxxx` và tiền tệ VNĐ.
  - Loại bỏ hoàn toàn mô phỏng `isSimulatedDemo` và `localStorage`.
- [x] **R10**: Cập nhật `src/components/viewer/VerticalSpreadViewer.ts` render chi tiết bản vẽ kỹ thuật SVG 1:20 sắc nét.

### Trận 4: Diễu Binh Thực Chứng & Chuẩn Hóa Triển Khai (Verification & Runbook)
- [x] **R13**: Sửa đổi `deploy/README.md` và `deploy/nginx.conf`: Phân tách bước Nginx HTTP bootstrap và kích hoạt SSL Certbot để `nginx -t` không lỗi.
- [x] **TDD Trap Elimination**:
  - Viết bài test tích cực (Positive Tests): Duyệt đơn thành công với Bearer token hợp lệ, trừ kho thật, kiểm tra tính bền vững sau giả lập restart.
  - Viết bài test chống race condition / tranh chấp tồn cuốn cuối cùng.
  - Viết bài test kiểm định phân quyền API quản trị (Guest bị từ chối 401/403).
- [x] **Chạy toàn bộ test suite (`ak:test optimize --ultra`)**: 63/63 tests PASS (100%).
- [x] **Cập nhật AI Memory (`Journal.md` & `handoff.md`)**.
