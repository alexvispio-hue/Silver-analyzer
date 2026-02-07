import { Router } from 'express';
import { getNews, getNewsSentiment } from '../services/newsService.js';

const router = Router();

// Get latest news
router.get('/', async (req, res) => {
  try {
    const news = await getNews();
    res.json(news);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get news sentiment summary
router.get('/sentiment', async (req, res) => {
  try {
    const sentiment = await getNewsSentiment();
    res.json(sentiment);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

export default router;
