// Run: node solver.test.js
const assert = require('assert');
const { solve, evaluate } = require('./solver');

const full = (rows, cols) => ({ rows, cols, usable: Array(rows * cols).fill(true) });
const dom = [[0, 0], [0, 1]], sq = [[0, 0], [0, 1], [1, 0], [1, 1]], L = [[0, 0], [1, 0], [1, 1]];
const mod = (id, cells, count, base, extra = {}) => ({ id, cells, count, base, ...extra });
const node = (id, cells, count) => ({ id, cells, count, base: [0, 0, 0], node: true });
const byIdOf = types => Object.fromEntries(types.map(t => [t.id, t]));
const check = (grid, types, res) => assert.deepStrictEqual(evaluate(grid, res.placements, byIdOf(types)).totals, res.totals);

// Two dominoes beat one square.
let ts = [mod(0, dom, 2, [5, 0, 0]), mod(1, sq, 1, [8, 0, 0])];
assert.strictEqual(solve(full(2, 2), ts).score, 10);

// Game example: Premium Performance receiver, base 19, next to one node.
// Receiver: 19 + trunc(19 * 10 / 100) = 20. Node: trunc(19 / 5) = 3. Total 23.
ts = [node(0, dom, 1), mod(1, dom, 1, [19, 0, 0], { receiver: true })];
let r = solve(full(1, 4), ts, { weights: [1, 0, 0] });
assert.deepStrictEqual(r.totals, [23, 0, 0]); check(full(1, 4), ts, r);

// Node truncation: two modules of 4 next to a node give trunc(8 / 5) = 1, not 1.6.
ts = [node(0, [[0, 0]], 1), mod(1, [[0, 0]], 2, [4, 0, 0])];
r = solve(full(1, 3), ts, { weights: [1, 0, 0] });
assert.deepStrictEqual(r.totals, [9, 0, 0]);

// Top mount: +20% only when touching row 0. One 1x1 slot in row 0, one in row 1.
const g2 = { rows: 2, cols: 2, usable: [false, true, false, true] };
ts = [mod(0, [[0, 0]], 1, [10, 0, 0], { top: true })];
assert.deepStrictEqual(solve(g2, ts).totals, [12, 0, 0]);
// Side mount uses the LEFT column only.
const g3 = { rows: 1, cols: 3, usable: [false, true, true] };
ts = [mod(0, [[0, 0]], 1, [10, 0, 0], { side: true })];
assert.deepStrictEqual(solve(g3, ts).totals, [10, 0, 0]);

// Negative feedback takes 25% of neighbours' negatives.
ts = [mod(0, [[0, 0]], 1, [20, 0, 0], { feedback: true }), mod(1, [[0, 0]], 1, [0, -8, 10])];
r = solve(full(1, 2), ts, { weights: [1, 1, 1], mins: [null, null, 10] });
assert.deepStrictEqual(r.totals, [20, -10, 10]); check(full(1, 2), ts, r);

// Minimum: Quality >= 10 forces the quality module in, even though it scores less.
ts = [mod(0, [[0, 0]], 1, [9, 0, 0]), mod(1, [[0, 0]], 1, [0, 0, 10])];
r = solve(full(1, 1), ts, { weights: [1, 0, 0], mins: [null, null, 10] });
assert.ok(r.found); assert.deepStrictEqual(r.totals, [0, 0, 10]);
// Impossible minimum: nothing found.
assert.strictEqual(solve(full(1, 1), ts, { weights: [1, 0, 0], mins: [null, null, 11] }).found, false);

// Cost: meeting Quality >= 8 with no other goal picks the cheapest module that does it.
ts = [mod(0, [[0, 0]], 1, [0, 0, 20], { cost: 20 }), mod(1, [[0, 0]], 1, [0, 0, 8], { cost: 8 })];
r = solve(full(1, 2), ts, { weights: [0, 0, 0], mins: [null, null, 8] });
assert.deepStrictEqual(r.totals, [0, 0, 8]);

