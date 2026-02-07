import initSqlJs from 'sql.js';
import { readFileSync, writeFileSync, existsSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const dbPath = join(__dirname, '../../data.db');

let db = null;

async function getDb() {
  if (db) return db;

  const SQL = await initSqlJs();

  if (existsSync(dbPath)) {
    const buffer = readFileSync(dbPath);
    db = new SQL.Database(buffer);
  } else {
    db = new SQL.Database();
  }

  // Initialize schema
  db.run(`
    CREATE TABLE IF NOT EXISTS price_history (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
      price REAL NOT NULL,
      open REAL,
      high REAL,
      low REAL,
      volume INTEGER
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS signals (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
      signal TEXT NOT NULL,
      price_at_signal REAL NOT NULL,
      technical_score REAL,
      fundamental_score REAL,
      news_score REAL,
      total_score REAL,
      reasoning TEXT,
      price_after_24h REAL,
      price_after_72h REAL,
      outcome TEXT
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS news_cache (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
      title TEXT NOT NULL,
      description TEXT,
      source TEXT,
      url TEXT,
      sentiment REAL,
      published_at DATETIME
    )
  `);

  saveDb();
  return db;
}

function saveDb() {
  if (db) {
    const data = db.export();
    const buffer = Buffer.from(data);
    writeFileSync(dbPath, buffer);
  }
}

export const priceDb = {
  async insert(data) {
    const database = await getDb();
    database.run(
      `INSERT INTO price_history (price, open, high, low, volume) VALUES (?, ?, ?, ?, ?)`,
      [data.price, data.open, data.high, data.low, data.volume]
    );
    saveDb();
  },

  async getRecent(limit = 500) {
    const database = await getDb();
    const result = database.exec(`SELECT * FROM price_history ORDER BY timestamp DESC LIMIT ${limit}`);
    if (result.length === 0) return [];
    return result[0].values.map(row => ({
      id: row[0],
      timestamp: row[1],
      price: row[2],
      open: row[3],
      high: row[4],
      low: row[5],
      volume: row[6]
    }));
  }
};

export const signalDb = {
  async insert(data) {
    const database = await getDb();
    database.run(
      `INSERT INTO signals (signal, price_at_signal, technical_score, fundamental_score, news_score, total_score, reasoning)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [data.signal, data.priceAtSignal, data.technicalScore, data.fundamentalScore, data.newsScore, data.totalScore, data.reasoning]
    );
    saveDb();
  },

  async getRecent(limit = 50) {
    const database = await getDb();
    const result = database.exec(`SELECT * FROM signals ORDER BY timestamp DESC LIMIT ${limit}`);
    if (result.length === 0) return [];
    return result[0].values.map(row => ({
      id: row[0],
      timestamp: row[1],
      signal: row[2],
      price_at_signal: row[3],
      technical_score: row[4],
      fundamental_score: row[5],
      news_score: row[6],
      total_score: row[7],
      reasoning: row[8],
      price_after_24h: row[9],
      price_after_72h: row[10],
      outcome: row[11]
    }));
  },

  async updateOutcome(id, priceAfter24h, priceAfter72h, outcome) {
    const database = await getDb();
    database.run(
      `UPDATE signals SET price_after_24h = ?, price_after_72h = ?, outcome = ? WHERE id = ?`,
      [priceAfter24h, priceAfter72h, outcome, id]
    );
    saveDb();
  },

  async getStats() {
    const database = await getDb();
    const result = database.exec(`
      SELECT
        COUNT(*) as total,
        SUM(CASE WHEN outcome = 'correct' THEN 1 ELSE 0 END) as correct,
        SUM(CASE WHEN outcome = 'incorrect' THEN 1 ELSE 0 END) as incorrect
      FROM signals
      WHERE outcome IS NOT NULL
    `);
    if (result.length === 0) return { total: 0, correct: 0, incorrect: 0 };
    const row = result[0].values[0];
    return {
      total: row[0] || 0,
      correct: row[1] || 0,
      incorrect: row[2] || 0
    };
  }
};

export const newsDb = {
  async insert(news) {
    const database = await getDb();
    database.run(
      `INSERT INTO news_cache (title, description, source, url, sentiment, published_at)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [news.title, news.description, news.source, news.url, news.sentiment, news.publishedAt]
    );
    saveDb();
  },

  async getRecent(limit = 20) {
    const database = await getDb();
    const result = database.exec(`SELECT * FROM news_cache ORDER BY published_at DESC LIMIT ${limit}`);
    if (result.length === 0) return [];
    return result[0].values.map(row => ({
      id: row[0],
      timestamp: row[1],
      title: row[2],
      description: row[3],
      source: row[4],
      url: row[5],
      sentiment: row[6],
      publishedAt: row[7]
    }));
  },

  async clearOld() {
    const database = await getDb();
    database.run(`DELETE FROM news_cache WHERE timestamp < datetime('now', '-7 days')`);
    saveDb();
  }
};

export default { getDb, saveDb };
