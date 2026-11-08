import { test, describe, beforeEach } from 'node:test';
import assert from 'node:assert/strict';

import { IndexedDBAdapter } from '../src/storage/indexed-db.ts';
import { CatalogService } from '../src/services/catalogService.ts';
import { formatVND, parseVND } from '../src/utils/currencyFormatter.ts';
import { SEED_BOOKS, SEED_MEDIA_ASSETS } from '../src/data/seed-data.ts';

describe('Phase 1: Core Architecture, Data Model & Storage Foundations', () => {

  test('TC-1.1: Storage Adapter initializes and performs CRUD operations', async () => {
    const adapter = new IndexedDBAdapter();
    await adapter.init();

    // Verify empty initially in fallback
    const initialBooks = await adapter.getAll('books');
    assert.equal(initialBooks.length, 0, 'Should start with empty books in clean instance');

    // Insert test book
    await adapter.put('books', {
      id: 'test-monograph-1',
      title: 'Bow-Wow Anatomy Test',
      author: 'Tsukamoto',
      priceVND: 1200000,
      stockCount: 2,
      category: 'Monograph'
    });

    const retrieved = await adapter.get('books', 'test-monograph-1');
    assert.ok(retrieved, 'Should retrieve inserted book');
    assert.equal((retrieved as any).title, 'Bow-Wow Anatomy Test');

    // Update
    await adapter.put('books', {
      id: 'test-monograph-1',
      title: 'Bow-Wow Anatomy Test (Updated)',
      author: 'Tsukamoto',
      priceVND: 1200000,
      stockCount: 1,
      category: 'Monograph'
    });
    const updated = await adapter.get('books', 'test-monograph-1');
    assert.equal((updated as any).title, 'Bow-Wow Anatomy Test (Updated)');
    assert.equal((updated as any).stockCount, 1);

    // Delete
    await adapter.delete('books', 'test-monograph-1');
    const deleted = await adapter.get('books', 'test-monograph-1');
    assert.equal(deleted, null, 'Deleted item should return null');
  });

  test('TC-1.2: CatalogService auto-seeds architectural monographs and spreads', async () => {
    const service = new CatalogService();
    await service.initialize();

    const books = await service.getBooks();
    assert.ok(books.length >= 6, `Expected at least 6 seed books, got ${books.length}`);

    // Verify Atelier Bow-Wow primary monograph exists
    const bowWow = await service.getBookById('ols-book-01');
    assert.ok(bowWow, 'Atelier Bow-Wow Graphic Anatomy monograph must exist');
    assert.equal(bowWow.isbn, '978-4-88706-278-8');
    assert.equal(bowWow.bookSize, 'STANDARD');
    assert.equal(bowWow.priceVND, 1250000);
    assert.equal(bowWow.featured, true);

    // Verify TASCHEN SUMO edition exists
    const sumo = await service.getBookById('ols-book-03');
    assert.ok(sumo, 'Tadao Ando SUMO edition must exist');
    assert.equal(sumo.bookSize, 'SUMO');
    assert.equal(sumo.priceVND, 38000000);
  });

  test('TC-1.3: Instant search by ISBN, author, and title', async () => {
    const service = new CatalogService();
    await service.initialize();

    // Search by ISBN with hyphens
    const isbnResult = await service.getBooks({ searchQuery: '978-4-88706-278-8' });
    assert.equal(isbnResult.length, 1);
    assert.equal(isbnResult[0].id, 'ols-book-01');

    // Search by ISBN without hyphens
    const isbnClean = await service.getBooks({ searchQuery: '9784887062788' });
    assert.equal(isbnClean.length, 1);
    assert.equal(isbnClean[0].id, 'ols-book-01');

    // Search by Author
    const authorResult = await service.getBooks({ searchQuery: 'Tadao Ando' });
    assert.ok(authorResult.length >= 1);
    assert.equal(authorResult[0].id, 'ols-book-03');

    // Search by Title keyword
    const titleResult = await service.getBooks({ searchQuery: 'Pet Architecture' });
    assert.equal(titleResult.length, 1);
    assert.equal(titleResult[0].id, 'ols-book-04');
  });

  test('TC-1.4: Filtering by category and book size (SUMO vs STANDARD)', async () => {
    const service = new CatalogService();
    await service.initialize();

    const sumoBooks = await service.getBooks({ bookSize: 'SUMO' });
    assert.ok(sumoBooks.length >= 1);
    assert.ok(sumoBooks.every(b => b.bookSize === 'SUMO'));

    const monographs = await service.getBooks({ category: 'Monograph' });
    assert.ok(monographs.length >= 1);
    assert.ok(monographs.every(b => b.category === 'Monograph'));
  });

  test('TC-1.5: Stock count transitions and invariants (IN_STOCK -> ONE_COPY_LEFT -> SOLD_OUT)', async () => {
    const service = new CatalogService();
    await service.initialize();

    // Update stock to 1
    const oneLeft = await service.updateStockCount('ols-book-01', 1);
    assert.equal(oneLeft.stockCount, 1);
    assert.equal(oneLeft.status, 'ONE_COPY_LEFT');

    // Update stock to 0
    const soldOut = await service.updateStockCount('ols-book-01', 0);
    assert.equal(soldOut.stockCount, 0);
    assert.equal(soldOut.status, 'SOLD_OUT');

    // Update stock back to 3
    const inStock = await service.updateStockCount('ols-book-01', 3);
    assert.equal(inStock.stockCount, 3);
    assert.equal(inStock.status, 'IN_STOCK');
  });

  test('TC-1.6: Invariant CURR-01 — Strict VNĐ Currency Formatter', () => {
    assert.equal(formatVND(1250000), '1.250.000 VNĐ');
    assert.equal(formatVND(38000000), '38.000.000 VNĐ');
    assert.equal(formatVND(0), '0 VNĐ');

    assert.equal(parseVND('1.250.000 VNĐ'), 1250000);
    assert.equal(parseVND('38.000.000 VNĐ'), 38000000);
  });

  test('TC-1.7: Media spreads ordering and 1:20 annotations integrity', async () => {
    const service = new CatalogService();
    await service.initialize();

    const spreads = await service.getBookMediaAssets('ols-book-01');
    assert.ok(spreads.length >= 6, 'Should have at least 6 plates for Graphic Anatomy');

    // Verify sort order
    for (let i = 0; i < spreads.length - 1; i++) {
      assert.ok(spreads[i].sortOrder <= spreads[i + 1].sortOrder, 'Spreads must be sorted by sortOrder');
    }

    // Verify 1:20 scale label exists
    const has120Scale = spreads.some(s => s.scaleLabel.includes('1:20'));
    assert.ok(has120Scale, 'Must contain architectural spreads with 1:20 detail annotations');
  });

});
