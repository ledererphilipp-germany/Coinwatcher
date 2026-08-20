import { fetchMarkets, fetchMarketChart, connectLiveUpdates, COINS, COIN_IDS } from './api.js';
import { PriceChart, RSIGauge } from './charts.js';
import { calculateAll } from './indicators.js';
import { generateInsights } from './insights.js';

const TIMEFRAMES = { '24h': 1, '7T': 7, '30T': 30, '90T': 90, '1J': 365 };
const COIN_SYMBOLS = { bitcoin: 'BTC', ripple: 'XRP' };

let state = {
  selectedCoin: 'bitcoin',
  selectedTimeframe: '7T',
  marketsData: null,
  chartPrices: {},
  chartTimestamps: {},
  indicators: {},
  loading: true,
  error: null,
  live: false,
};

let chart, rsiGauge;
let chartRefreshTimer;

function $(sel) { return document.querySelector(sel); }
function $$(sel) { return document.querySelectorAll(sel); }

export async function init() {
  initTheme();
  chart = new PriceChart($('#price-chart'));
  rsiGauge = new RSIGauge($('#rsi-canvas'));

  $$('.coin-card').forEach(el => {
    el.addEventListener('click', () => selectCoin(el.dataset.coin));
  });

  $$('.tf-btn').forEach(btn => {
    btn.addEventListener('click', () => selectTimeframe(btn.dataset.tf));
  });

  $('#theme-toggle').addEventListener('click', toggleTheme);
  $('#sma-toggle').addEventListener('change', e => {
    chart.showSMA = e.target.checked;
    chart.render();
  });

  await refresh();

  connectLiveUpdates(handleLiveUpdate);
  chartRefreshTimer = setInterval(refreshChartData, 300000);
}

function handleLiveUpdate(coinId, data) {
  if (!coinId) {
    state.live = !!data.connected;
    renderConnectionStatus();
    return;
  }

  if (!state.marketsData) return;
  const coin = state.marketsData.find(c => c.id === coinId);
  if (!coin) return;

  Object.assign(coin, data);
  updateCoinCard(coin);
  renderLastUpdate();
}

function updateCoinCard(coin) {
  const card = $(`.coin-card[data-coin="${coin.id}"]`);
  if (!card) return;

  const priceEl = card.querySelector('.coin-price');
  priceEl.textContent = fmtEur(coin.current_price);
  priceEl.classList.remove('loading');

  const pct = coin.price_change_percentage_24h;
  const changeEl = card.querySelector('.coin-change');
  changeEl.textContent = (pct >= 0 ? '+' : '') + pct.toFixed(2) + '%';
  changeEl.className = 'coin-change ' + (pct >= 0 ? 'positive' : 'negative');

  card.querySelector('.stat-vol').textContent = fmtCompact(coin.total_volume);
  card.querySelector('.stat-high').textContent = fmtEur(coin.high_24h);
  card.querySelector('.stat-low').textContent = fmtEur(coin.low_24h);
  card.querySelector('.stat-mcap').textContent = fmtCompact(coin.market_cap);
}

function renderConnectionStatus() {
  const el = $('#live-indicator');
  if (state.live) {
    el.className = 'live-indicator connected';
    el.title = 'Live-Verbindung aktiv';
  } else {
    el.className = 'live-indicator';
    el.title = 'Verbindung getrennt';
  }
}

function initTheme() {
  const saved = localStorage.getItem('cw_theme');
  if (saved) document.documentElement.setAttribute('data-theme', saved);
  const isDark = saved === 'dark' || (!saved && window.matchMedia('(prefers-color-scheme: dark)').matches);
  const icon = document.getElementById('theme-icon');
  if (icon) icon.textContent = isDark ? '☀' : '☾';
}

function toggleTheme() {
  const current = document.documentElement.getAttribute('data-theme');
  const isDark = current === 'dark' || (!current && window.matchMedia('(prefers-color-scheme: dark)').matches);
  const next = isDark ? 'light' : 'dark';
  document.documentElement.setAttribute('data-theme', next);
  localStorage.setItem('cw_theme', next);
  $('#theme-icon').textContent = next === 'dark' ? '☀' : '☾';
  chart?.render();
  rsiGauge?.render();
}

