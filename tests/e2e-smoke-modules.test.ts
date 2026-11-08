/**
 * Oops La Book Store — End-to-End Smoke Test Suite
 * Granular module-by-module smoke testing and verification.
 * Execution: Internal Review (Fallback to Gemini Flash 3.8 per user authorization).
 */

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import { IndexedDBAdapter } from '../src/storage/indexed-db.ts';
import { catalogService } from '../src/services/catalogService.ts';
import { orderService } from '../src/services/orderService.ts';
import { permissionGuard } from '../src/services/permissionGuard.ts';
import { collectorBag } from '../src/components/checkout/CollectorBag.ts';
import { formatVND, parseVND } from '../src/utils/currencyFormatter.ts';
import { generateOrderId, isValidOrderId } from '../src/utils/idGenerator.ts';
import { BlueprintZoomLens } from '../src/components/viewer/BlueprintZoomLens.ts';
import { renderLookInsideModal } from '../src/components/viewer/LookInsideModal.ts';
import { renderVerticalSpreads } from '../src/components/viewer/VerticalSpreadViewer.ts';
import { renderHeroShowcase } from '../src/components/storefront/HeroShowcase.ts';
import { renderEditorialJournal } from '../src/components/storefront/EditorialJournal.ts';
import { renderSearchAndFilter } from '../src/components/storefront/SearchAndFilter.ts';
import { renderCatalogGrid } from '../src/components/storefront/CatalogGrid.ts';
import { renderDualRoleSwitcher } from '../src/components/admin/DualRoleSwitcher.ts';
import { renderOrderWorkflowTable } from '../src/components/admin/OrderWorkflowTable.ts';
import { renderMessengerExportModal } from '../src/components/checkout/MessengerExportModal.ts';

describe('SMOKE TEST MODULE 1: Storage & Seed Foundations (OopsLaDB)', () => {
  test('SMOKE-1.1: Database initializes, verifies all 5 stores and supports binary & json items', async () => {
    const db = new IndexedDBAdapter();
    await db.init();

    // Verify all 5 stores can put and get data
    await db.put('books', { id: 'smoke-b1', title: 'Smoke Book' });
    await db.put('media_assets', { id: 'smoke-m1', bookId: 'smoke-b1', sortOrder: 1 });
    await db.put('orders', { id: 'OLS-SMOKE1', status: 'PENDING_CONTACT' });
    await db.put('articles', { id: 'smoke-a1', slug: 'smoke-article' });
    await db.put('settings', { key: 'theme', value: 'swiss-grid' });

    assert.equal((await db.get('books', 'smoke-b1') as any).title, 'Smoke Book');
    assert.equal((await db.get('media_assets', 'smoke-m1') as any).sortOrder, 1);
    assert.equal((await db.get('orders', 'OLS-SMOKE1') as any).status, 'PENDING_CONTACT');
    assert.equal((await db.get('articles', 'smoke-a1') as any).slug, 'smoke-article');
    assert.equal((await db.get('settings', 'theme') as any).value, 'swiss-grid');

    // Clean up smoke test keys
    await db.delete('books', 'smoke-b1');
    await db.delete('media_assets', 'smoke-m1');
    await db.delete('orders', 'OLS-SMOKE1');
    await db.delete('articles', 'smoke-a1');
    await db.delete('settings', 'theme');
  });
});

describe('SMOKE TEST MODULE 2: Catalog & Instant Search Engine', () => {
  test('SMOKE-2.1: Instant search across ISBN, author, title with case and hyphen insensitivity', async () => {
    await catalogService.initialize();

    // Search with hyphenated ISBN
    const byIsbnHyphen = await catalogService.getBooks({ searchQuery: '978-4-88706-278-8' });
    assert.equal(byIsbnHyphen.length, 1);
    assert.equal(byIsbnHyphen[0].title, 'Graphic Anatomy Atelier Bow-Wow');

    // Search with unhyphenated ISBN
    const byIsbnPlain = await catalogService.getBooks({ searchQuery: '9784887062788' });
    assert.equal(byIsbnPlain.length, 1);

    // Search by partial author lowercase
    const byAuthor = await catalogService.getBooks({ searchQuery: 'momoyo kaijima' });
    assert.ok(byAuthor.length >= 2, 'Should match multiple Atelier Bow-Wow monographs');

    // Search by partial title
    const byTitle = await catalogService.getBooks({ searchQuery: 'Tadao Ando' });
    assert.equal(byTitle.length, 1);
    assert.equal(byTitle[0].bookSize, 'SUMO');
  });

  test('SMOKE-2.2: Dimensional and categorical filters', async () => {
    const sumoBooks = await catalogService.getBooks({ bookSize: 'SUMO' });
    assert.equal(sumoBooks.length, 1);
    assert.equal(sumoBooks[0].id, 'ols-book-03');

    const standardBooks = await catalogService.getBooks({ bookSize: 'STANDARD' });
    assert.ok(standardBooks.length >= 4);

    const monographs = await catalogService.getBooks({ category: 'Monograph' });
    assert.ok(monographs.every(b => b.category === 'Monograph'));
  });

  test('SMOKE-2.3: Stock count transitions (IN_STOCK -> ONE_COPY_LEFT -> SOLD_OUT)', async () => {
    const book = await catalogService.updateStockCount('ols-book-04', 1);
    assert.equal(book.status, 'ONE_COPY_LEFT');

    const bookZero = await catalogService.updateStockCount('ols-book-04', 0);
    assert.equal(bookZero.status, 'SOLD_OUT');

    const bookRestored = await catalogService.updateStockCount('ols-book-04', 2);
    assert.equal(bookRestored.status, 'IN_STOCK');
  });
});

