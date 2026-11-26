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
    CREATE INDEX IF NOT EXISTS idx_batches_med ON batches(medicine_id, expiry);
  `);
  return db;
}

module.exports = { openDb };
