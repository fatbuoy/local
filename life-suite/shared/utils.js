/**
 * SAHANI SUITE — utils.js  v1.0
 * ─────────────────────────────────────────────────────────────────────
 * Shared utilities loaded by every app via:
 *   <script src="../shared/utils.js"></script>
 *
 * Provides:
 *   Data:     fetchData(path) → Promise<any>
 *   Format:   fmt(n), fmtK(n), fmtPct(n), pn(val, display?)
 *   Tooltip:  showTT(e, title, rows), moveTT(e), hideTT()
 *   Privacy:  togglePrivacy(password), showPasswordModal()
 *   Period:   renderPeriodStrip(containerId, periods, selected, onSelect)
 *   Charts:   drawTrendChart(canvas, series, labels, colors)
 *             drawHeroSparkline(canvas, current, prior, budget)
 * ─────────────────────────────────────────────────────────────────────
 */

'use strict';

/* ─── DATA LOADING ──────────────────────────────────────────────────── */

/**
 * Fetch and parse a JSON data file.
 * Shows a friendly in-page error if the fetch fails (e.g. no web server).
 * @param {string} path  Relative path to the JSON file, e.g. './data.json'
 * @param {string} [errorContainerId='app']  ID of the element to show errors in
 * @returns {Promise<object|null>}
 */
async function fetchData(path, errorContainerId = 'app') {
  try {
    const res = await fetch(path);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.json();
  } catch (e) {
    const el = document.getElementById(errorContainerId);
    if (el) {
      el.innerHTML = `
        <div style="margin:40px auto;max-width:500px;background:#fff;border:1px solid #e0ddd7;border-radius:13px;padding:24px">
          <div style="font-size:15px;font-weight:600;color:#0c2340;margin-bottom:8px">⚠️ Cannot load ${path}</div>
          <div style="font-size:12px;color:#666;line-height:1.7">
            This app reads its data from a local JSON file and requires a web server.<br><br>
            <strong>Start one in the project root:</strong><br>
            <code style="background:#f5f4f0;padding:4px 8px;border-radius:6px;display:inline-block;margin:4px 0">python3 -m http.server 8080</code><br>
            Then open <a href="http://localhost:8080" style="color:#185fa5">http://localhost:8080</a>
          </div>
        </div>`;
    }
    console.error('fetchData failed:', e);
    return null;
  }
}


/* ─── NUMBER FORMATTING ─────────────────────────────────────────────── */

/**
 * Format a number with thousands separator, rounded to integer.
 * Uses Swiss-style formatting (apostrophe thousands separator).
 * Override locale as needed per project.
 */
function fmt(n) {
  return Math.round(n).toLocaleString('de-CH');
}

/** Format as compact e.g. 1200 → "1.2k", 450 → "450" */
function fmtK(n) {
  if (Math.abs(n) >= 1000) return (n / 1000).toFixed(1) + 'k';
  return String(Math.round(n));
}

/** Format as percentage string e.g. 0.72 → "72%" */
function fmtPct(ratio) {
  return Math.round(ratio * 100) + '%';
}

/**
 * Wrap a formatted number in a privacy-masked span.
 * Use whenever rendering a number that should blur in privacy mode.
 * @param {number}  val        The raw number (used for fallback display)
 * @param {string}  [display]  Pre-formatted string to display (optional)
 * @returns {string} HTML string
 */
function pn(val, display) {
  const shown = display !== undefined ? display : fmt(val);
  return `<span class="num-private">${shown}</span>`;
}

/** Simple sum helper */
function sumBy(arr, fn) {
  return arr.reduce((s, r) => { const v = fn ? fn(r) : r; return s + (isFinite(v) ? v : 0); }, 0);
}


/* ─── TOOLTIP ───────────────────────────────────────────────────────── */

let _tt = null;
function _ensureTT() {
  if (!_tt) _tt = document.getElementById('chartTooltip');
  return _tt;
}

