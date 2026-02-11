import axios from 'axios';
import { config } from '../config/config.js';

let cachedData = null;
let lastFetch = 0;

// FRED API series IDs
const FRED_SERIES = {
  fedFundsRate: 'FEDFUNDS',          // Effective Federal Funds Rate
  cpiIndex: 'CPIAUCSL',              // Consumer Price Index (index level)
  inflationBreakeven: 'T10YIE',      // 10-Year Breakeven Inflation Rate
  nonFarmPayrolls: 'PAYEMS',         // Total Nonfarm Payrolls (thousands)
  unemploymentRate: 'UNRATE',        // Unemployment Rate
  retailSales: 'RSAFS',              // Retail and Food Services Sales
  manufacturingPmiProxy: 'BSCICP02USM460S' // Manufacturing confidence (OECD via FRED), PMI proxy
};

// Silver market fundamentals (static data with periodic updates)
const silverMarketData = {
  topProducers: [
    { country: 'Mexico', production: 6300, share: 24.3 },
    { country: 'China', production: 3400, share: 13.1 },
    { country: 'Peru', production: 3100, share: 12.0 },
    { country: 'Chile', production: 1500, share: 5.8 },
    { country: 'Russia', production: 1300, share: 5.0 }
  ],
  topConsumers: [
    { country: 'China', consumption: 5800, share: 22.0 },
    { country: 'India', consumption: 5200, share: 19.7 },
    { country: 'USA', consumption: 4100, share: 15.5 },
    { country: 'Japan', consumption: 2800, share: 10.6 },
    { country: 'Germany', consumption: 1900, share: 7.2 }
  ],
  demandBreakdown: {
    industrial: 50,    // Electronics, solar panels, etc.
    jewelry: 20,
    silverware: 5,
    investment: 20,    // Coins, bars, ETFs
    photography: 5
  },
  supplyDemand: {
    totalSupply: 26000,  // tonnes/year
    totalDemand: 26800,  // tonnes/year
    deficit: 800         // Supply deficit
  }
};

const FOMC_2026_UTC = [
  '2026-01-28T19:00:00Z',
  '2026-03-18T18:00:00Z',
  '2026-04-29T18:00:00Z',
  '2026-06-17T18:00:00Z',
  '2026-07-29T18:00:00Z',
  '2026-09-23T18:00:00Z',
  '2026-11-04T19:00:00Z',
  '2026-12-16T19:00:00Z'
];

const UPCOMING_EVENTS_MONTHS = 4;
const UPCOMING_EVENTS_LIMIT = 8;

