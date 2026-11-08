# Hướng Dẫn Deploy Lên Ubuntu VPS (Nginx + Node.js Native)

## 1. Chuẩn Bị Server Ubuntu
```bash
sudo apt update && sudo apt upgrade -y
sudo apt install -y nginx certbot python3-certbot-nginx nodejs
# Đảm bảo Node.js >= 22 (hỗ trợ --experimental-strip-types native)
```

## 2. Thiết Lập Mã Nguồn & Quyền Hạn
```bash
sudo mkdir -p /var/www/oopsla
sudo chown -R $USER:www-data /var/www/oopsla
# Copy code vào /var/www/oopsla
cd /var/www/oopsla
npm run build
```

## 3. Cấu Hình Biến Môi Trường (.env)
Tạo file `/var/www/oopsla/.env`:
```env
PORT=3000
NODE_ENV=production
ADMIN_SECRET_KEY=dien-chuoi-bi-mat-rat-dai-o-day-123456789
STORAGE_FILE=/var/www/oopsla/data/oopsla-storage.json
```

## 4. Kích Hoạt Systemd Service
```bash
sudo cp deploy/oopsla.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable oopsla
sudo systemctl start oopsla
sudo systemctl status oopsla
```

## 5. Kích Hoạt Nginx & Cấp Chứng Chỉ SSL (Certbot)
Thực hiện theo đúng 2 bước tuần tự để tránh lỗi thiếu chứng chỉ khi chạy `nginx -t`:

### Bước 5.1: Cấp chứng chỉ SSL tự động qua Certbot
```bash
# Đăng ký chứng chỉ qua Certbot Standalone hoặc Nginx Webroot
sudo certbot certonly --webroot -w /var/www/oopsla/dist -d bookstore.oopsla.vn
```

### Bước 5.2: Kích hoạt Nginx Production Config (SSL + Security Headers)
Sau khi đã có chứng chỉ tại `/etc/letsencrypt/live/bookstore.oopsla.vn/`:
```bash
sudo cp deploy/nginx.conf /etc/nginx/sites-available/oopsla.conf
sudo ln -sf /etc/nginx/sites-available/oopsla.conf /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl reload nginx
```
