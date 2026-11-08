import { test, describe, beforeEach } from 'node:test';
import assert from 'node:assert/strict';

import { catalogService } from '../src/services/catalogService.ts';
import { orderService } from '../src/services/orderService.ts';
import { permissionGuard } from '../src/services/permissionGuard.ts';
import { renderDualRoleSwitcher } from '../src/components/admin/DualRoleSwitcher.ts';
import { renderOrderWorkflowTable } from '../src/components/admin/OrderWorkflowTable.ts';

describe('Phase 5: Admin CMS & Dual-Role Permission Engine', () => {

  test('TC-5.1: AC-11 — Only Owner can confirm orders', () => {
    assert.equal(permissionGuard.canConfirmOrder('OWNER'), true);
    assert.equal(permissionGuard.canConfirmOrder('STAFF'), false);
  });

  test('TC-5.2: OD-01 — Cancellation Guard rules for Staff vs Owner', () => {
    // Unconfirmed orders: both can cancel
    assert.equal(permissionGuard.canCancelOrder('PENDING_CONTACT', 'STAFF'), true);
    assert.equal(permissionGuard.canCancelOrder('PENDING_CONTACT', 'OWNER'), true);
    assert.equal(permissionGuard.canCancelOrder('CONTACTED', 'STAFF'), true);
    assert.equal(permissionGuard.canCancelOrder('CONTACTED', 'OWNER'), true);

    // Confirmed orders: ONLY Owner can cancel!
    assert.equal(permissionGuard.canCancelOrder('CONFIRMED', 'STAFF'), false, 'Staff MUST NOT cancel confirmed order');
    assert.equal(permissionGuard.canCancelOrder('CONFIRMED', 'OWNER'), true, 'Owner can cancel confirmed order');
  });

  test('TC-5.3: AC-11 Enforcement — Staff attempting CONFIRMED transition is rejected', async () => {
    const book = await catalogService.getBookById('ols-book-01');
    assert.ok(book);

    const order = await orderService.createCollectorRequest(
      { fullName: 'Le Van C', phone: '0912345678', address: 'Da Nang' },
      [{ bookId: book.id, bookTitle: book.title, quantity: 1, unitPriceVND: book.priceVND }]
    );

    // Staff tries to confirm -> MUST THROW AC-11 ERROR
    await assert.rejects(
      async () => {
        await orderService.transitionOrderStatus(order.id, 'CONFIRMED', 'STAFF', 'Staff Member');
      },
      /AC-11/
    );
  });

  test('TC-5.4: OD-02 & AC-15 — Owner stock verification and single inventory decrement', async () => {
    // 1. Test OD-02 blocking when stock = 0
    const zeroStockBook = await catalogService.updateStockCount('ols-book-05', 0);
    assert.equal(zeroStockBook.stockCount, 0);

    const orderZeroStock = await orderService.createCollectorRequest(
      { fullName: 'Pham Van D', phone: '0933334444', address: 'Hanoi' },
      [{ bookId: zeroStockBook.id, bookTitle: zeroStockBook.title, quantity: 1, unitPriceVND: zeroStockBook.priceVND }]
    );

    // Owner tries to confirm when stock = 0 -> MUST BE BLOCKED BY OD-02
    await assert.rejects(
      async () => {
        await orderService.transitionOrderStatus(orderZeroStock.id, 'CONFIRMED', 'OWNER', 'Owner Boss');
      },
      /OD-02/
    );

    // 2. Test AC-15 positive confirmation when stock >= 1
    const availableBook = await catalogService.updateStockCount('ols-book-06', 4);
    assert.equal(availableBook.stockCount, 4);

    const orderAvailable = await orderService.createCollectorRequest(
      { fullName: 'Hoang Van E', phone: '0977778888', address: 'TP.HCM' },
      [{ bookId: availableBook.id, bookTitle: availableBook.title, quantity: 2, unitPriceVND: availableBook.priceVND }]
    );

    // Owner confirms order -> MUST SUCCEED AND DECREMENT STOCK BY 2 (4 - 2 = 2)
    const confirmedOrder = await orderService.transitionOrderStatus(orderAvailable.id, 'CONFIRMED', 'OWNER', 'Owner Boss');
    assert.equal(confirmedOrder.status, 'CONFIRMED');

    const bookAfter = await catalogService.getBookById('ols-book-06');
    assert.ok(bookAfter);
    assert.equal(bookAfter.stockCount, 2, 'Inventory must be decremented by quantity exactly once (AC-15)');
  });

  test('TC-5.5: OD-01 Enforcement — Staff cannot cancel a confirmed order, Owner can cancel', async () => {
    const book = await catalogService.getBookById('ols-book-06');
    assert.ok(book);

    const order = await orderService.createCollectorRequest(
      { fullName: 'Dang Van F', phone: '0966667777', address: 'Hue' },
      [{ bookId: book.id, bookTitle: book.title, quantity: 1, unitPriceVND: book.priceVND }]
    );

    // Confirm as Owner
    await orderService.transitionOrderStatus(order.id, 'CONFIRMED', 'OWNER', 'Owner Boss');

    // Staff tries to cancel -> MUST BE REJECTED
    await assert.rejects(
      async () => {
        await orderService.transitionOrderStatus(order.id, 'CANCELLED', 'STAFF', 'Staff Member');
      },
      /OD-01/
    );

    // Owner cancels -> SUCCEEDS
    const cancelledOrder = await orderService.transitionOrderStatus(order.id, 'CANCELLED', 'OWNER', 'Owner Boss');
    assert.equal(cancelledOrder.status, 'CANCELLED');
    assert.equal(cancelledOrder.cancelledByRole, 'OWNER');
  });

  test('TC-5.6: 48-Hour Stale Badge detection logic', () => {
    const recentOrder: any = {
      id: 'OLS-RECENT',
      status: 'PENDING_CONTACT',
      createdAt: new Date().toISOString()
    };
    assert.equal(orderService.isOrderStale(recentOrder), false);

    // 50 hours ago
    const fiftyHoursAgo = new Date(Date.now() - 50 * 3600 * 1000).toISOString();
    const staleOrder: any = {
      id: 'OLS-STALE',
      status: 'PENDING_CONTACT',
      createdAt: fiftyHoursAgo
    };
    assert.equal(orderService.isOrderStale(staleOrder), true);

    // Already confirmed order created 50h ago is NOT marked stale
    const confirmedOldOrder: any = {
      id: 'OLS-CONFIRMED-OLD',
      status: 'CONFIRMED',
      createdAt: fiftyHoursAgo
    };
    assert.equal(orderService.isOrderStale(confirmedOldOrder), false);
  });

  test('TC-5.7: UI rendering — DualRoleSwitcher and OrderWorkflowTable reflect AC-11 and OD-01 guards', async () => {
    // 1. DualRoleSwitcher
    const ownerSwitcherHtml = renderDualRoleSwitcher('OWNER');
    assert.ok(ownerSwitcherHtml.includes('Chủ tiệm (Owner)'));
    assert.ok(ownerSwitcherHtml.includes('Toàn quyền'));

    const staffSwitcherHtml = renderDualRoleSwitcher('STAFF');
    assert.ok(staffSwitcherHtml.includes('Nhân viên (Staff)'));
    assert.ok(staffSwitcherHtml.includes('Khóa CONFIRMED (AC-11)'));

    // 2. OrderWorkflowTable for Staff
    const orders = await orderService.getAllOrders();
    const tableStaffHtml = renderOrderWorkflowTable(orders, 'STAFF');
    assert.ok(tableStaffHtml.includes('Duyệt (Chỉ Owner)'), 'Staff view must disable and label CONFIRMED button');
    assert.ok(tableStaffHtml.includes('disabled'), 'Staff view must contain disabled buttons');

    // 3. OrderWorkflowTable for Owner
    const tableOwnerHtml = renderOrderWorkflowTable(orders, 'OWNER');
    assert.ok(tableOwnerHtml.includes('Duyệt đơn ✓'), 'Owner view must offer active confirm button');
  });

});
