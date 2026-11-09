# Báo Cáo Thẩm Định An Ninh & Kiểm Thử Độc Lập (Security CI Validation Review Report)

**Dự án:** Oops La Bookstore (`NguyenThanhTrung1103/test_opsla`)  
**Ngày thực hiện:** 2026-11-09  
**Giai đoạn:** Chuẩn bị GitHub Actions Security Test — KHÔNG DEPLOY  

---

## 1. Cơ Chế Phân Vai & Tính Độc Lập Của Báo Cáo (Model Routing & Governance)

Tuân thủ nghiêm ngặt **AGENTS.md** và tài liệu điều phối **AGENTS-ANTIGRAVITY_MODEL_ROUTING_FINAL_v1.1.md**:
- **Giai đoạn 1 (Coding & Independent Review)**:
  - **Gemini 3.8 Flash (Coding Worker)**: Thực thi code fix fail-closed `ADMIN_SECRET_KEY`, tách biệt `security-demo` fixture, soạn thảo workflow `security.yml`, `security-ci-validation.yml`, `scripts/ci/api-security-check.mjs`.
  - **Claude Opus 5.5 (Independent Reviewer)**: Độc lập review toàn bộ source diff. Phát hiện lỗi nghiêm trọng: kiểm tra `isEntryModule` bằng `path.resolve(process.argv[1]) === __filename` sẽ khiến server thoát im lặng (exit 0) nếu chạy qua đường dẫn symlink trên VPS. Opus yêu cầu sửa bằng `fs.realpathSync`. Flash đã sửa lại và Opus phê duyệt vòng 1.
- **Giai đoạn 2 (Hoàn thiện & Fallback)**:
  - Do tài khoản người dùng kiệt quota Claude Opus 5.5 giữa ca làm việc, hệ thống chuyển giao quyền thực thi sang **Gemini 3.8 Flash**.
  - **Minh bạch đạo đức AI**: Các kiểm tra, tinh chỉnh và báo cáo ở Giai đoạn 2 này do **Gemini 3.8 Flash** tự thực hiện và tự đánh giá; **ghi nhận là "Review nội bộ / tự thực thi — không độc lập (Opus quota fallback)"**.

---

## 2. Danh Sách Các File Thay Đổi & Tạo Mới

### File sửa đổi (10 files)
1. **`.github/workflows/deploy.yml`**:
   - Bổ sung bước kiểm tra nghiêm ngặt `Verify required secrets (fail closed)`. Dừng ngay với mã lỗi 1 nếu `ADMIN_SECRET_KEY` rỗng.
   - Xóa bỏ hoàn toàn chuỗi fallback mặc định công khai `'oopsla-secret-admin-key-change-in-prod'` khỏi bước `wrangler-action`.
   - Gia cố điều kiện chạy deploy: chỉ cho phép kích hoạt khi branch là `refs/heads/main` hoặc `refs/heads/master`.
2. **`src/worker.ts`**:
   - Endpoint `GET /api/admin/orders`: trả về HTTP `503 Service Unavailable` nếu thiếu `env.ADMIN_SECRET_KEY`.
   - So khớp Bearer token trực tiếp với `env.ADMIN_SECRET_KEY` (401 nếu sai).
3. **`src/server/app.ts`**:
   - Xóa bỏ hằng số `DEFAULT_SECRET`, biến `ADMIN_SECRET` và lệnh cảnh báo console.
   - Thêm `getAdminSecret()` và `assertAdminSecretConfigured()` (ném lỗi fatal chặn khởi động nếu thiếu key).
   - Hàm `verifyAdminAuth()` từ chối mọi yêu cầu nếu chưa cấu hình secret.
   - Khối khởi động dùng `fs.realpathSync` an toàn với symlink, gọi `assertAdminSecretConfigured()` và thoát mã 1 nếu thiếu secret.
4. **`oops_la_book_store_uxui_fixed.html`**:
   - Gỡ bỏ hoàn toàn khối thẻ `<script>` chứa `window.APP_CONFIG` và credentials giả lập.
