import { getTechnicalAnalysis } from './technicalAnalysis.js';
import { getFundamentalScore } from './fundamentalService.js';
import { getNewsSentiment } from './newsService.js';
import { getCurrentPrice } from './priceService.js';
import { signalDb } from '../models/database.js';

// Генерация краткосрочного сигнала (4-24 часа)
// На основе: новости + RSI + MACD
async function generateShortTermSignal(technicalData, newsData) {
  const newsWeight = 0.50;      // Новости - главный фактор на короткий срок
  const technicalWeight = 0.50; // Технический анализ

  // Для краткосрочного сигнала RSI и MACD имеют больший вес
  let techScore = 0;
  if (technicalData.indicators?.rsi) {
    const rsi = technicalData.indicators.rsi;
    if (rsi < 30) techScore += 40;
    else if (rsi < 40) techScore += 20;
    else if (rsi > 70) techScore -= 40;
    else if (rsi > 60) techScore -= 20;
  }

  if (technicalData.indicators?.macd?.histogram) {
    if (technicalData.indicators.macd.histogram > 0) techScore += 30;
    else techScore -= 30;
  }

  const totalScore = (techScore * technicalWeight) + (newsData.score * newsWeight);

  let signal = 'ДЕРЖАТЬ';
  if (totalScore >= 40) signal = 'ПОКУПАТЬ';
  else if (totalScore >= 60) signal = 'АКТИВНО ПОКУПАТЬ';
  else if (totalScore <= -40) signal = 'ПРОДАВАТЬ';
  else if (totalScore <= -60) signal = 'АКТИВНО ПРОДАВАТЬ';

  const reasoning = [];
  if (newsData.score > 20) reasoning.push('Позитивный новостной фон');
  else if (newsData.score < -20) reasoning.push('Негативный новостной фон');

  if (technicalData.indicators?.rsi < 30) reasoning.push('RSI в зоне перепроданности');
  else if (technicalData.indicators?.rsi > 70) reasoning.push('RSI в зоне перекупленности');

  return {
    timeframe: 'short',
    timeframeLabel: '4-24 часа',
    signal,
    score: parseFloat(totalScore.toFixed(2)),
    reasoning,
    components: {
      news: { score: newsData.score, weight: newsWeight },
      technical: { score: techScore, weight: technicalWeight }
    }
  };
}

// Генерация среднесрочного сигнала (1-7 дней)
// На основе: технический анализ (MA, тренд) + новости
async function generateMediumTermSignal(technicalData, newsData) {
  const technicalWeight = 0.70;
  const newsWeight = 0.30;

  const techScore = technicalData.score;
  const totalScore = (techScore * technicalWeight) + (newsData.score * newsWeight);

  let signal = 'ДЕРЖАТЬ';
  if (totalScore >= 40) signal = 'ПОКУПАТЬ';
  else if (totalScore >= 60) signal = 'АКТИВНО ПОКУПАТЬ';
  else if (totalScore <= -40) signal = 'ПРОДАВАТЬ';
  else if (totalScore <= -60) signal = 'АКТИВНО ПРОДАВАТЬ';

  const reasoning = [];
  if (technicalData.trend === 'UPTREND') reasoning.push('Восходящий тренд');
  else if (technicalData.trend === 'DOWNTREND') reasoning.push('Нисходящий тренд');

  if (technicalData.indicators?.sma20 > technicalData.indicators?.sma50) {
    reasoning.push('SMA20 выше SMA50 (бычий сигнал)');
  } else if (technicalData.indicators?.sma20 < technicalData.indicators?.sma50) {
    reasoning.push('SMA20 ниже SMA50 (медвежий сигнал)');
  }

  return {
    timeframe: 'medium',
    timeframeLabel: '1-7 дней',
    signal,
    score: parseFloat(totalScore.toFixed(2)),
    reasoning,
    components: {
      technical: { score: techScore, weight: technicalWeight },
      news: { score: newsData.score, weight: newsWeight }
    }
  };
}

