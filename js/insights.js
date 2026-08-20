export function generateInsights(marketsData, chartData, indicators) {
  const insights = [];

  for (const coin of marketsData) {
    const name = coin.name;
    const pct24 = coin.price_change_percentage_24h;
    const pct7 = coin.price_change_percentage_7d_in_currency;
    const vol = coin.total_volume;
    const prevVol = coin.market_cap / 50;

    if (pct24 > 3) {
      insights.push({ coin: coin.id, type: 'bullish', icon: '⬆',
        text: `${name} steigt kräftig: +${pct24.toFixed(1)}% in 24 Stunden` });
    } else if (pct24 < -3) {
      insights.push({ coin: coin.id, type: 'bearish', icon: '⬇',
        text: `${name} fällt deutlich: ${pct24.toFixed(1)}% in 24 Stunden` });
    } else if (pct24 > 0) {
      insights.push({ coin: coin.id, type: 'neutral', icon: '↗',
        text: `${name} leicht im Plus: +${pct24.toFixed(1)}% in 24h` });
    } else {
      insights.push({ coin: coin.id, type: 'neutral', icon: '↘',
        text: `${name} leicht im Minus: ${pct24.toFixed(1)}% in 24h` });
    }

    if (pct7 != null) {
      if (pct7 > 10) {
        insights.push({ coin: coin.id, type: 'bullish', icon: '🚀',
          text: `${name} Wochenperformance stark: +${pct7.toFixed(1)}%` });
      } else if (pct7 < -10) {
        insights.push({ coin: coin.id, type: 'bearish', icon: '⚠',
          text: `${name} Wochenperformance schwach: ${pct7.toFixed(1)}%` });
      }
    }
  }

  for (const [coinId, ind] of Object.entries(indicators)) {
    const coin = marketsData.find(c => c.id === coinId);
    if (!coin || !ind) continue;
    const name = coin.name;

    const currentRsi = last(ind.rsi);
    if (currentRsi != null) {
      if (currentRsi > 70) {
        insights.push({ coin: coinId, type: 'warning', icon: '🟡',
          text: `${name} RSI bei ${currentRsi.toFixed(0)} — Überkauft-Zone` });
      } else if (currentRsi < 30) {
        insights.push({ coin: coinId, type: 'opportunity', icon: '🟢',
          text: `${name} RSI bei ${currentRsi.toFixed(0)} — Überverkauft-Zone` });
      }
    }

    const prices = chartData[coinId];
    if (prices && prices.length > 25) {
      const currentPrice = prices[prices.length - 1];
      const sma7val = last(ind.sma7);
      const sma25val = last(ind.sma25);

      if (sma7val && sma25val) {
        if (sma7val > sma25val && ind.sma7[ind.sma7.length - 2] <= ind.sma25[ind.sma25.length - 2]) {
          insights.push({ coin: coinId, type: 'bullish', icon: '✨',
            text: `${name}: SMA(7) kreuzt SMA(25) nach oben — bullisches Signal` });
        } else if (sma7val < sma25val && ind.sma7[ind.sma7.length - 2] >= ind.sma25[ind.sma25.length - 2]) {
          insights.push({ coin: coinId, type: 'bearish', icon: '⚠',
            text: `${name}: SMA(7) kreuzt SMA(25) nach unten — bärisches Signal` });
        }
      }

      if (sma25val && currentPrice > sma25val * 1.02) {
        insights.push({ coin: coinId, type: 'bullish', icon: '↗',
          text: `${name} handelt über SMA(25) — Aufwärtstrend intakt` });
      } else if (sma25val && currentPrice < sma25val * 0.98) {
        insights.push({ coin: coinId, type: 'bearish', icon: '↘',
          text: `${name} handelt unter SMA(25) — Abwärtstrend möglich` });
      }
    }

    const hist = ind.macd?.histogram;
    if (hist && hist.length > 2) {
      const curr = hist[hist.length - 1];
      const prev = hist[hist.length - 2];
      if (curr > 0 && prev <= 0) {
        insights.push({ coin: coinId, type: 'bullish', icon: '📈',
          text: `${name} MACD-Histogramm dreht positiv` });
      } else if (curr < 0 && prev >= 0) {
        insights.push({ coin: coinId, type: 'bearish', icon: '📉',
          text: `${name} MACD-Histogramm dreht negativ` });
      }
    }
  }

  insights.sort((a, b) => {
    const order = { bullish: 0, opportunity: 1, warning: 2, bearish: 3, neutral: 4 };
    return (order[a.type] ?? 5) - (order[b.type] ?? 5);
  });

  return insights;
}

function last(arr) {
  if (!arr) return null;
  for (let i = arr.length - 1; i >= 0; i--) {
    if (arr[i] != null) return arr[i];
  }
  return null;
}