/**
 * Show the shared chart tooltip.
 * Suppressed automatically in privacy mode.
 * @param {MouseEvent|TouchEvent} e
 * @param {string} title
 * @param {Array<{label:string, val:number, color?:string}>} rows
 */
function showTT(e, title, rows) {
  if (document.body.classList.contains('privacy')) return;
  const tt = _ensureTT();
  if (!tt) return;
  tt.innerHTML =
    `<div class="tt-title">${title}</div>` +
    rows.map(r =>
      `<div class="tt-row">
        ${r.color ? `<div class="tt-dot" style="background:${r.color}"></div>` : ''}
        <span class="tt-label">${r.label}</span>
        <span class="tt-val">${r.prefix || ''}${fmt(r.val)}${r.suffix || ''}</span>
      </div>`
    ).join('');
  tt.classList.add('visible');
  moveTT(e);
}

function moveTT(e) {
  const tt = _ensureTT();
  if (!tt) return;
  const x = e.clientX, y = e.clientY;
  const w = tt.offsetWidth || 160, h = tt.offsetHeight || 60;
  tt.style.left = (x + 14 + w > window.innerWidth  ? x - w - 10 : x + 14) + 'px';
  tt.style.top  = (y - 10 + h > window.innerHeight ? y - h - 10 : y - 10) + 'px';
}

function hideTT() {
  const tt = _ensureTT();
  if (tt) tt.classList.remove('visible');
}

// Dismiss tooltip on mobile tap outside any canvas
document.addEventListener('touchstart', e => {
  if (!e.target.closest('canvas')) hideTT();
}, { passive: true });


/* ─── PRIVACY MODE ──────────────────────────────────────────────────── */

let _privacyPassword = null;

/**
 * Call once during app init to set the privacy unlock password.
 * @param {string} password
 */
function setPrivacyPassword(password) {
  _privacyPassword = password;
}

/** Toggle privacy mode. Turning off requires password if one is set. */
function togglePrivacy() {
  if (!document.body.classList.contains('privacy')) {
    // Turn ON — no password needed
    document.body.classList.add('privacy');
    const btn = document.getElementById('privacyBtn');
    if (btn) btn.textContent = '🙈';
    // Re-render sections that use innerHTML so .num-private nodes exist
    if (typeof onPrivacyChange === 'function') onPrivacyChange(true);
  } else {
    // Turn OFF — password gate
    if (_privacyPassword) {
      showPasswordModal();
    } else {
      _applyPrivacyOff();
    }
  }
}

function _applyPrivacyOff() {
  document.body.classList.remove('privacy');
  const btn = document.getElementById('privacyBtn');
  if (btn) btn.textContent = '👁';
  if (typeof onPrivacyChange === 'function') onPrivacyChange(false);
}

function showPasswordModal() {
  const overlay = document.createElement('div');
  overlay.className = 'pw-overlay';
  overlay.id = 'pwOverlay';
  overlay.innerHTML = `
    <div class="pw-modal">
      <div class="pw-title">🔒 Privacy lock</div>
      <div class="pw-sub">Enter the password to reveal your data</div>
      <input class="pw-input" id="pwInput" type="password" placeholder="Password" autocomplete="off">
      <div class="pw-error" id="pwError"></div>
      <div class="pw-actions">
        <button class="pw-btn pw-btn-cancel" onclick="closePasswordModal()">Cancel</button>
        <button class="pw-btn pw-btn-confirm" onclick="submitPassword()">Unlock</button>
      </div>
    </div>`;
  document.body.appendChild(overlay);
  requestAnimationFrame(() => {
    const inp = document.getElementById('pwInput');
    if (inp) {
      inp.focus();
      inp.addEventListener('keydown', e => {
        if (e.key === 'Enter') submitPassword();
        if (e.key === 'Escape') closePasswordModal();
      });
    }
  });
}

function closePasswordModal() {
  const el = document.getElementById('pwOverlay');
  if (el) el.remove();
}

