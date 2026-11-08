/**
 * Oops La Book Store — Domain Types & Schemas
 * Standard: Tri-Pillar Architecture / SSOT BRD-OLS-002 v2.0
 */

export type BookSize = 'STANDARD' | 'SUMO' | 'XXL';

export type BookStatus = 'IN_STOCK' | 'ONE_COPY_LEFT' | 'SOLD_OUT';

export type BookCategory = 'Monograph' | 'Technical Drawings' | 'Urban Theory' | 'Sumo Edition';

export interface Book {
  id: string;
  title: string;
  subtitle: string;
  author: string;
  publisher: string;
  isbn: string;
  publicationYear: number;
  bookSize: BookSize;
  dimensionsText: string;
  priceVND: number | null;
  stockCount: number;
  status: BookStatus;
  coverImage: string;
  description: string;
  category: BookCategory;
  featured: boolean;
  tags: string[];
  isPublished?: boolean;
}

export type MediaAssetType = 'FRONT' | 'BACK' | 'SPINE' | 'SPREAD';

export interface MediaAsset {
  id: string;
  bookId: string;
  assetType: MediaAssetType;
  sortOrder: number;
  title: string;
  scaleLabel: string;
  imageUrl: string;
  svgPlateIndex?: number;
  blobData?: Blob;
}

export type OrderStatus = 'PENDING_CONTACT' | 'CONTACTED' | 'CONFIRMED' | 'CANCELLED';

export type UserRole = 'OWNER' | 'STAFF';

export interface OrderItem {
  bookId: string;
  bookTitle: string;
  quantity: number;
  unitPriceVND: number;
}

export interface CustomerInfo {
  fullName: string;
  phone: string;
  address: string;
  notes?: string;
}

export interface OrderStatusHistoryEntry {
  timestamp: string;
  fromStatus?: OrderStatus;
  toStatus: OrderStatus;
  role: UserRole;
  actorName: string;
  reason?: string;
}

export interface Order {
  id: string; // Formatted OLS-xxxxxx
  requestSource: 'website';
  createdAt: string; // ISO 8601
  status: OrderStatus;
  customer: CustomerInfo;
  items: OrderItem[];
  subtotalVND: number;
  notes?: string;
  history: OrderStatusHistoryEntry[];
  confirmedAt?: string;
  cancelledAt?: string;
  cancelledByRole?: UserRole;
  stockDeducted?: boolean;
}

export interface EditorialArticle {
  id: string;
  title: string;
  slug: string;
  excerpt: string;
  content: string;
  coverImage: string;
  author: string;
  publishedAt: string;
  relatedBookIds: string[];
  status: 'DRAFT' | 'PUBLISHED';
}

export interface AppSettings {
  key: string;
  value: any;
  updatedAt: string;
}
