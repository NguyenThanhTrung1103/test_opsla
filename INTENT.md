# Intent: Oops La Book Store
schema: intent/v1.1 · depth: D2 · product: new · words: 980

## Need
Chủ hiệu sách kiến trúc Oops La (Owner) và độc giả đam mê sách kiến trúc (Collectors/Architects) cần một nền tảng bán sách chuyên khảo (monographs, sumo editions, bản vẽ 1:20 của Atelier Bow-Wow) mang phong cách Editorial Commerce ("Content First, Commerce Second"). Hiện tại việc vận hành thủ công trên Facebook gây quá tải tư vấn, dễ bán trùng khi sách chỉ có 1 bản duy nhất và thiếu không gian lưu trữ bài viết phân tích kiến trúc chuyên sâu. Mục tiêu: Số hóa bộ sưu tập sách kiến trúc, tự động hóa việc tiếp nhận yêu cầu mua từ website, kiểm soát tồn kho chặt chẽ giữa Facebook và Website.

## Problem
1. Khách mua sách sưu tầm cao cấp cần kiểm tra kỹ tình trạng sách (gáy, bìa, bản vẽ ruột) trước khi xuống tiền, nhưng các sàn TMĐT thông thường chỉ có ảnh thumbnail sơ sài, thiếu trải nghiệm xem ruột sách ("Look Inside") dạng cuộn dọc (vertical scroll).
2. Sách kiến trúc quý hiếm thường chỉ có 1 cuốn duy nhất (ONE_COPY_LEFT). Nhân viên chốt đơn trên Messenger và khách đặt trên web cùng lúc rất dễ bị bán vượt tồn kho (overselling) hoặc nhầm lẫn cọc.
3. Các giải pháp TMĐT có sẵn (Shopify, WooCommerce) ép buộc tích hợp cổng thanh toán online tự động và giỏ hàng thanh toán ngay, làm mất đi tính đối thoại giám tuyển (curation) và không phù hợp với quy trình gửi ảnh thực tế + đặt cọc qua chuyển khoản ngân hàng của tiệm.

## Audience
- **Beachhead**: Kiến trúc sư, sinh viên kiến trúc, nhà thiết kế nội thất, nhà sưu tầm sách nghệ thuật cao cấp tại Việt Nam (TP.HCM, Hà Nội, Đà Nẵng).
- **Personas**:
  - *Người sưu tầm (Collector)*: Săn lùng sách hiếm (SUMO, XXL, bản vẽ chi tiết 1:20); đòi hỏi sách nguyên seal hoặc tình trạng rõ ràng; sẵn sàng đặt cọc trước để giữ sách.
  - *Chủ hiệu sách (Owner)*: Người duy nhất có quyền kiểm tra tài khoản ngân hàng, xác minh khoản thanh toán/đặt cọc và duyệt chuyển trạng thái `CONFIRMED`.
  - *Nhân viên (Staff)*: Quản lý bài viết editorial, cập nhật tồn kho sau khi bán trên Facebook, tư vấn gửi ảnh chụp ruột sách qua Messenger, sơ chế yêu cầu đặt mua.
- **Not-for**: Khách hàng tìm mua sách đại trà giá rẻ; khách muốn bấm mua ngay qua thẻ tín dụng/ví điện tử không cần tư vấn.

## Positioning
- **One line**: Hiệu sách kiến trúc chuyên khảo & tác phẩm giám tuyển cao cấp đầu tiên tại Việt Nam theo chuẩn mực Editorial Commerce.
- **Price anchors**: Từ sách phổ thông (250.000 VNĐ - Atelier Bow-Wow Graphic Anatomy) đến các ấn bản sưu tầm giới hạn SUMO (15.000.000 VNĐ - 38.000.000 VNĐ).
- **Pricing shape**: Đơn vị tiền tệ duy nhất là VNĐ (đồng).
- **Never-say words**: "Xả kho", "Giảm giá sốc", "Mua ngay thanh toán liền", "Cổng thanh toán tự động".

