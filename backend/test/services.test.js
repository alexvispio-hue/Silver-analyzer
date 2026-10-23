import test from 'node:test';
import assert from 'node:assert/strict';
import { yahooFixture } from './fixtures/market.mjs';
import { RSI, SMA, MACD } from '../src/utils/indicators.js';

process.env.DB_PATH = ':memory:';
process.env.NEWS_API_KEY = '';
process.env.FRED_API_KEY = '';

let quoteRequests = 0;
globalThis.fetch = async url => {
  if (String(url).includes('goldprice.org')) {
    quoteRequests++;
    return new Response('', { status: 403 });
  }
  if (!String(url).includes('finance.yahoo.com/v8/')) return new Response('', { status: 503 });
  return Response.json(yahooFixture(String(url)));
};
const { priceDb, signalDb, default: database } = await import('../src/models/database.js');
const price = await import('../src/services/priceService.js');
const signals = await import('../src/services/signalService.js');
const { getFundamentalData } = await import('../src/services/fundamentalService.js');
const { getNews } = await import('../src/services/newsService.js');

test('RSI handles flat, rising and falling markets; MACD preserves zero', () => {
  assert.equal(RSI(Array(40).fill(10)), 50);
  assert.equal(RSI(Array.from({ length: 40 }, (_, i) => i)), 100);
  assert.equal(RSI(Array.from({ length: 40 }, (_, i) => 40 - i)), 0);
  assert.deepEqual(MACD(Array(40).fill(10)), { macd: 0, signal: 0, histogram: 0 });
  assert.equal(SMA([1, 2], 3), null);
});

test('concurrent database initialization does not lose writes', async () => {
  await Promise.all(Array.from({ length: 20 }, (_, i) => priceDb.insert({ price: i + 1, open: 1, high: 2, low: 1, volume: 0 })));
  assert.equal((await priceDb.getRecent()).length, 20);
  assert.equal((await priceDb.getRecent(-1)).length, 1);
});

test('GoldPrice 403 falls back to identified futures quote and caches it', async () => {
  const result = await price.getCurrentPrice();
  assert.equal(result.price, 30.2);
  assert.equal(result.instrument, 'SI=F');
  assert.equal(result.fallback, true);
  await price.getCurrentPrice();
  assert.equal(quoteRequests, 1);
});

test('blocked primary is skipped after quote cache expires, then retried after cooldown', async () => {
  const realNow = Date.now;
  const start = realNow();
  try {
    Date.now = () => start + 31000;
    const result = await price.getCurrentPrice();
    assert.equal(result.instrument, 'SI=F');
    assert.equal(quoteRequests, 1);
    Date.now = () => start + 3601000;
    await price.getCurrentPrice();
    assert.equal(quoteRequests, 2);
  } finally {
    Date.now = realNow;
  }
});

test('all chart timeframes contain valid OHLC candles; 4h buckets are aligned', async () => {
  for (const timeframe of ['1h', '4h', '1d', '1w']) {
    const data = await price.getChartData(timeframe);
    assert.ok(data.candles.length > 20);
    for (const candle of data.candles) {
      assert.ok(candle.high >= Math.max(candle.open, candle.close));
      assert.ok(candle.low <= Math.min(candle.open, candle.close));
      if (timeframe === '4h') assert.equal(new Date(candle.timestamp).getUTCHours() % 4, 0);
    }
  }
});

test('missing keys do not fabricate news or a Fed rate', async () => {
  assert.deepEqual(await getNews(), []);
  assert.equal((await getFundamentalData()).fedFundsRate.value, null);
});

test('concurrent signal requests persist one signal and return finite scores', async () => {
  const results = await Promise.all(Array.from({ length: 8 }, () => signals.generateSignal()));
  assert.ok(results.every(result => result === results[0]));
  for (const term of ['intraday', 'shortTerm', 'mediumTerm', 'longTerm']) {
    assert.ok(Number.isFinite(results[0][term].score));
  }
  assert.equal((await signalDb.getRecent()).length, 1);
  await signals.generateSignal();
  assert.equal((await signalDb.getRecent()).length, 1);
});

test('outcomes use recorded target prices, preserve missing data and fill 72h results', async () => {
  const db = await database.getDb();
  db.run(`INSERT INTO signals (timestamp, signal, price_at_signal) VALUES
    ('2026-01-01 12:00:00', 'BUY', 30), ('2026-01-05 12:00:00', 'SELL', 30)`);
  db.run(`INSERT INTO price_history (timestamp, price) VALUES
    ('2026-01-02 12:10:00', 31), ('2026-01-04 12:10:00', 32), ('2026-01-07 12:00:00', 50)`);
  await signals.updateSignalOutcomes();
  const rows = await signalDb.getRecent();
  const evaluated = rows.find(row => row.signal === 'BUY');
  assert.equal(evaluated.price_after_24h, 31);
  assert.equal(evaluated.price_after_72h, 32);
  assert.equal(evaluated.outcome, 'correct');
  const missing = rows.find(row => row.signal === 'SELL');
  assert.equal(missing.price_after_24h, null);
  assert.equal(missing.outcome, null);
  const stats = await signals.getSignalStats();
  assert.equal(stats.correctSignals, 1);
  assert.equal(stats.avgChange24h, '3.33');
});
