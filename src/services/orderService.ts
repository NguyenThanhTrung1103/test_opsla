/**
 * Oops La Book Store — Order Service
 * State machine and business logic layer for orders, enforcing:
 * - BD-04: Zero Auto-Reservation (Submission does NOT decrement stock)
 * - AC-11: Only Owner can transition to CONFIRMED
 * - OD-01: Cancellation Guard (Confirmed orders can ONLY be cancelled by Owner)
 * - OD-02: Stock Verification Guard (Stock must be >= 1 to confirm)
 * - AC-15: Single Inventory Decrement on confirmation
 * - 48-Hour Stale Order Detection
 * - Strict Finite State Machine: Terminal CANCELLED, single deduction guarantee
 */

import type { Order, OrderItem, CustomerInfo, OrderStatus, UserRole } from '../types/domain.ts';
import { dbAdapter } from '../storage/indexed-db.ts';
import { catalogService } from './catalogService.ts';
import { generateOrderId } from '../utils/idGenerator.ts';
import { formatVND } from '../utils/currencyFormatter.ts';

class AsyncLock {
  private queue: Promise<void> = Promise.resolve();

  public acquire<T>(fn: () => Promise<T>): Promise<T> {
    const next = this.queue.then(() => fn());
    this.queue = next.then(() => {}, () => {});
    return next;
  }
}

const stateTransitionLock = new AsyncLock();

export class OrderService {
  private initialized = false;

  public async initialize(): Promise<void> {
    if (this.initialized) return;
    await dbAdapter.init();
    this.initialized = true;
  }

  /**
   * Submits a customer request from Storefront
   * Invariant BD-04: Does NOT reduce book stock!
   * Invariant R06: Validates payload and derives unit prices strictly from server catalog.
   */
  public async createCollectorRequest(customer: CustomerInfo, items: OrderItem[]): Promise<Order> {
    await this.initialize();

    if (!customer?.fullName?.trim() || !customer?.phone?.trim() || !customer?.address?.trim()) {
      throw new Error('Vui lòng điền đầy đủ Họ tên, Số điện thoại và Địa chỉ nhận sách.');
    }

    if (!items || !Array.isArray(items) || items.length === 0) {
      throw new Error('Túi yêu cầu mua của bạn đang trống.');
    }

    // Phone validation (Vietnamese mobile 10 digits e.g. 09x, 08x, 03x, 05x, 07x)
    const phoneClean = customer.phone.replace(/[\s.-]/g, '');
    const phoneRegex = /^(0|\+84)(3|5|7|8|9)[0-9]{8}$/;
    if (!phoneRegex.test(phoneClean)) {
      throw new Error('Số điện thoại không hợp lệ theo định dạng Việt Nam.');
    }

    // Validate and sanitize each item, pulling authentic prices from server catalog (R06)
    const sanitizedItems: OrderItem[] = [];
    let subtotalVND = 0;

    for (const rawItem of items) {
      if (!rawItem.bookId || typeof rawItem.bookId !== 'string') {
        throw new Error('Mỗi sản phẩm phải có mã sách hợp lệ.');
      }

      const quantity = Number(rawItem.quantity);
      if (!Number.isInteger(quantity) || quantity <= 0) {
        throw new Error('Số lượng sách phải là số nguyên dương lớn hơn 0.');
      }

      const book = await catalogService.getBookById(rawItem.bookId);
      if (!book) {
        throw new Error(`Sách với mã "${rawItem.bookId}" không tồn tại trong hệ thống.`);
      }

      const serverUnitPrice = book.priceVND ?? 0;
      const verifiedItem: OrderItem = {
        bookId: book.id,
        bookTitle: book.title,
        quantity,
        unitPriceVND: serverUnitPrice
      };

      sanitizedItems.push(verifiedItem);
      subtotalVND += serverUnitPrice * quantity;
    }

    const orderId = generateOrderId();
    const newOrder: Order = {
      id: orderId,
      requestSource: 'website',
      createdAt: new Date().toISOString(),
      status: 'PENDING_CONTACT',
      customer: {
        fullName: customer.fullName.trim(),
        phone: phoneClean,
        address: customer.address.trim(),
        notes: customer.notes?.trim()
      },
      items: sanitizedItems,
      subtotalVND,
      notes: customer.notes?.trim(),
      stockDeducted: false,
      history: [
        {
          timestamp: new Date().toISOString(),
          toStatus: 'PENDING_CONTACT',
          role: 'STAFF',
          actorName: 'Website Guest Collector',
          reason: 'Khách gửi yêu cầu mua sách từ website (Zero Auto-Reservation)'
        }
      ]
    };

    // Save order in database
    await dbAdapter.put('orders', newOrder);

    // INVARIANT GUARANTEE (BD-04): Zero inventory reduction!
    // Book stock remains completely untouched here.

    return newOrder;
  }

