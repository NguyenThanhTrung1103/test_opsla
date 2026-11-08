# Báo cáo review source và bàn giao khắc phục — Oops La Book Store

## 1. Tóm tắt và phạm vi

- Ngày báo cáo: 07/11/2026.
- Người review: Codex, theo chỉ định trực tiếp của người dùng khi Opus hết quota. Không phải lượt review độc lập bằng Claude Opus.
- Kết luận review tĩnh: **CHƯA SẴN SÀNG vận hành production**. Có lỗi gọi hàm không tồn tại, dữ liệu backend không bền vững, frontend chưa tích hợp và các rủi ro phân quyền/toàn vẹn kho.
- Cơ sở: toàn bộ `src/`, hai file `docs/ai-memory/Journal.md` và `handoff.md`, package manifest, cấu hình deploy; đối chiếu BRD/INTENT và các luồng chính trong HTML mockup. Không khẳng định đã audit từng dòng toàn bộ HTML, tests hoặc mã bên thứ ba trong `Cookbook/`.
- Không chạy test, build, server, migration, g8s hoặc deploy trong lượt review. Các kết quả PASS cũ là thông tin lịch sử, không phải bằng chứng xác minh mới.
- Báo cáo này ghi nhận phát hiện và đề xuất bàn giao; **không tự phê duyệt rewrite, chọn công nghệ, thay đổi nghiệp vụ hoặc triển khai production**.
- Các đường dẫn dưới đây tương đối với repository; số dòng tham chiếu snapshot được đọc, cần kiểm tra lại khi code thay đổi. Working tree được quan sát có nhiều file untracked; phải giữ nguyên công việc hiện có, không reset/clean tùy tiện.

## 2. Authority và các điểm cần làm rõ trước khi code

Đọc `AGENTS.md`, `docs/WORKFLOW.md`, `.specify/memory/constitution.md`, BRD, `INTENT.md`, `docs/BRIEF.md` và AI Memory trước khi triển khai.

Các tài liệu hiện không hoàn toàn đồng nhất:

1. BRD §7/§13 yêu cầu dữ liệu server tập trung, bền vững; INTENT Scope lại mô tả quản lý ảnh bằng IndexedDB. Không lấy lựa chọn prototype làm quyền bỏ yêu cầu lưu trữ production trên server.
2. BRD còn ghi OD-01/02/03 mở và ADC-001 ON HOLD; INTENT/Journal ghi các quyết định đã chốt và đã unfreeze. Phải xác nhận nguồn phê duyệt được chấp nhận trước khi sửa các nhánh nghiệp vụ đang xung đột; báo cáo không phủ nhận hay tự xác nhận lịch sử phê duyệt đó.
3. Cần thống nhất frontend canonical: hoàn thiện mockup hay ghép các module `src/`. Chọn một luồng ứng dụng được duy trì, tránh hai bộ logic đơn/kho khác nhau.
4. Lựa chọn storage/auth/framework chưa được báo cáo này quyết định. Đề xuất giải pháp tối thiểu phù hợp môi trường thực tế; không tự thêm SDK/provider, microservices hoặc dịch vụ ngoài phạm vi đã cho phép.

Các yêu cầu đã rõ để dùng làm căn cứ: BRD BR-01/BR-06/BR-09/BR-11, FR-04 đến FR-14, AC-06/08/10/11/12/14/15; INTENT Decisions và Done sau khi giải quyết xung đột authority.

## 3. Phát hiện cần khắc phục

P1: chặn chức năng cốt lõi hoặc gây rủi ro dữ liệu/quyền đáng kể. P2: chức năng chưa đủ, an toàn hoặc vận hành cần hoàn thiện. Đây là mức ưu tiên review, không phải chứng nhận khai thác thực tế.

### R01 — P1: API xác nhận/hủy gọi method không tồn tại

- Bằng chứng: `src/server/app.ts:123` gọi `orderService.confirmOrder(...)`, dòng 138 gọi `cancelOrder(...)`. `src/services/orderService.ts:103` chỉ triển khai `transitionOrderStatus(...)`.
- Hệ quả: request tới lời gọi này ném TypeError và trả HTTP 500; request confirm không có token dừng ở 401 nên không chứng minh nhánh duyệt chạy được.
- Hướng xử lý: thống nhất contract route/service, bao gồm kiểu kết quả và ánh xạ lỗi; không chỉ đổi tên hàm rồi giữ nguyên giả định `{ success, error, order }` không có trong service.
- Nghiệm thu đề xuất: tạo đơn qua HTTP rồi xác nhận/hủy bằng quyền hợp lệ thành công; trường hợp sai quyền, đơn không tồn tại và thiếu kho trả lỗi có kiểm soát. Không có lỗi method undefined.

