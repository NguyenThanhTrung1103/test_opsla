/**
 * Oops La Book Store — Messenger Export Modal Component
 * Renders formatted clipboard message box after collector request submission.
 * XSS-safe input escaping.
 */

import type { Order } from '../../types/domain.ts';
import { orderService } from '../../services/orderService.ts';
import { escapeHtml } from '../../utils/sanitizer.ts';

export function renderMessengerExportModal(order: Order): string {
  const messageText = orderService.formatMessengerExport(order);

  return `
    <div id="messenger-export-modal" class="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" role="dialog" aria-modal="true">
      <div class="bg-white border border-[#111111] max-w-xl w-full p-6 sm:p-8 space-y-6 shadow-2xl relative">
        <!-- Close Button -->
        <button id="close-export-modal-btn" class="absolute top-4 right-4 text-xs font-mono text-[#888888] hover:text-[#111111]">
          [Đóng ✕]
        </button>

        <!-- Header -->
        <div class="space-y-2">
          <div class="inline-flex items-center gap-2 bg-[#15803D] text-white px-2.5 py-0.5 font-mono text-xs font-semibold">
            <span>✓ GỬI YÊU CẦU THÀNH CÔNG</span>
          </div>
          <h2 class="font-serif text-3xl text-[#111111] font-medium leading-tight">
            Mã yêu cầu: <span class="text-[#E30613] font-mono font-semibold">${escapeHtml(order.id)}</span>
          </h2>
          <p class="font-sans text-xs text-[#555555] leading-relaxed">
            Hệ thống đã ghi nhận yêu cầu của bạn. Vui lòng sao chép nội dung tin nhắn dưới đây và gửi tới Facebook Messenger của tiệm để nhân viên kiểm tra tình trạng sách thực tế và hướng dẫn chuyển khoản cọc.
          </p>
        </div>

        <!-- Formatted Message Box -->
        <div class="space-y-2">
          <label class="block font-mono text-[11px] uppercase tracking-wider text-[#777777] font-semibold">
            Nội dung tin nhắn chuẩn định dạng:
          </label>
          <textarea 
            id="messenger-clipboard-text" 
            readonly 
            rows="9" 
            class="w-full bg-[#FAF7F2] border border-[#CCCCCC] p-3 font-mono text-xs text-[#222222] leading-relaxed focus:outline-none select-all"
          >${escapeHtml(messageText)}</textarea>
        </div>

        <!-- Action Buttons -->
        <div class="space-y-3 pt-2">
          <button 
            id="copy-messenger-text-btn" 
            class="w-full py-3.5 bg-[#111111] text-white hover:bg-[#E30613] transition-colors font-mono text-xs uppercase tracking-wider flex items-center justify-center gap-2"
          >
            <span id="copy-btn-text">Sao chép tin nhắn Messenger</span>
            <span>📋</span>
          </button>

          <div class="flex items-center justify-between text-xs font-mono text-[#777777] pt-2">
            <span>Không tự giữ kho tự động</span>
            <a href="https://m.me/tiemsachoopsla" target="_blank" rel="noopener noreferrer" class="text-[#0080C6] hover:underline font-semibold">
              Mở Messenger tiệm sách →
            </a>
          </div>
        </div>
      </div>
    </div>
  `;
}
