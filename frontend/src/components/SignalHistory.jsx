import { CheckCircle, XCircle, Clock } from 'lucide-react';

export default function SignalHistory({ history, stats }) {
  if (!history) return <div className="card history-card loading"><div className="spinner" /></div>;

  const formatDate = (dateStr) => {
    return new Date(dateStr).toLocaleString('ru-RU', {
      day: '2-digit',
      month: '2-digit',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  const getSignalColor = (signal) => {
    if (signal?.includes('ПОКУПАТЬ') || signal?.includes('BUY')) return 'var(--accent-green)';
    if (signal?.includes('ПРОДАВАТЬ') || signal?.includes('SELL')) return 'var(--accent-red)';
    return 'var(--accent-yellow)';
  };

  const getOutcomeIcon = (outcome) => {
    if (outcome === 'correct') return <CheckCircle size={16} color="var(--accent-green)" />;
    if (outcome === 'incorrect') return <XCircle size={16} color="var(--accent-red)" />;
    return <Clock size={16} color="var(--text-secondary)" />;
  };

  const formatSignal = (signal) => {
    return signal?.replace('_', ' ') || signal;
  };

  return (
    <div className="card history-card">
      <div className="card-header">
        <span className="card-title">История сигналов</span>
        {stats && (
          <div style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>
            Точность: <span style={{ color: 'var(--accent-green)', fontWeight: 600 }}>
              {stats.accuracy}%
            </span> ({stats.correctSignals}/{stats.totalSignals} сигналов)
          </div>
        )}
      </div>

      {history.length === 0 ? (
        <div style={{ color: 'var(--text-secondary)', textAlign: 'center', padding: '40px' }}>
          История сигналов пуста. Сигналы появятся здесь после первого анализа.
        </div>
      ) : (
        <table className="history-table">
          <thead>
            <tr>
              <th>Дата</th>
              <th>Сигнал</th>
              <th>Цена</th>
              <th>Оценка</th>
              <th>Через 24ч</th>
              <th>Результат</th>
            </tr>
          </thead>
          <tbody>
            {history.slice(0, 20).map((item, i) => (
              <tr key={i}>
                <td>{formatDate(item.timestamp)}</td>
                <td style={{ color: getSignalColor(item.signal), fontWeight: 600 }}>
                  {formatSignal(item.signal)}
                </td>
                <td>${item.priceAtSignal?.toFixed(2)}</td>
                <td>{item.totalScore?.toFixed(0)}</td>
                <td>
                  {item.priceAfter24h ? (
                    <span style={{
                      color: item.priceAfter24h > item.priceAtSignal ?
                        'var(--accent-green)' : 'var(--accent-red)'
                    }}>
                      ${item.priceAfter24h?.toFixed(2)}
                      ({((item.priceAfter24h - item.priceAtSignal) / item.priceAtSignal * 100).toFixed(1)}%)
                    </span>
                  ) : (
                    <span style={{ color: 'var(--text-secondary)' }}>Ожидание</span>
                  )}
                </td>
                <td>{getOutcomeIcon(item.outcome)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