function submitPassword() {
  const input = document.getElementById('pwInput');
  if (!input) return;
  if (input.value === _privacyPassword) {
    closePasswordModal();
    _applyPrivacyOff();
  } else {
    const err = document.getElementById('pwError');
    if (err) err.textContent = 'Incorrect password — try again';
    input.value = '';
    input.classList.remove('shake');
    void input.offsetWidth;
    input.classList.add('shake');
    input.focus();
  }
}


/* ─── PERIOD STRIP ──────────────────────────────────────────────────── */

/**
 * Render a row of period selector pills.
 * @param {string}   containerId  ID of the container div
 * @param {Array}    periods      Array of values (numbers or strings)
 * @param {*}        selected     Currently selected value
 * @param {Function} onSelect     Callback(selectedValue)
 * @param {Object}   [opts]
 * @param {boolean}  [opts.reverse]  Render newest first
 */
function renderPeriodStrip(containerId, periods, selected, onSelect, opts = {}) {
  const el = document.getElementById(containerId);
  if (!el) return;
  const list = opts.reverse ? [...periods].reverse() : periods;
  el.innerHTML = list.map(p =>
    `<button class="period-btn${p === selected ? ' active' : ''}"
      onclick="(${onSelect.toString()})(${JSON.stringify(p)})">${p}</button>`
  ).join('');
}


/* ─── CHART: MULTI-LINE TREND ───────────────────────────────────────── */

/**
 * Draw a multi-series line chart on a canvas element.
 * Attaches mousemove tooltip handler automatically.
 * @param {HTMLCanvasElement} canvas
 * @param {Array<{name:string, data:number[]}>} series
 * @param {string[]} labels    X-axis labels (years, months, etc.)
 * @param {string[]} colors    One colour per series
 * @param {object}  [opts]
 * @param {string}  [opts.prefix]   Tooltip value prefix e.g. 'CHF '
 * @param {string}  [opts.suffix]   Tooltip value suffix e.g. ' kcal'
 */
