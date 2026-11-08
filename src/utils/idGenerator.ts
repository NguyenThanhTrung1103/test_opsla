/**
 * Oops La Book Store — Order ID Generator
 * Generates unique identifiers with prefix OLS- followed by uppercase alphanumeric entropy.
 * Format: OLS-XXXXXX (e.g. OLS-261104, OLS-A8B9C2)
 */

export function generateOrderId(prefix = 'OLS'): string {
  const chars = '0123456789ABCDEFGHJKLMNPQRSTUVWXYZ';
  let randomPart = '';
  for (let i = 0; i < 6; i++) {
    const randomIndex = Math.floor(Math.random() * chars.length);
    randomPart += chars[randomIndex];
  }
  return `${prefix}-${randomPart}`;
}

export function isValidOrderId(id: string, prefix = 'OLS'): boolean {
  const regex = new RegExp(`^${prefix}-[0-9A-Z]{6}$`);
  return regex.test(id);
}
