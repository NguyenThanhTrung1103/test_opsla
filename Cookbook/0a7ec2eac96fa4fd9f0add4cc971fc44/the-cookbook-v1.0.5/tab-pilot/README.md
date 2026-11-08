# tab-pilot

tab-pilot là một extension cho Chrome. Nó cho phép AI agent (Claude Code, ChatGPT, một kịch bản hay một workflow tự động) điều khiển các trang web mà bạn **đang đăng nhập sẵn trong Chrome của chính bạn**:

| Trang | Agent làm được |
|---|---|
| ChatGPT | chat, gửi file, chọn model, lấy kết quả (chữ, code, ảnh tạo ra), đọc lại một cuộc chat có sẵn từ link, tạo và cập nhật project; mỗi việc chạy trong một tab riêng nên nhiều agent gửi cùng lúc không lẫn chat của nhau |
| Gemini | chat, gửi file, chọn model và mức suy nghĩ (mặc định 3.8 Flash, Medium), hỏi tiếp trong một chat có sẵn, lấy kết quả (chữ và code) |
| Substack | tạo, sửa, xoá bản nháp; tải ảnh lên; xuất bản (có thể gửi email); xem số liệu; đăng Note |
| LinkedIn | đọc feed, tìm kiếm, đăng bài (kèm ảnh hoặc video), viết và xuất bản article, bình luận, xem số liệu |
| TikTok | tải video lên với caption và hashtag, xem số liệu từng video, đọc bình luận |
| Viblo | đọc bài và bình luận, tạo bản nháp, sửa, xuất bản, **hẹn giờ xuất bản** (dùng tính năng lên lịch của chính Viblo, máy bạn không cần bật lúc đó), xoá bài, bình luận và trả lời bình luận; tìm bài nổi bật theo toàn trang, theo chủ đề (tag) hoặc từ khoá, lọc theo khoảng thời gian |
| dev.to | tạo bản nháp (kèm ảnh bìa, series, tag), sửa, xuất bản hoặc hẹn giờ xuất bản, bình luận, cập nhật hồ sơ, tải ảnh lên, xem số liệu từng bài; API key được tạo qua phiên đăng nhập và chỉ nằm trong extension |
| Quy trình | đăng chéo: một bài luận thành bài Substack, bài article LinkedIn kèm bình luận dẫn link, có bước duyệt trước khi xuất bản |

Không hỗ trợ Facebook, vì tự động điều khiển Facebook thường dẫn tới việc tài khoản bị khoá.

> **Đọc trước khi dùng.** Agent thao tác trên tài khoản thật của bạn. Bài đăng là thật và công khai. Ai có token của bạn thì điều khiển được Chrome đang đăng nhập của bạn, nên hãy giữ token như giữ mật khẩu.

---

## Cách hoạt động

```
Agent (Claude Code, kịch bản, workflow…)
   │  MCP / HTTP / WebSocket  + token
   ▼
Relay của bạn (Cloudflare Worker, gói miễn phí)  ── kho file R2 (tự xoá sau 1 ngày)
   ▲
   │  extension tự mở kết nối đi ra (máy bạn không mở cổng nào)
Chrome của bạn  ──  tab ChatGPT / Gemini / Substack / LinkedIn / TikTok / Viblo / dev.to (nhóm tab "tab-pilot")
```

Relay chạy trên tài khoản Cloudflare của **chính bạn**, mỗi người một relay riêng. Vì relay nằm trên internet, bạn dùng được những cách sau mà không cần cấu hình mạng:

- Agent chạy trên cloud (lịch tự động lúc 7 giờ sáng, agent trên web) gọi được Chrome ở nhà bạn.
- Từ điện thoại, bạn bảo agent "đăng video này lên TikTok với caption này".
- Một hệ thống khác (webhook khi mở bán sản phẩm mới) tự tạo bài LinkedIn và bản nháp Substack.
- Mỗi sáng một lịch tự động gom số liệu TikTok, LinkedIn và Substack về một chỗ.

---

## Cài đặt (khoảng 10 phút)

Bạn cần: **Chrome 116 trở lên**, **Node.js 18 trở lên**, một **tài khoản Cloudflare** (gói miễn phí là đủ).

**1. Lấy code**

```bash
git clone https://github.com/vibery-studio/tab-pilot.git
cd tab-pilot
```

Không dùng GitHub thì tải file .zip ở trang tài nguyên tab-pilot trong khu thành viên arealisticdreamer.com, giải nén rồi `cd` vào thư mục đó.

**2. Đăng nhập Cloudflare (chỉ làm một lần)**

