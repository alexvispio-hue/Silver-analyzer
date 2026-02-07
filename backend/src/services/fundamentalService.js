import axios from 'axios';
import { config } from '../config/config.js';

let cachedData = null;
let lastFetch = 0;

// FRED API series IDs
const FRED_SERIES = {
  fedFundsRate: 'FEDFUNDS',        // Federal Funds Rate
  cpi: 'CPIAUCSL',                 // Consumer Price Index
  dxy: 'DTWEXBGS',                 // Dollar Index (Broad)
  inflation: 'T10YIE',             // 10-Year Breakeven Inflation Rate
  realRates: 'REAINTRATREARAT10Y', // 10-Year Real Interest Rate
  m2: 'M2SL'                       // M2 Money Supply
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

async function fetchFredSeries(seriesId) {
  if (!config.fredApiKey) return null;

  try {
    const response = await axios.get('https://api.stlouisfed.org/fred/series/observations', {
      params: {
        series_id: seriesId,
        api_key: config.fredApiKey,
        file_type: 'json',
        limit: 12,
        sort_order: 'desc'
      }
    });

    if (response.data.observations && response.data.observations.length > 0) {
      return response.data.observations[0];
    }
    return null;
  } catch (error) {
    console.error(`Error fetching FRED series ${seriesId}:`, error.message);
    return null;
  }
}

export async function getFundamentalData() {
  try {
    const now = Date.now();

    // Return cached data if less than 1 hour old
    if (cachedData && now - lastFetch < config.fundamentalUpdateInterval) {
      return cachedData;
    }

    // Fetch FRED data in parallel
    const [fedRate, cpi, inflation] = await Promise.all([
      fetchFredSeries(FRED_SERIES.fedFundsRate),
      fetchFredSeries(FRED_SERIES.cpi),
      fetchFredSeries(FRED_SERIES.inflation)
    ]);

    cachedData = {
      fedFundsRate: {
        value: fedRate ? parseFloat(fedRate.value) : 5.25,
        date: fedRate?.date || 'N/A',
        outlook: 'Rates expected to remain elevated, potential cuts later in 2025'
      },
      inflation: {
        cpi: cpi ? parseFloat(cpi.value) : null,
        breakeven: inflation ? parseFloat(inflation.value) : null,
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
          impact: fedRate && parseFloat(fedRate.value) > 5 ? 'BEARISH' : 'NEUTRAL',
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
    timestamp: new Date().toISOString()
  };
}

export async function getFundamentalScore() {
  const data = await getFundamentalData();

  let score = 0;
  let reasoning = [];

  data.keyFactors.forEach(factor => {
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
  score = Math.max(-100, Math.min(100, score));

  let interpretation = 'NEUTRAL';
  if (score >= 40) interpretation = 'BULLISH';
  else if (score <= -40) interpretation = 'BEARISH';

  return {
    score,
    interpretation,
    reasoning
  };
}
