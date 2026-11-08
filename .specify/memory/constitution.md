# Project Constitution — Oops La Book Store

## 1. Tri-Pillar Architecture & Governance

Mọi tác vụ kỹ thuật và phát triển trong repository này đều phải tuân thủ nghiêm ngặt **Bộ Ba Trụ Cột (The Tri-Pillar Architecture)**:

| Trụ cột | Công cụ / Cấu trúc | Vai trò | Trách nhiệm chính |
| :--- | :--- | :--- | :--- |
| **1. Specification (WHAT & WHY)** | **Spec Kit** (`.specify/`) | Nguồn sự thật duy nhất (SSOT) | Quản lý Hiến pháp (`constitution.md`), Đặc tả (`spec.md`), Kế hoạch (`plan.md`), Danh sách việc (`tasks.md`). |
| **2. Governance & Proof** | **Repository Harness** (`scripts/bin/harness.exe`) | Cổng kiểm soát & Bằng chứng | Kiểm soát phân luồng rủi ro, bằng chứng hành vi (`TEST_MATRIX.md`), lưu vết quyết định (`Journal.md`), bàn giao ca trực (`handoff.md`). |
| **3. Zero-Trust Execution** | **g8s Gatekeeper** (`g8s`) | Rào chắn bảo vệ & kiểm định | Cách ly thực thi (Worktree/Receipt), kiểm tra bẫy TDD (`--tdd-trap-check`), soát 11 Anti-Patterns (`--anti-pattern-catalog`). |

---

## 2. Specification-Driven Development (SDD) & SSOT

1. **Thứ bậc quyền lực tài liệu (SSOT Hierarchy)**:
   - Cấp 1: Hiến pháp dự án (`.specify/memory/constitution.md` & `AGENTS.md`)
   - Cấp 2: Yêu cầu nghiệp vụ cơ sở (`Oops_La_Book_Store_BRD_Final_v2.md` - BRD-OLS-002)
   - Cấp 3: Tài liệu thiết kế & kế hoạch kỹ thuật (`docs/plans/`, `docs/decisions/`, `.specify/`)
   - Cấp 4: Mã nguồn và test implementation
2. **Không tự suy diễn phạm vi (Zero Scope Drift)**:
   - Tuyệt đối không tự ý thêm các tính năng ngoài MVP (ví dụ: không thêm thanh toán online tự động, không cổng ERP/CRM, không tích hợp Messenger bot khi chưa được quy định trong BRD).
   - Nếu phát hiện điểm mở (open item), dừng lại và yêu cầu làm rõ trước khi khóa logic.

---

## 3. Test-Driven Development (TDD) & Anti-Trap Rules

1. **Quy tắc Red-Green-Refactor**:
   - Viết test kiểm tra hành vi (behavior) trước khi viết code triển khai.
   - Test phải thất bại có lý do trước khi mã nguồn được viết.
2. **Chống bẫy TDD (Zero TDD Traps)**:
   - Cấm viết test pass ảo (fake-pass) hoặc test gắn chặt vào symbol chưa định nghĩa (`test_pins_fabricated_symbol`).
   - Cấm viết test can thiệp vào chi tiết cài đặt bên trong (`test_locks_impl_detail`).
   - Mọi thay đổi phải vượt qua kiểm định `g8s doctor --tdd-trap-check`.

---

## 4. Separation of Concerns (SoC) & Clean Architecture

1. **Ranh giới Domain & Lớp tách biệt**:
   - **Storefront (Khách hàng)**: Độc lập với CMS nội bộ. Khách chỉ xem editorial và gửi yêu cầu mua, không được can thiệp vào kho hay trạng thái đơn hàng.
   - **CMS (Nội bộ)**: Quản lý sách, ảnh, bài viết, tồn kho và danh sách đơn hàng. Phân quyền chặt chẽ giữa Owner và Staff.
   - **Data Access & Business Logic**: Logic tính toán tồn kho, trạng thái đơn phải nằm ở domain layer / service layer, không nhúng bừa bãi vào giao diện (UI) hoặc controller.
2. **Chính sách phân quyền bất biến**:
   - Nhân viên (`Staff`): Cập nhật tồn sau bán Facebook, xử lý đơn sơ bộ; **tuyệt đối không được chuyển đơn thành `CONFIRMED`**.
   - Chủ cửa hàng (`Owner`): Duy nhất có quyền chuyển đơn thành `CONFIRMED` sau khi xác minh chuyển khoản/đặt cọc thực tế.

---

## 5. Zero-Trust & 11 Anti-Patterns của g8s

Mọi code đóng góp phải tuân thủ 11 nguyên tắc kiểm soát chất lượng từ `g8s doctor --anti-pattern-catalog`:
1. `no_panic`: Cấm gọi `panic` không kiểm soát trong mã nguồn sản phẩm.
2. `no_ignored_errors`: Cấm nuốt lỗi âm thầm (bỏ qua error mà không xử lý hoặc log).
3. `no_type_assertion_in_library`: Kiểm tra an toàn trước khi ép kiểu.
4. `todo_owner`: Mọi ghi chú TODO phải có ngữ cảnh hoặc người phụ trách rõ ràng.
5. `no_ai_artifacts`: Không để lại file rác, file tạm, file backup ngoài cấu trúc quy chuẩn.
6. `test_pins_fabricated_symbol`: Không được bịa đặt symbol trong test case.
7. `test_locks_impl_detail`: Test hành vi API/Domain thay vì bám vào biến nội bộ.
8. `supervisor_thinks`: Rõ ràng minh bạch trong prompt và chỉ thị.
9. `directive_brief`: Yêu cầu thực thi phải cụ thể, có thể kiểm chứng được.
10. `missing_dual_blind`: Đảm bảo kiểm tra chéo khách quan khi nghiệm thu.
11. `no_local_path_leak`: Không hardcode đường dẫn tuyệt đối hoặc IP cục bộ vào mã nguồn.

---

## 6. AI Memory Layer Protocol

1. **Lưu vết quyết định (WHY)**: Mọi quyết định kiến trúc, thay đổi logic hoặc thỏa hiệp kỹ thuật phải được ghi vào `docs/ai-memory/Journal.md`.
2. **Bàn giao ca trực (Handoff)**: Cuối mỗi phiên làm việc hoặc trước khi đổi ngữ cảnh, cập nhật trạng thái, rủi ro tồn đọng và bước tiếp theo vào `docs/ai-memory/handoff.md`.
3. **Bằng chứng kiểm thử**: Cập nhật ma trận kiểm thử tại `docs/TEST_MATRIX.md` để chứng minh hành vi trước khi đóng task.

