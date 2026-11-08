/**
 * Oops La Book Store — Collector Bag (Túi Yêu Cầu Mua)
 * In-memory client cart management.
 * Invariant BD-04: Items in bag DO NOT reserve or decrement stock.
 */

import type { Book, OrderItem } from '../../types/domain.ts';
import { formatVND } from '../../utils/currencyFormatter.ts';

export class CollectorBag {
  private items: Map<string, OrderItem> = new Map();

  public addItem(book: Book, quantity = 1): void {
    if (quantity <= 0) return;

    const existing = this.items.get(book.id);
    if (existing) {
      existing.quantity += quantity;
    } else {
      this.items.set(book.id, {
        bookId: book.id,
        bookTitle: book.title,
        quantity,
        unitPriceVND: book.priceVND
      });
    }
  }

  public removeItem(bookId: string): void {
    this.items.delete(bookId);
  }

  public updateQuantity(bookId: string, quantity: number): void {
    if (quantity <= 0) {
      this.removeItem(bookId);
      return;
    }
    const item = this.items.get(bookId);
    if (item) {
      item.quantity = quantity;
    }
  }

  public clear(): void {
    this.items.clear();
  }

  public getItems(): OrderItem[] {
    return Array.from(this.items.values());
  }

  public getSubtotalVND(): number {
    let total = 0;
    for (const item of this.items.values()) {
      total += item.unitPriceVND * item.quantity;
    }
    return total;
  }

  public getItemCount(): number {
    let count = 0;
    for (const item of this.items.values()) {
      count += item.quantity;
    }
    return count;
  }

  public renderDrawer(): string {
    const items = this.getItems();
    const subtotal = this.getSubtotalVND();
    const count = this.getItemCount();

    return `
      <div id="collector-bag-drawer" class="fixed inset-y-0 right-0 w-full max-w-md bg-white border-l border-[#111111] z-50 flex flex-col shadow-2xl">
        <!-- Header -->
        <header class="border-b border-[#E5E5E5] px-6 py-4 flex items-center justify-between">
          <div>
            <span class="font-mono text-[10px] uppercase tracking-widest text-[#E30613] font-semibold block">Túi yêu cầu mua</span>
            <h2 class="font-serif text-2xl text-[#111111] font-medium">Collector Bag (${count})</h2>
          </div>
          <button id="close-bag-btn" class="font-mono text-xs text-[#888888] hover:text-[#111111]">
            [Đóng ✕]
          </button>
        </header>

        <!-- Bag Items List -->
        <main class="flex-1 overflow-y-auto p-6 space-y-4">
          ${items.length === 0 ? `
            <div class="py-20 text-center font-mono text-xs text-[#888888] space-y-3">
              <p>Túi yêu cầu của bạn đang trống.</p>
              <p class="text-[10px] text-[#AAAAAA]">Khám phá danh mục và chọn tác phẩm để thêm vào túi.</p>
            </div>
          ` : `
            <div class="space-y-4">
              ${items.map(item => `
                <div class="border border-[#E5E5E5] p-4 bg-[#FAF7F2] flex justify-between gap-4 font-mono text-xs">
                  <div>
                    <h4 class="font-serif text-base text-[#111111] font-medium leading-snug">${item.bookTitle}</h4>
                    <span class="text-[#777777] block mt-1">${formatVND(item.unitPriceVND)} × ${item.quantity}</span>
                  </div>
                  <div class="flex flex-col items-end justify-between">
                    <span class="font-semibold text-[#111111]">${formatVND(item.unitPriceVND * item.quantity)}</span>
                    <button class="btn-remove-item text-[10px] text-[#E30613] hover:underline" data-book-id="${item.bookId}">
                      Xóa
                    </button>
                  </div>
                </div>
              `).join('')}
            </div>
          `}
        </main>

        <!-- Footer & Checkout Trigger -->
        <footer class="border-t border-[#E5E5E5] p-6 bg-[#FAF7F2] space-y-4">
          <div class="flex justify-between items-baseline font-mono text-sm">
            <span class="text-[#777777]">Tổng tạm tính:</span>
            <span class="text-xl font-semibold text-[#111111]">${formatVND(subtotal)}</span>
          </div>

          <p class="font-mono text-[10px] text-[#777777] leading-relaxed">
            * Lưu ý: Gửi yêu cầu không tự động trừ kho. Tiệm sẽ liên hệ đối soát tình trạng sách và thông tin cọc qua Messenger.
          </p>

          <button 
            id="proceed-checkout-btn" 
            class="w-full py-3.5 bg-[#111111] text-white hover:bg-[#E30613] transition-colors font-mono text-xs uppercase tracking-wider text-center ${items.length === 0 ? 'opacity-50 cursor-not-allowed pointer-events-none' : ''}"
          >
            Điền thông tin đặt mua →
          </button>
        </footer>
      </div>
    `;
  }
}

export const collectorBag = new CollectorBag();
