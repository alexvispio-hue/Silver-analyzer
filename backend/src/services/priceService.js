import { priceDb } from '../models/database.js';

let cachedQuote = null;
let lastUpdate = 0;
const historyPeriodCache = {
  '1mo': { data: [], lastUpdate: 0 },
  '3mo': { data: [], lastUpdate: 0 },
  '6mo': { data: [], lastUpdate: 0 },
  '1y': { data: [], lastUpdate: 0 }
};

// GoldPrice.org API - free, no API key required, real-time COMEX/spot prices
const GOLDPRICE_API = 'https://data-asg.goldprice.org/dbXRates/USD';

// Yahoo Finance direct API for historical data (SI=F = Silver Futures COMEX)
const YAHOO_CHART_API = 'https://query1.finance.yahoo.com/v8/finance/chart/SI=F';

async function fetchYahooHistorical(range = '3mo', interval = '1d') {
  const url = `${YAHOO_CHART_API}?interval=${interval}&range=${range}`;

  const response = await fetch(url, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
    }
  });

  if (!response.ok) {
    throw new Error(`Yahoo Finance API error: ${response.status}`);
  }

  const data = await response.json();

  if (data.chart.error) {
    throw new Error(data.chart.error.description || 'Yahoo Finance error');
  }

  return data.chart.result[0];
}

function buildCandlesFromYahoo(result) {
  const timestamps = result.timestamp || [];
  const quote = result.indicators?.quote?.[0];

  if (!quote || !timestamps.length) return [];

  const candles = [];
  for (let i = 0; i < timestamps.length; i++) {
    const open = quote.open?.[i];
    const high = quote.high?.[i];
    const low = quote.low?.[i];
    const close = quote.close?.[i];
    const volume = quote.volume?.[i];

    if ([open, high, low, close].some((v) => typeof v !== 'number' || !Number.isFinite(v))) {
      continue;
    }

    candles.push({
      timestamp: timestamps[i] * 1000,
      date: new Date(timestamps[i] * 1000).toISOString(),
      open,
      high,
      low,
      close,
      volume: Number.isFinite(volume) ? volume : 0
    });
  }

  return candles;
}

// Кэш для разных таймфреймов
const historyCache = {
  '1h': { data: [], lastUpdate: 0 },
  '4h': { data: [], lastUpdate: 0 },
  '1d': { data: [], lastUpdate: 0 },
  '1w': { data: [], lastUpdate: 0 }
};

// Время жизни кэша для разных интервалов (в мс)
const CACHE_TTL = {
  '1h': 60000,      // 1 минута для часовых
  '4h': 300000,     // 5 минут для 4-часовых
  '1d': 600000,     // 10 минут для дневных
  '1w': 1800000     // 30 минут для недельных
};

export async function getCurrentPrice() {
  try {
    const now = Date.now();

    // Return cached data if less than 30 seconds old (live data updates frequently)
    if (cachedQuote && now - lastUpdate < 30000) {
      return cachedQuote;
    }

    // Fetch live silver price from goldprice.org
    const response = await fetch(GOLDPRICE_API);
    if (!response.ok) {
      throw new Error(`GoldPrice API error: ${response.status}`);
    }

    const data = await response.json();

    if (!data.items || data.items.length === 0) {
      throw new Error('No price data received');
    }

    const item = data.items[0];
    const price = item.xagPrice;           // Current silver price per oz
    const previousClose = item.xagClose;   // Previous close price
    const change = item.chgXag;            // Change in USD
    const changePercent = item.pcXag;      // Change in %

    cachedQuote = {
      price: parseFloat(price.toFixed(4)),
      previousClose: parseFloat(previousClose.toFixed(4)),
      open: parseFloat(previousClose.toFixed(4)), // API doesn't provide open, use previous close
      high: parseFloat(Math.max(price, previousClose).toFixed(4)),
      low: parseFloat(Math.min(price, previousClose).toFixed(4)),
      change: parseFloat(change.toFixed(4)),
      changePercent: parseFloat(changePercent.toFixed(2)),
      volume: null, // Spot price doesn't have volume
      timestamp: new Date(data.ts).toISOString(),
      source: 'GoldPrice.org (COMEX/Spot)'
    };

    lastUpdate = now;

    // Save to database
    await priceDb.insert({
      price: cachedQuote.price,
      open: cachedQuote.open,
      high: cachedQuote.high,
      low: cachedQuote.low,
      volume: cachedQuote.volume
    });

    return cachedQuote;
  } catch (error) {
    console.error('Error fetching live price:', error.message);
    // Return cached data on error
    if (cachedQuote) return cachedQuote;
    throw error;
  }
}

export async function getHistoricalData(period = '3mo') {
  try {
    const now = Date.now();
    const range = ['1mo', '3mo', '6mo', '1y'].includes(period) ? period : '3mo';
    const cache = historyPeriodCache[range];

    // Return cached data for this period if less than 10 minutes old
    if (cache.data.length > 0 && now - cache.lastUpdate < 600000) {
      return cache.data;
    }

    const result = await fetchYahooHistorical(range);
    const candles = buildCandlesFromYahoo(result);

    const history = candles.map((candle) => ({
      date: candle.date.split('T')[0],
      open: candle.open,
      high: candle.high,
      low: candle.low,
      close: candle.close,
      volume: candle.volume
    }));

    cache.data = history;
    cache.lastUpdate = now;
    return history;
  } catch (error) {
    console.error('Error fetching historical data from Yahoo Finance:', error.message);
    const range = ['1mo', '3mo', '6mo', '1y'].includes(period) ? period : '3mo';
    const cache = historyPeriodCache[range];
    if (cache.data.length > 0) return cache.data;
    throw error;
  }
}

