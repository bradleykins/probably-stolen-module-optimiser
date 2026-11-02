// Page helpers shared by index.html (one machine) and plan.html (all machines).
// Needs solver.js loaded first (startSolver sends solverModule to a Web Worker).

const STATS = ['Performance', 'Efficiency', 'Quality'];
const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const color = i => `hsl(${(i * 67) % 360} 60% 58%)`;
const fmt = v => (v > 0 ? '+' : '') + v;
const cellsOf = rows => rows.flatMap((row, r) => [...row].flatMap((ch, c) => (ch === '#' ? [[r, c]] : [])));
const gridOf = layout => ({ rows: layout.length, cols: layout[0].length, usable: layout.join('').split('').map(ch => ch === '.') });

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
  return { mins: p.mins.slice(), priority: [0, 1, 2].map(r => order[r] ?? null) };
}

// Bay grid with each placed item outlined and numbered. modules[id] gives name/node for a placement id.
function boardHtml(layout, placements, modules, cellSize = 30) {
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
    html += `<div class="part${origin ? ' origin' : ''}" style="background:${color(here.n + 1)};${borders}" title="${esc(m.name)} · Component ${here.n + 1} · Cell ${here.part + 1}${origin ? ' · placement origin' : ''}">${label}</div>`;
  }
  return html + '</div>';
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
