const API_BASE = '/api';

async function fetchApi(endpoint) {
  const response = await fetch(`${API_BASE}${endpoint}`, { signal: AbortSignal.timeout(25000) });
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
  let ws;
  let timer;
  let disposed = false;
  function connect() {
    ws = new WebSocket(`${protocol}//${window.location.host}/ws`);

    ws.onopen = () => console.log('WebSocket connected');
    ws.onmessage = (event) => {
      try { onMessage(JSON.parse(event.data)); }
      catch (error) { console.error('Invalid WebSocket message:', error); }
    };
    ws.onerror = (error) => console.error('WebSocket error:', error);
    ws.onclose = () => {
      if (!disposed) timer = setTimeout(connect, 5000);
    };
  }
  connect();
  return { close() { disposed = true; clearTimeout(timer); ws?.close(); } };
}
