# Quy Trình Kiểm Thử & Thẩm Định An Ninh CI/CD (Security CI Validation)

Tài liệu hướng dẫn vận hành workflow thẩm định an ninh thủ công độc lập (`.github/workflows/security-ci-validation.yml`) cho dự án Oops La Bookstore.

---

## 1. Cách Kích Hoạt Workflow qua GitHub CLI

Workflow này được thiết kế theo chế độ **thủ công 100% (`workflow_dispatch`)**, không tự động chạy trên `push` hay `pull_request` để tiết kiệm tài nguyên và không can thiệp vào quy trình deploy.

Lệnh kích hoạt mẫu:
```bash
gh workflow run security-ci-validation.yml \
  --ref test/security-ci-validation \
  -f run_zap=true \
  -f run_sonarqube=false
```

### Giới hạn đăng ký `workflow_dispatch` trên nhánh mặc định (Default Branch Limitation)
- **Đặc thù GitHub Actions**: Để một workflow file có trigger `on: workflow_dispatch` xuất hiện trên giao diện Web UI hoặc được nhận diện bởi lệnh `gh workflow run`, file `.github/workflows/security-ci-validation.yml` **bắt buộc phải tồn tại trên nhánh mặc định (`main`)**.
- Khi file đã có mặt trên `main`, bạn có thể chỉ định tham số `--ref <tên-nhánh>` để thực thi workflow trên bất kỳ branch thử nghiệm nào.
- *Lưu ý*: Không tự ý bổ sung các trigger tự động khác (như `push` hay `pull_request`) vào workflow này nhằm tuân thủ nguyên tắc Zero Scope Drift và ngăn ngừa kích hoạt ngoài ý muốn.

---

## 2. Chi Tiết Các Công Việc Kiểm Thử (Jobs)

| Job | Mô tả & Nhiệm vụ kiểm thử |
|---|---|
| **`tests-build`** | Chạy `npm ci`, thực thi toàn bộ 81 bài automated tests (`npm test`), chạy `npm run build` và kiểm tra `dist/index.html` sạch 100% credentials. |
| **`actionlint`** | Sử dụng container `rhysd/actionlint:1.7.12` để kiểm tra cú pháp và thực hành bảo mật của tất cả các file workflow GitHub Actions. |
| **`static-guards`** | Kiểm tra rào chắn bất biến: ngăn chặn chuỗi secret fallback công khai, đảm bảo fixtures demo chỉ nằm trong `tests/fixtures/`, và xác thực thư mục `dist/` hoàn toàn sạch. |
| **`trivy`** | Quét lỗ hổng (vuln, secret, misconfig) trên repository bằng `aquasec/trivy:0.76.2`. Đồng thời chạy Positive Control trên `tests/fixtures/security-demo/` để chứng minh scanner phát hiện đúng credential mẫu. |
| **`api-security`** | Kiểm tra khởi động fail-closed khi thiếu `ADMIN_SECRET_KEY` (mã lỗi 1), kiểm tra 4 trạng thái Unauthorized trên toàn bộ 5 route admin Node server, kiểm tra Cloudflare Worker mode (503 khi thiếu key, 401 khi sai key, 200 khi đúng key), và rà soát leak secret trong log. |
| **`zap`** *(Tùy chọn)* | Khởi chạy server Node cục bộ tại `127.0.0.1:3900` và quét DAST Baseline bằng `ghcr.io/zaproxy/zaproxy:stable` kết hợp cấu hình `.zap/rules.tsv`. |
| **`sonarqube`** *(Tùy chọn)* | Mở Cloudflare Tunnel qua `cloudflared access tcp` kết nối máy chủ SonarQube nội bộ và quét mã nguồn chuyên sâu bằng `sonar-scanner-cli`. |
| **`summary`** | Tổng hợp bảng kết quả Markdown vào `$GITHUB_STEP_SUMMARY` và đóng vai trò cổng chốt chặn (Enforcement Gate) bắt buộc tất cả job yêu cầu phải đạt PASS. |

---

## 3. Chính Sách Chấp Nhận Cảnh Báo (Acceptance Policy)

### Trivy Security Scan
- **Production Codebase**: Phải đạt **0** phát hiện mức `HIGH` hoặc `CRITICAL`.
- **Positive Control (`tests/fixtures/security-demo/`)**: Bắt buộc phải phát hiện $\ge 1$ secret giả lập trong fixture. Kết quả này được hệ thống ghi nhận là:  
  `ACCEPTED (test fixture, not in production build)` nhằm minh chứng scanner hoạt động chính xác.

### OWASP ZAP Baseline DAST
- **Mã thoát 0 (PASS)**: Không phát hiện cảnh báo nào.
- **Mã thoát 2 (WARN)**: Có cảnh báo nhưng được chấp nhận theo chính sách ban đầu tại `.zap/rules.tsv`. Các cảnh báo này được trích xuất thành bảng Markdown trong tóm tắt run để audit.
- **Mã thoát 1 hoặc 3 (FAIL)**: Lỗi quét hoặc vi phạm quy tắc nghiêm trọng; job sẽ báo lỗi đỏ (`exit 1`).