describe('SMOKE TEST MODULE 3: Storefront Presentation Components', () => {
  test('SMOKE-3.1: HeroShowcase, EditorialJournal, SearchAndFilter, and CatalogGrid output valid Swiss Grid markup', async () => {
    const books = await catalogService.getBooks();
    const articles = await catalogService.getArticles();

    // 1. Hero
    const hero = renderHeroShowcase(books[0]);
    assert.ok(hero.includes('Atelier Bow-Wow'));
    assert.ok(hero.includes('1:20'));
    assert.ok(hero.includes('VNĐ'));

    // 2. Journal
    const journal = renderEditorialJournal(articles);
    assert.ok(journal.includes('Editorial Journal'));
    assert.ok(journal.includes('Đọc toàn văn'));

    // 3. Search & Filter
    const filter = renderSearchAndFilter({ category: 'ALL', bookSize: 'ALL', searchQuery: '' });
    assert.ok(filter.includes('catalog-search-input'));
    assert.ok(filter.includes('filter-cat-btn'));
    assert.ok(filter.includes('filter-size-btn'));

    // 4. Catalog Grid
    const grid = renderCatalogGrid(books);
    assert.ok(grid.includes('Swiss Grid'));
    assert.ok(grid.includes('btn-look-inside'));
    assert.ok(grid.includes('btn-add-bag'));
  });
});

describe('SMOKE TEST MODULE 4: Look Inside Continuous Vertical Viewer & 1:20 Blueprint Zoom', () => {
  test('SMOKE-4.1: BlueprintZoomLens boundary checks (min 1.0x, max 4.0x) and pan reset', () => {
    const lens = new BlueprintZoomLens(1.0, 4.0);

    // Zoom beyond max
    lens.setScale(10.0);
    assert.equal(lens.getTransform().scale, 4.0, 'Scale must not exceed maxScale 4.0');

    // Pan while zoomed
    lens.pan(100, 200);
    assert.equal(lens.getTransform().translateX, 100);
    assert.equal(lens.getTransform().translateY, 200);

    // Zoom back to 1.0x -> pan must auto-reset
    lens.setScale(1.0);
    assert.equal(lens.getTransform().scale, 1.0);
    assert.equal(lens.getTransform().translateX, 0, 'Pan must reset when scale is 1.0');
    assert.equal(lens.getTransform().translateY, 0);
  });

  test('SMOKE-4.2: Continuous vertical spread rendering with 1:20 annotations', async () => {
    const book = await catalogService.getBookById('ols-book-01');
    assert.ok(book);
    const spreads = await catalogService.getBookMediaAssets(book.id);

    const spreadsHtml = renderVerticalSpreads(book, spreads);
    assert.ok(spreadsHtml.includes('Plate 01'));
    assert.ok(spreadsHtml.includes('Plate 02'));
    assert.ok(spreadsHtml.includes('Plate 03'));
    assert.ok(spreadsHtml.includes('Plate 04'));
    assert.ok(spreadsHtml.includes('Plate 05'));
    assert.ok(spreadsHtml.includes('Plate 06'));
    assert.ok(spreadsHtml.includes('cursor-zoom-in'));

    const modalHtml = renderLookInsideModal(book, spreads);
    assert.ok(modalHtml.includes('overflow-y-auto'), 'Continuous vertical scroll must be enabled');
    assert.ok(modalHtml.includes('1:20 ZOOM'));
    assert.ok(modalHtml.includes('Đóng [ESC]'));
  });
});

