# Execution Plan: Cook Concurrency, Persistence Fail-Closed & Storefront Integration

Date: 2026-11-07
Status: Completed
Authority: `docs/test-verification-2026-11-07.md`, `Oops_La_Book_Store_BRD_Final_v2.md`, `INTENT.md`, `AGENTS.md`

## 1. Goal & Outcome
Nâng cấp và gia cố toàn diện 6 điểm nghẽn thực chiến (V01–V06) phát hiện từ probe độc lập, đảm bảo:
- **V01**: Khóa cạnh tranh bất đồng bộ (Async Mutex Queue) chống race condition tranh cuốn sách cuối cùng.
- **V02**: Fail-Closed Persistence: Khi ghi đĩa/file lỗi, `put()` phải reject rõ ràng, không nuốt lỗi.
- **V03**: Runtime Allowlist cho `status` tại API boundary (`POST /api/admin/orders/:id/status`).
- **V04**: Đồng bộ và hỗ trợ bí danh mã sách (Catalog ID Aliases) giữa Frontend (`book-bowwow-1`) và Backend (`ols-book-01`).
- **V05**: Cập nhật header Content-Security-Policy (CSP) tại `app.ts` và `nginx.conf` cho phép CDN Tailwind/Lucide/Unsplash.
- **V06**: Gỡ bỏ fallback thành công giả khi mất mạng trong Storefront HTML, bảo toàn giỏ hàng.
- **Cam kết**: Giữ vững toàn bộ bài test hiện có (Zero Regression) và bổ sung các bài test end-to-end cho 6 mục trên.

---

## 2. Các Bước Đã Hoàn Tất
- [x] **Bước 1**: Nâng cấp `src/services/orderService.ts` với `AsyncLock` đảm bảo tuần tự hóa các thao tác đổi trạng thái và trừ kho (Giải quyết V01).
- [x] **Bước 2**: Nâng cấp `src/storage/indexed-db.ts` ném lỗi khi `saveToDisk` thất bại, đảm bảo Fail-Closed (Giải quyết V02).
- [x] **Bước 3**: Nâng cấp `src/server/app.ts`:
  - Validate runtime allowlist enum cho `status` (Giải quyết V03).
  - Cập nhật CSP header cho phép script/styles/CDN cần thiết (Giải quyết V05).
- [x] **Bước 4**: Nâng cấp `src/services/catalogService.ts`:
  - Hỗ trợ ID Aliases ánh xạ tự động giữa mã mockup và mã backend (Giải quyết V04).
- [x] **Bước 5**: Nâng cấp `oops_la_book_store_uxui_fixed.html` & `dist/index.html`:
  - Loại bỏ hoàn toàn fallback thành công giả khi fetch lỗi (Giải quyết V06).
  - Chạy `npm run build` đồng bộ `dist/index.html`.
- [x] **Bước 6**: Viết bài test kiểm định chuyên sâu cho V01–V06 trong `tests/concurrency-and-integration.test.ts`.
- [x] **Bước 7**: Chạy toàn bộ test suite (68/68 tests PASS) và Tri-Pillar verification script (PASS).
- [x] **Bước 8**: Cập nhật AI Memory (`Journal.md` & `handoff.md`).