## Facts
1. Tiền tệ duy nhất: VNĐ (làm tròn đến hàng chục nghìn đồng).
2. Hình thức thanh toán: Chuyển khoản ngân hàng trực tiếp qua Messenger / tại tiệm; không tích hợp cổng thanh toán thẻ tự động trong MVP.
3. Không giữ hàng tự động (Zero Auto-Reservation): Khách gửi yêu cầu từ website không làm giảm hay khóa tồn kho.
4. Tồn kho trừ đúng một lần (Single Inventory Decrement): Chỉ khi Owner xác minh tiền cọc và duyệt sang `CONFIRMED`, tồn kho mới giảm.
5. Quy tắc hủy đơn OD-01: Staff và Owner đều được hủy (`CANCELLED`) khi đơn ở `PENDING_CONTACT` hoặc `CONTACTED`. Một khi đã `CONFIRMED`, chỉ duy nhất Owner mới có quyền hủy.
6. Quy tắc xác nhận OD-02: Owner chỉ được duyệt `CONFIRMED` khi tồn kho thực tế $\ge 1$. Nếu tồn kho $= 0$ hoặc chưa kiểm đếm, bắt buộc giữ ở trạng thái Chờ xác minh (Pending Verification).
7. Quy tắc hoàn cọc OD-03: Hoàn tiền trao đổi thủ công ngoài đời; không tạo nút hoặc luồng hoàn cọc online trên CMS trong MVP.
8. Cảnh báo quá hạn: Đơn ở `PENDING_CONTACT` quá 48 giờ tự động gắn cờ cảnh báo `⚠️ QUÁ 48H CHỜ CỌC`.

## Journey
1. Khách hàng khám phá Catalog & Đọc bài viết Editorial (In)
2. Khách mở "Look Inside" xem ảnh ruột sách cuộn dọc và phóng to bản vẽ 1:20 (In)
3. Khách chọn sách vào túi yêu cầu (Collector Bag) và điền form gửi yêu cầu mua (In)
4. Hệ thống tạo mã yêu cầu `OLS-xxxxxx` (trạng thái `PENDING_CONTACT`) và xuất tin nhắn Messenger chuẩn định dạng (In)
5. Nhân viên (Staff) kiểm tra tồn kho tại tiệm, gửi ảnh chụp thực tế qua Facebook Messenger cho khách và nhận cọc (In)
6. Nhân viên cập nhật trạng thái sang `CONTACTED` (In)
7. Chủ tiệm (Owner) đối soát sao kê ngân hàng, xác nhận tiền cọc và kiểm tra kho $\ge 1$ (In)
8. Chủ tiệm chuyển trạng thái đơn sang `CONFIRMED`, hệ thống tự trừ tồn kho đúng 1 lần (In)
9. Trường hợp hủy đơn: Staff/Owner hủy khi đơn chưa confirm; chỉ Owner hủy khi đã confirm (In)
10. Tích hợp cổng thanh toán thẻ online tự động và quản lý vận chuyển liên tỉnh tự động qua API bưu cục (Later)

## Scope
- **In**:
  1. Storefront công khai: Catalog lọc theo thể loại/kích thước (SUMO/Standard), tìm kiếm tức thời theo Tác giả/ISBN/Tiêu đề, Hero Showcase Atelier Bow-Wow, Bài viết Editorial Journal.
  2. Trình xem ruột sách "Look Inside": Cuộn dọc nhiều ảnh liên tục, công cụ phóng to zoom cận cảnh bản vẽ kiến trúc.
  3. Form gửi yêu cầu mua sách: Các trường bắt buộc (Họ tên, SĐT, Địa chỉ, Sách & Số lượng) + Ghi chú tùy chọn. Xuất tin nhắn mẫu gửi Messenger.
  4. Phân quyền Dual-Role trong CMS: Phân định rõ 2 vai trò `Owner` (Chủ tiệm) và `Staff` (Nhân viên).
  5. Quản lý sách & Media trong CMS: CRUD sách, quản lý ảnh bìa/ảnh ruột lưu trữ IndexedDB, cập nhật tồn kho tức thì khi chốt bán ngoài quầy/Facebook.
  6. Quản lý đơn hàng: Vòng đời trạng thái `PENDING_CONTACT` -> `CONTACTED` -> `CONFIRMED` -> `CANCELLED`. Chặn Staff bấm `CONFIRMED`. Kiểm tra tồn $\ge 1$ trước khi `CONFIRMED`. Cảnh báo quá hạn 48h.
- **Out / non-goals**:
  - Không tích hợp cổng thanh toán trực tuyến (Stripe, VNPay, Momo) trong MVP.
  - Không tích hợp API tự động đẩy đơn bưu điện/giao hàng nhanh.
  - Không yêu cầu tài khoản đăng nhập cho người mua (Guest Collector Checkout).
  - Không có tính năng A/B testing suite hoặc bộ công cụ demo prototype trong production code (tuân thủ BRD §15).

