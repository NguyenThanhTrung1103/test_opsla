# Intent: 200Lab MCP — System Design Integration & Architecture Audit
schema: intent/v1.1 · depth: D2 · product: mcp-integration · words: 850

## Need
Chủ sở hữu và kỹ sư phát triển repository (User/Architect) cần tích hợp **200Lab MCP (System Design & AI Tutor)** vào môi trường phát triển (Agy CLI / Codex CLI / Claude Code) để phục vụ việc phân tích, thẩm tra, đánh giá kiến trúc kỹ thuật và phát hiện rủi ro backend trên website hiện có, mà tuyệt đối không can thiệp, không viết lại và không làm thay đổi bất kỳ dòng mã nguồn hay nghiệp vụ nào của ứng dụng đã hoàn thiện.

## Problem
1. Repository website đã hoàn chỉnh và đang vận hành ổn định. Tuy nhiên, khi cần đánh giá tính mở rộng (scaling), khả năng chịu tải cao, hoặc thẩm tra độ tin cậy đồng thời (concurrency / race condition) ở mức kiến trúc hệ thống, kỹ sư cần các công cụ chuyên sâu chuẩn mực (rubrics & system design patterns) thay vì tự đánh giá cảm tính.
2. Các công cụ AI tổng quát thường đưa ra khuyến nghị chung chung hoặc dễ gây xu hướng tự ý refactor/sửa code làm phá vỡ logic đang chạy (scope drift).
3. Cần thiết lập một ranh giới kiểm soát Zero-Trust rõ ràng: Khai thác toàn bộ tri thức, công cụ và skill System Design của 200Lab MCP ở chế độ **Read-Only / Advisor**, bảo toàn 100% mã nguồn và cơ sở dữ liệu hiện hữu.

## Audience
- **Primary Persona**: Kỹ sư trưởng / Chủ sở hữu repository (Principal Architect / Owner).
- **Goal**: Sử dụng 200Lab MCP như một chuyên gia tư vấn kiến trúc kỹ thuật độc lập (Architecture Reviewer & Technical Auditor).
- **Not-for**:
  - Người dùng cuối của website tiệm sách.
  - Các tác vụ phát triển tính năng mới, chỉnh sửa giao diện UX/UI, hoặc viết lại ứng dụng.

## Positioning
- **One line**: Khóa tích hợp và khai thác 200Lab MCP System Design phục vụ thẩm tra kiến trúc hệ thống ở chế độ Read-Only an toàn tuyệt đối.
- **Role**: Architecture Advisor & Reliability Auditor (Tư vấn kiến trúc & Thẩm định độ tin cậy).
- **Operating Mode**: Read-Only Audit & Offline/Manual Decision Gating.

## Invariants (Ranh Giới Bất Biến Bắt Buộc)
- **SD-01**: Không thay đổi bất kỳ tệp mã nguồn (source code) nào của website (frontend và backend).
- **SD-02**: Không thay đổi business logic, cấu trúc database (`data/oopsla-storage.json`) hoặc API contracts (`src/server/app.ts`).
- **SD-03**: Không tự ý cài đặt package mới hoặc tự ý sửa đổi file cấu hình MCP toàn cục khi chưa có xác nhận từ người dùng.
- **SD-04**: Tuyệt đối không đọc hoặc gửi secrets, credentials, token riêng tư hoặc dữ liệu khách hàng lên máy chủ MCP bên ngoài.
- **SD-05**: Không mở rộng phạm vi sang phát triển sản phẩm, thêm tính năng, sửa bug code hoặc thiết kế lại UX/UI.
- **SD-06**: Không tuyên bố một công cụ MCP là khả dụng nếu chưa qua kiểm chứng kết nối thực tế.
- **SD-07**: Mọi phát hiện hoặc đề xuất sửa đổi kiến trúc từ 200Lab MCP chỉ mang tính chất khuyến nghị (recommendations), tuyệt đối không tự động thực thi.