5. **`package-lock.json`**:
   - Sinh file lockfile chuẩn định dạng npm lockfile v3 (`npm install --package-lock-only --ignore-scripts`) để hỗ trợ lệnh `npm ci` xác định (deterministic) trên GitHub runner.
6. **`tests/concurrency-and-integration.test.ts`**:
   - Thay thế chuỗi secret cứng bằng `randomBytes(32).toString('hex')` sinh động trong `before()`, dọn dẹp trong `after()`.
7. **`tests/production-readiness.test.ts`**:
   - Thay thế chuỗi secret cứng bằng `randomBytes(32).toString('hex')` sinh động.
8. **`tests/server-security.test.ts`**:
   - Dùng secret ngẫu nhiên sinh động; bổ sung test phủ định xác nhận chuỗi fallback cũ bị từ chối; test thiếu secret gây fail-closed.
9. **`tests/worker-d1.test.ts`**:
   - Bổ sung các test case: thiếu secret trả 503, sai token trả 401, đúng token trả 200.
10. **`docs/ai-memory/Journal.md`**:
    - Ghi nhận nhật ký kỹ thuật (WHY, hành động, kết quả) theo chuẩn lưu trữ bền vững.

### File tạo mới (9 files)
1. **`.github/workflows/security-ci-validation.yml`**:
   - Workflow kiểm thử an ninh thủ công độc lập (`workflow_dispatch`), quyền `contents: read`, không deploy, không chứa secret, không dùng `continue-on-error: true` hay `|| true`.
2. **`.github/workflows/security.yml`**:
   - Workflow security pipeline tự động (Sonarqube, CodeClimate, Trivy, ZAP) chuẩn bị cho tích hợp sau này.
3. **`scripts/ci/api-security-check.mjs`**:
   - Script Node 22 ESM kiểm định toàn diện 5 route admin (4 biến thể unauthorized + valid path với dữ liệu cô lập) và Worker mode.
4. **`scripts/ci/sonar_export_issues.py`**:
   - Script xuất danh sách issue từ SonarQube API ra CSV có phân trang đầy đủ.
5. **`.zap/rules.tsv`**:
   - File cấu hình quy tắc quét OWASP ZAP baseline (mặc định WARN, yêu cầu giải trình đối với mọi IGNORE).
6. **`tests/fixtures/security-demo/app-config-leak.html`**:
   - Fixture chứa đoạn mã leak credentials giả lập, được cách ly tuyệt đối khỏi production, chỉ nạp tạm thời khi quét DAST/SAST.
7. **`tests/fixtures/security-demo/README.md`**:
   - Tài liệu giải thích mục đích và phạm vi sử dụng của fixture demo.
8. **`tests/server-startup-failclosed.test.ts`**:
   - Test kiểm tra tiến trình con Node server thoát mã 1 khi thiếu `ADMIN_SECRET_KEY`.
9. **`tests/security-demo-isolation.test.ts`**:
   - Test rào chắn tự động quét cấm rò rỉ credential demo hoặc chuỗi fallback cũ vào source code hoặc deploy workflow.
10. **`docs/ci/security-ci-validation.md`**:
    - Hướng dẫn vận hành workflow validation và giải thích các giới hạn kỹ thuật.

---

## 3. Kết Quả Kiểm Thử Thực Tế Đã Chạy Trên Môi Trường Cục Bộ

