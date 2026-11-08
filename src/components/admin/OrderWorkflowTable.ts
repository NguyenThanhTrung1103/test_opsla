/**
 * Oops La Book Store — Admin Order Workflow Table
 * Renders orders management table enforcing:
 * - AC-11: Disabled CONFIRMED button for Staff
 * - OD-01: Disabled Cancel button for Staff on confirmed orders
 * - 48-Hour Stale Badge for uncontacted orders
 * - OD-03 Option B: Explicit offline refund policy note
 * - XSS Protection: Escapes customer input before rendering
 */

import type { Order, UserRole, OrderStatus } from '../../types/domain.ts';
import { formatVND } from '../../utils/currencyFormatter.ts';
import { orderService } from '../../services/orderService.ts';
import { permissionGuard } from '../../services/permissionGuard.ts';
import { escapeHtml } from '../../utils/sanitizer.ts';

export function renderOrderWorkflowTable(orders: Order[], currentRole: UserRole, currentFilter: OrderStatus | 'ALL' = 'ALL'): string {
  const filteredOrders = currentFilter === 'ALL' 
    ? orders 
    : orders.filter(o => o.status === currentFilter);

  const isOwner = permissionGuard.canConfirmOrder(currentRole);

  return `
    <div class="space-y-6">
      <!-- Filter Tabs -->
      <div class="flex flex-wrap items-center justify-between gap-4 border-b border-[#E5E5E5] pb-4 font-mono text-xs">
        <div class="flex flex-wrap gap-2">
          ${(['ALL', 'PENDING_CONTACT', 'CONTACTED', 'CONFIRMED', 'CANCELLED'] as const).map(st => `
            <button 
              data-filter-order-status="${st}"
              class="order-tab-btn px-3 py-1.5 border ${currentFilter === st ? 'bg-[#111111] text-white border-[#111111]' : 'bg-[#FAF7F2] text-[#444444] border-[#E5E5E5] hover:border-[#111111]'}"
            >
              ${st === 'ALL' ? 'Tất cả đơn' : st}
            </button>
          `).join('')}
        </div>

        <span class="text-[#777777]">Tổng cộng: ${filteredOrders.length} đơn</span>
      </div>

      <!-- Orders Table -->
      <div class="border border-[#111111] bg-white overflow-x-auto shadow-xs">
        <table class="w-full text-left border-collapse font-mono text-xs">
          <thead>
            <tr class="bg-[#FAF7F2] border-b border-[#111111] text-[#777777] uppercase text-[10px]">
              <th class="p-3 border-r border-[#E5E5E5]">Mã đơn / Thời gian</th>
              <th class="p-3 border-r border-[#E5E5E5]">Khách hàng</th>
              <th class="p-3 border-r border-[#E5E5E5]">Chuyên khảo & Số lượng</th>
              <th class="p-3 border-r border-[#E5E5E5]">Tổng giá trị</th>
              <th class="p-3 border-r border-[#E5E5E5]">Trạng thái</th>
              <th class="p-3">Hành động (${currentRole})</th>
            </tr>
          </thead>
          <tbody class="divide-y divide-[#E5E5E5]">
            ${filteredOrders.length === 0 ? `
              <tr>
                <td colspan="6" class="p-8 text-center text-[#888888] font-mono">
                  Không có đơn hàng nào trong mục này.
                </td>
              </tr>
            ` : filteredOrders.map(order => {
              const isStale = orderService.isOrderStale(order);
              const isConfirmed = order.status === 'CONFIRMED';
              const isCancelled = order.status === 'CANCELLED';
              const canStaffCancel = permissionGuard.canCancelOrder(order.status, currentRole);

              return `
                <tr class="hover:bg-[#FAF7F2]/60 transition-colors ${isStale ? 'bg-amber-50/50' : ''}">
                  <!-- Order ID & Timestamp -->
                  <td class="p-3 border-r border-[#E5E5E5]">
                    <span class="font-semibold text-[#111111] block">${escapeHtml(order.id)}</span>
                    <span class="text-[10px] text-[#777777]">${new Date(order.createdAt).toLocaleString('vi-VN')}</span>
                    ${isStale ? `
                      <span class="inline-block mt-1 px-2 py-0.5 bg-[#D97706] text-white text-[9px] font-semibold tracking-wider">
                        ⚠️ QUÁ 48H CHỜ CỌC
                      </span>
                    ` : ''}
                  </td>

                  <!-- Customer Info (XSS Sanitized) -->
                  <td class="p-3 border-r border-[#E5E5E5]">
                    <span class="font-medium text-[#111111] block">${escapeHtml(order.customer.fullName)}</span>
                    <span class="text-[#0080C6] block">${escapeHtml(order.customer.phone)}</span>
                    <span class="text-[10px] text-[#777777] truncate max-w-xs block">${escapeHtml(order.customer.address)}</span>
                  </td>

                  <!-- Items -->
                  <td class="p-3 border-r border-[#E5E5E5]">
                    ${order.items.map(it => `
                      <div class="line-clamp-1">
                        • ${escapeHtml(it.bookTitle)} <span class="text-[#777777]">(×${it.quantity})</span>
                      </div>
                    `).join('')}
                  </td>

                  <!-- Subtotal -->
                  <td class="p-3 border-r border-[#E5E5E5] font-semibold text-[#111111]">
                    ${formatVND(order.subtotalVND)}
                  </td>

                  <!-- Status Badge -->
                  <td class="p-3 border-r border-[#E5E5E5]">
                    <span class="px-2 py-1 text-[10px] font-semibold inline-block ${
                      order.status === 'CONFIRMED' ? 'bg-[#15803D] text-white' :
                      order.status === 'CONTACTED' ? 'bg-[#0080C6] text-white' :
                      order.status === 'CANCELLED' ? 'bg-[#666666] text-white' :
                      'bg-[#FAF7F2] border border-[#CCCCCC] text-[#111111]'
                    }">
                      ${order.status}
                    </span>
                  </td>

                  <!-- Action Buttons with AC-11 and OD-01 Guards -->
                  <td class="p-3 space-x-1 whitespace-nowrap">
                    ${!isConfirmed && !isCancelled ? `
                      <!-- Contacted Action -->
                      <button 
                        data-action="CONTACTED" 
                        data-order-id="${escapeHtml(order.id)}"
                        class="btn-order-action px-2 py-1 bg-white border border-[#0080C6] text-[#0080C6] hover:bg-[#0080C6] hover:text-white transition-colors text-[10px]"
                      >
                        Đã liên hệ
                      </button>

                      <!-- Confirmed Action (AC-11 Guard) -->
                      <button 
                        data-action="CONFIRMED" 
                        data-order-id="${escapeHtml(order.id)}"
                        ${!isOwner ? 'disabled title="LỖI PHÂN QUYỀN (AC-11): Chỉ Owner mới được quyền duyệt đơn"' : ''}
                        class="btn-order-action px-2 py-1 ${!isOwner ? 'bg-[#E5E5E5] text-[#999999] border-transparent cursor-not-allowed' : 'bg-[#15803D] text-white hover:bg-green-700 border-[#15803D]'} transition-colors text-[10px] font-semibold"
                      >
                        ${isOwner ? 'Duyệt đơn ✓' : 'Duyệt (Chỉ Owner)'}
                      </button>
                    ` : ''}

                    ${!isCancelled ? `
                      <!-- Cancel Action (OD-01 Guard) -->
                      <button 
                        data-action="CANCELLED" 
                        data-order-id="${escapeHtml(order.id)}"
                        ${!canStaffCancel ? 'disabled title="LỖI PHÂN QUYỀN (OD-01): Đơn đã duyệt chỉ Owner mới được hủy"' : ''}
                        class="btn-order-action px-2 py-1 ${!canStaffCancel ? 'bg-[#E5E5E5] text-[#999999] border-transparent cursor-not-allowed' : 'bg-white border border-[#DC2626] text-[#DC2626] hover:bg-[#DC2626] hover:text-white'} transition-colors text-[10px]"
                      >
                        ${isConfirmed && !isOwner ? 'Hủy đơn (Chỉ Owner)' : 'Hủy đơn'}
                      </button>
                    ` : `
                      <span class="text-[10px] text-[#888888] italic">Đã hủy đơn</span>
                    `}
                  </td>
                </tr>
              `;
            }).join('')}
          </tbody>
        </table>
      </div>

      <!-- Policy Reminder (OD-03 Option B) -->
      <div class="p-3 bg-[#FAF7F2] border-l-2 border-[#111111] text-[11px] font-mono text-[#555555]">
        <span class="font-semibold text-[#111111]">Chính sách hoàn cọc:</span> 
        OD-03 Option B: Hoàn trả tiền cọc thực hiện thủ công ngoài đời (chuyển khoản lại trong 24h)
      </div>
    </div>
  `;
}
