---
name: ak:g8s-gatekeeper
description: "Zero-Trust Execution & Quality Gatekeeper: Tự động cài đặt g8s binary thuần Go, thiết lập ranh giới Zero-Trust (Worktree/Receipt/Process isolation) và phối hợp cùng Spec Kit + Repository Harness để inspect, audit anti-patterns và kiểm định TDD trap cho từng dự án."
user-invocable: true
when_to_use: "Kích hoạt khi cần cài đặt g8s, kiểm tra chéo an toàn thực thi (Zero-Trust sandbox), audit anti-patterns, phát hiện bẫy TDD giả lập (TDD traps), hoặc inspect toàn diện bộ 3 Spec Kit + Harness + g8s."
category: execution-governance
keywords: [g8s, gatekeeper, zero-trust, sandbox, worktree, receipt, anti-pattern, tdd-trap, doctor, speckit, harness]
license: MIT
argument-hint: "[--inspect|--install|--tdd-trap|--anti-patterns|--verify]"
metadata:
  author: agentkit
  version: "1.0.0"
---

# g8s Gatekeeper Skill (Zero-Trust Execution & Inspection)

Skill này đóng gói **g8s (The Gatekeepers)** — harness thực thi tiến trình Zero-Trust bằng binary tĩnh thuần Go (<25MB, zero CGO). Khi kết hợp cùng **Spec Kit** và **Repository Harness**, skill này hoàn thiện **Bộ Ba Trụ Cột (The Tri-Pillar Architecture)** cho mọi dự án:

| Trụ cột | Công cụ | Vai trò cốt lõi | Trách nhiệm chính |
| :--- | :--- | :--- | :--- |
| **1. Specification (WHAT & WHY)** | **Spec Kit** | Nguồn sự thật duy nhất (SSOT) | Quản lý Hiến pháp (`constitution.md`), Đặc tả (`spec.md`), Kế hoạch (`plan.md`), Danh sách việc (`tasks.md`). |
| **2. Governance & Proof** | **Repository Harness** | Kiểm soát nạp việc & vết bằng chứng | Phân luồng rủi ro (`tiny`/`normal`/`high-risk`), bằng chứng (`TEST_MATRIX.md`), lưu vết quyết định (`Journal.md`), bàn giao (`handoff.md`). |
| **3. Zero-Trust Execution** | **g8s Gatekeeper** | Rào chắn bảo vệ & kiểm định thực thi | Cô lập Git Worktree, cấp quyền ghi một lần (`WriteReceipt`), diệt tiến trình ma (`Setpgid`), soi bẫy TDD (`--tdd-trap-check`), soát 11 Anti-Patterns. |

---

## 1. Cơ Chế Tự Động Cài Đặt (Auto-Bootstrap g8s)

Khi skill được gọi với cờ `--install` hoặc phát hiện máy chưa có lệnh `g8s`:

### Trên Windows (PowerShell):
```powershell
& ([scriptblock]::Create((irm "https://raw.githubusercontent.com/tamld/g8s/main/scripts/install.ps1")))
```
*Tải binary `g8s.exe` chính thức từ release mới nhất của `tamld/g8s`, xác thực mã SHA-256 (fail-closed), giải nén vào `$env:LOCALAPPDATA\Programs\g8s\bin\g8s.exe` và tự động gắn vào User PATH.*

### Trên Linux / macOS (Bash):
```bash
curl -fsSL https://raw.githubusercontent.com/tamld/g8s/main/scripts/install.sh | bash
```

---

## 2. Quy Trình Inspect Bộ 3 Toàn Diện (Tri-Pillar Inspection Protocol)

Khi kích hoạt `inspect` hoặc `@ak:g8s-gatekeeper`, Agent thực thi lần lượt 4 bước kiểm định:

### Bước 1: Kiểm Tra Trụ Cột Spec Kit
- Xác thực file Hiến pháp: `.specify/memory/constitution.md` (hoặc `constitution.md`).
- Kiểm tra kế hoạch hiện hành: `plan.md` và `tasks.md`.
- Đảm bảo nhiệm vụ đang làm có nguồn gốc từ Spec, không vượt phạm vi (scope drift).

