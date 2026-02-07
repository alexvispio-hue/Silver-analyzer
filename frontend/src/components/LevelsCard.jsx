export default function LevelsCard({ levels, currentPrice }) {
  if (!levels) return <div className="card levels-card loading"><div className="spinner" /></div>;

  const { support, resistance } = levels;

  return (
    <div className="card levels-card">
      <div className="card-header">
        <span className="card-title">Поддержка и сопротивление</span>
      </div>

      <div className="levels-list">
        {resistance?.slice().reverse().map((level, i) => (
          <div key={`r-${i}`} className="level-item">
            <span className="level-type resistance">С{resistance.length - i}</span>
            <span className="level-price">${level.toFixed(2)}</span>
            <span style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>
              {currentPrice ? `${((level - currentPrice) / currentPrice * 100).toFixed(1)}%` : ''}
            </span>
          </div>
        ))}

        {currentPrice && (
          <div className="level-item" style={{ background: 'rgba(52, 152, 219, 0.2)' }}>
            <span style={{ color: 'var(--accent-blue)', fontWeight: 600 }}>Текущая</span>
            <span className="level-price" style={{ color: 'var(--accent-blue)' }}>
              ${currentPrice.toFixed(2)}
            </span>
            <span></span>
          </div>
        )}

        {support?.map((level, i) => (
          <div key={`s-${i}`} className="level-item">
            <span className="level-type support">П{i + 1}</span>
            <span className="level-price">${level.toFixed(2)}</span>
            <span style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>
              {currentPrice ? `${((level - currentPrice) / currentPrice * 100).toFixed(1)}%` : ''}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
