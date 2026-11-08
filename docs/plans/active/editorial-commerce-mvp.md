# Execution Plan: Editorial Commerce MVP

Date: 2026-11-04

## Status

Completed

## Outcome

Xây dựng và hoàn thiện nền tảng Oops La Book Store phiên bản Editorial Commerce MVP theo đúng chuẩn mực "Content First, Commerce Second", đảm bảo 100% 7 tiêu chí Done của `docs/BRIEF.md`, các bất biến kinh doanh (`OD-01`, `OD-02`, `OD-03 Option B`, `BD-04`, `AC-11`, `AC-15`, `CURR-01`) và vượt qua toàn bộ 36 bài kiểm thử tự động cùng kiểm định của g8s Gatekeeper.

## Context

- **Source of Truth**: [`INTENT.md`](file:///d:/VibeCode/Oops%20La%20Bookstore/INTENT.md) (v1.1)
- **Technical Brief**: [`docs/BRIEF.md`](file:///d:/VibeCode/Oops%20La%20Bookstore/docs/BRIEF.md)
- **BRD Reference**: [`Oops_La_Book_Store_BRD_Final_v2.md`](file:///d:/VibeCode/Oops%20La%20Bookstore/Oops_La_Book_Store_BRD_Final_v2.md)
- **Cookbook Recipes**: [`docs/cookbook/auth-roles.workbook.md`](file:///d:/VibeCode/Oops%20La%20Bookstore/docs/cookbook/auth-roles.workbook.md), [`docs/cookbook/payments.workbook.md`](file:///d:/VibeCode/Oops%20La%20Bookstore/docs/cookbook/payments.workbook.md), [`docs/cookbook/crm.workbook.md`](file:///d:/VibeCode/Oops%20La%20Bookstore/docs/cookbook/crm.workbook.md)
- **AgentKit Plan**: [`plans/261104-1539-editorial-commerce-mvp/plan.md`](file:///d:/VibeCode/Oops%20La%20Bookstore/plans/261104-1539-editorial-commerce-mvp/plan.md) (100% Complete, 6/6 Phases)

## Scope

In scope:
- Storefront công khai: Catalog lọc theo thể loại/kích thước (SUMO/Standard), tìm kiếm tức thời theo Tác giả/ISBN/Tiêu đề, Hero Showcase Atelier Bow-Wow, Bài viết Editorial Journal.
- Trình xem ruột sách "Look Inside": Cuộn dọc nhiều ảnh liên tục, công cụ phóng to zoom cận cảnh bản vẽ kiến trúc 1:20.
- Form gửi yêu cầu mua sách (Collector Request): Tạo mã `OLS-xxxxxx`, xuất tin nhắn mẫu gửi Messenger, **Zero Auto-Reservation (BD-04)** (không giữ hay trừ kho khi submit).
- Phân quyền Dual-Role trong CMS: Phân định rõ 2 vai trò `Owner` (Chủ tiệm) và `Staff` (Nhân viên). Chặn Staff duyệt `CONFIRMED` (`AC-11`), chặn Staff hủy đơn đã duyệt (`OD-01`).
- Quản lý sách & Media trong CMS: CRUD sách, quản lý ảnh bìa/ruột lưu trữ IndexedDB, cập nhật tồn kho tức thì khi chốt bán ngoài quầy/Facebook.
- Quản lý đơn hàng: Kiểm tra tồn kho $\ge 1$ trước khi duyệt (`OD-02`), trừ tồn kho đúng 1 lần khi duyệt (`AC-15`), cảnh báo quá hạn 48 giờ (`⚠️ QUÁ 48H CHỜ CỌC`).
- Tiền tệ: Đồng nhất `VNĐ` trên toàn bộ hệ thống (`CURR-01`).

Out of scope:
- Không tích hợp cổng thanh toán trực tuyến (Stripe, VNPay, Momo) trong MVP.
- Không tích hợp API tự động đẩy đơn bưu điện/giao hàng nhanh.
- Không yêu cầu tài khoản đăng nhập cho người mua (Guest Collector Checkout).
- Không có tính năng A/B testing suite hoặc bộ công cụ demo prototype trong production code (BRD §15).

## Approach

1. **Phase 1: Core Architecture & Storage Foundations** — Khởi tạo domain models và tầng lưu trữ IndexedDB `OopsLaDB` cho sách, media, đơn hàng và bài viết editorial.
2. **Phase 2: Storefront Catalog & Instant Search** — Xây dựng giao diện Storefront Swiss Grid không bo góc, Hero Atelier Bow-Wow, lọc theo kích thước/danh mục, tìm kiếm đa thuộc tính và định dạng tiền tệ VNĐ.
3. **Phase 3: Look Inside Viewer & 1:20 Blueprint Zoom** — Xây dựng modal xem ruột sách dạng cuộn dọc liên tục và kính phóng to bản vẽ kỹ thuật 1:20 chi tiết cao.
4. **Phase 4: Collector Request Flow & Messenger Export** — Phát triển túi yêu cầu mua, form gửi yêu cầu tạo mã `OLS-xxxxxx`, đảm bảo không khóa tồn kho (BD-04), và hộp sao chép tin nhắn chuẩn hóa gửi Messenger.
5. **Phase 5: Admin CMS & Dual-Role Permission Engine** — Xây dựng CMS với bộ chuyển đổi vai trò (Owner vs. Staff), quản lý kho sách/media, và máy trạng thái đơn hàng kiểm soát chặt chẽ `OD-01`, `OD-02`, `OD-03 Option B`, `AC-11`, `AC-15` và huy hiệu quá hạn 48h.
6. **Phase 6: Invariants Verification & g8s Gatekeeper** — Viết và chạy bộ kiểm thử tự động cho 7 tiêu chí Done, audit anti-patterns qua `g8s doctor`, và đồng bộ AI memory.

## Progress

- [x] Phase 1: Core Architecture & Storage Foundations (`phase-01-start.md`) — 7/7 Tests PASS
- [x] Phase 2: Storefront Catalog & Instant Search (`phase-02-storefront-catalog-search.md`) — 5/5 Tests PASS
- [x] Phase 3: Look Inside Viewer & 1:20 Blueprint Zoom (`phase-03-look-inside-viewer-zoom.md`) — 4/4 Tests PASS
- [x] Phase 4: Collector Request Flow & Messenger Export (`phase-04-collector-request-flow.md`) — 5/5 Tests PASS
- [x] Phase 5: Admin CMS & Dual-Role Permission Engine (`phase-05-admin-dual-role-cms.md`) — 7/7 Tests PASS
- [x] Phase 6: Invariants Verification & g8s Gatekeeper (`phase-06-invariants-tdd-gatekeeper.md`) — 8/8 Tests PASS
**Tổng cộng: 36/36 Tests PASS (100%)**

## Decisions

- 2026-11-04: Áp dụng kiến trúc Tri-Pillar: Spec Kit (BRD + INTENT) + Repository Harness (`docs/plans/active/`) + AgentKit CLI (`plans/261104-1539-editorial-commerce-mvp/`) + g8s Zero-Trust Gatekeeper.
- 2026-11-04: Tuân thủ nghiêm ngặt 7 quyết định nghiệp vụ đã được Owner phê chuẩn: `OD-01`, `OD-02`, `OD-03 Option B`, `BD-01`, `BD-04`, `CURR-01`, `ADC-001`.

## Validation

- Bộ kiểm thử tự động: 36 tests PASS trong 1.28 giây trên Node.js v24.
- `g8s doctor`: HEALTHY.
- `g8s doctor --anti-pattern-catalog`: 0 anti-patterns detected.
- `g8s doctor --tdd-trap-check`: 0 TDD traps.
- `scripts/check-tri-pillar.ps1`: 100% PASS across all 3 pillars.
