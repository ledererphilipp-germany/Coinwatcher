# Coinwatcher

Krypto-Marktanalyse PWA für Bitcoin und XRP, optimiert für iPad.

## Tech Stack
- Vanilla HTML/CSS/JavaScript (ES Modules, kein Build-Step)
- Canvas API für Charts
- CoinGecko API (kostenlos, optional mit Demo-Schlüssel)
- PWA mit Service Worker für Offline-Fähigkeit

## Struktur
- `index.html` — App-Shell
- `css/styles.css` — Responsive Styles, Dark/Light Mode
- `js/app.js` — Hauptlogik, UI-Controller
- `js/api.js` — CoinGecko API-Wrapper mit Caching
- `js/charts.js` — Canvas-basierte Preischarts
- `js/indicators.js` — Technische Analyse (SMA, RSI, MACD)
- `js/insights.js` — Marktanalyse-Generator (deutsch)
- `sw.js` — Service Worker
- `manifest.json` — PWA-Manifest

## Lokaler Entwicklungsserver
```
python3 -m http.server 8080
```

## Währung
Alle Preise in EUR. Konfigurierbar in `js/api.js`.