function toMoscowLabel(date) {
  return date.toLocaleString('ru-RU', {
    timeZone: 'Europe/Moscow',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function average(values) {
  if (!Array.isArray(values) || values.length === 0) return null;
  return values.reduce((sum, v) => sum + v, 0) / values.length;
}

function parseFredValue(observation) {
  if (!observation) return null;
  const parsed = parseFloat(observation.value);
  return Number.isFinite(parsed) ? parsed : null;
}

function toChronologicalSeries(observations) {
  return (observations || [])
    .map((item) => {
      const value = parseFredValue(item);
      if (!Number.isFinite(value) || !item?.date) return null;
      return { date: item.date, value };
    })
    .filter(Boolean)
    .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
}

function withUnit(formatter, value) {
  if (!Number.isFinite(value)) return null;
  return formatter(value);
}

function buildMomentumMetrics(series, formatter, source, options = {}) {
  if (!Array.isArray(series) || series.length < 2) {
    return {
      forecast: null,
      previous: null,
      actual: null,
      source,
      lastReleaseTime: null
    };
  }

  const latest = series[series.length - 1];
  const previous = series[series.length - 2];
  const deltas = [];
  for (let i = 1; i < series.length; i++) {
    deltas.push(series[i].value - series[i - 1].value);
  }

  const recentDeltas = deltas.slice(-3);
  const avgDelta = average(recentDeltas) ?? 0;
  const weight = Number.isFinite(options.forecastDeltaWeight) ? options.forecastDeltaWeight : 0.8;
  let forecastRaw = latest.value + (avgDelta * weight);

  if (Number.isFinite(options.min)) forecastRaw = Math.max(options.min, forecastRaw);
  if (Number.isFinite(options.max)) forecastRaw = Math.min(options.max, forecastRaw);

  return {
    forecast: withUnit(formatter, forecastRaw),
    previous: withUnit(formatter, previous.value),
    actual: withUnit(formatter, latest.value),
    source,
    lastReleaseTime: latest.date ? new Date(`${latest.date}T00:00:00Z`).toISOString() : null
  };
}

function buildSmoothedMetrics(series, formatter, source, options = {}) {
  if (!Array.isArray(series) || series.length < 2) {
    return {
      forecast: null,
      previous: null,
      actual: null,
      source,
      lastReleaseTime: null
    };
  }

  const latest = series[series.length - 1];
  const previous = series[series.length - 2];
  const recentValues = series.slice(-3).map((item) => item.value);
  let forecastRaw = average(recentValues);

  if (!Number.isFinite(forecastRaw)) forecastRaw = latest.value;
  if (Number.isFinite(options.min)) forecastRaw = Math.max(options.min, forecastRaw);
  if (Number.isFinite(options.max)) forecastRaw = Math.min(options.max, forecastRaw);

  return {
    forecast: withUnit(formatter, forecastRaw),
    previous: withUnit(formatter, previous.value),
    actual: withUnit(formatter, latest.value),
    source,
    lastReleaseTime: latest.date ? new Date(`${latest.date}T00:00:00Z`).toISOString() : null
  };
}

function computeMonthlyChangeSeries(levelSeries) {
  if (!Array.isArray(levelSeries) || levelSeries.length < 2) return [];
  const changes = [];
  for (let i = 1; i < levelSeries.length; i++) {
    const previous = levelSeries[i - 1].value;
    const current = levelSeries[i].value;
    if (!Number.isFinite(previous) || !Number.isFinite(current) || previous === 0) continue;
    changes.push({
      date: levelSeries[i].date,
      value: ((current - previous) / previous) * 100
    });
  }
  return changes;
}

function computePayrollChangeSeries(levelSeries) {
  if (!Array.isArray(levelSeries) || levelSeries.length < 2) return [];
  const changes = [];
  for (let i = 1; i < levelSeries.length; i++) {
    const previous = levelSeries[i - 1].value;
    const current = levelSeries[i].value;
    if (!Number.isFinite(previous) || !Number.isFinite(current)) continue;
    changes.push({
      date: levelSeries[i].date,
      value: current - previous // PAYEMS is in thousands; diff is K jobs
    });
  }
  return changes;
}

function buildEventMetricsFromFred(fredData) {
  const fedFundsSeries = toChronologicalSeries(fredData.fedFundsRate);
  const cpiLevelSeries = toChronologicalSeries(fredData.cpiIndex);
  const nfpLevelSeries = toChronologicalSeries(fredData.nonFarmPayrolls);
  const unemploymentSeries = toChronologicalSeries(fredData.unemploymentRate);
  const retailSalesSeries = toChronologicalSeries(fredData.retailSales);
  const pmiProxySeries = toChronologicalSeries(fredData.manufacturingPmiProxy);

  const cpiMoMSeries = computeMonthlyChangeSeries(cpiLevelSeries);
  const nfpChangeSeries = computePayrollChangeSeries(nfpLevelSeries);
  const retailSalesMoMSeries = computeMonthlyChangeSeries(retailSalesSeries);

  const percentFormatter = (value) => `${value.toFixed(2)}%`;
  const payrollFormatter = (value) => `${Math.round(value)}K`;
  const pmiFormatter = (value) => value.toFixed(1);

  return {
    fomc: buildMomentumMetrics(
      fedFundsSeries,
      percentFormatter,
      'FRED FEDFUNDS',
      { forecastDeltaWeight: 0.6, min: 0, max: 10 }
    ),
    cpi: buildSmoothedMetrics(
      cpiMoMSeries,
      percentFormatter,
      'FRED CPIAUCSL (MoM calc)',
      { min: -2, max: 3 }
    ),
    nfp: buildSmoothedMetrics(
      nfpChangeSeries,
      payrollFormatter,
      'FRED PAYEMS (MoM change)',
      { min: -500, max: 500 }
    ),
    unemployment: buildSmoothedMetrics(
      unemploymentSeries,
      percentFormatter,
      'FRED UNRATE',
      { min: 2, max: 20 }
    ),
    pmi: buildSmoothedMetrics(
      pmiProxySeries,
      pmiFormatter,
      'FRED BSCICP02USM460S (PMI proxy)',
      { min: -50, max: 50 }
    ),
    retail: buildSmoothedMetrics(
      retailSalesMoMSeries,
      percentFormatter,
      'FRED RSAFS (MoM calc)',
      { min: -5, max: 5 }
    )
  };
}

function firstWeekdayOfMonth(year, month, weekday) {
  const date = new Date(Date.UTC(year, month, 1, 13, 30, 0));
  while (date.getUTCDay() !== weekday) {
    date.setUTCDate(date.getUTCDate() + 1);
  }
  return date;
}

function cpiDateOfMonth(year, month) {
  const date = new Date(Date.UTC(year, month, 13, 13, 30, 0));
  while (date.getUTCDay() === 0 || date.getUTCDay() === 6) {
    date.setUTCDate(date.getUTCDate() + 1);
  }
  return date;
}

function retailSalesDateOfMonth(year, month) {
  const date = new Date(Date.UTC(year, month, 15, 13, 30, 0));
  while (date.getUTCDay() === 0 || date.getUTCDay() === 6) {
    date.setUTCDate(date.getUTCDate() + 1);
  }
  return date;
}

function firstBusinessDayOfMonth(year, month) {
  const date = new Date(Date.UTC(year, month, 1, 15, 0, 0));
  while (date.getUTCDay() === 0 || date.getUTCDay() === 6) {
    date.setUTCDate(date.getUTCDate() + 1);
  }
  return date;
}

function buildBaseUpcomingUseventsMsk() {
  const now = new Date();
  const events = [];

  for (const iso of FOMC_2026_UTC) {
    const dt = new Date(iso);
    if (dt >= now) {
      events.push({
        type: 'fomc',
        event: 'FOMC Rate Decision (US)',
        timestamp: dt.toISOString(),
        mskTime: toMoscowLabel(dt)
      });
    }
  }

  for (let m = 0; m < UPCOMING_EVENTS_MONTHS; m++) {
    const target = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + m, 1));
    const y = target.getUTCFullYear();
    const mon = target.getUTCMonth();

    const nfp = firstWeekdayOfMonth(y, mon, 5); // Friday
    const pmi = firstBusinessDayOfMonth(y, mon);
    const cpi = cpiDateOfMonth(y, mon);
    const retail = retailSalesDateOfMonth(y, mon);

    const candidates = [
      { type: 'pmi', event: 'Manufacturing PMI (US)', dt: pmi },
      { type: 'nfp', event: 'Non-Farm Payrolls (US)', dt: nfp },
      { type: 'unemployment', event: 'Unemployment Rate (US)', dt: nfp },
      { type: 'cpi', event: 'CPI Inflation (US)', dt: cpi },
      { type: 'retail', event: 'Retail Sales (US)', dt: retail }
    ];

    for (const item of candidates) {
      if (item.dt >= now) {
        events.push({
          type: item.type,
          event: item.event,
          timestamp: item.dt.toISOString(),
          mskTime: toMoscowLabel(item.dt)
        });
      }
    }
  }

  return events
    .sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime())
    .slice(0, UPCOMING_EVENTS_LIMIT);
}

