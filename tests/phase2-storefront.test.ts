import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import { catalogService } from '../src/services/catalogService.ts';
import { renderHeroShowcase } from '../src/components/storefront/HeroShowcase.ts';
import { renderEditorialJournal } from '../src/components/storefront/EditorialJournal.ts';
import { renderSearchAndFilter } from '../src/components/storefront/SearchAndFilter.ts';
import { renderCatalogGrid } from '../src/components/storefront/CatalogGrid.ts';

describe('Phase 2: Storefront Catalog & Instant Search', () => {

  test('TC-2.1: Hero Showcase renders Atelier Bow-Wow monograph with 1:20 scale & VNĐ price', async () => {
    const featured = await catalogService.getBookById('ols-book-01');
    assert.ok(featured);

    const html = renderHeroShowcase(featured);
    assert.ok(html.includes('Atelier Bow-Wow'), 'Should include Atelier Bow-Wow');
    assert.ok(html.includes('Graphic Anatomy'), 'Should include Graphic Anatomy');
    assert.ok(html.includes('Tỷ lệ 1:20'), 'Should contain 1:20 scale callout');
    assert.ok(html.includes('1.250.000 VNĐ'), 'Should format price in VNĐ');
    assert.ok(!html.includes('USD') && !html.includes('$'), 'Must not contain foreign currencies');
  });

  test('TC-2.2: Editorial Journal renders articles and connects to monographs', async () => {
    const articles = await catalogService.getArticles();
    assert.ok(articles.length >= 2);

    const html = renderEditorialJournal(articles);
    assert.ok(html.includes('Đối thoại & Tiểu luận Kiến trúc'));
    assert.ok(html.includes('Atelier Bow-Wow và Nghệ Thuật Giải Phẫu Không Gian 1:20'));
    assert.ok(html.includes('TASCHEN SUMO Edition'));
  });

  test('TC-2.3: Search & Filter renders all categories and sizes with active states', () => {
    const html = renderSearchAndFilter({
      category: 'Monograph',
      bookSize: 'SUMO',
      searchQuery: 'Bow-Wow'
    });

    assert.ok(html.includes('data-filter-category="Monograph"'));
    assert.ok(html.includes('data-filter-size="SUMO"'));
    assert.ok(html.includes('value="Bow-Wow"'));
  });

  test('TC-2.4: Catalog Grid renders stock badges (IN_STOCK, ONE_COPY_LEFT, SOLD_OUT)', async () => {
    const allBooks = await catalogService.getBooks();
    const html = renderCatalogGrid(allBooks);

    assert.ok(html.includes('CÒN HÀNG'), 'Should render in stock badge');
    assert.ok(html.includes('CHỈ CÒN 1 BẢN'), 'Should render one copy left badge');
    assert.ok(html.includes('TẠM HẾT HÀNG (SOLD OUT)'), 'Should render sold out badge');
    assert.ok(html.includes('disabled'), 'Sold out book button must be disabled');
  });

  test('TC-2.5: Invariant CURR-01 — Strict Single Currency VNĐ across all storefront components', async () => {
    const books = await catalogService.getBooks();
    const articles = await catalogService.getArticles();

    const heroHtml = renderHeroShowcase(books[0]);
    const journalHtml = renderEditorialJournal(articles);
    const gridHtml = renderCatalogGrid(books);

    const fullStorefront = heroHtml + journalHtml + gridHtml;

    // Must have VNĐ
    assert.ok(fullStorefront.includes('VNĐ'), 'Storefront must display VNĐ currency');
    // Must NOT have USD currency switchers or symbols
    assert.ok(!fullStorefront.includes('USD'), 'No USD references allowed in Storefront');
    assert.ok(!fullStorefront.includes(' $'), 'No dollar signs allowed in Storefront');
  });

});
