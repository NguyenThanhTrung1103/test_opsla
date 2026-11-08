---
name: cookbook-build-brief
description: "Hand a checked INTENT.md to the builder by generating docs/BRIEF.md and copying named recipes. Use on 'build this intent', 'chuyển bản ý định sang build', 'hand off to agentkit', '/cookbook-build-brief'."
user-invocable: true
when_to_use: "Invoke to convert an approved INTENT.md into a technical build brief (docs/BRIEF.md) for AgentKit/Spec Kit."
category: planning
keywords: [brief, build, intent, agentkit, handoff, recipes]
argument-hint: "[INTENT.md path]"
metadata:
  author: agentkit
  version: "1.0.0"
---

# /cookbook-build-brief (Build Brief Generator)

Chuyển giao bản ý định `INTENT.md` đã được kiểm duyệt sang công cụ xây dựng kỹ thuật (AgentKit / Spec Kit) thông qua tệp `docs/BRIEF.md`.

## Điều kiện tiên quyết (Precondition)
Tệp `INTENT.md` **bắt buộc phải đạt `RESULT PASS`** từ skill `cookbook-intent-check`. Nếu chưa kiểm tra hoặc có GAPS, yêu cầu hoàn thành kiểm tra trước.

## Quy trình chuyển đổi (Execution Protocol)
1. **Trích xuất thông tin**:
   - Trích xuất: Mục tiêu, Đối tượng người dùng, Một luồng chính, Phạm vi loại trừ, Tiêu chí nghiệm thu, Các quyết định đã chốt.
   - Tuyệt đối không tự ý thêm các yêu cầu kinh doanh ngoài `INTENT.md`.
2. **Gắn công thức (Cookbook Recipes)**:
   - Tạo thư mục `docs/cookbook/`.
   - Sao chép các tệp workbook được nhắc tên trong `INTENT.md` từ thư mục `recipes/` sang `docs/cookbook/`.
   - Bổ sung chỉ dẫn: "Đọc từng workbook: phần Guarantees trở thành tiêu chuẩn nghiệm thu, phần Traps trở thành các edge cases cần xử lý."
3. **Lưu tệp**:
   - Ghi nội dung vào `docs/BRIEF.md`.
4. **Chỉ thị bước tiếp theo**:
   - Hướng dẫn người dùng chuyển tiếp sang AgentKit:
     * Kích hoạt `/ak:plan docs/BRIEF.md` hoặc
     * Chạy lệnh CLI: `ak plan create "Build Plan" --basedir ./plans`

