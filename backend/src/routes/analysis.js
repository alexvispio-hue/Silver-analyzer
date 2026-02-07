import { Router } from 'express';
import { getTechnicalAnalysis } from '../services/technicalAnalysis.js';
import { getFundamentalData } from '../services/fundamentalService.js';

const router = Router();

// Get technical analysis
router.get('/technical', async (req, res) => {
  try {
    const analysis = await getTechnicalAnalysis();
    res.json(analysis);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get fundamental analysis
router.get('/fundamental', async (req, res) => {
  try {
    const data = await getFundamentalData();
    res.json(data);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

export default router;