  public async getAllOrders(): Promise<Order[]> {
    await this.initialize();
    const orders = await dbAdapter.getAll<Order>('orders');
    return orders.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  }

  public async getOrderById(id: string): Promise<Order | null> {
    await this.initialize();
    return dbAdapter.get<Order>('orders', id);
  }

  /**
   * Strict Order State Transitions
   * Enforces Finite State Machine, prevents bypasses and duplicate inventory reductions (R07, R08).
   */
  public async transitionOrderStatus(
    orderId: string,
    newStatus: OrderStatus,
    actingRole: UserRole,
    actorName: string,
    reason?: string
  ): Promise<Order> {
    return stateTransitionLock.acquire(async () => {
      await this.initialize();
      const order = await this.getOrderById(orderId);
      if (!order) {
        throw new Error(`Đơn hàng ${orderId} không tồn tại.`);
      }

      const currentStatus = order.status;
      if (currentStatus === newStatus) {
        return order;
      }

      // Terminal state protection: Cancelled orders can never be transitioned out
      if (currentStatus === 'CANCELLED') {
        throw new Error(`Đơn hàng ${orderId} đã ở trạng thái CANCELLED, không thể chuyển sang trạng thái khác.`);
      }

      // Graph validation: Disallow moving from CONFIRMED back to earlier states
      if (currentStatus === 'CONFIRMED' && (newStatus === 'PENDING_CONTACT' || newStatus === 'CONTACTED')) {
        throw new Error(`Đơn hàng ${orderId} đã CONFIRMED, không được phép chuyển lùi về ${newStatus}.`);
      }

      // 1. Invariant AC-11: Only Owner can transition to CONFIRMED
      if (newStatus === 'CONFIRMED') {
        if (actingRole !== 'OWNER') {
          throw new Error('LỖI PHÂN QUYỀN (AC-11): Chỉ có Chủ tiệm (Owner) mới có quyền duyệt đơn sang CONFIRMED.');
        }

        // Check if stock was already decremented (R08)
        if (!order.stockDeducted) {
          // 2. Invariant OD-02: Aggregate demand for each book before checking & decrementing (R07)
          const aggregatedDemand = new Map<string, number>();
          for (const item of order.items) {
            aggregatedDemand.set(item.bookId, (aggregatedDemand.get(item.bookId) || 0) + item.quantity);
          }

          // Verify stock sufficiency for all aggregated items first
          for (const [bookId, requiredQty] of aggregatedDemand.entries()) {
            const book = await catalogService.getBookById(bookId);
            if (!book) {
              throw new Error(`CẢNH BÁO OD-02: Không tìm thấy sách trong kho.`);
            }
            if (book.stockCount < requiredQty) {
              throw new Error(`CẢNH BÁO OD-02: Không thể duyệt đơn ${orderId} khi tồn kho của "${book.title}" không đủ (Hiện còn: ${book.stockCount}, Yêu cầu: ${requiredQty}). Bắt buộc giữ ở trạng thái Chờ xác minh.`);
            }
          }

          // 3. Invariant AC-15: Single Inventory Decrement on CONFIRMED
          for (const [bookId, requiredQty] of aggregatedDemand.entries()) {
            await catalogService.decrementStock(bookId, requiredQty);
          }

          order.stockDeducted = true;
        }

        order.confirmedAt = new Date().toISOString();
      }

      // 4. Invariant OD-01: Cancellation Guard
      if (newStatus === 'CANCELLED') {
        if (currentStatus === 'CONFIRMED') {
          if (actingRole !== 'OWNER') {
            throw new Error('LỖI PHÂN QUYỀN (OD-01): Đơn hàng đã CONFIRMED chỉ duy nhất Chủ tiệm (Owner) mới có quyền Hủy (CANCELLED) để bảo đảm sổ sách.');
          }
        }
        order.cancelledAt = new Date().toISOString();
        order.cancelledByRole = actingRole;
      }

      // Record transition history
      order.status = newStatus;
      order.history.push({
        timestamp: new Date().toISOString(),
        fromStatus: currentStatus,
        toStatus: newStatus,
        role: actingRole,
        actorName,
        reason
      });

      await dbAdapter.put('orders', order);
      return order;
    });
  }