```bash
cd worker && npx wrangler login && cd ..
```

**3. Dựng relay của bạn**

```bash
./scripts/setup.sh
```

Kịch bản này tạo kho file, đưa relay lên Cloudflare, sinh token và ghi mọi thông tin vào file `.env`. File `.env` không được đưa lên git, bạn đừng chia sẻ nó cho ai. Nếu có nhiều tài khoản Cloudflare, kịch bản sẽ hỏi bạn chọn tài khoản nào.

**4. Cài extension vào Chrome**

1. Mở `chrome://extensions` và bật **Developer mode**.
2. Bấm **Load unpacked**, chọn thư mục `extension/` trong repo.
3. Bấm vào **Details** → **Extension options** của tab-pilot, rồi điền:
   - **Relay URL** và **Token**: lấy trong file `.env` (`TAB_PILOT_URL`, `TAB_PILOT_TOKEN`).
   - **Default Substack publication**: ví dụ `tenban.substack.com`.
   - **Allow publishing**: chỉ tick khi bạn muốn agent được đăng bài công khai. Khi ô này tắt, mọi thao tác đăng bài bị từ chối ngay trong Chrome, kể cả khi token bị lộ.
4. Bấm **Save & connect**, dòng trạng thái sẽ hiện `● connected`.

**5. Đăng nhập các trang** ChatGPT, Substack, LinkedIn, TikTok trong chính Chrome đó, như bạn vẫn làm hằng ngày.

**6. Kiểm tra**

```bash
./tp status          # extension đã kết nối chưa
./tp health_check    # kiểm tra từng trang: đã đăng nhập chưa, giao diện còn khớp không
```

---

## Kết nối agent

**Claude Code**

```bash
source .env
claude mcp add --scope user --transport http tab-pilot "$TAB_PILOT_URL/mcp" --header "Authorization: Bearer $TAB_PILOT_TOKEN"
```

Mở phiên Claude Code mới, gõ `/mcp` sẽ thấy `tab-pilot`. Sau đó bạn chỉ cần nói việc cần làm, ví dụ:

- "Đọc cuộc chat này giúp mình: https://chatgpt.com/c/…"
- "Viết bản nháp Substack từ file essay.md, chưa xuất bản."
- "Tải video ~/Desktop/demo.mp4 lên TikTok, nhờ ChatGPT viết caption tiếng Việt có hashtag."
- "Tuần này bài LinkedIn của mình được bao nhiêu lượt xem?"

**Agent khác hoặc kịch bản**: mọi công cụ đều gọi được qua HTTP:

```bash
curl -s "$TAB_PILOT_URL/rpc" -H "authorization: Bearer $TAB_PILOT_TOKEN" -H "user-agent: my-script" \
  -d '{"tool":"linkedin_search","args":{"query":"AI agents","type":"posts","limit":5}}'
```

Hoặc dùng lệnh rút gọn trong repo: `./tp <tên công cụ> '<tham số JSON>'`. Gõ `./tp tools` để xem danh sách. Danh sách đầy đủ kèm tham số nằm ở [`docs/TOOLS.md`](docs/TOOLS.md).

> Cloudflare chặn yêu cầu không có header `user-agent` hoặc dùng user-agent mặc định của Python (lỗi `error code: 1010`). Kịch bản của bạn nên gửi kèm một user-agent bất kỳ.

---

## Dùng hằng ngày

**File lớn (video, PDF…)**: tải file lên relay trước, rồi đưa `file_id` cho công cụ:

```bash
./tp-put ~/Desktop/video.mp4
# {"file_id": "…", "name": "video.mp4", "mime": "video/mp4", "size": 73621230}
./tp tiktok_upload '{"file":{"file_id":"…","name":"video.mp4","mime":"video/mp4"},"caption":"…"}'
```

`tp-put` tự chia file trên 90 MB thành nhiều phần. File trên relay tự xoá sau 1 ngày. Mình đã thử với file 73 MB và 150 MB, mã kiểm tra (SHA-256) trước và sau khi chuyển khớp nhau.

**Việc lâu (ChatGPT trả lời, tải video, xuất bản)**: thêm `"async": true`. Công cụ trả về `job_id` ngay, sau đó agent gọi `job_status` để lấy kết quả.

**Đăng chéo có bước duyệt**

