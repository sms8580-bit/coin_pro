const { ATR, MACD, EMA } = require('technicalindicators');

// ATR 계산
function calculateATR(dailyCandles, period = 14) {
  if (dailyCandles.length < period + 1) return null;
  // Upbit API returns data in descending order (latest first). We need ascending for technicalindicators.
  const reversed = [...dailyCandles].reverse();
  
  const high = reversed.map(c => c.high_price);
  const low = reversed.map(c => c.low_price);
  const close = reversed.map(c => c.trade_price);

  const atrInput = {
    high: high,
    low: low,
    close: close,
    period: period
  };

  const atrResult = ATR.calculate(atrInput);
  return atrResult[atrResult.length - 1]; // 최신 ATR 값 반환
}

// 첫 15분봉 추출 (오전 9시 00분 ~ 9시 15분)
// KST 기준으로 판단.
function getFirst15MinCandle(candles15m, targetDateKST) {
  // targetDateKST: YYYY-MM-DD 형식의 문자열
  const targetTimeString = `${targetDateKST}T00:00:00`; // UTC 00:00 is KST 09:00
  
  const firstCandle = candles15m.find(c => {
    // candle_date_time_utc 예: "2023-10-25T00:00:00" -> KST 기준 오전 9시 정각 캔들 (9:00 ~ 9:15)
    return c.candle_date_time_utc.startsWith(targetTimeString);
  });
  
  return firstCandle;
}

// 캔들 패턴: 망치형 (Hammer)
function isHammer(candle) {
  const open = candle.opening_price;
  const close = candle.trade_price;
  const high = candle.high_price;
  const low = candle.low_price;

  const body = Math.abs(close - open);
  const lowerShadow = Math.min(open, close) - low;
  const upperShadow = high - Math.max(open, close);

  // 조건: 몸통보다 아래 꼬리가 2배 이상 길고, 윗 꼬리는 몸통보다 매우 짧아야 함.
  // 양봉/음봉 무관하나 양봉이면 신뢰도 상승. 여기선 형태만 확인.
  return (lowerShadow >= body * 2) && (upperShadow <= body * 0.5) && body > 0;
}

// 캔들 패턴: 상승 장악형 (Bullish Engulfing)
function isBullishEngulfing(prevCandle, currCandle) {
  const prevOpen = prevCandle.opening_price;
  const prevClose = prevCandle.trade_price;
  const currOpen = currCandle.opening_price;
  const currClose = currCandle.trade_price;

  const prevIsBearish = prevClose < prevOpen;
  const currIsBullish = currClose > currOpen;

  // 이전 음봉의 몸통을 현재 양봉의 몸통이 완전히 감싸는 형태
  const engulfing = currClose > prevOpen && currOpen < prevClose;

  return prevIsBearish && currIsBullish && engulfing;
}

// MACD 0선 근접 (MACD Oscillator가 0에 가까운지, 또는 MACD 값이 0에 가까운지)
// 일반적인 MACD: fast 12, slow 26, signal 9
function checkMACD(candles5m) {
  if (candles5m.length < 35) return false;
  const close = [...candles5m].reverse().map(c => c.trade_price);
  const macdInput = {
    values: close,
    fastPeriod: 12,
    slowPeriod: 26,
    signalPeriod: 9,
    SimpleMAOscillator: false,
    SimpleMASignal: false
  };
  const macdResult = MACD.calculate(macdInput);
  const latest = macdResult[macdResult.length - 1];
  
  // MACD histogram이 0을 돌파하려 하거나, MACD 선 자체가 0선 근처일 때
  // 여기서는 단순히 MACD 히스토그램이 양수로 전환되거나(골든크로스), 값이 -0.5% ~ +0.5% 이내인지 등을 볼 수 있음.
  // 기획서: "MACD가 0선에 가까워지는 흐름"
  return latest.MACD > -100 && latest.MACD < 100 && latest.histogram > 0; 
}

// 이평선 5선 75선 골든크로스
function checkGoldenCross(candles5m) {
  if (candles5m.length < 80) return false;
  const close = [...candles5m].reverse().map(c => c.trade_price);
  
  const ema5 = EMA.calculate({period: 5, values: close});
  const ema75 = EMA.calculate({period: 75, values: close});

  const latest5 = ema5[ema5.length - 1];
  const prev5 = ema5[ema5.length - 2];
  const latest75 = ema75[ema75.length - 1];
  const prev75 = ema75[ema75.length - 2];

  // 방금 또는 최근에 5선이 75선을 위로 뚫었는지
  return (prev5 <= prev75 && latest5 > latest75) || (latest5 > latest75 && latest5 < latest75 * 1.005);
}

// 하이킨아시 추세 전환 확인
function checkHeikinAshi(candles5m) {
  if (candles5m.length < 2) return false;
  const reversed = [...candles5m].reverse();
  
  let haOpen = reversed[0].opening_price;
  let haClose = reversed[0].trade_price;

  let latestHaIsBullish = false;
  let prevHaIsBearish = false;

  for (let i = 1; i < reversed.length; i++) {
    const c = reversed[i];
    const newHaClose = (c.opening_price + c.high_price + c.low_price + c.trade_price) / 4;
    const newHaOpen = (haOpen + haClose) / 2;
    
    if (i === reversed.length - 2) {
      prevHaIsBearish = newHaClose < newHaOpen;
    }
    if (i === reversed.length - 1) {
      latestHaIsBullish = newHaClose > newHaOpen;
    }

    haOpen = newHaOpen;
    haClose = newHaClose;
  }

  // 이전이 음봉이고 이번이 양봉이면 추세 전환
  return prevHaIsBearish && latestHaIsBullish;
}

// 90분 이내 돌파 확인
function isBreakoutWithin90Min(first15mCandle, candles5m) {
  const startTime = new Date(first15mCandle.candle_date_time_utc + 'Z').getTime(); // 9:00 UTC (18:00 KST, wait, Upbit returns KST as local? No, _utc is UTC.)
  // Actually, Upbit candle_date_time_utc is UTC. 9AM KST = 00:00 UTC.
  const limitTime = startTime + (15 + 90) * 60 * 1000; // 15분봉 끝난 후 90분이므로 9:15 + 90m = 10:45 KST
  const targetHigh = first15mCandle.high_price;

  for (let c of candles5m) {
    const time = new Date(c.candle_date_time_utc + 'Z').getTime();
    if (time > startTime + 15 * 60 * 1000 && time <= limitTime) { // 9:15 ~ 10:45 사이
      if (c.high_price > targetHigh) {
        return { breakout: true, time: c.candle_date_time_kst, price: c.high_price };
      }
    }
  }
  return { breakout: false };
}

module.exports = {
  calculateATR,
  getFirst15MinCandle,
  isHammer,
  isBullishEngulfing,
  checkMACD,
  checkGoldenCross,
  checkHeikinAshi,
  isBreakoutWithin90Min
};
