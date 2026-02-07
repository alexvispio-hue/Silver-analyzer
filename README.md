# XAGUSD Silver Analyzer

Веб-приложение для анализа цены серебра (XAGUSD) с рекомендательными торговыми сигналами.

## Функциональность

- **Технический анализ**: RSI, MACD, SMA, уровни поддержки/сопротивления
- **Фундаментальный анализ**: ставка ФРС, инфляция, баланс спроса/предложения
- **Новостной анализ**: агрегация новостей с sentiment-анализом
- **Торговые сигналы**: STRONG BUY / BUY / HOLD / SELL / STRONG SELL
- **История сигналов**: отслеживание точности прогнозов

## Установка

### Требования
- Node.js 18+
- npm или yarn

### 1. Получите бесплатные API ключи

- **NewsAPI**: https://newsapi.org/register
- **FRED API**: https://fred.stlouisfed.org/docs/api/api_key.html

### 2. Настройте backend

```bash
cd backend

# Создайте файл .env из примера
cp .env.example .env

# Добавьте ваши API ключи в .env
# NEWS_API_KEY=your_key
# FRED_API_KEY=your_key

# Установите зависимости
npm install

# Запустите сервер
npm run dev
```

Backend будет доступен на http://localhost:3001

### 3. Настройте frontend

```bash
cd frontend

# Установите зависимости
npm install

# Запустите dev сервер
npm run dev
```

Frontend будет доступен на http://localhost:5173

## API Endpoints

| Endpoint | Описание |
|----------|----------|
| `GET /api/price/current` | Текущая цена серебра |
| `GET /api/price/history` | Исторические данные |
| `GET /api/analysis/technical` | Технический анализ |
| `GET /api/analysis/fundamental` | Фундаментальные данные |
| `GET /api/news` | Новости рынка |
| `GET /api/signals/current` | Текущий торговый сигнал |
| `GET /api/signals/history` | История сигналов |
| `GET /api/dashboard` | Все данные дашборда |

## Структура проекта

```
silver-analyzer/
├── backend/
│   ├── src/
│   │   ├── server.js           # Express сервер
│   │   ├── config/             # Конфигурация
│   │   ├── services/           # Бизнес-логика
│   │   ├── routes/             # API эндпоинты
│   │   ├── models/             # SQLite БД
│   │   └── utils/              # Индикаторы
│   └── package.json
├── frontend/
│   ├── src/
│   │   ├── App.jsx             # Главный компонент
│   │   ├── components/         # UI компоненты
│   │   └── services/           # API клиент
│   └── package.json
└── README.md
```

## Технологии

- **Backend**: Node.js, Express, SQLite, WebSocket
- **Frontend**: React, Recharts, Vite
- **Данные**: Yahoo Finance, NewsAPI, FRED API

## Ограничения

- NewsAPI бесплатный план: 100 запросов/день
- Yahoo Finance: рекомендуется не чаще 1 раз/мин
- Сигналы носят информационный характер и не являются финансовой рекомендацией

## Лицензия

MIT
