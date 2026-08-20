const COLORS = {
  bitcoin: { line: '#F7931A', fill: 'rgba(247,147,26,0.15)', sma7: '#FF6B6B', sma25: '#4ECDC4' },
  ripple:  { line: '#00AAE4', fill: 'rgba(0,170,228,0.15)', sma7: '#FF6B6B', sma25: '#4ECDC4' },
};

export class PriceChart {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.pad = { top: 24, right: 64, bottom: 36, left: 16 };
    this.data = null;
    this.overlays = { sma7: null, sma25: null };
    this.showSMA = true;
    this.coinId = 'bitcoin';
    this.tooltip = null;

    this._resize();
    this._resizeObs = new ResizeObserver(() => this._resize());
    this._resizeObs.observe(canvas.parentElement);

    canvas.addEventListener('pointermove', e => this._onPointer(e));
    canvas.addEventListener('pointerleave', () => { this.tooltip = null; this.render(); });
    canvas.addEventListener('touchmove', e => e.preventDefault(), { passive: false });
  }

  _resize() {
    const rect = this.canvas.parentElement.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    this.canvas.width = rect.width * dpr;
    this.canvas.height = rect.height * dpr;
    this.canvas.style.width = rect.width + 'px';
    this.canvas.style.height = rect.height + 'px';
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    this.w = rect.width;
    this.h = rect.height;
    if (this.data) this.render();
  }

  setData(timestamps, prices, coinId, overlays = {}) {
    this.data = { timestamps, prices };
    this.coinId = coinId;
    this.overlays = overlays;
    this.tooltip = null;
    this.render();
  }

  render() {
    const { ctx, w, h, pad, data } = this;
    if (!data) return;
    const { timestamps, prices } = data;
    const plotW = w - pad.left - pad.right;
    const plotH = h - pad.top - pad.bottom;

    const isDark = document.documentElement.getAttribute('data-theme') === 'dark' ||
      (!document.documentElement.getAttribute('data-theme') && window.matchMedia('(prefers-color-scheme: dark)').matches);

    const gridColor = isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.06)';
    const textColor = isDark ? 'rgba(255,255,255,0.5)' : 'rgba(0,0,0,0.45)';
    const bgColor = isDark ? '#1a1a2e' : '#ffffff';

    ctx.clearRect(0, 0, w, h);

    const minP = Math.min(...prices);
    const maxP = Math.max(...prices);
    const range = maxP - minP || 1;
    const pMin = minP - range * 0.05;
    const pMax = maxP + range * 0.05;
    const pRange = pMax - pMin;

    const x = i => pad.left + (i / (prices.length - 1)) * plotW;
    const y = p => pad.top + (1 - (p - pMin) / pRange) * plotH;

    this._drawGrid(ctx, pad, plotW, plotH, pMin, pMax, pRange, timestamps, gridColor, textColor, x, y);

    const colors = COLORS[this.coinId] || COLORS.bitcoin;
    this._drawArea(ctx, prices, x, y, pad, plotH, colors);
    this._drawLine(ctx, prices, x, y, colors.line, 2.5);

    if (this.showSMA && this.overlays.sma7) {
      this._drawLine(ctx, this.overlays.sma7, x, y, colors.sma7, 1.5, true);
    }
    if (this.showSMA && this.overlays.sma25) {
      this._drawLine(ctx, this.overlays.sma25, x, y, colors.sma25, 1.5, true);
    }

    if (this.tooltip != null) {
      this._drawTooltip(ctx, this.tooltip, prices, timestamps, x, y, colors, isDark);
    }
  }

  _drawGrid(ctx, pad, plotW, plotH, pMin, pMax, pRange, timestamps, gridColor, textColor, xFn, yFn) {
    ctx.strokeStyle = gridColor;
    ctx.lineWidth = 1;
    ctx.font = '11px -apple-system, system-ui, sans-serif';
    ctx.fillStyle = textColor;
    ctx.textAlign = 'right';

    const steps = 5;
    for (let i = 0; i <= steps; i++) {
      const price = pMin + (pRange * i) / steps;
      const yy = yFn(price);
      ctx.beginPath();
      ctx.moveTo(pad.left, yy);
      ctx.lineTo(pad.left + plotW, yy);
      ctx.stroke();
      ctx.fillText(this._fmtPrice(price), pad.left + plotW + 58, yy + 4);
    }

    ctx.textAlign = 'center';
    const labelCount = Math.min(6, timestamps.length);
    const step = Math.floor(timestamps.length / labelCount);
    for (let i = 0; i < timestamps.length; i += step) {
      const xx = xFn(i);
      ctx.fillText(this._fmtDate(timestamps[i]), xx, pad.top + plotH + 20);
    }
  }

  _drawArea(ctx, prices, xFn, yFn, pad, plotH, colors) {
    ctx.beginPath();
    ctx.moveTo(xFn(0), yFn(prices[0]));
    for (let i = 1; i < prices.length; i++) ctx.lineTo(xFn(i), yFn(prices[i]));
    ctx.lineTo(xFn(prices.length - 1), pad.top + plotH);
    ctx.lineTo(xFn(0), pad.top + plotH);
    ctx.closePath();

    const grad = ctx.createLinearGradient(0, pad.top, 0, pad.top + plotH);
    grad.addColorStop(0, colors.fill.replace('0.15', '0.3'));
    grad.addColorStop(1, colors.fill.replace('0.15', '0.0'));
    ctx.fillStyle = grad;
    ctx.fill();
  }

  _drawLine(ctx, data, xFn, yFn, color, width, dashed = false) {
    ctx.beginPath();
    ctx.strokeStyle = color;
    ctx.lineWidth = width;
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';
    if (dashed) ctx.setLineDash([6, 4]);
    else ctx.setLineDash([]);

    let started = false;
    for (let i = 0; i < data.length; i++) {
      if (data[i] == null) continue;
      if (!started) { ctx.moveTo(xFn(i), yFn(data[i])); started = true; }
      else ctx.lineTo(xFn(i), yFn(data[i]));
    }
    ctx.stroke();
    ctx.setLineDash([]);
  }

  _drawTooltip(ctx, idx, prices, timestamps, xFn, yFn, colors, isDark) {
    if (idx < 0 || idx >= prices.length) return;
    const xx = xFn(idx);
    const yy = yFn(prices[idx]);

    ctx.strokeStyle = isDark ? 'rgba(255,255,255,0.2)' : 'rgba(0,0,0,0.1)';
    ctx.lineWidth = 1;
    ctx.setLineDash([4, 4]);
    ctx.beginPath();
    ctx.moveTo(xx, this.pad.top);
    ctx.lineTo(xx, this.pad.top + this.h - this.pad.top - this.pad.bottom);
    ctx.stroke();
    ctx.setLineDash([]);

    ctx.beginPath();
    ctx.arc(xx, yy, 5, 0, Math.PI * 2);
    ctx.fillStyle = colors.line;
    ctx.fill();
    ctx.strokeStyle = isDark ? '#1a1a2e' : '#fff';
    ctx.lineWidth = 2;
    ctx.stroke();

    const text = `${this._fmtPrice(prices[idx])}  ${this._fmtDateTime(timestamps[idx])}`;
    ctx.font = 'bold 12px -apple-system, system-ui, sans-serif';
    const tw = ctx.measureText(text).width + 16;
    let tx = xx - tw / 2;
    if (tx < this.pad.left) tx = this.pad.left;
    if (tx + tw > this.w - this.pad.right) tx = this.w - this.pad.right - tw;
    const ty = this.pad.top - 8;

    ctx.fillStyle = isDark ? 'rgba(30,30,50,0.95)' : 'rgba(255,255,255,0.95)';
    ctx.beginPath();
    ctx.roundRect(tx, ty - 16, tw, 22, 6);
    ctx.fill();
    ctx.strokeStyle = colors.line;
    ctx.lineWidth = 1;
    ctx.stroke();

    ctx.fillStyle = isDark ? '#fff' : '#111';
    ctx.textAlign = 'center';
    ctx.fillText(text, tx + tw / 2, ty - 1);
    ctx.textAlign = 'left';
  }

  _onPointer(e) {
    if (!this.data) return;
    const rect = this.canvas.getBoundingClientRect();
    const mx = e.clientX - rect.left;
    const plotW = this.w - this.pad.left - this.pad.right;
    const ratio = (mx - this.pad.left) / plotW;
    const idx = Math.round(ratio * (this.data.prices.length - 1));
    if (idx >= 0 && idx < this.data.prices.length) {
      this.tooltip = idx;
      this.render();
    }
  }

  _fmtPrice(p) {
    if (p >= 1000) return p.toLocaleString('de-DE', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 });
    if (p >= 1) return p.toLocaleString('de-DE', { style: 'currency', currency: 'EUR', maximumFractionDigits: 2 });
    return p.toLocaleString('de-DE', { style: 'currency', currency: 'EUR', maximumFractionDigits: 4 });
  }

  _fmtDate(ts) {
    const d = new Date(ts);
    return d.toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit' });
  }

  _fmtDateTime(ts) {
    const d = new Date(ts);
    return d.toLocaleString('de-DE', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
  }
}

