/**
 * Oops La Book Store — Permission Guard Service
 * Strictly enforces dual-role authorization contracts based on:
 * - auth-roles.workbook.md
 * - AC-11: Only Owner can transition to CONFIRMED
 * - OD-01: Only Owner can cancel orders that are already CONFIRMED
 */

import type { UserRole, OrderStatus } from '../types/domain.ts';

export class PermissionGuard {
  private currentRole: UserRole = 'OWNER';

  public setRole(role: UserRole): void {
    this.currentRole = role;
  }

  public getRole(): UserRole {
    return this.currentRole;
  }

  /**
   * AC-11 Invariant: Only Owner is authorized to confirm an order.
   */
  public canConfirmOrder(role: UserRole = this.currentRole): boolean {
    return role === 'OWNER';
  }

  /**
   * OD-01 Invariant: Staff and Owner can cancel unconfirmed orders;
   * Once CONFIRMED, ONLY Owner can cancel.
   */
  public canCancelOrder(orderStatus: OrderStatus, role: UserRole = this.currentRole): boolean {
    if (orderStatus === 'CONFIRMED') {
      return role === 'OWNER';
    }
    return true; // PENDING_CONTACT and CONTACTED can be cancelled by both
  }

  /**
   * Status change permission verifier
   */
  public verifyTransition(fromStatus: OrderStatus, toStatus: OrderStatus, role: UserRole = this.currentRole): void {
    if (toStatus === 'CONFIRMED' && !this.canConfirmOrder(role)) {
      throw new Error('LỖI PHÂN QUYỀN (AC-11): Nhân viên (Staff) không có quyền duyệt đơn sang CONFIRMED. Thao tác này chỉ dành riêng cho Chủ tiệm (Owner).');
    }

    if (toStatus === 'CANCELLED' && !this.canCancelOrder(fromStatus, role)) {
      throw new Error('LỖI PHÂN QUYỀN (OD-01): Đơn hàng đã duyệt (CONFIRMED) chỉ duy nhất Chủ tiệm (Owner) mới có quyền Hủy để bảo đảm tính toàn vẹn của sổ sách kế toán.');
    }
  }
}

export const permissionGuard = new PermissionGuard();
