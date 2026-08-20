const API_BASE = 'https://api.binance.com/api/v3';
const WS_URL = 'wss://stream.binance.com:443/stream';

const SYMBOLS = {
  bitcoin: { symbol: 'BTCEUR', name: 'Bitcoin', short: 'BTC', supply: 19700000 },
  ripple:  { symbol: 'XRPEUR', name: 'XRP',     short: 'XRP', supply: 57000000000 },
};

const COIN_IDS = Object.keys(SYMBOLS);
const COINS = Object.fromEntries(COIN_IDS.map(id => [id, SYMBOLS[id].name]));

const KLINE_CONFIG = {
  1:   { interval: '5m',  limit: 288 },
  7:   { interval: '1h',  limit: 168 },
  30:  { interval: '4h',  limit: 180 },
  90:  { interval: '1d',  limit: 90 },
  365: { interval: '1d',  limit: 365 },
};

const memCache = new Map();

function getStored(key) {
  try {
    const raw = localStorage.getItem('cw_' + key);
    return raw ? JSON.parse(raw) : null;
  } catch { return null; }
}

function setStored(key, data) {
  try {
    localStorage.setItem('cw_' + key, JSON.stringify({ data, ts: Date.now() }));
  } catch {}
}

async function cachedFetch(key, url, ttl = 60000) {
  const mem = memCache.get(key);
  if (mem && Date.now() - mem.ts < ttl) return mem.data;

  try {
    const res = await fetch(url);
    if (res.status === 429) throw new Error('RATE_LIMITED');
    if (res.status === 418) throw new Error('RATE_LIMITED');
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    memCache.set(key, { data, ts: Date.now() });
    setStored(key, data);
    return data;
  } catch (err) {
    const stored = getStored(key);
    if (stored) return stored.data;
    throw err;
  }
}

export async function fetchMarkets() {
  const results = await Promise.all(
    COIN_IDS.map(async id => {
      const sym = SYMBOLS[id];
      const [ticker, klines] = await Promise.all([
        cachedFetch(`ticker_${id}`, `${API_BASE}/ticker/24hr?symbol=${sym.symbol}`, 30000),
        cachedFetch(`spark_${id}`, `${API_BASE}/klines?symbol=${sym.symbol}&interval=1h&limit=168`, 300000),
      ]);

      const sparkPrices = klines.map(k => parseFloat(k[4]));
      const firstClose = parseFloat(klines[0]?.[4] || 0);
      const lastClose = parseFloat(klines[klines.length - 1]?.[4] || 0);
      const price = parseFloat(ticker.lastPrice);

      return {
        id,
        name: sym.name,
        symbol: sym.short,
        current_price: price,
        price_change_percentage_24h: parseFloat(ticker.priceChangePercent),
        market_cap: price * sym.supply,
        total_volume: parseFloat(ticker.quoteVolume),
        high_24h: parseFloat(ticker.highPrice),
        low_24h: parseFloat(ticker.lowPrice),
        sparkline_in_7d: { price: sparkPrices },
        price_change_percentage_7d_in_currency:
          firstClose ? ((lastClose - firstClose) / firstClose) * 100 : null,
      };
    })
  );
  return results;
}

export async function fetchMarketChart(coinId, currency = 'eur', days = 7) {
  const sym = SYMBOLS[coinId];
  const cfg = KLINE_CONFIG[days] || KLINE_CONFIG[7];
  const klines = await cachedFetch(
    `chart_${coinId}_${days}`,
    `${API_BASE}/klines?symbol=${sym.symbol}&interval=${cfg.interval}&limit=${cfg.limit}`,
    300000
  );
  return {
    prices: klines.map(k => [k[0], parseFloat(k[4])])
  };
}

const NEWS_APIS = [
  {
    url: 'https://min-api.cryptocompare.com/data/v2/news/?categories=BTC,XRP&excludeCategories=Sponsored&lang=EN',
    parse: data => (data.Data || []).slice(0, 10).map(item => ({
      title: item.title,
      body: item.body?.substring(0, 150),
      url: item.url,
      image: item.imageurl,
      source: item.source_info?.name || item.source,
      categories: item.categories?.split('|') || [],
      publishedAt: item.published_on * 1000,
    })),
  },
  {
    url: 'https://api.coinstats.app/public/v1/news?skip=0&limit=10',
    parse: data => (data.news || data || []).slice(0, 10).map(item => ({
      title: item.title,
      body: item.description?.substring(0, 150) || '',
      url: item.link || item.url,
      image: item.imgURL || item.imgUrl || item.thumbnail,
      source: item.source,
      categories: item.coins?.map(c => c.coinNameId?.toUpperCase()) || [],
      publishedAt: new Date(item.feedDate || item.date).getTime(),
    })),
  },
];

export async function fetchNews() {
  for (const api of NEWS_APIS) {
    try {
      const res = await fetch(api.url);
      if (!res.ok) continue;
      const data = await res.json();
      const news = api.parse(data);
      if (news.length > 0) return news;
    } catch {}
  }
  return [];
}

export function connectLiveUpdates(onUpdate) {
  const streams = COIN_IDS.map(id => `${SYMBOLS[id].symbol.toLowerCase()}@ticker`).join('/');
  let ws;
  let reconnectTimer;

  function connect() {
    ws = new WebSocket(`${WS_URL}?streams=${streams}`);

    ws.onopen = () => {
      onUpdate(null, { connected: true });
    };

    ws.onmessage = (event) => {
      const msg = JSON.parse(event.data);
      const d = msg.data;
      if (!d || !d.s) return;
      const coinId = COIN_IDS.find(id => SYMBOLS[id].symbol === d.s);
      if (!coinId) return;

      const sym = SYMBOLS[coinId];
      onUpdate(coinId, {
        current_price: parseFloat(d.c),
        price_change_percentage_24h: parseFloat(d.P),
        high_24h: parseFloat(d.h),
        low_24h: parseFloat(d.l),
        total_volume: parseFloat(d.q),
        market_cap: parseFloat(d.c) * sym.supply,
      });
    };

    ws.onclose = () => {
      onUpdate(null, { connected: false });
      reconnectTimer = setTimeout(connect, 5000);
    };

    ws.onerror = () => ws.close();
  }

  connect();

  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible' && (!ws || ws.readyState > 1)) {
      clearTimeout(reconnectTimer);
      connect();
    }
  });

  return () => { clearTimeout(reconnectTimer); ws?.close(); };
}

export { COINS, COIN_IDS };
