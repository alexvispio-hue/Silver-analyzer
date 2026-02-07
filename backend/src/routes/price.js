import { Router } from 'express';
import {
  getCurrentPrice,
  getHistoricalData,
  getPriceChanges,
  getChartData,
  getAvailableTimeframes
} from '../services/priceService.js';

const router = Router();

// Get current price
router.get('/current', async (req, res) => {
  try {
    const price = await getCurrentPrice();
    res.json(price);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get historical data (legacy endpoint)
router.get('/history', async (req, res) => {
  try {
    const period = req.query.period || '3mo';
    const history = await getHistoricalData(period);
    res.json(history);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get chart data with different timeframes
// GET /api/price/chart?timeframe=1h|4h|1d|1w
router.get('/chart', async (req, res) => {
  try {
    const timeframe = req.query.timeframe || '1d';
    const validTimeframes = ['1h', '4h', '1d', '1w'];

    if (!validTimeframes.includes(timeframe)) {
      return res.status(400).json({
        error: `Invalid timeframe. Valid options: ${validTimeframes.join(', ')}`
      });
    }

    const chartData = await getChartData(timeframe);
    res.json(chartData);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get available timeframes
router.get('/timeframes', (req, res) => {
  res.json(getAvailableTimeframes());
});

// Get price changes
router.get('/changes', async (req, res) => {
  try {
    const changes = await getPriceChanges();
    res.json(changes);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

export default router;
