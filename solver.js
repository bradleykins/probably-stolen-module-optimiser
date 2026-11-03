// Packs modules into a machine's module bay. Maximises a weighted stat total, optionally
// subject to minimum totals (e.g. Quality >= 200). Exact branch and bound.
//
// Stat rules mirror the game's ModuleEffectHelper, including its integer maths (truncate toward zero):
// - module:   base stats (already scaled by shape variant and Premium/Inferior/etc.)
// - receiver: + trunc(base * 10 * adjacentNodes / 100)
// - top/side mount: + trunc(base * 20 / 100) if a cell is in the bay's top row / left column
// - negative feedback: + trunc(sum of adjacent items' negative base stats / 4)
// - node:     no own stats; trunc(sum of adjacent modules' base stats / 5)
// Stats are arrays [Performance, Efficiency, Quality]. Adjacent = shares an edge, each item counted once.
// Wrapped in one function so the page can also run it inside a Web Worker (see index.html).
function solverModule() {
  const NODE_DIVISOR = 5, RECEIVER_PCT = 10, MOUNT_PCT = 20, FEEDBACK_DIVISOR = 4;
  const trunc = Math.trunc;
  const K3 = [0, 1, 2];
  const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];

  // Normalise a shape: sort row-major, then make cells relative to the first cell.
  // The search always places a shape's first cell on the first free grid cell.
  function norm(cells) {
    const minR = Math.min(...cells.map(p => p[0]));
    const minC = Math.min(...cells.map(p => p[1]));
    const n = cells.map(([r, c]) => [r - minR, c - minC]).sort((a, b) => a[0] - b[0] || a[1] - b[1]);
    return n.map(([r, c]) => [r - n[0][0], c - n[0][1]]);
  }

  function orientations(cells, rotate, flip) {
    const out = [], seen = new Set();
    for (let f = 0; f < (flip ? 2 : 1); f++) {
      let s = f ? cells.map(([r, c]) => [r, -c]) : cells;
      for (let k = 0; k < (rotate ? 4 : 1); k++) {
        const n = norm(s), key = JSON.stringify(n);
        if (!seen.has(key)) { seen.add(key); out.push(n); }
        s = s.map(([r, c]) => [c, -r]);
      }
    }
    return out;
  }

  function neighbours(grid, i) {
    const { rows, cols } = grid, r = Math.floor(i / cols), c = i % cols, out = [];
    if (r > 0) out.push(i - cols);
    if (r < rows - 1) out.push(i + cols);
    if (c > 0) out.push(i - 1);
    if (c < cols - 1) out.push(i + 1);
    return out;
  }

  // Stats of one placed item. s = {sum, neg, nodes, top, left}: what touches it and where it sits.
  function itemStats(t, s) {
    if (t.node) return s.sum.map(v => trunc(v / NODE_DIVISOR));
    return t.base.map((b, k) => b
      + (t.receiver ? trunc(b * RECEIVER_PCT * s.nodes / 100) : 0)
      + (t.top && s.top ? trunc(b * MOUNT_PCT / 100) : 0)
      + (t.side && s.left ? trunc(b * MOUNT_PCT / 100) : 0)
      + (t.feedback ? trunc(s.neg[k] / FEEDBACK_DIVISOR) : 0));
  }

  const situation = (grid, cells) => ({
    sum: [0, 0, 0], neg: [0, 0, 0], nodes: 0,
    top: cells.some(i => i < grid.cols), left: cells.some(i => i % grid.cols === 0),
  });

  // Adds the effect of touching item u to situation s.
  function touch(s, u) {
    if (u.node) { s.nodes++; return; }
    for (const k of K3) { s.sum[k] += u.base[k]; s.neg[k] += Math.min(0, u.base[k]); }
  }

  // Final stats of a finished layout, computed from scratch. byId[id] = type.
  function evaluate(grid, placements, byId) {
    const own = new Map();
    placements.forEach((p, k) => p.cells.forEach(c => own.set(c, k)));
    const items = placements.map((p, k) => {
      const near = new Set();
      for (const c of p.cells) for (const j of neighbours(grid, c)) {
        const q = own.get(j);
        if (q !== undefined && q !== k) near.add(q);
      }
      const s = situation(grid, p.cells);
      for (const q of near) touch(s, byId[placements[q].id]);
      return itemStats(byId[p.id], s);
    });
    const totals = [0, 0, 0];
    for (const st of items) for (const k of K3) totals[k] += st[k];
    return { totals, items };
  }

  // grid: {rows, cols, usable: bool[]}
  // types: [{id, cells, count, base: [p, e, q], node?, receiver?, top?, side?, feedback?, cost?}]
  // opts: {weights: [p, e, q] (>= 0), mins: [p|null, e|null, q|null], rotate, flip, timeLimitMs}
  //   fixed: [{id, cells}] items already in place (they count, and the search fills around them)
  //   require: [id] a module type the layout must include (e.g. the Furnace's Blast module)
  // Score = weights . totals - sum of cost of placed items. cost > 0 keeps valuable modules free; cost < 0 is a
  // bonus for placing the module (e.g. the stats a Learning Algorithm module will still grow).
  // Returns {found, score, totals, placements: [{id, cells}], optimal, steps}
  function solve(grid, types, opts = {}) {
    if (opts.require?.length) return solveRequired(grid, types, opts);
    const { rows, cols } = grid, N = rows * cols;
    const w = opts.weights || [1, 1, 1];
    const mins = opts.mins || [null, null, null];
    const cons = K3.filter(k => mins[k] !== null && mins[k] !== undefined);
    const goals = [w, ...cons.map(k => K3.map(i => +(i === k)))]; // weight vectors that need a bound
    // Lagrangian bounds: for any lambda >= 0, gain in w <= bound(w + lambda*e_k) - lambda*(Quality still needed).
    // Charging for the stat still needed stops the bound spending the same free cells twice.
    const scale = Math.max(...w) || 1, lagr = [];
    for (const k of cons) for (const f of [0.125, 0.25, 0.5, 1, 2, 4]) {
      lagr.push({ k, lambda: f * scale, gi: goals.length });
      goals.push(K3.map(i => w[i] + (i === k ? f * scale : 0)));
    }
    const nbrs = Array.from({ length: N }, (_, i) => neighbours(grid, i));

    const all = types.filter(t => t.count > 0 && t.cells.length).map(t => {
      const base = t.node ? [0, 0, 0] : t.base;
      const mount = b => Math.max(0, trunc(b * MOUNT_PCT / 100));
      return {
        ...t, base, size: t.cells.length, left: t.count,
        orients: orientations(t.cells, opts.rotate !== false, !!opts.flip),
        // Best case for its own stats, and best case for what touching one node adds (node side + receiver side).
        ownOpt: base.map(b => b + (t.top ? mount(b) : 0) + (t.side ? mount(b) : 0)),
        pairUb: t.node ? [0, 0, 0] : base.map(b => b > 0 ? Math.ceil(b / NODE_DIVISOR) + (t.receiver ? Math.ceil(b * RECEIVER_PCT / 100) : 0) : 0),
      };
    });
    const helps = v => goals.some(g => dot(g, v) > 0);
    const ms = all.filter(t => !t.node && (helps(t.ownOpt) || helps(t.pairUb) || (t.cost || 0) < 0));
    const nodeTypes = ms.some(t => helps(t.pairUb)) ? all.filter(t => t.node) : [];
    const pr = K3.map(k => w[k] + (cons.includes(k) ? 10 : 0));
    ms.sort((a, b) => dot(pr, b.ownOpt) / b.size - dot(pr, a.ownOpt) / a.size); // try most useful first

    // Per goal: module types by best pair value, and by own value per cell (for the knapsack).
    // Cost counts against the objective and its Lagrangian variants, not against the pure minimum goals.
    const prep = goals.map((g, gi) => {
      const costed = gi === 0 || gi > cons.length;
      return {
        byPair: ms.map(t => ({ t, v: dot(g, t.pairUb) })).filter(x => x.v > 0).sort((a, b) => b.v - a.v),
        byDensity: ms.map(t => ({ t, v: dot(g, t.ownOpt) - (costed ? t.cost || 0 : 0) })).filter(x => x.v > 0).sort((a, b) => b.v / b.t.size - a.v / a.t.size),
      };
    });

    const occ = grid.usable.map(u => !u);
    const owner = new Int32Array(N).fill(-1); // index into cur of the item on each cell
    const T = [0, 0, 0], cur = [], log = [];
    let free = grid.usable.filter(Boolean).length;
    let found = false, best = 0, bestPlace = [], bestTotals = [0, 0, 0], steps = 0, timedOut = false;
    let C = 0; // total cost of placed items
    const score = () => dot(w, T) - C;
    const deadline = Date.now() + (opts.timeLimitMs ?? 5000);

    function setStats(p, next) {
      for (const k of K3) T[k] += next[k] - p.stats[k];
      p.stats = next;
    }

    // Cells for shape o with its first cell on pos, or null if it does not fit.
    function fits(pos, o) {
      const r = Math.floor(pos / cols), c = pos % cols, idx = [];
      for (const [dr, dc] of o) {
        const rr = r + dr, cc = c + dc, i = rr * cols + cc;
        if (rr >= rows || cc < 0 || cc >= cols || occ[i]) return null;
        idx.push(i);
      }
      return idx;
    }

    // Places t on idx and updates every item it touches. Returns the log mark for takeBack().
    function put(t, idx) {
      const mark = log.length;
      const p = { t, cells: idx, s: situation(grid, idx), stats: [0, 0, 0], around: [] };
      const touched = new Set();
      for (const i of idx) for (const j of nbrs[i]) {
        const q = owner[j];
        if (q < 0 || touched.has(q)) continue;
        touched.add(q);
        const o = cur[q];
        touch(p.s, o.t);
        const affects = (o.t.node && !t.node) || (o.t.receiver && t.node) || (o.t.feedback && t.base.some(b => b < 0));
        if (affects) {
          log.push([o, o.s, o.stats]);
          o.s = { ...o.s, sum: o.s.sum.slice(), neg: o.s.neg.slice() };
          touch(o.s, t);
          setStats(o, itemStats(o.t, o.s));
        }
      }
      setStats(p, itemStats(t, p.s));
      p.around = [...new Set(idx.flatMap(i => nbrs[i]))].filter(j => !idx.includes(j));
      for (const i of idx) { occ[i] = true; owner[i] = cur.length; }
      t.left--; free -= idx.length; C += t.cost || 0; cur.push(p);
      return mark;
    }

    function takeBack(mark) {
      const p = cur.pop();
      C -= p.t.cost || 0;
      setStats(p, [0, 0, 0]);
      for (const i of p.cells) { occ[i] = false; owner[i] = -1; }
      p.t.left++; free += p.cells.length;
      while (log.length > mark) { const [o, s, stats] = log.pop(); o.s = s; setStats(o, stats); }
    }

    // Upper bound on how much goal g can still rise: modules' own stats (fractional knapsack over
    // free cells) + for each node, the best pair gains of modules left, one per free cell around it.
    function bound(gi) {
      const { byPair, byDensity } = prep[gi];
      let ub = 0;
      for (const p of cur) if (p.t.node) {
        let k = 0;
        for (const j of p.around) if (!occ[j]) k++;
        for (const { t, v } of byPair) {
          if (k <= 0) break;
          const n = Math.min(k, t.left);
          ub += n * v; k -= n;
        }
      }
      let f = free;
      for (const { t, v } of byDensity) {
        if (f <= 0) break;
        const take = Math.min(t.left, f / t.size);
        ub += take * v; f -= take * t.size;
      }
      return ub;
    }

    const feasible = () => cons.every(k => T[k] >= mins[k]);

    // Whole-layout mirrors/rotation the bay shape allows. A search cut short can leave Top Mount or
    // Side Mount modules on the wrong edge; the mirrored layout keeps every adjacency and fixes that.
    const byIdAll = Object.fromEntries(all.map(t => [t.id, t]));
    const shapeKeys = new Map(all.map(t => [t.id, new Set(t.orients.map(o => JSON.stringify(o)))]));
    const at = i => [Math.floor(i / cols), i % cols];
    const mirrors = [
      i => { const [r, c] = at(i); return r * cols + (cols - 1 - c); },          // left <-> right
      i => { const [r, c] = at(i); return (rows - 1 - r) * cols + c; },          // top <-> bottom
      i => N - 1 - i,                                                             // 180 degrees
    ].filter(f => !(opts.fixed || []).length && grid.usable.every((u, i) => u === grid.usable[f(i)]));
    const layoutScore = (placements, totals) => dot(w, totals) - placements.reduce((s, p) => s + (byIdAll[p.id].cost || 0), 0);

    // Keeps the current layout (or a better mirror of it) if it meets the minimums and beats the best so far.
    function record() {
      if (!feasible() || (found && score() <= best + 1e-9)) return;
      found = true; best = score(); bestTotals = T.slice();
      bestPlace = cur.map(p => ({ id: p.t.id, cells: p.cells }));
      for (const f of mirrors) {
        const moved = bestPlace.map(p => ({ id: p.id, cells: p.cells.map(f) }));
        if (!moved.every(p => shapeKeys.get(p.id).has(JSON.stringify(norm(p.cells.map(at)))))) continue; // shape not allowed (rotation/mirroring off)
        const totals = evaluate(grid, moved, byIdAll).totals, s = layoutScore(moved, totals);
        if (cons.every(k => totals[k] >= mins[k]) && s > best + 1e-9) { best = s; bestTotals = totals; bestPlace = moved; }
      }
      if (opts.onImprove) opts.onImprove({ found, score: best, totals: bestTotals, placements: bestPlace, optimal: false, steps });
    }
    function hopeless() {
      for (let c = 0; c < cons.length; c++) if (T[cons[c]] + bound(c + 1) < mins[cons[c]]) return true;
      if (!found) return false;
      const room = best + 1e-9 - score();
      if (bound(0) <= room) return true;
      for (const { k, lambda, gi } of lagr) {
        const need = mins[k] - T[k];
        if (need > 0 && bound(gi) - lambda * need <= room) return true;
      }
      return false;
    }

    // Phase 1: choose node positions. Same-type nodes go in increasing cell order so each set is tried once.
    function placeNodes(k, start) {
      if (timedOut) return;
      if (k === nodeTypes.length) return dfs(0);
      const t = nodeTypes[k];
      placeNodes(k + 1, 0); // no more nodes of this type
      if (!t.left) return;
      for (let pos = start; pos < N; pos++) {
        if (occ[pos]) continue;
        for (const o of t.orients) {
          const idx = fits(pos, o);
          if (!idx) continue;
          const mark = put(t, idx);
          placeNodes(k, pos + 1);
          takeBack(mark);
        }
      }
    }

    // Phase 2: fill cells in row order with modules, or leave them empty.
    function dfs(pos) {
      if (timedOut) return;
      if (++steps % 4096 === 0 && Date.now() > deadline) { timedOut = true; return; }
      while (pos < N && occ[pos]) pos++;
      record();
      if (pos >= N || (!opts.noPrune && hopeless())) return; // noPrune: tests only
      for (const t of ms) {
        if (!t.left) continue;
        for (const o of t.orients) {
          const idx = fits(pos, o);
          if (!idx) continue;
          const mark = put(t, idx);
          dfs(pos + 1);
          takeBack(mark);
        }
      }
      occ[pos] = true; free--; // leave this cell empty
      dfs(pos + 1);
      occ[pos] = false; free++;
    }

    // Helpers for the fast search and the polish step: build layouts item by item and refill greedily.
    let seed = opts.seed ?? 12345;
    const rand = () => ((seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648);
    const pool = [...nodeTypes, ...ms];
    const marks = [];
    const shortfallWeight = 1e4 * Math.max(...w, 1);
    // Score that also rewards getting closer to unmet minimums.
    const value = () => score() + shortfallWeight * cons.reduce((s, k) => s + Math.min(0, T[k] - mins[k]), 0);
    const add = (t, idx) => marks.push(put(t, idx));
    const clear = () => { while (marks.length) takeBack(marks.pop()); };
    const snapshot = () => cur.slice(nFixed).map(p => ({ t: p.t, idx: p.cells }));
    const rebuild = (snap, skip = -1) => { clear(); snap.forEach((x, j) => j !== skip && add(x.t, x.idx)); };

      function greedyFill(randomise) {
        for (;;) {
          const before = value(), cands = [];
          for (let pos = 0; pos < N; pos++) {
            if (occ[pos]) continue;
            for (const t of pool) {
              if (!t.left) continue;
              for (const o of t.orients) {
                const idx = fits(pos, o);
                if (!idx) continue;
                const mark = put(t, idx), gain = value() - before;
                takeBack(mark);
                if (gain > 1e-9) cands.push({ t, idx, gain });
              }
            }
          }
          if (!cands.length) return;
          cands.sort((a, b) => b.gain - a.gain);
          const pick = cands[randomise ? Math.floor(rand() * Math.min(3, cands.length)) : 0];
          add(pick.t, pick.idx);
        }
      }

    // Polish: move one item at a time to its best spot, refill any gap, repeat until nothing improves.
    // Catches what a cut-short search misses, e.g. a Side Mount module left away from the left edge.
    function polish(snap) {
      rebuild(snap);
      let current = value();
      for (let improved = true; improved && Date.now() < polishEnd;) {
        improved = false;
        for (let i = 0; i < snap.length && Date.now() < polishEnd; i++) {
          rebuild(snap, i);
          const t = snap[i].t;
          let spot = snap[i].idx, spotValue = -Infinity;
          for (let pos = 0; pos < N; pos++) {
            if (occ[pos]) continue;
            for (const o of t.orients) {
              const idx = fits(pos, o);
              if (!idx) continue;
              const mark = put(t, idx), v = value();
              takeBack(mark);
              if (v > spotValue + 1e-9) { spotValue = v; spot = idx; }
            }
          }
          add(t, spot);
          greedyFill(false);
          record();
          if (value() > current + 1e-9) { current = value(); snap = snapshot(); improved = true; }
        }
      }
      rebuild(snap);
      record();
      clear();
      return { snap, value: current };
    }
    let polishEnd = deadline;

    // Items already in place go first and stay: cur[0..nFixed-1], so record() keeps them in every layout.
    const nFixed = (opts.fixed || []).length;
    for (const f of opts.fixed || []) {
      const t = byIdAll[f.id];
      if (!t || !t.left || f.cells.some(i => occ[i])) return { found: false, score: 0, totals: [0, 0, 0], placements: [], optimal: true, steps: 0 };
      put(t, f.cells);
    }

    // Fast search first (opts.heuristicMs): repeatedly clear part of the best layout and refill it greedily.
    // It finds strong layouts quickly when there are many modules and nodes; its result then lets the
    // exact search below skip anything that cannot beat it.
    if (opts.heuristicMs > 0) {
      const hEnd = Math.min(deadline, Date.now() + opts.heuristicMs);
      greedyFill(false);
      record();
      let bestValue = value(), bestSnap = snapshot(), stale = 0;
      while (Date.now() < hEnd && stale < 400) {
        clear();
        // Ruin: drop random items, or everything near a random cell.
        const r0 = Math.floor(rand() * rows), c0 = Math.floor(rand() * cols), radius = 1 + Math.floor(rand() * 3);
        const byArea = rand() < 0.5, dropShare = 0.2 + rand() * 0.4;
        const near = idx => idx.some(i => Math.abs(Math.floor(i / cols) - r0) + Math.abs(i % cols - c0) <= radius);
        for (const { t, idx } of bestSnap) if (byArea ? !near(idx) : rand() > dropShare) add(t, idx);
        // Sometimes seed a node somewhere first, since a lone node scores nothing until modules surround it.
        if (nodeTypes.length && rand() < 0.5) {
          const t = nodeTypes[Math.floor(rand() * nodeTypes.length)], spots = [];
          if (t.left) for (let pos = 0; pos < N; pos++) for (const o of t.orients) { const idx = fits(pos, o); if (idx) spots.push(idx); }
          if (spots.length) add(t, spots[Math.floor(rand() * spots.length)]);
        }
        greedyFill(true);
        record();
        const v = value();
        if (v > bestValue + 1e-9) {
          polishEnd = Math.min(hEnd + 1000, deadline);
          ({ snap: bestSnap, value: bestValue } = polish(snapshot()));
          stale = 0;
        } else stale++;
      }
      clear();
    }

    placeNodes(0, 0);
    // Out of time before the exact search finished: polish the best layout found.
    if (timedOut && found && opts.heuristicMs > 0) {
      polishEnd = Date.now() + 2000;
      polish(bestPlace.slice(nFixed).map(p => ({ t: byIdAll[p.id], idx: p.cells })));
    }
    return { found, score: best, totals: bestTotals, placements: bestPlace, optimal: !timedOut, steps };
  }

  // A layout that must include one module of each type in opts.require (e.g. the Furnace's Blast, or the
  // 3D Printer's Metal Printer + CNC modules). Each required module in turn is tried in every spot it fits
  // (around the ones already placed) with a short search; the best spot stays. Then the rest of the time
  // builds the layout around all of them.
  // shortcut: required modules are placed one after another (greedy), not jointly; fine for 1-2 of them.
  function solveRequired(grid, types, opts) {
    const rest = { ...opts, require: null };
    const need = opts.require.map(id => types.find(x => x.id === id && x.count > 0)).filter(Boolean);
    const total = opts.timeLimitMs ?? 5000, fixed = [];
    let best = null;
    for (const t of need) {
      const taken = new Set(fixed.flatMap(f => f.cells)), spots = [], seen = new Set();
      for (const o of orientations(t.cells, opts.rotate !== false, !!opts.flip))
        for (let pos = 0; pos < grid.rows * grid.cols; pos++) {
          const r = Math.floor(pos / grid.cols), c = pos % grid.cols;
          const idx = o.map(([dr, dc]) => [r + dr, c + dc]);
          if (idx.some(([rr, cc]) => rr >= grid.rows || cc < 0 || cc >= grid.cols || !grid.usable[rr * grid.cols + cc] || taken.has(rr * grid.cols + cc))) continue;
          const cells = idx.map(([rr, cc]) => rr * grid.cols + cc), key = cells.slice().sort((x, y) => x - y).join();
          if (!seen.has(key)) { seen.add(key); spots.push(cells); }
        }
      const each = Math.max(100, total / 2 / need.length / Math.max(1, spots.length));
      let stepBest = null, bestCells = null;
      for (const cells of spots) {
        const r = solve(grid, types, { ...rest, fixed: [...fixed, { id: t.id, cells }], timeLimitMs: each, heuristicMs: each * 0.8, onImprove: null });
        if (r.found && (!stepBest || r.score > stepBest.score)) { stepBest = r; bestCells = cells; if (opts.onImprove) opts.onImprove({ ...r, optimal: false }); }
      }
      if (!stepBest) return { found: false, score: 0, totals: [0, 0, 0], placements: [], optimal: false, steps: 0 };
      fixed.push({ id: t.id, cells: bestCells });
      best = stepBest;
    }
    if (!best) return solve(grid, types, rest);
    const left = Math.max(500, total / 2);
    const r = solve(grid, types, { ...rest, fixed, timeLimitMs: left, heuristicMs: Math.min(opts.heuristicMs ?? 0, left / 2) || left / 2 });
    const out = r.found && r.score >= best.score ? r : best;
    return { ...out, optimal: false };
  }

  return { solve, evaluate, orientations };
}

if (typeof module !== 'undefined') module.exports = solverModule();
