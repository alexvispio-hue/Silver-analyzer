import express from 'express';
import cors from 'cors';
import { WebSocketServer } from 'ws';
import { createServer } from 'http';

import { config } from './config/config.js';
import priceRoutes from './routes/price.js';
import analysisRoutes from './routes/analysis.js';
import newsRoutes from './routes/news.js';
import signalsRoutes from './routes/signals.js';

import { getCurrentPrice } from './services/priceService.js';
import { generateSignal, updateSignalOutcomes } from './services/signalService.js';

const app = express();
const server = createServer(app);

// WebSocket setup
const wss = new WebSocketServer({ server });

// Middleware
app.use(cors());
app.use(express.json());

// API Routes
app.use('/api/price', priceRoutes);
app.use('/api/analysis', analysisRoutes);
app.use('/api/news', newsRoutes);
app.use('/api/signals', signalsRoutes);

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Get all dashboard data in one request
app.get('/api/dashboard', async (req, res) => {
  try {
    const [price, signal] = await Promise.all([
      getCurrentPrice(),
      generateSignal()
    ]);

    res.json({
      price,
      signal,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// WebSocket connections
const clients = new Set();

wss.on('connection', (ws) => {
  console.log('Client connected');
  clients.add(ws);

  ws.on('close', () => {
    console.log('Client disconnected');
    clients.delete(ws);
  });

  ws.on('error', (error) => {
    console.error('WebSocket error:', error);
    clients.delete(ws);
  });
});

// Broadcast to all connected clients
function broadcast(data) {
  const message = JSON.stringify(data);
  clients.forEach(client => {
    if (client.readyState === 1) { // OPEN
      client.send(message);
    }
  });
}

// Periodic updates
async function sendPriceUpdate() {
  try {
    const price = await getCurrentPrice();
    broadcast({ type: 'price', data: price });
  } catch (error) {
    console.error('Price update error:', error.message);
  }
}

async function sendSignalUpdate() {
  try {
    const signal = await generateSignal();
    broadcast({ type: 'signal', data: signal });
  } catch (error) {
    console.error('Signal update error:', error);
  }
}

// Start periodic tasks
setInterval(sendPriceUpdate, config.priceUpdateInterval);
setInterval(sendSignalUpdate, 5 * 60 * 1000); // Every 5 minutes
setInterval(updateSignalOutcomes, 60 * 60 * 1000); // Every hour

// Start server
server.listen(config.port, () => {
  console.log(`
╔═══════════════════════════════════════════════════════════╗
║          XAGUSD Silver Analyzer Backend                    ║
║                                                            ║
║  Server running on http://localhost:${config.port}                ║
║  WebSocket on ws://localhost:${config.port}                       ║
║                                                            ║
║  API Endpoints:                                            ║
║  - GET /api/price/current     - Current silver price       ║
║  - GET /api/price/history     - Historical data            ║
║  - GET /api/analysis/technical - Technical analysis        ║
║  - GET /api/analysis/fundamental - Fundamental data        ║
║  - GET /api/news              - Latest news                ║
║  - GET /api/signals/current   - Current trading signal     ║
║  - GET /api/signals/history   - Signal history             ║
║  - GET /api/dashboard         - All dashboard data         ║
╚═══════════════════════════════════════════════════════════╝
  `);
});