### R02 — P1: Dữ liệu backend chỉ nằm trong RAM

- Bằng chứng: `src/storage/indexed-db.ts:16-26` dùng `Map` khi không có IndexedDB; Node server nhập chính adapter này. Không có backend database bền vững trong luồng được review.
- Hệ quả: restart làm mất đơn, lịch sử và thay đổi tồn; catalog có thể được seed lại. Nhiều process không dùng chung dữ liệu.
- Authority: BRD BR-11, FR-11/14 và §13.
- Hướng xử lý: lưu đơn/kho/catalog/media cần thiết vào nguồn server bền vững; xác định migration, backup/restore và quyền truy cập. Không âm thầm fallback sang RAM khi storage production lỗi.
- Nghiệm thu đề xuất: tạo đơn, sửa tồn, restart process vẫn giữ đúng dữ liệu; lỗi ghi storage không được báo gửi thành công; phục hồi bản sao trong môi trường cô lập bảo toàn quan hệ đơn/kho.

### R03 — P1: Thiếu frontend entrypoint và artifact triển khai

- Bằng chứng: `dist/` hiện chỉ có hai ZIP harness; `app.ts:146` và `deploy/nginx.conf:33` yêu cầu `dist/index.html`. `package.json` không có build frontend. Các component trong `src/components/` xuất chuỗi HTML nhưng chưa có entrypoint gắn chúng vào DOM và nối sự kiện.
- Hệ quả: cấu hình hiện tại không cung cấp được website hoàn chỉnh tại `/`; nút có trong template không đồng nghĩa luồng tương tác đã hoạt động.
- Hướng xử lý: hoàn thiện entrypoint, stylesheet/assets, routing và cách tạo artifact tái lập được. Không đưa ZIP tooling vào public artifact.
- Nghiệm thu đề xuất: fresh checkout theo hướng dẫn tạo được artifact; trang chủ, search/filter, viewer, giỏ, form và CMS hoạt động qua trình duyệt với API thật.

### R04 — P1: Mockup lưu đơn cục bộ và không gửi backend

- Bằng chứng: `oops_la_book_store_uxui_fixed.html:4109` là định nghĩa submit phía sau; dòng 4177 thêm vào `state.orders`, làm rỗng giỏ và gọi `saveState()`. `saveState():2354` ghi LocalStorage. Luồng này không gọi API. Đơn còn đánh dấu `isSimulatedDemo: true` và dùng mã `OOPS-...` thay vì `OLS-...`.
- Hệ quả: khách thấy receipt nhưng cửa hàng ở thiết bị khác không nhận đơn; schema/mã đơn khác service TypeScript.
- Hướng xử lý: chỉ báo tiếp nhận sau khi backend ghi thành công; dùng contract thống nhất. Khi mạng/API lỗi phải giữ thông tin để khách thử lại, không xóa giỏ như đã thành công.
- Nghiệm thu đề xuất: khách gửi đơn trên browser A, nhân viên thấy trên browser B; API lỗi không tạo receipt thành công. Quy định cách xử lý gửi lặp/retry để tránh nhân đôi đơn ngoài ý muốn.

### R05 — P1: Xác thực và phân quyền chưa đủ

- Bằng chứng: `app.ts:131-138` coi token thiếu/sai là `STAFF` rồi tiếp tục hủy; `app.ts:23` có secret mặc định; `permissionGuard.ts:12` mặc định OWNER; HTML có `switchAdminRole()` đổi vai trò bằng client state.
- Hệ quả: route hủy không có cổng xác thực Staff. Hiện R01 làm request lỗi trước khi hủy; sửa R01 riêng lẻ sẽ để lộ nhánh quyền sai. Role switcher chỉ mô phỏng UI, không phải danh tính đã xác thực.
- Authority: BRD FR-08, AC-11/12 và §13.
- Hướng xử lý: xác định người dùng/vai trò từ cơ chế server-side được duyệt; từ chối token thiếu/sai; thiếu secret/config cần thiết phải fail closed. Không coi nút disabled hoặc role client là bảo vệ quyền.
- Nghiệm thu đề xuất: ma trận Guest/Staff/Owner gọi HTTP trực tiếp cho từng hành động; Guest không được sửa đơn, Staff không được xác nhận hoặc hủy đơn đã xác nhận; không thể nâng quyền bằng sửa browser state.

