---
name: cookbook-intent
description: "Turn a business or app idea into INTENT.md (a one-page build plan) using The Cookbook's Intent Studio method. Use on 'brainstorm this idea', 'turn this idea into a plan', 'lên kế hoạch cho ý tưởng app', 'biến ý tưởng thành bản ý định', 'intent for X', '/cookbook-intent'."
user-invocable: true
when_to_use: "Invoke when user wants to formalize a business idea into an INTENT.md document before coding."
category: planning
keywords: [intent, idea, plan, cookbook, spec, brief]
argument-hint: "\"<idea>\""
metadata:
  author: agentkit
  version: "1.0.0"
---

# /cookbook-intent (The Cookbook Intent Studio)

Biến một ý tưởng kinh doanh hoặc ứng dụng thành bản ý định một trang `INTENT.md` theo phương pháp chuẩn mực của The Cookbook.

## Quy trình thực hiện (Method)
Tham khảo: `references/METHOD.md` và `references/INTENT-SCHEMA.md`.

1. **Khảo sát ý tưởng (Native Conversation)**:
   - Hỏi tối đa 3 câu hỏi có gợi ý câu trả lời để làm rõ: Người dùng mục tiêu, Vấn đề cốt lõi, Một luồng công việc chính.
   - Không hỏi về ngăn xếp công nghệ (tech stack) hay viết code ở bước này.
2. **Đối chiếu công thức (Recipes Match)**:
   - Đọc hành trình người dùng và đối chiếu với `references/DOMAIN.md`.
   - Gắn các công thức phù hợp từ 6 workbook chính thức (`auth-roles`, `booking`, `crm`, `documents`, `email`, `payments`) vào mục `Recipes` của `INTENT.md`.
   - Nếu bước nào chưa có công thức, ghi rõ: "Chưa có công thức chính thức".
3. **Soạn thảo và lưu INTENT.md**:
   - Ghi rõ: Luồng chính, Quyết định quan trọng, Phạm vi v1, Những việc chưa làm, Tiêu chuẩn nghiệm thu có thể quan sát.
   - Lưu tài liệu vào `./INTENT.md`.
4. **Chuyển tiếp kiểm tra**:
   - Sau khi tạo xong, tự động gọi hoặc gợi ý chạy `cookbook-intent-check` để rà soát các khoảng trống kinh doanh (GAPS).

