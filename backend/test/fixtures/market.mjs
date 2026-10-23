// Fixed synthetic market, never presented as current or downloaded market data.
export const demoTime = Date.parse('2026-01-16T20:00:00Z');

export function yahooFixture(url) {
  const params = new URL(url).searchParams;
  const interval = params.get('interval');
  const range = params.get('range');
  const step = interval === '60m' ? 3600000 : interval === '1wk' ? 7 * 86400000 : 86400000;
  const count = interval === '60m' ? (range === '5d' ? 120 : 1440)
    : interval === '1wk' ? 104 : ({ '1mo': 30, '3mo': 90, '6mo': 180, '1y': 365 }[range] || 5);
  const timestamps = Array.from({ length: count }, (_, i) => demoTime - (count - 1 - i) * step);
  const candles = timestamps.map((ts, i) => {
    const t = (ts - demoTime) / 86400000;
    const close = 30 + t * 0.012 + Math.sin(t * 0.4) * 0.8 + Math.cos(t * 1.2) * 0.2;
    const open = close + Math.sin(i * 1.7) * 0.15;
    return { open, close, high: Math.max(open, close) + 0.22, low: Math.min(open, close) - 0.22, volume: 1000 + (i * 137) % 4000 };
  });
  return { chart: { error: null, result: [{
    meta: { regularMarketPrice: 30.2, chartPreviousClose: 30, regularMarketTime: demoTime / 1000 },
    timestamp: timestamps.map(t => t / 1000),
    indicators: { quote: [Object.fromEntries(['open', 'high', 'low', 'close', 'volume'].map(key => [key, candles.map(c => c[key])]))] }
  }] } };
}
