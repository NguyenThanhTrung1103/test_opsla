/**
 * Oops La Book Store — Editorial Journal Component
 * Editorial articles focusing on architectural monographs, theory and spatial criticism.
 */

import type { EditorialArticle } from '../../types/domain.ts';

export function renderEditorialJournal(articles: EditorialArticle[]): string {
  if (!articles || articles.length === 0) return '';

  return `
    <section class="border-b border-[#E5E5E5] bg-white px-6 py-12">
      <div class="max-w-7xl mx-auto">
        <div class="flex flex-col md:flex-row md:items-end justify-between mb-8 pb-4 border-b border-[#111111]">
          <div>
            <span class="font-mono text-xs uppercase tracking-widest text-[#E30613] font-semibold block mb-1">Editorial Journal</span>
            <h2 class="font-serif text-3xl sm:text-4xl text-[#111111] font-medium">Đối thoại & Tiểu luận Kiến trúc</h2>
          </div>
          <p class="font-mono text-xs text-[#777777] mt-2 md:mt-0">
            Content First, Commerce Second — Chuyên luận tuyển chọn
          </p>
        </div>

        <div class="grid grid-cols-1 md:grid-cols-2 gap-8">
          ${articles.map(article => `
            <article class="border border-[#E5E5E5] p-6 hover:border-[#111111] transition-all bg-[#FAF7F2] flex flex-col justify-between">
              <div>
                <div class="flex items-center justify-between text-xs font-mono text-[#777777] mb-3">
                  <span>${article.author}</span>
                  <time datetime="${article.publishedAt}">${new Date(article.publishedAt).toLocaleDateString('vi-VN')}</time>
                </div>
                <h3 class="font-serif text-2xl text-[#111111] font-medium leading-snug mb-3 hover:text-[#E30613] transition-colors">
                  <a href="#article-${article.slug}">${article.title}</a>
                </h3>
                <p class="font-sans text-sm text-[#555555] leading-relaxed mb-6">
                  ${article.excerpt}
                </p>
              </div>

              <div class="pt-4 border-t border-[#EAE6DF] flex items-center justify-between">
                <span class="font-mono text-xs text-[#888888]">Liên kết: ${article.relatedBookIds.length} chuyên khảo</span>
                <a href="#article-${article.slug}" class="font-mono text-xs text-[#111111] font-medium hover:text-[#E30613] inline-flex items-center gap-1">
                  Đọc toàn văn <span class="font-sans">→</span>
                </a>
              </div>
            </article>
          `).join('')}
        </div>
      </div>
    </section>
  `;
}
