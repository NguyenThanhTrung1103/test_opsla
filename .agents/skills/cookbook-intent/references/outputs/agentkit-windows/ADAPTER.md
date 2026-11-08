# Output Adapter: AgentKit on Windows

Input: `INTENT.md` (đạt RESULT PASS từ `cookbook-intent-check`).
Output: `docs/BRIEF.md` trong repository và sao chép các workbooks vào `docs/cookbook/`.

## Cấu trúc docs/BRIEF.md
1. **Mục tiêu & Phạm vi**: Trích xuất nguyên văn từ `INTENT.md` (Người dùng, Vấn đề, Một luồng chính, Những việc chưa làm).
2. **Quyết định đã chốt (Decisions)**: Giữ nguyên văn các quyết định.
3. **Tiêu chí nghiệm thu (DoD)**: Lấy từ `INTENT.md` và các `Guarantees` của Recipes.
4. **Công thức đính kèm**: Liệt kê các file công thức tại `docs/cookbook/*.workbook.md`.

## Chỉ thị chuyển tiếp trên Windows / Antigravity
Thay vì cú pháp Claude Code `/ak:plan docs/BRIEF.md`, trên Windows hỗ trợ:
- Lệnh CLI: `ak plan create "<Tên Plan>" --basedir ./plans`
- Hoặc kích hoạt Skill Antigravity: `/ak:plan docs/BRIEF.md`

