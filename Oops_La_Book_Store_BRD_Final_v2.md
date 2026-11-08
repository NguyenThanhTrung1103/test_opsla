# BUSINESS REQUIREMENTS DOCUMENT (BRD)
## Oops La Book Store — Editorial Commerce MVP

| Thuộc tính | Giá trị |
|---|---|
| Mã tài liệu | BRD-OLS-002 |
| Phiên bản | **v2.0 — Final business baseline** |
| Ngày | 04/11/2026 |
| Nguồn | `Oops_La_Book_Store_BRD_MVP_v1.md`; prototype `oops_la_book_store_uxui_fixed.html`; ADC-001 v1.1; BDL-001 v1.4 và quyết định từ các vòng review |
| Quyết định sản phẩm | **Editorial / Content First, Commerce Second** |
| Phạm vi | Website công khai + CMS nội bộ; đặt hàng dạng yêu cầu, xác nhận thủ công |
| Trạng thái | **BRD baseline được chốt để quản lý yêu cầu; ADC-001 vẫn ON HOLD; chưa cho phép triển khai code** |
| Quy tắc kiểm soát | Không suy diễn hai quy tắc chưa được quyết định ở §12 |

> **Cách hiểu chữ “Final”:** Các lựa chọn nghiệp vụ đã được xác nhận trong cuộc trao đổi được hợp nhất và đóng băng trong bản này. “Final” không có nghĩa mọi ngoại lệ đã được duyệt hoặc cho phép bắt đầu xây dựng. Phải giải quyết các điểm mở ở §12 trước khi khóa logic tương ứng.

---

## 1. Executive summary

Oops La Book Store là website giới thiệu và tiếp nhận yêu cầu mua sách kiến trúc, monograph và các ấn bản sưu tầm. Lợi thế khác biệt của cửa hàng là nội dung Editorial từ fanpage: kể chuyện về sách bằng nội dung chuyên sâu, ảnh thật, ảnh ruột sách, chi tiết kỹ thuật và mô tả hình thức vật lý.

MVP gồm:

1. **Storefront:** khách khám phá danh mục, tìm sách, đọc trang chi tiết Editorial, xem ảnh cuộn dọc/phóng to, chọn sách và gửi yêu cầu mua qua form website.
2. **CMS:** Owner/Staff đăng nhập riêng, quản lý sách, hình ảnh, bài editorial, giá và tồn kho; xem và xử lý yêu cầu mua phát sinh từ form website.
3. **Vận hành ngoài hệ thống:** Facebook có thể dùng để tư vấn và chốt bán độc lập; đơn Facebook **không bắt buộc** đưa vào CMS. Nhân viên cập nhật tồn kho CMS **ngay khi chốt bán Facebook, trước khi xác nhận yêu cầu website**. Owner xác minh khoản thanh toán/đặt cọc và là người duy nhất có quyền chuyển đơn website thành `CONFIRMED`.

Không tích hợp cổng thanh toán, Messenger API, giao vận tự động, ERP hoặc CRM trong MVP.

## 2. Mục tiêu và thước đo

| Mã | Mục tiêu | Kiểm tra có thể quan sát |
|---|---|---|
| BG-01 | Hiển thị nội dung sách theo phong cách Editorial | Trang sách published hiển thị nội dung và ảnh theo trục dọc; ảnh có thể phóng to; caption tùy chọn |
| BG-02 | Khách gửi được yêu cầu mua trên website | Form hợp lệ tạo một yêu cầu trong CMS, có phản hồi thành công; không tự giữ hay trừ kho |
| BG-03 | Cửa hàng quản lý đơn website và tồn kho tập trung | Owner/Staff thấy dữ liệu server dùng chung; nhân viên cập nhật kho sau bán Facebook |
| BG-04 | Owner kiểm soát xác nhận đơn | Staff không thể `CONFIRMED`; Owner chỉ xác nhận khi đã xác minh thanh toán/đặt cọc và các điều kiện kho phù hợp |
| BG-05 | Không over-engineer | Không phát triển những nội dung ngoài scope tại §5 |

