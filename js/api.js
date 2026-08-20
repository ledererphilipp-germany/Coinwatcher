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

// ---------------------------------------------------------------------------
// News: mehrere Quellen werden parallel abgefragt. Es genügt, wenn eine liefert.
// ---------------------------------------------------------------------------

const NEWS_TIMEOUT = 9000;

// CORS-Proxies für RSS-Feeds, die keine CORS-Header senden.
const CORS_PROXIES = [
  u => `https://api.allorigins.win/raw?url=${encodeURIComponent(u)}`,
  u => `https://api.codetabs.com/v1/proxy?quest=${encodeURIComponent(u)}`,
  u => `https://corsproxy.io/?url=${encodeURIComponent(u)}`,
];

const RSS_FEEDS = [
  { url: 'https://cointelegraph.com/rss/tag/bitcoin', source: 'Cointelegraph' },
  { url: 'https://cointelegraph.com/rss/tag/ripple',  source: 'Cointelegraph' },
  { url: 'https://www.coindesk.com/arc/outboundfeeds/rss/', source: 'CoinDesk' },
  { url: 'https://decrypt.co/feed',      source: 'Decrypt' },
  { url: 'https://bitcoinist.com/feed/', source: 'Bitcoinist' },
  { url: 'https://www.newsbtc.com/feed/', source: 'NewsBTC' },
];

function timedFetch(url, ms = NEWS_TIMEOUT) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), ms);
  return fetch(url, { signal: ctrl.signal }).finally(() => clearTimeout(t));
}

function stripHtml(html) {
  if (!html) return '';
  const doc = new DOMParser().parseFromString(html, 'text/html');
  return (doc.body.textContent || '').replace(/\s+/g, ' ').trim();
}

function tagsFor(text) {
  const t = (text || '').toLowerCase();
  const tags = [];
  if (/\bbitcoin\b|\bbtc\b/.test(t)) tags.push('BTC');
  if (/\bxrp\b|\bripple\b/.test(t)) tags.push('XRP');
  return tags;
}

function parseRss(xml, sourceName) {
  const doc = new DOMParser().parseFromString(xml, 'application/xml');
  if (doc.getElementsByTagName('parsererror').length) return [];

  const nodes = [...doc.getElementsByTagName('item'), ...doc.getElementsByTagName('entry')];
  return nodes.map(node => {
    const get = tag => node.getElementsByTagName(tag)[0]?.textContent?.trim() || '';

    const title = get('title');
    let link = get('link');
    if (!link) link = node.getElementsByTagName('link')[0]?.getAttribute('href') || '';

    const descRaw = get('description') || get('content:encoded') || get('summary');
    const dateRaw = get('pubDate') || get('published') || get('updated') || get('dc:date');

    const image =
      node.getElementsByTagName('media:content')[0]?.getAttribute('url') ||
      node.getElementsByTagName('media:thumbnail')[0]?.getAttribute('url') ||
      node.getElementsByTagName('enclosure')[0]?.getAttribute('url') ||
      descRaw.match(/<img[^>]+src=["']([^"']+)["']/i)?.[1] ||
      '';

    const body = stripHtml(descRaw).slice(0, 180);
    const ts = Date.parse(dateRaw);

    return {
      title,
      body,
      url: link,
      image,
      source: sourceName,
      categories: tagsFor(`${title} ${body}`),
      publishedAt: Number.isNaN(ts) ? Date.now() : ts,
    };
  }).filter(i => i.title && i.url);
}

async function loadRssFeed(feed) {
  for (const proxy of CORS_PROXIES) {
    try {
      const res = await timedFetch(proxy(feed.url));
      if (!res.ok) continue;
      const xml = await res.text();
      const items = parseRss(xml, feed.source);
      if (items.length) return items;
    } catch {}
  }
  return [];
}

async function loadCryptoCompare() {
  const res = await timedFetch(
    'https://min-api.cryptocompare.com/data/v2/news/?categories=BTC,XRP&excludeCategories=Sponsored&lang=EN'
  );
  if (!res.ok) throw new Error('HTTP ' + res.status);
  const data = await res.json();
  return (data.Data || []).map(item => ({
    title: item.title,
    body: (item.body || '').slice(0, 180),
    url: item.url,
    image: item.imageurl,
    source: item.source_info?.name || item.source || 'CryptoCompare',
    categories: tagsFor(`${item.title} ${item.categories || ''}`),
    publishedAt: item.published_on * 1000,
  })).filter(i => i.title && i.url);
}

export async function fetchNews() {
  const tasks = [loadCryptoCompare(), ...RSS_FEEDS.map(loadRssFeed)];
  const settled = await Promise.allSettled(tasks);

  const all = settled
    .filter(r => r.status === 'fulfilled' && Array.isArray(r.value))
    .flatMap(r => r.value);

  // Duplikate anhand des normalisierten Titels entfernen
  const seen = new Set();
  const unique = [];
  for (const item of all) {
    const key = item.title.toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 60);
    if (key && !seen.has(key)) {
      seen.add(key);
      unique.push(item);
    }
  }

  // BTC/XRP-Meldungen zuerst, danach nach Aktualität
  unique.sort((a, b) => {
    const rel = (b.categories.length > 0) - (a.categories.length > 0);
    return rel !== 0 ? rel : b.publishedAt - a.publishedAt;
  });

  return unique.slice(0, 12);
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
