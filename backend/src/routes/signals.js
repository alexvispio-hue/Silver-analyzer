import { Router } from 'express';
import {
  generateSignal,
  getSignalHistory,
  getSignalStats,
  updateSignalOutcomes
} from '../services/signalService.js';

const router = Router();

// Get current signal
router.get('/current', async (req, res) => {
  try {
    const signal = await generateSignal();
    res.json(signal);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get signal history
router.get('/history', async (req, res) => {
  try {
    await updateSignalOutcomes();
    const limit = parseInt(req.query.limit) || 50;
    const history = await getSignalHistory(limit);
    res.json(history);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get signal statistics
router.get('/stats', async (req, res) => {
  try {
    await updateSignalOutcomes();
    const stats = await getSignalStats();
    res.json(stats);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

export default router;
