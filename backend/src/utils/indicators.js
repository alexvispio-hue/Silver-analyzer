/**
 * Technical indicators calculations
 */

// Simple Moving Average
export function SMA(prices, period) {
  if (prices.length < period) return null;
  const sum = prices.slice(-period).reduce((a, b) => a + b, 0);
  return sum / period;
}

// Exponential Moving Average
export function EMA(prices, period) {
  if (prices.length < period) return null;

  const k = 2 / (period + 1);
  let ema = SMA(prices.slice(0, period), period);

  for (let i = period; i < prices.length; i++) {
    ema = prices[i] * k + ema * (1 - k);
  }

  return ema;
}

// Relative Strength Index
export function RSI(prices, period = 14) {
  if (prices.length < period + 1) return null;

  let gains = 0;
  let losses = 0;

  // Calculate initial average gain/loss
  for (let i = 1; i <= period; i++) {
    const change = prices[i] - prices[i - 1];
    if (change >= 0) {
      gains += change;
    } else {
      losses -= change;
    }
  }

  let avgGain = gains / period;
  let avgLoss = losses / period;

  // Calculate RSI using smoothed averages
  for (let i = period + 1; i < prices.length; i++) {
    const change = prices[i] - prices[i - 1];
    if (change >= 0) {
      avgGain = (avgGain * (period - 1) + change) / period;
      avgLoss = (avgLoss * (period - 1)) / period;
    } else {
      avgGain = (avgGain * (period - 1)) / period;
      avgLoss = (avgLoss * (period - 1) - change) / period;
    }
  }

  if (avgLoss === 0) return 100;
  const rs = avgGain / avgLoss;
  return 100 - (100 / (1 + rs));
}

// MACD (Moving Average Convergence Divergence)
export function MACD(prices, fastPeriod = 12, slowPeriod = 26, signalPeriod = 9) {
  if (prices.length < slowPeriod + signalPeriod) return null;

  const fastEMA = EMA(prices, fastPeriod);
  const slowEMA = EMA(prices, slowPeriod);

  if (fastEMA === null || slowEMA === null) return null;

  const macdLine = fastEMA - slowEMA;

  // Calculate MACD history for signal line
  const macdHistory = [];
  for (let i = slowPeriod; i <= prices.length; i++) {
    const fastE = EMA(prices.slice(0, i), fastPeriod);
    const slowE = EMA(prices.slice(0, i), slowPeriod);
    if (fastE !== null && slowE !== null) {
      macdHistory.push(fastE - slowE);
    }
  }

  const signalLine = macdHistory.length >= signalPeriod
    ? EMA(macdHistory, signalPeriod)
    : null;

  const histogram = signalLine !== null ? macdLine - signalLine : null;

  return {
    macd: macdLine,
    signal: signalLine,
    histogram
  };
}

// Calculate Support and Resistance levels
export function calculateLevels(prices, highs, lows) {
  if (prices.length < 20) return { support: [], resistance: [] };

  const currentPrice = prices[prices.length - 1];
  const support = [];
  const resistance = [];

  // Find local minima and maxima
  for (let i = 5; i < prices.length - 5; i++) {
    const low = lows[i];
    const high = highs[i];

    // Check for local minimum (support)
    let isSupport = true;
    for (let j = i - 5; j <= i + 5; j++) {
      if (j !== i && lows[j] < low) {
        isSupport = false;
        break;
      }
    }
    if (isSupport) {
      support.push(low);
    }

    // Check for local maximum (resistance)
    let isResistance = true;
    for (let j = i - 5; j <= i + 5; j++) {
      if (j !== i && highs[j] > high) {
        isResistance = false;
        break;
      }
    }
    if (isResistance) {
      resistance.push(high);
    }
  }

  // Cluster nearby levels
  const clusterLevels = (levels, threshold = 0.02) => {
    if (levels.length === 0) return [];

    const sorted = levels.sort((a, b) => a - b);
    const clustered = [];
    let cluster = [sorted[0]];

    for (let i = 1; i < sorted.length; i++) {
      if ((sorted[i] - sorted[i - 1]) / sorted[i - 1] < threshold) {
        cluster.push(sorted[i]);
      } else {
        clustered.push(cluster.reduce((a, b) => a + b, 0) / cluster.length);
        cluster = [sorted[i]];
      }
    }
    clustered.push(cluster.reduce((a, b) => a + b, 0) / cluster.length);

    return clustered;
  };

  const allSupport = clusterLevels(support);
  const allResistance = clusterLevels(resistance);

  // Filter: support below current price, resistance above
  const relevantSupport = allSupport.filter(l => l < currentPrice);
  const relevantResistance = allResistance.filter(l => l > currentPrice);

  return {
    support: relevantSupport.slice(-5), // 5 ближайших уровней поддержки
    resistance: relevantResistance.slice(0, 5) // 5 ближайших уровней сопротивления
  };
}

