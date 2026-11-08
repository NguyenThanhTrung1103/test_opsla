# Shift Handoff Contract — Oops La Book Store

## 1. Trạng thái Ca trực Hiện tại
- **Thời điểm**: 07/11/2026 - 15:25 (GMT+7)
- **Cột mốc**:
  - [x] **Khắc phục triệt để 13 phát hiện R01–R13 & 5 Tử Huyệt An Ninh Cấp Production**:
    - Dữ liệu bền vững `OopsLaDB` trên Node.js server.
    - Contract `confirmOrder`, `cancelOrder`, API quản trị CMS (`orders`, `status`, `stock`).
    - Build artifact `dist/index.html` và loại bỏ mô phỏng `isSimulatedDemo`.
  - [x] **Hoàn thành Cooking Đột Phá 6 Điểm Nghẽn Concurrency & Integration (V01–V06)**:
    - **V01**: Async Mutex Lock bảo vệ tồn kho khi 2 request cùng tranh cuốn cuối cùng.
    - **V02**: Fail-Closed Persistence: ném lỗi và rollback bộ nhớ khi ghi file thất bại.
    - **V03**: Runtime Allowlist cho Order Status (`PENDING_CONTACT`, `CONTACTED`, `CONFIRMED`, `CANCELLED`).
    - **V04**: Catalog ID Aliases tự động ánh xạ mã mockup sang mã backend.
    - **V05**: CSP Headers đồng bộ cho phép CDN Tailwind/Lucide/Google Fonts.
    - **V06**: Storefront không nuốt lỗi mạng, bảo toàn giỏ hàng của khách.
  - [x] **Toàn bộ 68 bài test tự động đạt 100% PASS** (17 suites, Zero Regression).
  - [x] **Tri-Pillar Verification (Spec Kit + Harness + g8s Gatekeeper)**: 100% HEALTHY / PASS.
  - [x] **Hoàn tất Premium UX/UI Redesign (Claude Design System)**:
    - **Visual Mockups**: Bộ mockup trực quan hoàn chỉnh trong `design-preview/` (`index.html`, `dashboard.html`, `components.html`, `styles.css`, `preview.js`, `tweaks-panel.js`).
    - **Production UI**: Đã áp dụng bảng màu ấm (*Warm Paper `#FAF9F5`*, *Charcoal `#1C1917`*, *Terracotta `#C2410C`*), mở khóa hệ bán kính bo cong thanh lịch thay thế `border-radius: 0px !important`, cập nhật bóng đổ sách vật lý tự nhiên.
    - **Bảo toàn 100% logic nghiệp vụ**: Toàn bộ luồng đặt hàng, xác thực số điện thoại Việt Nam, xuất Messenger, phân quyền kép Owner vs Staff (AC-11, OD-01, BD-04) và tiền tệ VNĐ (CURR-01) hoạt động hoàn hảo.
    - **Đồng bộ Build**: Đã chạy `npm run build` cập nhật `dist/index.html`.


## 2. Kỹ Năng Đã Sử Dụng (Tools & Frameworks Record)
- **Claudekit / AgentKit Skills**:
  - `/ak:cook`: Quản trị vòng đời triển khai tính năng theo chuẩn Smart Feature Implementation.
  - `/ak:scenario`: Phân rã 12 chiều không gian tìm kiếm kịch bản biên và rủi ro cạnh tranh.
  - `/ak:test`: Kiểm thử tự động end-to-end, smoke test và regression testing.
  - `/ak:code-review`: Đánh giá chất lượng mã nguồn độc lập.
  - `/ak:security`: Quét an ninh STRIDE + OWASP và gia cố bảo mật.
- **Spec Kit & Repository Harness**:
  - **Spec Kit**: Khóa ranh giới Global Constitution v3.1 (`.specify/memory/constitution.md`) và Model Routing.
  - **Repository Harness**: Quản trị vòng đời kế hoạch qua `docs/plans/`, lưu trữ bền vững `harness.db`.
  - **g8s Gatekeeper**: Kiểm định Zero-Trust cơ học (`g8s doctor`, 11 Anti-patterns catalog, TDD Trap check).

## 3. Các Tập Lệnh Vận Hành Cốt Lõi
- Chạy toàn bộ test suite: `npm test`
- Build frontend artifact: `npm run build`
- Khởi chạy server production: `npm run start`
- Kiểm tra bộ ba trụ cột: `npm run check-tri-pillar`
