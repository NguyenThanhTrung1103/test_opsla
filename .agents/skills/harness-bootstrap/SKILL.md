---
name: ak:harness-bootstrap
description: "Bản Full All-in-One: Tự động nạp Global Constitution v3.1 và Model Routing (Gemini Flash 3.8 / Claude Opus 5.5), khởi tạo Spec Kit (.specify/), cài đặt Repository Harness, tạo SQLite harness.db, áp dụng Hiến pháp và đồng bộ AI Memory."
user-invocable: true
when_to_use: "Kích hoạt ở đầu phiên làm việc hoặc khi mở bất kỳ dự án mới nào để nạp Global Constitution, áp dụng Model Routing, cấu hình Spec Kit + Harness + AI Memory mà không cần cài đặt thủ công."
category: governance
keywords: [harness, bootstrap, install, specify, speckit, constitution, model-routing, gemini-flash, claude-opus, memory]
license: MIT
argument-hint: "[--verify-only|--force-refresh]"
metadata:
  author: agentkit
  version: "2.1.0"
---

# Harness Bootstrap Skill (Bản Full All-in-One — v2.1.0)

Skill này là **Bản Full toàn diện** gói gọn toàn bộ quy trình thiết lập hệ sinh thái quản trị cho mọi dự án: thay thế hoàn toàn cơ chế `AGENTS.md` cũ bằng **Global Constitution v3.1 (Luật tối cao)** và **Model Routing Rules (Phân vai Gemini Flash / Claude Opus)**, kết hợp cùng **Spec Kit**, **Repository Harness** và **AI Memory**.

---

## 1. Nguồn Dữ Liệu Nền Tảng (Source of Truth Thay Thế Cho AGENTS.md Cũ)

Mỗi lần kích hoạt trong bất kỳ dự án nào, Skill **bắt buộc đọc và áp dụng trực tiếp** từ 2 file nguồn chính thức sau đây, **thay thế hoàn toàn bản AGENTS.md cũ sẵn có**:

1. **Global Constitution — Single Source of Truth (SSOT)**:
   - Đường dẫn chuẩn: `D:\VibeCode\Clone\spec-kit-main\AGENTS-v3.1-global.md`
   - Thay thế toàn bộ luật cũ; là nguồn luật quản trị tối cao, bất biến và độc lập với công nghệ.
2. **Model Routing Rules — Phân Vai Model Antigravity**:
   - Đường dẫn chuẩn: `D:\VibeCode\Clone\spec-kit-main\AGENTS-ANTIGRAVITY_MODEL_ROUTING_FINAL_v1.1.md`
   - Quy tắc chỉ định model cho Coding Worker (Gemini Flash) và Reviewer (Claude Opus).

> ⚠️ **Fail-Fast Policy**: Trước khi tiến hành bất kỳ tác vụ nào, kiểm tra cả 2 file trên phải tồn tại và đọc được. Nếu thiếu hoặc lỗi đọc, **dừng ngay lập tức** và báo lỗi `CRITICAL_ERROR: Missing Foundation File`. Không được âm thầm sử dụng bản cũ hoặc fallback tự tiện.

---

## 2. Phân Cấp & Thứ Tự Nạp Tài Liệu (6-Tier Authority Hierarchy)

Khi xử lý chỉ dẫn hoặc phát sinh xung đột, tuân thủ nghiêm ngặt thứ tự ưu tiên:
1. **Quy tắc an toàn & quyền phê duyệt (Safety & Approval Gates)**: Lệnh dừng, ranh giới quyền lực.
2. **Chỉ dẫn trực tiếp của người dùng**: Yêu cầu cụ thể trong phiên làm việc hợp lệ.
3. **Global Constitution (`AGENTS-v3.1-global.md`)**: Hiến pháp quản trị tối cao (SSOT thay thế).
4. **Model Routing Rules (`AGENTS-ANTIGRAVITY_MODEL_ROUTING_FINAL_v1.1.md`)**: Phân vai model (ưu tiên khi chọn model, không vượt quyền Constitution).
5. **Project-specific Rules**: `docs/PROJECT_RULES.md`, `AGENTS.md` cục bộ, `.specify/memory/constitution.md`, BRD dự án.
6. **Quy trình nội bộ của Harness Skill**.

---

## 3. Quy Tắc Model Routing Bắt Buộc Trên Google Antigravity

| Vai trò / Giai đoạn | Model chỉ định | Trách nhiệm & Quyền hạn |
| :--- | :--- | :--- |
| **Coding Worker** | **Gemini Flash 3.8** | Viết code, sửa bug, refactor, triển khai thay đổi đã duyệt, chạy test RED/GREEN trong chu trình TDD. |
| **Review / Verification** | **Claude Opus 5.5 (Thinking)** | **Mặc định Read-only**. Review diff, kiểm tra kiến trúc/bảo mật, edge cases, đánh giá kết quả test, thẩm định độc lập PASS/FAIL. Không tự sửa code. |

