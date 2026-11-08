# Bài 7 (Bản Port Google Antigravity) — Kết nối The Cookbook MCP vào Antigravity

> **Dành riêng cho Google Antigravity trên Windows** (Thay thế hướng dẫn gốc của Claude Code tại `guide/07-ket-noi-mcp.md`).

---

## 1. Sự khác biệt cốt lõi: Claude Code vs. Google Antigravity

| Tiêu chí | Claude Code (Gốc) | Google Antigravity (Bản Port Hybrid) |
| :--- | :--- | :--- |
| **Giao thức MCP** | Remote SSE / OAuth Cloud (`ard`) | **Hybrid Native Transport (`cookbook`)** |
| **Xác thực** | Bắt buộc mở trình duyệt login OAuth qua email | **Token File + Auto-Refresh**: Lưu tại `~/.gemini/config/ard-token.json`, tự động refresh token ngầm khi hết hạn. |
| **Cấu hình** | Lệnh `/mcp` nội bộ trong terminal Claude | Tệp cấu hình chuẩn `~/.gemini/config/mcp_config.json`. |
| **Độ trễ** | Phụ thuộc đường truyền Internet tới server US | **Tức thì (0ms latency)** với kho cục bộ, kết nối Cloud khi cần kiểm tra bản mới nhất. |
| **Cách kích hoạt** | Chat qua Claude Code CLI | Tích hợp sâu vào công cụ native `call_mcp_tool` của Antigravity. |

---

## 2. Trạng Thái Xác Thực & Cấu Trúc MCP Đã Thiết Lập

### 2.1. Xác thực Token Cloud (`ard`)
* **Vị trí lưu token**:
  👉 `C:\Users\nguyen.thanh-trung9\.gemini\config\ard-token.json`
* **Trạng thái kiểm định**: **ĐÃ XÁC THỰC THÀNH CÔNG (200 OK)**
  - Tài khoản thành viên: `trungnt1103@gmail.com`
  - Quyền sở hữu (Grants): Khóa học The Cookbook (`course:fe661dfe-998d-42f4-b950-73fdfbb817e1` — `owned: true`)
  - Cơ chế tự động làm mới: Hỗ trợ OAuth 2.0 PKCE `refresh_token`, khi `access_token` hết hạn (sau 3600 giây), hệ thống tự động làm mới ngầm mà không làm gián đoạn phiên làm việc.

### 2.2. Cấu hình máy chủ MCP
MCP Server của The Cookbook đã được đăng ký và hoạt động tại:
* **Tệp cấu hình**: `C:\Users\nguyen.thanh-trung9\.gemini\config\mcp_config.json`
* **Mã nguồn Server**: `D:\VibeCode\Oops La Bookstore\scripts\mcp\cookbook-server.js` (hoặc bản global tại `~/.gemini/config/mcp-servers/cookbook/cookbook-server.js`)
* **Thư mục Schemas**: `C:\Users\nguyen.thanh-trung9\.gemini\antigravity-cli\mcp\cookbook\`

```json
{
  "mcpServers": {
    "cookbook": {
      "command": "node",
      "args": [
        "D:\\VibeCode\\Oops La Bookstore\\scripts\\mcp\\cookbook-server.js"
      ],
      "disabled": false
    }
  }
}
```

---

## 3. Danh mục Công cụ MCP Khả dụng (Tools)

Máy chủ `cookbook` cung cấp 3 công cụ tự động nạp (Lazy-loaded tools) cho Antigravity:

1. **`cookbook_list_recipes`**:
   - *Công dụng*: Liệt kê toàn bộ danh mục 6 công thức chuẩn từ `DOMAIN.md` kèm theo mức độ rủi ro và các cặp đi kèm.
2. **`cookbook_get_recipe`**:
   - *Tham số*: `recipe_name` (`auth-roles`, `booking`, `crm`, `documents`, `email`, `payments`).
   - *Công dụng*: Đọc toàn văn tệp workbook chứa đầy đủ các quyết định (Decisions), bẫy cần tránh (Traps), bảo đảm bất biến (Guarantees) và tiêu chuẩn kiểm thử (Tests).
3. **`cookbook_search`**:
   - *Tham số*: `keyword` (Từ khóa cần tra cứu).
   - *Công dụng*: Tìm kiếm nhanh theo ngữ cảnh trong toàn bộ kho công thức và tài liệu hướng dẫn của The Cookbook (kết hợp cả local và cloud).

---

## 4. Cách Prompt Để Luôn Kiểm Tra Bản Mới Nhất (Latest Cookbook)

Khi làm việc với Antigravity, nếu bạn muốn AI **không chỉ dùng dữ liệu offline có sẵn mà luôn kiểm tra các cập nhật, bài học hoặc công thức mới nhất trên máy chủ Cloud**, hãy sử dụng các cấu trúc prompt sau:

### Mẫu 1: Kiểm tra cập nhật công thức trước khi áp dụng
```text
Hãy gọi MCP cookbook để kiểm tra bản mới nhất (latest) của công thức [payments / auth-roles / booking] trong The Cookbook. 
Đối chiếu xem có cập nhật hay lưu ý gì mới từ Tony trên mcp.arealisticdreamer.com trước khi áp dụng vào tính năng hiện tại.
```

### Mẫu 2: Tra cứu tài nguyên và bài học mới
```text
Kiểm tra trên The Cookbook xem có tài nguyên mẫu hoặc hướng dẫn cập nhật nào liên quan đến [vấn đề X, ví dụ: hoàn tiền VietQR / phân quyền staff] không. Nếu có bản online mới, hãy ưu tiên thông tin đó.
```

### Mẫu 3: Lập trình bám sát Invariants mới nhất
```text
Dựa vào công thức mới nhất trong The Cookbook (kiểm tra qua MCP), hãy liệt kê các Invariants bắt buộc và bẫy (Traps) cần tránh cho module này.
```

---

## 5. Xử Lý Sự Cố & Tự Động Làm Mới Token

- **Khi token hết hạn**: Token được cấu hình cơ chế tự động refresh qua `refresh_token` tại `https://mcp.arealisticdreamer.com/oauth/token`. Bạn không cần đăng nhập lại thủ công.
- **Nếu cần cấp lại token mới**: Đăng nhập lại trên `arealisticdreamer.com/members` và cập nhật chuỗi token vào `C:\Users\nguyen.thanh-trung9\.gemini\config\ard-token.json`.
- **Chế độ ngoại tuyến (Offline Safe)**: Dù mất kết nối Internet, máy chủ MCP `cookbook` vẫn tự động fallback 100% sang tài liệu cục bộ tại `Cookbook/the-cookbook-v1.0.5/`, đảm bảo công việc không bao giờ bị đình trệ.