1. `crosspost_prepare`: tạo bản nháp Substack, nhờ ChatGPT viết bài article LinkedIn ngắn, dòng giới thiệu và bình luận dẫn link, rồi lưu article thành bản nháp. Chưa có gì công khai ở bước này.
2. Bạn mở hai đường link bản nháp để đọc và sửa.
3. `crosspost_publish`: xuất bản Substack, xuất bản article LinkedIn, rồi bình luận link Substack ngay dưới bài. Nếu một bước bị lỗi, gọi lại lệnh này với cùng `id`, nó sẽ làm tiếp từ bước còn dang dở.

**Kết quả có xác minh**: mọi công cụ ghi dữ liệu đều trả về `verified: true/false` kèm `evidence`. Giá trị này được đọc lại từ chính trang web sau khi thao tác (caption TikTok đã lưu, article đã có trong danh sách, bản nháp đã có tiêu đề đúng), không dựa vào việc nút đã được bấm.

**Tab**: các tab do agent mở nằm trong nhóm tab xám tên "tab-pilot" và tự đóng sau 5 phút không dùng (chỉnh được trong options). Tab của bạn không bao giờ bị đóng. Đừng thu gọn (collapse) nhóm này, vì Chrome sẽ tạm dừng các tab bên trong và thao tác bị treo. Nếu bạn lỡ thu gọn, extension sẽ tự mở nhóm ra lại.

---

## Quyền hạn và an toàn

Mỗi công cụ thuộc một trong bốn mức:

| Mức | Ý nghĩa | Ví dụ |
|---|---|---|
| `read` | chỉ đọc, không thay đổi gì | đọc feed, xem số liệu, đọc chat |
| `draft` | chỉ thay đổi những thứ riêng tư | bản nháp, chat ChatGPT của bạn, đóng tab |
| `publish` | công khai, không rút lại được | đăng bài, bình luận, tải video, xuất bản Substack |
| `dev` | gỡ lỗi | xem cấu trúc trang, chạy thao tác thô |

Có **hai lớp khoá**:

1. **Token** trên relay. Token chính (`TAB_PILOT_TOKEN`) có quyền `read`, `draft`, `publish`. Bạn có thể tạo thêm token giới hạn cho một agent hoặc một người khác, ví dụ token chỉ được đọc:

   ```bash
   cd worker && echo '[{"token":"<chuỗi ngẫu nhiên dài>","label":"bot-doc-so-lieu","scopes":["read"]}]' \
     | npx wrangler secret put TOKENS --name tab-pilot
   ```

   Agent dùng token giới hạn chỉ nhìn thấy và chỉ gọi được những công cụ nằm trong quyền của nó.

2. **Ô "Allow publishing"** trong options của extension. Khi ô này tắt, Chrome từ chối mọi thao tác mức `publish`, dù token có quyền đó.

**Nhật ký**: `./tp audit_log` liệt kê mọi thao tác ghi trong 90 ngày gần nhất: ai làm (nhãn token), công cụ nào, tham số tóm tắt, thành công hay thất bại.

**Giữ an toàn cho tài khoản**

- Extension tự chèn khoảng nghỉ khoảng 1 đến 2 giây giữa các thao tác trên LinkedIn và TikTok, giống nhịp người dùng. Đừng cho agent đăng dồn dập hàng chục bài trong một giờ.
- Với TikTok, công cụ chờ bước kiểm duyệt nội dung của TikTok chạy xong rồi mới bấm đăng.
- Khi trang hiện bước xác minh bảo mật (checkpoint), công cụ dừng lại và báo lỗi. Bạn tự xử lý bước đó trong Chrome.

---

## Khi có lỗi

1. Chạy `./tp health_check`. Lệnh này cho biết trang nào chưa đăng nhập, hoặc thành phần giao diện nào (selector) không còn tìm thấy.
2. Nếu trang vừa đổi giao diện, xem selector hiện tại bằng `selectors_get`, rồi sửa tạm bằng `selectors_set` mà không cần cập nhật code. Bản sửa chính thức nằm trong `extension/sites/selectors.js`.
3. Các lỗi thường gặp:

| Hiện tượng | Cách xử lý |
|---|---|
| `Chrome extension not connected` | Mở Chrome, vào options của tab-pilot xem trạng thái, bấm Save & connect |
| `error code: 1010` | Kịch bản thiếu header `user-agent` |
| `permission denied: … needs 'publish' scope` | Token này không có quyền đăng bài |
| `… enable "Allow publishing" …` | Bật ô Allow publishing trong options |
| Thao tác chậm hoặc hết thời gian chờ | Máy đang quá tải (Chrome xử lý tab nền chậm hơn nhiều). Dùng `async: true` cho việc lâu |
| ChatGPT báo `logged out` | Đăng nhập lại ChatGPT trong Chrome |