## Recipes
- Step 4, 7, 8 (Xác nhận cọc & quản lý trạng thái đơn hàng): `payments` (Domain Pattern: Manual transfer verification, single inventory decrement, offline refund ledger).
- Step 4, 5, 8, 9 (Phân quyền Owner duyệt đơn vs Staff sơ chế): `auth-roles` (Domain Pattern: Role-based authorization, Owner-only CONFIRMED, OD-01 cancellation guard).
- Step 3, 4 (Thu thập thông tin khách hàng và lịch sử liên hệ): `crm` (Domain Pattern: Contact deduplication by phone, pipeline stage history).
- Gaps (Steps with no official recipe):
  - Step 1, 2: Trình xem ruột sách kiến trúc Look Inside cuộn dọc & zoom bản vẽ kỹ thuật (Tự xây dựng theo chuẩn UI Custom Component của dự án).
  - Step 5: Luồng chat tư vấn thủ công qua Facebook Messenger ngoài đời (Vận hành ngoại vi).

## Decisions
- OD-01: Quyền HỦY ĐƠN (CANCELLED) — Lựa chọn A — Staff và Owner đều được hủy khi đơn ở `PENDING_CONTACT` hoặc `CONTACTED`; nhưng một khi đã `CONFIRMED`, chỉ duy nhất Owner mới có quyền hủy để bảo vệ tính toàn vẹn của sổ sách.
- OD-02: Xác minh tồn kho trước khi CONFIRMED — Lựa chọn A — Bắt buộc giữ ở trạng thái Chờ (Pending Verification). Owner chỉ được bấm `CONFIRMED` khi tồn kho thực tế $\ge 1$. Nếu tồn kho $= 0$ hoặc chưa kiểm đếm, chặn không cho confirm.
- OD-03: Hoàn tiền khi hủy đơn — Lựa chọn B (Tối giản MVP) — Không tạo nút hoàn tiền trên CMS; việc hoàn cọc/tiền thừa thực hiện trao đổi miệng và chuyển khoản ngân hàng thủ công ngoài đời.
- BD-01: Tự quyết xuất bản — Lựa chọn A — Cho phép xuất bản sách lên website ngay cả khi chưa có giá hoặc chưa kiểm đếm tồn (hiển thị trạng thái "Liên hệ" / "Chờ xác nhận").
- BD-04: Đặt mua không giữ hàng — Lựa chọn A — Website chỉ ghi nhận nhu cầu; không tự động khóa tồn kho ảo để tránh đọng vốn và xung đột với khách mua trực tiếp tại tiệm.
- CURR-01: Đơn vị tiền tệ — VNĐ duy nhất — Loại bỏ bộ chuyển đổi USD giả lập để bảo đảm trải nghiệm sách kiến trúc thuần nhất tại Việt Nam.

## Done
1. Trên Storefront: Khách hàng tìm thấy sách, bấm "Look Inside" cuộn mượt mà các trang ruột, phóng to bản vẽ chi tiết 1:20 của Atelier Bow-Wow mà không bị vỡ nét.
2. Trên Storefront: Khách thêm sách vào túi và gửi yêu cầu thành công, nhận được mã `OLS-xxxxxx` và hộp sao chép nội dung tin nhắn gửi Facebook Messenger.
3. Trong Admin CMS (Vai trò Staff): Nhân viên thấy danh sách đơn, lọc theo trạng thái, mở xem chi tiết, sao chép tin nhắn; tùy chọn `CONFIRMED` bị khóa màu xám kèm thông báo "Chỉ Owner".
4. Trong Admin CMS (Vai trò Staff): Nhân viên không thể bấm Cancel đối với các đơn đã `CONFIRMED`.
5. Trong Admin CMS (Vai trò Owner): Chủ tiệm chọn vai trò Owner, chuyển được đơn sang `CONFIRMED`; nếu sách có tồn kho $= 0$, hệ thống chặn lại và hiện hộp thoại cảnh báo OD-02; nếu tồn kho $\ge 1$, hệ thống cho phép xác nhận và trừ tồn kho sách đúng 1 lần.
6. Trong Admin CMS: Các đơn ở trạng thái `PENDING_CONTACT` quá 48 giờ hiển thị badge cảnh báo màu hổ phách `⚠️ QUÁ 48H CHỜ CỌC`.
7. Trong Admin CMS: Khi cập nhật tồn kho sách về 0 (ví dụ sau khi bán tại tiệm), sách trên Storefront lập tức chuyển sang nhãn `SOLD_OUT`.

## Open
- Không còn quyết định kinh doanh nào bị bỏ ngỏ. ADC-001 đã chính thức được Unfreeze bởi Owner.