// Генерация долгосрочного сигнала (1-3 месяца)
// На основе: фундаментальный анализ + долгосрочные MA
async function generateLongTermSignal(technicalData, fundamentalData) {
  const fundamentalWeight = 0.70;
  const technicalWeight = 0.30;

  // Для долгосрока смотрим на SMA50/SMA200 и общий тренд
  let longTermTechScore = 0;
  if (technicalData.indicators?.sma50 && technicalData.indicators?.sma200) {
    if (technicalData.indicators.sma50 > technicalData.indicators.sma200) {
      longTermTechScore += 50; // Золотой крест
    } else {
      longTermTechScore -= 50; // Мертвый крест
    }
  } else if (technicalData.trend === 'UPTREND') {
    longTermTechScore += 30;
  } else if (technicalData.trend === 'DOWNTREND') {
    longTermTechScore -= 30;
  }

  const totalScore = (fundamentalData.score * fundamentalWeight) + (longTermTechScore * technicalWeight);

  let signal = 'ДЕРЖАТЬ';
  if (totalScore >= 30) signal = 'ПОКУПАТЬ';
  else if (totalScore >= 50) signal = 'АКТИВНО ПОКУПАТЬ';
  else if (totalScore <= -30) signal = 'ПРОДАВАТЬ';
  else if (totalScore <= -50) signal = 'АКТИВНО ПРОДАВАТЬ';

  const reasoning = fundamentalData.reasoning?.slice(0, 3) || [];

  if (technicalData.indicators?.sma50 > technicalData.indicators?.sma200) {
    reasoning.push('Долгосрочный бычий тренд (SMA50 > SMA200)');
  }

  return {
    timeframe: 'long',
    timeframeLabel: '1-3 месяца',
    signal,
    score: parseFloat(totalScore.toFixed(2)),
    reasoning,
    components: {
      fundamental: { score: fundamentalData.score, weight: fundamentalWeight },
      technical: { score: longTermTechScore, weight: technicalWeight }
    }
  };
}

export async function generateSignal() {
  try {
    // Получаем все данные параллельно
    const [technicalData, fundamentalData, newsData, priceData] = await Promise.all([
      getTechnicalAnalysis(),
      getFundamentalScore(),
      getNewsSentiment(),
      getCurrentPrice()
    ]);

    // Генерируем сигналы для разных временных горизонтов
    const [shortTerm, mediumTerm, longTerm] = await Promise.all([
      generateShortTermSignal(technicalData, newsData),
      generateMediumTermSignal(technicalData, newsData),
      generateLongTermSignal(technicalData, fundamentalData)
    ]);

    // Общий сигнал (взвешенное среднее)
    const overallScore = (shortTerm.score * 0.2) + (mediumTerm.score * 0.3) + (longTerm.score * 0.5);

    let overallSignal = 'ДЕРЖАТЬ';
    if (overallScore >= 40) overallSignal = 'ПОКУПАТЬ';
    else if (overallScore >= 60) overallSignal = 'АКТИВНО ПОКУПАТЬ';
    else if (overallScore <= -40) overallSignal = 'ПРОДАВАТЬ';
    else if (overallScore <= -60) overallSignal = 'АКТИВНО ПРОДАВАТЬ';

    // Собираем reasoning из всех временных горизонтов
    const allReasoning = [
      ...shortTerm.reasoning,
      ...mediumTerm.reasoning,
      ...longTerm.reasoning
    ].slice(0, 5); // Ограничиваем до 5 пунктов

    const signalData = {
      signal: overallSignal,
      priceAtSignal: priceData.price,
      totalScore: parseFloat(overallScore.toFixed(2)),

      // Сигналы по временным горизонтам
      shortTerm,
      mediumTerm,
      longTerm,

      // Исходные компоненты (для совместимости)
      technicalScore: parseFloat(technicalData.score.toFixed(2)),
      fundamentalScore: fundamentalData.score,
      newsScore: parseFloat(newsData.score.toFixed(2)),

      // Reasoning для сохранения в БД
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

    // Сохраняем в базу данных
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
    return signals.map(s => ({
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
      accuracy: stats.total > 0
        ? ((stats.correct / stats.total) * 100).toFixed(1)
        : 'N/A',
      avgChange24h: stats.avg_change_24h
        ? stats.avg_change_24h.toFixed(2)
        : 'N/A'
    };
  } catch (error) {
    console.error('Signal stats error:', error.message);
    return { totalSignals: 0, accuracy: 'N/A' };
  }
}

// Обновление результатов сигналов (запускается периодически)
export async function updateSignalOutcomes() {
  try {
    const signals = await signalDb.getRecent(100);
    const currentPrice = (await getCurrentPrice()).price;

    for (const signal of signals) {
      if (signal.outcome) continue; // Уже оценено

      const signalTime = new Date(signal.timestamp).getTime();
      const now = Date.now();
      const hoursSinceSignal = (now - signalTime) / (1000 * 60 * 60);

      // Оцениваем сигналы старше 24 часов
      if (hoursSinceSignal >= 24 && !signal.price_after_24h) {
        const priceChange = currentPrice - signal.price_at_signal;
        const wasCorrect = (
          (signal.signal.includes('ПОКУПАТЬ') && priceChange > 0) ||
          (signal.signal.includes('ПРОДАВАТЬ') && priceChange < 0) ||
          (signal.signal === 'ДЕРЖАТЬ' && Math.abs(priceChange / signal.price_at_signal) < 0.02)
        );

        await signalDb.updateOutcome(
          signal.id,
          currentPrice,
          null,
          wasCorrect ? 'correct' : 'incorrect'
        );
      }
    }
  } catch (error) {
    console.error('Update outcomes error:', error.message);
  }
}