---

## Có gì mới (25/10/2026)

- **Gemini**: `gemini_chat`, `gemini_get_result`, `gemini_read`, mặc định 3.8 Flash với mức suy nghĩ Medium. Xem giới hạn khi chạy nền ở phần Giới hạn hiện tại.
- **dev.to**: `devto_setup` (tạo API key một lần), tạo nháp, sửa, `devto_schedule` hẹn giờ, `devto_publish`, `devto_comment`, `devto_update_profile`, `devto_upload_image`, `devto_my_articles`.
- **Viblo**: `viblo_schedule` hẹn giờ xuất bản bằng tính năng lên lịch của Viblo (bài hiện trong mục Đã lên lịch).
- **ChatGPT**: mỗi việc một tab riêng; link chat trả về luôn thuộc đúng tab và đúng project của việc đó; prompt dài hơn khoảng 9.500 ký tự được gửi thành file `brief.md` đính kèm; tạo project chạy lại được sau khi ChatGPT đổi giao diện thanh bên.
- **Tab nền bị Chrome tạm dừng**: extension tự đánh thức tab trước khi thao tác, nên việc chạy lâu không còn bị treo.

## Cập nhật phiên bản mới

```bash
git pull
./scripts/deploy.sh            # đưa relay mới lên
# rồi bấm ↻ trên tab-pilot ở chrome://extensions
```

Extension tự kết nối lại khi relay đổi phiên bản, bạn không cần làm gì thêm.

Nếu cài từ file .zip: tải lại file .zip mới, chép file `.env` từ thư mục cũ sang thư mục mới, chạy `./scripts/deploy.sh` trong thư mục mới, rồi ở `chrome://extensions` gỡ tab-pilot và **Load unpacked** lại thư mục `extension/` mới (điền lại Relay URL và Token).

---

## Giới hạn hiện tại

- Hashtag TikTok được nhập dưới dạng chữ thường, không chọn từ gợi ý của TikTok, nên có thể không thành đường link bấm được.
- Chưa hỗ trợ: trả lời bình luận TikTok, newsletter LinkedIn, xoá bản nháp article LinkedIn (bạn xoá tay trên LinkedIn).
- `substack_note` chưa được chạy thử trên tài khoản thật, vì mỗi lần thử sẽ đăng một Note công khai.
- Mọi công cụ dựa vào giao diện web của từng trang. Khi trang đổi giao diện, công cụ có thể hỏng cho tới khi selector được sửa (xem phần Khi có lỗi).
- Mỗi relay phục vụ một Chrome tại một thời điểm.
- Gemini chưa ổn định khi tab của nó chạy nền (bạn không nhìn vào tab đó): giao diện Gemini chỉ hiển thị đủ khi tab đang hiện, nên đôi lúc không đính kèm được file hoặc không gửi được. Việc quan trọng nên dùng ChatGPT, hoặc để tab Gemini hiện trên màn hình trong lúc chạy.
- ChatGPT và Gemini ở tab nền đôi khi giữ trạng thái "đang trả lời" dù câu trả lời đã xong. tab-pilot coi câu trả lời là xong khi nội dung không đổi trong một khoảng thời gian (Gemini 25 giây, ChatGPT 60 giây).

---

## Cho người muốn sửa code

```
extension/            extension Chrome (MV3, JavaScript thuần, không cần build)
  background.js       kết nối relay, công cụ, quản lý tab, việc chạy nền
  sites/*.js          điều khiển từng trang (chạy bên trong tab)
  sites/selectors.js  selector của từng trang, sửa ở đây khi giao diện đổi
  lib/substack-doc.js chuyển Markdown sang định dạng Substack và ngược lại
worker/               relay (Cloudflare Worker + Durable Object + R2)
  src/tools.ts        danh mục công cụ, tham số, mức quyền
  src/index.ts        MCP / HTTP / WebSocket, xác thực, nhật ký, kho file
scripts/              setup.sh, deploy.sh, gen-tools-doc.mjs
test/                 kiểm thử relay và bộ chuyển Markdown
tp, tp-put            lệnh gọi công cụ và tải file từ terminal
```

Chạy kiểm thử:

```bash
node test/doc.test.mjs
cd worker && printf 'TOKEN=testowner\n' > .dev.vars && npx wrangler dev --port 8799 &
node test/relay.test.mjs http://localhost:8799 testowner
```

Sau khi thêm hoặc sửa công cụ trong `worker/src/tools.ts`, chạy `node scripts/gen-tools-doc.mjs` để cập nhật `docs/TOOLS.md`.