function drawTrendChart(canvas, series, labels, colors, opts = {}) {
  const DPR = window.devicePixelRatio || 1;
  const W = canvas.clientWidth || 600;
  const H = 160;
  canvas.width = W * DPR; canvas.height = H * DPR;
  canvas.style.width = W + 'px'; canvas.style.height = H + 'px';
  const ctx = canvas.getContext('2d');
  ctx.scale(DPR, DPR);
  ctx.clearRect(0, 0, W, H);

  const PAD = { t: 12, r: 10, b: 28, l: 44 };
  const cW = W - PAD.l - PAD.r, cH = H - PAD.t - PAD.b;

  const allVals = series.flatMap(s => s.data).filter(v => isFinite(v) && v > 0);
  if (!allVals.length) return;
  const mx = Math.max(...allVals) * 1.1;

  // Grid lines + Y labels
  ctx.strokeStyle = '#e8e6e0'; ctx.lineWidth = 0.5;
  for (let i = 0; i <= 4; i++) {
    const y = PAD.t + cH - (i / 4) * cH;
    ctx.beginPath(); ctx.moveTo(PAD.l, y); ctx.lineTo(PAD.l + cW, y); ctx.stroke();
    ctx.fillStyle = '#999'; ctx.font = '9px Inter,sans-serif'; ctx.textAlign = 'right';
    ctx.fillText(fmtK((i / 4) * mx), PAD.l - 4, y + 3);
  }

  // X labels
  ctx.fillStyle = '#999'; ctx.font = '8px Inter,sans-serif'; ctx.textAlign = 'center';
  labels.forEach((lbl, i) => {
    ctx.fillText(lbl, PAD.l + (i / (labels.length - 1 || 1)) * cW, H - 6);
  });

  // Build pts
  const allPts = series.map((s, si) =>
    s.data.map((v, i) => ({
      x: PAD.l + (i / (labels.length - 1 || 1)) * cW,
      y: PAD.t + cH - ((v || 0) / mx) * cH,
      v, label: labels[i], series: s.name, color: colors[si]
    }))
  );

  // Draw lines + dots
  series.forEach((s, si) => {
    const pts = allPts[si];
    ctx.beginPath(); ctx.moveTo(pts[0].x, pts[0].y);
    for (let i = 1; i < pts.length; i++) {
      const p = pts[i-1], q = pts[i];
      ctx.bezierCurveTo((p.x+q.x)/2, p.y, (p.x+q.x)/2, q.y, q.x, q.y);
    }
    ctx.strokeStyle = colors[si]; ctx.lineWidth = 1.8; ctx.setLineDash([]); ctx.stroke();
    pts.forEach(pt => {
      ctx.beginPath(); ctx.arc(pt.x, pt.y, 2, 0, Math.PI * 2);
      ctx.fillStyle = colors[si]; ctx.fill();
    });
  });

  canvas._trendPts = allPts;
  canvas._trendLabels = labels;

  canvas.onmousemove = e => {
    if (!canvas._trendPts) return;
    const rect = canvas.getBoundingClientRect();
    const mx = (e.clientX - rect.left) * (canvas.width / rect.width / DPR);
    let nearestI = 0, nearestD = Infinity;
    canvas._trendPts[0].forEach((pt, i) => {
      const d = Math.abs(pt.x - mx);
      if (d < nearestD) { nearestD = d; nearestI = i; }
    });
    if (nearestD > cW / labels.length) { hideTT(); return; }
    const lbl = canvas._trendLabels[nearestI];
    const rows = canvas._trendPts
      .map(s => s[nearestI])
      .filter(pt => pt && pt.v > 0)
      .map(pt => ({ label: pt.series, val: pt.v, color: pt.color, prefix: opts.prefix, suffix: opts.suffix }))
      .sort((a, b) => b.val - a.val);
    if (rows.length) showTT(e, String(lbl), rows);
  };
  canvas.onmouseleave = hideTT;
}


/* ─── CHART: HERO SPARKLINE ─────────────────────────────────────────── */

/**
 * Draw the hero area chart with current year, prior year, and budget overlays.
 * @param {HTMLCanvasElement} canvas
 * @param {number[]} current   Monthly actuals for selected year (12 values)
 * @param {number[]} prior     Monthly actuals for prior year
 * @param {number[]} budget    Monthly budget for selected year
 * @param {object}  [opts]
 * @param {string}  [opts.currentColor]  Defaults to app-accent via CSS var
 * @param {string}  [opts.priorColor]    Defaults to amber
 * @param {string}  [opts.budgetColor]   Defaults to slate
 * @param {string[]} [opts.labels]       X-axis labels (default: month names)
 * @param {string}  [opts.prefix]        Tooltip prefix
 */
