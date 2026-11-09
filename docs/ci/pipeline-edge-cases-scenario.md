# Phân Tích Kịch Bản & Điểm Biên An Ninh Pipeline (ak:scenario)

**Mục tiêu phân tích:** Kịch bản kích hoạt Workflow thử nghiệm qua Pull Request (`test/security-ci-validation` $\rightarrow$ `main`) và kiểm tra toàn diện các Edge Cases trên hệ thống CI/CD GitHub Actions của Oops La Bookstore.

---

## 1. Phát Hiện Cốt Tử Về Cơ Chế Trigger Của GitHub Actions (The Trigger Trap)

> [!CRITICAL]
> **Điểm nghẽn kỹ thuật cốt tử**:
> - File `.github/workflows/security-ci-validation.yml` hiện tại **chỉ cấu hình duy nhất một trigger**:
>   ```yaml
>   on:
>     workflow_dispatch:
>   ```
> - Nếu bạn chọn **Cách A (Tạo Pull Request từ `test/security-ci-validation` vào `main`)**:
>   1. Pipeline `deploy.yml` **sẽ chạy** (chỉ chạy job `test`, bỏ qua job `deploy` $\rightarrow$ an toàn).
>   2. **NHƯNG workflow `security-ci-validation.yml` SẼ KHÔNG HỀ CHẠY!** Vì nó không có trigger `pull_request`.
>   3. Nút bấm `Run workflow` trên GitHub Web UI cũng **chưa xuất hiện**, vì GitHub chỉ hiển thị `workflow_dispatch` của những file đã có mặt trên nhánh mặc định (`main`).
> - **Hệ quả**: Nếu mở PR mà không bổ sung trigger `pull_request` vào `security-ci-validation.yml`, toàn bộ các bài test an ninh (Trivy, ZAP, API Security check, Static guards) sẽ **không được kích hoạt** để kiểm tra!

---

## 2. Bảng Ma Trận Edge Cases Đầy Đủ Qua 12 Chiều Không Gian (12-Dimension Decomposition)

Phân loại mức độ nghiêm trọng:
- **Critical**: Lộ bí mật, vô tình deploy production, bypass xác thực, hỏng tính toàn vẹn dữ liệu.
- **High**: Pipeline bị chặn vô cớ, test pass giả mạo, race condition làm sai lệch trạng thái.
- **Medium**: Cảnh báo không mong muốn, suy giảm hiệu năng CI, tài nguyên bị giữ lâu.
- **Low**: Lỗi hiển thị giao diện, log khó đọc.