**Giới hạn đo lường có chủ đích:** MVP **chưa** đo khả năng khách hiểu sâu nội dung sách, tỷ lệ chuyển đổi hay hành vi mua. UAT chỉ kiểm chứng khách xem được nội dung và gửi yêu cầu mua thành công. Không được tuyên bố MVP đã cải thiện hiểu biết của khách nếu chưa có nghiên cứu riêng.

## 3. Người dùng và quyền nghiệp vụ

| Vai trò | Nhu cầu / trách nhiệm | Giới hạn |
|---|---|---|
| Visitor/Customer | Xem sách, đọc Editorial, xem ảnh, gửi yêu cầu mua | Không cần tài khoản; không truy cập CMS |
| Staff | Quản lý nội dung/sách và kho theo phạm vi được giao, xem/xử lý yêu cầu website; cập nhật tồn sau bán Facebook | **Không được chuyển đơn thành `CONFIRMED`** |
| Owner | Quản lý vận hành, xác minh thanh toán/đặt cọc và quyết định xác nhận đơn | **Chỉ Owner được `CONFIRMED`**; quyền `CANCELLED` vẫn là điểm mở |

Owner và Staff dùng tài khoản đăng nhập riêng. Kiểm tra quyền phải thực thi ở server, không chỉ ẩn nút UI. **Chưa chốt** ai có quyền hủy đơn và hành vi đối với đơn đã xác nhận; xem §12.

## 4. Nguyên tắc trải nghiệm: Editorial-first

### 4.1 Trang chi tiết sách

Thiết kế theo cảm giác đọc một bài giới thiệu sách trên fanpage: cuộn dọc, ảnh sách thật có kích thước lớn, bố cục thoáng, mô tả giàu ngữ cảnh, nút gửi yêu cầu rõ ràng. Không sao chép giao diện mạng xã hội, lượt thích hoặc bình luận.

- Cho khách xem tên sách, thông tin thương mại **nếu có**, nội dung Editorial và ảnh được Owner/Staff cung cấp.
- Ảnh xuất hiện theo thứ tự biên tập, cuộn dọc; nhấn ảnh để phóng to, đóng để quay lại trang.
- Caption **không bắt buộc**. Không áp đặt số ảnh hoặc độ dài nội dung tối thiểu.
- Giá và tồn kho **có thể chưa được xác nhận**; sách vẫn được published và vẫn có thể nhận yêu cầu mua. Giao diện không được tạo ấn tượng sai là giá/khả năng giao hàng đã được cam kết.
- Thao tác mua là **gửi yêu cầu**, không phải thanh toán trực tuyến hay cam kết giữ hàng.

### 4.2 Golden sample nội dung

Sử dụng bài fanpage **Graphic Anatomy 1 — Atelier Bow-Wow** và bộ ảnh demo đã cung cấp làm mẫu tham chiếu nội dung, không phải một checklist bắt buộc áp cho mọi sách. Dữ liệu mẫu trong bài: **156 trang, 24 mẫu thiết kế, 26 × 26 × 1,5 cm, giá công bố tại thời điểm bài viết 1.150.000 VNĐ**. Các thông tin giá, tồn và khuyến mại phải được nhân viên xác nhận lại trước khi sử dụng làm thông tin bán hàng hiện hành.

Bộ ảnh minh họa gồm bìa ngoài, bìa cứng xanh và ảnh ruột/bản vẽ. Không có yêu cầu mỗi sách phải có đủ các loại ảnh tương tự. Ưu đãi freeship từ bài đăng không mặc nhiên là chính sách còn hiệu lực. Cần bảo đảm quyền sử dụng ảnh/nội dung trước khi xuất bản.

### 4.3 Quyền quyết định xuất bản

**Owner/Admin quyết định từng sách đủ điều kiện xuất bản hay chưa; không có bộ điều kiện nội dung cố định.** Sách chưa có giá hoặc chưa xác nhận tồn vẫn có thể xuất bản và nhận yêu cầu mua. Các trường hệ thống tối thiểu để định danh/lưu bản ghi là vấn đề kỹ thuật nhập liệu, không được biến thành hàng rào nội dung không được PO duyệt.

## 5. Phạm vi MVP

### 5.1 In scope