| Hạng mục kiểm thử | Lệnh thực thi thực tế | Kết quả | Ghi chú bằng chứng |
|---|---|:---:|---|
| **Cài đặt & Dependencies** | `npm ci` | **PASS** | `audited 1 package in 3s, found 0 vulnerabilities`. |
| **Toàn bộ Test Suite** | `npm test` | **PASS** | **81/81 tests PASS (100%)** trên 20 suites. Thời gian chạy ~1.3s - 3.8s. |
| **Production Build** | `npm run build` | **PASS** | Tạo `dist/index.html` sạch; quét regex không tìm thấy `APP_CONFIG`, `PAYMENT_GATEWAY_SECRET`, `SuperSecretPass123`. |
| **Quét Chuỗi Fallback Cũ** | `Get-ChildItem -Recurse \| Select-String "oopsla-secret-admin-key-change-in-prod"` | **PASS** | **0 kết quả** trong `src/`, `.github/`, config hay HTML production. Chỉ xuất hiện trong các bài test phủ định (`assert false/401`) và Journal.md. |
| **Workflow Lint (actionlint)** | `actionlint.exe` v1.7.12 trên cả 3 file YAML | **PASS** | Exit code 0, không có lỗi cú pháp Actions hay cấu trúc steps nào. |
| **API Security Check (Server Mode)** | `node scripts/ci/api-security-check.mjs server` | **PASS** | **28/28 checks PASS**. Đã thử nghiệm toàn bộ 5 route admin Node server với 4 trạng thái unauthorized và các đường dẫn hợp lệ. |
| **API Security Check (Worker Mode)** | `node --experimental-strip-types scripts/ci/api-security-check.mjs worker` | **PASS** | **3/3 checks PASS** (Thiếu secret -> 503; Sai secret -> 401; Đúng secret -> 200). |
| **Kiểm tra Rò rỉ Secret lúc chạy** | `Select-String` tìm key ngẫu nhiên trong log server và file JSON kết quả | **PASS** | **0 hits** (Không có giá trị bí mật nào bị in ra log). |
| **Server Startup Fail-Closed** | Chạy Node server thiếu `ADMIN_SECRET_KEY` | **PASS** | Thoát với exit code `1` kèm thông báo lỗi `[FATAL] ADMIN_SECRET_KEY is not configured`. |

---

## 4. Những Kiểm Thử Chưa Thể Chạy & Nguyên Nhân Cụ Thể

1. **OWASP ZAP Baseline qua Docker tại máy cục bộ**:
   - *Trạng thái*: **SKIPPED (Local)** — Sẽ chạy tự động trên GitHub-hosted runner.
   - *Nguyên nhân*: Docker Desktop trên máy trạm Windows chưa khởi động xong engine (`npipe:////./pipe/dockerDesktopLinuxEngine: The system cannot find the file specified`).
   - *Tính khả thi trên CI*: GitHub Actions `ubuntu-latest` có sẵn Docker daemon Linux, container `ghcr.io/zaproxy/zaproxy:stable` sẽ chạy trơn tru trong pipeline.
2. **Trivy Scanner qua Docker tại máy cục bộ**:
   - *Trạng thái*: **SKIPPED (Local)** — Sẽ chạy tự động trên GitHub-hosted runner.
   - *Nguyên nhân*: Tương tự do Docker daemon trên máy Windows chưa sẵn sàng.
3. **SonarQube qua Cloudflare Tunnel**:
   - *Trạng thái*: **SKIPPED (By Design)**.
   - *Nguyên nhân*: Người dùng chưa bật máy chủ SonarQube nội bộ và chưa cấu hình Cloudflare Tunnel. Trong workflow `security-ci-validation.yml`, job này được đặt `default: false` và hiển thị rõ ràng `SKIPPED (not enabled — not run)` trên Step Summary, hoàn toàn không làm gián đoạn các job bảo mật khác.

---

## 5. Phân Tích & Đề Xuất Cho 2 Vấn Đề Bảo Mật Bổ Sung (Mục 8)

### Vấn đề 1: Rate Limiting tin tưởng header `X-Forwarded-For` do client cung cấp
- **Hiện trạng tại `src/server/app.ts` (`getClientIp`)**:
  ```typescript
  function getClientIp(req: http.IncomingMessage): string {
    const forwarded = req.headers['x-forwarded-for'];
    if (typeof forwarded === 'string' && forwarded.trim()) {
      const ips = forwarded.split(',').map(s => s.trim());
      if (ips[0]) return ips[0];
    }
    return req.socket.remoteAddress || '127.0.0.1';
  }
  ```
