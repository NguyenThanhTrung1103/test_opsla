# Shift Handoff Contract — Oops La Book Store

## 1. Trạng thái Ca trực Hiện tại
- **Thời điểm**: 09/11/2026 - 20:30 (GMT+7)
- **Cột mốc**:
  - [x] **Fail-Closed ADMIN_SECRET_KEY & Xóa bỏ Fallback Public Key**:
    - `.github/workflows/deploy.yml`: Thêm bước `Verify required secrets`, dừng build ngay nếu thiếu secret. Xóa fallback key mặc định công khai.
    - `src/worker.ts`: Endpoint `/api/admin/orders` trả về `503 Service Unavailable` nếu thiếu secret; 401 nếu sai Bearer token.
    - `src/server/app.ts`: Xóa bỏ `DEFAULT_SECRET`, chặn server khởi động (`process.exit(1)`) nếu thiếu `ADMIN_SECRET_KEY`.
    - 4 test suites cập nhật sinh khóa ngẫu nhiên trong phiên runtime.
  - [x] **Cô Lập Hoàn Toàn Security Demo Fixtures**:
    - Loại bỏ credential giả lập trong `window.APP_CONFIG` khỏi `oops_la_book_store_uxui_fixed.html`.
    - Di chuyển fixture vào `tests/fixtures/security-demo/` phục vụ positive control của máy quét bảo mật.
    - Bổ sung rào chắn tự động `tests/security-demo-isolation.test.ts`.
  - [x] **Thiết Lập & Nghiệm Thu Security CI/CD Pipeline (GitHub Actions)**:
    - Tạo `.github/workflows/security-ci-validation.yml` chạy trên sự kiện PR và workflow_dispatch với quyền tối thiểu `contents: read`.
    - Bao gồm: `actionlint`, `tests-build` (81 tests + build), `static-guards`, `trivy` (FS scan + positive control), `api-security` (Node & Worker fail-closed), `zap` (OWASP ZAP Baseline DAST trên 127.0.0.1:3900), `summary`.
    - Đã xác thực thực tế trên PR #1 (Run 42624535131): 100% jobs PASS; Job deploy trên `deploy.yml` được SKIPPED an toàn.
  - [x] **Xuất Bản Sơ Đồ Kiến Trúc & Tài Liệu Bàn Giao**:
    - Đã biên dịch sơ đồ pipeline qua `ak-diagram`: `docs/diagrams/pipeline-security-deploy.svg` và `docs/diagrams/pipeline-security-deploy.html`.
    - Đã biên soạn tài liệu bàn giao vận hành: `docs/HANDOFF_PIPELINE_SECURITY_DEPLOY.md`.
  - [x] **Toàn bộ 81 bài test tự động đạt 100% PASS** (20 suites, 0 regressions).


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
