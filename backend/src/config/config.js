import dotenv from 'dotenv';
dotenv.config();

export const config = {
  port: process.env.PORT || 3001,

  // API Keys
  newsApiKey: process.env.NEWS_API_KEY || '',
  fredApiKey: process.env.FRED_API_KEY || '',

  // Update intervals (in milliseconds)
  priceUpdateInterval: 60 * 1000,      // 1 minute
  newsUpdateInterval: 15 * 60 * 1000,  // 15 minutes
  fundamentalUpdateInterval: 60 * 60 * 1000, // 1 hour

  // Symbol
  symbol: 'XAGUSD=X' // Yahoo Finance symbol for Silver
};
