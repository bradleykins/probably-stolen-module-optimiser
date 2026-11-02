// Page helpers shared by index.html (one machine) and plan.html (all machines).
// Needs solver.js loaded first (startSolver sends solverModule to a Web Worker).

const STATS = ['Performance', 'Efficiency', 'Quality'];
const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const color = i => `hsl(${(i * 67) % 360} 60% 58%)`;
const fmt = v => (v > 0 ? '+' : '') + v;
const cellsOf = rows => rows.flatMap((row, r) => [...row].flatMap((ch, c) => (ch === '#' ? [[r, c]] : [])));
const gridOf = layout => ({ rows: layout.length, cols: layout[0].length, usable: layout.join('').split('').map(ch => ch === '.') });

// Shape name for a module's cells, in any rotation or mirror: the game's variant names, else a size.
// Needs game-data.js and solver.js; without them it just gives the cell count.
function shapeName(cells) {
  const fallback = `${cells.length} cell${cells.length === 1 ? '' : 's'}`;
  if (typeof GAME === 'undefined' || typeof solverModule === 'undefined') return fallback;
  const { orientations } = solverModule();
  const keys = new Set(orientations(cells, true, true).map(o => JSON.stringify(o)));
  const named = [...GAME.variants.basic, ...GAME.variants.advanced].map(v => [v.name.replace(/ \(.*\)$/, ''), cellsOf(v.shape)]);
  for (const [name, shape] of named) if (keys.has(JSON.stringify(orientations(shape, false, false)[0]))) return `${name} shape`;
  const rows = new Set(cells.map(c => c[0])).size, cols = new Set(cells.map(c => c[1])).size;
  return rows * cols === cells.length ? `${Math.max(rows, cols)}×${Math.min(rows, cols)} bar` : fallback;
}

// "T shape · P+19" style summary to find a module in the game: its shape and its non-zero base stats.
function moduleDetails(m) {
  const stats = m.node ? 'node (no own stats)' : m.base.map((v, k) => (v ? `${'PEQ'[k]}${fmt(v)}` : '')).filter(Boolean).join(' ') || 'no stats';
  return `${shapeName(m.cells)} · ${stats}`;
}

// Stat colours, the same everywhere (style.css): Performance red, Efficiency green, Quality yellow.
const STAT_COLORS = ['var(--perf)', 'var(--eff)', 'var(--qual)'];
const statSpan = (k, text = STATS[k]) => `<span class="st${k}">${text}</span>`;
// A module's colours: its strongest positive stat, plus a second one if that is at least a third as big.
// Nodes are blue; modules with no positive stat (e.g. Blast) grey.
function moduleColors(m) {
  if (m && m.node) return ['var(--node)'];
  const pos = (m?.base || []).map((v, k) => [v, k]).filter(([v]) => v > 0).sort((a, b) => b[0] - a[0]);
  if (!pos.length) return ['var(--nostat)'];
  return pos.filter(([v], i) => i === 0 || (i === 1 && v >= pos[0][0] / 3)).map(([, k]) => STAT_COLORS[k]);
}
function moduleColor(m) {
  const c = moduleColors(m);
  return c.length > 1 ? `linear-gradient(135deg, ${c[0]} 55%, ${c[1]} 55%)` : c[0];
}
const statsHtml = base => base.map((v, k) => (v ? statSpan(k, `${'PEQ'[k]}${fmt(v)}`) : '')).filter(Boolean).join(' ') || 'no stats';
const moduleDetailsHtml = m => `${esc(shapeName(m.cells))} · ${m.node ? 'node (no own stats)' : statsHtml(m.base)}`;
const totalsHtml = totals => STATS.map((s, k) => statSpan(k, `${s} ${fmt(totals[k])}%`)).join(' · ');
const legendHtml = () => `<div class="legend">${STATS.map((s, k) => `<span><span class="swatch" style="background:${STAT_COLORS[k]}"></span>${s}</span>`).join('')}<span><span class="swatch" style="background:var(--node)"></span>Node</span><span><span class="swatch" style="background:var(--nostat)"></span>No bonus</span></div>`;

// Install checklist: one row per placed item, ticked once it is in the machine (ticked rows grey out).
// attrs: data attributes for the checkboxes; sources[n]: where item n comes from.
function checklistHtml(placements, modules, done, attrs, sources = [], disabled = false) {
  const rows = placements.map((p, n) => {
    const m = modules[p.id] || { name: '?', cells: p.cells, base: [0, 0, 0] };
    const details = m.base || m.node ? moduleDetailsHtml({ cells: p.cells, ...m }) : esc(m.details || '');
    return `<div class="component-row${done[n] ? ' done' : ''}" style="--component-color:${moduleColors(m)[0]}">
      <label><input type="checkbox" ${attrs} data-component="${n}" ${done[n] ? 'checked' : ''} ${disabled ? 'disabled' : ''}>
      <span class="swatch" style="background:${moduleColor(m)}"></span><span class="component-name"><b>${m.node ? 'N' : ''}${n + 1}.</b> ${esc(m.name)}</span></label>
      <span class="muted">${details}${sources[n] ? `<br>${esc(sources[n])}` : ''}</span></div>`;
  }).join('');
  const count = done.filter(Boolean).length;
  return `<div class="layout-actions"><b>Install checklist</b><span class="progress">${count}/${placements.length} installed</span></div><div class="component-list">${rows}</div>`;
}