  /**
   * Helper contract for confirming an order (R01)
   */
  public async confirmOrder(
    orderId: string,
    role: UserRole = 'OWNER',
    actorName = 'Chủ tiệm (Owner)'
  ): Promise<{ success: boolean; error?: string; order?: Order }> {
    try {
      const order = await this.transitionOrderStatus(orderId, 'CONFIRMED', role, actorName, 'Chủ tiệm duyệt đơn');
      return { success: true, order };
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  }

  /**
   * Helper contract for cancelling an order (R01)
   */
  public async cancelOrder(
    orderId: string,
    role: UserRole = 'STAFF',
    actorName = 'Nhân viên / Chủ tiệm',
    reason = 'Hủy đơn'
  ): Promise<{ success: boolean; error?: string; order?: Order }> {
    try {
      const order = await this.transitionOrderStatus(orderId, 'CANCELLED', role, actorName, reason);
      return { success: true, order };
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  }

  /**
   * 48-Hour Stale Alert: Check if uncontacted order exceeds 48h
   */
  public isOrderStale(order: Order, nowMs = Date.now()): boolean {
    if (order.status !== 'PENDING_CONTACT') {
      return false;
    }
    const orderCreatedMs = new Date(order.createdAt).getTime();
    const diffHours = (nowMs - orderCreatedMs) / (1000 * 60 * 60);
    return diffHours >= 48;
  }

  /**
   * Generates standardized Facebook Messenger clipboard copy text
   */
  public formatMessengerExport(order: Order): string {
    const lines: string[] = [
      `[OOPS LA BOOK STORE — YÊU CẦU ĐẶT MUA SÁCH]`,
      `Mã đơn: ${order.id}`,
      `Thời gian: ${new Date(order.createdAt).toLocaleString('vi-VN')}`,
      `Khách hàng: ${order.customer.fullName} - ${order.customer.phone}`,
      `Địa chỉ giao hàng: ${order.customer.address}`,
      `-----------------------------------------`,
      `DANH MỤC SÁCH YÊU CẦU:`
    ];

    order.items.forEach((item, index) => {
      lines.push(`${index + 1}. ${item.bookTitle} (SL: ${item.quantity}) — ${formatVND(item.unitPriceVND * item.quantity)}`);
    });

    lines.push(`-----------------------------------------`);
    lines.push(`TỔNG TẠM TÍNH: ${formatVND(order.subtotalVND)}`);
    if (order.notes) {
      lines.push(`Ghi chú của khách: ${order.notes}`);
    }
    lines.push(`-----------------------------------------`);
    lines.push(`Lưu ý: Tiệm sẽ kiểm tra tình trạng sách thực tế và gửi ảnh chụp chi tiết kèm thông tin cọc qua tin nhắn này.`);

    return lines.join('\n');
  }
}

export const orderService = new OrderService();
