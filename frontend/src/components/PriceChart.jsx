import { useState, useEffect } from 'react';
import {
  ComposedChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
  Cell
} from 'recharts';
import { api } from '../services/api';

const TIMEFRAMES = [
  { id: '1h', label: '1H', description: '1 час' },
  { id: '4h', label: '4H', description: '4 часа' },
  { id: '1d', label: '1D', description: '1 день' },
  { id: '1w', label: '1W', description: '1 неделя' }
];

export default function PriceChart({ history: initialHistory, levels }) {
  const [chartType, setChartType] = useState('candlestick');
  const [timeframe, setTimeframe] = useState('1d');
  const [chartData, setChartData] = useState([]);
  const [loading, setLoading] = useState(false);

  // Загружаем данные при изменении таймфрейма
  useEffect(() => {
    async function fetchChartData() {
      setLoading(true);
      try {
        const data = await api.getChartData(timeframe);
        if (data.candles && data.candles.length > 0) {
          const processed = data.candles.map(item => ({
            date: item.date,
            timestamp: item.timestamp,
            open: item.open,
            high: item.high,
            low: item.low,
            close: item.close,
            range: [item.low, item.high],
            isGreen: item.close >= item.open
          }));
          setChartData(processed);
        }
      } catch (error) {
        console.error('Error fetching chart data:', error);
        // For non-daily timeframes do not silently fall back to daily candles.
        if (timeframe === '1d' && initialHistory && initialHistory.length > 0) {
          const processed = initialHistory.map(item => ({
            date: item.date,
            open: item.open,
            high: item.high,
            low: item.low,
            close: item.close,
            range: [item.low, item.high],
            isGreen: item.close >= item.open
          }));
          setChartData(processed);
        }
      }
      setLoading(false);
    }

    fetchChartData();
  }, [timeframe, initialHistory]);

  // Инициализация при первой загрузке
  useEffect(() => {
    if (initialHistory && initialHistory.length > 0 && chartData.length === 0) {
      const processed = initialHistory.map(item => ({
        date: item.date,
        open: item.open,
        high: item.high,
        low: item.low,
        close: item.close,
        range: [item.low, item.high],
        isGreen: item.close >= item.open
      }));
      setChartData(processed);
    }
  }, [initialHistory]);

  if (loading || chartData.length === 0) {
    return <div className="card chart-card loading"><div className="spinner" /></div>;
  }

  const allPrices = chartData.flatMap(d => [d.high, d.low]);
  const minPrice = Math.min(...allPrices) * 0.98;
  const maxPrice = Math.max(...allPrices) * 1.02;

  const currentTimeframe = TIMEFRAMES.find(t => t.id === timeframe);

  return (
    <div className="card chart-card">
      <div className="card-header">
        <span className="card-title">График цены ({currentTimeframe?.description || timeframe})</span>
        <div className="chart-controls">
          {/* Выбор таймфрейма */}
          <div className="timeframe-toggle">
            {TIMEFRAMES.map(tf => (
              <button
                key={tf.id}
                className={`toggle-btn ${timeframe === tf.id ? 'active' : ''}`}
                onClick={() => setTimeframe(tf.id)}
                title={tf.description}
              >
                {tf.label}
              </button>
            ))}
          </div>
          {/* Тип графика */}
          <div className="chart-type-toggle">
            <button
              className={`toggle-btn ${chartType === 'candlestick' ? 'active' : ''}`}
              onClick={() => setChartType('candlestick')}
            >
              Свечи
            </button>
            <button
              className={`toggle-btn ${chartType === 'bar' ? 'active' : ''}`}
              onClick={() => setChartType('bar')}
            >
              Бары
            </button>
          </div>
        </div>
      </div>

      <div className="chart-container">
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={chartData} margin={{ top: 10, right: 30, left: 10, bottom: 10 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#30363d" />
            <XAxis
              dataKey="date"
              stroke="#8b949e"
              tick={{ fontSize: 11 }}
              tickFormatter={(value) => {
                const date = new Date(value);
                // Форматирование в зависимости от таймфрейма
                if (timeframe === '1h' || timeframe === '4h') {
                  return `${date.getDate()}/${date.getMonth() + 1} ${date.getHours()}:00`;
                } else if (timeframe === '1w') {
                  return `${date.getDate()}/${date.getMonth() + 1}/${date.getFullYear().toString().slice(2)}`;
                }
                return `${date.getDate()}/${date.getMonth() + 1}`;
              }}
            />
            <YAxis
              domain={[minPrice, maxPrice]}
              stroke="#8b949e"
              tick={{ fontSize: 11 }}
              tickFormatter={(value) => `$${value.toFixed(0)}`}
            />
            <Tooltip
              content={({ active, payload, label }) => {
                if (!active || !payload || !payload[0]) return null;
                const data = payload[0].payload;
                return (
                  <div style={{
                    backgroundColor: '#242b3d',
                    border: '1px solid #30363d',
                    borderRadius: '8px',
                    padding: '12px'
                  }}>
                    <div style={{ color: '#8b949e', marginBottom: '8px' }}>
                      {new Date(label).toLocaleString('ru-RU', { day: '2-digit', month: '2-digit', year: 'numeric', hour: timeframe === '1h' || timeframe === '4h' ? '2-digit' : undefined, minute: timeframe === '1h' || timeframe === '4h' ? '2-digit' : undefined })}
                    </div>
                    <div style={{ display: 'grid', gap: '4px', fontSize: '13px' }}>
                      <div>Открытие: <span style={{ color: '#fff' }}>${data.open?.toFixed(2)}</span></div>
                      <div>Максимум: <span style={{ color: '#00d26a' }}>${data.high?.toFixed(2)}</span></div>
                      <div>Минимум: <span style={{ color: '#ff4757' }}>${data.low?.toFixed(2)}</span></div>
                      <div>Закрытие: <span style={{ color: data.isGreen ? '#00d26a' : '#ff4757' }}>${data.close?.toFixed(2)}</span></div>
                    </div>
                  </div>
                );
              }}
            />

            {/* Уровни поддержки */}
            {levels?.support?.map((level, i) => (
              <ReferenceLine
                key={`support-${i}`}
                y={Number(level?.price ?? level)}
                stroke="#00d26a"
                strokeDasharray="5 5"
                strokeOpacity={0.7}
                label={{
                  value: `П${i + 1}`,
                  fill: '#00d26a',
                  fontSize: 10,
                  position: 'right'
                }}
              />
            ))}

            {/* Уровни сопротивления */}
            {levels?.resistance?.map((level, i) => (
              <ReferenceLine
                key={`resistance-${i}`}
                y={Number(level?.price ?? level)}
                stroke="#ff4757"
                strokeDasharray="5 5"
                strokeOpacity={0.7}
                label={{
                  value: `С${i + 1}`,
                  fill: '#ff4757',
                  fontSize: 10,
                  position: 'right'
                }}
              />
            ))}

            {/* Свечной/Бар график */}
            <Bar
              dataKey="range"
              barSize={chartType === 'candlestick' ? 8 : 4}
              shape={(props) => {
                const { x, y, width, height, payload } = props;
                if (!payload) return null;

                const isGreen = payload.close >= payload.open;
                const color = isGreen ? '#00d26a' : '#ff4757';

                if (chartType === 'candlestick') {
                  // Свечной график
                  const bodyHeight = Math.abs(payload.close - payload.open);
                  const wickTop = payload.high - Math.max(payload.open, payload.close);
                  const wickBottom = Math.min(payload.open, payload.close) - payload.low;
                  const totalRange = payload.high - payload.low;

                  if (totalRange === 0) return null;

                  const scale = height / totalRange;
                  const bodyY = y + (wickTop * scale);
                  const bodyH = Math.max(1, bodyHeight * scale);

                  return (
                    <g>
                      {/* Верхняя тень */}
                      <line
                        x1={x + width / 2}
                        y1={y}
                        x2={x + width / 2}
                        y2={bodyY}
                        stroke={color}
                        strokeWidth={1}
                      />
                      {/* Тело свечи */}
                      <rect
                        x={x + 1}
                        y={bodyY}
                        width={width - 2}
                        height={bodyH}
                        fill={color}
                        stroke={color}
                      />
                      {/* Нижняя тень */}
                      <line
                        x1={x + width / 2}
                        y1={bodyY + bodyH}
                        x2={x + width / 2}
                        y2={y + height}
                        stroke={color}
                        strokeWidth={1}
                      />
                    </g>
                  );
                } else {
                  // Бар (OHLC)
                  const totalRange = payload.high - payload.low;
                  if (totalRange === 0) return null;

                  const scale = height / totalRange;
                  const openY = y + ((payload.high - payload.open) * scale);
                  const closeY = y + ((payload.high - payload.close) * scale);

                  return (
                    <g>
                      {/* Вертикальная линия high-low */}
                      <line
                        x1={x + width / 2}
                        y1={y}
                        x2={x + width / 2}
                        y2={y + height}
                        stroke={color}
                        strokeWidth={1.5}
                      />
                      {/* Открытие (слева) */}
                      <line
                        x1={x}
                        y1={openY}
                        x2={x + width / 2}
                        y2={openY}
                        stroke={color}
                        strokeWidth={1.5}
                      />
                      {/* Закрытие (справа) */}
                      <line
                        x1={x + width / 2}
                        y1={closeY}
                        x2={x + width}
                        y2={closeY}
                        stroke={color}
                        strokeWidth={1.5}
                      />
                    </g>
                  );
                }
              }}
            >
              {chartData.map((entry, index) => (
                <Cell
                  key={`cell-${index}`}
                  fill={entry.isGreen ? '#00d26a' : '#ff4757'}
                />
              ))}
            </Bar>
          </ComposedChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