// Which planned items are ticked as installed. Kept under its own key so the planner and the overlay
// can both tick without overwriting each other's saved state. Reset by a new plan (different `at`).
const INSTALLED_KEY = 'ps-plan-installed';
function installedOf(at) {
  try { const x = JSON.parse(localStorage.getItem(INSTALLED_KEY)); return x && x.at === at ? x.done : {}; } catch { return {}; }
}
function setInstalled(at, name, n, on) {
  const done = installedOf(at);
  (done[name] = done[name] || [])[n] = on;
  try { localStorage.setItem(INSTALLED_KEY, JSON.stringify({ at, done })); } catch {}
}

// Priority order [statIndex|null x3] as weights: each rank counts 1000x the next, so a higher-priority
// stat always wins (stat totals stay well under 1000).
function priorityWeights(priority) {
  const w = [0, 0, 0];
  priority.forEach((k, r) => { if (k !== null && w[k] === 0) w[k] = 1000 ** (2 - r); });
  return w;
}

// A machine preset as {mins, priority}.
function presetTarget(p) {
  const order = [0, 1, 2].filter(k => p.weights[k] > 0).sort((a, b) => p.weights[b] - p.weights[a]);
  const t = { mins: p.mins.slice(), priority: [0, 1, 2].map(r => order[r] ?? null) };
  if (p.blast !== undefined) t.blast = p.blast; // Furnace presets also say whether the Blast module is used
  return t;
}

// The module a machine option requires (e.g. the Furnace's Blast): the first owned, accepted one, or null.
// modules: list of {name, count}; returns its index.
function requiredModule(machineDef, on, modules) {
  if (!on || !machineDef.option) return null;
  const i = modules.findIndex(m => m.count > 0 && m.name.startsWith(machineDef.option.module));
  return i < 0 ? null : i;
}

// Bay grid with each placed item outlined and numbered. modules[id] gives name/node for a placement id.
function boardHtml(layout, placements, modules, cellSize = 30, done = []) {
  const cols = layout[0].length, rows = layout.length;
  const owner = {};
  placements.forEach((p, n) => p.cells.forEach((cell, part) => owner[cell] = { n, part, id: p.id }));
  const getOwner = (r, c) => r < 0 || c < 0 || r >= rows || c >= cols ? null : owner[r * cols + c];
  const edge = cellSize < 24 ? 2 : 3;
  let html = `<div class="grid board" style="--cs:${cellSize}px;grid-template-columns:repeat(${cols},${cellSize}px)">`;
  for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
    const cell = r * cols + c, here = owner[cell];
    if (layout[r][c] === '#') { html += '<div class="x"></div>'; continue; }
    if (!here) { html += '<div></div>'; continue; }
    const m = modules[here.id], p = placements[here.n];
    const sides = [[-1,0,'top'],[0,1,'right'],[1,0,'bottom'],[0,-1,'left']];
    const borders = sides.map(([dr,dc,side]) => {
      const other = getOwner(r + dr, c + dc);
      return `border-${side}:${other && other.n === here.n ? '0' : `${edge}px solid rgba(255,255,255,.95)`}`;
    }).join(';');
    const origin = p.cells[0] === cell;
    const label = m.node ? `N${here.n + 1}` : `${here.n + 1}`;
    html += `<div class="part${origin ? ' origin' : ''}${done[here.n] ? ' done' : ''}" style="background:${moduleColor(m)};${borders}" title="${esc(m.name)} · Component ${here.n + 1} · Cell ${here.part + 1}${origin ? ' · placement origin' : ''}">${label}</div>`;
  }
  return html + '</div>';
}

// The overlay window. Chrome/Edge: a Document Picture-in-Picture window, which the browser keeps on top
// of every other window (the game too, in windowed or borderless mode). It closes with this tab.
// Elsewhere: a plain popup, which only stays on top with overlay.ahk.
async function showOverlay() {
  const url = new URL('overlay.html', location.href).href;
  if (!window.documentPictureInPicture) { window.open(url, 'LayoutOverlay', 'popup,width=460,height=820'); return; }
  const pip = await documentPictureInPicture.requestWindow({ width: 460, height: 820 });
  pip.document.title = 'Layout Overlay';
  pip.document.body.style.margin = '0';
  pip.document.body.innerHTML = `<iframe src="${url}" style="border:0;width:100vw;height:100vh;display:block"></iframe>`;
}

// Runs the solver in a Web Worker so the page stays responsive; falls back to running it here.
function startSolver(job, onImprove, onDone) {
  const inPage = () => setTimeout(() => onDone(solverModule().solve(job.grid, job.types, job.opts)), 20);
  try {
    const src = `const S = (${solverModule})();
      onmessage = e => postMessage({ done: S.solve(e.data.grid, e.data.types, { ...e.data.opts, onImprove: x => postMessage({ improve: x }) }) });`;
    const wk = new Worker(URL.createObjectURL(new Blob([src], { type: 'text/javascript' })));
    wk.onmessage = e => { if (e.data.done) { wk.terminate(); onDone(e.data.done); } else onImprove(e.data.improve); };
    wk.onerror = () => { wk.terminate(); inPage(); };
    wk.postMessage(job);
    return wk;
  } catch {
    inPage();
    return null;
  }
}
