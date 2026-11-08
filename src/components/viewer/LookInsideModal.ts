/**
 * Oops La Book Store — Look Inside Modal Component
 * Full-screen modal for continuous vertical inspection of monographs
 * and 1:20 scale architectural drawings.
 */

import type { Book, MediaAsset } from '../../types/domain.ts';
import { renderVerticalSpreads } from './VerticalSpreadViewer.ts';

export function renderLookInsideModal(book: Book, spreads: MediaAsset[]): string {
  return `
    <div id="look-inside-modal" class="fixed inset-0 z-50 flex flex-col bg-[#FAF7F2] text-[#111111] overflow-hidden" role="dialog" aria-modal="true">
      <!-- Modal Navigation Bar -->
      <header class="border-b border-[#E5E5E5] bg-white px-6 py-4 flex items-center justify-between z-10 shrink-0">
        <div class="flex items-center gap-4">
          <div class="w-3 h-3 bg-[#E30613]"></div>
          <div>
            <span class="font-mono text-[10px] uppercase tracking-widest text-[#E30613] font-semibold block">Look Inside Viewer</span>
            <h2 class="font-serif text-xl sm:text-2xl text-[#111111] font-medium leading-none">${book.title}</h2>
          </div>
          <span class="hidden sm:inline-block font-mono text-xs text-[#888888] border-l border-[#E5E5E5] pl-4">
            ${book.dimensionsText}
          </span>
        </div>

        <!-- Zoom & Viewport Controls -->
        <div class="flex items-center gap-2 font-mono text-xs">
          <div class="hidden md:flex items-center border border-[#111111] bg-[#FAF7F2] p-0.5">
            <button id="zoom-out-btn" class="px-2.5 py-1 hover:bg-[#111111] hover:text-white transition-colors" title="Thu nhỏ (-)">-</button>
            <span id="zoom-level-indicator" class="px-2 text-[11px] font-semibold">100%</span>
            <button id="zoom-in-btn" class="px-2.5 py-1 hover:bg-[#111111] hover:text-white transition-colors" title="Phóng to (+)">+</button>
            <button id="zoom-120-btn" class="px-2.5 py-1 bg-[#111111] text-white hover:bg-[#E30613] transition-colors font-medium text-[10px]" title="Phóng to tỷ lệ 1:20">1:20 ZOOM</button>
            <button id="zoom-reset-btn" class="px-2.5 py-1 hover:bg-[#111111] hover:text-white transition-colors" title="Khôi phục">1x</button>
          </div>

          <button id="close-modal-btn" class="px-4 py-2 border border-[#111111] bg-[#111111] text-white hover:bg-[#E30613] transition-colors font-mono text-xs uppercase tracking-wider flex items-center gap-1.5">
            <span>Đóng [ESC]</span>
          </button>
        </div>
      </header>

      <!-- Scrollable Spread Gallery Container (Continuous Vertical Scroll) -->
      <main id="spread-scroll-container" class="flex-1 overflow-y-auto px-4 sm:px-6 bg-[#F8F8F6]">
        ${renderVerticalSpreads(book, spreads)}
      </main>

      <!-- Modal Footer Status -->
      <footer class="border-t border-[#E5E5E5] bg-white px-6 py-2.5 flex items-center justify-between font-mono text-[10px] text-[#777777] shrink-0">
        <span>Sách kiến trúc giám tuyển — Lưu ý: Xem ruột sách không ảnh hưởng tồn kho</span>
        <span>Phím tắt: ESC (Đóng) | + / - (Phóng to / Thu nhỏ)</span>
      </footer>
    </div>
  `;
}
