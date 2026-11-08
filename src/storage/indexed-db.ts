/**
 * Oops La Book Store — Storage Adapter (OopsLaDB)
 * High-performance dual-mode storage:
 * - Browser: Native IndexedDB (zero dependencies)
 * - Server (Node.js): Durable JSON file storage across process restarts.
 */

import type { Book, MediaAsset, Order, EditorialArticle, AppSettings } from '../types/domain.ts';

let nodeFs: typeof import('node:fs') | null = null;
let nodePath: typeof import('node:path') | null = null;

if (typeof window === 'undefined' && typeof process !== 'undefined' && process.versions?.node) {
  try {
    nodeFs = await import('node:fs');
    nodePath = await import('node:path');
  } catch {
    // Browser or non-Node environment
  }
}

export const DB_NAME = 'OopsLaDB';
export const DB_VERSION = 1;

export type StoreName = 'books' | 'media_assets' | 'orders' | 'articles' | 'settings';

export class IndexedDBAdapter {
  private db: IDBDatabase | null = null;
  private memoryFallback: Map<StoreName, Map<string, any>> = new Map([
    ['books', new Map()],
    ['media_assets', new Map()],
    ['orders', new Map()],
    ['articles', new Map()],
    ['settings', new Map()],
  ]);
  private isBrowserIDB = typeof indexedDB !== 'undefined';
  private filePath: string | null = null;

  constructor(filePath?: string | null) {
    if (filePath !== undefined) {
      this.filePath = filePath;
    } else if (typeof process !== 'undefined' && process.env?.STORAGE_FILE) {
      this.filePath = process.env.STORAGE_FILE;
    }
  }

  public setStorageFile(filePath: string | null): void {
    this.filePath = filePath;
    if (this.filePath) {
      this.loadFromDisk();
    }
  }

  public getStorageFile(): string | null {
    return this.filePath;
  }

  private saveToDisk(): void {
    if (!this.filePath || !nodeFs || !nodePath || this.isBrowserIDB) return;
    try {
      const dir = nodePath.dirname(this.filePath);
      if (!nodeFs.existsSync(dir)) {
        nodeFs.mkdirSync(dir, { recursive: true });
      }
      const data: Record<string, any[]> = {};
      for (const [storeName, map] of this.memoryFallback.entries()) {
        data[storeName] = Array.from(map.values());
      }
      nodeFs.writeFileSync(this.filePath, JSON.stringify(data, null, 2), 'utf-8');
    } catch (err) {
      console.error('[OopsLaDB] Failed to persist data to disk:', err);
      throw err;
    }
  }

  private loadFromDisk(): void {
    if (!this.filePath || !nodeFs || !nodePath || this.isBrowserIDB) return;
    try {
      if (nodeFs.existsSync(this.filePath)) {
        const raw = nodeFs.readFileSync(this.filePath, 'utf-8').trim();
        if (!raw) return;
        const data = JSON.parse(raw);
        for (const storeName of ['books', 'media_assets', 'orders', 'articles', 'settings'] as StoreName[]) {
          if (Array.isArray(data[storeName])) {
            const map = this.memoryFallback.get(storeName);
            if (map) {
              map.clear();
              for (const item of data[storeName]) {
                const key = item.id || item.key;
                if (key) map.set(key, item);
              }
            }
          }
        }
      }
    } catch (err) {
      console.error('[OopsLaDB] Failed to load data from disk:', err);
    }
  }

