/**
 * Oops La Book Store — Hero Showcase Component
 * Spotlight on Atelier Bow-Wow: Graphic Anatomy & 1:20 Sectional Perspectives.
 * Swiss Grid aesthetics with zero border radius.
 */

import type { Book } from '../../types/domain.ts';
import { formatVND } from '../../utils/currencyFormatter.ts';

export function renderHeroShowcase(featuredBook: Book | null): string {
  if (!featuredBook) return '';

  return `
    <section class="border-b border-[#E5E5E5] bg-[#F8F8F6] px-6 py-12 md:py-16">
      <div class="max-w-7xl mx-auto grid grid-cols-1 lg:grid-cols-12 gap-8 items-center">
        <!-- Text & Architectural Narrative -->
        <div class="lg:col-span-7 space-y-6">
          <div class="inline-flex items-center gap-3 border border-[#E30613] px-3 py-1 bg-white">
            <span class="w-2 h-2 bg-[#E30613] inline-block"></span>
            <span class="font-mono text-xs uppercase tracking-widest text-[#E30613] font-semibold">Special Feature — Monograph Focus</span>
          </div>

          <h1 class="font-serif text-4xl sm:text-5xl lg:text-6xl text-[#111111] leading-tight font-medium">
            Atelier Bow-Wow<br/>
            <span class="italic text-[#0080C6] font-normal">Graphic Anatomy</span> 1:20
          </h1>

          <p class="font-sans text-base text-[#444444] leading-relaxed max-w-2xl">
            Tuyển tập chuyên khảo giải phẫu không gian độc bản xuất bản bởi TOTO Publishing (Tokyo). 
            Toàn bộ 43 công trình nhà ở đương đại được bóc tách tỉ mỉ qua phối cảnh mặt cắt 
            với tỷ lệ quy ước 1:20 vẽ tay hoàn toàn.
          </p>

          <div class="grid grid-cols-2 sm:grid-cols-3 gap-4 border-t border-b border-[#E5E5E5] py-4 my-4 font-mono text-xs">
            <div>
              <span class="text-[#777777] block">Tác giả</span>
              <span class="text-[#111111] font-medium">${featuredBook.author}</span>
            </div>
            <div>
              <span class="text-[#777777] block">Quy cách</span>
              <span class="text-[#111111] font-medium">${featuredBook.dimensionsText}</span>
            </div>
            <div>
              <span class="text-[#777777] block">Giá niêm yết</span>
              <span class="text-[#E30613] font-semibold">${formatVND(featuredBook.priceVND)}</span>
            </div>
          </div>

          <div class="flex flex-wrap gap-4 pt-2">
            <button 
              id="hero-look-inside-btn" 
              data-book-id="${featuredBook.id}"
              class="px-6 py-3.5 bg-[#111111] text-white hover:bg-[#E30613] transition-colors font-mono text-xs uppercase tracking-wider flex items-center gap-2"
            >
              <span>Xem ruột sách (Look Inside)</span>
              <span class="font-sans">→</span>
            </button>
            <button 
              id="hero-add-to-bag-btn" 
              data-book-id="${featuredBook.id}"
              class="px-6 py-3.5 border border-[#111111] bg-white text-[#111111] hover:bg-[#F0EBE1] transition-colors font-mono text-xs uppercase tracking-wider"
            >
              Thêm vào túi yêu cầu
            </button>
          </div>
        </div>

        <!-- Architectural Monograph Plate Preview -->
        <div class="lg:col-span-5 flex justify-center">
          <div class="relative w-full max-w-md bg-white border border-[#E5E5E5] p-6 shadow-sm">
            <div class="aspect-square bg-[#F7F5F0] border border-[#EAE6DF] relative overflow-hidden flex items-center justify-center p-4">
              <!-- SVG Architectural Plate Illustration -->
              <svg viewBox="0 0 500 500" class="w-full h-full" xmlns="http://www.w3.org/2000/svg">
                <rect width="500" height="500" fill="#F7F5F0"/>
                <g stroke="#222" stroke-width="1.2" fill="none">
                  <rect x="55" y="65" width="390" height="360" stroke-width="2"/>
                  <rect x="75" y="85" width="350" height="320" stroke-width="1"/>
                  <line x1="75" y1="185" x2="425" y2="185"/>
                  <line x1="75" y1="295" x2="425" y2="295"/>
                  <line x1="210" y1="85" x2="210" y2="405"/>
                  <line x1="325" y1="85" x2="325" y2="405"/>
                  <g stroke="#444" stroke-width="0.8">
                    <line x1="55" y1="310" x2="75" y2="310"/>
                    <line x1="55" y1="320" x2="75" y2="320"/>
                    <line x1="55" y1="330" x2="75" y2="330"/>
                    <line x1="55" y1="340" x2="75" y2="340"/>
                    <line x1="55" y1="350" x2="75" y2="350"/>
                  </g>
                </g>
                <g stroke="#E30613" stroke-width="1" fill="none">
                  <circle cx="255" cy="245" r="28" stroke-dasharray="4,2"/>
                  <path d="M130,140 Q190,115 245,165"/>
                  <path d="M350,150 Q310,210 278,235"/>
                  <line x1="150" y1="345" x2="230" y2="265"/>
                </g>
                <text x="250" y="215" text-anchor="middle" font-family="sans-serif" font-weight="700" font-size="24" fill="#111">図解 アトリエ・ワン</text>
                <text x="250" y="240" text-anchor="middle" font-family="monospace" font-weight="600" font-size="11" letter-spacing="1.5" fill="#111">GRAPHIC ANATOMY ATELIER BOW-WOW</text>
                <text x="250" y="460" text-anchor="middle" font-family="monospace" font-size="9" fill="#555">TOTO PUBLISHING — 1:20 SECTIONAL PERSPECTIVE</text>
              </svg>

              <!-- Scale Badge Stamp -->
              <div class="absolute bottom-3 right-3 bg-[#111111] text-white px-2 py-1 font-mono text-[10px] tracking-wider uppercase">
                Tỷ lệ 1:20
              </div>
            </div>
            <div class="mt-4 flex justify-between items-center text-xs font-mono text-[#555]">
              <span>Mặt cắt phối cảnh Nhà ở Tokyo</span>
              <span class="text-[#E30613] font-semibold">Tồn kho: ${featuredBook.stockCount} cuốn</span>
            </div>
          </div>
        </div>
      </div>
    </section>
  `;
}
