import { ArrowUpCircle, ArrowDownCircle, MinusCircle, Clock } from 'lucide-react';

const signalIcons = {
  STRONG_BUY: <ArrowUpCircle size={24} />,
  BUY: <ArrowUpCircle size={24} />,
  HOLD: <MinusCircle size={24} />,
  SELL: <ArrowDownCircle size={24} />,
  STRONG_SELL: <ArrowDownCircle size={24} />
};

const getSignalClass = (signal) => {
  if (signal?.includes('BUY')) return 'STRONG_BUY';
  if (signal?.includes('SELL')) return 'STRONG_SELL';
  return 'HOLD';
};

const getSignalColor = (signal) => {
  if (signal?.includes('BUY')) return 'var(--accent-green)';
  if (signal?.includes('SELL')) return 'var(--accent-red)';
  return 'var(--accent-yellow)';
};

function TimeframeSignal({ data, icon }) {
  if (!data) return null;

  return (
    <div className="timeframe-signal">
      <div className="timeframe-header">
        {icon}
        <span className="timeframe-label">{data.timeframeLabel}</span>
      </div>
      <div
        className="timeframe-badge"
        style={{
          backgroundColor: `${getSignalColor(data.signal)}20`,
          color: getSignalColor(data.signal),
          borderColor: getSignalColor(data.signal)
        }}
      >
        {signalIcons[data.signal]}
        <span>{data.signal}</span>
      </div>
      <div className="timeframe-score">
        Оценка: <strong>{data.score?.toFixed(0)}</strong>
      </div>
      {data.reasoning?.length > 0 && (
        <div className="timeframe-reasoning">
          {data.reasoning.slice(0, 2).map((r, i) => (
            <div key={i} className="reasoning-item">• {r}</div>
          ))}
        </div>
      )}
    </div>
  );
}

export default function SignalCard({ signal }) {
  if (!signal) return <div className="card signal-card loading"><div className="spinner" /></div>;

  const { signal: signalType, totalScore, intraday, shortTerm, mediumTerm, longTerm } = signal;

  return (
    <div className="card signal-card">
      <div className="card-header">
        <span className="card-title">Торговые сигналы</span>
      </div>

      <div className={`signal-badge ${getSignalClass(signalType)}`}>
        {signalIcons[signalType]}
        {signalType}
      </div>

      <div className="signal-score">
        Общая оценка: <strong>{totalScore?.toFixed(0)}</strong> / 100
      </div>

      <div className="timeframes-container">
        <TimeframeSignal data={intraday} icon={<Clock size={14} />} />
        <TimeframeSignal data={shortTerm} icon={<Clock size={14} />} />
        <TimeframeSignal data={mediumTerm} icon={<Clock size={14} />} />
        <TimeframeSignal data={longTerm} icon={<Clock size={14} />} />
      </div>
    </div>
  );
}
