# Coinwatcher

Krypto-Marktanalyse PWA für Bitcoin und XRP, optimiert für iPad.

## Tech Stack
- Vanilla HTML/CSS/JavaScript (ES Modules, kein Build-Step)
- Canvas API für Charts
- Binance API (REST + WebSocket, kein API-Key nötig)
- PWA mit Service Worker für Offline-Fähigkeit

## Struktur
- `index.html` — App-Shell
- `css/styles.css` — Responsive Styles, Dark/Light Mode
- `js/app.js` — Hauptlogik, UI-Controller, WebSocket-Handler
- `js/api.js` — Binance API-Wrapper (REST + WebSocket) mit Caching
- `js/charts.js` — Canvas-basierte Preischarts
- `js/indicators.js` — Technische Analyse (SMA, RSI, MACD)
- `js/insights.js` — Marktanalyse-Generator (deutsch)
- `sw.js` — Service Worker
- `manifest.json` — PWA-Manifest

## API
- REST: `https://api.binance.com/api/v3` (Ticker, Klines)
- WebSocket: `wss://stream.binance.com:443/stream` (Live-Updates)
- Kein API-Key erforderlich
- Marktkapitalisierung wird aus Preis × geschätzter Umlaufmenge berechnet

## Lokaler Entwicklungsserver
```
python3 -m http.server 8080
```

## Währung
Alle Preise in EUR (Handelspaare: BTCEUR, XRPEUR).