- **Rủi ro an ninh**:
  - `ips[0]` lấy IP đầu tiên trong danh sách chuỗi. Nếu client cố tình gửi header `X-Forwarded-For: <random-ip>`, và reverse proxy (Nginx) dùng cấu hình `$proxy_add_x_forwarded_for`, thì IP giả mạo sẽ đứng ở vị trí đầu tiên. Kẻ tấn công có thể thay đổi IP ngẫu nhiên trong mỗi request để bypass hoàn toàn cơ chế Rate Limit (5 req/phút/IP trên endpoint tạo đơn `/api/orders`).
- **Phương án kiến trúc đề xuất (KHÔNG tự ý sửa để tránh gián đoạn production)**:
  1. Trong môi trường có Nginx hoặc Cloudflare, cần sử dụng header do proxy tin cậy thiết lập:
     - Với Nginx (theo `deploy/nginx.conf`): Nginx đã có `proxy_set_header X-Real-IP $remote_addr;`. Đọc `req.headers['x-real-ip']` an toàn hơn nhiều.
     - Với Cloudflare Edge: Cloudflare gửi header `CF-Connecting-IP`.
  2. *Giải pháp đề xuất*:
     ```typescript
     function getClientIp(req: http.IncomingMessage): string {
       // Ưu tiên IP được gán trực tiếp bởi reverse proxy tin cậy
       const realIp = req.headers['x-real-ip'] || req.headers['cf-connecting-ip'];
       if (typeof realIp === 'string' && realIp.trim()) return realIp.trim();
       
       // Nếu dùng X-Forwarded-For, chỉ lấy IP cuối cùng hoặc cấu hình trusted proxies
       const forwarded = req.headers['x-forwarded-for'];
       if (typeof forwarded === 'string' && forwarded.trim()) {
         const ips = forwarded.split(',').map(s => s.trim());
         if (ips.length > 0) return ips[ips.length - 1]; // IP gần nhất kết nối vào proxy
       }
       return req.socket.remoteAddress || '127.0.0.1';
     }
     ```
  3. *Lý do chưa triển khai*: Cần xác nhận mô hình mạng thực tế của server production (chạy trực tiếp Node, qua Nginx, hay qua Cloudflare tunnel) để tránh tính nhầm IP của proxy thành IP client (gây rate-limit toàn bộ người dùng cùng lúc).

### Vấn đề 2: Quyền `OWNER`/`STAFF` lấy từ `body.role` do client gửi lên
- **Hiện trạng tại `src/server/app.ts`**:
  - Tại `/api/admin/orders/:id/cancel` và `/api/admin/orders/:id/status`:
    ```typescript
    const role: UserRole = body.role === 'STAFF' ? 'STAFF' : 'OWNER';
    ```
- **Rủi ro an ninh**:
  - Hệ thống hiện tại chỉ sử dụng một khóa bí mật duy nhất `ADMIN_SECRET_KEY`. Khi một nhân viên (Staff) có được token này, họ có thể chỉnh sửa body request gửi lên `role: "OWNER"` để thực hiện các thao tác chỉ dành cho Chủ tiệm (Owner) như hủy đơn đã xác nhận (vi phạm Invariant `OD-01`).
- **Phương án kiến trúc đề xuất (KHÔNG tự ý sửa vì ảnh hưởng lớn tới contract)**:
  1. *Nguyên nhân gốc rễ*: Do hệ thống MVP Editorial Commerce đang sử dụng mô hình xác thực Single Shared Secret kết hợp giao diện chuyển vai `DualRoleSwitcher` (client-side simulation).
  2. *Giải pháp kiến trúc dài hạn*:
     - **Tùy chọn A (Đơn giản - 2 Secret Keys)**: Tách biệt `OWNER_SECRET_KEY` và `STAFF_SECRET_KEY`. Server kiểm tra token gửi lên để suy ra quyền của người gọi, bỏ qua hoàn toàn trường `body.role`.
     - **Tùy chọn B (Chuẩn doanh nghiệp - JWT / Session RBAC)**: Triển khai đăng nhập admin trả về JWT chứa claim `role: 'OWNER' | 'STAFF'`. Server xác minh chữ ký JWT để phân quyền.
  3. *Lý do chưa triển khai*: Việc thay đổi này phá vỡ hợp đồng API hiện tại của frontend và hệ thống test liên quan (Breaking Change), cần người dùng phê duyệt phương án trước.