function mergeEventMetrics(baseEvents, metricsByType) {
  const nowTs = Date.now();

  return [...(baseEvents || [])]
    .filter((eventItem) => {
      const ts = new Date(eventItem.timestamp).getTime();
      return Number.isFinite(ts) && ts >= nowTs;
    })
    .sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime())
    .slice(0, UPCOMING_EVENTS_LIMIT)
    .map((eventItem) => {
    const metrics = metricsByType?.[eventItem.type] || {};
    const eventTs = new Date(eventItem.timestamp).getTime();
    const isFutureEvent = Number.isFinite(eventTs) ? eventTs > nowTs : true;

    // For upcoming events:
    // - previous = last published actual
    // - actual = not known yet
    const previousValue = isFutureEvent
      ? (metrics.actual || metrics.previous || null)
      : (metrics.previous || null);
    const actualValue = isFutureEvent ? null : (metrics.actual || null);

    return {
      event: eventItem.event,
      timestamp: eventItem.timestamp,
      mskTime: eventItem.mskTime,
      forecast: metrics.forecast || null,
      previous: previousValue,
      actual: actualValue,
      source: metrics.source || null,
      lastReleaseTime: metrics.lastReleaseTime || null
    };
    });
}

async function fetchFredSeries(seriesId, limit = 24) {
  if (!config.fredApiKey) return [];

  try {
    const response = await axios.get('https://api.stlouisfed.org/fred/series/observations', {
      params: {
        series_id: seriesId,
        api_key: config.fredApiKey,
        file_type: 'json',
        limit,
        sort_order: 'desc'
      }
    });

    return Array.isArray(response.data?.observations) ? response.data.observations : [];
  } catch (error) {
    console.error(`Error fetching FRED series ${seriesId}:`, error.message);
    return [];
  }
}

function buildDefaultUpcomingEvents() {
  return buildBaseUpcomingUseventsMsk().map((eventItem) => ({
    event: eventItem.event,
    timestamp: eventItem.timestamp,
    mskTime: eventItem.mskTime,
    forecast: null,
    previous: null,
    actual: null,
    source: null,
    lastReleaseTime: null
  }));
}

