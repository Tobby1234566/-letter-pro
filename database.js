const initSqlJs = require('sql.js');
const fs = require('fs');
const path = require('path');
const bcrypt = require('bcryptjs');

const DB_PATH = path.join(__dirname, 'letters.db');

let db = null;

// Initialize database
async function initDatabase() {
  const SQL = await initSqlJs();

  // Load existing database or create new one
  if (fs.existsSync(DB_PATH)) {
    const fileBuffer = fs.readFileSync(DB_PATH);
    db = new SQL.Database(fileBuffer);
  } else {
    db = new SQL.Database();
  }

  // Create tables
  db.run(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      email TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      role TEXT DEFAULT 'user',
      trial_used INTEGER DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS requests (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      type TEXT NOT NULL,
      letter_type TEXT,
      subject TEXT,
      description TEXT,
      file_path TEXT,
      recipient_email TEXT,
      priority TEXT DEFAULT 'normal',
      price INTEGER DEFAULT 1000,
      status TEXT DEFAULT 'pending',
      letter_content TEXT,
      payment_receipt_path TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id)
    )
  `);

  // Add payment_receipt_path column if it doesn't exist (for existing databases)
  try {
    db.run("ALTER TABLE requests ADD COLUMN payment_receipt_path TEXT");
  } catch (e) {
    // Column already exists, ignore
  }

  // Create admin user if not exists
  const adminCheck = db.exec("SELECT id FROM users WHERE role = 'admin'");
  if (adminCheck.length === 0 || adminCheck[0].values.length === 0) {
    const hash = bcrypt.hashSync('admin123', 10);
    db.run(
      "INSERT INTO users (name, email, password_hash, role) VALUES (?, ?, ?, ?)",
      ['Admin', 'admin@letterservice.com', hash, 'admin']
    );
    console.log('Admin account created: admin@letterservice.com / admin123');
  }

  saveDatabase();
  return db;
}

function saveDatabase() {
  if (db) {
    const data = db.export();
    const buffer = Buffer.from(data);
    fs.writeFileSync(DB_PATH, buffer);
  }
}

function getDb() {
  return db;
}

// Helper functions
function run(sql, params = []) {
  db.run(sql, params);
  const rowid = db.exec("SELECT last_insert_rowid()")[0]?.values[0]?.[0] || null;
  saveDatabase();
  return { lastInsertRowid: rowid };
}

function get(sql, params = []) {
  const stmt = db.prepare(sql);
  stmt.bind(params);
  if (stmt.step()) {
    const row = stmt.getAsObject();
    stmt.free();
    return row;
  }
  stmt.free();
  return null;
}

function all(sql, params = []) {
  const results = [];
  const stmt = db.prepare(sql);
  stmt.bind(params);
  while (stmt.step()) {
    results.push(stmt.getAsObject());
  }
  stmt.free();
  return results;
}

function exec(sql) {
  db.run(sql);
  saveDatabase();
}

module.exports = { initDatabase, getDb, run, get, all, exec, saveDatabase };