### R06 — P1: Payload đơn thiếu kiểm tra runtime và tin giá client

- Bằng chứng: `app.ts:107-110` kiểm tra sơ bộ rồi ép kiểu TS; `orderService.ts:50-52` tính tiền từ `unitPriceVND * quantity` do client gửi. Không xác minh từng bookId, số lượng nguyên dương hoặc hợp nhất dòng trùng.
- Hệ quả: đơn có giá/tên giả, số lượng âm/lẻ/thiếu trường có thể được lưu; quantity âm có thể làm tăng kho khi xử lý xác nhận. Kiểu sai ở customer có thể gây 500 thay vì lỗi validation.
- Hướng xử lý: parse payload tại boundary, kiểm tra chuỗi bắt buộc sau trim và từng item; lấy thông tin sách/giá từ server. Cách hiển thị giá chưa biết phải theo quyết định đã duyệt, không mặc định là miễn phí.
- Nghiệm thu đề xuất: từ chối zero/âm/lẻ/sai kiểu/thiếu trường/bookId không tồn tại; kiểm soát dòng trùng; giá client bị sửa không thay đổi giá server. Payload không hợp lệ không được lưu hay thay đổi kho.

### R07 — P1: Xác nhận đơn và trừ kho không nguyên tử

- Bằng chứng: `orderService.ts:128-168` kiểm tra từng item, trừ từng item rồi mới lưu order bằng các await rời rạc; không có transaction/rollback/khóa đồng thời.
- Hệ quả suy ra từ code: hai xác nhận có thể dùng cùng tồn; lỗi giữa chừng có thể để kho đã giảm nhưng đơn chưa xác nhận. Một đơn có hai dòng cùng sách, mỗi dòng vượt tổng tồn khi cộng lại, có thể qua vòng kiểm tra rồi lỗi sau khi đã trừ dòng đầu.
- Authority: BRD BR-06, AC-14/15 và §13.
- Hướng xử lý: kiểm tra tổng nhu cầu từng sách; cập nhật trạng thái, lịch sử và toàn bộ kho trong cùng đơn vị nguyên tử, có kiểm soát cạnh tranh và idempotency.
- Nghiệm thu đề xuất: hai đơn tranh cuốn cuối chỉ một đơn được xác nhận; gọi confirm đồng thời cho cùng đơn chỉ trừ một lần; lỗi ghi giữa chừng không để thay đổi dở dang.

### R08 — P1: Chuyển trạng thái cho phép trừ kho lại và vòng qua quyền hủy

- Bằng chứng: `orderService.ts:116-168` chỉ bỏ qua khi status mới bằng status hiện tại, không giới hạn transition graph hoặc kiểm tra dấu đã trừ kho xuyên suốt vòng đời.
- Hệ quả: `CONFIRMED -> CONTACTED -> CONFIRMED` có thể trừ kho lần nữa. Qua service, Staff có thể chuyển đơn CONFIRMED về CONTACTED rồi CANCELLED, vòng qua guard chỉ kiểm tra trạng thái hiện tại.
- Hướng xử lý: chốt transition graph theo authority, enforce trong service và server; bảo vệ lịch sử xác nhận/trừ kho. Không tự quyết việc hoàn tồn sau hủy khi chưa có quyết định rõ.
- Nghiệm thu đề xuất: các đường chuyển trạng thái vòng không trừ kho lại hoặc vượt quyền; transition không được phép bị từ chối dù gọi service/API trực tiếp.

### R09 — P1: CMS production và API vận hành chưa đầy đủ

- Bằng chứng: router `app.ts` chỉ có health, books, tạo đơn, confirm/cancel và static serving. Thiếu API đọc danh sách/chi tiết đơn cho CMS, CONTACTED, login riêng Owner/Staff, CRUD sách/media/editorial, publish và sửa kho thủ công. Renderer trong `src/components/admin/` không thay thế các luồng này.
- Authority: BRD FR-04/05/08/09/11/12, AC-08/12/13.
- Hướng xử lý: hoàn thiện các lát cắt chức năng được BRD yêu cầu, nối UI tới persistence và quyền server-side; bảo vệ dữ liệu cá nhân trong API quản trị.
- Nghiệm thu đề xuất: Staff sửa kho sau bán Facebook, public catalog nhận tồn mới; quản trị nội dung/media và xử lý đơn trên nhiều thiết bị dùng cùng nguồn dữ liệu; Guest không đọc được dữ liệu đơn nội bộ.

