import { getHistoricalData, getCurrentPrice } from './priceService.js';
import {
  RSI, MACD, SMA, EMA,
  calculateLevels, calculateDetailedLevels, determineTrend, bollingerBands
} from '../utils/indicators.js';

export async function getTechnicalAnalysis() {
  try {
    const history = await getHistoricalData('3mo');
    const current = await getCurrentPrice();

    if (history.length < 50) {
      return { error: 'Not enough historical data' };
    }

    const closes = history.map(h => h.close);
    const highs = history.map(h => h.high);
    const lows = history.map(h => h.low);

    // Calculate all indicators
    const rsi = RSI(closes);
    const macd = MACD(closes);
    const sma20 = SMA(closes, 20);
    const sma50 = SMA(closes, 50);
    const sma200 = closes.length >= 200 ? SMA(closes, 200) : null;
    const ema12 = EMA(closes, 12);
    const ema26 = EMA(closes, 26);
    const trend = determineTrend(closes);
    const levels = calculateLevels(closes, highs, lows);
    const detailedLevels = calculateDetailedLevels(closes, highs, lows, current.price);
    const bb = bollingerBands(closes);

    // Calculate technical score (-100 to +100)
    let score = 0;

    // RSI contribution (weight: 25%)
    if (rsi !== null) {
      if (rsi < 30) score += 25; // Oversold - bullish
      else if (rsi > 70) score -= 25; // Overbought - bearish
      else if (rsi < 40) score += 10;
      else if (rsi > 60) score -= 10;
    }

    // MACD contribution (weight: 25%)
    if (macd !== null) {
      if (macd.histogram > 0 && macd.macd > macd.signal) {
        score += 25; // Bullish
      } else if (macd.histogram < 0 && macd.macd < macd.signal) {
        score -= 25; // Bearish
      }
    }

    // Moving Average contribution (weight: 25%)
    if (sma20 && sma50) {
      const price = current.price;
      if (price > sma20 && sma20 > sma50) {
        score += 25; // Strong uptrend
      } else if (price < sma20 && sma20 < sma50) {
        score -= 25; // Strong downtrend
      } else if (price > sma20) {
        score += 10;
      } else if (price < sma20) {
        score -= 10;
      }
    }

    // Support/Resistance proximity (weight: 25%)
    if (levels.support.length > 0 && levels.resistance.length > 0) {
      const price = current.price;
      const nearestSupport = levels.support.reduce((a, b) =>
        Math.abs(b - price) < Math.abs(a - price) ? b : a
      );
      const nearestResistance = levels.resistance.reduce((a, b) =>
        Math.abs(b - price) < Math.abs(a - price) ? b : a
      );

      const distToSupport = (price - nearestSupport) / price;
      const distToResistance = (nearestResistance - price) / price;

      if (distToSupport < 0.02) {
        score += 15; // Near support - potential bounce
      }
      if (distToResistance < 0.02) {
        score -= 15; // Near resistance - potential rejection
      }
    }

    // Determine signal interpretation
    let interpretation = 'NEUTRAL';
    let reasoning = [];

    if (rsi !== null) {
      if (rsi < 30) {
        reasoning.push(`RSI (${rsi.toFixed(1)}) indicates oversold conditions`);
      } else if (rsi > 70) {
        reasoning.push(`RSI (${rsi.toFixed(1)}) indicates overbought conditions`);
      }
    }

    if (macd !== null && macd.histogram !== null) {
      if (macd.histogram > 0) {
        reasoning.push('MACD histogram is positive (bullish momentum)');
      } else {
        reasoning.push('MACD histogram is negative (bearish momentum)');
      }
    }

    reasoning.push(`Trend: ${trend}`);

    if (score >= 50) interpretation = 'STRONG_BUY';
    else if (score >= 25) interpretation = 'BUY';
    else if (score <= -50) interpretation = 'STRONG_SELL';
    else if (score <= -25) interpretation = 'SELL';

    // Добавляем информацию о пробое в reasoning
    if (detailedLevels.breakoutAnalysis) {
      if (detailedLevels.breakoutAnalysis.support?.warning) {
        reasoning.push(detailedLevels.breakoutAnalysis.support.warning);
      }
      if (detailedLevels.breakoutAnalysis.resistance?.opportunity) {
        reasoning.push(detailedLevels.breakoutAnalysis.resistance.opportunity);
      }
    }

    return {
      currentPrice: current.price,
      indicators: {
        rsi: rsi ? parseFloat(rsi.toFixed(2)) : null,
        macd: macd ? {
          macd: parseFloat(macd.macd.toFixed(4)),
          signal: macd.signal ? parseFloat(macd.signal.toFixed(4)) : null,
          histogram: macd.histogram ? parseFloat(macd.histogram.toFixed(4)) : null
        } : null,
        sma20: sma20 ? parseFloat(sma20.toFixed(2)) : null,
        sma50: sma50 ? parseFloat(sma50.toFixed(2)) : null,
        sma200: sma200 ? parseFloat(sma200.toFixed(2)) : null,
        ema12: ema12 ? parseFloat(ema12.toFixed(2)) : null,
        ema26: ema26 ? parseFloat(ema26.toFixed(2)) : null,
        bollingerBands: bb ? {
          upper: parseFloat(bb.upper.toFixed(2)),
          middle: parseFloat(bb.middle.toFixed(2)),
          lower: parseFloat(bb.lower.toFixed(2))
        } : null
      },
      // Базовые уровни (для совместимости)
      levels: {
        support: levels.support.map(l => parseFloat(l.toFixed(2))),
        resistance: levels.resistance.map(l => parseFloat(l.toFixed(2)))
      },
      // Детальный анализ уровней с силой и пробоем
      detailedLevels: {
        support: detailedLevels.support,
        resistance: detailedLevels.resistance,
        keyLevels: detailedLevels.keyLevels,
        breakoutAnalysis: detailedLevels.breakoutAnalysis
      },
      trend,
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
