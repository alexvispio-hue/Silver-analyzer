import { Newspaper } from 'lucide-react';

export default function NewsPanel({ news }) {
  if (!news) return <div className="card news-card loading"><div className="spinner" /></div>;

  const formatDate = (dateStr) => {
    const date = new Date(dateStr);
    const now = new Date();
    const diff = (now - date) / 1000 / 60; // minutes

    if (diff < 60) return `${Math.round(diff)} мин назад`;
    if (diff < 1440) return `${Math.round(diff / 60)} ч назад`;
    return date.toLocaleDateString('ru-RU');
  };

  const getSentimentLabel = (label) => {
    if (label === 'BULLISH') return 'БЫЧИЙ';
    if (label === 'BEARISH') return 'МЕДВЕЖИЙ';
    return 'НЕЙТРАЛЬНО';
  };

  return (
    <div className="card news-card">
      <div className="card-header">
        <span className="card-title">
          <Newspaper size={16} style={{ marginRight: '8px' }} />
          Новости рынка
        </span>
      </div>

      <div className="news-list">
        {news.length === 0 ? (
          <div style={{ color: 'var(--text-secondary)', textAlign: 'center', padding: '20px' }}>
            Нет новостей
          </div>
        ) : (
          news.slice(0, 10).map((item, i) => (
            <div
              key={i}
              className={`news-item ${item.sentimentLabel?.toLowerCase()}`}
            >
              <div className="news-title">
                {item.url && item.url !== '#' ? (
                  <a
                    href={item.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    style={{ color: 'inherit', textDecoration: 'none' }}
                  >
                    {item.title}
                  </a>
                ) : (
                  item.title
                )}
              </div>
              <div className="news-meta">
                <span>{item.source} • {formatDate(item.publishedAt)}</span>
                <span
                  className="news-sentiment"
                  style={{
                    color: item.sentimentLabel === 'BULLISH' ? 'var(--accent-green)' :
                           item.sentimentLabel === 'BEARISH' ? 'var(--accent-red)' :
                           'var(--text-secondary)'
                  }}
                >
                  {getSentimentLabel(item.sentimentLabel)}
                </span>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