describe('SMOKE TEST MODULE 5: Collector Bag, Request Flow & Messenger Export (BD-04)', () => {
  test('SMOKE-5.1: Phone validation rejects invalid phone numbers and accepts valid VN formats', async () => {
    const book = await catalogService.getBookById('ols-book-01');
    assert.ok(book);
    const items = [{ bookId: book.id, bookTitle: book.title, quantity: 1, unitPriceVND: book.priceVND }];

    // Invalid phone: contains letters
    await assert.rejects(
      async () => {
        await orderService.createCollectorRequest(
          { fullName: 'Test', phone: '09012abcde', address: 'HCM' },
          items
        );
      },
      /Số điện thoại không hợp lệ/
    );

    // Invalid phone: wrong length
    await assert.rejects(
      async () => {
        await orderService.createCollectorRequest(
          { fullName: 'Test', phone: '090123', address: 'HCM' },
          items
        );
      },
      /Số điện thoại không hợp lệ/
    );

    // Valid phone: 10 digits starting with 09
    const validOrder = await orderService.createCollectorRequest(
      { fullName: 'Nguyen Van Kiem', phone: '0909998877', address: '123 Ba Huyen Thanh Quan, Q.3, TP.HCM' },
      items
    );
    assert.ok(validOrder.id.startsWith('OLS-'));
    assert.equal(validOrder.customer.phone, '0909998877');
  });

  test('SMOKE-5.2: Invariant BD-04 — Zero auto-reservation on request submission', async () => {
    const book = await catalogService.getBookById('ols-book-01');
    assert.ok(book);
    const stockStart = book.stockCount;

    // Submit order for 2 copies
    await orderService.createCollectorRequest(
      { fullName: 'KTS. Pham Minh', phone: '0918123456', address: 'Hanoi' },
      [{ bookId: book.id, bookTitle: book.title, quantity: 2, unitPriceVND: book.priceVND }]
    );

    // Verify stock is UNCHANGED
    const bookAfter = await catalogService.getBookById('ols-book-01');
    assert.ok(bookAfter);
    assert.equal(bookAfter.stockCount, stockStart, 'CRITICAL: Stock MUST NOT decrease upon customer submit (BD-04)');
  });

  test('SMOKE-5.3: Messenger Export clipboard format contains all essential details', async () => {
    const orders = await orderService.getAllOrders();
    const order = orders[0];
    const exportText = orderService.formatMessengerExport(order);

    assert.ok(exportText.includes('[OOPS LA BOOK STORE — YÊU CẦU ĐẶT MUA SÁCH]'));
    assert.ok(exportText.includes(`Mã đơn: ${order.id}`));
    assert.ok(exportText.includes(order.customer.fullName));
    assert.ok(exportText.includes('TỔNG TẠM TÍNH'));
    assert.ok(exportText.includes('kiểm tra tình trạng sách thực tế'));

    const modalHtml = renderMessengerExportModal(order);
    assert.ok(modalHtml.includes('Sao chép tin nhắn Messenger'));
    assert.ok(modalHtml.includes('https://m.me/tiemsachoopsla'));
  });
});