  public async init(): Promise<void> {
    if (!this.isBrowserIDB) {
      this.loadFromDisk();
      return;
    }

    return new Promise((resolve) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);

      request.onupgradeneeded = (event) => {
        const db = (event.target as IDBOpenDBRequest).result;

        // 1. books store
        if (!db.objectStoreNames.contains('books')) {
          const bookStore = db.createObjectStore('books', { keyPath: 'id' });
          bookStore.createIndex('by_category', 'category', { unique: false });
          bookStore.createIndex('by_status', 'status', { unique: false });
          bookStore.createIndex('by_isbn', 'isbn', { unique: false });
        }

        // 2. media_assets store
        if (!db.objectStoreNames.contains('media_assets')) {
          const mediaStore = db.createObjectStore('media_assets', { keyPath: 'id' });
          mediaStore.createIndex('by_bookId', 'bookId', { unique: false });
          mediaStore.createIndex('by_sortOrder', ['bookId', 'sortOrder'], { unique: false });
        }

        // 3. orders store
        if (!db.objectStoreNames.contains('orders')) {
          const orderStore = db.createObjectStore('orders', { keyPath: 'id' });
          orderStore.createIndex('by_status', 'status', { unique: false });
          orderStore.createIndex('by_createdAt', 'createdAt', { unique: false });
        }

        // 4. articles store
        if (!db.objectStoreNames.contains('articles')) {
          const articleStore = db.createObjectStore('articles', { keyPath: 'id' });
          articleStore.createIndex('by_slug', 'slug', { unique: true });
        }

        // 5. settings store
        if (!db.objectStoreNames.contains('settings')) {
          db.createObjectStore('settings', { keyPath: 'key' });
        }
      };

      request.onsuccess = (event) => {
        this.db = (event.target as IDBOpenDBRequest).result;
        resolve();
      };

      request.onerror = (event) => {
        console.warn('IndexedDB open error, falling back to memory store:', request.error);
        resolve();
      };
    });
  }

  public async getAll<T>(storeName: StoreName): Promise<T[]> {
    if (!this.db) {
      const storeMap = this.memoryFallback.get(storeName);
      return storeMap ? Array.from(storeMap.values()) as T[] : [];
    }

    return new Promise((resolve, reject) => {
      try {
        const tx = this.db!.transaction(storeName, 'readonly');
        const store = tx.objectStore(storeName);
        const request = store.getAll();

        request.onsuccess = () => resolve(request.result as T[]);
        request.onerror = () => reject(request.error);
      } catch (err) {
        reject(err);
      }
    });
  }

  public async get<T>(storeName: StoreName, key: string): Promise<T | null> {
    if (!this.db) {
      const storeMap = this.memoryFallback.get(storeName);
      return (storeMap?.get(key) as T) || null;
    }

    return new Promise((resolve, reject) => {
      try {
        const tx = this.db!.transaction(storeName, 'readonly');
        const store = tx.objectStore(storeName);
        const request = store.get(key);

        request.onsuccess = () => resolve((request.result as T) || null);
        request.onerror = () => reject(request.error);
      } catch (err) {
        reject(err);
      }
    });
  }

  public async put<T extends { id?: string; key?: string }>(storeName: StoreName, item: T): Promise<void> {
    const key = item.id || item.key;
    if (key) {
      const prev = this.memoryFallback.get(storeName)?.get(key);
      this.memoryFallback.get(storeName)?.set(key, item);
      try {
        this.saveToDisk();
      } catch (err) {
        if (prev !== undefined) {
          this.memoryFallback.get(storeName)?.set(key, prev);
        } else {
          this.memoryFallback.get(storeName)?.delete(key);
        }
        throw err;
      }
    }

    if (!this.db) {
      return;
    }

    return new Promise((resolve, reject) => {
      try {
        const tx = this.db!.transaction(storeName, 'readwrite');
        const store = tx.objectStore(storeName);
        const request = store.put(item);

        request.onsuccess = () => resolve();
        request.onerror = () => reject(request.error);
      } catch (err) {
        reject(err);
      }
    });
  }

  public async delete(storeName: StoreName, key: string): Promise<void> {
    const prev = this.memoryFallback.get(storeName)?.get(key);
    this.memoryFallback.get(storeName)?.delete(key);
    try {
      this.saveToDisk();
    } catch (err) {
      if (prev !== undefined) {
        this.memoryFallback.get(storeName)?.set(key, prev);
      }
      throw err;
    }

    if (!this.db) {
      return;
    }

    return new Promise((resolve, reject) => {
      try {
        const tx = this.db!.transaction(storeName, 'readwrite');
        const store = tx.objectStore(storeName);
        const request = store.delete(key);

        request.onsuccess = () => resolve();
        request.onerror = () => reject(request.error);
      } catch (err) {
        reject(err);
      }
    });
  }

  public async queryByIndex<T>(storeName: StoreName, indexName: string, queryValue: IDBValidKey | IDBKeyRange): Promise<T[]> {
    if (!this.db) {
      const all = await this.getAll<T>(storeName);
      return all.filter((item: any) => item[indexName.replace('by_', '')] === queryValue);
    }

    return new Promise((resolve, reject) => {
      try {
        const tx = this.db!.transaction(storeName, 'readonly');
        const store = tx.objectStore(storeName);
        const index = store.index(indexName);
        const request = index.getAll(queryValue);

        request.onsuccess = () => resolve(request.result as T[]);
        request.onerror = () => reject(request.error);
      } catch (err) {
        reject(err);
      }
    });
  }

  public async clear(storeName: StoreName): Promise<void> {
    const prev = new Map(this.memoryFallback.get(storeName));
    this.memoryFallback.get(storeName)?.clear();
    try {
      this.saveToDisk();
    } catch (err) {
      this.memoryFallback.set(storeName, prev);
      throw err;
    }

    if (!this.db) {
      return;
    }

    return new Promise((resolve, reject) => {
      try {
        const tx = this.db!.transaction(storeName, 'readwrite');
        const store = tx.objectStore(storeName);
        const request = store.clear();

        request.onsuccess = () => resolve();
        request.onerror = () => reject(request.error);
      } catch (err) {
        reject(err);
      }
    });
  }
}

export const dbAdapter = new IndexedDBAdapter();
