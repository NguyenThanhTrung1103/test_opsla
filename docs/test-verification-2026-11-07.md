# Báo cáo chạy lại kiểm thử và đối chiếu khắc phục — 07/11/2026

## Kết luận

**Bộ test hiện có PASS; chưa đủ điều kiện kết luận ứng dụng sẵn sàng production.** Kiểm tra bổ sung tái hiện được lỗi cạnh tranh cuốn cuối, nuốt lỗi ghi đĩa, nhận trạng thái không hợp lệ và không khớp ID giữa frontend/backend.

Thực hiện bằng Codex theo chỉ định người dùng sau lượt Gemini. Không deploy, không sửa source/test/config, không cập nhật trạng thái Harness hay đánh dấu các finding cũ đã đóng. Build đã cập nhật `dist/index.html`. Báo cáo này bổ sung, không thay thế lịch sử tại [review gốc](production-readiness-review-2026-11-07.md).

## Môi trường và cách cô lập

- Working directory: repository Oops La Bookstore trên Windows PowerShell.
- Node v24.14.1; g8s 0.21.0.
- Test và probe chạy với `NODE_ENV=test`; bỏ biến `STORAGE_FILE` trong subprocess để không chạm `data/oopsla-storage.json` đang có.
- HTTP probe bind `127.0.0.1` với port ngẫu nhiên; đóng server sau kiểm tra.
- Probe persistence dùng thư mục temp riêng, đã xóa các file do probe tạo và chính thư mục temp đó.
- Probe kho/đơn chỉ sửa dữ liệu trong bộ nhớ của process test.
- Không diễn giải `optimize --ultra` thành flag runner: package hiện có Node test runner, không có target mang tên đó.

## Lệnh và kết quả thực tế

| Kiểm tra | Lệnh | Kết quả |
|---|---|---|
| Suite hiện có | `npm test` với môi trường cô lập trên | Exit 0; 63/63 tests, 16 suites; 0 fail/skip/cancel; 2706.8208 ms |
| Coverage | `node --experimental-strip-types --experimental-test-coverage --test tests/**/*.test.ts` | Exit 0; 63/63; 3894.1332 ms |
| Build | `npm run build` | Exit 0; copy HTML mockup thành `dist/index.html` |
| Bộ Ba Trụ Cột | `powershell -ExecutionPolicy Bypass -File scripts/check-tri-pillar.ps1` | Script hiển thị PASS cho ba nhóm, exit 0 |
| Harness trực tiếp | `./scripts/bin/harness.exe doctor` | Exit 0; các kiểm tra transaction/provenance/managed paths PASS |
| g8s diagnostics | `g8s doctor` | HEALTHY |
| Danh mục anti-pattern | `g8s doctor --anti-pattern-catalog` | 11 rules; Last 24h fires: 0 |
| TDD diagnostics | `g8s doctor --tdd-trap-check` | SUCCESS; 0 fabricated symbols, 0 impl detail locks |

Giới hạn của gate: `--anti-pattern-catalog` hiển thị danh mục và lịch sử firing, không phải bằng chứng source hiện tại được quét sạch 11 loại lỗi. Script tri-pillar kiểm tra tồn tại `harness.db`, không chứng minh DB dữ liệu ứng dụng bền vững. Script cũng bắt exception thay vì kiểm tra từng `$LASTEXITCODE` của native command, nên không dùng output PASS của wrapper làm bằng chứng duy nhất. Đã chạy doctor trực tiếp như bảng trên.

## Coverage thực đo

| Phạm vi | Lines | Branches | Functions |
|---|---:|---:|---:|
| Tổng các file được runner đo | 82.45% | 78.49% | 81.31% |
| `src/server/app.ts` | 70.48% | 63.75% | 71.43% |
| `src/storage/indexed-db.ts` | 37.15% | 42.42% | 55.00% |
| `src/services/orderService.ts` | 93.96% | 83.61% | 100.00% |

