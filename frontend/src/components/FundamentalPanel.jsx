import { TrendingUp, TrendingDown, Minus } from 'lucide-react';

export default function FundamentalPanel({ data }) {
  if (!data) return <div className="card fundamental-card loading"><div className="spinner" /></div>;

  const getImpactIcon = (impact) => {
    switch (impact) {
      case 'BULLISH':
        return <TrendingUp size={14} color="var(--accent-green)" />;
      case 'BEARISH':
        return <TrendingDown size={14} color="var(--accent-red)" />;
      default:
        return <Minus size={14} color="var(--text-secondary)" />;
    }
  };

  const getImpactColor = (impact) => {
    switch (impact) {
      case 'BULLISH': return 'var(--accent-green)';
      case 'BEARISH': return 'var(--accent-red)';
      default: return 'var(--text-secondary)';
    }
  };

  const formatEventValue = (value) => {
    if (value === null || value === undefined) return '—';
    const text = String(value).trim();
    return text.length ? text : '—';
  };

  return (
    <div className="card fundamental-card">
      <div className="card-header">
        <span className="card-title">Фундаментальный анализ</span>
      </div>

      <div className="fundamental-grid">
        <div className="fundamental-item">
          <div className="fundamental-label">Ставка ФРС</div>
          <div className="fundamental-value">{data.fedFundsRate?.value || 'Н/Д'}%</div>
          <div className="fundamental-impact" style={{ color: 'var(--text-secondary)', fontSize: '11px' }}>
            {data.fedFundsRate?.outlook?.slice(0, 50)}...
          </div>
        </div>

        <div className="fundamental-item">
          <div className="fundamental-label">Спрос/Предложение</div>
          <div className="fundamental-value" style={{ color: 'var(--accent-green)' }}>
            Дефицит {data.silverMarket?.supplyDemand?.deficit || 'Н/Д'}т
          </div>
          <div className="fundamental-impact" style={{ color: 'var(--accent-green)', fontSize: '11px' }}>
            Бычий для серебра
          </div>
        </div>

        <div className="fundamental-item" style={{ gridColumn: 'span 2' }}>
          <div className="fundamental-label">Крупнейшие потребители серебра (2024)</div>
          <div style={{ display: 'flex', gap: '8px', marginTop: '8px', flexWrap: 'wrap' }}>
            {data.silverMarket?.topConsumers?.slice(0, 4).map((c, i) => (
              <div
                key={i}
                style={{
                  background: 'var(--bg-primary)',
                  padding: '6px 10px',
                  borderRadius: '6px',
                  fontSize: '12px'
                }}
              >
                {c.country}: {c.share}%
              </div>
            ))}
          </div>
        </div>

        <div className="fundamental-item" style={{ gridColumn: 'span 2' }}>
          <div className="fundamental-label">Ключевые факторы</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', marginTop: '8px' }}>
            {data.keyFactors?.map((factor, i) => (
              <div
                key={i}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  fontSize: '12px'
                }}
              >
                {getImpactIcon(factor.impact)}
                <span style={{ color: getImpactColor(factor.impact), fontWeight: 500 }}>
                  {factor.factor}
                </span>
                <span style={{ color: 'var(--text-secondary)' }}>
                  - {factor.description}
                </span>
              </div>
            ))}
          </div>
        </div>

        <div className="fundamental-item" style={{ gridColumn: 'span 2' }}>
          <div className="fundamental-label">Ближайшие события США</div>
          {data.upcomingEvents?.length ? (
            <div className="events-table-wrap">
              <table className="events-table">
                <thead>
                  <tr>
                    <th>Событие</th>
                    <th>Дата/время (МСК)</th>
                    <th>Прогноз</th>
                    <th>Предыдущее</th>
                    <th>Факт</th>
                  </tr>
                </thead>
                <tbody>
                  {data.upcomingEvents.map((item, i) => (
                    <tr key={`${item.event}-${item.timestamp}-${i}`}>
                      <td>{item.event}</td>
                      <td>{item.mskTime}</td>
                      <td>{formatEventValue(item.forecast)}</td>
                      <td>{formatEventValue(item.previous)}</td>
                      <td>{formatEventValue(item.actual)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="fundamental-impact">Нет ближайших событий</div>
          )}
        </div>
      </div>
    </div>
  );
}
