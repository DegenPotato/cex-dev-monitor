// Enhanced chart generation with Volume, RSI, and multi-timeframe support
export function calculateRSI(candles, period = 14) {
  if (candles.length < period + 1) return candles.map(() => ({ time: 0, value: 50 }));
  
  const rsi = [];
  const changes = [];
  
  for (let i = 1; i < candles.length; i++) {
    changes.push(candles[i].close - candles[i - 1].close);
  }
  
  for (let i = 0; i < candles.length; i++) {
    if (i < period) {
      rsi.push({ time: candles[i].time, value: 50 });
      continue;
    }
    
    const slice = changes.slice(i - period, i);
    const gains = slice.filter(c => c > 0).reduce((sum, c) => sum + c, 0) / period;
    const losses = Math.abs(slice.filter(c => c < 0).reduce((sum, c) => sum + c, 0)) / period;
    
    const rs = losses === 0 ? 100 : gains / losses;
    const rsiValue = 100 - (100 / (1 + rs));
    
    rsi.push({ time: candles[i].time, value: rsiValue });
  }
  
  return rsi;
}

export function generateEnhancedHTML(allTimeframeCandles, swaps, allSignatures, metadata) {
  // Calculate RSI for all timeframes (both RSI 14 and RSI 2)
  const allRSI14 = {};
  const allRSI2 = {};
  for (const [tf, candles] of Object.entries(allTimeframeCandles)) {
    allRSI14[tf] = calculateRSI(candles, 14);
    allRSI2[tf] = calculateRSI(candles, 2);
  }
  
  return `<!DOCTYPE html>
<html>
<head>
  <title>OHLCV Analysis - ${metadata.token.slice(0, 8)}</title>
  <script src="https://unpkg.com/lightweight-charts@4.1.3/dist/lightweight-charts.standalone.production.js"></script>
  <style>
    body { font-family: 'Segoe UI', Arial; background: #0f172a; color: #e2e8f0; padding: 20px; margin: 0; }
    h1 { color: #f97316; margin: 0; }
    .token { font-family: monospace; font-size: 13px; color: #64748b; margin: 5px 0 20px 0; }
    .stats { display: grid; grid-template-columns: repeat(4, 1fr); gap: 15px; margin: 20px 0; }
    .stat { background: #1e293b; padding: 15px; border-radius: 8px; border: 1px solid #334155; }
    .stat-label { font-size: 12px; color: #94a3b8; }
    .stat-value { font-size: 24px; font-weight: bold; margin-top: 5px; }
    
    .timeframe-selector { display: flex; gap: 8px; margin: 20px 0; align-items: center; }
    .tf-btn { background: #1e293b; color: #94a3b8; border: 1px solid #334155; padding: 8px 16px; border-radius: 6px; cursor: pointer; font-size: 13px; font-weight: 500; transition: all 0.2s; }
    .tf-btn:hover { background: #334155; }
    .tf-btn.active { background: #f97316; color: white; border-color: #f97316; }
    
    .currency-toggle { display: flex; gap: 4px; margin-left: auto; background: #1e293b; border: 1px solid #334155; border-radius: 6px; padding: 4px; }
    .currency-btn { background: transparent; color: #94a3b8; border: none; padding: 6px 12px; border-radius: 4px; cursor: pointer; font-size: 12px; font-weight: 600; transition: all 0.2s; }
    .currency-btn:hover { background: #334155; }
    .currency-btn.active { background: #f97316; color: white; }
    .sol-price-badge { background: #1e293b; border: 1px solid #334155; padding: 8px 16px; border-radius: 6px; font-size: 13px; color: #10b981; font-weight: 600; margin-left: 10px; }
    
    .chart-container { display: grid; grid-template-columns: 1fr 350px; gap: 20px; }
    .charts { display: flex; flex-direction: column; gap: 0; position: relative; }
    #mainChart { width: 100%; height: 500px; background: #1e293b; border-radius: 8px 8px 0 0; border: 1px solid #334155; border-bottom: none; }
    #volumeChart { width: 100%; height: 120px; background: #1e293b; border-left: 1px solid #334155; border-right: 1px solid #334155; }
    #rsi14Chart { width: 100%; height: 100px; background: #1e293b; border-left: 1px solid #334155; border-right: 1px solid #334155; }
    #rsi2Chart { width: 100%; height: 100px; background: #1e293b; border-radius: 0 0 8px 8px; border: 1px solid #334155; border-top: none; }
    
    .chart-legend { position: absolute; top: 10px; left: 10px; background: rgba(15, 23, 42, 0.9); padding: 8px 12px; border-radius: 6px; font-size: 12px; z-index: 100; pointer-events: none; line-height: 1.6; }
    .legend-row { display: flex; gap: 15px; }
    .legend-item { display: flex; gap: 5px; }
    .legend-label { color: #94a3b8; }
    .legend-value { color: #e2e8f0; font-weight: 600; font-family: monospace; }
    .legend-value.up { color: #10b981; }
    .legend-value.down { color: #ef4444; }
    .legend-title { color: #f97316; font-weight: 600; margin-bottom: 4px; }
    
    .volume-legend { position: absolute; top: 510px; left: 10px; background: rgba(15, 23, 42, 0.9); padding: 6px 10px; border-radius: 6px; font-size: 11px; z-index: 100; pointer-events: none; }
    .rsi14-legend { position: absolute; top: 640px; left: 10px; background: rgba(15, 23, 42, 0.9); padding: 6px 10px; border-radius: 6px; font-size: 11px; z-index: 100; pointer-events: none; }
    .rsi2-legend { position: absolute; top: 750px; left: 10px; background: rgba(15, 23, 42, 0.9); padding: 6px 10px; border-radius: 6px; font-size: 11px; z-index: 100; pointer-events: none; }
    
    .tooltip { position: absolute; background: rgba(30, 41, 59, 0.98); border: 1px solid #334155; border-radius: 6px; padding: 12px; font-size: 12px; pointer-events: none; z-index: 1000; box-shadow: 0 4px 12px rgba(0,0,0,0.5); }
    .tooltip-row { display: flex; justify-content: space-between; gap: 20px; margin: 4px 0; }
    .tooltip-label { color: #94a3b8; }
    .tooltip-value { color: #e2e8f0; font-weight: 600; font-family: monospace; }
    .tooltip-value.up { color: #10b981; }
    .tooltip-value.down { color: #ef4444; }
    
    .tabs { display: flex; gap: 10px; margin-top: 20px; }
    .tab-button { background: #1e293b; color: #94a3b8; border: 1px solid #334155; padding: 10px 20px; border-radius: 6px; cursor: pointer; font-size: 14px; transition: all 0.2s; }
    .tab-button:hover { background: #334155; }
    .tab-button.active { background: #f97316; color: white; border-color: #f97316; }
    .tab-content { display: none; margin-top: 20px; }
    .tab-content.active { display: block; }
    
    .trade-log { background: #1e293b; border-radius: 8px; border: 1px solid #334155; padding: 15px; height: 740px; display: flex; flex-direction: column; }
    .trade-log h3 { margin: 0 0 15px 0; color: #f97316; font-size: 14px; font-weight: 600; }
    .trade-list { flex: 1; overflow-y: auto; }
    .trade-item { padding: 8px; border-bottom: 1px solid #334155; font-size: 11px; }
    .trade-item:hover { background: #334155; }
    .trade-time { color: #64748b; font-size: 10px; }
    .trade-type { font-weight: bold; font-size: 11px; }
    .trade-type.buy { color: #10b981; }
    .trade-type.sell { color: #ef4444; }
    .trade-tags { display: flex; gap: 4px; flex-wrap: wrap; margin-top: 4px; }
    .tag { font-size: 9px; padding: 2px 6px; border-radius: 3px; font-weight: 600; text-transform: uppercase; }
    .tag.mint { background: #8b5cf6; color: white; }
    .tag.dev { background: #f59e0b; color: white; }
    .tag.bundler { background: #ec4899; color: white; }
    .tag.early_sniper { background: #ef4444; color: white; }
    .tag.block_0 { background: #7c3aed; color: white; }
    .tag.block_1 { background: #dc2626; color: white; }
    .tag.block_2 { background: #ea580c; color: white; }
    .tag.volume_bot { background: #64748b; color: white; }
    .tag.large_buy { background: #10b981; color: white; }
    .tag.large_sell { background: #f43f5e; color: white; }
    .trade-details { margin-top: 4px; display: grid; grid-template-columns: 1fr 1fr; gap: 4px; }
    .trade-label { color: #64748b; font-size: 10px; }
    .trade-value { color: #e2e8f0; font-family: monospace; font-size: 10px; }
    
    .full-width-log { background: #1e293b; border-radius: 8px; border: 1px solid #334155; padding: 15px; max-height: 800px; display: flex; flex-direction: column; }
    .full-width-log h3 { margin: 0 0 15px 0; color: #f97316; font-size: 16px; }
    .full-width-log .trade-list { flex: 1; overflow-y: auto; }
    
    @keyframes slideIn {
      from { transform: translateX(-20px); opacity: 0; }
      to { transform: translateX(0); opacity: 1; }
    }
  </style>
</head>
<body>
  <h1>🚀 OHLCV Analysis</h1>
  ${metadata.metadata ? `
  <div style="background: #1e293b; padding: 15px; border-radius: 8px; border: 1px solid #334155; margin-bottom: 20px;">
    <div style="display: flex; align-items: center; gap: 15px;">
      ${metadata.metadata.image ? `<img src="${metadata.metadata.image}" style="width: 60px; height: 60px; border-radius: 8px;" />` : ''}
      <div style="flex: 1;">
        <div style="font-size: 24px; font-weight: 600; color: #f97316;">${metadata.metadata.name} (${metadata.metadata.symbol})</div>
        ${metadata.metadata.description ? `<div style="color: #94a3b8; font-size: 14px; margin-top: 5px;">${metadata.metadata.description}</div>` : ''}
        <div class="token" style="margin-top: 5px;">${metadata.token}</div>
      </div>
    </div>
  </div>
  ` : `<div class="token">${metadata.token}</div>`}
  
  <div class="stats">
    <div class="stat">
      <div class="stat-label">Total Swaps</div>
      <div class="stat-value">${metadata.totalSwaps.toLocaleString()}</div>
    </div>
    <div class="stat">
      <div class="stat-label">Buys / Sells</div>
      <div class="stat-value" style="color: #10b981">${metadata.buys}</div>
      <div class="stat-value" style="color: #ef4444">${metadata.sells}</div>
    </div>
    <div class="stat">
      <div class="stat-label">Total Volume</div>
      <div class="stat-value" style="color: #10b981">${metadata.totalVolume.toFixed(2)} SOL</div>
    </div>
    <div class="stat">
      <div class="stat-label">Bonding Curve</div>
      <div class="stat-value" style="font-size: 12px; font-family: monospace;">${metadata.bondingCurve.slice(0, 8)}...</div>
    </div>
  </div>
  
  <div class="timeframe-selector">
    ${Object.keys(allTimeframeCandles).map((tf, i) => 
      `<button class="tf-btn ${i === 2 ? 'active' : ''}" onclick="switchTimeframe('${tf}')">${tf}</button>`
    ).join('')}
    ${metadata.solPrice > 0 ? `
      <div class="sol-price-badge">SOL: $${metadata.solPrice.toFixed(2)}</div>
      <div class="currency-toggle">
        <button class="currency-btn active" id="sol-btn" onclick="switchCurrency('SOL')">SOL</button>
        <button class="currency-btn" id="usd-btn" onclick="switchCurrency('USD')">USD</button>
      </div>
    ` : ''}
  </div>
  
  <div class="chart-container">
    <div class="charts">
      <div id="mainChart"></div>
      <div class="chart-legend">
        <div class="legend-title">CREATED • <span id="timeframe-label">1m</span></div>
        <div class="legend-row">
          <div class="legend-item"><span class="legend-label">O</span><span class="legend-value" id="legend-open">—</span></div>
          <div class="legend-item"><span class="legend-label">H</span><span class="legend-value" id="legend-high">—</span></div>
          <div class="legend-item"><span class="legend-label">L</span><span class="legend-value" id="legend-low">—</span></div>
          <div class="legend-item"><span class="legend-label">C</span><span class="legend-value" id="legend-close">—</span></div>
          <div class="legend-item"><span class="legend-label">Change</span><span class="legend-value" id="legend-change">—</span></div>
        </div>
      </div>
      <div id="volumeChart"></div>
      <div class="volume-legend">
        <span style="color:#60a5fa; font-weight:600;">Volume</span> <span id="legend-volume" style="color:#e2e8f0; font-family:monospace; margin-left:8px;">—</span>
      </div>
      <div id="rsi14Chart"></div>
      <div class="rsi14-legend">
        <span style="color:#f97316; font-weight:600;">RSI 14</span> <span style="color:#64748b; font-size:10px; margin-left:4px;">(70/30)</span> <span id="legend-rsi14" style="color:#e2e8f0; font-family:monospace; margin-left:8px;">—</span>
      </div>
      <div id="rsi2Chart"></div>
      <div class="rsi2-legend">
        <span style="color:#10b981; font-weight:600;">RSI 2</span> <span style="color:#64748b; font-size:10px; margin-left:4px;">(95/5)</span> <span id="legend-rsi2" style="color:#e2e8f0; font-family:monospace; margin-left:8px;">—</span>
      </div>
    </div>
    <div class="trade-log">
      <h3>📊 Live Feed (${swaps.length} swaps)</h3>
      <div class="trade-list">
        ${swaps.slice().reverse().slice(0, 200).map(swap => `
          <div class="trade-item">
            <div class="trade-time">${new Date(swap.timestamp * 1000).toLocaleTimeString()} • Block ${swap.slot || 'N/A'}</div>
            <div class="trade-type ${swap.type}">${swap.type.toUpperCase()}</div>
            ${swap.tags ? `<div class="trade-tags">${swap.tags.map(tag => `<span class="tag ${tag.toLowerCase()}">${tag}</span>`).join('')}</div>` : ''}
            <div class="trade-details">
              <div>
                <div class="trade-label">Price</div>
                <div class="trade-value">${swap.price.toFixed(12)}</div>
              </div>
              <div>
                <div class="trade-label">Amount</div>
                <div class="trade-value">${swap.tokenAmount.toFixed(2)}</div>
              </div>
              <div>
                <div class="trade-label">Volume</div>
                <div class="trade-value">${swap.solAmount.toFixed(4)} SOL</div>
              </div>
            </div>
            <div style="margin-top:4px">
              <a href="https://solscan.io/tx/${swap.signature}" target="_blank" rel="noopener" style="color:#60a5fa; text-decoration:none; font-size:9px;">Solscan ↗</a>
            </div>
          </div>
        `).join('')}
      </div>
    </div>
  </div>
  
  <div class="tabs">
    <button class="tab-button active" onclick="switchTab('trades')">📊 All Trades</button>
    <button class="tab-button" onclick="switchTab('signatures')">🔍 All Signatures</button>
  </div>
  
  <div id="trades-tab" class="tab-content active">
    <div class="full-width-log">
      <h3>📊 All Trades (${swaps.length} total)</h3>
      <div class="trade-list">
        ${swaps.slice().reverse().map((swap, idx) => `
          <div class="trade-item">
            <div style="display:flex; justify-content:space-between; align-items:center;">
              <div>
                <span style="color:#64748b; margin-right:8px;">#${swaps.length - idx}</span>
                <span class="trade-type ${swap.type}">${swap.type.toUpperCase()}</span>
                <span style="color:#64748b; margin-left:8px; font-size:10px;">${new Date(swap.timestamp * 1000).toLocaleString()} • Block ${swap.slot || 'N/A'}</span>
              </div>
              <a href="https://solscan.io/tx/${swap.signature}" target="_blank" rel="noopener" style="color:#60a5fa; text-decoration:none; font-size:10px;">Solscan ↗</a>
            </div>
            ${swap.tags ? `<div class="trade-tags" style="margin-top:4px;">${swap.tags.map(tag => `<span class="tag ${tag.toLowerCase()}">${tag}</span>`).join('')}</div>` : ''}
            <div class="trade-details" style="grid-template-columns: repeat(4, 1fr); margin-top:8px;">
              <div>
                <div class="trade-label">Price</div>
                <div class="trade-value">${swap.price.toFixed(12)}</div>
              </div>
              <div>
                <div class="trade-label">Amount</div>
                <div class="trade-value">${swap.tokenAmount.toFixed(2)}</div>
              </div>
              <div>
                <div class="trade-label">Volume</div>
                <div class="trade-value">${swap.solAmount.toFixed(4)} SOL</div>
              </div>
              <div>
                <div class="trade-label">Signature</div>
                <div class="trade-value" style="font-size:9px;">${swap.signature.slice(0, 16)}...</div>
              </div>
            </div>
          </div>
        `).join('')}
      </div>
    </div>
  </div>
  
  <div id="signatures-tab" class="tab-content">
    <div class="full-width-log">
      <h3>🔍 All Signatures (${allSignatures.length} total)</h3>
      <div style="margin-bottom:10px; color:#94a3b8; font-size:12px;">
        Bonding Curve: <span style="color:#60a5fa; font-family:monospace;">${metadata.bondingCurve}</span>
      </div>
      <div class="trade-list">
        ${allSignatures.map((sig, idx) => `
          <div class="trade-item">
            <div style="display:flex; justify-content:space-between; align-items:center;">
              <div>
                <span style="color:#64748b; margin-right:8px;">#${idx + 1}</span>
                <span style="color:#e2e8f0; font-family:monospace; font-size:11px;">${sig.signature}</span>
              </div>
              <a href="https://solscan.io/tx/${sig.signature}" target="_blank" rel="noopener" style="color:#60a5fa; text-decoration:none; font-size:10px;">Solscan ↗</a>
            </div>
            <div style="display:grid; grid-template-columns:repeat(4,1fr); gap:8px; margin-top:6px; font-size:11px;">
              <div>
                <span style="color:#64748b;">Time:</span>
                <span style="color:#e2e8f0; margin-left:4px;">${sig.blockTime ? new Date(sig.blockTime * 1000).toLocaleTimeString() : 'N/A'}</span>
              </div>
              <div>
                <span style="color:#64748b;">Slot:</span>
                <span style="color:#e2e8f0; margin-left:4px;">${sig.slot || 'N/A'}</span>
              </div>
              <div>
                <span style="color:#64748b;">Status:</span>
                <span style="color:${sig.err ? '#ef4444' : '#10b981'}; margin-left:4px;">${sig.err ? 'Failed' : 'Success'}</span>
              </div>
              <div>
                <span style="color:#64748b;">Confirmation:</span>
                <span style="color:#e2e8f0; margin-left:4px;">${sig.confirmationStatus || 'confirmed'}</span>
              </div>
            </div>
          </div>
        `).join('')}
      </div>
    </div>
  </div>
  
  <script>
    const candleData = ${JSON.stringify(allTimeframeCandles)};
    const rsi14Data = ${JSON.stringify(allRSI14)};
    const rsi2Data = ${JSON.stringify(allRSI2)};
    const SOL_PRICE = ${metadata.solPrice || 0};
    
    let currentChart, currentVolume, currentRSI14, currentRSI2, currentSeries, currentVolumeSeries, currentRSI14Series, currentRSI2Series;
    let currentTimeframe = '1m';
    let currentCurrency = 'SOL';
    
    function createCharts(timeframe) {
      // Clear existing
      if (currentChart) {
        document.getElementById('mainChart').innerHTML = '';
        document.getElementById('volumeChart').innerHTML = '';
        document.getElementById('rsi14Chart').innerHTML = '';
        document.getElementById('rsi2Chart').innerHTML = '';
      }
      
      let candles = candleData[timeframe];
      const rsi14 = rsi14Data[timeframe];
      const rsi2 = rsi2Data[timeframe];
      
      // Convert to USD if needed
      if (currentCurrency === 'USD' && SOL_PRICE > 0) {
        candles = candles.map(c => ({
          time: c.time,
          open: c.open * SOL_PRICE,
          high: c.high * SOL_PRICE,
          low: c.low * SOL_PRICE,
          close: c.close * SOL_PRICE,
          volume: c.volume * SOL_PRICE
        }));
      }
      
      // Get exact width for ALL charts (must be identical for perfect alignment)
      // Use offsetWidth for the most accurate width including borders
      const container = document.querySelector('.charts');
      const chartWidth = container ? container.offsetWidth : window.innerWidth - 40;
      
      // Common chart options for PERFECT pixel-aligned charts
      const commonOptions = {
        width: chartWidth,
        layout: { 
          background: { color: '#1e293b' }, 
          textColor: '#d1d5db' 
        },
        grid: { 
          vertLines: { color: '#334155' }, 
          horzLines: { color: '#334155' } 
        },
        crosshair: { 
          mode: 1,
          vertLine: {
            width: 1,
            color: '#94a3b8',
            style: 3,
            labelBackgroundColor: '#1e293b'
          }
        },
        timeScale: {
          borderVisible: false,
          rightOffset: 0,
          barSpacing: 8,
          minBarSpacing: 0.5,
          fixLeftEdge: false,
          fixRightEdge: false,
          lockVisibleTimeRangeOnResize: true,
          rightBarStaysOnScroll: true,
          visible: true
        },
        rightPriceScale: {
          borderVisible: false,
          autoScale: true,
          alignLabels: true,
          scaleMargins: {
            top: 0.1,
            bottom: 0.1
          },
          mode: 0, // Normal mode
          invertScale: false,
          // Force minimum width to prevent scale width differences
          minimumWidth: 60
        },
        leftPriceScale: {
          visible: false
        },
        handleScroll: {
          mouseWheel: true,
          pressedMouseMove: true,
          horzTouchDrag: true,
          vertTouchDrag: false
        },
        handleScale: {
          axisPressedMouseMove: {
            time: true,
            price: true
          },
          mouseWheel: true,
          pinch: true
        }
      };
      
      // Main price chart
      currentChart = LightweightCharts.createChart(document.getElementById('mainChart'), {
        ...commonOptions,
        height: 500,
        timeScale: { 
          ...commonOptions.timeScale,
          timeVisible: true, 
          secondsVisible: timeframe.includes('s')
        }
      });
      
      currentSeries = currentChart.addCandlestickSeries({
        upColor: '#10b981',
        downColor: '#ef4444',
        borderUpColor: '#10b981',
        borderDownColor: '#ef4444',
        wickUpColor: '#10b981',
        wickDownColor: '#ef4444',
        priceFormat: currentCurrency === 'USD' 
          ? { type: 'price', precision: 8, minMove: 0.00000001 }
          : { type: 'price', precision: 12, minMove: 0.000000000001 }
      });
      
      currentSeries.setData(candles);
      
      // Volume chart
      currentVolume = LightweightCharts.createChart(document.getElementById('volumeChart'), {
        ...commonOptions,
        height: 120,
        timeScale: { 
          ...commonOptions.timeScale,
          visible: false
        }
      });
      
      currentVolumeSeries = currentVolume.addHistogramSeries({
        color: '#60a5fa',
        priceFormat: { type: 'volume' },
        priceScaleId: ''
      });
      
      currentVolumeSeries.setData(candles.map(c => ({ time: c.time, value: c.volume, color: c.close >= c.open ? '#10b98180' : '#ef444480' })));
      
      // RSI 14 chart
      currentRSI14 = LightweightCharts.createChart(document.getElementById('rsi14Chart'), {
        ...commonOptions,
        height: 100,
        timeScale: { 
          ...commonOptions.timeScale,
          visible: false
        }
      });
      
      currentRSI14Series = currentRSI14.addLineSeries({
        color: '#f97316',
        lineWidth: 2,
        priceScaleId: 'right',
        priceFormat: { type: 'price', precision: 2, minMove: 0.01 }
      });
      
      currentRSI14Series.setData(rsi14);
      
      // Add RSI 14 levels (70/30)
      currentRSI14Series.createPriceLine({ price: 70, color: '#ef4444', lineWidth: 1, lineStyle: 2, axisLabelVisible: true, title: '' });
      currentRSI14Series.createPriceLine({ price: 30, color: '#10b981', lineWidth: 1, lineStyle: 2, axisLabelVisible: true, title: '' });
      currentRSI14Series.createPriceLine({ price: 50, color: '#64748b', lineWidth: 1, lineStyle: 2, axisLabelVisible: false });
      
      // RSI 2 chart
      currentRSI2 = LightweightCharts.createChart(document.getElementById('rsi2Chart'), {
        ...commonOptions,
        height: 100,
        timeScale: { 
          ...commonOptions.timeScale,
          timeVisible: true, 
          secondsVisible: timeframe.includes('s')
        }
      });
      
      currentRSI2Series = currentRSI2.addLineSeries({
        color: '#10b981',
        lineWidth: 2,
        priceScaleId: 'right',
        priceFormat: { type: 'price', precision: 2, minMove: 0.01 }
      });
      
      currentRSI2Series.setData(rsi2);
      
      // Add RSI 2 levels (95/5)
      currentRSI2Series.createPriceLine({ price: 95, color: '#ef4444', lineWidth: 1, lineStyle: 2, axisLabelVisible: true, title: '' });
      currentRSI2Series.createPriceLine({ price: 5, color: '#10b981', lineWidth: 1, lineStyle: 2, axisLabelVisible: true, title: '' });
      currentRSI2Series.createPriceLine({ price: 50, color: '#64748b', lineWidth: 1, lineStyle: 2, axisLabelVisible: false });
      
      // Bidirectional time scale synchronization across ALL charts
      // This ensures scrolling/zooming on ANY chart moves ALL charts together
      
      // Store all charts for easy iteration
      const allCharts = [
        { chart: currentChart, name: 'main' },
        { chart: currentVolume, name: 'volume' },
        { chart: currentRSI14, name: 'rsi14' },
        { chart: currentRSI2, name: 'rsi2' }
      ];
      
      // Sync function that updates all OTHER charts
      function syncCharts(sourceChart, newRange) {
        allCharts.forEach(({ chart }) => {
          if (chart !== sourceChart && newRange) {
            chart.timeScale().setVisibleLogicalRange(newRange);
          }
        });
      }
      
      // Subscribe each chart to sync the others when it changes
      currentChart.timeScale().subscribeVisibleLogicalRangeChange((range) => {
        syncCharts(currentChart, range);
      });
      
      currentVolume.timeScale().subscribeVisibleLogicalRangeChange((range) => {
        syncCharts(currentVolume, range);
      });
      
      currentRSI14.timeScale().subscribeVisibleLogicalRangeChange((range) => {
        syncCharts(currentRSI14, range);
      });
      
      currentRSI2.timeScale().subscribeVisibleLogicalRangeChange((range) => {
        syncCharts(currentRSI2, range);
      });
      
      // Synchronized crosshair across all charts
      function syncCrosshair(chart, series, point) {
        if (point) {
          chart.setCrosshairPosition(point.value, point.time, series);
        } else {
          chart.clearCrosshairPosition();
        }
      }
      
      // Main chart crosshair handler with legend updates
      currentChart.subscribeCrosshairMove(param => {
        if (param.time) {
          // Get data for this timestamp
          const candleData = param.seriesData.get(currentSeries);
          const volumeData = currentVolumeSeries.data().find(d => d.time === param.time);
          const rsi14Data = currentRSI14Series.data().find(d => d.time === param.time);
          const rsi2Data = currentRSI2Series.data().find(d => d.time === param.time);
          
          // Update OHLCV legend
          if (candleData) {
            const change = ((candleData.close - candleData.open) / candleData.open * 100);
            const changeClass = change >= 0 ? 'up' : 'down';
            const precision = currentCurrency === 'USD' ? 8 : 12;
            const prefix = currentCurrency === 'USD' ? '$' : '';
            
            document.getElementById('legend-open').textContent = prefix + candleData.open.toFixed(precision);
            document.getElementById('legend-high').textContent = prefix + candleData.high.toFixed(precision);
            document.getElementById('legend-low').textContent = prefix + candleData.low.toFixed(precision);
            document.getElementById('legend-close').textContent = prefix + candleData.close.toFixed(precision);
            document.getElementById('legend-close').className = 'legend-value ' + changeClass;
            document.getElementById('legend-change').textContent = (change >= 0 ? '+' : '') + change.toFixed(2) + '%';
            document.getElementById('legend-change').className = 'legend-value ' + changeClass;
          }
          
          // Update Volume legend
          if (volumeData) {
            const volumeText = currentCurrency === 'USD' 
              ? '$' + volumeData.value.toFixed(2) 
              : volumeData.value.toFixed(4) + ' SOL';
            document.getElementById('legend-volume').textContent = volumeText;
          }
          
          // Update RSI 14 legend
          if (rsi14Data) {
            document.getElementById('legend-rsi14').textContent = rsi14Data.value.toFixed(2);
          }
          
          // Update RSI 2 legend
          if (rsi2Data) {
            document.getElementById('legend-rsi2').textContent = rsi2Data.value.toFixed(2);
          }
          
          // Sync crosshairs across all charts
          if (volumeData) syncCrosshair(currentVolume, currentVolumeSeries, { time: param.time, value: volumeData.value });
          if (rsi14Data) syncCrosshair(currentRSI14, currentRSI14Series, { time: param.time, value: rsi14Data.value });
          if (rsi2Data) syncCrosshair(currentRSI2, currentRSI2Series, { time: param.time, value: rsi2Data.value });
        } else {
          // Reset legends when not hovering
          document.getElementById('legend-open').textContent = '—';
          document.getElementById('legend-high').textContent = '—';
          document.getElementById('legend-low').textContent = '—';
          document.getElementById('legend-close').textContent = '—';
          document.getElementById('legend-close').className = 'legend-value';
          document.getElementById('legend-change').textContent = '—';
          document.getElementById('legend-change').className = 'legend-value';
          document.getElementById('legend-volume').textContent = '—';
          document.getElementById('legend-rsi14').textContent = '—';
          document.getElementById('legend-rsi2').textContent = '—';
          
          currentVolume.clearCrosshairPosition();
          currentRSI14.clearCrosshairPosition();
          currentRSI2.clearCrosshairPosition();
        }
      });
      
      // Volume chart crosshair handler
      currentVolume.subscribeCrosshairMove(param => {
        if (param.time) {
          const candleData = currentSeries.data().find(d => d.time === param.time);
          const rsi14Data = currentRSI14Series.data().find(d => d.time === param.time);
          const rsi2Data = currentRSI2Series.data().find(d => d.time === param.time);
          
          if (candleData) syncCrosshair(currentChart, currentSeries, { time: param.time, value: candleData.close });
          if (rsi14Data) syncCrosshair(currentRSI14, currentRSI14Series, { time: param.time, value: rsi14Data.value });
          if (rsi2Data) syncCrosshair(currentRSI2, currentRSI2Series, { time: param.time, value: rsi2Data.value });
        } else {
          currentChart.clearCrosshairPosition();
          currentRSI14.clearCrosshairPosition();
          currentRSI2.clearCrosshairPosition();
        }
      });
      
      // RSI 14 chart crosshair handler
      currentRSI14.subscribeCrosshairMove(param => {
        if (param.time) {
          const candleData = currentSeries.data().find(d => d.time === param.time);
          const volumeData = currentVolumeSeries.data().find(d => d.time === param.time);
          const rsi2Data = currentRSI2Series.data().find(d => d.time === param.time);
          
          if (candleData) syncCrosshair(currentChart, currentSeries, { time: param.time, value: candleData.close });
          if (volumeData) syncCrosshair(currentVolume, currentVolumeSeries, { time: param.time, value: volumeData.value });
          if (rsi2Data) syncCrosshair(currentRSI2, currentRSI2Series, { time: param.time, value: rsi2Data.value });
        } else {
          currentChart.clearCrosshairPosition();
          currentVolume.clearCrosshairPosition();
          currentRSI2.clearCrosshairPosition();
        }
      });
      
      // RSI 2 chart crosshair handler
      currentRSI2.subscribeCrosshairMove(param => {
        if (param.time) {
          const candleData = currentSeries.data().find(d => d.time === param.time);
          const volumeData = currentVolumeSeries.data().find(d => d.time === param.time);
          const rsi14Data = currentRSI14Series.data().find(d => d.time === param.time);
          
          if (candleData) syncCrosshair(currentChart, currentSeries, { time: param.time, value: candleData.close });
          if (volumeData) syncCrosshair(currentVolume, currentVolumeSeries, { time: param.time, value: volumeData.value });
          if (rsi14Data) syncCrosshair(currentRSI14, currentRSI14Series, { time: param.time, value: rsi14Data.value });
        } else {
          currentChart.clearCrosshairPosition();
          currentVolume.clearCrosshairPosition();
          currentRSI14.clearCrosshairPosition();
        }
      });
      
      // CRITICAL: Synchronize visible time range and bar spacing across ALL charts
      // This ensures perfect pixel alignment when zooming/panning
      let syncingTimeRange = false;
      
      function syncTimeRange(sourceChart) {
        if (syncingTimeRange) return;
        syncingTimeRange = true;
        
        const timeScale = sourceChart.timeScale();
        const visibleRange = timeScale.getVisibleRange();
        const barSpacing = timeScale.options().barSpacing;
        
        if (visibleRange) {
          // Apply same visible range to all other charts
          [currentChart, currentVolume, currentRSI14, currentRSI2].forEach(chart => {
            if (chart !== sourceChart) {
              chart.timeScale().setVisibleRange(visibleRange);
              chart.timeScale().applyOptions({ barSpacing });
            }
          });
        }
        
        syncingTimeRange = false;
      }
      
      // Subscribe all charts to time range changes
      currentChart.timeScale().subscribeVisibleTimeRangeChange(() => syncTimeRange(currentChart));
      currentVolume.timeScale().subscribeVisibleTimeRangeChange(() => syncTimeRange(currentVolume));
      currentRSI14.timeScale().subscribeVisibleTimeRangeChange(() => syncTimeRange(currentRSI14));
      currentRSI2.timeScale().subscribeVisibleTimeRangeChange(() => syncTimeRange(currentRSI2));
      
      // CRITICAL: Force initial sync after a small delay to ensure DOM is fully rendered
      setTimeout(() => {
        const mainTimeScale = currentChart.timeScale();
        const visibleRange = mainTimeScale.getVisibleRange();
        const barSpacing = mainTimeScale.options().barSpacing;
        
        if (visibleRange) {
          // Force all charts to exact same visible range and bar spacing
          [currentVolume, currentRSI14, currentRSI2].forEach(chart => {
            chart.timeScale().setVisibleRange(visibleRange);
            chart.timeScale().applyOptions({ barSpacing });
          });
        }
        
        // Also sync width one more time
        const actualWidth = document.getElementById('mainChart').offsetWidth;
        [currentChart, currentVolume, currentRSI14, currentRSI2].forEach(chart => {
          chart.applyOptions({ width: actualWidth });
        });
      }, 100);
      
      // Add click handler for candle filtering (multi-select with toggle)
      currentChart.subscribeClick((param) => {
        if (param.time) {
          filterTradesByCandle(param.time, timeframe);
        }
      });
    }
    
    function switchTimeframe(tf) {
      currentTimeframe = tf;
      document.querySelectorAll('.tf-btn').forEach(btn => btn.classList.remove('active'));
      event.target.classList.add('active');
      document.getElementById('timeframe-label').textContent = tf;
      createCharts(tf);
    }
    
    function switchCurrency(currency) {
      if (!SOL_PRICE) return; // Can't switch if no price data
      
      currentCurrency = currency;
      
      // Update button states
      document.getElementById('sol-btn').classList.toggle('active', currency === 'SOL');
      document.getElementById('usd-btn').classList.toggle('active', currency === 'USD');
      
      // Recreate charts with new currency
      createCharts(currentTimeframe);
    }
    
    function switchTab(tab) {
      document.querySelectorAll('.tab-content').forEach(t => t.classList.remove('active'));
      document.querySelectorAll('.tab-button').forEach(b => b.classList.remove('active'));
      
      if (tab === 'trades') {
        document.getElementById('trades-tab').classList.add('active');
        document.querySelectorAll('.tab-button')[0].classList.add('active');
      } else if (tab === 'signatures') {
        document.getElementById('signatures-tab').classList.add('active');
        document.querySelectorAll('.tab-button')[1].classList.add('active');
      }
    }
    
    // Initialize with 1m timeframe
    createCharts('1m');
    
    // Helper function to format tags HTML
    function formatTags(tags) {
      if (!tags || tags.length === 0) return '';
      return tags.map(tag => {
        const className = tag.toLowerCase().replace(/_/g, '-');
        return \`<span class="tag \${className}">\${tag}</span>\`;
      }).join('');
    }
    
    // Filter trades by candle time (supports multi-select)
    let selectedCandles = [];
    
    function filterTradesByCandle(candleTime, timeframe) {
      // Toggle single candle selection
      const existingIndex = selectedCandles.findIndex(c => c.time === candleTime);
      if (existingIndex >= 0) {
        selectedCandles.splice(existingIndex, 1);
      } else {
        selectedCandles.push({ time: candleTime, timeframe });
      }
      
      // If no candles selected, clear filter and return
      if (selectedCandles.length === 0) {
        clearTradeFilter();
        return;
      }
      
      // Switch to All Trades tab
      switchTab('trades');
      
      // Get all swaps
      const allSwaps = ${JSON.stringify(swaps)};
      
      // Filter swaps for all selected candles
      const filteredSwaps = allSwaps.filter(s => {
        return selectedCandles.some(candle => {
          const candleTfSeconds = parseTimeframeToSeconds(candle.timeframe);
          const candleEnd = candle.time + candleTfSeconds;
          return s.timestamp >= candle.time && s.timestamp < candleEnd;
        });
      });
      
      // Remove duplicates and sort by timestamp
      const uniqueSwaps = Array.from(new Map(filteredSwaps.map(s => [s.signature, s])).values())
        .sort((a, b) => b.timestamp - a.timestamp);
      
      // Update UI
      const tradeList = document.querySelector('#trades-tab .trade-list');
      if (!tradeList) return;
      
      // Remove existing filter header if present
      let currentElement = tradeList.previousElementSibling;
      while (currentElement && currentElement.classList?.contains('filter-header')) {
        const toRemove = currentElement;
        currentElement = currentElement.previousElementSibling;
        toRemove.remove();
      }
      
      tradeList.innerHTML = '';
      
      // Add filter indicator
      const filterHeader = document.createElement('div');
      filterHeader.className = 'filter-header';
      filterHeader.style.cssText = 'background: #f97316; color: white; padding: 8px; margin-bottom: 8px; border-radius: 4px; display: flex; justify-content: space-between; align-items: center; gap: 8px;';
      
      const candleRanges = selectedCandles.length === 1 
        ? \`\${new Date(selectedCandles[0].time * 1000).toLocaleTimeString()} (\${selectedCandles[0].timeframe})\`
        : \`\${selectedCandles.length} candles selected\`;
      
      filterHeader.innerHTML = \`
        <span>🔍 Showing \${uniqueSwaps.length} trades from \${candleRanges}</span>
        <button onclick="clearTradeFilter()" style="background: white; color: #f97316; border: none; padding: 4px 12px; border-radius: 4px; cursor: pointer; font-weight: bold;">Clear All</button>
      \`;
      tradeList.insertAdjacentElement('beforebegin', filterHeader);
      
      // Display filtered trades
      uniqueSwaps.forEach(swap => {
        const time = new Date(swap.timestamp * 1000).toLocaleString();
        const typeClass = swap.type === 'burn' ? 'burn' : (swap.type === 'buy' ? 'buy' : 'sell');
        const typeIcon = swap.type === 'burn' ? '🔥 ' : '';
        
        const tradeHTML = \`
          <div class="trade-item">
            <div class="trade-time">\${time} • Slot: \${swap.slot}</div>
            <div class="trade-type \${typeClass}">\${typeIcon}\${swap.type.toUpperCase()}</div>
            \${swap.tags ? \`<div class="trade-tags">\${formatTags(swap.tags)}</div>\` : ''}
            <div class="trade-details">
              <div><span class="trade-label">Amount:</span><span class="trade-value">\${swap.tokenAmount.toFixed(2)}</span></div>
              \${swap.type !== 'burn' ? \`<div><span class="trade-label">Price:</span><span class="trade-value">\${swap.price.toFixed(12)}</span></div>\` : ''}
              \${swap.type !== 'burn' ? \`<div><span class="trade-label">Volume:</span><span class="trade-value">\${swap.solAmount.toFixed(4)} SOL</span></div>\` : ''}
              <div><span class="trade-label">Signature:</span><span class="trade-value">\${swap.signature.slice(0, 8)}...</span></div>
            </div>
          </div>
        \`;
        
        tradeList.insertAdjacentHTML('beforeend', tradeHTML);
      });
    }
    
    // Clear trade filter
    window.clearTradeFilter = function() {
      selectedCandles = [];
      
      // Remove all filter headers
      const tradeList = document.querySelector('#trades-tab .trade-list');
      if (!tradeList) return;
      
      let currentElement = tradeList.previousElementSibling;
      while (currentElement && currentElement.classList?.contains('filter-header')) {
        const toRemove = currentElement;
        currentElement = currentElement.previousElementSibling;
        toRemove.remove();
      }
      
      // Restore all trades
      const allSwaps = ${JSON.stringify(swaps)};
      
      tradeList.innerHTML = '';
      allSwaps.slice(-200).reverse().forEach(swap => {
        const time = new Date(swap.timestamp * 1000).toLocaleString();
        const typeClass = swap.type === 'burn' ? 'burn' : (swap.type === 'buy' ? 'buy' : 'sell');
        const typeIcon = swap.type === 'burn' ? '🔥 ' : '';
        
        const tradeHTML = \`
          <div class="trade-item">
            <div class="trade-time">\${time} • Slot: \${swap.slot}</div>
            <div class="trade-type \${typeClass}">\${typeIcon}\${swap.type.toUpperCase()}</div>
            \${swap.tags ? \`<div class="trade-tags">\${formatTags(swap.tags)}</div>\` : ''}
            <div class="trade-details">
              <div><span class="trade-label">Amount:</span><span class="trade-value">\${swap.tokenAmount.toFixed(2)}</span></div>
              \${swap.type !== 'burn' ? \`<div><span class="trade-label">Price:</span><span class="trade-value">\${swap.price.toFixed(12)}</span></div>\` : ''}
              \${swap.type !== 'burn' ? \`<div><span class="trade-label">Volume:</span><span class="trade-value">\${swap.solAmount.toFixed(4)} SOL</span></div>\` : ''}
              <div><span class="trade-label">Signature:</span><span class="trade-value">\${swap.signature.slice(0, 8)}...</span></div>
            </div>
          </div>
        \`;
        
        tradeList.insertAdjacentHTML('beforeend', tradeHTML);
      });
    };
    
    // Helper to parse timeframe to seconds
    function parseTimeframeToSeconds(tf) {
      const match = tf.match(/^(\\d+)([smHD])$/);
      if (!match) return 60;
      const value = parseInt(match[1]);
      const unit = match[2];
      switch (unit) {
        case 's': return value;
        case 'm': return value * 60;
        case 'H': return value * 3600;
        case 'D': return value * 86400;
        default: return 60;
      }
    }
    
    // Add trade to live feed (sidebar)
    function addToTradeFeed(swap) {
      const tradeList = document.querySelector('.trade-log .trade-list');
      if (!tradeList) return;
      
      const time = new Date(swap.timestamp * 1000).toLocaleString();
      const typeClass = swap.type === 'burn' ? 'burn' : (swap.type === 'buy' ? 'buy' : 'sell');
      const typeIcon = swap.type === 'burn' ? '🔥 ' : '';
      
      const tradeHTML = \`
        <div class="trade-item" style="animation: slideIn 0.3s;">
          <div class="trade-time">\${time}</div>
          <div class="trade-type \${typeClass}">\${typeIcon}\${swap.type.toUpperCase()}</div>
          \${swap.tags ? \`<div class="trade-tags">\${formatTags(swap.tags)}</div>\` : ''}
          <div class="trade-details">
            <div><span class="trade-label">Amount:</span><span class="trade-value">\${swap.tokenAmount.toFixed(2)}</span></div>
            \${swap.type !== 'burn' ? \`<div><span class="trade-label">Price:</span><span class="trade-value">\${swap.price.toFixed(12)}</span></div>\` : ''}
            \${swap.type !== 'burn' ? \`<div><span class="trade-label">Volume:</span><span class="trade-value">\${swap.solAmount.toFixed(4)} SOL</span></div>\` : ''}
            <div><span class="trade-label">Signature:</span><span class="trade-value">\${swap.signature.slice(0, 8)}...</span></div>
          </div>
        </div>
      \`;
      
      tradeList.insertAdjacentHTML('afterbegin', tradeHTML);
      
      // Keep only last 100 trades
      while (tradeList.children.length > 100) {
        tradeList.removeChild(tradeList.lastChild);
      }
    }
    
    // Add trade to All Trades tab (first tab)
    function addToAllTrades(swap) {
      const tradeList = document.querySelector('#trades-tab .trade-list');
      if (!tradeList) return;
      
      const time = new Date(swap.timestamp * 1000).toLocaleString();
      const typeClass = swap.type === 'burn' ? 'burn' : (swap.type === 'buy' ? 'buy' : 'sell');
      const typeIcon = swap.type === 'burn' ? '🔥 ' : '';
      
      const tradeHTML = \`
        <div class="trade-item" style="animation: slideIn 0.3s;">
          <div class="trade-time">\${time} • Slot: \${swap.slot}</div>
          <div class="trade-type \${typeClass}">\${typeIcon}\${swap.type.toUpperCase()}</div>
          \${swap.tags ? \`<div class="trade-tags">\${formatTags(swap.tags)}</div>\` : ''}
          <div class="trade-details">
            <div><span class="trade-label">Amount:</span><span class="trade-value">\${swap.tokenAmount.toFixed(2)}</span></div>
            \${swap.type !== 'burn' ? \`<div><span class="trade-label">Price:</span><span class="trade-value">\${swap.price.toFixed(12)}</span></div>\` : ''}
            \${swap.type !== 'burn' ? \`<div><span class="trade-label">Volume:</span><span class="trade-value">\${swap.solAmount.toFixed(4)} SOL</span></div>\` : ''}
            <div><span class="trade-label">Signature:</span><span class="trade-value">\${swap.signature.slice(0, 8)}...</span></div>
          </div>
        </div>
      \`;
      
      tradeList.insertAdjacentHTML('afterbegin', tradeHTML);
      
      // Keep only last 200 trades
      while (tradeList.children.length > 200) {
        tradeList.removeChild(tradeList.lastChild);
      }
    }
    
    // WebSocket connection for real-time updates
    let ws = null;
    function connectWebSocket() {
      ws = new WebSocket('ws://localhost:8889');
      
      ws.onopen = () => {
        console.log('🔌 Connected to live feed');
        document.title = '🔴 LIVE - OHLCV Analysis';
      };
      
      ws.onmessage = (event) => {
        const message = JSON.parse(event.data);
        
        if (message.type === 'initial') {
          // Received current state from server (includes all live updates)
          console.log('📥 Received current state from server');
          
          // Replace candleData with current state
          Object.assign(candleData, message.candles);
          
          // Recreate charts with fresh data
          if (currentSeries) {
            createCharts(currentTimeframe);
          }
          
          console.log('✅ Charts updated with latest data');
        }
        
        if (message.type === 'swap') {
          const swap = message.data;
          console.log('📈 New swap:', swap);
          
          // Add to live feed tab
          addToTradeFeed(swap);
          
          // Add to all trades tab
          addToAllTrades(swap);
        }
        
        if (message.type === 'burn') {
          const burn = message.data;
          console.log('🔥 Burn detected:', burn);
          
          // Add to live feed tab
          addToTradeFeed(burn);
          
          // Add to all trades tab
          addToAllTrades(burn);
        }
        
        if (message.type === 'candleUpdate') {
          const { timeframe, candle } = message;
          
          // Validate candle data to prevent null errors
          if (!candle || candle.open == null || candle.high == null || 
              candle.low == null || candle.close == null) {
            console.warn('Invalid candle data received:', candle);
            return;
          }
          
          // Validate time is a valid number
          if (typeof candle.time !== 'number' || isNaN(candle.time)) {
            console.warn('Invalid candle time:', candle.time, 'Type:', typeof candle.time);
            return;
          }
          
          // Update current timeframe's chart
          if (timeframe === currentTimeframe) {
            try {
              currentSeries.update({
                time: candle.time,
                open: candle.open,
                high: candle.high,
                low: candle.low,
                close: candle.close
              });
              
              currentVolumeSeries.update({
                time: candle.time,
                value: candle.volume || 0,
                color: candle.close >= candle.open ? '#10b981' : '#ef4444'
              });
              
              console.log(\`📊 Updated \${timeframe} candle\`);
            } catch (err) {
              console.warn('Failed to update chart:', err.message, 'Candle:', candle);
            }
          }
          
          // Update stored candle data
          if (candleData[timeframe]) {
            const existing = candleData[timeframe].find(c => c.time === candle.time);
            if (existing) {
              Object.assign(existing, candle);
            } else {
              candleData[timeframe].push(candle);
            }
          }
        }
      };
      
      ws.onclose = () => {
        console.log('❌ Disconnected from live feed');
        document.title = 'OHLCV Analysis';
        // Reconnect after 2 seconds
        setTimeout(connectWebSocket, 2000);
      };
      
      ws.onerror = (error) => {
        console.error('WebSocket error:', error);
      };
    }
    
    // Connect to WebSocket
    connectWebSocket();
  </script>
</body>
</html>`;
}
