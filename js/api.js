const API_BASE = 'https://api.coingecko.com/api/v3';
const COINS = { bitcoin: 'Bitcoin', ripple: 'XRP' };
const COIN_IDS = Object.keys(COINS);

let apiKey = localStorage.getItem('cw_api_key') || '';

function headers() {
  const h = { 'Accept': 'application/json' };
  if (apiKey) h['x-cg-demo-api-key'] = apiKey;
  return h;
}

const memCache = new Map();

function cacheKey(endpoint, params) {
  return endpoint + '?' + new URLSearchParams(params).toString();
}

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

async function cachedFetch(endpoint, params = {}, ttl = 60000) {
  const key = cacheKey(endpoint, params);
  const mem = memCache.get(key);
  if (mem && Date.now() - mem.ts < ttl) return mem.data;

  const url = `${API_BASE}${endpoint}?${new URLSearchParams(params)}`;
  try {
    const res = await fetch(url, { headers: headers() });
    if (res.status === 429) throw new Error('RATE_LIMITED');
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

export function setApiKey(key) {
  apiKey = key;
  localStorage.setItem('cw_api_key', key);
}

export function getApiKey() {
  return apiKey;
}

export async function fetchMarkets(currency = 'eur') {
  return cachedFetch('/coins/markets', {
    vs_currency: currency,
    ids: COIN_IDS.join(','),
    order: 'market_cap_desc',
    sparkline: 'true',
    price_change_percentage: '1h,24h,7d',
  }, 60000);
}

export async function fetchMarketChart(coinId, currency = 'eur', days = 7) {
  return cachedFetch(`/coins/${coinId}/market_chart`, {
    vs_currency: currency,
    days: String(days),
  }, 300000);
}

export async function fetchTrending() {
  return cachedFetch('/search/trending', {}, 900000);
}

export { COINS, COIN_IDS };