| # | Chiều không gian | Tình huống / Kịch bản Edge Case | Mức độ | Hành vi mong đợi & Giải pháp xử lý |
|---|---|---|:---:|---|
| **1** | **State Transitions** | **Kịch bản "The Merge Trap"**: PR từ `test/security-ci-validation` được merge vào `main` để kích hoạt `workflow_dispatch`. | **Critical** | Khi merge vào `main`, sự kiện `push` trên `main` sẽ kích hoạt `deploy.yml`. Lúc này, nếu `ADMIN_SECRET_KEY` chưa được set trong GitHub Secrets, job deploy sẽ bị chặn bởi step `Verify required secrets (fail closed)`. Tuy nhiên, nếu secret ĐÃ được set, lệnh deploy sẽ chạy thật! **Khuyến nghị**: Không merge vào `main` khi chỉ muốn thử nghiệm; thay vào đó thêm tạm trigger `pull_request` vào workflow validation. |
| **2** | **Authorization** | **PR từ Fork bên ngoài (External Fork PR)**: Một cộng tác viên bên ngoài fork repo về và tạo PR vào `main`. | **Critical** | GitHub Actions mặc định **không chuyển Secrets** cho workflow chạy từ fork PR. Step kiểm tra SonarQube hoặc Deploy sẽ an toàn. Tuy nhiên, job chạy trên runner vẫn phải có quyền tối thiểu `permissions: contents: read` để ngăn mã độc đọc thông tin repo. Workflow `security-ci-validation.yml` đã tuân thủ đúng quyền này. |
| **3** | **Timing & Concurrency** | **Push dồn dập vào PR (Rapid Push Storm)**: Developer push liên tục 3 commit lên nhánh PR trong vòng 30 giây. | **Medium** | Cấu hình `concurrency: { cancel-in-progress: true }` trong `security-ci-validation.yml` sẽ tự động hủy (cancel) các run cũ đang chạy dở và chỉ chạy commit mới nhất. Điều này tiết kiệm thời gian và hạn mức phút CI. |
| **4** | **Input Extremes** | **Bật SonarQube nhưng thiếu cấu hình**: Người dùng kích hoạt `workflow_dispatch` với input `run_sonarqube=true` nhưng chưa set secret Cloudflare. | **High** | Job `sonarqube` kiểm tra 4 secrets: `SONAR_TOKEN`, `SONAR_TUNNEL_HOSTNAME`, `CF_ACCESS_CLIENT_ID`, `CF_ACCESS_CLIENT_SECRET`. Nếu thiếu bất kỳ biến nào, job báo lỗi rõ ràng `::error::` và dừng ngay (exit 1), không để tiến trình treo chờ kết nối. |
| **5** | **Error Cascades** | **Trivy Database Outage**: Máy chủ Aqua Security bị sự cố hoặc mạng runner bị nghẽn không tải được CVE DB. | **High** | Khác với việc dùng `|| true`, pipeline mới ghi nhận mã lỗi thoát của Trivy. Nếu Trivy fail, job `trivy` sẽ đánh dấu FAIL và summary job sẽ báo đỏ, không âm thầm bỏ qua lỗ hổng. |
| **6** | **Data Integrity** | **Dữ liệu test API làm nhiễm bẩn file storage**: Test `POST /api/orders` tạo đơn hàng mẫu trong môi trường CI. | **High** | Server tạm trong CI được khởi chạy với biến `STORAGE_FILE="$RUNNER_TEMP/oopsla-ci-storage.json"`. Khi runner kết thúc, thư mục `$RUNNER_TEMP` tự động bị hủy sạch, không ảnh hưởng đến bất kỳ file dữ liệu nào của repository. |
| **7** | **Timing** | **ZAP DAST Scan bị Timeout**: Container ZAP quét quá lâu hoặc bị lặp vô tận (spider crawl loop). | **Medium** | Job `zap` được gắn chốt chặn `timeout-minutes: 15`. Lệnh `docker run` chỉ quét baseline (`zap-baseline.py` - passive scan) thay vì full active scan, thời gian chạy thực tế chỉ mất 1-2 phút. |
| **8** | **Environment** | **Xung đột cổng mạng (Port Conflict)**: Runner chạy nhiều service cùng chiếm cổng `3000` hoặc `3900`. | **Medium** | Server tạm được chạy trên cổng `3900` (thay vì cổng mặc định `3000`). Script kiểm tra sức khỏe `curl http://127.0.0.1:3900/api/health` tối đa 30 giây trước khi cho ZAP hoặc API-check kết nối. |
| **9** | **Compliance** | **Lộ lọt ADMIN_SECRET_KEY ngẫu nhiên vào Artifacts**: File log hoặc report vô tình ghi lại chuỗi token. | **Critical** | Trong job `api-security`, ngay sau khi sinh key ngẫu nhiên `ADMIN_SECRET_KEY=$(openssl rand -hex 32)`, lệnh `echo "::add-mask::$ADMIN_SECRET_KEY"` được gọi ngay. Đồng thời có bước `grep -rqF "$ADMIN_SECRET_KEY" reports/` bắt buộc: nếu thấy xuất hiện sẽ tự xóa sạch thư mục reports và fail job. |
| **10** | **Business Logic** | **Rate Limiting làm sai lệch kết quả API Test**: Endpoint `/api/orders` giới hạn 5 req/phút/IP, trong khi script test gửi dồn dập. | **High** | Script `api-security-check.mjs` được thiết kế có chủ đích: chỉ tạo đúng 2 đơn hàng test phân cách nhau, sau đó tái sử dụng order ID đó để test các endpoint `/confirm`, `/status`, `/cancel`. Số lượng request tạo đơn (2) nằm hoàn toàn dưới ngưỡng giới hạn (5). |
| **11** | **User Types** | **Bypass kiểm tra Static Guards**: Developer vô tình đặt tên file mới có chứa chuỗi demo. | **Medium** | Job `static-guards` dùng regex `grep -rnE` quét toàn bộ thư mục `src/`, `package.json`, `dist/`. Nếu phát hiện bất kỳ chuỗi `APP_CONFIG`, `PAYMENT_GATEWAY_SECRET`, `SuperSecretPass123` nào trong build output thì chặn đứng build ngay lập tức. |
| **12** | **Scale** | **Kích thước Artifacts vượt quá giới hạn**: Báo cáo ZAP HTML/JSON hoặc log server sinh ra file dung lượng lớn. | **Low** | Báo cáo ZAP Baseline cho một trang web đơn tĩnh chỉ có dung lượng ~50KB - 200KB, nằm rất xa giới hạn artifact của GitHub (500MB). |

---

## 3. Khuyến Nghị Xử Lý Cho Tình Huống Kích Hoạt (Actionable Recommendation)

Để bạn có thể kiểm thử toàn diện cả pipeline `deploy.yml` (kiểm tra không deploy) LẪN `security-ci-validation.yml` (kiểm tra an ninh) ngay trong Pull Request mà **không cần merge vào `main`**:

### Giải pháp tối ưu: Thêm trigger `pull_request` vào `security-ci-validation.yml`
Điều chỉnh khối `on` của file `.github/workflows/security-ci-validation.yml`:
```yaml
on:
  pull_request:
    branches:
      - main
      - master
  workflow_dispatch:
    inputs:
      run_zap:
        description: 'Run OWASP ZAP Baseline DAST Scan'
        type: boolean
        default: true
      run_sonarqube:
        description: 'Run SonarQube Analysis via Cloudflare Tunnel'
        type: boolean
        default: false
```

**Lợi ích kép đạt được ngay lập tức**:
1. Khi bạn tạo PR từ `test/security-ci-validation` vào `main`:
   - `deploy.yml` chạy: Thực thi 81 unit/integration tests $\rightarrow$ Job deploy tự động **SKIPPED** vì sự kiện là `pull_request`.
   - `security-ci-validation.yml` chạy: Thực thi toàn bộ bộ kiểm tra an ninh (Trivy, Static Guards, API Security, ZAP Baseline) $\rightarrow$ Xuất bảng Step Summary trực tiếp trên trang PR.
2. Tuyệt đối **không có rủi ro deploy production nhầm**.
3. Bạn xem được đầy đủ báo cáo an ninh thực tế trên giao diện GitHub PR trước khi đưa ra bất kỳ quyết định nào.