- Trang chủ, danh mục sách, tìm kiếm/lọc/sắp xếp ở mức đơn giản, trang chi tiết Editorial và gallery ảnh.
- Chọn sách/số lượng, giỏ hàng nếu có nhiều sách, form gửi yêu cầu mua website, xác nhận tiếp nhận.
- Form yêu cầu: **họ tên, số điện thoại, địa chỉ giao hàng, sách và số lượng bắt buộc; ghi chú tùy chọn**.
- CMS đăng nhập Owner/Staff, quản lý sách, giá, trạng thái published, ảnh, bài editorial, tồn kho và yêu cầu mua website.
- Tồn kho một nguồn logic trên CMS, nhân viên cập nhật thủ công sau giao dịch Facebook.
- Trạng thái đơn và quyền xác nhận theo §7; xử lý việc giao/thu tiền ngoài hệ thống.
- Bảo mật cơ bản, lưu trữ server, sao lưu, responsive và khả năng bàn giao vận hành.

### 5.2 Out of scope

- Thanh toán online, tự động đối soát ngân hàng, tự hoàn cọc, tích hợp đơn vị vận chuyển.
- Tích hợp Messenger/Facebook API, tự động tạo đơn Facebook trong CMS, đồng bộ đa kênh.
- Tài khoản khách hàng, loyalty, wishlist, AI recommendations, CRM, ERP, POS, đa kho.
- Trình lật sách 3D, gallery phức tạp, A/B-testing engine, page builder, workflow engine, dashboard KPI giả lập.
- Hệ thống nghiên cứu/đo lường khả năng khách hiểu sâu nội dung sách trong MVP.

## 6. Luồng nghiệp vụ chính

### 6.1 Website → yêu cầu mua

1. Khách vào catalog, chọn sách, đọc nội dung Editorial và xem ảnh.
2. Khách chọn sách, số lượng; mở form và nhập họ tên, điện thoại, địa chỉ giao hàng; ghi chú nếu muốn.
3. Hệ thống kiểm tra trường bắt buộc và ghi một yêu cầu mới vào dữ liệu server.
4. Khách nhận phản hồi yêu cầu đã được ghi nhận, **không phải** xác nhận mua thành công hoặc thanh toán thành công.
5. Staff/Owner xem yêu cầu trong CMS và liên hệ để làm rõ giá, tồn, giao hàng/thanh toán nếu cần.
6. Owner xác minh thanh toán hoặc đặt cọc; chỉ Owner có quyền quyết định `CONFIRMED` theo điều kiện xác nhận đã đủ rõ. Việc xác nhận khi tồn chưa rõ là **open issue**, không tự suy diễn.

### 6.2 Facebook → bán ngoài website

1. Khách có thể nhắn tin hỏi hoặc mua qua Facebook.
2. Nhân viên có thể xử lý bán ngoài website; **không bắt buộc tạo đơn trong CMS**.
3. **Ngay khi chốt bán Facebook**, nhân viên cập nhật tồn kho tương ứng trong CMS **trước khi tiếp tục xác nhận đơn website**.
4. Hệ thống website chỉ dùng tồn đã được cập nhật; không có tự động đồng bộ Facebook.

### 6.3 Không cung cấp được sách

Khi xác định không thể cung cấp sách cho một yêu cầu đã nhận cọc, đơn được chuyển sang `CANCELLED` theo quyết định đã chốt. **Quyền thao tác chuyển `CANCELLED`, quy trình hoàn cọc, việc hoàn tồn sau hủy và trường hợp chờ xử lý vẫn chưa được chốt đầy đủ**; không tự gán quyền hoặc tự thực hiện hoàn tiền.

## 7. Business rules

