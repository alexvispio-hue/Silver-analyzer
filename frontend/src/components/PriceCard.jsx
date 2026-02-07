import { TrendingUp, TrendingDown } from 'lucide-react';

export default function PriceCard({ price, changes }) {
  if (!price) return <div className="card price-card loading"><div className="spinner" /></div>;

  const isPositive = price.change >= 0;

  return (
    <div className="card price-card">
      <div className="card-header">
        <span className="card-title">Серебро XAGUSD</span>
      </div>

      <div className="current-price">${price.price?.toFixed(2)}</div>

      <div className={`price-change ${isPositive ? 'positive' : 'negative'}`}>
        {isPositive ? <TrendingUp size={20} /> : <TrendingDown size={20} />}
        {isPositive ? '+' : ''}{price.change?.toFixed(2)} ({price.changePercent?.toFixed(2)}%)
      </div>

      {changes && (
        <div className="price-periods">
          <div className="period-item">
            <div className="period-label">1Д</div>
            <div className={`period-value ${changes.day?.changePercent >= 0 ? 'positive' : 'negative'}`}>
              {changes.day?.changePercent >= 0 ? '+' : ''}{changes.day?.changePercent?.toFixed(2)}%
            </div>
          </div>
          <div className="period-item">
            <div className="period-label">1Н</div>
            <div className={`period-value ${changes.week?.changePercent >= 0 ? 'positive' : 'negative'}`}>
              {changes.week?.changePercent >= 0 ? '+' : ''}{changes.week?.changePercent?.toFixed(2)}%
            </div>
          </div>
          <div className="period-item">
            <div className="period-label">1М</div>
            <div className={`period-value ${changes.month?.changePercent >= 0 ? 'positive' : 'negative'}`}>
              {changes.month?.changePercent >= 0 ? '+' : ''}{changes.month?.changePercent?.toFixed(2)}%
            </div>
          </div>
          <div className="period-item">
            <div className="period-label">3М</div>
            <div className={`period-value ${changes.threeMonths?.changePercent >= 0 ? 'positive' : 'negative'}`}>
              {changes.threeMonths?.changePercent >= 0 ? '+' : ''}{changes.threeMonths?.changePercent?.toFixed(2)}%
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
