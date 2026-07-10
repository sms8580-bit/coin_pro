import React, { useState, useEffect, useRef } from 'react';
import { createChart } from 'lightweight-charts';
import axios from 'axios';
import { Activity, Settings, Bell, RefreshCw } from 'lucide-react';
import './index.css';

const API_URL = import.meta.env.MODE === 'development' ? 'http://localhost:3000/api' : '/api';

class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }
  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }
  render() {
    if (this.state.hasError) {
      return (
        <div style={{ padding: 20, color: 'red', background: 'white' }}>
          <h1>React Crashed</h1>
          <pre>{this.state.error?.toString()}</pre>
        </div>
      );
    }
    return this.props.children;
  }
}

function Dashboard() {
  const [markets, setMarkets] = useState([]);
  const [selectedMarket, setSelectedMarket] = useState('KRW-BTC');
  const [analysis, setAnalysis] = useState(null);
  const [history, setHistory] = useState([]);
  const [recommendations, setRecommendations] = useState([]);
  const [loading, setLoading] = useState(false);
  const [loadingRec, setLoadingRec] = useState(false);
  
  const chartContainerRef = useRef(null);
  const chartRef = useRef(null);
  const candlestickSeriesRef = useRef(null);
  const lineSeriesHighRef = useRef(null);
  const lineSeriesLowRef = useRef(null);

  // Settings
  const [atrPeriod, setAtrPeriod] = useState(14);
  const [atrRatio, setAtrRatio] = useState(33);

  useEffect(() => {
    // Fetch markets
    axios.get(`${API_URL}/markets`).then(res => {
      setMarkets(res.data);
    }).catch(console.error);
  }, []);

  useEffect(() => {
    // Initialize Chart
    if (chartContainerRef.current) {
      const chart = createChart(chartContainerRef.current, {
        layout: {
          background: { type: 'solid', color: 'transparent' },
          textColor: '#d1d5db',
        },
        grid: {
          vertLines: { color: 'rgba(255, 255, 255, 0.05)' },
          horzLines: { color: 'rgba(255, 255, 255, 0.05)' },
        },
        timeScale: {
          timeVisible: true,
          secondsVisible: false,
        },
      });

      const candlestickSeries = chart.addCandlestickSeries({
        upColor: '#ef4444', // 한국식 (상승 빨강)
        downColor: '#3b82f6', // 한국식 (하락 파랑)
        borderVisible: false,
        wickUpColor: '#ef4444',
        wickDownColor: '#3b82f6',
      });

      const highLine = chart.addLineSeries({
        color: '#10b981',
        lineWidth: 2,
        lineStyle: 2, // Dashed
      });

      const lowLine = chart.addLineSeries({
        color: '#f59e0b',
        lineWidth: 2,
        lineStyle: 2,
      });

      chartRef.current = chart;
      candlestickSeriesRef.current = candlestickSeries;
      lineSeriesHighRef.current = highLine;
      lineSeriesLowRef.current = lowLine;

      const handleResize = () => {
        chart.applyOptions({ width: chartContainerRef.current.clientWidth });
      };

      window.addEventListener('resize', handleResize);
      return () => {
        window.removeEventListener('resize', handleResize);
        chart.remove();
      };
    }
  }, []);

  useEffect(() => {
    if (!selectedMarket) return;
    fetchData();
  }, [selectedMarket]);

  const fetchRecommendations = async () => {
    setLoadingRec(true);
    try {
      const res = await axios.get(`${API_URL}/recommend`);
      setRecommendations(res.data);
    } catch (e) {
      console.error(e);
    } finally {
      setLoadingRec(false);
    }
  };

  const fetchData = async () => {
    setLoading(true);
    try {
      // Fetch Analysis
      const analysisRes = await axios.get(`${API_URL}/analyze`, {
        params: { market: selectedMarket }
      });
      setAnalysis(analysisRes.data);

      if (analysisRes.data.signal) {
        setHistory(prev => [{
          time: new Date().toLocaleTimeString(),
          market: selectedMarket,
          ...analysisRes.data.conditions
        }, ...prev]);
      }

      // Fetch Candles for Chart
      const candlesRes = await axios.get(`${API_URL}/candles`, {
        params: { market: selectedMarket, unit: 5, count: 200 }
      });

      const chartData = candlesRes.data.reverse().map(c => ({
        time: new Date(c.candle_date_time_utc + 'Z').getTime() / 1000,
        open: c.opening_price,
        high: c.high_price,
        low: c.low_price,
        close: c.trade_price,
      }));

      candlestickSeriesRef.current.setData(chartData);

      // Draw 15m lines
      if (analysisRes.data.first15m) {
        const { high, low } = analysisRes.data.first15m;
        
        // draw line from start of chart to end
        if (chartData.length > 0) {
           const startTime = chartData[0].time;
           const endTime = chartData[chartData.length - 1].time;
           
           lineSeriesHighRef.current.setData([
             { time: startTime, value: high },
             { time: endTime, value: high }
           ]);
           
           lineSeriesLowRef.current.setData([
             { time: startTime, value: low },
             { time: endTime, value: low }
           ]);
        }
      } else {
        lineSeriesHighRef.current.setData([]);
        lineSeriesLowRef.current.setData([]);
      }

    } catch (error) {
      console.error(error);
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <header className="header">
        <h1>First 15m Breakout Sniper</h1>
      </header>
      <div className="dashboard-layout">
        
        <aside className="sidebar">
          <div className="glass-panel">
            <h2 style={{ fontSize: '1rem', marginBottom: '12px', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <Settings size={18} /> 종목 및 설정
            </h2>
            <div className="form-group">
              <label>코인 선택 (KRW)</label>
              <select 
                className="form-control" 
                value={selectedMarket} 
                onChange={e => setSelectedMarket(e.target.value)}
              >
                {markets.map(m => (
                  <option key={m.market} value={m.market}>{m.korean_name} ({m.market})</option>
                ))}
              </select>
            </div>
            
            <div className="form-group">
              <label>ATR 기준 기간</label>
              <input type="number" className="form-control" value={atrPeriod} onChange={e=>setAtrPeriod(e.target.value)} />
            </div>

            <div className="form-group">
              <label>ATR 기준 비율 (%)</label>
              <input type="number" className="form-control" value={atrRatio} onChange={e=>setAtrRatio(e.target.value)} />
            </div>

            <button className="btn" onClick={fetchData} disabled={loading} style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
              <RefreshCw size={16} className={loading ? "spin" : ""} />
              {loading ? '분석 중...' : '현재 종목 갱신'}
            </button>
            <button className="btn" onClick={fetchRecommendations} disabled={loadingRec} style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '8px', background: 'var(--success)' }}>
              <Activity size={16} />
              {loadingRec ? '추천 검색 중...' : 'TOP 5 종목 추천 받기'}
            </button>
          </div>

          <div className="glass-panel" style={{ flexGrow: 1 }}>
            <h2 style={{ fontSize: '1rem', marginBottom: '12px', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <Activity size={18} /> 현재 전략 상태
            </h2>
            {analysis ? (
              <div style={{ fontSize: '0.875rem', display: 'flex', flexDirection: 'column', gap: '10px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', paddingBottom: '8px', borderBottom: '1px dashed var(--border-color)' }}>
                  <span style={{ color: 'var(--text-muted)' }}>현재가</span>
                  <strong style={{ fontSize: '1rem', color: 'var(--text-main)' }}>{analysis.currentPrice ? analysis.currentPrice.toLocaleString() : '-'} 원</strong>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ color: 'var(--text-muted)' }}>ATR (14일)</span>
                  <strong>{analysis.atr ? analysis.atr.toLocaleString(undefined, {maximumFractionDigits:2}) : '-'} 원</strong>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ color: 'var(--text-muted)' }}>첫 15분봉 고가</span>
                  <strong style={{ color: 'var(--success)' }}>{analysis.first15m?.high?.toLocaleString()} 원</strong>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ color: 'var(--text-muted)' }}>첫 15분봉 저가</span>
                  <strong style={{ color: '#f59e0b' }}>{analysis.first15m?.low?.toLocaleString()} 원</strong>
                </div>
                <hr style={{ borderColor: 'var(--border-color)', margin: '4px 0' }} />
                
                <ConditionItem label={`충분한 변동성 (ATR ${atrRatio}%)`} value={analysis.conditions?.isVolatilityHigh} />
                <ConditionItem label="망치형/장악형 패턴 발생" value={analysis.conditions?.isHammer || analysis.conditions?.isEngulfing} />
                <ConditionItem label="기준선 아래 패턴" value={analysis.conditions?.belowBaseline} />
                <ConditionItem label="MACD 0선 근접" value={analysis.conditions?.macdOk} />
                <ConditionItem label="하이킨아시 추세전환" value={analysis.conditions?.haOk} />
                <ConditionItem label="5선/75선 골든크로스" value={analysis.conditions?.goldenCross} />
                <ConditionItem label="90분 내 돌파 (매수 조건)" value={analysis.conditions?.breakout} />
                
                <div style={{ marginTop: '12px', padding: '12px', background: analysis.signal ? 'rgba(16, 185, 129, 0.1)' : 'rgba(15, 23, 42, 0.5)', borderRadius: '6px', textAlign: 'center', border: `1px solid ${analysis.signal ? 'var(--success)' : 'var(--border-color)'}` }}>
                  <span style={{ display: 'block', fontSize: '0.75rem', color: 'var(--text-muted)', marginBottom: '4px' }}>최종 신호</span>
                  <strong style={{ fontSize: '1.25rem', color: analysis.signal ? 'var(--success)' : 'var(--text-muted)' }}>
                    {analysis.signal ? '매수 진입 가능' : '관망'}
                  </strong>
                </div>
              </div>
            ) : (
              <p style={{ fontSize: '0.875rem', color: 'var(--text-muted)' }}>데이터를 불러오는 중입니다...</p>
            )}
          </div>
        </aside>

        <main className="chart-area glass-panel">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <h2 style={{ fontSize: '1rem', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <Activity size={18} /> 실시간 5분봉 차트 (15분봉 기준선 표시)
            </h2>
            <div style={{ display: 'flex', gap: '12px', fontSize: '0.75rem' }}>
              <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}><div style={{width: 10, height: 10, background: '#10b981', borderRadius: '50%'}}></div> 고가 저항선</span>
              <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}><div style={{width: 10, height: 10, background: '#f59e0b', borderRadius: '50%'}}></div> 저가 지지선</span>
            </div>
          </div>
          <div className="chart-container" ref={chartContainerRef}></div>
        </main>

        <section className="history-area glass-panel" style={{ display: 'flex', gap: '16px' }}>
          
          <div style={{ flex: 1, overflowY: 'auto' }}>
            <h2 style={{ fontSize: '1rem', marginBottom: '12px', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <Activity size={18} /> 실시간 추천 코인 Top 5
            </h2>
            <table className="data-table">
              <thead>
                <tr>
                  <th>종목</th>
                  <th>현재가 (추천진입가)</th>
                  <th>1차 목표가</th>
                  <th>2차 목표가</th>
                  <th>3차 목표가</th>
                </tr>
              </thead>
              <tbody>
                {recommendations.length === 0 ? (
                  <tr>
                    <td colSpan="5" style={{ textAlign: 'center', color: 'var(--text-muted)', padding: '20px' }}>우측 탭에서 '추천 받기'를 눌러주세요.</td>
                  </tr>
                ) : (
                  recommendations.map((r, i) => (
                    <tr key={i} style={{cursor: 'pointer'}} onClick={() => setSelectedMarket(r.market)}>
                      <td><strong>{r.name}</strong><br/><span style={{fontSize: '0.75rem', color: 'var(--text-muted)'}}>{r.market}</span></td>
                      <td style={{color: 'var(--text-main)'}}>{r.currentPrice.toLocaleString()}</td>
                      <td style={{color: 'var(--success)'}}>{Math.round(r.target1).toLocaleString()}</td>
                      <td style={{color: '#f59e0b'}}>{Math.round(r.target2).toLocaleString()}</td>
                      <td style={{color: 'var(--danger)'}}>{Math.round(r.target3).toLocaleString()}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          <div style={{ flex: 1, overflowY: 'auto', borderLeft: '1px solid var(--border-color)', paddingLeft: '16px' }}>
            <h2 style={{ fontSize: '1rem', marginBottom: '12px', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <Bell size={18} /> 진입 신호 발생 기록
            </h2>
            <table className="data-table">
              <thead>
                <tr>
                  <th>시간</th>
                  <th>종목</th>
                  <th>패턴 (망치/장악)</th>
                  <th>MACD/골크</th>
                  <th>돌파여부</th>
                  <th>상태</th>
                </tr>
              </thead>
              <tbody>
                {history.length === 0 ? (
                  <tr>
                    <td colSpan="6" style={{ textAlign: 'center', color: 'var(--text-muted)', padding: '20px' }}>최근 기록이 없습니다.</td>
                  </tr>
                ) : (
                  history.map((h, i) => (
                    <tr key={i}>
                      <td>{h.time}</td>
                      <td><strong>{h.market}</strong></td>
                      <td><span className="badge success">확인</span></td>
                      <td><span className="badge success">확인</span></td>
                      <td><span className="badge success">확인</span></td>
                      <td><span className="badge success">매수</span></td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </section>

      </div>
    </>
  );
}

function ConditionItem({ label, value }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
      <span style={{ color: 'var(--text-muted)' }}>{label}</span>
      {value === undefined ? (
         <span className="badge neutral">-</span>
      ) : value ? (
        <span className="badge success">충족</span>
      ) : (
        <span className="badge danger">미달</span>
      )}
    </div>
  );
}

function App() {
  return (
    <ErrorBoundary>
      <Dashboard />
    </ErrorBoundary>
  );
}

export default App;
