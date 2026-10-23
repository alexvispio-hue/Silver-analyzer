import { TrendingUp, TrendingDown, Minus } from 'lucide-react';

export default function FundamentalPanel({ data }) {
  if (!data) return <div className="card fundamental-card loading"><div className="spinner" /></div>;
  const metrics = [
    ['Эффективная ставка ФРС', data.fedFundsRate],
    ['Инфляция США', data.metrics?.inflationYoy],
    ['Инфляционные ожидания, 10 лет', data.metrics?.breakeven],
    ['Безработица США', data.metrics?.unemployment],
    ['Изменение занятости', data.metrics?.payrollsChange],
    ['Розничные продажи', data.metrics?.retailChange]
  ];
  return (
    <div className="card fundamental-card">
      <div className="card-header"><span className="card-title">Макроэкономика · FRED</span></div>
      <p className="data-note">Последние опубликованные значения. Дата указывает период наблюдения; месячные показатели публикуются с задержкой.{data.stale && ' Источник недоступен — показаны сохранённые данные.'}</p>
      <div className="fundamental-grid">
        {metrics.map(([label, item]) => <div className="fundamental-item" key={label}>
          <div className="fundamental-label">{label}</div>
          <div className="fundamental-value">{Number.isFinite(item?.value) ? item.value.toLocaleString('ru-RU', { maximumFractionDigits: 2 }) : 'Н/Д'} {Number.isFinite(item?.value) && item?.unit}</div>
          <div className="data-note">{item?.date || 'Данные недоступны'}</div>
          {item?.url && <a href={item.url} target="_blank" rel="noopener noreferrer" className="source-link">{item.source} ↗</a>}
        </div>)}
      </div>
      <p className="data-note">Влияние ставки — эвристическая интерпретация изменения опубликованных данных.</p>
      {data.keyFactors?.map(factor => <div key={factor.factor}>
        {factor.impact === 'BULLISH' ? <TrendingUp size={14} /> : factor.impact === 'BEARISH' ? <TrendingDown size={14} /> : <Minus size={14} />}
        {' '}{factor.factor}: {factor.description}
      </div>)}
      <p className="data-note">{data.calendarStatus}</p>
    </div>
  );
}
