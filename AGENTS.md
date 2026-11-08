# Agent Instructions

<!-- HARNESS:BEGIN -->
## Harness

Start with the requested outcome and use the repository as the system of record.
Read `docs/WORKFLOW.md` and only relevant product, design, plan, code, and
validation material.

- Answers, explanations, reviews, diagnoses, plans, and status reports are
  read-only. Inspect only what is needed; change nothing.
- For a bounded change, inspect affected behavior and proof, implement, and
  validate. No control-plane operation is required.
- Use one `docs/plans/active/` file when work spans sessions, coordinates
  contributors, has dependencies, or needs recovery. Move it to
  `docs/plans/completed/` only after validation.
- Before editing, identify repository authority for each new externally
  observable policy. If materially different choices remain open, stop before
  edits; configurable defaults are not authority.
- For architecture, reliability, security, or quality invariant work, read
  `docs/patterns/encoding-invariants.md` and enforce only accepted rules.
- Report reusable agent friction. Change guidance, tools, runbooks, or validation
  for that purpose only when explicitly asked to use `$improve-harness`.
- Also pause when product intent remains ambiguous, recovery is difficult,
  validation is weakened, or authority is insufficient.
- Claim completion only with executable or observable evidence. Report outcome,
  changes, validation, and unresolved risks.

Harness has no task database or orchestration lifecycle. Use repository plans
and behavior-level proof; do not create parallel control-plane state.
<!-- HARNESS:END -->

## Tri-Pillar Architecture & Specification Protocols

### 0. Foundation Sources & Dual-Layer Governance
- **Global Constitution (SSOT)**: Bắt buộc tuân thủ Hiến pháp tối cao tại [`D:\VibeCode\Clone\spec-kit-main\AGENTS-v3.1-global.md`](file:///D:/VibeCode/Clone/spec-kit-main/AGENTS-v3.1-global.md).
- **Model Routing Rules**: Áp dụng quy tắc phân vai tại [`D:\VibeCode\Clone\spec-kit-main\AGENTS-ANTIGRAVITY_MODEL_ROUTING_FINAL_v1.1.md`](file:///D:/VibeCode/Clone/spec-kit-main/AGENTS-ANTIGRAVITY_MODEL_ROUTING_FINAL_v1.1.md):
  * **Coding Worker**: Gemini Flash 3.8 (Code, bug fix, refactor, TDD red/green).
  * **Review / Verification**: Claude Opus 5.5 (Thinking) (Mặc định read-only; kiểm tra độc lập; không tự sửa code).
  * **Bàn giao thủ công (Handoff)**: Dừng lại và yêu cầu người dùng chuyển model qua `MODEL_SWITCH_REQUIRED` kèm Review Packet.
  * **Fallback**: Chỉ fallback sang Flash khi có bằng chứng kiệt quota Opus; ghi rõ "Review nội bộ - không độc lập".

### 1. Spec Kit (.specify)
- Quản lý Hiến pháp tại `.specify/memory/constitution.md` và templates tại `.specify/templates/`.
- Tuân thủ thứ tự ưu tiên: Hiến pháp > BRD-OLS-002 (`Oops_La_Book_Store_BRD_Final_v2.md`) > Plan/Tasks > Code.
- Cấm tự suy diễn mở rộng phạm vi (Zero Scope Drift) ngoài phạm vi Editorial Commerce MVP.

### 2. Zero-Trust Execution (g8s Gatekeeper)
- Luôn kiểm định môi trường với `g8s doctor`.
- Đảm bảo 11 Anti-Patterns (`g8s doctor --anti-pattern-catalog`) không bị vi phạm.
- Chạy `g8s doctor --tdd-trap-check` để ngăn ngừa test pass ảo và symbol bịa đặt.

### 3. AI Memory & Durable State
- Lưu vết lý do kỹ thuật (WHY) vào `docs/ai-memory/Journal.md`.
- Duy trì bàn giao ca trực tại `docs/ai-memory/handoff.md`.
- Trạng thái kiểm thử cập nhật tại `docs/TEST_MATRIX.md` và cơ sở dữ liệu `harness.db`.