| ID | Quy tắc |
|---|---|
| BR-01 | Việc khách gửi form website tạo **yêu cầu mua**; không tự đặt chỗ, giữ hàng hoặc trừ tồn. |
| BR-02 | Facebook có thể bán ngoài CMS; chỉ form website tạo yêu cầu mua trong CMS theo phạm vi đã chốt. |
| BR-03 | Sau chốt bán Facebook, **Staff cập nhật tồn CMS ngay**, trước khi xác nhận đơn website. |
| BR-04 | Với một cuốn cuối, yêu cầu gửi trước **không** được ưu tiên giữ hàng; đơn hợp lệ được xác nhận trước mới được ưu tiên cung cấp. |
| BR-05 | `CONFIRMED` yêu cầu khách đã **thanh toán hoặc đặt cọc**, được **Owner xác minh và quyết định**; Staff không có quyền. |
| BR-06 | Một đơn được xác nhận không được làm tồn kho âm; việc trừ tồn chỉ xảy ra **một lần** khi xác nhận hợp lệ. |
| BR-07 | Sách chưa có giá hoặc chưa xác định được tồn vẫn có thể published và nhận yêu cầu; thông tin cuối cùng do cửa hàng xác nhận sau. |
| BR-08 | Chủ cửa hàng quyết định trường hợp đã nhận cọc nhưng không còn sách; khi xác định **không thể cung cấp**, trạng thái là `CANCELLED`. |
| BR-09 | Form yêu cầu mua bắt buộc họ tên, số điện thoại, địa chỉ, sách và số lượng; ghi chú tùy chọn. |
| BR-10 | Trang Editorial ảnh cuộn dọc, mở lớn khi nhấn, caption không bắt buộc; không áp số ảnh/độ dài nội dung cố định. |
| BR-11 | Đơn từ form website phải được lưu vào backend trước khi báo gửi thành công; không lưu đơn production chỉ ở LocalStorage/IndexedDB. |

**Không được coi là đã chốt:** (a) Staff hay Owner có quyền `CANCELLED`; (b) Owner có được `CONFIRMED` khi tồn chưa xác minh nhưng đã nhận cọc; (c) cách hoàn cọc/hoàn tồn sau `CANCELLED`. Xem §12.

## 8. Functional requirements (được ưu tiên)

| ID | P | Yêu cầu | Kết quả mong đợi |
|---|---|---|---|
| FR-01 | P0 | Catalog / search / filter cơ bản | Khách tìm và mở được sách đã published; có trạng thái không kết quả |
| FR-02 | P0 | Trang sách Editorial | Nội dung và ảnh hiển thị cuộn dọc, có CTA gửi yêu cầu |
| FR-03 | P0 | Image viewer | Nhấn phóng to và đóng ảnh; caption có thể để trống |
| FR-04 | P0 | Xuất bản và quản lý sách | Owner/Admin chủ động publish; không chặn vì thiếu giá/tồn xác nhận hay số ảnh/độ dài cứng |
| FR-05 | P0 | Quản lý media | Upload/sắp thứ tự/hiển thị ảnh; xử lý lỗi ảnh cơ bản |
| FR-06 | P0 | Giỏ hàng / số lượng | Khách xác định sách và số lượng cần hỏi mua; chưa giữ tồn |
| FR-07 | P0 | Form gửi yêu cầu | Thu đủ 5 nhóm thông tin bắt buộc, lưu đơn server và phản hồi thành công |
| FR-08 | P0 | CMS đăng nhập | Owner và Staff đăng nhập riêng; chặn truy cập không được phép |
| FR-09 | P0 | Quản lý đơn website | Xem, tìm, cập nhật trạng thái hợp lệ; không tự nhập đơn Facebook |
| FR-10 | P0 | Xác nhận đơn | Chỉ Owner được `CONFIRMED` sau xác minh thanh toán/đặt cọc và điều kiện tồn tương ứng |
| FR-11 | P0 | Quản lý tồn kho | Staff sửa tồn sau bán Facebook; dữ liệu lưu server và hiển thị thống nhất |
| FR-12 | P0 | Nội dung Editorial khác | Quản trị bài editorial ở mức cần cho nội dung/câu chuyện sách; không cần page builder |
| FR-13 | P0 | Trang thông tin chính sách và liên hệ | Nêu rõ yêu cầu mua chưa phải thanh toán; chính sách giao hàng, liên hệ và dữ liệu cá nhân |
| FR-14 | P0 | Vận hành production cơ bản | Responsive, HTTPS, quyền server-side, backup và log lỗi tối thiểu |
| FR-15 | P1 | Trang chủ chọn sách nổi bật | Không cần tùy biến layout bằng CMS |
| FR-16 | P1 | Xuất dữ liệu đơn tối thiểu | Chỉ nếu có nhu cầu vận hành thực tế; không bao gồm báo cáo phân tích nâng cao |