HTML frontend được copy để deploy không nằm trong coverage này. Không coi tỷ lệ tổng cao là bằng chứng các nhánh production/storage/concurrency đã đúng. Không có TypeScript compiler/lint target sẵn được phát hiện trong manifest/PATH; strip-types không thay thế typecheck. Không cài công cụ thêm trong lượt này.

## Các probe bổ sung và lỗi còn lại

### V01 — FAIL: Hai đơn cùng dùng cuốn cuối (R07)

- Thiết lập: khởi tạo catalog; đặt `ols-book-01` còn 1; tạo hai đơn, mỗi đơn quantity 1.
- Thực hiện: `Promise.all([orderService.confirmOrder(a.id, 'OWNER'), orderService.confirmOrder(b.id, 'OWNER')])` trong process cô lập.
- Mong đợi: chỉ một kết quả success.
- Thực tế: `{"successes":2,"stock":0,"results":[{"success":true},{"success":true}]}`.
- Căn nguyên: `src/services/orderService.ts:176-188` vẫn kiểm tra/trừ kho bằng các await rời rạc. Tổng hợp dòng trùng và cờ `stockDeducted` không tạo transaction hay khóa cạnh tranh.
- Ưu tiên: P1; thêm regression cạnh tranh và đảm bảo nguyên tử ở storage/service, không chỉ lặp confirm tuần tự.

### V02 — FAIL: Lỗi ghi đĩa không làm thao tác thất bại (R02)

- Thiết lập: `new IndexedDBAdapter(tempDirectory)` với đường dẫn trỏ vào thư mục temp đang tồn tại thay vì file.
- Thực hiện: `await adapter.put('settings', { key: 'qa', value: 123 })`, bắt exception ở caller.
- Mong đợi: reject để caller không báo dữ liệu đã được lưu bền.
- Thực tế: log `EISDIR` tại `saveToDisk`, nhưng Promise resolve; `DISK_WRITE_ERROR_REJECTED false`.
- Căn nguyên: `src/storage/indexed-db.ts:58-72` bắt lỗi rồi chỉ console.error; `put` vẫn hoàn tất.
- Ưu tiên: P1; cần xử lý thất bại persistence và ghi nguyên tử/khôi phục phù hợp. Probe này chứng minh contract adapter sai khi ghi lỗi; không giả vờ đã chạy thử đầy đĩa trên production.

### V03 — FAIL: API cho phép trạng thái bất kỳ (R08)

- Thiết lập: một đơn đã CONFIRMED trong process probe; HTTP server loopback.
- Thực hiện: POST `/api/admin/orders/:id/status` với token admin mặc định của môi trường test và body `{"status":"INVALID_STATUS"}`.
- Mong đợi: từ chối validation, không sửa đơn.
- Thực tế: HTTP 200; đơn có `status: "INVALID_STATUS"`, history ghi chuyển từ CONFIRMED sang giá trị này.
- Căn nguyên: route chuyển `body.status` vào service, service không xác thực runtime allowlist. TypeScript union không bảo vệ JSON đầu vào.
- Ưu tiên: P1; kiểm tra enum và transition graph tại boundary/service, không chỉ chặn hai đường lùi cụ thể.

### V04 — FAIL: Sách mặc định frontend không tồn tại trong backend (R04)

- Bằng chứng: HTML dùng ID `book-bowwow-1` và các ID `book-*`, còn seed backend dùng `ols-book-*`. Không thấy luồng fetch `/api/books` hoặc `/api/admin/...` trong HTML khi tìm kiếm.
- Thực hiện: POST `/api/orders` với customer hợp lệ và item `{bookId:'book-bowwow-1', quantity:1}` theo ID frontend.
- Thực tế: HTTP 400, `Sách với mã "book-bowwow-1" không tồn tại trong hệ thống.`
- Ưu tiên: P1; frontend cần dùng cùng catalog/ID và cùng luồng quản trị server. Có thêm fetch POST không đủ chứng minh tích hợp hoàn chỉnh.

