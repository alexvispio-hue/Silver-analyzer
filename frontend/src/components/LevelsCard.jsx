function normalizeLevel(level) {
  const value = Number(level?.price ?? level);
  return Number.isFinite(value) ? value : null;
}

export default function LevelsCard({ levels, currentPrice, volumeClusters, longTermSupports }) {
  if (!levels) return <div className="card levels-card loading"><div className="spinner" /></div>;

  const support = (levels.support || []).map(normalizeLevel).filter(Number.isFinite);
  const resistance = (levels.resistance || []).map(normalizeLevel).filter(Number.isFinite);
  const supportZones = volumeClusters?.support || [];
  const resistanceZones = volumeClusters?.resistance || [];

  return (
    <div className="card levels-card">
      <div className="card-header">
        <span className="card-title">Поддержка и сопротивление</span>
      </div>

      <div className="levels-list">
        {resistance.slice().reverse().map((level, i) => (
          <div key={`r-${i}`} className="level-item">
            <span className="level-type resistance">R{resistance.length - i}</span>
            <span className="level-price">${level.toFixed(2)}</span>
            <span style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>
              {currentPrice ? `${(((level - currentPrice) / currentPrice) * 100).toFixed(1)}%` : ''}
            </span>
          </div>
        ))}

        {currentPrice && (
          <div className="level-item" style={{ background: 'rgba(52, 152, 219, 0.2)' }}>
            <span style={{ color: 'var(--accent-blue)', fontWeight: 600 }}>Текущая</span>
            <span className="level-price" style={{ color: 'var(--accent-blue)' }}>
              ${currentPrice.toFixed(2)}
            </span>
            <span />
          </div>
        )}

        {support.map((level, i) => (
          <div key={`s-${i}`} className="level-item">
            <span className="level-type support">S{i + 1}</span>
            <span className="level-price">${level.toFixed(2)}</span>
            <span style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>
              {currentPrice ? `${(((level - currentPrice) / currentPrice) * 100).toFixed(1)}%` : ''}
            </span>
          </div>
        ))}
      </div>

      {(supportZones.length > 0 || resistanceZones.length > 0) && (
        <div className="cluster-section">
          <div className="cluster-title">Локальные кластеры (накопления/объём)</div>

          {[...resistanceZones, ...supportZones].slice(0, 6).map((zone, index) => (
            <div key={`cluster-${index}-${zone.low}-${zone.high}`} className="cluster-item">
              <span className={`cluster-type ${zone.type}`}>{zone.type === 'support' ? 'SUP' : 'RES'}</span>
              <span className="cluster-range">{zone.low}-{zone.high}</span>
              <span className="cluster-meta">{zone.volumeShare}% объёма</span>
            </div>
          ))}
        </div>
      )}

      {(longTermSupports?.sma100 || longTermSupports?.sma200) && (
        <div className="cluster-section">
          <div className="cluster-title">Долгосрочные опоры</div>
          {longTermSupports?.sma100 && (
            <div className="cluster-item">
              <span className={`cluster-type ${longTermSupports.sma100.status === 'above' ? 'support' : 'resistance'}`}>SMA100</span>
              <span className="cluster-range">${longTermSupports.sma100.level.toFixed(2)}</span>
              <span className="cluster-meta">{longTermSupports.sma100.distancePercent.toFixed(2)}%</span>
            </div>
          )}
          {longTermSupports?.sma200 && (
            <div className="cluster-item">
              <span className={`cluster-type ${longTermSupports.sma200.status === 'above' ? 'support' : 'resistance'}`}>SMA200</span>
              <span className="cluster-range">${longTermSupports.sma200.level.toFixed(2)}</span>
              <span className="cluster-meta">{longTermSupports.sma200.distancePercent.toFixed(2)}%</span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