// Random small cases: pruned search must match the full search, totals must match evaluate().
let seed = 7;
const rnd = n => ((seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648) * n;
const shapes = [[[0, 0]], dom, L, [[0, 0], [1, 0], [2, 0]], sq];
for (let k = 0; k < 200; k++) {
  const grid = full(3, 4);
  grid.usable = grid.usable.map(() => rnd(1) > 0.15);
  const types = Array.from({ length: 2 + Math.floor(rnd(3)) }, (_, id) => {
    if (rnd(1) < 0.3) return node(id, rnd(1) < 0.5 ? dom : [[0, 0]], 1 + Math.floor(rnd(2)));
    return mod(id, shapes[Math.floor(rnd(shapes.length))], 1 + Math.floor(rnd(3)),
      [0, 1, 2].map(() => Math.round(rnd(40) - 12)),
      { receiver: rnd(1) < 0.4, top: rnd(1) < 0.2, side: rnd(1) < 0.2, feedback: rnd(1) < 0.2 });
  });
  if (k % 2) types.forEach(t => (t.cost = Math.round(rnd(4))));
  const weights = [0, 1, 2].map(() => Math.round(rnd(3)) / 2);
  const mins = [0, 1, 2].map(() => (rnd(1) < 0.25 ? Math.round(rnd(30)) : null));
  const a = solve(grid, types, { weights, mins, flip: true });
  const b = solve(grid, types, { weights, mins, flip: true, noPrune: true });
  assert.strictEqual(a.found, b.found, `case ${k}: found`);
  if (!a.found) continue;
  assert.ok(Math.abs(a.score - b.score) < 1e-9, `case ${k}: ${a.score} vs ${b.score}`);
  check(grid, types, a);
  mins.forEach((m, i) => m === null || assert.ok(a.totals[i] >= m, `case ${k}: min`));
  // Fast search first, then exact: same best score.
  const c = solve(grid, types, { weights, mins, flip: true, heuristicMs: 20, seed: k + 1 });
  assert.ok(c.found && Math.abs(c.score - b.score) < 1e-9, `case ${k}: with heuristic ${c.score} vs ${b.score}`);
  check(grid, types, c);
}

// Realistic size: grid 1 (7x5, 26 cells), basic + advanced shapes, two medium nodes, a Quality target.
const big = full(5, 7);
[0, 6, 28, 34, 10, 16, 17, 18, 24].forEach(i => (big.usable[i] = false));
const Lshape = [[0, 0], [0, 1], [0, 2], [1, 2]], T = [[0, 1], [1, 0], [1, 1], [2, 1]], C = [[0, 0], [0, 1], [1, 1]];
const S5 = [[0, 0], [0, 1], [1, 1], [2, 0], [2, 1]];
const bigTypes = [
  mod(0, Lshape, 2, [16, 0, 0], { receiver: true }),
  mod(1, T, 2, [0, 16, 0]),
  mod(2, C, 3, [0, 0, 6]),
  mod(3, sq, 2, [0, 0, 8], { top: true }),
  mod(4, S5, 1, [-10, -18, 31]),
  node(5, dom, 2),
];
const t0 = Date.now();
const res = solve(big, bigTypes, { weights: [1, 0.5, 0], mins: [null, null, 40], flip: true, heuristicMs: 1000, timeLimitMs: 40000 });
// shortcut: proving optimality can take long when nearly every module fits; the page shows the best found so far and lets you stop
console.log('big grid:', res.totals, res.found ? 'found' : 'none', res.optimal ? 'optimal' : 'timed out', res.steps, 'steps', Date.now() - t0, 'ms');
assert.ok(res.found && res.optimal && res.totals[2] >= 40);
check(big, bigTypes, res);
const used = res.placements.flatMap(p => p.cells);
assert.strictEqual(new Set(used).size, used.length, 'no overlaps');
assert.ok(used.every(i => big.usable[i]), 'only usable cells');
console.log('all tests passed');
