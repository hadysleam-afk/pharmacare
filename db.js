'use strict';
const { DatabaseSync } = require('node:sqlite');
const fs = require('node:fs');
const path = require('node:path');

function openDb(file) {
  if (file !== ':memory:') fs.mkdirSync(path.dirname(file), { recursive: true });
  const db = new DatabaseSync(file);
  db.exec(`
    PRAGMA foreign_keys = ON;
    CREATE TABLE IF NOT EXISTS medicines (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      generic TEXT NOT NULL DEFAULT '',
      category TEXT NOT NULL DEFAULT '',
      barcode TEXT UNIQUE,
      price REAL NOT NULL CHECK (price >= 0),
      min_stock INTEGER NOT NULL DEFAULT 10 CHECK (min_stock >= 0),
      active INTEGER NOT NULL DEFAULT 1
    );
    CREATE TABLE IF NOT EXISTS batches (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      medicine_id INTEGER NOT NULL REFERENCES medicines(id),
      batch_no TEXT NOT NULL,
      expiry TEXT NOT NULL,
      qty INTEGER NOT NULL CHECK (qty >= 0),
      cost REAL NOT NULL DEFAULT 0,
      supplier TEXT NOT NULL DEFAULT '',
      received_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS sales (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      total REAL NOT NULL,
      customer TEXT NOT NULL DEFAULT ''
    );
    CREATE TABLE IF NOT EXISTS sale_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      sale_id INTEGER NOT NULL REFERENCES sales(id),
      medicine_id INTEGER NOT NULL REFERENCES medicines(id),
      batch_id INTEGER NOT NULL REFERENCES batches(id),
      qty INTEGER NOT NULL,
      price REAL NOT NULL
    );
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT NOT NULL UNIQUE,
      pass_hash TEXT NOT NULL,
      salt TEXT NOT NULL,
      role TEXT NOT NULL DEFAULT 'seller' CHECK (role IN ('admin','seller')),
      active INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS customers (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL UNIQUE,
      phone TEXT NOT NULL DEFAULT '',
      notes TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS suppliers (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL UNIQUE,
      phone TEXT NOT NULL DEFAULT '',
      company TEXT NOT NULL DEFAULT '',
      notes TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS purchases (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      supplier_id INTEGER REFERENCES suppliers(id),
      user_id INTEGER REFERENCES users(id),
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      total REAL NOT NULL DEFAULT 0
    );
    CREATE TABLE IF NOT EXISTS purchase_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      purchase_id INTEGER NOT NULL REFERENCES purchases(id),
      medicine_id INTEGER NOT NULL REFERENCES medicines(id),
      batch_id INTEGER NOT NULL REFERENCES batches(id),
      qty INTEGER NOT NULL,
      cost REAL NOT NULL DEFAULT 0
    );
    CREATE TABLE IF NOT EXISTS returns (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      sale_id INTEGER NOT NULL REFERENCES sales(id),
      user_id INTEGER REFERENCES users(id),
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      total REAL NOT NULL DEFAULT 0,
      reason TEXT NOT NULL DEFAULT ''
    );
    CREATE TABLE IF NOT EXISTS return_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      return_id INTEGER NOT NULL REFERENCES returns(id),
      sale_item_id INTEGER NOT NULL REFERENCES sale_items(id),
      medicine_id INTEGER NOT NULL REFERENCES medicines(id),
      batch_id INTEGER NOT NULL REFERENCES batches(id),
      qty INTEGER NOT NULL,
      price REAL NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_batches_med ON batches(medicine_id, expiry);
    CREATE INDEX IF NOT EXISTS idx_sale_items_sale ON sale_items(sale_id);
    CREATE INDEX IF NOT EXISTS idx_return_items_sale_item ON return_items(sale_item_id);
    CREATE INDEX IF NOT EXISTS idx_purchase_items_purchase ON purchase_items(purchase_id);
  `);
  // Migrate databases created by v1: add the columns introduced in v2.
  const cols = (t) => db.prepare(`PRAGMA table_info(${t})`).all().map((c) => c.name);
  if (!cols('sales').includes('user_id')) db.exec('ALTER TABLE sales ADD COLUMN user_id INTEGER REFERENCES users(id)');
  if (!cols('sales').includes('customer_id')) db.exec('ALTER TABLE sales ADD COLUMN customer_id INTEGER REFERENCES customers(id)');
  if (!cols('batches').includes('supplier_id')) db.exec('ALTER TABLE batches ADD COLUMN supplier_id INTEGER REFERENCES suppliers(id)');
  if (!cols('batches').includes('purchase_id')) db.exec('ALTER TABLE batches ADD COLUMN purchase_id INTEGER REFERENCES purchases(id)');
  return db;
}

module.exports = { openDb };
