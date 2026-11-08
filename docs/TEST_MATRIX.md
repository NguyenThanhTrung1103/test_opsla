# Test Matrix — Oops La Book Store

Ma trận kiểm thử theo dõi bằng chứng hành vi (behavior-level proof) cho từng tính năng trước khi chuyển trạng thái sang `completed`.

## 1. Baseline Verification
| Mã ID | Thành phần | Mô tả kiểm thử | Loại kiểm thử | Trạng thái | Bằng chứng / Lệnh thực thi |
| :--- | :--- | :--- | :--- | :--- | :--- |
| TM-01 | Repository Harness | Kiểm tra tính toàn vẹn cấu trúc & đường dẫn quản lý | Infrastructure | PASS | `.\scripts\bin\harness.exe doctor` |
| TM-02 | g8s Environment | Kiểm tra trạng thái chẩn đoán môi trường runtime | Infrastructure | PASS | `g8s doctor` |
| TM-03 | g8s Anti-Patterns | Soát 11 quy tắc chống anti-pattern của AI | Static Audit | PASS | `g8s doctor --anti-pattern-catalog` |
| TM-04 | g8s TDD Traps | Quét bẫy TDD fake-pass và symbol bịa đặt | TDD Audit | PASS | `g8s doctor --tdd-trap-check` |

---

## 2. Business Feature Test Matrix (Cập nhật theo từng Feature Spec)
| Feature ID | Case ID | Kịch bản kiểm thử | Hành vi kỳ vọng | Trạng thái |
| :--- | :--- | :--- | :--- | :--- |
| *Chờ kế hoạch phát triển* | - | - | - | Pending |