// Расширенный анализ уровней с зонами пробоя
export function calculateDetailedLevels(prices, highs, lows, currentPrice) {
  if (prices.length < 20) {
    return {
      support: [],
      resistance: [],
      keyLevels: [],
      breakoutAnalysis: null
    };
  }

  // Собираем все значимые уровни
  const allLevels = [];

  // 1. Локальные минимумы и максимумы (swing points)
  for (let i = 3; i < prices.length - 3; i++) {
    const low = lows[i];
    const high = highs[i];

    // Swing low
    let isSwingLow = true;
    for (let j = i - 3; j <= i + 3; j++) {
      if (j !== i && lows[j] < low) {
        isSwingLow = false;
        break;
      }
    }
    if (isSwingLow) {
      allLevels.push({ price: low, type: 'swing_low', strength: 1 });
    }

    // Swing high
    let isSwingHigh = true;
    for (let j = i - 3; j <= i + 3; j++) {
      if (j !== i && highs[j] > high) {
        isSwingHigh = false;
        break;
      }
    }
    if (isSwingHigh) {
      allLevels.push({ price: high, type: 'swing_high', strength: 1 });
    }
  }

  // 2. Добавляем психологические уровни (круглые числа)
  const minPrice = Math.min(...lows);
  const maxPrice = Math.max(...highs);

  // Определяем шаг для круглых уровней в зависимости от диапазона цен
  const range = maxPrice - minPrice;
  let step = 5; // Шаг 5$ для серебра
  if (range > 50) step = 10;
  if (range < 20) step = 2;

  const roundStart = Math.floor(minPrice / step) * step;
  const roundEnd = Math.ceil(maxPrice / step) * step;

  for (let level = roundStart; level <= roundEnd; level += step) {
    if (level > 0) {
      allLevels.push({ price: level, type: 'psychological', strength: 2 });
    }
  }

  // 3. Кластеризация уровней с подсчётом силы
  const clusterLevels = (levels, threshold = 0.015) => {
    if (levels.length === 0) return [];

    const sorted = [...levels].sort((a, b) => a.price - b.price);
    const clustered = [];
    let cluster = [sorted[0]];

    for (let i = 1; i < sorted.length; i++) {
      if ((sorted[i].price - cluster[0].price) / cluster[0].price < threshold) {
        cluster.push(sorted[i]);
      } else {
        // Усредняем цену и суммируем силу
        const avgPrice = cluster.reduce((sum, l) => sum + l.price, 0) / cluster.length;
        const totalStrength = cluster.reduce((sum, l) => sum + l.strength, 0);
        const touches = cluster.length;
        clustered.push({
          price: avgPrice,
          strength: totalStrength,
          touches,
          types: [...new Set(cluster.map(l => l.type))]
        });
        cluster = [sorted[i]];
      }
    }
    // Добавляем последний кластер
    const avgPrice = cluster.reduce((sum, l) => sum + l.price, 0) / cluster.length;
    const totalStrength = cluster.reduce((sum, l) => sum + l.strength, 0);
    clustered.push({
      price: avgPrice,
      strength: totalStrength,
      touches: cluster.length,
      types: [...new Set(cluster.map(l => l.type))]
    });

    return clustered;
  };

  const clusteredLevels = clusterLevels(allLevels);

  // 4. Разделяем на поддержку и сопротивление относительно текущей цены
  const supportLevels = clusteredLevels
    .filter(l => l.price < currentPrice)
    .sort((a, b) => b.price - a.price); // От ближайшего к дальнему

  const resistanceLevels = clusteredLevels
    .filter(l => l.price > currentPrice)
    .sort((a, b) => a.price - b.price); // От ближайшего к дальнему

  // 5. Определяем ключевые уровни (самые сильные)
  const keyLevels = clusteredLevels
    .sort((a, b) => b.strength - a.strength)
    .slice(0, 10)
    .map(l => ({
      price: parseFloat(l.price.toFixed(2)),
      strength: l.strength,
      touches: l.touches,
      type: l.price < currentPrice ? 'support' : 'resistance',
      distancePercent: parseFloat((((l.price - currentPrice) / currentPrice) * 100).toFixed(2))
    }));

  // 6. Анализ пробоя
  const nearestSupport = supportLevels[0];
  const nextSupport = supportLevels[1];
  const nearestResistance = resistanceLevels[0];
  const nextResistance = resistanceLevels[1];

  const breakoutAnalysis = {
    // Анализ поддержки
    support: nearestSupport ? {
      currentLevel: parseFloat(nearestSupport.price.toFixed(2)),
      strength: nearestSupport.strength,
      distancePercent: parseFloat((((currentPrice - nearestSupport.price) / currentPrice) * 100).toFixed(2)),
      breakdownTarget: nextSupport ? parseFloat(nextSupport.price.toFixed(2)) : null,
      breakdownTargetDistance: nextSupport
        ? parseFloat((((currentPrice - nextSupport.price) / currentPrice) * 100).toFixed(2))
        : null,
      warning: nearestSupport && ((currentPrice - nearestSupport.price) / currentPrice) < 0.03
        ? `Цена близка к поддержке ${nearestSupport.price.toFixed(2)}. Пробой откроет дорогу к ${nextSupport ? nextSupport.price.toFixed(2) : 'более низким уровням'}`
        : null
    } : null,

    // Анализ сопротивления
    resistance: nearestResistance ? {
      currentLevel: parseFloat(nearestResistance.price.toFixed(2)),
      strength: nearestResistance.strength,
      distancePercent: parseFloat((((nearestResistance.price - currentPrice) / currentPrice) * 100).toFixed(2)),
      breakoutTarget: nextResistance ? parseFloat(nextResistance.price.toFixed(2)) : null,
      breakoutTargetDistance: nextResistance
        ? parseFloat((((nextResistance.price - currentPrice) / currentPrice) * 100).toFixed(2))
        : null,
      opportunity: nearestResistance && ((nearestResistance.price - currentPrice) / currentPrice) < 0.03
        ? `Цена близка к сопротивлению ${nearestResistance.price.toFixed(2)}. Пробой откроет дорогу к ${nextResistance ? nextResistance.price.toFixed(2) : 'более высоким уровням'}`
        : null
    } : null
  };

  return {
    support: supportLevels.slice(0, 5).map(l => ({
      price: parseFloat(l.price.toFixed(2)),
      strength: l.strength,
      touches: l.touches
    })),
    resistance: resistanceLevels.slice(0, 5).map(l => ({
      price: parseFloat(l.price.toFixed(2)),
      strength: l.strength,
      touches: l.touches
    })),
    keyLevels,
    breakoutAnalysis,
    currentPrice: parseFloat(currentPrice.toFixed(2))
  };
}

// Determine trend
export function determineTrend(prices) {
  if (prices.length < 50) return 'NEUTRAL';

  const sma20 = SMA(prices, 20);
  const sma50 = SMA(prices, 50);
  const currentPrice = prices[prices.length - 1];

  if (currentPrice > sma20 && sma20 > sma50) {
    return 'UPTREND';
  } else if (currentPrice < sma20 && sma20 < sma50) {
    return 'DOWNTREND';
  }
  return 'NEUTRAL';
}

// Bollinger Bands
export function bollingerBands(prices, period = 20, stdDev = 2) {
  if (prices.length < period) return null;

  const sma = SMA(prices, period);
  const slice = prices.slice(-period);

  const squaredDiffs = slice.map(p => Math.pow(p - sma, 2));
  const variance = squaredDiffs.reduce((a, b) => a + b, 0) / period;
  const standardDeviation = Math.sqrt(variance);

  return {
    upper: sma + stdDev * standardDeviation,
    middle: sma,
    lower: sma - stdDev * standardDeviation
  };
}