async function refresh() {
  try {
    state.loading = true;
    renderLoadingState();

    const [markets] = await Promise.all([
      fetchMarkets(),
      loadChartData(state.selectedCoin, TIMEFRAMES[state.selectedTimeframe]),
    ]);

    state.marketsData = markets;
    state.error = null;
    state.loading = false;

    renderDashboard();
    renderChart();
    renderIndicators();
    renderInsights();
    renderLastUpdate();
  } catch (err) {
    state.error = err.message;
    state.loading = false;
    renderError();
  }
}

async function refreshChartData() {
  try {
    await loadChartData(state.selectedCoin, TIMEFRAMES[state.selectedTimeframe]);
    renderChart();
    renderIndicators();
    renderInsights();
  } catch {}
}

async function loadChartData(coinId, days) {
  const data = await fetchMarketChart(coinId, 'eur', days);
  state.chartTimestamps[coinId] = data.prices.map(p => p[0]);
  state.chartPrices[coinId] = data.prices.map(p => p[1]);
  state.indicators[coinId] = calculateAll(state.chartPrices[coinId]);
}

function selectCoin(coinId) {
  state.selectedCoin = coinId;
  $$('.coin-card').forEach(el => el.classList.toggle('active', el.dataset.coin === coinId));
  loadChartData(coinId, TIMEFRAMES[state.selectedTimeframe]).then(() => {
    renderChart();
    renderIndicators();
    renderInsights();
  });
}

function selectTimeframe(tf) {
  state.selectedTimeframe = tf;
  $$('.tf-btn').forEach(btn => btn.classList.toggle('active', btn.dataset.tf === tf));
  loadChartData(state.selectedCoin, TIMEFRAMES[tf]).then(() => {
    renderChart();
    renderIndicators();
  });
}

function renderDashboard() {
  if (!state.marketsData) return;
  for (const coin of state.marketsData) {
    updateCoinCard(coin);
    const card = $(`.coin-card[data-coin="${coin.id}"]`);
    if (!card) continue;
    const sparkline = coin.sparkline_in_7d?.price;
    if (sparkline) renderSparkline(card.querySelector('.sparkline'), sparkline, coin.price_change_percentage_24h >= 0);
  }
}

function renderSparkline(canvas, prices, positive) {
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  const dpr = window.devicePixelRatio || 1;
  const w = canvas.clientWidth;
  const h = canvas.clientHeight;
  canvas.width = w * dpr;
  canvas.height = h * dpr;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, w, h);

  const min = Math.min(...prices);
  const max = Math.max(...prices);
  const range = max - min || 1;
  const pad = 2;

  ctx.beginPath();
  for (let i = 0; i < prices.length; i++) {
    const x = (i / (prices.length - 1)) * w;
    const y = pad + (1 - (prices[i] - min) / range) * (h - pad * 2);
    if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
  }
  ctx.strokeStyle = positive ? '#00C853' : '#FF3D00';
  ctx.lineWidth = 1.5;
  ctx.lineJoin = 'round';
  ctx.stroke();
}

function renderChart() {
  const coinId = state.selectedCoin;
  const prices = state.chartPrices[coinId];
  const timestamps = state.chartTimestamps[coinId];
  const ind = state.indicators[coinId];
  if (!prices) return;

  $('#chart-title').textContent = `${COINS[coinId]} (${COIN_SYMBOLS[coinId]}/EUR)`;

  chart.setData(timestamps, prices, coinId, {
    sma7: ind?.sma7,
    sma25: ind?.sma25,
  });
}

