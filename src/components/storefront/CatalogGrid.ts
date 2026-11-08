/**
 * Oops La Book Store — Catalog Grid Component
 * Swiss Grid monograph catalog showing stock status badges, dimensions,
 * strictly formatted VNĐ pricing, and interaction triggers.
 */

import type { Book } from '../../types/domain.ts';
import { formatVND } from '../../utils/currencyFormatter.ts';

export function renderCatalogGrid(books: Book[]): string {
  if (books.length === 0) {
    return `
      <section class="max-w-7xl mx-auto px-6 py-20 text-center">
        <div class="border border-[#E5E5E5] bg-[#FAF7F2] p-12 max-w-lg mx-auto">
          <p class="font-mono text-sm text-[#777777] mb-2">[KHÔNG TÌM THẤY KẾT QUẢ]</p>
          <h3 class="font-serif text-2xl text-[#111111] mb-4">Không có chuyên khảo phù hợp</h3>
          <p class="font-sans text-xs text-[#555555] mb-6">
            Thử tìm kiếm với từ khóa khác (ví dụ: "Bow-Wow", "Tadao Ando" hoặc mã số ISBN).
          </p>
          <button id="reset-filter-btn" class="px-5 py-2.5 bg-[#111111] text-white font-mono text-xs uppercase tracking-wider">
            Đặt lại bộ lọc
          </button>
        </div>
      </section>
    `;
  }

  return `
    <section class="max-w-7xl mx-auto px-6 py-12">
      <div class="flex items-center justify-between mb-6 pb-2 border-b border-[#E5E5E5] font-mono text-xs text-[#777777]">
        <span>Hiển thị ${books.length} tác phẩm tuyển chọn</span>
        <span>Swiss Grid 1:1 Layout</span>
      </div>

      <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-8">
        ${books.map(book => {
          let badgeHtml = '';
          if (book.status === 'SOLD_OUT') {
            badgeHtml = `<span class="bg-[#111111] text-white font-mono text-[10px] tracking-wider uppercase px-2 py-1">TẠM HẾT HÀNG (SOLD OUT)</span>`;
          } else if (book.status === 'ONE_COPY_LEFT') {
            badgeHtml = `<span class="bg-[#D97706] text-white font-mono text-[10px] tracking-wider uppercase px-2 py-1">CHỈ CÒN 1 BẢN</span>`;
          } else {
            badgeHtml = `<span class="bg-[#15803D] text-white font-mono text-[10px] tracking-wider uppercase px-2 py-1">CÒN HÀNG (${book.stockCount})</span>`;
          }

          const isSoldOut = book.status === 'SOLD_OUT';

          return `
            <div class="border border-[#E5E5E5] bg-white flex flex-col justify-between hover:border-[#111111] transition-all group p-5">
              <div>
                <!-- Book Plate Preview -->
                <div class="aspect-4/3 bg-[#F8F8F6] border border-[#EAE6DF] relative overflow-hidden flex items-center justify-center p-3 mb-5">
                  <div class="w-full h-full flex flex-col items-center justify-center text-center p-4 border border-dashed border-[#D5D0C7]">
                    <span class="font-serif text-lg text-[#111111] font-semibold leading-tight line-clamp-2">${book.title}</span>
                    <span class="font-mono text-[10px] text-[#666666] mt-2">${book.author}</span>
                    <span class="font-mono text-[9px] text-[#999999] mt-1">${book.publisher}</span>
                  </div>

                  <div class="absolute top-2 left-2">
                    ${badgeHtml}
                  </div>

                  ${book.bookSize === 'SUMO' ? `
                    <div class="absolute top-2 right-2 bg-[#C5A059] text-white font-mono text-[10px] px-2 py-0.5 font-semibold">
                      SUMO
                    </div>
                  ` : ''}
                </div>

                <!-- Book Details -->
                <div class="space-y-2">
                  <span class="font-mono text-[10px] uppercase tracking-wider text-[#E30613] font-semibold block">
                    ${book.category}
                  </span>
                  <h3 class="font-serif text-xl text-[#111111] font-medium leading-snug group-hover:text-[#E30613] transition-colors">
                    ${book.title}
                  </h3>
                  <p class="font-mono text-xs text-[#555555]">
                    ${book.author} (${book.publicationYear})
                  </p>
                  <p class="font-sans text-xs text-[#666666] line-clamp-2 leading-relaxed pt-1">
                    ${book.description}
                  </p>
                </div>
              </div>

              <!-- Specs & Action Footer -->
              <div class="mt-6 pt-4 border-t border-[#E5E5E5] space-y-4">
                <div class="flex justify-between items-baseline font-mono text-xs">
                  <span class="text-[#888888]">ISBN: ${book.isbn}</span>
                  <span class="text-base text-[#111111] font-semibold">${formatVND(book.priceVND)}</span>
                </div>

                <div class="grid grid-cols-2 gap-2 pt-1">
                  <button 
                    class="btn-look-inside w-full py-2.5 border border-[#111111] bg-white text-[#111111] hover:bg-[#F0EBE1] transition-colors font-mono text-xs uppercase tracking-wider text-center"
                    data-book-id="${book.id}"
                  >
                    Look Inside
                  </button>
                  <button 
                    class="btn-add-bag w-full py-2.5 ${isSoldOut ? 'bg-[#E5E5E5] text-[#999999] cursor-not-allowed border-transparent' : 'bg-[#111111] text-white hover:bg-[#E30613] transition-colors border-[#111111]'} font-mono text-xs uppercase tracking-wider text-center"
                    data-book-id="${book.id}"
                    ${isSoldOut ? 'disabled' : ''}
                  >
                    ${isSoldOut ? 'Hết hàng' : 'Chọn mua'}
                  </button>
                </div>
              </div>
            </div>
          `;
        }).join('')}
      </div>
    </section>
  `;
}
