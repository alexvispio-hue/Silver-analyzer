import { getTechnicalAnalysis } from './technicalAnalysis.js';
import { getFundamentalScore } from './fundamentalService.js';
import { getNewsSentiment } from './newsService.js';
import { getCurrentPrice, getChartData } from './priceService.js';
import { RSI, MACD, EMA, SMA } from '../utils/indicators.js';
import { signalDb } from '../models/database.js';

const SIGNALS = {
  STRONG_BUY: 'STRONG_BUY',
  BUY: 'BUY',
  HOLD: 'HOLD',
  SELL: 'SELL',
  STRONG_SELL: 'STRONG_SELL'
};

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function round(value, digits = 2) {
  if (!Number.isFinite(value)) return null;
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

function averageTrueRangePercent(candles, period = 14) {
  if (!Array.isArray(candles) || candles.length < period + 1) return null;

  const recent = candles.slice(-(period + 1));
  const ranges = [];

  for (let i = 1; i < recent.length; i++) {
    const current = recent[i];
    const previous = recent[i - 1];
    if (![current?.high, current?.low, previous?.close].every(Number.isFinite) || previous.close <= 0) {
      continue;
    }

    const trueRange = Math.max(
      current.high - current.low,
      Math.abs(current.high - previous.close),
      Math.abs(current.low - previous.close)
    );

    ranges.push((trueRange / previous.close) * 100);
  }

  if (!ranges.length) return null;
  return ranges.reduce((sum, value) => sum + value, 0) / ranges.length;
}

function getLevelDistancePercent(price, level, direction) {
  if (!Number.isFinite(price) || !Number.isFinite(level) || price <= 0) return null;

  if (direction === 'up' && level > price) {
    return ((level - price) / price) * 100;
  }

  if (direction === 'down' && level < price) {
    return ((price - level) / price) * 100;
  }

  return null;
}

function buildIntradayTradePlan(signal, score, price, candles1h, candles4h, levels = {}) {
  if (!Number.isFinite(price) || price <= 0) return null;

  const isLong = signal?.includes('BUY');
  const isShort = signal?.includes('SELL');
  const atr1hPct = averageTrueRangePercent(candles1h, 14);
  const atr4hPct = averageTrueRangePercent(candles4h, 14);
  const rawVolatility = Number.isFinite(atr1hPct)
    ? atr1hPct
    : (Number.isFinite(atr4hPct) ? atr4hPct * 0.55 : 0.8);
  const volatilityPct = clamp(rawVolatility, 0.25, 2.2);

  if (!isLong && !isShort) {
    const breakoutTriggerPct = round(clamp(volatilityPct * 0.9, 0.25, 1.4), 2);
    return {
      direction: 'WAIT',
      breakoutUpPercent: breakoutTriggerPct,
      breakoutDownPercent: breakoutTriggerPct,
      note: 'No directional edge. Wait for breakout confirmation.',
      timeWindow: '1-4h'
    };
  }

  const confidence = clamp(Math.abs(Number.isFinite(score) ? score : 0) / 100, 0, 1);
  let takeProfitPct = clamp(volatilityPct * (1.35 + confidence * 0.85), 0.45, 3.2);
  let stopLossPct = clamp(takeProfitPct * (0.50 - confidence * 0.10), 0.25, 1.7);

  const supports = (levels.support || []).filter(Number.isFinite);
  const resistances = (levels.resistance || []).filter(Number.isFinite);
  const nearestSupport = supports.length ? Math.max(...supports.filter((level) => level < price)) : null;
  const nearestResistance = resistances.length ? Math.min(...resistances.filter((level) => level > price)) : null;

  if (isLong) {
    const tpCap = getLevelDistancePercent(price, nearestResistance, 'up');
    const slCap = getLevelDistancePercent(price, nearestSupport, 'down');
    if (Number.isFinite(tpCap) && tpCap > 0.25) {
      takeProfitPct = Math.min(takeProfitPct, tpCap * 0.92);
    }
    if (Number.isFinite(slCap) && slCap > 0.2) {
      stopLossPct = Math.min(stopLossPct, slCap * 0.88);
    }
  } else if (isShort) {
    const tpCap = getLevelDistancePercent(price, nearestSupport, 'down');
    const slCap = getLevelDistancePercent(price, nearestResistance, 'up');
    if (Number.isFinite(tpCap) && tpCap > 0.25) {
      takeProfitPct = Math.min(takeProfitPct, tpCap * 0.92);
    }
    if (Number.isFinite(slCap) && slCap > 0.2) {
      stopLossPct = Math.min(stopLossPct, slCap * 0.88);
    }
  }

  takeProfitPct = clamp(takeProfitPct, 0.35, 3.2);
  stopLossPct = clamp(stopLossPct, 0.2, 1.9);
  if (takeProfitPct / stopLossPct < 1.4) {
    stopLossPct = clamp(takeProfitPct / 1.4, 0.2, 1.9);
  }

  const takeProfitPrice = isLong
    ? price * (1 + (takeProfitPct / 100))
    : price * (1 - (takeProfitPct / 100));
  const stopLossPrice = isLong
    ? price * (1 - (stopLossPct / 100))
    : price * (1 + (stopLossPct / 100));

  return {
    direction: isLong ? 'LONG' : 'SHORT',
    entryPrice: round(price, 4),
    takeProfitPercent: round(takeProfitPct, 2),
    stopLossPercent: round(stopLossPct, 2),
    takeProfitPrice: round(takeProfitPrice, 4),
    stopLossPrice: round(stopLossPrice, 4),
    riskRewardRatio: round(takeProfitPct / stopLossPct, 2),
    volatilityContextPercent: round(volatilityPct, 2),
    timeWindow: '1-4h'
  };
}

function classifySignal(score, thresholds = { buy: 35, strongBuy: 55, sell: -35, strongSell: -55 }) {
  if (score >= thresholds.strongBuy) return SIGNALS.STRONG_BUY;
  if (score >= thresholds.buy) return SIGNALS.BUY;
  if (score <= thresholds.strongSell) return SIGNALS.STRONG_SELL;
  if (score <= thresholds.sell) return SIGNALS.SELL;
  return SIGNALS.HOLD;
}

function buildIntradaySnapshot(candles) {
  const closes = (candles || []).map((c) => c.close).filter(Number.isFinite);
  if (closes.length < 35) return null;

  return {
    rsi: RSI(closes, 14),
    macd: MACD(closes),
    ema20: EMA(closes, 20),
    sma50: SMA(closes, 50),
    lastClose: closes[closes.length - 1]
  };
}

function applyRsiScore(rsi, weight, label, reasoning) {
  if (!Number.isFinite(rsi)) return 0;
  if (rsi < 28) {
    reasoning.push(`${label}: RSI ${rsi.toFixed(1)} (oversold)`);
    return weight;
  }
  if (rsi < 38) {
    reasoning.push(`${label}: RSI ${rsi.toFixed(1)} (near oversold)`);
    return Math.round(weight * 0.55);
  }
  if (rsi > 72) {
    reasoning.push(`${label}: RSI ${rsi.toFixed(1)} (overbought)`);
    return -weight;
  }
  if (rsi > 62) {
    reasoning.push(`${label}: RSI ${rsi.toFixed(1)} (near overbought)`);
    return -Math.round(weight * 0.55);
  }
  return 0;
}

function applyMacdScore(macd, weight, label, reasoning) {
  if (!macd || !Number.isFinite(macd.histogram)) return 0;
  if (macd.histogram > 0 && macd.macd > macd.signal) {
    reasoning.push(`${label}: MACD bullish`);
    return weight;
  }
  if (macd.histogram < 0 && macd.macd < macd.signal) {
    reasoning.push(`${label}: MACD bearish`);
    return -weight;
  }
  return 0;
}

async function generateIntradaySignal(technicalData, fundamentalData, newsData, priceData, candles1h, candles4h) {
  const oneHour = buildIntradaySnapshot(candles1h);
  const fourHour = buildIntradaySnapshot(candles4h);
  const reasoning = [];

  let techScore = 0;
  if (oneHour) {
    techScore += applyRsiScore(oneHour.rsi, 24, '1H', reasoning);
    techScore += applyMacdScore(oneHour.macd, 16, '1H', reasoning);

    if (Number.isFinite(oneHour.ema20)) {
      const above = priceData.price >= oneHour.ema20;
      techScore += above ? 10 : -10;
      reasoning.push(`1H: price ${above ? 'above' : 'below'} EMA20`);
    }
  }

  if (fourHour) {
    techScore += applyRsiScore(fourHour.rsi, 20, '4H', reasoning);
    techScore += applyMacdScore(fourHour.macd, 14, '4H', reasoning);
  }

  if (Number.isFinite(technicalData.indicators?.sma100)) {
    const above = priceData.price >= technicalData.indicators.sma100;
    techScore += above ? 8 : -8;
  }

  if (Number.isFinite(technicalData.indicators?.sma200)) {
    const above = priceData.price >= technicalData.indicators.sma200;
    techScore += above ? 12 : -12;
    reasoning.push(`Daily: price ${above ? 'above' : 'below'} SMA200`);
  }

  const nearestSupportZone = technicalData.volumeClusters?.support?.[0];
  const nearestResistanceZone = technicalData.volumeClusters?.resistance?.[0];

  if (nearestSupportZone) {
    const distance = Math.abs((priceData.price - nearestSupportZone.center) / priceData.price);
    if (distance < 0.015) {
      techScore += 10;
      reasoning.push(`Near support cluster ${nearestSupportZone.low}-${nearestSupportZone.high}`);
    }
  }

  if (nearestResistanceZone) {
    const distance = Math.abs((nearestResistanceZone.center - priceData.price) / priceData.price);
    if (distance < 0.015) {
      techScore -= 10;
      reasoning.push(`Near resistance cluster ${nearestResistanceZone.low}-${nearestResistanceZone.high}`);
    }
  }

  const totalScore = (techScore * 0.65) + (newsData.score * 0.25) + (fundamentalData.score * 0.10);
  const intradaySignal = classifySignal(totalScore, { buy: 30, strongBuy: 52, sell: -30, strongSell: -52 });
  const tradePlan = buildIntradayTradePlan(
    intradaySignal,
    totalScore,
    priceData.price,
    candles1h,
    candles4h,
    technicalData.levels
  );

  if (newsData.score > 25) reasoning.push('Positive news flow');
  else if (newsData.score < -25) reasoning.push('Negative news flow');

  if (tradePlan?.direction === 'LONG') {
    reasoning.unshift(`Plan 1-4h: TP +${tradePlan.takeProfitPercent}% / SL -${tradePlan.stopLossPercent}%`);
  } else if (tradePlan?.direction === 'SHORT') {
    reasoning.unshift(`Plan 1-4h: TP -${tradePlan.takeProfitPercent}% / SL +${tradePlan.stopLossPercent}%`);
  } else if (tradePlan?.direction === 'WAIT') {
    reasoning.unshift(`Plan 1-4h: wait for breakout +/-${tradePlan.breakoutUpPercent}%`);
  }

  return {
    timeframe: 'intraday',
    timeframeLabel: '1-4 часа',
    signal: intradaySignal,
    score: parseFloat(totalScore.toFixed(2)),
    reasoning: reasoning.slice(0, 5),
    tradePlan,
    components: {
      technical: { score: parseFloat(techScore.toFixed(2)), weight: 0.65 },
      news: { score: newsData.score, weight: 0.25 },
      fundamental: { score: fundamentalData.score, weight: 0.10 }
    }
  };
}

async function generateShortTermSignal(technicalData, fundamentalData, newsData) {
  let techScore = 0;
  const reasoning = [];

  if (technicalData.indicators?.rsi !== null) {
    const rsi = technicalData.indicators.rsi;
    if (rsi < 30) {
      techScore += 30;
      reasoning.push('RSI oversold');
    } else if (rsi > 70) {
      techScore -= 30;
      reasoning.push('RSI overbought');
    } else if (rsi < 40) {
      techScore += 12;
    } else if (rsi > 60) {
      techScore -= 12;
    }
  }

  if (technicalData.indicators?.macd?.histogram !== null && technicalData.indicators?.macd?.histogram !== undefined) {
    if (technicalData.indicators.macd.histogram > 0) {
      techScore += 18;
      reasoning.push('MACD positive');
    } else {
      techScore -= 18;
      reasoning.push('MACD negative');
    }
  }

  const totalScore = (techScore * 0.55) + (newsData.score * 0.30) + (fundamentalData.score * 0.15);

  if (newsData.score > 20) reasoning.push('Supportive news background');
  else if (newsData.score < -20) reasoning.push('Negative news background');

  return {
    timeframe: 'short',
    timeframeLabel: '4-24 часа',
    signal: classifySignal(totalScore),
    score: parseFloat(totalScore.toFixed(2)),
    reasoning: reasoning.slice(0, 4),
    components: {
      technical: { score: parseFloat(techScore.toFixed(2)), weight: 0.55 },
      news: { score: newsData.score, weight: 0.30 },
      fundamental: { score: fundamentalData.score, weight: 0.15 }
    }
  };
}

async function generateMediumTermSignal(technicalData, newsData) {
  const techScore = technicalData.score;
  const totalScore = (techScore * 0.70) + (newsData.score * 0.30);

  const reasoning = [];
  if (technicalData.trend === 'UPTREND') reasoning.push('Uptrend');
  else if (technicalData.trend === 'DOWNTREND') reasoning.push('Downtrend');

  if (technicalData.indicators?.sma20 > technicalData.indicators?.sma50) {
    reasoning.push('SMA20 above SMA50');
  } else if (technicalData.indicators?.sma20 < technicalData.indicators?.sma50) {
    reasoning.push('SMA20 below SMA50');
  }

  return {
    timeframe: 'medium',
    timeframeLabel: '1-7 дней',
    signal: classifySignal(totalScore),
    score: parseFloat(totalScore.toFixed(2)),
    reasoning: reasoning.slice(0, 4),
    components: {
      technical: { score: techScore, weight: 0.70 },
      news: { score: newsData.score, weight: 0.30 }
    }
  };
}

async function generateLongTermSignal(technicalData, fundamentalData) {
  let longTermTechScore = 0;
  const reasoning = [...(fundamentalData.reasoning?.slice(0, 2) || [])];

  const sma100 = technicalData.indicators?.sma100;
  const sma200 = technicalData.indicators?.sma200;

  if (Number.isFinite(sma100) && Number.isFinite(sma200)) {
    if (sma100 > sma200) {
      longTermTechScore += 45;
      reasoning.push('SMA100 above SMA200');
    } else {
      longTermTechScore -= 45;
      reasoning.push('SMA100 below SMA200');
    }
  } else if (technicalData.trend === 'UPTREND') {
    longTermTechScore += 25;
  } else if (technicalData.trend === 'DOWNTREND') {
    longTermTechScore -= 25;
  }

  const totalScore = (fundamentalData.score * 0.70) + (longTermTechScore * 0.30);

  return {
    timeframe: 'long',
    timeframeLabel: '1-3 месяца',
    signal: classifySignal(totalScore, { buy: 28, strongBuy: 48, sell: -28, strongSell: -48 }),
    score: parseFloat(totalScore.toFixed(2)),
    reasoning: reasoning.slice(0, 4),
    components: {
      fundamental: { score: fundamentalData.score, weight: 0.70 },
      technical: { score: longTermTechScore, weight: 0.30 }
    }
  };
}

export async function generateSignal() {
  try {
    const [technicalData, fundamentalData, newsData, priceData, intraday1h, intraday4h] = await Promise.all([
      getTechnicalAnalysis(),
      getFundamentalScore(),
      getNewsSentiment(),
      getCurrentPrice(),
      getChartData('1h'),
      getChartData('4h')
    ]);

    const [intraday, shortTerm, mediumTerm, longTerm] = await Promise.all([
      generateIntradaySignal(technicalData, fundamentalData, newsData, priceData, intraday1h.candles, intraday4h.candles),
      generateShortTermSignal(technicalData, fundamentalData, newsData),
      generateMediumTermSignal(technicalData, newsData),
      generateLongTermSignal(technicalData, fundamentalData)
    ]);

    const overallScore =
      (intraday.score * 0.25) +
      (shortTerm.score * 0.20) +
      (mediumTerm.score * 0.25) +
      (longTerm.score * 0.30);

    const overallSignal = classifySignal(overallScore);

    const allReasoning = [
      ...intraday.reasoning,
      ...shortTerm.reasoning,
      ...mediumTerm.reasoning,
      ...longTerm.reasoning
    ].slice(0, 7);

    const signalData = {
      signal: overallSignal,
      priceAtSignal: priceData.price,
      totalScore: parseFloat(overallScore.toFixed(2)),

      intraday,
      shortTerm,
      mediumTerm,
      longTerm,

      technicalScore: parseFloat(technicalData.score.toFixed(2)),
      fundamentalScore: fundamentalData.score,
      newsScore: parseFloat(newsData.score.toFixed(2)),

      reasoning: JSON.stringify(allReasoning),

      components: {
        technical: {
          score: technicalData.score,
          interpretation: technicalData.interpretation
        },
        fundamental: {
          score: fundamentalData.score,
          interpretation: fundamentalData.interpretation
        },
        news: {
          score: newsData.score,
          interpretation: newsData.interpretation
        }
      },
      timestamp: new Date().toISOString()
    };

    await signalDb.insert(signalData);

    return signalData;
  } catch (error) {
    console.error('Signal generation error:', error);
    throw error;
  }
}

export async function getSignalHistory(limit = 50) {
  try {
    const signals = await signalDb.getRecent(limit);
    return signals.map((s) => ({
      id: s.id,
      timestamp: s.timestamp,
      signal: s.signal,
      priceAtSignal: s.price_at_signal,
      totalScore: s.total_score,
      technicalScore: s.technical_score,
      fundamentalScore: s.fundamental_score,
      newsScore: s.news_score,
      reasoning: s.reasoning,
      priceAfter24h: s.price_after_24h,
      priceAfter72h: s.price_after_72h,
      outcome: s.outcome
    }));
  } catch (error) {
    console.error('Signal history error:', error.message);
    return [];
  }
}

export async function getSignalStats() {
  try {
    const stats = await signalDb.getStats();
    return {
      totalSignals: stats.total || 0,
      correctSignals: stats.correct || 0,
      incorrectSignals: stats.incorrect || 0,
      accuracy: stats.total > 0 ? ((stats.correct / stats.total) * 100).toFixed(1) : 'N/A',
      avgChange24h: stats.avg_change_24h ? stats.avg_change_24h.toFixed(2) : 'N/A'
    };
  } catch (error) {
    console.error('Signal stats error:', error.message);
    return { totalSignals: 0, accuracy: 'N/A' };
  }
}

export async function updateSignalOutcomes() {
  try {
    const signals = await signalDb.getRecent(100);
    const currentPrice = (await getCurrentPrice()).price;

    for (const signal of signals) {
      if (signal.outcome) continue;

      const signalTime = new Date(signal.timestamp).getTime();
      const now = Date.now();
      const hoursSinceSignal = (now - signalTime) / (1000 * 60 * 60);

      if (hoursSinceSignal >= 24 && !signal.price_after_24h) {
        const signalName = signal.signal || '';
        const priceChange = currentPrice - signal.price_at_signal;
        const isBuySignal =
          signalName.includes('BUY') ||
          signalName.includes('\u041f\u041e\u041a\u0423\u041f\u0410\u0422\u042c');
        const isSellSignal =
          signalName.includes('SELL') ||
          signalName.includes('\u041f\u0420\u041e\u0414\u0410\u0412\u0410\u0422\u042c');
        const isHoldSignal = signalName.includes('HOLD') || signalName.includes('\u0414\u0415\u0420\u0416\u0410\u0422\u042c');

        const wasCorrect =
          (isBuySignal && priceChange > 0) ||
          (isSellSignal && priceChange < 0) ||
          (isHoldSignal && Math.abs(priceChange / signal.price_at_signal) < 0.02);

        await signalDb.updateOutcome(signal.id, currentPrice, null, wasCorrect ? 'correct' : 'incorrect');
      }
    }
  } catch (error) {
    console.error('Update outcomes error:', error.message);
  }
}