### R10 — P2: Viewer chưa render nội dung bản vẽ thực

- Bằng chứng: `src/components/viewer/VerticalSpreadViewer.ts:35` gặp `svgPlateIndex` chỉ render khung chữ; seed tương ứng có `imageUrl: ''`. Zoom utility mới tính transform, chưa có event wiring trong `src/`.
- Hướng xử lý: nối media hợp lệ với renderer, zoom/pan và bàn phím/chạm; dùng ảnh có quyền sử dụng, không dùng placeholder làm bằng chứng hoàn thành.
- Nghiệm thu đề xuất: nhìn thấy đúng ảnh/bản vẽ thực, mở/đóng/zoom được trên desktop/mobile; thiếu ảnh có phản hồi rõ; không làm thay đổi kho.

### R11 — P2: Còn nội suy dữ liệu vào HTML không escape

- Bằng chứng: `src/components/storefront/SearchAndFilter.ts:38` chèn `searchQuery` trực tiếp vào `value="..."`; các renderer catalog/viewer/cart cũng có trường nội suy chưa escape.
- Hệ quả: query chứa dấu nháy có thể phá cấu trúc thuộc tính khi chuỗi được mount vào DOM. Khả năng thực thi script còn phụ thuộc sink và CSP; không khẳng định đã khai thác trong runtime.
- Hướng xử lý: dùng DOM API phù hợp hoặc escape theo ngữ cảnh; rà soát cả text, attribute và URL. Không dùng CSP thay cho xử lý đầu vào/đầu ra an toàn.
- Nghiệm thu đề xuất: ký tự HTML/dấu nháy hiển thị như dữ liệu, không sinh node/attribute ngoài ý muốn; nội dung CMS và dữ liệu đơn không trở thành script khi render.

### R12 — P2: Model chưa hỗ trợ rõ giá/tồn chưa biết và published sách

- Bằng chứng: `src/types/domain.ts:10-31` yêu cầu `priceVND`/`stockCount` là number, chỉ có ba BookStatus và không có trường published của sách; catalog không lọc sách theo trạng thái xuất bản.
- Authority: BRD BR-07, FR-04, AC-06; INTENT Decisions BD-01.
- Hướng xử lý: mô hình hóa giá chưa biết/tồn chưa xác minh khác với giá 0/tồn 0; hỗ trợ quyền xuất bản và nhận yêu cầu theo quyết định đã duyệt.
- Nghiệm thu đề xuất: sách published chưa có giá/tồn vẫn nhận yêu cầu, hiển thị Liên hệ/Chờ xác nhận phù hợp; draft không xuất hiện public; không xác nhận kho chưa rõ bằng ép kiểu/mặc định 0 tùy tiện.

### R13 — P2: Runbook SSL và CSP chưa đồng bộ với artifact

- Bằng chứng: `deploy/README.md:38` yêu cầu `nginx -t` trước Certbot ở dòng 42, nhưng `deploy/nginx.conf:21-22` đã tham chiếu chứng chỉ chưa được tạo trên máy mới.
- Hệ quả: bootstrap Nginx theo hướng dẫn có thể dừng vì thiếu chứng chỉ. Nếu dùng HTML mockup trực tiếp, CSP hiện tại cũng không cho inline script/CDN Tailwind/Lucide mà file đó dùng. Riêng Nginx có các location đặt add_header riêng nên cần kiểm tra header thực tế, không suy ra mọi response đều nhận CSP ở server block.
- Hướng xử lý: tách bootstrap HTTP/cấp chứng chỉ/kích hoạt HTTPS theo thứ tự hợp lệ; đồng bộ CSP với frontend cuối cùng, ưu tiên artifact kiểm soát được thay vì nới CSP tùy tiện.
- Nghiệm thu đề xuất: runbook rõ đường đi từ máy mới tới cấu hình hợp lệ; sau khi được phép kiểm chứng, frontend không bị chặn script thiết yếu và response có header đúng. Không chạy deploy thật để đóng report này.

## 4. Đánh giá AI Memory

