const axios = require('axios');

const UPBIT_API_URL = 'https://api.upbit.com/v1';

async function getMarkets() {
  try {
    const response = await axios.get(`${UPBIT_API_URL}/market/all?isDetails=false`);
    return response.data.filter(m => m.market.startsWith('KRW-')); // KRW 마켓만
  } catch (error) {
    console.error('Error fetching markets:', error.message);
    return [];
  }
}

async function getDailyCandles(market, count = 15) {
  try {
    const response = await axios.get(`${UPBIT_API_URL}/candles/days`, {
      params: { market, count }
    });
    return response.data;
  } catch (error) {
    console.error(`Error fetching daily candles for ${market}:`, error.message);
    return [];
  }
}

async function getMinuteCandles(market, unit, count = 100, to = undefined) {
  try {
    const params = { market, count };
    if (to) params.to = to;
    
    const response = await axios.get(`${UPBIT_API_URL}/candles/minutes/${unit}`, { params });
    return response.data;
  } catch (error) {
    console.error(`Error fetching ${unit}m candles for ${market}:`, error.message);
    return [];
  }
}

async function getTicker(markets) {
  try {
    const response = await axios.get(`${UPBIT_API_URL}/ticker`, {
      params: { markets: markets.join(',') }
    });
    return response.data;
  } catch (error) {
    console.error(`Error fetching ticker:`, error.message);
    return [];
  }
}

module.exports = {
  getMarkets,
  getDailyCandles,
  getMinuteCandles,
  getTicker
};
