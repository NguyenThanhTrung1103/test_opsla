# Hướng dẫn Triển khai Oops La Bookstore lên Cloudflare Workers qua GitHub Actions

Tài liệu hướng dẫn triển khai web MVP lên mạng lưới toàn cầu Cloudflare Edge thông qua GitHub Actions tự động.

---

## 1. Kiến trúc Triển khai (Edge MVP)

```text
[Git Push main] 
      │
      ▼
[GitHub Actions CI/CD]
   ├── 1. npm test (Chạy 68 test xác thực tính toàn vẹn)
   ├── 2. npm run build (Tạo thư mục dist/index.html)
   └── 3. wrangler deploy (Đẩy lên Cloudflare Edge)
      │
      ▼
[Cloudflare Workers Edge Network]
   ├── Giao diện tĩnh: env.ASSETS phục vụ dist/index.html (Global CDN, 0ms latency)
   └── API Edge: src/worker.ts xử lý /api/health và POST /api/orders
```

---

## 2. Các bước cấu hình (Chỉ làm 1 lần)

### Bước 1: Lấy Cloudflare API Token & Account ID
1. Đăng nhập trang quản trị Cloudflare: [dash.cloudflare.com](https://dash.cloudflare.com).
2. **Lấy Account ID**: Chọn tên tài khoản / domain bất kỳ, nhìn thanh bên phải ở trang chủ sẽ thấy **Account ID** (hoặc copy từ URL).
3. **Tạo API Token**:
   - Truy cập: `My Profile` > `API Tokens` > Bấm `Create Token`.
   - Chọn template: **Edit Cloudflare Workers**.
   - Mục **Account Resources**: Chọn tài khoản của bạn.
   - Bấm **Continue to summary** > Bấm **Create Token**.
   - Copy mã Token vừa tạo.

### Bước 2: Thêm Secret vào GitHub Repository
1. Mở Repository trên GitHub: `Settings` > `Secrets and variables` > `Actions`.
2. Bấm **New repository secret** và thêm 2 secret:
   - Tên: `CLOUDFLARE_API_TOKEN` — Giá trị: Token vừa copy ở Bước 1.
   - Tên: `CLOUDFLARE_ACCOUNT_ID` — Giá trị: Account ID ở Bước 1.

---

## 3. Kích hoạt Triển khai
1. Mỗi khi bạn `git push` lên nhánh `main` (hoặc `master`), GitHub Actions sẽ:
   - Tự động chạy toàn bộ 68 test case. Nếu có lỗi, pipeline tự dừng để bảo vệ an toàn.
   - Build file `dist/index.html`.
   - Deploy trực tiếp lên Cloudflare Workers.
2. Bạn có thể xem tiến trình chạy tại tab **Actions** trên GitHub repo.
3. Khi hoàn tất, Cloudflare sẽ cấp link truy cập miễn phí dạng: `https://oops-la-bookstore.<ten-subdomain>.workers.dev`.
