const API_BASE = '/api';

async function fetchApi(endpoint) {
  const response = await fetch(`${API_BASE}${endpoint}`);
  if (!response.ok) {
    throw new Error(`API Error: ${response.status}`);
  }
  return response.json();
}

export const api = {
  // Price endpoints
  getCurrentPrice: () => fetchApi('/price/current'),
  getPriceHistory: (period = '3mo') => fetchApi(`/price/history?period=${period}`),
  getChartData: (timeframe = '1d') => fetchApi(`/price/chart?timeframe=${timeframe}`),
  getTimeframes: () => fetchApi('/price/timeframes'),
  getPriceChanges: () => fetchApi('/price/changes'),

  // Analysis endpoints
  getTechnicalAnalysis: () => fetchApi('/analysis/technical'),
  getFundamentalData: () => fetchApi('/analysis/fundamental'),

  // News endpoints
  getNews: () => fetchApi('/news'),
  getNewsSentiment: () => fetchApi('/news/sentiment'),

  // Signal endpoints
  getCurrentSignal: () => fetchApi('/signals/current'),
  getSignalHistory: (limit = 50) => fetchApi(`/signals/history?limit=${limit}`),
  getSignalStats: () => fetchApi('/signals/stats'),

  // Dashboard (all data)
  getDashboard: () => fetchApi('/dashboard')
};

// WebSocket connection
export function createWebSocket(onMessage) {
  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  const ws = new WebSocket(`${protocol}//localhost:3001`);

  ws.onopen = () => {
    console.log('WebSocket connected');
  };

  ws.onmessage = (event) => {
    const data = JSON.parse(event.data);
    onMessage(data);
  };

  ws.onerror = (error) => {
    console.error('WebSocket error:', error);
  };

  ws.onclose = () => {
    console.log('WebSocket disconnected, reconnecting...');
    setTimeout(() => createWebSocket(onMessage), 5000);
  };

  return ws;
}
