import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import { catalogService } from '../src/services/catalogService.ts';
import { orderService } from '../src/services/orderService.ts';
import { collectorBag } from '../src/components/checkout/CollectorBag.ts';
import { generateOrderId, isValidOrderId } from '../src/utils/idGenerator.ts';
import { renderMessengerExportModal } from '../src/components/checkout/MessengerExportModal.ts';

describe('Phase 4: Collector Request Flow & Messenger Export (Zero Auto-Reservation)', () => {

  test('TC-4.1: generateOrderId produces valid OLS-XXXXXX identifiers', () => {
    const id1 = generateOrderId();
    const id2 = generateOrderId();

    assert.ok(isValidOrderId(id1), `id1 ${id1} must be valid format`);
    assert.ok(isValidOrderId(id2), `id2 ${id2} must be valid format`);
    assert.notEqual(id1, id2, 'Generated IDs should be unique');
  });

  test('TC-4.2: CollectorBag manages items, quantities, and subtotal calculation', async () => {
    collectorBag.clear();
    assert.equal(collectorBag.getItemCount(), 0);

    const book1 = await catalogService.getBookById('ols-book-01');
    const book2 = await catalogService.getBookById('ols-book-02');
    assert.ok(book1 && book2);

    collectorBag.addItem(book1, 1);
    collectorBag.addItem(book2, 2);

    assert.equal(collectorBag.getItemCount(), 3);
    const expectedSubtotal = (1250000 * 1) + (1450000 * 2);
    assert.equal(collectorBag.getSubtotalVND(), expectedSubtotal);

    // Update quantity
    collectorBag.updateQuantity(book1.id, 2);
    assert.equal(collectorBag.getItemCount(), 4);

    // Remove item
    collectorBag.removeItem(book2.id);
    assert.equal(collectorBag.getItemCount(), 2);
    assert.equal(collectorBag.getSubtotalVND(), 1250000 * 2);

    collectorBag.clear();
  });

  test('TC-4.3: Invariant BD-04 — Submitting request creates order with ZERO inventory reduction', async () => {
    await catalogService.initialize();
    const book = await catalogService.getBookById('ols-book-01');
    assert.ok(book);
    const initialStock = book.stockCount;

    // Create collector request
    const customer = {
      fullName: 'KTS. Nguyen Van An',
      phone: '0901234567',
      address: '45 Vo Van Tan, Q.3, TP.HCM',
      notes: 'Giao giờ hành chính'
    };
    const items = [
      {
        bookId: book.id,
        bookTitle: book.title,
        quantity: 1,
        unitPriceVND: book.priceVND
      }
    ];

    const order = await orderService.createCollectorRequest(customer, items);
    assert.ok(order.id.startsWith('OLS-'));
    assert.equal(order.status, 'PENDING_CONTACT');
    assert.equal(order.requestSource, 'website');

    // INVARIANT CHECK: Book stock MUST remain unchanged!
    const bookAfter = await catalogService.getBookById('ols-book-01');
    assert.ok(bookAfter);
    assert.equal(bookAfter.stockCount, initialStock, 'Inventory must NOT be reduced on customer request submission (BD-04)');
  });

  test('TC-4.4: Messenger Export text contains all required fields', async () => {
    const book = await catalogService.getBookById('ols-book-01');
    assert.ok(book);

    const order = await orderService.createCollectorRequest(
      {
        fullName: 'Tran Thi Binh',
        phone: '0987654321',
        address: '12 Nguyen Hue, Q.1, TP.HCM'
      },
      [
        {
          bookId: book.id,
          bookTitle: book.title,
          quantity: 2,
          unitPriceVND: book.priceVND
        }
      ]
    );

    const exportText = orderService.formatMessengerExport(order);
    assert.ok(exportText.includes(order.id));
    assert.ok(exportText.includes('Tran Thi Binh'));
    assert.ok(exportText.includes('0987654321'));
    assert.ok(exportText.includes(book.title));
    assert.ok(exportText.includes('2.500.000 VNĐ'));
    assert.ok(exportText.includes('kiểm tra tình trạng sách thực tế và gửi ảnh'));
  });

  test('TC-4.5: renderMessengerExportModal renders order id and clipboard element', async () => {
    const orders = await orderService.getAllOrders();
    assert.ok(orders.length >= 1);
    const modalHtml = renderMessengerExportModal(orders[0]);

    assert.ok(modalHtml.includes('id="messenger-export-modal"'));
    assert.ok(modalHtml.includes(orders[0].id));
    assert.ok(modalHtml.includes('Sao chép tin nhắn Messenger'));
    assert.ok(modalHtml.includes('id="messenger-clipboard-text"'));
  });

});
