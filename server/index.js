const express = require('express');
const cors = require('cors');
const path = require('path');
const upbit = require('./upbit');
const strategy = require('./strategy');

const app = express();
app.use(cors());
app.use(express.json());

// Serve React static files
app.use(express.static(path.join(__dirname, '../frontend/dist')));

app.get('/api/markets', async (req, res) => {
  const markets = await upbit.getMarkets();
  res.json(markets);
});

app.get('/api/analyze', async (req, res) => {
  const market = req.query.market || 'KRW-BTC';
  // date in KST (YYYY-MM-DD), default to today
  const todayDateStr = new Intl.DateTimeFormat('fr-CA', { timeZone: 'Asia/Seoul' }).format(new Date());
  const dateKST = req.query.date || todayDateStr; 

  try {
    const daily = await upbit.getDailyCandles(market, 15);
    const m15 = await upbit.getMinuteCandles(market, 15, 50); // Today's 15m candles
    const m5 = await upbit.getMinuteCandles(market, 5, 200);  // Today's 5m candles

    if (daily.length === 0 || m15.length === 0 || m5.length === 0) {
      return res.status(400).json({ error: 'Not enough data' });
    }

    const atr = strategy.calculateATR(daily, 14);
    const first15m = strategy.getFirst15MinCandle(m15, dateKST);

    if (!first15m) {
       return res.json({ market, message: '오전 9시 첫 15분봉이 아직 없습니다.', atr });
    }

    const volatility = first15m.high_price - first15m.low_price;
    const isVolatilityHigh = atr ? (volatility >= atr * 0.33) : false;

    // 5분봉 최신 캔들들 가져와서 분석 (장악형/망치형 등은 9시 15분 이후 캔들에서 확인)
    // 간단히 최신 2개의 5분봉으로 확인
    const recent5m = m5.slice(0, 2); 
    const isHammer = strategy.isHammer(recent5m[0]);
    const isEngulfing = strategy.isBullishEngulfing(recent5m[1], recent5m[0]);
    
    const macdOk = strategy.checkMACD(m5);
    const haOk = strategy.checkHeikinAshi(m5);
    const goldenCross = strategy.checkGoldenCross(m5);
    const breakout = strategy.isBreakoutWithin90Min(first15m, m5);

    // 기준선 아래에서 패턴 발생했는지 여부 (현재가가 첫 15분 저가보다 낮은 곳에서 패턴 발생했는가)
    const belowBaseline = recent5m[0].trade_price <= first15m.low_price;
    const isCandlePatternOk = (isHammer || isEngulfing) && belowBaseline;

    res.json({
      market,
      date: new Date().toISOString().split('T')[0],
      currentPrice: m5[0].trade_price,
      atr,
      first15m: {
        high: first15m.high_price,
        low: first15m.low_price,
        volatility
      },
      conditions: {
        isVolatilityHigh,
        isHammer,
        isEngulfing,
        belowBaseline,
        macdOk,
        haOk,
        goldenCross,
        breakout: breakout.breakout
      },
      signal: isVolatilityHigh && isCandlePatternOk && breakout.breakout,
      details: 'Signal is true if volatility >= ATR*33%, candle pattern observed below baseline, and price broke 15m high within 90 mins.'
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Server error' });
  }
});

// 차트 데이터 제공용
app.get('/api/candles', async (req, res) => {
  const { market, unit, count } = req.query;
  if (!market || !unit) return res.status(400).json({ error: 'Missing market or unit' });
  const data = await upbit.getMinuteCandles(market, unit, count || 200);
  res.json(data);
});

// 종목 추천 API
app.get('/api/recommend', async (req, res) => {
  try {
    const markets = await upbit.getMarkets();
    const krwMarkets = markets.filter(m => m.market !== 'KRW-USDT');
    
    // 볼륨 상위 50개만 잘라서 시세 조회 (빠른 속도를 위해)
    const chunk = krwMarkets.slice(0, 50).map(m => m.market);
    const tickers = await upbit.getTicker(chunk);
    
    // 거래대금 순 정렬 후 상위 5개 추출
    const topTickers = tickers.sort((a, b) => b.acc_trade_price_24h - a.acc_trade_price_24h).slice(0, 5);
    
    const recommendations = [];
    for (const t of topTickers) {
      const marketInfo = krwMarkets.find(m => m.market === t.market);
      const daily = await upbit.getDailyCandles(t.market, 15);
      
      const atr = strategy.calculateATR(daily, 14) || 0;
      
      const currentPrice = t.trade_price;
      
      recommendations.push({
        market: t.market,
        name: marketInfo.korean_name,
        currentPrice,
        atr,
        target1: currentPrice + atr * 0.5,
        target2: currentPrice + atr * 1.0,
        target3: currentPrice + atr * 1.5,
      });
    }
    
    res.json(recommendations);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Server error' });
  }
});

// React Router fallback (Any request not starting with /api returns index.html)
app.use((req, res) => {
  res.sendFile(path.join(__dirname, '../frontend/dist/index.html'));
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});