---

## 6. Đánh Giá Độ An Toàn Khi Commit & Push Lên Nhánh Thử Nghiệm (`test/security-ci-validation`)

| Tiêu chí an toàn | Đánh giá | Chi tiết kiểm chứng |
|---|:---:|---|
| **Nguy cơ kích hoạt Deploy** | **TUYỆT ĐỐI AN TOÀN (0%)** | `deploy.yml` chỉ chạy trên push vào `main` hoặc `master`. Điều kiện deploy đã được khóa chặt: `(github.ref == 'refs/heads/main' \|\| github.ref == 'refs/heads/master')`. Push lên nhánh `test/*` không thể kích hoạt deploy. |
| **Quyền hạn GitHub Token** | **TỐI THIỂU** | Workflow mới cấu hình `permissions: contents: read`. Không có quyền ghi, không có quyền release hay deploy. |
| **Nguy cơ lộ lọt Secrets** | **TUYỆT ĐỐI AN TOÀN** | Không có bất kỳ production secret nào được đưa vào code, test hay workflow. Secret kiểm thử sinh ngẫu nhiên trong runtime và được mask ngay lập tức (`::add-mask::`). |
| **Purity của Production Build** | **TUYỆT ĐỐI AN TOÀN** | Đã test kiểm chứng `dist/index.html` hoàn toàn không chứa demo credentials hay fixtures nào. |
| **Bảo toàn chức năng (No Regression)** | **100% PASS** | Toàn bộ 81 test cases nghiệp vụ sách kiến trúc, đơn hàng, giao diện Swiss Grid, và xác thực đều PASS. |

---

## 7. Các Thao Tác Cần Người Dùng Xác Nhận Tiếp Theo

Hiện tại, hệ thống đã dừng lại đúng cam kết: **chưa commit, chưa push, chưa tạo nhánh git từ xa, và chưa deploy**.

Để tiến hành kiểm thử trên GitHub Actions, bạn chỉ cần thực hiện / phê duyệt các bước sau:

### Bước 1: Tạo nhánh và Commit cục bộ
```powershell
# Tạo nhánh thử nghiệm
git checkout -b test/security-ci-validation

# Thêm các file đã kiểm định
git add .

# Commit theo chuẩn conventional commits
git commit -m "test(security): add manual-only security CI validation workflow and fail-closed hardening"
```

### Bước 2: Push lên GitHub (An toàn - không kích hoạt deploy)
```powershell
git push -u origin test/security-ci-validation
```

### Bước 3: Kích hoạt Workflow Thử Nghiệm
> **Lưu ý kỹ thuật quan trọng của GitHub Actions**:  
> Do workflow `.github/workflows/security-ci-validation.yml` sử dụng `on: workflow_dispatch`, GitHub yêu cầu file workflow này **phải có mặt trên nhánh mặc định (`main`)** thì API/Web UI mới nhận diện được để bấm Run.
> - **Cách 1 (Khuyến nghị để test nhánh trước)**: Thêm tạm trigger `push` cho nhánh `test/security-ci-validation` trong file workflow trước khi push, để GitHub tự chạy kiểm thử ngay khi nhận nhánh mới.
> - **Cách 2 (Chuẩn quy trình PR)**: Tạo Pull Request từ `test/security-ci-validation` vào `main`. (Lưu ý: job test trong deploy.yml sẽ chạy kiểm tra, nhưng job deploy sẽ tự động bỏ qua vì sự kiện là PR). Sau khi merge vào `main`, bạn có thể bấm Run workflow thủ công bất kỳ lúc nào.
