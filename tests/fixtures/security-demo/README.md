# Security Demo Test Fixture

Thư mục này chứa các file fixture mẫu dùng riêng cho kiểm thử an toàn bảo mật tự động (DAST / SAST qua ZAP, Trivy, SonarQube).

## Mục đích
- `app-config-leak.html`: Chứa cấu hình mẫu giả lập lỗ hổng rò rỉ credential ở phía frontend (fake credentials).
- File này **CHỈ** được đưa vào image tạm thời trong quy trình quét bảo mật CI/CD (`.github/workflows/security.yml`).
- **TUYỆT ĐỐI KHÔNG** đóng gói hoặc copy file này vào `dist/` hoặc triển khai môi trường production.