## Automation Boundary (Ranh Giới Tự Động vs Thủ Công)

### Tự động (Automated / Agent Scope)
- Kiểm tra tính sẵn sàng của endpoint 200Lab MCP (`https://mcp.200lab.io/mcp/learner`) qua giao thức HTTP/SSE.
- Khám phá danh mục công cụ (`skill_find`, `skill_get`, `ai_tutor`, `search`, `get`, `get_artifact_download_url`, `learning_dashboard`).
- Đọc, phân tích cấu trúc module và luồng xử lý của repository ở chế độ chỉ đọc (Read-Only).
- Đối chiếu năng lực System Design của 200Lab với tech stack hiện tại của dự án.
- Biên soạn báo cáo đánh giá kiến trúc và ma trận tương thích.

### Thủ công (Manual / User Authority)
- Đăng nhập tài khoản thành viên 200Lab trên trình duyệt (Firefox) và cấp Bearer Token xác thực.
- Quyết định việc thêm hoặc điều chỉnh server trong file cấu hình `mcp_config.json`.
- Thẩm định và phê duyệt các đề xuất kiến trúc từ 200Lab MCP.
- Quyết định có áp dụng khuyến nghị kỹ thuật vào một nhiệm vụ phát triển riêng biệt hay không.

## Journey (Quy Trình Khai Thác Chuẩn)
1. **Kiểm tra kết nối**: Agent probe máy chủ `https://mcp.200lab.io/mcp/learner` → xác nhận trạng thái sẵn sàng và phương thức xác thực Bearer token.
2. **Cấu hình an toàn**: Người dùng cung cấp token từ phiên Firefox đã đăng nhập → đưa vào `mcp_config.json` theo hướng dẫn.
3. **Truy vấn tri thức System Design**: Agent gọi `skill_find` / `skill_get` / `ai_tutor` để tải tiêu chí đánh giá chuẩn (rubrics) của 200Lab về độ tin cậy backend, timeout, retry, concurrency và lưu trữ.
4. **Đối chiếu kiến trúc tĩnh**: Đọc code hiện tại (`app.ts`, `orderService.ts`, `indexed-db.ts`) đối chiếu với tiêu chí chuẩn 200Lab.
5. **Trình bày khuyến nghị**: Xuất báo cáo tư vấn kiến trúc độc lập (Markdown / HTML Dashboard) cho người dùng duyệt.

## Scope
- **In**:
  1. Kiểm tra cấu hình và khả năng tương thích của 200Lab MCP trên CLI.
  2. Xác minh 8 công cụ hạt nhân của 200Lab MCP theo tài liệu chính thức `https://200lab.io/mcp`.
  3. Phân tích kiến trúc hệ thống (System Design) của website hiện tại ở chế độ Read-Only.
  4. Lập bảng ma trận tương thích (Compatibility Matrix) chi tiết giữa 200Lab skills và codebase.
  5. Đề xuất quy trình vận hành (workflow) an toàn cho các phiên review kiến trúc sau này.
- **Out / Non-Goals**:
  - Không sửa chữa hay viết lại code website.
  - Không làm lại UX/UI hay styling giao diện.
  - Không thêm tính năng kinh doanh mới.
  - Không thay đổi schema hay migration dữ liệu.
  - Không tự động áp dụng các đề xuất sửa đổi kiến trúc.

## Observable Done Criteria
1. Tệp `docs/200lab-mcp/INTENT.md` được lưu trữ đầy đủ, khóa cứng phạm vi System Design Audit.
2. File `INTENT.md` nghiệp vụ gốc của tiệm sách ở thư mục gốc được bảo toàn nguyên vẹn 100%.
3. Báo cáo kiểm định xác nhận chính xác trạng thái kết nối máy chủ MCP và danh mục công cụ thực tế.
4. Ma trận tương thích phân định rõ ràng các mức độ ưu tiên kỹ thuật và ranh giới an toàn.