function drawHeroSparkline(canvas, current, prior, budget, opts = {}) {
  const DPR = window.devicePixelRatio || 1;
  const W = canvas.clientWidth || 600;
  const H = 80;
  canvas.width = W * DPR; canvas.height = H * DPR;
  canvas.style.width = W + 'px'; canvas.style.height = H + 'px';
  const ctx = canvas.getContext('2d');
  ctx.scale(DPR, DPR);
  ctx.clearRect(0, 0, W, H);

  const labels = opts.labels || ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  const curColor = opts.currentColor || '#185fa5';
  const priColor = opts.priorColor   || '#ef9f27';
  const budColor = opts.budgetColor  || '#5a6a7a';

  const all = [...current, ...prior, ...budget].filter(v => v > 0);
  if (!all.length) return;
  const mx = Math.max(...all) * 1.08;

  const PAD = { l: 2, r: 2, t: 6, b: 18 };
  const cW = W - PAD.l - PAD.r, cH = H - PAD.t - PAD.b;
  const n = labels.length;

  const toX = i => PAD.l + (i / (n - 1)) * cW;
  const toY = v => PAD.t + cH - ((v || 0) / mx) * cH;
  const makePts = arr => arr.map((v, i) => ({ x: toX(i), y: toY(v > 0 ? v : 0) }));

  // X labels
  ctx.fillStyle = '#aaa'; ctx.font = '8px Inter,sans-serif'; ctx.textAlign = 'center';
  labels.forEach((m, i) => ctx.fillText(m, toX(i), H - 3));

  // ── Prior year area (amber)
  _drawArea(ctx, makePts(prior), priColor + '30', priColor + '88', 1.2);

  // ── Current year area (accent)
  _drawArea(ctx, makePts(current), curColor + '22', curColor, 2);

  // ── Budget dashed line
  const bPts = makePts(budget);
  ctx.beginPath(); ctx.moveTo(bPts[0].x, bPts[0].y);
  bPts.forEach(p => ctx.lineTo(p.x, p.y));
  ctx.setLineDash([5, 4]); ctx.strokeStyle = budColor; ctx.lineWidth = 1.5;
  ctx.stroke(); ctx.setLineDash([]);

  // Store for tooltip
  canvas._sparkData = { current, prior, budget, labels };

  canvas.onmousemove = e => {
    if (!canvas._sparkData) return;
    const rect = canvas.getBoundingClientRect();
    const mx = (e.clientX - rect.left) / rect.width * n;
    const idx = Math.max(0, Math.min(n - 1, Math.round(mx)));
    const { current: c, prior: p, budget: b, labels: ls } = canvas._sparkData;
    const rows = [];
    const pre = opts.prefix || '';
    if (c[idx] > 0) rows.push({ label: `${ls[idx]} Actuals`, val: c[idx], color: curColor, prefix: pre });
    if (p[idx] > 0) rows.push({ label: `${ls[idx]} Prior yr`, val: p[idx], color: priColor, prefix: pre });
    if (b[idx] > 0) rows.push({ label: `${ls[idx]} Budget`,  val: b[idx], color: budColor, prefix: pre });
    if (rows.length) showTT(e, ls[idx], rows);
  };
  canvas.onmouseleave = hideTT;
}

function _drawArea(ctx, pts, fillColor, strokeColor, lineWidth) {
  if (!pts.length) return;
  ctx.beginPath(); ctx.moveTo(pts[0].x, pts[0].y);
  for (let i = 1; i < pts.length; i++) {
    const p = pts[i-1], q = pts[i];
    ctx.bezierCurveTo((p.x+q.x)/2, p.y, (p.x+q.x)/2, q.y, q.x, q.y);
  }
  const last = pts[pts.length - 1], first = pts[0];
  ctx.lineTo(last.x, last.y + 60); ctx.lineTo(first.x, first.y + 60);
  ctx.closePath();
  ctx.fillStyle = fillColor; ctx.fill();

  ctx.beginPath(); ctx.moveTo(pts[0].x, pts[0].y);
  for (let i = 1; i < pts.length; i++) {
    const p = pts[i-1], q = pts[i];
    ctx.bezierCurveTo((p.x+q.x)/2, p.y, (p.x+q.x)/2, q.y, q.x, q.y);
  }
  ctx.strokeStyle = strokeColor; ctx.lineWidth = lineWidth; ctx.setLineDash([]); ctx.stroke();
}


/* ─── RESIZE HANDLER HELPER ─────────────────────────────────────────── */

/**
 * Re-draw all registered canvases on window resize.
 * Apps call registerChartRedraw(fn) for each chart that needs redrawing.
 */
const _redrawFns = [];
function registerChartRedraw(fn) { _redrawFns.push(fn); }
let _resizeTimer;
window.addEventListener('resize', () => {
  clearTimeout(_resizeTimer);
  _resizeTimer = setTimeout(() => _redrawFns.forEach(fn => fn()), 150);
});