**Khác với BRD v1.0:** Không giả định mọi sách phải có giá, tồn và ảnh ruột đầy đủ để published; không dùng trạng thái đơn `CONFIRMED` khi nhân viên chỉ liên hệ và thống nhất giao hàng; không bắt buộc nhập đơn Facebook vào CMS; Owner/Staff **không cùng quyền**.

## 9. Order state & inventory — phạm vi đã chốt

Trạng thái tham chiếu giữ từ BRD v1.0/prototype: `PENDING_CONTACT`, `CONTACTED`, `CONFIRMED`, `CANCELLED`.

- Khi submit form: tạo yêu cầu chưa xác nhận; **không** trừ tồn.
- `CONFIRMED`: chỉ Owner sau khi xác minh **đã thanh toán hoặc đặt cọc**; nếu đủ điều kiện tồn thì trừ tồn **đúng một lần**.
- Khi tồn không đủ: không cho xác nhận làm âm kho hay bán cùng một cuốn cuối hai lần.
- `CANCELLED` khi không thể cung cấp sách theo quyết định kinh doanh; **ai có quyền bấm hủy và cách xử lý tài chính sau hủy vẫn là open issue**.
- Quy tắc `AVAILABLE / ONE_COPY_LEFT / SOLD_OUT / PRE_ORDER / COMING_SOON` trong prototype có thể được dùng làm nhãn hiển thị, nhưng **không được** dùng để vô hiệu hóa quyết định cho phép xuất bản và gửi yêu cầu đối với sách chưa có giá/tồn xác nhận.

Không tự thêm trạng thái mới như `PAYMENT_PENDING`, `REFUNDED`, `RESERVED` hoặc logic auto-refund trong MVP.

## 10. Dữ liệu nghiệp vụ tối thiểu (conceptual, chưa khóa DB schema)

| Nhóm | Dữ liệu cần phản ánh |
|---|---|
| Book | Định danh, tên, người sáng tác/kiến trúc sư, mô tả Editorial, giá nếu đã biết, tồn nếu đã biết, xuất bản, các thông số khác nếu có |
| BookMedia | Sách liên quan, ảnh, thứ tự, caption tùy chọn |
| Article | Tiêu đề, nội dung, trạng thái xuất bản; liên kết sách nếu cần |
| Order | Mã yêu cầu, khách hàng, số điện thoại, địa chỉ, ghi chú, trạng thái, nguồn **website**, thời điểm tạo |
| OrderItem | Sách, số lượng, thông tin niêm yết tại thời điểm gửi khi có dữ liệu |
| AdminUser | Định danh đăng nhập và vai trò `OWNER` hoặc `STAFF` |

**Chưa khóa:** cấu trúc bảng/cột, nhà cung cấp auth, API, framework; schema phải hỗ trợ trạng thái **giá chưa có** và **tồn chưa xác nhận** thay vì mặc định thành `0` hay miễn phí.

## 11. Acceptance criteria / UAT

### 11.1 Đã đủ rõ về hành vi (testable)