- `Journal.md:280` khẳng định sẵn sàng deploy, nhưng R01–R09 cho thấy khẳng định vượt quá bằng chứng code.
- `handoff.md` dừng ở 04/11/2026 và 52 tests; Journal đã ghi backend/security ngày 05/11 và 57 tests. Handoff không phản ánh snapshot sau cùng.
- Không kết luận các kết quả test cũ là giả. Chúng không chứng minh các nhánh chưa được kiểm tra hoặc ứng dụng đã tích hợp hoàn chỉnh.
- Sau khắc phục và xác minh được phép, agent sau phải ghi rõ phạm vi đã chứng minh, lệnh/kết quả thực tế và giới hạn còn lại; giữ lịch sử, không thay toàn bộ lịch sử bằng lời khẳng định PASS mới.

## 5. Thứ tự bàn giao đề xuất

1. Xác nhận authority còn xung đột, frontend canonical và phương án storage/auth tối thiểu. Đọc lại live code vì báo cáo có thể cũ.
2. Khi được giao implementation, tạo hoặc tiếp tục **một** plan trong `docs/plans/active/` theo WORKFLOW; liên kết report, không tạo DB/lifecycle quản trị song song.
3. Giải quyết R02/R05/R06 làm nền; sửa R01 cùng contract, transaction và state machine R07/R08, tránh mở nhánh hủy vô quyền.
4. Hoàn thiện API/CMS R09 và frontend tích hợp R03/R04, media R10, model R12 và render an toàn R11.
5. Đồng bộ artifact/runbook R13, sau đó thực hiện validation trong phạm vi người dùng cho phép. Việc bỏ test/deploy ở lượt review này không phải lệnh cấm validation vĩnh viễn, cũng không phải quyền tự deploy.
6. Cập nhật AI Memory/ma trận bằng chứng theo kết quả thực tế; chỉ đóng plan sau validation. Không đánh dấu report findings đã sửa bằng mô tả hoặc screenshot giao diện đơn thuần.

Không cần rewrite toàn bộ nếu có thể giữ các module đúng và sửa theo lát cắt. Không mở rộng sang thanh toán online, giao vận API, tài khoản khách, đồng bộ Facebook hoặc dashboard giả lập.

## 6. Checklist bàn giao kết quả cho người dùng

- [ ] Mỗi R01–R13 có trạng thái Fixed / Open / Decision needed và bằng chứng tương ứng.
- [ ] Chỉ rõ file thay đổi, contract mới và cách giữ dữ liệu hiện có.
- [ ] Chứng minh lưu bền dữ liệu, quyền gọi HTTP trực tiếp, cạnh tranh tồn cuốn cuối và rollback.
- [ ] Chứng minh browser khách và browser nhân viên dùng cùng dữ liệu backend.
- [ ] Chứng minh fresh checkout tạo được artifact và có runbook tái lập được.
- [ ] Phân biệt review tĩnh, test đã chạy, build đã chạy, kiểm chứng runtime và deploy thật; không gộp thành một nhãn PASS.
- [ ] Báo các quyết định nghiệp vụ chưa chốt, rủi ro chưa xử lý và công việc chưa được phép làm.

## 7. Prompt giao AI Agent tiếp theo

```text
Đọc docs/production-readiness-review-2026-11-07.md cùng AGENTS.md,
docs/WORKFLOW.md, constitution, BRD, INTENT, BRIEF và AI Memory liên quan.

Mục tiêu mong muốn: khắc phục các finding R01–R13 để có ứng dụng Editorial
Commerce MVP tích hợp, lưu dữ liệu server bền vững, phân quyền Owner/Staff
và xác nhận/trừ kho nhất quán theo yêu cầu đã phê duyệt.

Trước khi sửa, kiểm tra từng finding với live code và nêu các xung đột
authority cần quyết định. Không coi report là quyền tự quyết nghiệp vụ,
chọn provider hoặc rewrite toàn bộ. Sau khi phạm vi được người dùng giao
rõ, dùng một active plan của repository và thực hiện từng lát cắt tối thiểu.

Không reset/clean công việc hiện có. Không thêm tính năng ngoài MVP.
Không deploy thật, gửi dữ liệu ra ngoài hoặc chạy migration phá hủy khi
chưa được phép. Thực hiện validation phù hợp với phạm vi được giao và
báo lệnh/kết quả thật; không dựa vào PASS lịch sử trong AI Memory.

Cuối cùng trả bảng R01–R13: trạng thái, file sửa, bằng chứng kiểm chứng,
rủi ro còn lại; cập nhật continuity và chỉ tuyên bố sẵn sàng trong phạm vi
đã có bằng chứng. Nếu mới review code thì ghi rõ chưa xác minh chạy thật.
```
