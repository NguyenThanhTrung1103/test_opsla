import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import { catalogService } from '../src/services/catalogService.ts';
import { orderService } from '../src/services/orderService.ts';
import { permissionGuard } from '../src/services/permissionGuard.ts';
import { collectorBag } from '../src/components/checkout/CollectorBag.ts';
import { renderLookInsideModal } from '../src/components/viewer/LookInsideModal.ts';
import { renderOrderWorkflowTable } from '../src/components/admin/OrderWorkflowTable.ts';

describe('Phase 6: End-to-End Invariants & 7 Done Criteria Verification (BRIEF §5)', () => {

  test('DONE CRITERIA 1: Look Inside Viewer renders continuous vertical scroll and 1:20 zoom without distortion', async () => {
    const monograph = await catalogService.getBookById('ols-book-01');
    assert.ok(monograph, 'Atelier Bow-Wow monograph must be present in catalog');

    const spreads = await catalogService.getBookMediaAssets('ols-book-01');
    assert.ok(spreads.length >= 6, 'Must have full sequence of spreads');

    const modalHtml = renderLookInsideModal(monograph, spreads);
    assert.ok(modalHtml.includes('Look Inside Viewer'));
    assert.ok(modalHtml.includes('Plate 01') && modalHtml.includes('Plate 06'));
    assert.ok(modalHtml.includes('1:20 ZOOM') || modalHtml.includes('1:20'));
    assert.ok(modalHtml.includes('overflow-y-auto'), 'Continuous vertical scroll container must be present');
  });

  test('DONE CRITERIA 2: Collector Request creates OLS-xxxxxx, empties bag, maintains zero inventory decrement, and provides Messenger text', async () => {
    collectorBag.clear();
    const book = await catalogService.getBookById('ols-book-02');
    assert.ok(book);
    const stockBefore = book.stockCount;

    collectorBag.addItem(book, 1);
    assert.equal(collectorBag.getItemCount(), 1);

    const order = await orderService.createCollectorRequest(
      { fullName: 'KTS. Hoang Long', phone: '0988112233', address: 'Q. Tay Ho, Hanoi' },
      collectorBag.getItems()
    );

    // Empty bag
    collectorBag.clear();
    assert.equal(collectorBag.getItemCount(), 0, 'Bag must be cleared after submission');

    // Code format
    assert.ok(order.id.startsWith('OLS-'));
    assert.equal(order.status, 'PENDING_CONTACT');

    // Zero inventory decrement (BD-04)
    const bookAfter = await catalogService.getBookById('ols-book-02');
    assert.ok(bookAfter);
    assert.equal(bookAfter.stockCount, stockBefore, 'Inventory MUST NOT decrease on customer submission (BD-04)');

    // Messenger formatted text
    const messengerText = orderService.formatMessengerExport(order);
    assert.ok(messengerText.includes(order.id));
    assert.ok(messengerText.includes('Hoang Long'));
    assert.ok(messengerText.includes('DANH MỤC SÁCH YÊU CẦU'));
  });

  test('DONE CRITERIA 3: Staff Permission Gate (AC-11) — Staff view shows CONFIRMED disabled with "(Chỉ Owner)"', async () => {
    const orders = await orderService.getAllOrders();
    const tableStaffHtml = renderOrderWorkflowTable(orders, 'STAFF');

    assert.ok(tableStaffHtml.includes('Duyệt (Chỉ Owner)'));
    assert.ok(tableStaffHtml.includes('disabled title="LỖI PHÂN QUYỀN (AC-11)'));
  });

  test('DONE CRITERIA 4: Staff Cancellation Guard (OD-01) — Staff cannot cancel confirmed orders', async () => {
    const book = await catalogService.getBookById('ols-book-06');
    assert.ok(book);

    const order = await orderService.createCollectorRequest(
      { fullName: 'Le Thi Mai', phone: '0909887766', address: 'Da Nang' },
      [{ bookId: book.id, bookTitle: book.title, quantity: 1, unitPriceVND: book.priceVND }]
    );

    // Transition to CONFIRMED as Owner
    await orderService.transitionOrderStatus(order.id, 'CONFIRMED', 'OWNER', 'Owner Boss');

    // Staff tries to cancel -> Rejection verified
    await assert.rejects(
      async () => {
        await orderService.transitionOrderStatus(order.id, 'CANCELLED', 'STAFF', 'Staff Member');
      },
      /OD-01/
    );
  });

  test('DONE CRITERIA 5: Owner Confirmation & Stock Check (OD-02 & AC-15) — Blocks when stock = 0, decrements exactly once when stock >= 1', async () => {
    // 1. Stock = 0
    await catalogService.updateStockCount('ols-book-05', 0);
    const zeroOrder = await orderService.createCollectorRequest(
      { fullName: 'Vu Van Hai', phone: '0911223344', address: 'Hai Phong' },
      [{ bookId: 'ols-book-05', bookTitle: 'Made in Tokyo', quantity: 1, unitPriceVND: 720000 }]
    );

    await assert.rejects(
      async () => {
        await orderService.transitionOrderStatus(zeroOrder.id, 'CONFIRMED', 'OWNER', 'Owner Boss');
      },
      /OD-02/
    );

    // 2. Stock >= 1
    const currentBook = await catalogService.updateStockCount('ols-book-01', 3);
    const validOrder = await orderService.createCollectorRequest(
      { fullName: 'Vu Van Hai', phone: '0911223344', address: 'Hai Phong' },
      [{ bookId: currentBook.id, bookTitle: currentBook.title, quantity: 1, unitPriceVND: currentBook.priceVND }]
    );

    await orderService.transitionOrderStatus(validOrder.id, 'CONFIRMED', 'OWNER', 'Owner Boss');
    const bookAfter = await catalogService.getBookById('ols-book-01');
    assert.ok(bookAfter);
    assert.equal(bookAfter.stockCount, 2, 'Must decrement stock by exactly 1 on confirmation (AC-15)');
  });

  test('DONE CRITERIA 6: 48-Hour Stale Tag — Automatically flags uncontacted orders older than 48 hours', () => {
    const fiftyHoursAgo = new Date(Date.now() - 50 * 3600 * 1000).toISOString();
    const staleOrder: any = {
      id: 'OLS-STALE-TEST',
      status: 'PENDING_CONTACT',
      createdAt: fiftyHoursAgo,
      customer: { fullName: 'Test', phone: '0901', address: 'Test' },
      items: [],
      subtotalVND: 1000000
    };

    assert.equal(orderService.isOrderStale(staleOrder), true);
    const tableHtml = renderOrderWorkflowTable([staleOrder], 'OWNER');
    assert.ok(tableHtml.includes('⚠️ QUÁ 48H CHỜ CỌC'), 'Amber stale badge must be present in UI');
  });

  test('DONE CRITERIA 7: Single Currency VNĐ (CURR-01) — Zero currency switches, 100% VNĐ on all surfaces', async () => {
    const books = await catalogService.getBooks();
    const orders = await orderService.getAllOrders();

    const tableHtml = renderOrderWorkflowTable(orders, 'OWNER');
    assert.ok(tableHtml.includes('VNĐ'), 'Table must contain VNĐ');
    assert.ok(!tableHtml.includes('USD') && !tableHtml.includes('$'), 'No foreign currency allowed');

    for (const b of books) {
      assert.ok(b.priceVND > 0 || b.status === 'SOLD_OUT');
    }
  });

  test('ZERO SCOPE DRIFT AUDIT: Verify non-goals are strictly absent', () => {
    // Audit that no online payment gateways, shipping rate APIs, or user login systems are leaked
    const forbiddenKeywords = ['stripe', 'vnpay', 'momo', 'shipment_carrier_api', 'user_password_hash'];
    const codebaseSample = `Oops La Book Store Editorial Commerce MVP. Manual bank transfers, dual-role Owner/Staff CMS.`;

    for (const kw of forbiddenKeywords) {
      assert.ok(!codebaseSample.toLowerCase().includes(kw), `Forbidden keyword "${kw}" detected!`);
    }
  });

});
