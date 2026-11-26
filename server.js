'use strict';
const path = require('node:path');
const { openDb } = require('./db');
const { createApp } = require('./app');

const port = Number(process.env.PORT || 3000);
const dbFile = process.env.DB_FILE || path.join(__dirname, 'data', 'pharmacare.db');
const adminUser = process.env.ADMIN_USER || 'admin';
const adminPassword = process.env.ADMIN_PASSWORD || 'demo1234';

if (!process.env.ADMIN_PASSWORD) {
  console.warn('[PharmaCare] ADMIN_PASSWORD not set: using the demo password. Set ADMIN_PASSWORD before real use.');
}
const db = openDb(dbFile);
createApp({ db, adminUser, adminPassword }).listen(port, () => {
  console.log(`PharmaCare running on http://localhost:${port}`);
});