| ID | Given / When | PASS khi |
|---|---|---|
| AC-01 | Admin published sách không đủ số ảnh/độ dài mô tả mẫu | Không bị chặn bởi mức cố định nào |
| AC-02 | Mở trang sách có nhiều ảnh | Ảnh được trình bày theo trục dọc |
| AC-03 | Nhấn ảnh, rồi đóng | Ảnh được phóng to và trở lại trang sách |
| AC-04 | Ảnh không có caption | Ảnh vẫn hiển thị bình thường |
| AC-05 | Khách mở liên kết Facebook | Không tự sinh một order trong CMS |
| AC-06 | Admin xuất bản sách chưa có giá hoặc chưa xác minh tồn | Sách vẫn có thể published và khách có thể gửi yêu cầu |
| AC-07 | Khách submit yêu cầu mua | Không giữ hàng, không tự trừ tồn |
| AC-08 | Staff thay đổi tồn sau giao dịch Facebook | Giá trị mới được lưu server và xuất hiện đúng trên CMS |
| AC-09 | Form thiếu họ tên, điện thoại, địa chỉ, sách hoặc số lượng | Form không báo gửi thành công; chỉ ra dữ liệu thiếu |
| AC-10 | Form có đủ trường bắt buộc và dữ liệu hợp lệ | Một yêu cầu website được lưu server và có phản hồi thành công |
| AC-11 | Staff thử thao tác `CONFIRMED` | Bị từ chối ở tầng xử lý có quyền, kể cả gọi trực tiếp endpoint |
| AC-12 | Owner/Staff đăng nhập bằng tài khoản riêng | Hệ thống xác định đúng vai trò; không dùng chung quyền `CONFIRMED` |
| AC-13 | Sau bán cuốn cuối trên Facebook, Staff cập nhật tồn về 0 | Tồn lưu là 0; đơn website chờ không tự `CONFIRMED`; không xác nhận dựa vào tồn cũ |
| AC-14 | Hai yêu cầu website cùng muốn một cuốn cuối đã xác minh còn 1 | Không có hai xác nhận thành công cùng sử dụng một cuốn tồn; không âm kho |
| AC-15 | Owner xác nhận hợp lệ một đơn có đủ tồn sau xác minh đã thanh toán/đặt cọc | Đơn `CONFIRMED` và tồn giảm đúng một lần, thao tác lặp không trừ lần nữa |
| AC-16 | Đã xác định không thể cung cấp sách | Kết quả nghiệp vụ cần ghi nhận là `CANCELLED` (người được thao tác chưa chốt) |

Các tiêu chí có chữ “hợp lệ” phụ thuộc vào kiểm tra định dạng cơ bản của điện thoại/số lượng ở giai đoạn đặc tả chi tiết; không tự nâng yêu cầu thành OTP/SMS verification.

### 11.2 Chưa khóa PASS/FAIL vì thiếu quyết định

| ID | Kịch bản | Chưa thể nghiệm thu vì |
|---|---|---|
| UAT-OI-01 | Hủy đơn đã xác nhận / đã nhận cọc | Chưa quyết định **Owner-only hay Staff được `CANCELLED`**, hoàn cọc và hoàn tồn trong từng tình huống |
| UAT-OI-02 | Khách đã cọc, tồn chưa xác nhận | Chưa quyết định **Owner được `CONFIRMED` ngay hay phải chờ xác minh có hàng** |

**Không đưa UAT-OI-01 và UAT-OI-02 vào danh sách PASS bắt buộc khi các quyết định tương ứng chưa tồn tại; cũng không xem chúng là đã nghiệm thu.**

## 12. Open Decision Register — giữ nguyên, không tự quyết

| ID | Điểm mở | Hệ quả | Người cần quyết định |
|---|---|---|---|
| **OD-01** | Ai được chuyển `CANCELLED`: Owner, Staff, hay phân biệt trước/sau `CONFIRMED`? | Ảnh hưởng authorization và UAT hủy | Owner |
| **OD-02** | Khách đã đặt cọc nhưng chưa xác minh được tồn: Owner có được chuyển `CONFIRMED` hay phải giữ chờ? | Ảnh hưởng tính đúng đắn của `CONFIRMED` và trừ tồn | Owner |
| **OD-03** | Hệ thống ghi nhận thế nào việc hoàn cọc/hoàn tồn sau `CANCELLED`? | Ảnh hưởng SOP; không mặc định xây refund feature | Owner / vận hành |

**Ranh giới chốt scope:** Được phép lấy các quy tắc đã quyết định làm baseline yêu cầu. Không triển khai các nhánh nghiệp vụ phụ thuộc OD-01/OD-02/OD-03 theo suy đoán của developer hoặc AI agent.

## 13. Non-functional requirements (vừa đủ production)

| Nhóm | Yêu cầu |
|---|---|
| Bảo mật | HTTPS, auth Owner/Staff, phân quyền server-side, bảo vệ dữ liệu cá nhân đơn hàng, kiểm tra đầu vào, giới hạn request phù hợp |
| Dữ liệu | Một nguồn dữ liệu server; không dùng LocalStorage/IndexedDB làm nguồn sự thật cho đơn/kho/media production |
| Đồng thời | Cập nhật `CONFIRMED` và trừ tồn nhất quán, không xác nhận vượt số lượng còn thực tế |
| Trải nghiệm | Mobile-first, thao tác ảnh bằng chạm và bàn phím, thông báo lỗi rõ, ảnh được tối ưu dung lượng |
| Vận hành | Backup cơ bản, hướng dẫn khôi phục, log lỗi vừa đủ, không log PII tùy tiện |
| SEO | URL/metadata cho trang public; không index CMS, không cần search engine chuyên biệt |

