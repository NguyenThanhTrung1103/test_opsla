/**
 * Oops La Book Store — Search & Filter Component
 * Real-time instant search input and dimensional/categorical filters.
 */

import type { BookCategory, BookSize } from '../../types/domain.ts';
import { escapeHtml } from '../../utils/sanitizer.ts';

export interface FilterState {
  category: BookCategory | 'ALL';
  bookSize: BookSize | 'ALL';
  searchQuery: string;
}

export function renderSearchAndFilter(state: FilterState): string {
  const categories: Array<{ id: BookCategory | 'ALL'; label: string }> = [
    { id: 'ALL', label: 'Tất cả chuyên mục' },
    { id: 'Monograph', label: 'Monograph' },
    { id: 'Technical Drawings', label: 'Bản vẽ kỹ thuật' },
    { id: 'Urban Theory', label: 'Lý thuyết đô thị' },
    { id: 'Sumo Edition', label: 'Ấn bản SUMO' }
  ];

  const sizes: Array<{ id: BookSize | 'ALL'; label: string }> = [
    { id: 'ALL', label: 'Mọi kích thước' },
    { id: 'STANDARD', label: 'Chuẩn (Standard)' },
    { id: 'SUMO', label: 'SUMO (Khổ lớn)' },
    { id: 'XXL', label: 'XXL Collector' }
  ];

  return `
    <div class="border-b border-[#E5E5E5] bg-white px-6 py-6 sticky top-0 z-20 shadow-xs">
      <div class="max-w-7xl mx-auto space-y-4">
        <!-- Search Input Bar -->
        <div class="relative">
          <input 
            type="text" 
            id="catalog-search-input"
            value="${escapeHtml(state.searchQuery || '')}"
            placeholder="Tìm theo Tên sách, Tác giả, hoặc Mã số ISBN (ví dụ: 978-4-88706...)..." 
            class="w-full bg-[#F8F8F6] border border-[#111111] px-4 py-3 pl-11 font-mono text-sm text-[#111111] placeholder-[#888888] focus:outline-none focus:ring-1 focus:ring-[#111111]"
          />
          <div class="absolute left-3.5 top-3.5 text-[#555555]">
            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <circle cx="11" cy="11" r="8" stroke-width="2"/>
              <line x1="21" y1="21" x2="16.65" y2="16.65" stroke-width="2"/>
            </svg>
          </div>
          ${state.searchQuery ? `
            <button id="clear-search-btn" class="absolute right-3.5 top-3.5 text-xs font-mono text-[#888888] hover:text-[#111111]">
              [Xóa tìm kiếm]
            </button>
          ` : ''}
        </div>

        <!-- Filter Controls -->
        <div class="flex flex-wrap items-center justify-between gap-4 pt-1 text-xs font-mono">
          <!-- Categories Filter Pills -->
          <div class="flex flex-wrap items-center gap-1.5">
            <span class="text-[#888888] mr-1 uppercase">Chuyên mục:</span>
            ${categories.map(cat => `
              <button 
                data-filter-category="${cat.id}"
                class="filter-cat-btn px-3 py-1.5 border ${state.category === cat.id ? 'bg-[#111111] text-white border-[#111111]' : 'bg-[#FAF7F2] text-[#444444] border-[#E5E5E5] hover:border-[#999999]'}"
              >
                ${cat.label}
              </button>
            `).join('')}
          </div>

          <!-- Size Filter Pills -->
          <div class="flex flex-wrap items-center gap-1.5">
            <span class="text-[#888888] mr-1 uppercase">Kích cỡ:</span>
            ${sizes.map(sz => `
              <button 
                data-filter-size="${sz.id}"
                class="filter-size-btn px-3 py-1.5 border ${state.bookSize === sz.id ? 'bg-[#111111] text-white border-[#111111]' : 'bg-[#FAF7F2] text-[#444444] border-[#E5E5E5] hover:border-[#999999]'}"
              >
                ${sz.label}
              </button>
            `).join('')}
          </div>
        </div>
      </div>
    </div>
  `;
}
