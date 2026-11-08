---
name: cookbook-setup
description: "Bật/Tắt & Cấu hình tính năng The Cookbook: Quản lý kết nối MCP (Local Stdio & Remote ARD), Intent Studio, Profile, kiểm tra đồng bộ và xử lý sự cố. Kích hoạt khi người dùng nói 'cài đặt cookbook', 'setup cookbook', 'quản lý mcp cookbook', 'bật tắt tính năng cookbook', '/cookbook-setup'."
user-invocable: true
when_to_use: "Invoke when user wants to check setup status, configure MCP connections, toggle features, manage Profile, or troubleshoot The Cookbook."
category: configuration
keywords: [cookbook, setup, install, mcp, profile, config, sync, troubleshoot]
argument-hint: "[status | mcp | profile | sync]"
metadata:
  author: agentkit
  version: "1.0.0"
---

# /cookbook-setup (The Cookbook Setup & Configuration Manager)

Bản điều khiển tập trung toàn bộ cấu hình, trạng thái kết nối MCP, hồ sơ cá nhân hóa (Profile) và hướng dẫn sửa lỗi cho The Cookbook trên Google Antigravity.

---

## 1. Các Tính Năng Quản Lý Chính

### A. Quản lý kết nối MCP (Bài 7)
- **Local MCP Server (`cookbook`)**:
  - Cơ chế: Stdio Transport qua Node.js (`scripts/mcp/cookbook-server.js`).
  - Trạng thái: 100% Cục bộ, Zero-latency, không cần Internet.
  - Công cụ: `cookbook_list_recipes`, `cookbook_get_recipe`, `cookbook_search`.
- **Remote MCP Server (`ard`)**:
  - Endpoint: `https://mcp.arealisticdreamer.com/mcp` (Streamable HTTP).
  - Yêu cầu xác thực: OAuth token gắn với email mua hàng của The Cookbook (HTTP 401 nếu chưa đăng nhập qua browser).

### B. Quản lý Intent Studio & Recipe Workbooks
- Kiểm tra tính đầy đủ của 4 Skill nghiệp vụ:
  1. `cookbook-intent`
  2. `cookbook-intent-check`
  3. `cookbook-build-brief`
  4. `cookbook-recipes`
- Đồng bộ công thức (Sync up-to-date) từ nguồn `Cookbook/0a7ec2eac96fa4fd9f0add4cc971fc44/the-cookbook-v1.0.5/recipes/` vào `docs/cookbook/`.

### C. Quản lý Profile Cá Nhân Hóa (PROFILE.md)
- Quản lý các quy chuẩn thiết kế, phong cách công nghệ và tiêu chí kiểm thử ưa thích của lập trình viên.
- Ưu tiên: `--profile <path>` > `./PROFILE.md` > default profile.

---

## 2. Lệnh Kiểm Tra Trạng Thái Nhanh

Khi người dùng gọi `/cookbook-setup`, thực hiện:
1. Rà soát trạng thái Local MCP Server (`scripts/mcp/cookbook-server.js`).
2. Kiểm tra danh mục recipes có sẵn trong `docs/cookbook/`.
3. Kiểm tra file `PROFILE.md` trong dự án.
4. Báo cáo bảng điều khiển trực quan:
   - `MCP Local`: ACTIVE (3 tools).
   - `Cookbook Version`: v1.0.5 (Latest).
   - `Intent Studio`: READY.
   - `Profile`: CUSTOM / DEFAULT.