export class RSIGauge {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.value = null;

    this._resize();
    this._resizeObs = new ResizeObserver(() => this._resize());
    this._resizeObs.observe(canvas.parentElement);
  }

  _resize() {
    const rect = this.canvas.parentElement.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    this.canvas.width = rect.width * dpr;
    this.canvas.height = rect.height * dpr;
    this.canvas.style.width = rect.width + 'px';
    this.canvas.style.height = rect.height + 'px';
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    this.w = rect.width;
    this.h = rect.height;
    if (this.value != null) this.render();
  }

  setValue(val) {
    this.value = val;
    this.render();
  }

  render() {
    const { ctx, w, h, value } = this;
    if (value == null) return;
    ctx.clearRect(0, 0, w, h);

    const isDark = document.documentElement.getAttribute('data-theme') === 'dark' ||
      (!document.documentElement.getAttribute('data-theme') && window.matchMedia('(prefers-color-scheme: dark)').matches);

    const barH = 8;
    const barY = h / 2 - barH / 2;
    const pad = 8;
    const barW = w - pad * 2;

    const grad = ctx.createLinearGradient(pad, 0, pad + barW, 0);
    grad.addColorStop(0, '#00C853');
    grad.addColorStop(0.3, '#4CAF50');
    grad.addColorStop(0.5, '#FFC107');
    grad.addColorStop(0.7, '#FF9800');
    grad.addColorStop(1, '#FF3D00');

    ctx.fillStyle = isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.04)';
    ctx.beginPath();
    ctx.roundRect(pad, barY, barW, barH, barH / 2);
    ctx.fill();

    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.roundRect(pad, barY, barW, barH, barH / 2);
    ctx.fill();

    const x30 = pad + (30 / 100) * barW;
    const x70 = pad + (70 / 100) * barW;
    ctx.strokeStyle = isDark ? 'rgba(255,255,255,0.3)' : 'rgba(0,0,0,0.2)';
    ctx.lineWidth = 1;
    for (const xx of [x30, x70]) {
      ctx.beginPath();
      ctx.moveTo(xx, barY - 2);
      ctx.lineTo(xx, barY + barH + 2);
      ctx.stroke();
    }

    const markerX = pad + (value / 100) * barW;
    ctx.beginPath();
    ctx.arc(markerX, barY + barH / 2, 7, 0, Math.PI * 2);
    ctx.fillStyle = isDark ? '#1a1a2e' : '#fff';
    ctx.fill();
    ctx.strokeStyle = value > 70 ? '#FF3D00' : value < 30 ? '#00C853' : '#FFC107';
    ctx.lineWidth = 2.5;
    ctx.stroke();

    ctx.font = 'bold 11px -apple-system, system-ui, sans-serif';
    ctx.fillStyle = isDark ? '#fff' : '#111';
    ctx.textAlign = 'center';
    ctx.fillText(value.toFixed(0), markerX, barY - 8);

    ctx.font = '10px -apple-system, system-ui, sans-serif';
    ctx.fillStyle = isDark ? 'rgba(255,255,255,0.4)' : 'rgba(0,0,0,0.35)';
    ctx.textAlign = 'left';
    ctx.fillText('Überverkauft', pad, barY + barH + 16);
    ctx.textAlign = 'right';
    ctx.fillText('Überkauft', pad + barW, barY + barH + 16);
  }
}
