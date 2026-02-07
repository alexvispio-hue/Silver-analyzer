import { getHistoricalData, getCurrentPrice, getChartData } from './priceService.js';
import {
  RSI,
  MACD,
  SMA,
  EMA,
  calculateLevels,
  calculateDetailedLevels,
  calculateVolumeClusters,
  determineTrend,
  bollingerBands
} from '../utils/indicators.js';

function mergeUniqueLevels(...arrays) {
  const values = arrays.flat().filter((v) => Number.isFinite(v));
  return [...new Set(values.map((v) => Number(v.toFixed(2))))].sort((a, b) => a - b);
}

export async function getTechnicalAnalysis() {
  try {
    const [history, longHistory, intraday4h, current] = await Promise.all([
      getHistoricalData('3mo'),
      getHistoricalData('1y'),
      getChartData('4h'),
      getCurrentPrice()
    ]);

    if (history.length < 50) {
      return { error: 'Not enough historical data' };
    }

    const closes = history.map((h) => h.close);
    const highs = history.map((h) => h.high);
    const lows = history.map((h) => h.low);
    const longCloses = longHistory.map((h) => h.close);

    // Core indicators
    const rsi = RSI(closes);
    const macd = MACD(closes);
    const sma20 = SMA(closes, 20);
    const sma50 = SMA(closes, 50);
    const sma100 = longCloses.length >= 100 ? SMA(longCloses, 100) : null;
    const sma200 = longCloses.length >= 200 ? SMA(longCloses, 200) : null;
    const ema12 = EMA(closes, 12);
    const ema26 = EMA(closes, 26);
    const trend = determineTrend(closes);
    const basicLevels = calculateLevels(closes, highs, lows);
    const detailedLevels = calculateDetailedLevels(closes, highs, lows, current.price);
    const bb = bollingerBands(closes);

    const volumeClusters = calculateVolumeClusters(intraday4h?.candles || [], current.price);

    const levelSupportBase = basicLevels.support.length > 0
      ? basicLevels.support
      : detailedLevels.support.map((level) => level.price);
    const levelResistanceBase = basicLevels.resistance.length > 0
      ? basicLevels.resistance
      : detailedLevels.resistance.map((level) => level.price);

    const combinedLevels = {
      support: mergeUniqueLevels(
        levelSupportBase,
        volumeClusters.support.map((zone) => zone.center)
      )
        .filter((value) => value < current.price)
        .slice(-6),
      resistance: mergeUniqueLevels(
        levelResistanceBase,
        volumeClusters.resistance.map((zone) => zone.center)
      )
        .filter((value) => value > current.price)
        .slice(0, 6)
    };

    // Technical score (-100..100)
    let score = 0;

    if (rsi !== null) {
      if (rsi < 30) score += 25;
      else if (rsi > 70) score -= 25;
      else if (rsi < 40) score += 10;
      else if (rsi > 60) score -= 10;
    }

    if (macd !== null && macd.histogram !== null) {
      if (macd.histogram > 0 && macd.macd > macd.signal) score += 25;
      if (macd.histogram < 0 && macd.macd < macd.signal) score -= 25;
    }

    if (sma20 && sma50) {
      const price = current.price;
      if (price > sma20 && sma20 > sma50) score += 25;
      else if (price < sma20 && sma20 < sma50) score -= 25;
      else if (price > sma20) score += 10;
      else if (price < sma20) score -= 10;
    }

    if (combinedLevels.support.length > 0 && combinedLevels.resistance.length > 0) {
      const price = current.price;
      const nearestSupport = combinedLevels.support.reduce((a, b) =>
        Math.abs(b - price) < Math.abs(a - price) ? b : a
      );
      const nearestResistance = combinedLevels.resistance.reduce((a, b) =>
        Math.abs(b - price) < Math.abs(a - price) ? b : a
      );

      const distToSupport = (price - nearestSupport) / price;
      const distToResistance = (nearestResistance - price) / price;

      if (distToSupport < 0.02) score += 15;
      if (distToResistance < 0.02) score -= 15;
    }

    let interpretation = 'NEUTRAL';
    const reasoning = [];

    if (rsi !== null) {
      if (rsi < 30) reasoning.push(`RSI (${rsi.toFixed(1)}) indicates oversold conditions`);
      else if (rsi > 70) reasoning.push(`RSI (${rsi.toFixed(1)}) indicates overbought conditions`);
    }

    if (macd !== null && macd.histogram !== null) {
      if (macd.histogram > 0) reasoning.push('MACD histogram is positive (bullish momentum)');
      else reasoning.push('MACD histogram is negative (bearish momentum)');
    }

    reasoning.push(`Trend: ${trend}`);

    if (volumeClusters.support[0]) {
      reasoning.push(`Volume support cluster: ${volumeClusters.support[0].low}-${volumeClusters.support[0].high}`);
    }

    if (volumeClusters.resistance[0]) {
      reasoning.push(`Volume resistance cluster: ${volumeClusters.resistance[0].low}-${volumeClusters.resistance[0].high}`);
    }

    if (detailedLevels.breakoutAnalysis?.support?.warning) {
      reasoning.push(detailedLevels.breakoutAnalysis.support.warning);
    }
    if (detailedLevels.breakoutAnalysis?.resistance?.opportunity) {
      reasoning.push(detailedLevels.breakoutAnalysis.resistance.opportunity);
    }

    if (score >= 50) interpretation = 'STRONG_BUY';
    else if (score >= 25) interpretation = 'BUY';
    else if (score <= -50) interpretation = 'STRONG_SELL';
    else if (score <= -25) interpretation = 'SELL';

    return {
      currentPrice: current.price,
      indicators: {
        rsi: rsi ? parseFloat(rsi.toFixed(2)) : null,
        macd: macd
          ? {
              macd: parseFloat(macd.macd.toFixed(4)),
              signal: macd.signal ? parseFloat(macd.signal.toFixed(4)) : null,
              histogram: macd.histogram ? parseFloat(macd.histogram.toFixed(4)) : null
            }
          : null,
        sma20: sma20 ? parseFloat(sma20.toFixed(2)) : null,
        sma50: sma50 ? parseFloat(sma50.toFixed(2)) : null,
        sma100: sma100 ? parseFloat(sma100.toFixed(2)) : null,
        sma200: sma200 ? parseFloat(sma200.toFixed(2)) : null,
        ema12: ema12 ? parseFloat(ema12.toFixed(2)) : null,
        ema26: ema26 ? parseFloat(ema26.toFixed(2)) : null,
        bollingerBands: bb
          ? {
              upper: parseFloat(bb.upper.toFixed(2)),
              middle: parseFloat(bb.middle.toFixed(2)),
              lower: parseFloat(bb.lower.toFixed(2))
            }
          : null
      },
      levels: {
        support: combinedLevels.support.map((l) => parseFloat(l.toFixed(2))),
        resistance: combinedLevels.resistance.map((l) => parseFloat(l.toFixed(2)))
      },
      volumeClusters,
      detailedLevels: {
        support: detailedLevels.support,
        resistance: detailedLevels.resistance,
        keyLevels: detailedLevels.keyLevels,
        breakoutAnalysis: detailedLevels.breakoutAnalysis
      },
      trend,
      longTermSupports: {
        sma100: sma100
          ? {
              level: parseFloat(sma100.toFixed(2)),
              distancePercent: parseFloat((((current.price - sma100) / current.price) * 100).toFixed(2)),
              status: current.price >= sma100 ? 'above' : 'below'
            }
          : null,
        sma200: sma200
          ? {
              level: parseFloat(sma200.toFixed(2)),
              distancePercent: parseFloat((((current.price - sma200) / current.price) * 100).toFixed(2)),
              status: current.price >= sma200 ? 'above' : 'below'
            }
          : null
      },
      score: parseFloat(score.toFixed(2)),
      interpretation,
      reasoning
    };
  } catch (error) {
    console.error('Technical analysis error:', error.message);
    throw error;
  }
}

export async function getTechnicalScore() {
  const analysis = await getTechnicalAnalysis();
  return {
    score: analysis.score,
    interpretation: analysis.interpretation,
    reasoning: analysis.reasoning
  };
}