function renderIndicators() {
  const coinId = state.selectedCoin;
  const ind = state.indicators[coinId];
  if (!ind) return;

  const currentRsi = lastValid(ind.rsi);
  if (currentRsi != null) {
    rsiGauge.setValue(currentRsi);
    $('#rsi-value').textContent = `RSI(14): ${currentRsi.toFixed(1)}`;
  }

  const sma7 = lastValid(ind.sma7);
  const sma25 = lastValid(ind.sma25);
  const prices = state.chartPrices[coinId];
  const currentPrice = prices?.[prices.length - 1];

  let trend = 'neutral';
  let trendText = 'Seitwärts';
  if (sma7 && sma25 && currentPrice) {
    if (currentPrice > sma7 && sma7 > sma25) { trend = 'bullish'; trendText = 'Aufwärtstrend'; }
    else if (currentPrice < sma7 && sma7 < sma25) { trend = 'bearish'; trendText = 'Abwärtstrend'; }
  }

  const trendEl = $('#trend-label');
  trendEl.textContent = trendText;
  trendEl.className = 'trend-label ' + trend;

  $('#sma7-val').textContent = sma7 ? fmtEur(sma7) : '—';
  $('#sma25-val').textContent = sma25 ? fmtEur(sma25) : '—';

  const macdHist = ind.macd?.histogram;
  const macdVal = macdHist ? macdHist[macdHist.length - 1] : null;
  const macdEl = $('#macd-signal');
  if (macdVal != null) {
    macdEl.textContent = macdVal > 0 ? 'Bullisch' : 'Bärisch';
    macdEl.className = 'macd-signal ' + (macdVal > 0 ? 'bullish' : 'bearish');
  }

  const phaseEl = $('#market-phase');
  if (currentRsi != null && trend !== 'neutral') {
    if (trend === 'bullish' && currentRsi > 50) {
      phaseEl.textContent = 'Akkumulation';
      phaseEl.className = 'trend-label bullish';
    } else if (trend === 'bearish' && currentRsi < 50) {
      phaseEl.textContent = 'Distribution';
      phaseEl.className = 'trend-label bearish';
    } else {
      phaseEl.textContent = 'Konsolidierung';
      phaseEl.className = 'trend-label neutral';
    }
  } else {
    phaseEl.textContent = 'Konsolidierung';
    phaseEl.className = 'trend-label neutral';
  }
}

function renderInsights() {
  const container = $('#insights-list');
  if (!state.marketsData) return;

  const insights = generateInsights(state.marketsData, state.chartPrices, state.indicators);

  container.innerHTML = insights.map(ins => `
    <div class="insight-item ${ins.type}">
      <span class="insight-icon">${ins.icon}</span>
      <span class="insight-text">${ins.text}</span>
    </div>
  `).join('');
}

function renderLoadingState() {
  $$('.coin-price').forEach(el => el.classList.add('loading'));
}

function renderError() {
  $$('.coin-price').forEach(el => el.classList.remove('loading'));
  const msg = state.error === 'RATE_LIMITED'
    ? 'API-Limit erreicht. Versuche es in einer Minute erneut.'
    : 'Keine Verbindung zur API. Daten werden bei nächster Aktualisierung geladen.';
  $('#error-banner').textContent = msg;
  $('#error-banner').classList.add('visible');
  setTimeout(() => $('#error-banner').classList.remove('visible'), 8000);
}

function renderLastUpdate() {
  const now = new Date();
  $('#last-update').textContent =
    `Aktualisiert: ${now.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}`;
}

function fmtEur(val) {
  if (val == null) return '—';
  if (val >= 1000) return val.toLocaleString('de-DE', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 });
  if (val >= 1) return val.toLocaleString('de-DE', { style: 'currency', currency: 'EUR', maximumFractionDigits: 2 });
  return val.toLocaleString('de-DE', { style: 'currency', currency: 'EUR', maximumFractionDigits: 4 });
}

function fmtCompact(val) {
  if (val == null) return '—';
  if (val >= 1e12) return (val / 1e12).toFixed(2) + ' Bio. €';
  if (val >= 1e9) return (val / 1e9).toFixed(2) + ' Mrd. €';
  if (val >= 1e6) return (val / 1e6).toFixed(1) + ' Mio. €';
  return val.toLocaleString('de-DE') + ' €';
}

function lastValid(arr) {
  if (!arr) return null;
  for (let i = arr.length - 1; i >= 0; i--) {
    if (arr[i] != null) return arr[i];
  }
  return null;
}

document.addEventListener('DOMContentLoaded', init);