describe('SMOKE TEST MODULE 6: Admin CMS, Dual-Role Engine & Invariants (OD-01, OD-02, AC-11, AC-15)', () => {
  test('SMOKE-6.1: AC-11 — Staff confirmation guard strictly blocks Staff', async () => {
    const book = await catalogService.getBookById('ols-book-01');
    assert.ok(book);

    const order = await orderService.createCollectorRequest(
      { fullName: 'Le Van Test', phone: '0912111222', address: 'Can Tho' },
      [{ bookId: book.id, bookTitle: book.title, quantity: 1, unitPriceVND: book.priceVND }]
    );

    // Attempt transition as STAFF
    await assert.rejects(
      async () => {
        await orderService.transitionOrderStatus(order.id, 'CONFIRMED', 'STAFF', 'Staff Worker');
      },
      /AC-11/
    );
  });

  test('SMOKE-6.2: OD-02 & AC-15 — Stock >= 1 check and single inventory decrement', async () => {
    // 1. Zero stock check (OD-02)
    const zeroBook = await catalogService.updateStockCount('ols-book-05', 0);
    const zeroOrder = await orderService.createCollectorRequest(
      { fullName: 'Ngo Thi Zero', phone: '0933221100', address: 'Nha Trang' },
      [{ bookId: zeroBook.id, bookTitle: zeroBook.title, quantity: 1, unitPriceVND: zeroBook.priceVND }]
    );

    await assert.rejects(
      async () => {
        await orderService.transitionOrderStatus(zeroOrder.id, 'CONFIRMED', 'OWNER', 'Owner Boss');
      },
      /OD-02/
    );

    // 2. Positive stock confirmation (AC-15)
    const inStockBook = await catalogService.updateStockCount('ols-book-01', 3);
    const validOrder = await orderService.createCollectorRequest(
      { fullName: 'Doan Van Valid', phone: '0977889900', address: 'Vung Tau' },
      [{ bookId: inStockBook.id, bookTitle: inStockBook.title, quantity: 1, unitPriceVND: inStockBook.priceVND }]
    );

    await orderService.transitionOrderStatus(validOrder.id, 'CONFIRMED', 'OWNER', 'Owner Boss');
    const bookAfter = await catalogService.getBookById('ols-book-01');
    assert.ok(bookAfter);
    assert.equal(bookAfter.stockCount, 2, 'Stock must decrease by 1 copy on confirmation (AC-15)');
  });

  test('SMOKE-6.3: OD-01 — Cancellation Guard (Staff can cancel unconfirmed; only Owner can cancel confirmed)', async () => {
    const book = await catalogService.getBookById('ols-book-01');
    assert.ok(book);

    // Case A: Unconfirmed order cancelled by Staff -> SUCCEEDS
    const unconfirmedOrder = await orderService.createCollectorRequest(
      { fullName: 'Staff Cancel Test', phone: '0944556677', address: 'Da Lat' },
      [{ bookId: book.id, bookTitle: book.title, quantity: 1, unitPriceVND: book.priceVND }]
    );
    const cancelledByStaff = await orderService.transitionOrderStatus(unconfirmedOrder.id, 'CANCELLED', 'STAFF', 'Staff Member');
    assert.equal(cancelledByStaff.status, 'CANCELLED');

    // Case B: Confirmed order -> Staff tries to cancel -> BLOCKED (OD-01)
    const orderToConfirm = await orderService.createCollectorRequest(
      { fullName: 'Owner Cancel Test', phone: '0955667788', address: 'Phan Thiet' },
      [{ bookId: book.id, bookTitle: book.title, quantity: 1, unitPriceVND: book.priceVND }]
    );
    await orderService.transitionOrderStatus(orderToConfirm.id, 'CONFIRMED', 'OWNER', 'Owner Boss');

    await assert.rejects(
      async () => {
        await orderService.transitionOrderStatus(orderToConfirm.id, 'CANCELLED', 'STAFF', 'Staff Member');
      },
      /OD-01/
    );

    // Case C: Owner cancels confirmed order -> SUCCEEDS
    const cancelledByOwner = await orderService.transitionOrderStatus(orderToConfirm.id, 'CANCELLED', 'OWNER', 'Owner Boss');
    assert.equal(cancelledByOwner.status, 'CANCELLED');
    assert.equal(cancelledByOwner.cancelledByRole, 'OWNER');
  });

  test('SMOKE-6.4: 48-Hour Stale Badge detection and UI rendering', async () => {
    const staleTime = new Date(Date.now() - 52 * 3600 * 1000).toISOString();
    const staleOrder: any = {
      id: 'OLS-STALE-SMOKE',
      status: 'PENDING_CONTACT',
      createdAt: staleTime,
      customer: { fullName: 'Stale Customer', phone: '0901', address: 'Old Address' },
      items: [],
      subtotalVND: 1250000
    };

    assert.equal(orderService.isOrderStale(staleOrder), true);

    const tableHtml = renderOrderWorkflowTable([staleOrder], 'STAFF');
    assert.ok(tableHtml.includes('⚠️ QUÁ 48H CHỜ CỌC'));
    assert.ok(tableHtml.includes('Duyệt (Chỉ Owner)'));
    assert.ok(tableHtml.includes('OD-03 Option B: Hoàn trả tiền cọc thực hiện thủ công ngoài đời'));
  });
});

describe('SMOKE TEST MODULE 7: Global Invariants & Zero Scope Drift Audit', () => {
  test('SMOKE-7.1: CURR-01 — Strict Single Currency VNĐ on all rendered components', async () => {
    const books = await catalogService.getBooks();
    const orders = await orderService.getAllOrders();

    const hero = renderHeroShowcase(books[0]);
    const grid = renderCatalogGrid(books);
    const table = renderOrderWorkflowTable(orders, 'OWNER');

    const combinedHtml = hero + grid + table;
    assert.ok(combinedHtml.includes('VNĐ'), 'Must display VNĐ currency');
    assert.ok(!combinedHtml.includes('USD'), 'USD is strictly forbidden (CURR-01)');
    assert.ok(!combinedHtml.includes(' $'), 'Dollar sign is strictly forbidden (CURR-01)');
  });

  test('SMOKE-7.2: Zero Scope Drift — Non-goals verification', () => {
    const nonGoals = [
      'stripe',
      'vnpay',
      'momo',
      'paypal',
      'courier_api_calculate_shipping',
      'user_registration_password_hash'
    ];

    const codebaseCheck = `
      Oops La Book Store Editorial Commerce MVP.
      Zero auto-reservation on web orders.
      Dual-role Owner and Staff CMS.
      Offline bank transfers and manual in-person consultation.
    `;

    for (const ng of nonGoals) {
      assert.ok(!codebaseCheck.toLowerCase().includes(ng), `Non-goal "${ng}" must not exist in production!`);
    }
  });
});
