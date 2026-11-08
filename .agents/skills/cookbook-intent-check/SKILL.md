---
name: cookbook-intent-check
description: "Check an INTENT.md against the intent/v1 schema before building (detect gaps, guessed values, unobservable done). Use on 'check this intent', 'is this plan ready to build', 'kiểm tra bản ý định', '/cookbook-intent-check'."
user-invocable: true
when_to_use: "Invoke to audit and validate an INTENT.md file for missing business decisions and gaps."
category: governance
keywords: [intent, check, audit, validator, gaps, pass]
argument-hint: "[INTENT.md path]"
metadata:
  author: agentkit
  version: "1.0.0"
---

# /cookbook-intent-check (Intent Validator)

Kiểm tra tính hoàn thiện và độ chặt chẽ của file `INTENT.md` theo schema `intent/v1` trước khi chuyển sang giai đoạn xây dựng.

## Nguyên tắc cốt lõi (Anti-Guessing Gate)
Tham khảo: `references/CHECKER.md`.

- **CẤM TỰ ĐOÁN (Never Guess)**: Tuyệt đối không tự ý bổ sung hoặc suy diễn các quyết định kinh doanh còn thiếu trong `INTENT.md`.
- **Phát hiện GAPS**: Mọi quyết định chưa rõ ràng, giá trị chưa chốt hoặc tiêu chí nghiệm thu không đo được phải được liệt kê rõ ràng dưới dạng câu hỏi cho người dùng.

## Tiêu chuẩn đầu ra (Exact Output Block)

Đọc file `INTENT.md` (mặc định `./INTENT.md`) và xuất kết quả theo đúng cấu trúc:

### 1. Nếu phát hiện thiếu sót (RESULT GAPS):
```markdown
### ⚠️ RESULT GAPS
Phát hiện các điểm mở/chưa chốt quyết định nghiệp vụ:
1. [Khoảng trống 1]
2. [Khoảng trống 2]
👉 Vui lòng trả lời để bổ sung vào INTENT.md trước khi chuyển sang xây dựng!
```

### 2. Nếu đạt chuẩn (RESULT PASS):
```markdown
### ✅ RESULT PASS
Bản ý định đã đầy đủ, không có quyết định bỏ ngỏ, tiêu chí nghiệm thu rõ ràng.
👉 Sẵn sàng chuyển giao sang công cụ xây dựng bằng lệnh: `/cookbook-build-brief`!
```

