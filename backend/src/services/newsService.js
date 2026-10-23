import { XMLParser } from 'fast-xml-parser';
import { config } from '../config/config.js';
import { newsDb } from '../models/database.js';

let cachedNews = [];
let lastFetch = 0;
let pending;

const KEYWORDS = [
  'silver price',
  'XAGUSD',
  'precious metals',
  'Federal Reserve',
  'Jerome Powell',
  'Fed interest rate',
  'inflation',
  'dollar strength'
];

// Simple sentiment analysis based on keyword matching
function analyzeSentiment(text) {
  const bullishWords = [
    'surge', 'rally', 'gain', 'rise', 'high', 'bullish', 'support',
    'demand', 'growth', 'positive', 'strong', 'increase', 'up',
    'cut rates', 'dovish', 'inflation', 'safe haven', 'buying'
  ];

  const bearishWords = [
    'fall', 'drop', 'decline', 'low', 'bearish', 'resistance',
    'oversupply', 'negative', 'weak', 'decrease', 'down', 'sell',
    'rate hike', 'hawkish', 'strong dollar', 'selling'
  ];

  const lowerText = text.toLowerCase();

  let bullishCount = 0;
  let bearishCount = 0;

  bullishWords.forEach(word => {
    if (lowerText.includes(word)) bullishCount++;
  });

  bearishWords.forEach(word => {
    if (lowerText.includes(word)) bearishCount++;
  });

  const total = bullishCount + bearishCount;
  if (total === 0) return 0;

  // Return value between -1 (bearish) and 1 (bullish)
  return (bullishCount - bearishCount) / total;
}

export async function getNews() {
  if (!pending) pending = loadNews().finally(() => { pending = null; });
  return pending;
}

async function fetchArticles() {
  if (config.newsProvider === 'newsapi' && config.newsApiKey) {
    try {
      const url = new URL('https://newsapi.org/v2/everything');
      url.search = new URLSearchParams({ q: KEYWORDS.slice(0, 3).join(' OR '), language: 'en', sortBy: 'publishedAt', pageSize: '20' });
      const response = await fetch(url, { headers: { 'X-Api-Key': config.newsApiKey }, signal: AbortSignal.timeout(10000) });
      if (!response.ok) throw new Error('NewsAPI unavailable');
      const data = await response.json();
      if (!Array.isArray(data.articles)) throw new Error('Invalid NewsAPI data');
      return data.articles;
    } catch { console.warn('NewsAPI unavailable; trying Yahoo RSS'); }
  }
  const response = await fetch('https://finance.yahoo.com/rss/headline?s=SI%3DF', { signal: AbortSignal.timeout(10000) });
  if (!response.ok) throw new Error('Yahoo RSS unavailable');
  const xml = await response.text();
  if (!xml.trim().startsWith('<')) throw new Error('Invalid RSS');
  const parsed = new XMLParser({ processEntities: true }).parse(xml);
  const items = parsed.rss?.channel?.item || [];
  return (Array.isArray(items) ? items : [items]).map(item => ({
    title: item.title, description: null, source: { name: 'Yahoo Finance RSS' },
    url: item.link, publishedAt: item.pubDate
  }));
}

async function loadNews() {
  try {
    const now = Date.now();

    // Return cached data if less than 15 minutes old
    if (cachedNews.length > 0 && now - lastFetch < config.newsUpdateInterval) {
      return cachedNews;
    }

    const articles = await fetchArticles();
    if (articles) {
      cachedNews = articles.filter(article => typeof article.title === 'string' && article.title !== '[Removed]' && /^https?:\/\//i.test(article.url || '') && Number.isFinite(Date.parse(article.publishedAt))).map(article => {
        const sentimentText = `${article.title || ''} ${article.description || ''}`;
        const sentiment = analyzeSentiment(sentimentText);

        const newsItem = {
          title: article.title,
          description: article.description || null,
          source: article.source?.name || 'Unknown',
          url: article.url,
          publishedAt: new Date(article.publishedAt).toISOString(),
          sentiment,
          sentimentLabel: sentiment > 0.2 ? 'BULLISH' :
            sentiment < -0.2 ? 'BEARISH' : 'NEUTRAL'
        };

        return newsItem;
      });

      for (const newsItem of cachedNews) await newsDb.insert(newsItem);

      lastFetch = now;

      // Clean old news
      await newsDb.clearOld();
    }

    return cachedNews;
  } catch (error) {
    console.error('News fetch error:', error.message);
    return cachedNews.map(item => ({ ...item, stale: true }));
  }
}

export async function getNewsSentiment() {
  const news = await getNews();

  if (news.length === 0) {
    return { score: 0, interpretation: 'NEUTRAL', count: 0 };
  }

  const totalSentiment = news.reduce((sum, n) => sum + n.sentiment, 0);
  const avgSentiment = totalSentiment / news.length;

  // Convert to -100 to +100 scale
  const score = avgSentiment * 100;

  let interpretation = 'NEUTRAL';
  if (score >= 30) interpretation = 'BULLISH';
  else if (score <= -30) interpretation = 'BEARISH';

  return {
    score: parseFloat(score.toFixed(2)),
    interpretation,
    bullishCount: news.filter(n => n.sentiment > 0.2).length,
    bearishCount: news.filter(n => n.sentiment < -0.2).length,
    neutralCount: news.filter(n => n.sentiment >= -0.2 && n.sentiment <= 0.2).length,
    totalCount: news.length
  };
}
