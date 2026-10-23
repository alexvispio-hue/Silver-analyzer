import { config } from '../config/config.js';

const SERIES = {
  fedFundsRate: 'FEDFUNDS', cpi: 'CPIAUCSL', breakeven: 'T10YIE',
  unemployment: 'UNRATE', payrolls: 'PAYEMS', retail: 'RSAFS'
};
let cachedData;
let lastFetch = 0;
let pending;

export async function fetchFredSeries(seriesId, limit = 24) {
  if (config.fredApiKey) {
    try {
      const url = new URL('https://api.stlouisfed.org/fred/series/observations');
      url.search = new URLSearchParams({
        series_id: seriesId, api_key: config.fredApiKey,
        file_type: 'json', limit: String(limit), sort_order: 'desc'
      });
      const response = await fetch(url, { signal: AbortSignal.timeout(10000) });
      if (!response.ok) throw new Error('FRED API unavailable');
      const data = await response.json();
      if (!Array.isArray(data.observations)) throw new Error('Invalid FRED data');
      return normalize(data.observations);
    } catch {
      console.warn('FRED API unavailable for', seriesId, '— trying public CSV');
    }
  }
  try {
    const url = new URL('https://fred.stlouisfed.org/graph/fredgraph.csv');
    url.search = new URLSearchParams({
      id: seriesId, cosd: new Date(Date.now() - 2 * 366 * 86400000).toISOString().slice(0, 10)
    });
    const response = await fetch(url, { signal: AbortSignal.timeout(10000) });
    if (!response.ok) throw new Error('FRED CSV unavailable');
    const csv = await response.text();
    if (!csv.startsWith('observation_date,') && !csv.startsWith('DATE,')) throw new Error('Invalid CSV');
    return normalize(csv.trim().split(/\r?\n/).slice(1).map(line => {
      const [date, value] = line.split(',');
      return { date, value };
    })).slice(-limit);
  } catch {
    console.warn('FRED data unavailable for', seriesId);
    return [];
  }
}

function normalize(observations) {
  return observations.map(item => ({ date: item.date, value: Number.parseFloat(item.value) }))
    .filter(item => /^\d{4}-\d{2}-\d{2}$/.test(item.date) && Number.isFinite(item.value))
    .sort((a, b) => a.date.localeCompare(b.date));
}

function metric(series, id, unit) {
  const latest = series.at(-1);
  return {
    value: latest?.value ?? null, previous: series.at(-2)?.value ?? null,
    date: latest?.date ?? null, unit, source: 'FRED ' + id,
    url: 'https://fred.stlouisfed.org/series/' + id
  };
}

async function loadData() {
  const entries = await Promise.all(Object.entries(SERIES).map(async ([key, id]) =>
    [key, await fetchFredSeries(id)]));
  const series = Object.fromEntries(entries);
  const rate = metric(series.fedFundsRate, SERIES.fedFundsRate, '%');
  const cpi = metric(series.cpi, SERIES.cpi, 'индекс');
  const previousYear = series.cpi.find(item => item.date ===
    (Number(cpi.date?.slice(0, 4)) - 1) + cpi.date?.slice(4));
  const inflationYoy = previousYear && cpi.value != null
    ? (cpi.value / previousYear.value - 1) * 100 : null;
  const payrolls = metric(series.payrolls, SERIES.payrolls, 'тыс.');
  const retail = metric(series.retail, SERIES.retail, 'млн $');
  const factors = [];
  if (rate.value != null && rate.previous != null) {
    const change = rate.value - rate.previous;
    factors.push({
      factor: 'Изменение ставки ФРС', impact: change < 0 ? 'BULLISH' : change > 0 ? 'BEARISH' : 'NEUTRAL',
      description: rate.previous.toFixed(2) + '% → ' + rate.value.toFixed(2) + '%; ' + rate.date,
      source: rate.source
    });
  }
  const data = {
    fedFundsRate: { ...rate, outlook: rate.value == null ? 'Источник недоступен' : 'Эффективная ставка; месячное значение FRED' },
    inflation: {
      cpi: cpi.value, yoy: inflationYoy, date: cpi.date,
      breakeven: metric(series.breakeven, SERIES.breakeven, '%').value
    },
    metrics: {
      cpi, inflationYoy: { ...cpi, value: inflationYoy, unit: '% г/г' },
      breakeven: metric(series.breakeven, SERIES.breakeven, '%'),
      unemployment: metric(series.unemployment, SERIES.unemployment, '%'),
      payrollsChange: { ...payrolls, value: payrolls.value != null && payrolls.previous != null ? payrolls.value - payrolls.previous : null, unit: 'тыс. рабочих мест' },
      retailChange: { ...retail, value: retail.value != null && retail.previous > 0 ? (retail.value / retail.previous - 1) * 100 : null, unit: '% м/м' }
    },
    keyFactors: factors,
    upcomingEvents: [],
    calendarStatus: 'Календарный провайдер не подключён; предполагаемые даты и консенсус не отображаются.',
    timestamp: new Date().toISOString()
  };
  const hasValues = Object.values(series).some(values => values.length);
  if (!hasValues && cachedData) return { ...cachedData, stale: true };
  if (hasValues) cachedData = data;
  lastFetch = Date.now();
  return data;
}

export async function getFundamentalData() {
  if (cachedData && Date.now() - lastFetch < config.fundamentalUpdateInterval) return cachedData;
  if (!pending) pending = loadData().finally(() => { pending = null; });
  return pending;
}

export async function getFundamentalScore() {
  const data = await getFundamentalData();
  const factor = data.keyFactors[0];
  const score = factor?.impact === 'BULLISH' ? 20 : factor?.impact === 'BEARISH' ? -20 : 0;
  return {
    score, interpretation: score > 0 ? 'BULLISH' : score < 0 ? 'BEARISH' : 'NEUTRAL',
    available: data.fedFundsRate.value != null,
    reasoning: factor ? [factor.factor + ': ' + factor.description] : ['Макроданные недоступны; фундаментальная оценка не рассчитана']
  };
}