export async function getFundamentalData() {
  try {
    const now = Date.now();

    // Return cached data if less than 1 hour old
    if (cachedData && now - lastFetch < config.fundamentalUpdateInterval) {
      return cachedData;
    }

    // Fetch FRED data in parallel
    const [fedRateObs, cpiObs, inflationObs, nfpObs, unemploymentObs, retailObs, pmiProxyObs] = await Promise.all([
      fetchFredSeries(FRED_SERIES.fedFundsRate, 24),
      fetchFredSeries(FRED_SERIES.cpiIndex, 24),
      fetchFredSeries(FRED_SERIES.inflationBreakeven, 24),
      fetchFredSeries(FRED_SERIES.nonFarmPayrolls, 24),
      fetchFredSeries(FRED_SERIES.unemploymentRate, 24),
      fetchFredSeries(FRED_SERIES.retailSales, 24),
      fetchFredSeries(FRED_SERIES.manufacturingPmiProxy, 24)
    ]);

    const fedRate = fedRateObs[0] || null;
    const cpi = cpiObs[0] || null;
    const inflation = inflationObs[0] || null;

    const eventMetrics = buildEventMetricsFromFred({
      fedFundsRate: fedRateObs,
      cpiIndex: cpiObs,
      nonFarmPayrolls: nfpObs,
      unemploymentRate: unemploymentObs,
      retailSales: retailObs,
      manufacturingPmiProxy: pmiProxyObs
    });

    const upcomingEvents = mergeEventMetrics(buildBaseUpcomingUseventsMsk(), eventMetrics);

    const fedRateValue = parseFredValue(fedRate);

    cachedData = {
      fedFundsRate: {
        value: Number.isFinite(fedRateValue) ? fedRateValue : 5.25,
        date: fedRate?.date || 'N/A',
        outlook: 'Rates expected to remain elevated, potential cuts later in 2025'
      },
      inflation: {
        cpi: parseFredValue(cpi),
        breakeven: parseFredValue(inflation),
        outlook: 'Inflation remains above Fed target, supportive for silver'
      },
      dollarIndex: {
        outlook: 'Dollar strength creates headwind for silver prices'
      },
      silverMarket: silverMarketData,
      keyFactors: [
        {
          factor: 'Industrial Demand',
          impact: 'BULLISH',
          description: 'Growing demand from solar panel and EV production'
        },
        {
          factor: 'Supply Deficit',
          impact: 'BULLISH',
          description: `Market in deficit of ${silverMarketData.supplyDemand.deficit} tonnes`
        },
        {
          factor: 'Fed Policy',
          impact: Number.isFinite(fedRateValue) && fedRateValue > 5 ? 'BEARISH' : 'NEUTRAL',
          description: 'Higher rates reduce appeal of non-yielding assets'
        },
        {
          factor: 'Inflation Hedge',
          impact: 'BULLISH',
          description: 'Silver historically performs well during inflationary periods'
        },
        {
          factor: 'Geopolitical Risk',
          impact: 'BULLISH',
          description: 'Global uncertainties increase safe-haven demand'
        }
      ],
      upcomingEvents,
      timestamp: new Date().toISOString()
    };

    lastFetch = now;
    return cachedData;
  } catch (error) {
    console.error('Fundamental data error:', error.message);
    return cachedData || getDefaultFundamentals();
  }
}

function getDefaultFundamentals() {
  return {
    fedFundsRate: { value: 5.25, outlook: 'Rates elevated' },
    inflation: { outlook: 'Above target' },
    dollarIndex: { outlook: 'Mixed signals' },
    silverMarket: silverMarketData,
    keyFactors: [
      { factor: 'Industrial Demand', impact: 'BULLISH', description: 'Growing solar/EV demand' },
      { factor: 'Supply Deficit', impact: 'BULLISH', description: 'Market undersupplied' },
      { factor: 'Fed Policy', impact: 'NEUTRAL', description: 'Rate path uncertain' }
    ],
    upcomingEvents: buildDefaultUpcomingEvents(),
    timestamp: new Date().toISOString()
  };
}

export async function getFundamentalScore() {
  const data = await getFundamentalData();

  let score = 0;
  const reasoning = [];

  data.keyFactors.forEach((factor) => {
    switch (factor.impact) {
      case 'BULLISH':
        score += 20;
        reasoning.push(`${factor.factor}: ${factor.description}`);
        break;
      case 'BEARISH':
        score -= 20;
        reasoning.push(`${factor.factor}: ${factor.description}`);
        break;
    }
  });

  // Cap score at -100 to +100
  score = clamp(score, -100, 100);

  let interpretation = 'NEUTRAL';
  if (score >= 40) interpretation = 'BULLISH';
  else if (score <= -40) interpretation = 'BEARISH';

  return {
    score,
    interpretation,
    reasoning
  };
}