### Bước 2: Kiểm Tra Trụ Cột Repository Harness
- Kiểm tra file cơ sở dữ liệu bền vững: `harness.db`.
- Chạy `harness doctor` (hoặc kiểm tra `docs/TEST_MATRIX.md`, `docs/FEATURE_INTAKE.md`).
- Xác nhận luồng rủi ro (Lane) và ma trận kiểm thử được cập nhật.

### Bước 3: Kiểm Định g8s Doctor & Chẩn Đoán Môi Trường
Chạy chẩn đoán môi trường:
```bash
g8s doctor
```
- Kiểm tra tính toàn vẹn Workspace, quyền đọc/ghi, dung lượng đĩa, danh mục Provider AI (`agy`, `claude`, `gemini`, `9router`).

### Bước 4: Soát Lỗi Anti-Patterns & Bẫy TDD Traps (Cực Kỳ Quan Trọng)
Chạy hai bộ kiểm tra bảo vệ chất lượng sâu của g8s:

1. **Quét 11 Anti-Patterns của AI Agent (`g8s doctor --anti-pattern-catalog`)**:
   - `no_panic`: Cấm panic vô cớ trong mã nguồn.
   - `no_ignored_errors`: Cấm nuốt lỗi âm thầm (`_ = err`).
   - `test_pins_fabricated_symbol`: Phát hiện test gán vào các symbol bịa đặt chưa tồn tại.
   - `test_locks_impl_detail`: Phát hiện test khóa chặt chi tiết cài đặt thay vì kiểm tra hành vi.
   - `no_local_path_leak`: Chặn rò rỉ đường dẫn tuyệt đối hoặc IP cục bộ.
   - `no_ai_artifacts`: Chặn file rác AI sinh ra ngoài ý muốn.

2. **Quét Bẫy TDD Traps (`g8s doctor --tdd-trap-check`)**:
   - Tự động duyệt qua toàn bộ mã nguồn kiểm thử và chỉ ra các test case tham chiếu tới các symbol/hàm chưa định nghĩa, ngăn ngừa AI tự "vẽ" ra test pass ảo.

---

## 3. Các Lệnh Điều Khiển Thường Dùng

| Mục tiêu | Lệnh thực thi |
| :--- | :--- |
| **Cài đặt g8s** | `irm https://raw.githubusercontent.com/tamld/g8s/main/scripts/install.ps1 \| iex` (Windows) |
| **Chẩn đoán môi trường** | `g8s doctor` |
| **Quét danh mục 11 Anti-Pattern** | `g8s doctor --anti-pattern-catalog` |
| **Dò tìm bẫy TDD fake-pass** | `g8s doctor --tdd-trap-check` |
| **Kiểm định chất lượng task** | `g8s verify --json` |
| **Báo cáo QA 6 tầng** | `g8s qa-report` |

---

## 4. Mẫu Báo Cáo Nghiệm Thu Tri-Pillar (Health Check Template)

Sau khi hoàn tất inspect, xuất báo cáo tổng quan:

```markdown
### 🛡️ Báo Cáo Kiểm Định Toàn Diện Bộ Ba (Spec Kit + Harness + g8s)

1. **Spec Kit (WHAT & WHY)**:
   - Hiến pháp / SSoT: [OK / THIẾU] (`.specify/memory/constitution.md`)
   - Spec & Tasks: [OK / THIẾU] (`tasks.md`)

2. **Repository Harness (GOVERNANCE & PROOF)**:
   - Harness Binary & Doctor: [PASS / WARN]
   - Durable DB: [OK / THIẾU] (`harness.db`)
   - Test Matrix: [OK / THIẾU] (`docs/TEST_MATRIX.md`)

3. **g8s Gatekeeper (ZERO-TRUST & ANTI-PATTERNS)**:
   - g8s Binary: v0.21.0 [SẴN SÀNG]
   - g8s Doctor Diagnostics: [PASS / DEGRADED]
   - Anti-Pattern Catalog (11 rules): [0 vi phạm / X vi phạm]
   - TDD Trap Pitfalls: [Sạch sẽ / Cảnh báo X bẫy TDD]

👉 **Kết luận**: [Đủ điều kiện thực thi an toàn / Cần khắc phục các điểm nghẽn trước khi code].
```

