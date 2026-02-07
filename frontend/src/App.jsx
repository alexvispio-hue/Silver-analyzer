import { useState, useEffect } from 'react';
import { api, createWebSocket } from './services/api';

import PriceCard from './components/PriceCard';
import SignalCard from './components/SignalCard';
import TechnicalPanel from './components/TechnicalPanel';
import PriceChart from './components/PriceChart';
import LevelsCard from './components/LevelsCard';
import NewsPanel from './components/NewsPanel';
import FundamentalPanel from './components/FundamentalPanel';
import SignalHistory from './components/SignalHistory';

export default function App() {
  const [price, setPrice] = useState(null);
  const [priceChanges, setPriceChanges] = useState(null);
  const [priceHistory, setPriceHistory] = useState([]);
  const [signal, setSignal] = useState(null);
  const [technical, setTechnical] = useState(null);
  const [fundamental, setFundamental] = useState(null);
  const [news, setNews] = useState([]);
  const [signalHistory, setSignalHistory] = useState([]);
  const [signalStats, setSignalStats] = useState(null);
  const [lastUpdate, setLastUpdate] = useState(null);
  const [error, setError] = useState(null);

  // Initial data fetch
  useEffect(() => {
    async function fetchAllData() {
      try {
        setError(null);

        const [
          priceData,
          changesData,
          historyData,
          signalData,
          technicalData,
          fundamentalData,
          newsData,
          historySignals,
          statsData
        ] = await Promise.all([
          api.getCurrentPrice(),
          api.getPriceChanges(),
          api.getPriceHistory('3mo'),
          api.getCurrentSignal(),
          api.getTechnicalAnalysis(),
          api.getFundamentalData(),
          api.getNews(),
          api.getSignalHistory(20),
          api.getSignalStats()
        ]);

        setPrice(priceData);
        setPriceChanges(changesData);
        setPriceHistory(historyData);
        setSignal(signalData);
        setTechnical(technicalData);
        setFundamental(fundamentalData);
        setNews(newsData);
        setSignalHistory(historySignals);
        setSignalStats(statsData);
        setLastUpdate(new Date());
      } catch (err) {
        console.error('Error fetching data:', err);
        setError('Не удалось загрузить данные. Убедитесь, что бэкенд запущен на порту 3001.');
      }
    }

    fetchAllData();

    // Refresh data every 5 minutes
    const interval = setInterval(fetchAllData, 5 * 60 * 1000);
    return () => clearInterval(interval);
  }, []);

  // WebSocket for real-time updates
  useEffect(() => {
    const ws = createWebSocket((data) => {
      if (data.type === 'price') {
        setPrice(data.data);
        setLastUpdate(new Date());
      } else if (data.type === 'signal') {
        setSignal(data.data);
      }
    });

    return () => ws.close();
  }, []);

  return (
    <div className="app">
      <header className="header">
        <h1>
          <svg width="32" height="32" viewBox="0 0 32 32" fill="none">
            <circle cx="16" cy="16" r="14" fill="url(#silver-gradient)" />
            <text x="16" y="21" textAnchor="middle" fontSize="14" fontWeight="bold" fill="#333">Ag</text>
            <defs>
              <linearGradient id="silver-gradient" x1="0" y1="0" x2="32" y2="32">
                <stop stopColor="#e8e8e8" />
                <stop offset="1" stopColor="#a0a0a0" />
              </linearGradient>
            </defs>
          </svg>
          <span>Анализатор серебра XAGUSD</span>
        </h1>
        <div className="last-update">
          {lastUpdate && `Обновлено: ${lastUpdate.toLocaleTimeString('ru-RU')}`}
        </div>
      </header>

      {error && (
        <div style={{
          background: 'rgba(255, 71, 87, 0.15)',
          border: '1px solid var(--accent-red)',
          borderRadius: '8px',
          padding: '16px',
          marginBottom: '20px',
          color: 'var(--accent-red)'
        }}>
          {error}
        </div>
      )}

      <div className="dashboard">
        <PriceCard price={price} changes={priceChanges} />
        <SignalCard signal={signal} />
        <TechnicalPanel analysis={technical} />

        <PriceChart history={priceHistory} levels={technical?.levels} />
        <LevelsCard levels={technical?.levels} currentPrice={price?.price} />

        <NewsPanel news={news} />
        <FundamentalPanel data={fundamental} />

        <SignalHistory history={signalHistory} stats={signalStats} />
      </div>
    </div>
  );
}
