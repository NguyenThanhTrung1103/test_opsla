# Technical Build Brief — Oops La Book Store

**Source of Truth:** [`INTENT.md`](file:///d:/VibeCode/Oops%20La%20Bookstore/INTENT.md) (v1.1)  
**BRD Reference:** [`Oops_La_Book_Store_BRD_Final_v2.md`](file:///d:/VibeCode/Oops%20La%20Bookstore/Oops_La_Book_Store_BRD_Final_v2.md)  
**UX/UI Mockup Baseline:** [`oops_la_book_store_uxui_fixed.html`](file:///d:/VibeCode/Oops%20La%20Bookstore/oops_la_book_store_uxui_fixed.html) & [`design-preview/index.html`](file:///d:/VibeCode/Oops%20La%20Bookstore/design-preview/index.html)  
**Generated Date:** 07/11/2026  
**Status:** READY FOR AGENTKIT / SPEC KIT PLANNING (`/ak:plan`)

---

## 1. Executive Summary & Objective

Oops La Book Store là một nền tảng bán sách kiến trúc chuyên khảo & tác phẩm giám tuyển cao cấp (monographs, sumo editions, technical drawings 1:20 của Atelier Bow-Wow) theo trường phái **Editorial Commerce ("Content First, Commerce Second")**.

Mục tiêu giai đoạn MVP:
1. **Storefront**: Số hóa bộ sưu tập sách kiến trúc, mang lại trải nghiệm xem ruột sách ("Look Inside") dạng cuộn dọc liên tục và phóng to zoom cận cảnh bản vẽ kỹ thuật; tiếp nhận yêu cầu mua sách của độc giả mà **không giữ hàng tự động (Zero Auto-Reservation)**.
2. **Admin CMS**: Quản lý xuất bản sách, media ruột sách dạng IndexedDB/Storage, quản lý bài viết Editorial Journal, và xử lý đơn hàng website với cơ chế phân quyền 2 tầng **Dual-Role (Owner vs. Staff)** bất biến.

---

## 2. Core Personas & Access Boundaries

| Role | User | Capabilities & Permissions | Strict Invariants (Guarantees) |
| :--- | :--- | :--- | :--- |
| **Guest / Collector** | Độc giả mua sách kiến trúc | Duyệt catalog, tìm kiếm sách/ISBN, đọc bài Editorial, xem "Look Inside" cuộn dọc/zoom, gửi Collector Request. | Không cần tạo tài khoản login. Không thanh toán tự động qua thẻ/cổng online. |
| **Staff** | Nhân viên tiệm | Quản lý sách, ảnh bìa/ruột, bài viết editorial, cập nhật tồn kho sau bán Facebook; tiếp nhận đơn web, chuyển `PENDING_CONTACT` -> `CONTACTED`. | **CẤM chuyển đơn sang `CONFIRMED`** (AC-11). Cấm hủy đơn khi đơn đã `CONFIRMED` (OD-01). |
| **Owner** | Chủ tiệm | Toàn quyền kiểm soát hệ thống, đối soát tiền cọc/thanh toán ngân hàng, duyệt đơn sang `CONFIRMED`, hủy đơn ở mọi giai đoạn. | **Người duy nhất được quyền `CONFIRMED`**. Chỉ confirm khi tồn kho $\ge 1$ (OD-02). Khi confirm, trừ tồn kho đúng 1 lần (AC-15). |

---

## 3. Scope Boundaries

### In Scope (P0 MVP)
- **Storefront**:
  - Catalog lọc theo danh mục (Monograph, Technical Drawings, Urban Theory, Sumo Edition) & kích thước (Standard, SUMO, XXL).
  - Tìm kiếm tức thì theo Tên sách, Tác giả, ISBN với chuẩn hóa không dấu và gạch nối.
  - Hero Showcase Atelier Bow-Wow & Editorial Journal Articles.
  - Trình xem ruột sách "Look Inside" cuộn dọc liên tục + công cụ phóng to Blueprint ZoomLens 1x–4x bản vẽ kỹ thuật.
  - Túi yêu cầu mua (Collector Bag) & Form gửi yêu cầu mua (Họ tên, SĐT Việt Nam hợp lệ, Địa chỉ, Sách & SL, Ghi chú).
  - Xuất mẫu tin nhắn chuẩn hóa 1-click clipboard gửi Facebook Messenger.
- **Admin CMS**:
  - Dual-Role Switcher (Owner vs. Staff) hiển thị rõ trên thanh điều hướng với phân quyền Fail-Closed.
  - Quản lý sách (CRUD, cập nhật giá, trạng thái, tồn kho, ảnh bìa).
  - Quản lý Media ruột sách (IndexedDB binary storage, phân loại Front/Back/Spine/Spread).
  - Quản lý bài viết Editorial (soạn thảo, xuất bản, gắn liên kết sách).
  - Quản lý đơn hàng (Lọc trạng thái, xem chi tiết, sao chép tin nhắn Messenger).
  - Cảnh báo quá hạn 48 giờ (`⚠️ QUÁ 48H CHỜ CỌC`) cho các đơn chờ cọc.

### Out of Scope (Non-Goals)
- Không tích hợp cổng thanh toán trực tuyến (Stripe, VNPay, Momo) trong MVP.
- Không tích hợp hệ thống tính phí ship tự động qua API bưu cục.
- Không tạo hệ thống tài khoản thành viên đăng nhập cho khách hàng.
- Không đưa các công cụ demo prototype / A/B testing suite vào code sản xuất (BRD §15).
- Không hỗ trợ đa tiền tệ (CURR-01: 100% VNĐ cố định).

---

## 4. Cookbook Recipes Attached

Toàn bộ các tệp công thức chính thức từ The Cookbook đã được sao chép và gắn kết đầy đủ tại thư mục [`docs/cookbook/`](file:///d:/VibeCode/Oops%20La%20Bookstore/docs/cookbook):

1. **[`docs/cookbook/auth-roles.workbook.md`](file:///d:/VibeCode/Oops%20La%20Bookstore/docs/cookbook/auth-roles.workbook.md)**
   - *Áp dụng cho*: Phân quyền Dual-Role (Owner vs. Staff) trong Admin CMS.
   - *Guarantees*: Owner kiểm soát toàn quyền; Staff bị chặn ở tầng xử lý quyền đối với action `CONFIRMED` và action `CANCELLED` trên đơn đã duyệt.
   - *Traps to avoid*: Không hardcode kiểm tra role lỏng lẻo ở client; phải fail-closed; không để Staff bypass qua API endpoint.
2. **[`docs/cookbook/payments.workbook.md`](file:///d:/VibeCode/Oops%20La%20Bookstore/docs/cookbook/payments.workbook.md)**
   - *Áp dụng cho*: Quy trình xác minh tiền cọc/chuyển khoản ngân hàng & trừ tồn kho.
   - *Guarantees*: Tiền tệ cố định VNĐ (CURR-01). Tồn kho trừ chính xác 1 lần duy nhất khi Owner bấm `CONFIRMED` (AC-15 & OD-02). Khi sách hết hàng, lập tức chuyển nhãn `SOLD_OUT`. Hoàn tiền thủ công ngoài đời (OD-03 Option B).
   - *Traps to avoid*: Tránh trừ tồn kho ngay khi khách submit form trên web (BD-04). Tránh cho phép confirm khi tồn kho $= 0$ (OD-02 Option A).
3. **[`docs/cookbook/crm.workbook.md`](file:///d:/VibeCode/Oops%20La%20Bookstore/docs/cookbook/crm.workbook.md)**
   - *Áp dụng cho*: Thu thập thông tin khách hàng, số điện thoại Việt Nam hợp lệ, địa chỉ và lịch sử trạng thái đơn hàng.
   - *Guarantees*: Ghi nhận nguồn gốc đơn từ Website (`REQUEST_SOURCE: website`). Cảnh báo quá 48h tự động gắn cờ cho đơn chưa liên hệ.
4. **[`docs/cookbook/documents.workbook.md`](file:///d:/VibeCode/Oops%20La%20Bookstore/docs/cookbook/documents.workbook.md)**
   - *Áp dụng cho*: Soạn thảo bài luận Editorial Journal, quản lý metadata ấn bản chuyên khảo và bản vẽ kỹ thuật tỷ lệ 1:20.
   - *Guarantees*: Trình xem ruột sách Look Inside giữ nguyên tỷ lệ không méo mó, phóng to chi tiết không vỡ hạt.
5. **[`docs/cookbook/booking.workbook.md`](file:///d:/VibeCode/Oops%20La%20Bookstore/docs/cookbook/booking.workbook.md)**
   - *Áp dụng cho*: Luồng tiếp nhận yêu cầu giữ sách sưu tầm (Collector Bag Request Flow) và cơ chế xếp hàng xử lý.
6. **[`docs/cookbook/email.workbook.md`](file:///d:/VibeCode/Oops%20La%20Bookstore/docs/cookbook/email.workbook.md)**
   - *Áp dụng cho*: Định dạng mẫu xuất tin nhắn (Template Formatting) cho kênh chat Messenger/Zalo thay cho email tự động.

---

## 5. Observable Acceptance Criteria (Done Checklist)

Mọi tiêu chí nghiệm thu đều được kiểm chứng cơ học thông qua bộ test tự động (`npm test`):

1. **Look Inside Viewer**: Mở modal xem ruột sách, hình ảnh hiển thị dạng dọc cuộn mượt mà; tính năng click để zoom hoạt động tốt ở tỷ lệ 1:20 của Atelier Bow-Wow (kiểm chứng bằng test `tests/phase3-look-inside.test.ts`).
2. **Collector Request**: Khách gửi form thành công tạo mã `OLS-xxxxxx`; giỏ hàng được làm rỗng; **tồn kho sách không bị giảm**; hiển thị hộp sao chép nội dung tin nhắn gửi Messenger (kiểm chứng bằng test `tests/phase4-collector-flow.test.ts`).
3. **Staff Permission Gate (AC-11)**: Đăng nhập với vai trò Staff -> Mở bảng đơn -> Nút dropdown trạng thái có tùy chọn `CONFIRMED` bị vô hiệu hóa (`disabled`) kèm nhãn `(Chỉ Owner)` (kiểm chứng bằng test `tests/phase5-admin-cms.test.ts`).
4. **Staff Cancellation Guard (OD-01)**: Với đơn đã có trạng thái `CONFIRMED`, nhân viên (Staff) không thể bấm nút Cancel (kiểm chứng bằng test `tests/phase5-admin-cms.test.ts`).
5. **Owner Confirmation & Stock Check (OD-02 & AC-15)**: Đăng nhập với vai trò Owner -> Bấm `CONFIRMED` một đơn có sách tồn kho $= 0$ -> Bị hệ thống chặn lại với popup cảnh báo OD-02; Bấm `CONFIRMED` một đơn có sách tồn kho $\ge 1$ -> Thành công, trạng thái chuyển `CONFIRMED` và tồn kho sách giảm đúng bằng số lượng đặt (kiểm chứng bằng test `tests/production-readiness.test.ts`).
6. **48-Hour Stale Tag**: Đơn hàng ở trạng thái `PENDING_CONTACT` được tạo cách thời điểm hiện tại $> 48$ giờ tự động hiển thị badge màu hổ phách `⚠️ QUÁ 48H CHỜ CỌC` (kiểm chứng bằng test `tests/e2e-smoke-modules.test.ts`).
7. **Single Currency (CURR-01)**: Mọi vị trí hiển thị giá tiền trên toàn bộ ứng dụng (Storefront, Hero, Modal, Checkout, Orders) đều dùng đơn vị `VNĐ` (làm tròn đến hàng chục nghìn đồng), không có switcher tiền tệ USD (kiểm chứng bằng test `tests/phase6-invariants-done.test.ts`).

---

## 6. Execution Instructions for Builder

- **Lệnh lập kế hoạch khuyên dùng**:  
  `/ak:plan docs/BRIEF.md`  
  *(hoặc lệnh CLI tương đương: `ak plan create "Build Plan" --basedir ./plans`)*
- **Kiến trúc tham chiếu**:  
  - Frontend SPA: [`oops_la_book_store_uxui_fixed.html`](file:///d:/VibeCode/Oops%20La%20Bookstore/oops_la_book_store_uxui_fixed.html) & [`dist/index.html`](file:///d:/VibeCode/Oops%20La%20Bookstore/dist/index.html)  
  - Claude Design Mockup: [`design-preview/index.html`](file:///d:/VibeCode/Oops%20La%20Bookstore/design-preview/index.html)
- **Kiểm định chất lượng**:  
  Tuân thủ triệt để `AGENTS.md` (Global Constitution v3.1), đảm bảo `npm test` đạt 68/68 PASS và `npm run check-tri-pillar` đạt 100% HEALTHY.
