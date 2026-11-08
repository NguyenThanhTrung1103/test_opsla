---
name: cookbook-recipes
description: "Browse, inspect, and retrieve official Cookbook recipe workbooks. Use on 'show cookbook recipes', 'danh mục công thức', 'công thức cookbook', '/cookbook-recipes'."
user-invocable: true
when_to_use: "Invoke to list, search, or inspect the 6 official Cookbook recipe workbooks."
category: utilities
keywords: [recipes, workbooks, auth, booking, crm, documents, email, payments]
argument-hint: "[recipe-name]"
metadata:
  author: agentkit
  version: "1.0.0"
---

# /cookbook-recipes (Recipe Workbooks Catalog)

Tra cứu và hiển thị chi tiết 6 công thức workbook chính thức của The Cookbook v1.0.5.

## Danh mục 6 công thức chính thức
The Cookbook v1.0.5 cung cấp **chính xác 6 công thức workbook**, tuyệt đối không tự bịa thêm công thức khác:

| Công thức (ID) | Tên tệp workbook | Lĩnh vực giải quyết |
| :--- | :--- | :--- |
| **`auth-roles`** | `auth-roles.workbook.md` | Đăng nhập, xác thực, phân quyền vai trò người dùng |
| **`booking`** | `booking.workbook.md` | Đặt lịch, kiểm tra khung giờ trống, chống đặt trùng |
| **`crm`** | `crm.workbook.md` | Quản lý khách hàng tiềm năng, vòng đời lead/contact |
| **`documents`** | `documents.workbook.md` | Quản lý tài liệu, biểu mẫu, tải tệp, metadata |
| **`email`** | `email.workbook.md` | Gửi email thông báo, template, hàng đợi, xác thực |
| **`payments`** | `payments.workbook.md` | Đơn hàng, thanh toán, trạng thái giao dịch, hoàn tiền |

## Hướng dẫn sử dụng
1. Khi người dùng hỏi về công thức chung: Hiển thị bảng 6 công thức trên kèm tóm tắt.
2. Khi người dùng yêu cầu chi tiết 1 công thức cụ thể: Đọc tệp tương ứng trong `recipes/<id>.workbook.md` và trích xuất: Decisions, Traps, Guarantees, Tests.

