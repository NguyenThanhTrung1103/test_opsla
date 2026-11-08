/**
 * Oops La Book Store — Vertical Spread Viewer
 * Continuous vertical scroll sequence for interior book spreads and plates.
 */

import type { MediaAsset, Book } from '../../types/domain.ts';

export function renderVerticalSpreads(book: Book, spreads: MediaAsset[]): string {
  if (!spreads || spreads.length === 0) {
    return `
      <div class="py-20 text-center font-mono text-sm text-[#777777]">
        Chưa có dữ liệu ruột sách cho tác phẩm này.
      </div>
    `;
  }

  return `
    <div class="space-y-12 max-w-4xl mx-auto py-8">
      ${spreads.map((spread, index) => `
        <div class="spread-item border border-[#E5E5E5] bg-white p-4 sm:p-6 relative shadow-sm" data-spread-id="${spread.id}" data-index="${index}">
          <!-- Spread Header Tag -->
          <div class="flex items-center justify-between pb-3 mb-4 border-b border-[#EAE6DF] font-mono text-xs">
            <div class="flex items-center gap-2">
              <span class="w-2 h-2 bg-[#E30613] inline-block"></span>
              <span class="font-semibold text-[#111111]">Plate ${String(index + 1).padStart(2, '0')}: ${spread.title}</span>
            </div>
            <span class="bg-[#111111] text-white px-2 py-0.5 text-[10px] uppercase font-medium">
              ${spread.scaleLabel}
            </span>
          </div>

          <!-- Spread Canvas Viewport with Zoom Capability -->
          <div class="spread-viewport relative overflow-hidden bg-[#F8F8F6] border border-[#E5E5E5] aspect-16/10 cursor-zoom-in" data-zoom-target="${spread.id}">
            <div class="spread-content w-full h-full flex items-center justify-center p-4 transition-transform duration-75">
              ${spread.svgPlateIndex !== undefined ? `
                <div class="w-full h-full flex flex-col items-center justify-center p-4 bg-[#FAF9F5] border border-[#E0DED9] relative select-none">
                  <svg class="w-full h-full max-h-96" viewBox="0 0 800 500" xmlns="http://www.w3.org/2000/svg">
                    <!-- Architectural Drawing Background Grid -->
                    <defs>
                      <pattern id="archGrid_${index}" width="20" height="20" patternUnits="userSpaceOnUse">
                        <path d="M 20 0 L 0 0 0 20" fill="none" stroke="#EAE6DF" stroke-width="0.5"/>
                      </pattern>
                    </defs>
                    <rect width="100%" height="100%" fill="url(#archGrid_${index})"/>
                    <!-- Technical Elevation Outline -->
                    <rect x="120" y="80" width="560" height="340" fill="none" stroke="#111111" stroke-width="2"/>
                    <line x1="120" y1="200" x2="680" y2="200" stroke="#111111" stroke-width="1.5" stroke-dasharray="4,2"/>
                    <line x1="280" y1="80" x2="280" y2="420" stroke="#111111" stroke-width="1.5"/>
                    <line x1="480" y1="80" x2="480" y2="420" stroke="#111111" stroke-width="1.5"/>
                    <circle cx="280" cy="200" r="16" fill="none" stroke="#E30613" stroke-width="1.5"/>
                    <circle cx="480" cy="200" r="16" fill="none" stroke="#E30613" stroke-width="1.5"/>
                    <!-- Section Measurements -->
                    <line x1="120" y1="440" x2="680" y2="440" stroke="#666666" stroke-width="1"/>
                    <text x="400" y="455" text-anchor="middle" font-family="monospace" font-size="11" fill="#444444">SPAN: 8,400mm [SCALE 1:20]</text>
                    <text x="140" y="110" font-family="monospace" font-size="12" font-weight="bold" fill="#111111">SEC 0${index + 1}: ${spread.title.toUpperCase()}</text>
                    <text x="140" y="130" font-family="serif" font-size="11" fill="#666666">${book.title} — Atelier Bow-Wow</text>
                    <text x="660" y="410" text-anchor="end" font-family="monospace" font-size="10" fill="#E30613">● 1:20 DETAIL ANNOTATION</text>
                  </svg>
                  <div class="absolute bottom-2 right-3 text-[9px] font-mono text-[#888888] bg-white/90 px-2 py-0.5 border border-[#E5E5E5]">
                    [Cuộn hoặc Click để Phóng To Blueprint 1:20]
                  </div>
                </div>
              ` : `
                <img src="${spread.imageUrl || 'placeholder.jpg'}" alt="${spread.title}" class="max-w-full max-h-full object-contain" />
              `}
            </div>
          </div>

          <!-- Spread Specs Footer -->
          <div class="mt-3 flex justify-between items-center text-[10px] font-mono text-[#888888]">
            <span>${book.publisher}</span>
            <span>Trang ${index * 2 + 1}–${index * 2 + 2}</span>
          </div>
        </div>
      `).join('')}
    </div>
  `;
}
