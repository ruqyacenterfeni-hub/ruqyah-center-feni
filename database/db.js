const path = require('path');
const fs = require('fs');

const dbPath = path.join(__dirname, 'ruqyah.db');
const schemaPath = path.join(__dirname, 'schema.sql');

let db;

// 1. Attempt to load better-sqlite3
try {
  // Check for compiled release
  const releaseBinding = path.join(__dirname, '..', 'node_modules', 'better-sqlite3', 'build', 'Release', 'better_sqlite3.node');
  const dbOptions = {};
  if (fs.existsSync(releaseBinding)) {
    dbOptions.nativeBinding = releaseBinding;
  }
  const Database = require('better-sqlite3');
  db = new Database(dbPath, dbOptions);
  console.log('Database initialized successfully using better-sqlite3');
} catch (nativeErr) {
  console.warn('better-sqlite3 failed to load (' + nativeErr.message + '), falling back to Node.js built-in node:sqlite...');

  try {
    const { DatabaseSync } = require('node:sqlite');
    const syncDb = new DatabaseSync(dbPath);

    syncDb.pragma = function (pragmaStr) {
      try {
        return syncDb.exec(`PRAGMA ${pragmaStr};`);
      } catch (err) {
        return syncDb.prepare(`PRAGMA ${pragmaStr};`).all();
      }
    };

    syncDb.transaction = function (fn) {
      return function (...args) {
        syncDb.exec('BEGIN;');
        try {
          const result = fn(...args);
          syncDb.exec('COMMIT;');
          return result;
        } catch (err) {
          syncDb.exec('ROLLBACK;');
          throw err;
        }
      };
    };

    db = syncDb;
    console.log('Database initialized successfully using Node.js built-in node:sqlite (Zero GLIBC dependencies)');
  } catch (sqliteErr) {
    console.error('CRITICAL: Failed to initialize SQLite with better-sqlite3 and node:sqlite:', sqliteErr);
    throw sqliteErr;
  }
}

// Enable WAL mode and foreign keys for high concurrency & data integrity
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

function initDb() {
  const schema = fs.readFileSync(schemaPath, 'utf8');
  db.exec(schema);
  
  // Run non-destructive migrations
  try {
    const { runMigrationV7 } = require('./migrate_v7_notices_family_holidays');
    runMigrationV7(db);
  } catch (mErr) {
    console.warn('Migration V7 warning:', mErr.message);
  }
}

initDb();

module.exports = db;


