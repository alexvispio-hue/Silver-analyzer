import test from 'node:test';
import assert from 'node:assert/strict';

process.env.DB_PATH = ':memory:';
process.env.FRED_API_KEY = 'test-key';
process.env.NEWS_PROVIDER = 'yahoo';
let calls = [];
globalThis.fetch = async (input) => {
  const url = new URL(input);
  calls.push(url.hostname);
  if (url.hostname === 'api.stlouisfed.org') return new Response('', { status: 503 });
  if (url.hostname === 'fred.stlouisfed.org') {
    const id = url.searchParams.get('id');
    const data = {
      FEDFUNDS: [['2026-08-01', '4.0'], ['2026-09-01', '3.75']],
      CPIAUCSL: [['2025-09-01', '100'], ['2026-08-01', '102'], ['2026-09-01', '103']],
      T10YIE: [['2026-10-20', '.'], ['2026-10-21', '2.3']],
      UNRATE: [['2026-08-01', '4'], ['2026-09-01', '4.2']],
      PAYEMS: [['2026-08-01', '1000'], ['2026-09-01', '1050']],
      RSAFS: [['2026-08-01', '200'], ['2026-09-01', '202']]
    };
    return new Response('observation_date,' + id + '\n' + data[id].map(row => row.join(',')).join('\n'));
  }
  if (url.hostname === 'finance.yahoo.com') return new Response(`<?xml version="1.0"?><rss><channel><item>
    <title>Silver demand &amp; prices rise</title><link>https://finance.yahoo.com/news/silver</link>
    <pubDate>Fri, 23 Oct 2026 10:00:00 GMT</pubDate></item>
    <item><title>Invalid item</title><link>javascript:alert(1)</link><pubDate>invalid</pubDate></item>
    </channel></rss>`);
  throw new Error('Unexpected provider');
};
const { getFundamentalData, getFundamentalScore } = await import('../src/services/fundamentalService.js');
const { getNews } = await import('../src/services/newsService.js');

test('FRED CSV fallback provides observed values and calculated changes without static factors', async () => {
  const data = await getFundamentalData();
  assert.equal(data.fedFundsRate.value, 3.75);
  assert.ok(Math.abs(data.metrics.inflationYoy.value - 3) < 1e-9);
  assert.equal(data.metrics.payrollsChange.value, 50);
  assert.ok(Math.abs(data.metrics.retailChange.value - 1) < 1e-9);
  assert.equal(data.metrics.breakeven.value, 2.3);
  assert.equal(data.silverMarket, undefined);
  assert.deepEqual(data.upcomingEvents, []);
  assert.equal(data.keyFactors.length, 1);
  assert.equal((await getFundamentalScore()).score, 20);
  assert.ok(calls.includes('api.stlouisfed.org'));
  assert.ok(calls.includes('fred.stlouisfed.org'));
});

test('RSS news keeps actual headline, link and publication time; rejects malformed entries', async () => {
  const news = await getNews();
  assert.equal(news.length, 1);
  assert.equal(news[0].title, 'Silver demand & prices rise');
  assert.equal(news[0].publishedAt, '2026-10-23T10:00:00.000Z');
  assert.equal(news[0].source, 'Yahoo Finance RSS');
  assert.equal(news[0].url, 'https://finance.yahoo.com/news/silver');
  await getNews();
  assert.equal(calls.filter(host => host === 'finance.yahoo.com').length, 1);
});
