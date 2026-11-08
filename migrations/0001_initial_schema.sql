-- Oops La Book Store — Cloudflare D1 Initial Schema
-- Migration: 0001_initial_schema.sql

CREATE TABLE IF NOT EXISTS books (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  subtitle TEXT,
  author TEXT NOT NULL,
  publisher TEXT NOT NULL,
  isbn TEXT NOT NULL UNIQUE,
  publication_year INTEGER NOT NULL,
  book_size TEXT NOT NULL, -- 'SUMO' | 'STANDARD'
  dimensions_text TEXT NOT NULL,
  price_vnd INTEGER NOT NULL, -- Strict Single Currency VNĐ (CURR-01)
  stock_count INTEGER NOT NULL DEFAULT 1,
  status TEXT NOT NULL DEFAULT 'IN_STOCK', -- 'IN_STOCK' | 'ONE_COPY_LEFT' | 'SOLD_OUT'
  cover_image TEXT,
  description TEXT,
  category TEXT NOT NULL, -- 'Monograph' | 'Technical Drawings' | 'Architectural Theory' | 'Rare Folio'
  featured BOOLEAN DEFAULT 0,
  tags_json TEXT DEFAULT '[]',
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS orders (
  id TEXT PRIMARY KEY, -- Format: OLS-XXXXXX
  customer_name TEXT NOT NULL,
  customer_phone TEXT NOT NULL,
  customer_address TEXT NOT NULL,
  customer_notes TEXT,
  items_json TEXT NOT NULL,
  total_amount_vnd INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'REQUEST_RECEIVED', -- 'REQUEST_RECEIVED' | 'CONFIRMED' | 'PACKED' | 'DISPATCHED' | 'CANCELLED'
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Performance Indexes
CREATE INDEX IF NOT EXISTS idx_books_isbn ON books(isbn);
CREATE INDEX IF NOT EXISTS idx_books_category ON books(category);
CREATE INDEX IF NOT EXISTS idx_books_status ON books(status);
CREATE INDEX IF NOT EXISTS idx_orders_status ON orders(status);
CREATE INDEX IF NOT EXISTS idx_orders_created_at ON orders(created_at);