### V05 — Còn rủi ro từ code/response: CSP chặn JavaScript của artifact (R03/R13)

- GET `/` qua Node server trả HTTP 200, nhưng CSP là `default-src 'self'; img-src 'self' data: https:; style-src 'self' 'unsafe-inline'; font-src 'self' data:;`.
- Artifact có 2 inline `<script>` cùng script CDN Tailwind/Lucide. Không có script-src nonce/hash cho chúng; style unsafe-inline không cấp quyền cho script.
- Đây là đối chiếu header và nội dung HTTP thực tế; **chưa chạy browser để ghi console CSP**. Không coi HTTP 200 là bằng chứng website tương tác hoạt động.

### V06 — Còn rủi ro từ code: fallback báo thành công khi mạng lỗi và secret mặc định

- HTML quanh dòng 4170-4195 bắt `Failed to fetch` rồi tiếp tục tạo mã đơn cục bộ, receipt và xóa giỏ khi `serverOrder` null. Chưa đạt yêu cầu chỉ báo thành công sau khi lưu backend.
- `src/server/app.ts:25-30` vẫn chấp nhận default secret; production chỉ console.warn, không fail closed. Role tại các route status/cancel còn lấy từ body thay vì danh tính Staff/Owner riêng đã xác thực.
- Các mục này là đối chiếu code, không phải browser test hay thử xâm nhập production.

## Phần cải thiện đã có bằng chứng

- R01: suite hiện tại chứng minh HTTP confirm có token hoạt động và confirm lặp tuần tự không giảm kho thêm.
- R05: suite chứng minh cancel thiếu token trả 401; không đồng nghĩa hệ thống đã có danh tính Staff/Owner độc lập.
- R06: suite chứng minh từ chối quantity âm/bookId không tồn tại, và bỏ qua đơn giá client giả.
- R09: suite chứng minh API liệt kê đơn và chỉnh tồn có token; chưa chứng minh UI CMS dùng những API đó.
- R02: probe ghi một setting vào JSON bằng child process A; child process B mới đọc lại được `{key:'restart',value:321}`, cả hai exit 0. Một probe khác khởi tạo adapter mới cũng đọc lại được dữ liệu. Đây là bằng chứng persistence cơ bản, không chứng minh crash safety, transaction hoặc toàn bộ đơn/kho qua restart ứng dụng.
- R03: build tạo HTML và Node trả trang chủ 200; chưa chứng minh JavaScript/UI hoạt động.

## Những phần chưa kiểm chứng

- Browser E2E, responsive, ảnh thực/zoom, clipboard và dữ liệu giữa hai browser: NOT RUN. Không có browser automation tool/CLI sẵn được phát hiện trong phiên; không cài thêm.
- Nginx thực tế, SSL, Ubuntu/systemd, backup/restore và deploy: NOT RUN.
- R10/R11/R12/R13 chưa được đóng toàn bộ bằng lượt test này; tên suite “R01-R13” hiện chỉ chứa sáu test, không tương đương kiểm chứng đủ 13 finding.
- Không sửa lỗi trong lượt kiểm chứng vì người dùng yêu cầu chạy lại test. Agent sửa cần giữ bằng chứng FAIL và bổ sung regression trước khi tuyên bố hoàn tất.

## Bàn giao ưu tiên

1. Chặn xác nhận vượt tồn bằng cập nhật nguyên tử, bổ sung test concurrent cuốn cuối.
2. Không nuốt lỗi persistence; kiểm chứng không có success giả khi storage lỗi.
3. Runtime validation enum và transition graph cho toàn bộ API đơn.
4. Đồng bộ catalog/ID và các thao tác CMS giữa frontend/backend; bỏ fallback thành công giả.
5. Đồng bộ CSP/build, xác thực Staff/Owner riêng và cấu hình secret production.
6. Chạy lại suite + regression + browser E2E sau sửa; chỉ kết luận production theo phạm vi có bằng chứng.
