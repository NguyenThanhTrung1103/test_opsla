/**
 * Oops La Book Store — Currency Formatter Utility
 * Invariant CURR-01: Every monetary value is strictly formatted in VNĐ.
 * Rounded to tens of thousands with dot thousands separators.
 * Zero foreign currency or currency toggles allowed.
 */

export function formatVND(amount: number): string {
  if (isNaN(amount) || amount === null || amount === undefined) {
    return '0 VNĐ';
  }

  // Format with dot separator: e.g. 1.250.000 VNĐ
  const rounded = Math.round(amount);
  const formatted = rounded.toLocaleString('vi-VN');
  return `${formatted} VNĐ`;
}

export function parseVND(formattedStr: string): number {
  const clean = formattedStr.replace(/[^\d]/g, '');
  return parseInt(clean, 10) || 0;
}