### Giao thức Bàn giao Thủ công (Manual Model Handoff):
Google Antigravity trên Windows không hỗ trợ tự động switch model giữa turn. Do đó:
1. Khi **Coding Worker (Gemini Flash)** hoàn tất code và test sơ bộ, Agent **phải dừng lại**.
2. Xuất thông báo `MODEL_SWITCH_REQUIRED` kèm **Review Packet**:
   - Danh sách file thay đổi & tóm tắt diff.
   - Lệnh kiểm thử đã chạy & kết quả test.
   - Checklist nghiệm thu cần kiểm tra.
3. Hướng dẫn người dùng chọn **Claude Opus 5.5 (Thinking)** trên dropdown của Antigravity và bấm gửi để bắt đầu phiên Review.

### Chính sách Quota Fallback nghiêm ngặt:
- Chỉ fallback từ Opus 5.5 sang Gemini Flash 3.8 khi có **bằng chứng rõ ràng về kiệt quota Opus** (thông báo lỗi quota chính thức).
- **Cấm tự fallback** khi gặp lỗi mạng, timeout, xác thực hoặc cấu hình.
- Khi fallback: Ghi rõ model thực tế sử dụng, bằng chứng quota, và đánh dấu: *"Review nội bộ - không còn tính độc lập"*. Không được báo Opus đã review nếu thực tế Flash thực hiện.

---

## 4. Quy Trình Thực Thi Chuẩn (5 Bước Tự Động)

### Bước 1: Nạp & Thiết Lập SSoT Thay Thế
- Đọc `D:\VibeCode\Clone\spec-kit-main\AGENTS-v3.1-global.md` và `AGENTS-ANTIGRAVITY_MODEL_ROUTING_FINAL_v1.1.md`.
- Áp dụng ngay vào bộ não của Agent làm Hiến pháp tối cao và quy tắc phân vai model.

### Bước 2: Bootstrap Spec Kit (.specify)
- Kiểm tra `.specify/memory/constitution.md` và `.specify/templates/`:
- Nếu chưa có: Tự động khởi tạo cấu trúc Spec Kit liên kết với Global Constitution v3.1 và các nguyên tắc SDD, TDD, SoC.

### Bước 3: Cài Đặt & Kiểm Định Repository Harness
- Kiểm tra nhị phân `scripts/bin/harness.exe` (Windows) hoặc `scripts/bin/harness` (Linux/macOS):
- Nếu thiếu: Chạy lệnh cài đặt an toàn:
  ```powershell
  & ([scriptblock]::Create((irm "https://raw.githubusercontent.com/hoangnb24/repository-harness/main/scripts/install-harness.ps1"))) -Merge -Yes
  ```
- Chạy `harness doctor` để xác thực toàn bộ đường dẫn an toàn (PASS).

### Bước 4: Khởi Tạo Durable DB & Gắn Hiến Pháp Vào Dự Án
- Khởi tạo file SQLite `harness.db` tại thư mục gốc nếu chưa có.
- Cập nhật `AGENTS.md` của dự án để liên kết trực tiếp tới `AGENTS-v3.1-global.md` và `AGENTS-ANTIGRAVITY_MODEL_ROUTING_FINAL_v1.1.md`.

### Bước 5: Đồng Bộ AI Memory Layer
- Sẵn sàng hóa `docs/ai-memory/Journal.md` (lưu vết WHY) và `docs/ai-memory/handoff.md` (bàn giao ca trực).

---

## 5. Báo Cáo Nghiệm Thu & Trạng Thái Model (Health Check Report)

Sau khi hoàn tất, AI Agent xuất báo cáo:
```markdown
### 🛡️ Trạng thái Hệ sinh thái Dự án (v2.1.0 — Dual-Layer Governance)
- **Global Constitution SSoT**: D:\VibeCode\Clone\spec-kit-main\AGENTS-v3.1-global.md (ĐÃ THAY THẾ AGENTS.md CŨ)
- **Model Routing**: D:\VibeCode\Clone\spec-kit-main\AGENTS-ANTIGRAVITY_MODEL_ROUTING_FINAL_v1.1.md (FINAL v1.1)
  * Coding Worker: Gemini Flash 3.8 (Sẵn sàng)
  * Review / Verifier: Claude Opus 5.5 Thinking (Sẵn sàng cho Handoff)
- **Spec Kit Layer**: .specify/memory/constitution.md (ĐÃ SẴN SÀNG)
- **Repository Harness**: Core v0.1.10 - Doctor (PASS)
- **Durable Layer**: harness.db SQLite (ĐÃ KẾT NỐI)
- **AI Memory**: docs/ai-memory/handoff.md (ĐÃ ĐỒNG BỘ)
- **Trạng thái**: Hệ thống đã vào guồng, sẵn sàng nhận nhiệm vụ!
```