// Получение данных с разными таймфреймами свечей
export async function getChartData(timeframe = '1d') {
  try {
    const now = Date.now();
    const cache = historyCache[timeframe];

    // Проверяем кэш
    if (cache && cache.data.length > 0 && now - cache.lastUpdate < CACHE_TTL[timeframe]) {
      return {
        timeframe,
        candles: cache.data,
        cached: true
      };
    }

    // Определяем параметры запроса для Yahoo Finance
    // Yahoo поддерживает: 1m, 2m, 5m, 15m, 30m, 60m, 90m, 1h, 1d, 5d, 1wk, 1mo
    let interval, range;

    switch (timeframe) {
      case '1h':
        interval = '60m';  // Yahoo использует 60m вместо 1h для внутридневных
        range = '5d';      // Максимум 7 дней для минутных/часовых данных
        break;
      case '4h':
        // Yahoo не поддерживает 4h напрямую, будем агрегировать из 1h
        interval = '60m';
        range = '60d';     // Больший период для 4h
        break;
      case '1d':
        interval = '1d';
        range = '6mo';
        break;
      case '1w':
        interval = '1wk';
        range = '2y';
        break;
      default:
        interval = '1d';
        range = '6mo';
    }

    const result = await fetchYahooHistorical(range, interval);
    let candles = buildCandlesFromYahoo(result);

    // Для 4h агрегируем часовые свечи
    if (timeframe === '4h' && candles.length > 0) {
      candles = aggregate4HourCandles(candles);
    }

    // Сохраняем в кэш
    if (historyCache[timeframe]) {
      historyCache[timeframe].data = candles;
      historyCache[timeframe].lastUpdate = now;
    }

    return {
      timeframe,
      timeframeLabel: getTimeframeLabel(timeframe),
      candles,
      count: candles.length,
      cached: false
    };
  } catch (error) {
    console.error(`Error fetching chart data for ${timeframe}:`, error.message);

    // Возвращаем кэш при ошибке
    const cache = historyCache[timeframe];
    if (cache && cache.data.length > 0) {
      return {
        timeframe,
        timeframeLabel: getTimeframeLabel(timeframe),
        candles: cache.data,
        count: cache.data.length,
        cached: true,
        error: error.message
      };
    }
    throw error;
  }
}

// Агрегация часовых свечей в 4-часовые
function aggregate4HourCandles(hourlyCandles) {
  const buckets = new Map();

  for (const candle of hourlyCandles) {
    const bucketTs = Math.floor(candle.timestamp / (4 * 60 * 60 * 1000)) * (4 * 60 * 60 * 1000);
    if (!buckets.has(bucketTs)) buckets.set(bucketTs, []);
    buckets.get(bucketTs).push(candle);
  }

  return [...buckets.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([bucketTs, group]) => createAggregatedCandle(group, bucketTs));
}

// Build one aggregated candle from all candles in a 4-hour bucket.
function createAggregatedCandle(candles, timestamp = candles[0].timestamp) {
  const sorted = [...candles].sort((a, b) => a.timestamp - b.timestamp);
  return {
    timestamp,
    date: new Date(timestamp).toISOString(),
    open: sorted[0].open,
    high: Math.max(...sorted.map(c => c.high)),
    low: Math.min(...sorted.map(c => c.low)),
    close: sorted[sorted.length - 1].close,
    volume: sorted.reduce((sum, c) => sum + (c.volume || 0), 0)
  };
}

function getTimeframeLabel(timeframe) {
  const labels = {
    '1h': '1 час',
    '4h': '4 часа',
    '1d': '1 день',
    '1w': '1 неделя'
  };
  return labels[timeframe] || timeframe;
}

// Получение доступных таймфреймов
export function getAvailableTimeframes() {
  return [
    { id: '1h', label: '1 час', description: 'Часовые свечи (5 дней)' },
    { id: '4h', label: '4 часа', description: '4-часовые свечи (60 дней)' },
    { id: '1d', label: '1 день', description: 'Дневные свечи (6 месяцев)' },
    { id: '1w', label: '1 неделя', description: 'Недельные свечи (2 года)' }
  ];
}

export async function getPriceChanges() {
  try {
    const history = await getHistoricalData('3mo');
    const current = await getCurrentPrice();

    if (history.length === 0) return null;

    const currentPrice = current.price;

    // Find prices at different time points
    const day1 = history.length > 1 ? history[history.length - 2].close : currentPrice;
    const week1 = history.length > 5 ? history[history.length - 6].close : currentPrice;
    const month1 = history.length > 22 ? history[history.length - 23].close : currentPrice;
    const month3 = history.length > 0 ? history[0].close : currentPrice;

    return {
      day: {
        change: currentPrice - day1,
        changePercent: ((currentPrice - day1) / day1) * 100
      },
      week: {
        change: currentPrice - week1,
        changePercent: ((currentPrice - week1) / week1) * 100
      },
      month: {
        change: currentPrice - month1,
        changePercent: ((currentPrice - month1) / month1) * 100
      },
      threeMonths: {
        change: currentPrice - month3,
        changePercent: ((currentPrice - month3) / month3) * 100
      }
    };
  } catch (error) {
    console.error('Error calculating price changes:', error.message);
    return null;
  }
}
