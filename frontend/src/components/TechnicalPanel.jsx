export default function TechnicalPanel({ analysis }) {
  if (!analysis) return <div className="card technical-card loading"><div className="spinner" /></div>;

  const { indicators, trend } = analysis;

  const getRsiStatus = (rsi) => {
    if (!rsi) return { text: 'Н/Д', class: 'neutral' };
    if (rsi < 30) return { text: 'Перепродано', class: 'bullish' };
    if (rsi > 70) return { text: 'Перекуплено', class: 'bearish' };
    return { text: 'Нейтрально', class: 'neutral' };
  };

  const getMacdStatus = (macd) => {
    if (!macd || !macd.histogram) return { text: 'Н/Д', class: 'neutral' };
    if (macd.histogram > 0) return { text: 'Бычий', class: 'bullish' };
    return { text: 'Медвежий', class: 'bearish' };
  };

  const getTrendStatus = (trend) => {
    if (trend === 'UPTREND') return { text: 'Восходящий', class: 'bullish' };
    if (trend === 'DOWNTREND') return { text: 'Нисходящий', class: 'bearish' };
    return { text: 'Боковой', class: 'neutral' };
  };

  const rsiStatus = getRsiStatus(indicators?.rsi);
  const macdStatus = getMacdStatus(indicators?.macd);
  const trendStatus = getTrendStatus(trend);

  return (
    <div className="card technical-card">
      <div className="card-header">
        <span className="card-title">Технический анализ</span>
      </div>

      <div className="indicators-grid">
        <div className="indicator-item">
          <div className="indicator-label">RSI (14)</div>
          <div className="indicator-value">{indicators?.rsi?.toFixed(1) || 'Н/Д'}</div>
          <div className={`indicator-status ${rsiStatus.class}`}>{rsiStatus.text}</div>
        </div>

        <div className="indicator-item">
          <div className="indicator-label">MACD</div>
          <div className="indicator-value">{indicators?.macd?.macd?.toFixed(3) || 'Н/Д'}</div>
          <div className={`indicator-status ${macdStatus.class}`}>{macdStatus.text}</div>
        </div>

        <div className="indicator-item">
          <div className="indicator-label">SMA 20</div>
          <div className="indicator-value">${indicators?.sma20?.toFixed(2) || 'Н/Д'}</div>
        </div>

        <div className="indicator-item">
          <div className="indicator-label">SMA 50</div>
          <div className="indicator-value">${indicators?.sma50?.toFixed(2) || 'Н/Д'}</div>
        </div>

        <div className="indicator-item">
          <div className="indicator-label">Тренд</div>
          <div className={`indicator-value indicator-status ${trendStatus.class}`}>
            {trendStatus.text}
          </div>
        </div>

        <div className="indicator-item">
          <div className="indicator-label">Боллинджер</div>
          <div className="indicator-value" style={{ fontSize: '12px' }}>
            {indicators?.bollingerBands?.upper?.toFixed(2) || 'Н/Д'} / {indicators?.bollingerBands?.lower?.toFixed(2) || 'Н/Д'}
          </div>
          <div className="indicator-status neutral">Верх / Низ</div>
        </div>
      </div>
    </div>
  );
}
