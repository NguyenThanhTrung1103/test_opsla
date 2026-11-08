/**
 * Oops La Book Store — Catalog Service
 * Business logic layer for book retrieval, instant multi-attribute search,
 * stock status computation, and media spread resolution.
 */

import type { Book, MediaAsset, EditorialArticle, BookSize, BookCategory } from '../types/domain.ts';
import { dbAdapter } from '../storage/indexed-db.ts';
import { SEED_BOOKS, SEED_MEDIA_ASSETS, SEED_ARTICLES } from '../data/seed-data.ts';

export interface CatalogFilterOptions {
  category?: BookCategory | 'ALL';
  bookSize?: BookSize | 'ALL';
  searchQuery?: string;
}

export class CatalogService {
  private initialized = false;

  public async initialize(): Promise<void> {
    if (this.initialized) return;

    await dbAdapter.init();

    // Check if books are seeded
    const existingBooks = await dbAdapter.getAll<Book>('books');
    if (existingBooks.length === 0) {
      for (const book of SEED_BOOKS) {
        await dbAdapter.put('books', book);
      }
      for (const asset of SEED_MEDIA_ASSETS) {
        await dbAdapter.put('media_assets', asset);
      }
      for (const article of SEED_ARTICLES) {
        await dbAdapter.put('articles', article);
      }
    }

    this.initialized = true;
  }

  public async getBooks(options: CatalogFilterOptions = {}): Promise<Book[]> {
    await this.initialize();
    let books = await dbAdapter.getAll<Book>('books');

    // Filter by Category
    if (options.category && options.category !== 'ALL') {
      books = books.filter(b => b.category === options.category);
    }

    // Filter by Book Size
    if (options.bookSize && options.bookSize !== 'ALL') {
      books = books.filter(b => b.bookSize === options.bookSize);
    }

    // Instant Search by Title, Author, ISBN
    if (options.searchQuery && options.searchQuery.trim() !== '') {
      const q = options.searchQuery.toLowerCase().trim();
      books = books.filter(b =>
        b.title.toLowerCase().includes(q) ||
        b.author.toLowerCase().includes(q) ||
        b.isbn.replace(/[-\s]/g, '').includes(q.replace(/[-\s]/g, '')) ||
        (b.subtitle && b.subtitle.toLowerCase().includes(q))
      );
    }

    return books;
  }

  public async getBookById(id: string): Promise<Book | null> {
    await this.initialize();
    const book = await dbAdapter.get<Book>('books', id);
    if (book) return book;

    // V04: ID Aliases between frontend mockup and backend seeds
    const ID_ALIASES: Record<string, string> = {
      'book-bowwow-1': 'ols-book-01',
      'book-bowwow-2': 'ols-book-02',
      'book-ando-xxl': 'ols-book-03',
      'book-made-in-tokyo': 'ols-book-04',
      'book-zumthor': 'ols-book-05',
      'book-piano-sumo': 'ols-book-03',
      'book-kuma-xl': 'ols-book-02',
      'book-zaha-xxl': 'ols-book-03',
      'book-corbusier-sumo': 'ols-book-01'
    };

    const targetId = ID_ALIASES[id];
    if (targetId) {
      return dbAdapter.get<Book>('books', targetId);
    }
    return null;
  }

  public async getBookMediaAssets(bookId: string): Promise<MediaAsset[]> {
    await this.initialize();
    const assets = await dbAdapter.queryByIndex<MediaAsset>('media_assets', 'by_bookId', bookId);
    return assets.sort((a, b) => a.sortOrder - b.sortOrder);
  }

  public async updateStockCount(bookId: string, newStock: number): Promise<Book> {
    await this.initialize();
    const book = await this.getBookById(bookId);
    if (!book) {
      throw new Error(`Book with id ${bookId} not found`);
    }

    const updatedStock = Math.max(0, newStock);
    book.stockCount = updatedStock;

    // Automatic status recalculation based on stock invariants
    if (updatedStock === 0) {
      book.status = 'SOLD_OUT';
    } else if (updatedStock === 1) {
      book.status = 'ONE_COPY_LEFT';
    } else {
      book.status = 'IN_STOCK';
    }

    await dbAdapter.put('books', book);
    return book;
  }

  public async decrementStock(bookId: string, quantity: number): Promise<Book> {
    await this.initialize();
    const book = await this.getBookById(bookId);
    if (!book) {
      throw new Error(`Book with id ${bookId} not found`);
    }

    if (book.stockCount < quantity) {
      throw new Error(`Cannot decrement: Insufficient stock (${book.stockCount}) for quantity (${quantity})`);
    }

    return this.updateStockCount(bookId, book.stockCount - quantity);
  }

  public async getArticles(): Promise<EditorialArticle[]> {
    await this.initialize();
    return dbAdapter.getAll<EditorialArticle>('articles');
  }

  public async getArticleBySlug(slug: string): Promise<EditorialArticle | null> {
    await this.initialize();
    const articles = await dbAdapter.queryByIndex<EditorialArticle>('articles', 'by_slug', slug);
    return articles.length > 0 ? articles[0] : null;
  }
}

export const catalogService = new CatalogService();
