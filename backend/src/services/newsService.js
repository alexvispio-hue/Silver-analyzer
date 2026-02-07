import axios from 'axios';
import { config } from '../config/config.js';
import { newsDb } from '../models/database.js';

let cachedNews = [];
let lastFetch = 0;

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
  try {
    const now = Date.now();

    // Return cached data if less than 15 minutes old
    if (cachedNews.length > 0 && now - lastFetch < config.newsUpdateInterval) {
      return cachedNews;
    }

    // If no API key, return cached or empty
    if (!config.newsApiKey) {
      console.warn('NewsAPI key not configured');
      return cachedNews.length > 0 ? cachedNews : getMockNews();
    }

    const query = KEYWORDS.slice(0, 3).join(' OR ');
    const response = await axios.get('https://newsapi.org/v2/everything', {
      params: {
        q: query,
        language: 'en',
        sortBy: 'publishedAt',
        pageSize: 20,
        apiKey: config.newsApiKey
      }
    });

    if (response.data.articles) {
      cachedNews = response.data.articles.map(article => {
        const sentimentText = `${article.title || ''} ${article.description || ''}`;
        const sentiment = analyzeSentiment(sentimentText);

        const newsItem = {
          title: article.title,
          description: article.description,
          source: article.source?.name,
          url: article.url,
          publishedAt: article.publishedAt,
          sentiment,
          sentimentLabel: sentiment > 0.2 ? 'BULLISH' :
            sentiment < -0.2 ? 'BEARISH' : 'NEUTRAL'
        };

        // Save to database
        newsDb.insert(newsItem);

        return newsItem;
      });

      lastFetch = now;

      // Clean old news
      newsDb.clearOld();
    }

    return cachedNews;
  } catch (error) {
    console.error('News fetch error:', error.message);
    return cachedNews.length > 0 ? cachedNews : getMockNews();
  }
}

function getMockNews() {
  // Return mock news for demonstration when API key is not available
  return [
    {
      title: 'Silver prices steady as markets await Fed decision',
      description: 'Precious metals remain stable ahead of the Federal Reserve\'s interest rate announcement.',
      source: 'Financial News',
      url: '#',
      publishedAt: new Date().toISOString(),
      sentiment: 0,
      sentimentLabel: 'NEUTRAL'
    },
    {
      title: 'Industrial demand for silver expected to grow in 2025',
      description: 'Solar panel production and electronics manufacturing drive silver demand higher.',
      source: 'Metal Markets',
      url: '#',
      publishedAt: new Date(Date.now() - 3600000).toISOString(),
      sentiment: 0.5,
      sentimentLabel: 'BULLISH'
    },
    {
      title: 'Dollar strength pressures precious metals',
      description: 'Rising dollar index creates headwinds for gold and silver prices.',
      source: 'Market Watch',
      url: '#',
      publishedAt: new Date(Date.now() - 7200000).toISOString(),
      sentiment: -0.3,
      sentimentLabel: 'BEARISH'
    }
  ];
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