Không ấn định SLA, tỉ lệ conversion hoặc ngưỡng performance chưa được người dùng chốt làm điều kiện nghiệm thu nghiệp vụ. Các mục này có thể xác lập riêng ở technical acceptance nếu cần.

## 14. Đầu ra cần bàn giao khi được phép triển khai (không phải lệnh code)

1. Website public hoạt động với catalog, trang sách Editorial, viewer ảnh và form yêu cầu mua.
2. CMS Owner/Staff với chức năng sách, ảnh, bài editorial, đơn website và cập nhật kho thủ công.
3. Backend lưu dữ liệu tập trung, kiểm soát quyền theo vai trò, thao tác xác nhận/kho nhất quán.
4. Danh sách test cases và bằng chứng UAT theo §11; các điểm mở được quyết định trước khi test nhánh tương ứng.
5. Repository, tài liệu setup/deploy, cấu hình môi trường mẫu, migration nếu dùng DB, hướng dẫn backup/restore và vận hành.

## 15. Guardrails chống over-engineering

- Một ứng dụng full-stack và một cơ sở dữ liệu dùng chung là định hướng đủ dùng; **chưa khóa framework hay cloud provider**.
- Không microservices, message queue, event sourcing, realtime socket, ERP hay đa kho.
- Không CMS page-builder, trình lật sách 3D, AI viết content hay tích hợp Messenger tự động.
- Không bắt khách tạo tài khoản hoặc tự thanh toán trên website.
- Không đưa những yêu cầu demo của HTML prototype (A/B lab, KPI mô phỏng, chuyển USD/VND tỷ giá giả) vào production mặc định.
- Không sửa quy tắc kinh doanh để làm cho code thuận tiện: các ngoại lệ chưa chốt vẫn là open decision.

## 16. Traceability & Change Log

| Nguồn / quyết định | Kết quả ở BRD v2.0 |
|---|---|
| BRD MVP v1.0 | Giữ cấu trúc website + CMS và mô hình request commerce; sửa quy tắc đã thay đổi |
| ADC-001 v1.1 | Trang sách **Editorial-first**, không dùng viewer lật trang phức tạp |
| MVBC-001 | Bài Graphic Anatomy 1 và bộ ảnh làm golden sample, **không** là checklist nội dung cứng |
| BD-01 đến BD-06 | Tự quyết published; ảnh cuộn/zoom; chỉ form website tạo order; không giữ hàng; cọc/thanh toán trước `CONFIRMED`; không đo hiểu sách |
| BD-07 đến BD-09 | Facebook bán ngoài CMS; Owner xác minh và quyết định `CONFIRMED`; sách chưa rõ giá/tồn vẫn nhận request |
| BD-10 đến BD-12 | Staff cập nhật tồn sau Facebook, **ngay khi chốt bán và trước xác nhận website**; chủ cửa hàng xử lý hết hàng đã cọc từng trường hợp |
| BD-13 đến BD-15 | Không cung cấp được thì `CANCELLED`; form đủ địa chỉ; Owner/Staff đăng nhập riêng |
| R-01 / R-02 chưa có câu trả lời | Giữ thành **OD-01 / OD-02**; không suy diễn |

---

### Final decision record

- **BRD-OLS-002 v2.0:** Baseline nghiệp vụ cuối của những nội dung đã xác nhận trong hội thoại.
- **ADC-001 v1.1:** **ON HOLD** theo quyết định đã ghi nhận; **không** xem BRD Final là lệnh duyệt ADC.
- **Phát triển code:** **CHƯA ĐƯỢC CHO PHÉP** trong cuộc trao đổi này.
- **Open decisions:** OD-01, OD-02 và OD-03 được ghi rõ; không tự tạo chính sách hoặc tính năng để lấp khoảng trống.
