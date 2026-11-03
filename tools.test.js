// Run: node tools.test.js  (chemistry simulator and plant genetics rules)
const assert = require('assert');
const CHEM = require('./chem-sim.js');
const G = require('./genetics-data.js');

// Dream Dust by hand: 10 caps, plenty of alcohol, 45 °C, filter, protein clean-up, dry.
const r = CHEM.run([
  { op: 'blend', item: 'dream_cap', count: 10, modules: 0 },
  { op: 'pour', item: 'alcohol', amount: 1959100 },
  { op: 'heat', target: 45, seconds: 120, high: true, modules: 1 },
  { op: 'filter', size: 22 },
  { op: 'pour', item: 'acid', amount: 15000 }, { op: 'wait', seconds: 60 },
  { op: 'pour', item: 'base', amount: 3000 }, { op: 'wait', seconds: 60 },
  { op: 'filter', size: 22 },
  { op: 'dry', performance: 0 },
], 'dream_dust', 1);
assert.ok(!r.wet && r.units === 45 && r.grade === 'Pharma Grade', JSON.stringify({ units: r.units, purity: r.purity }));

// Extract degrades from 60 °C: holding at 80 °C must destroy most of it.
const hot = CHEM.run([
  { op: 'blend', item: 'dream_cap', count: 10, modules: 0 },
  { op: 'pour', item: 'alcohol', amount: 1959100 },
  { op: 'heat', target: 80, seconds: 300, high: true, modules: 4 },
], 'dream_dust', 0);
assert.ok(hot.active < r.active / 2, 'extract should degrade when hot');

// Filters keep extract (size 5) and drop debris/plant matter (size 200).
const c = CHEM.newContainer(); c.l = { dream_cap_extract: 1000, debris: 1000, plant_matter: 1000 };
CHEM.STEPS.filter(c, { size: 22 });
assert.deepStrictEqual(c.l, { dream_cap_extract: 1000, debris: 0, plant_matter: 0 });

// Genetics: Fillerweed's innate Simple Genome x2 gives complexity -8; one more Bountiful costs 4.
const fw = G.plants.find(p => p.id === 'fillerweed');
assert.strictEqual(G.complexity(fw, fw.innate), -8);
assert.strictEqual(G.complexity(fw, { ...fw.innate, bountiful: 3 }), -4);
// Removing an innate negative trait costs its absolute complexity: Dream Cap without Weak = +2.
const dc = G.plants.find(p => p.id === 'dream_cap');
assert.strictEqual(G.complexity(dc, { ...dc.innate, weak: 0 }), 2);
// Rank scaling is rank^0.75: Fast Grower 2 = 1 + 25 * 2^0.75 / 100.
assert.ok(Math.abs(G.mult({ fast_grower: 2 }, 'GROWTH_SPEED') - (1 + 25 * Math.pow(2, 0.75) / 100)) < 1e-9);
assert.strictEqual(G.success(0, 0), 95);
assert.strictEqual(G.success(20, 0), 5);
// Fish and rats (animals.js): game weights and cuts.
const A = require('./animals.js');
const tilapia = A.FISH.find(f => f.name === 'Tilapia');
assert.strictEqual(A.fishWeight(tilapia, 6), 283); // 200 g at day 5 to 450 g at day 8
assert.strictEqual(A.ratWeight(4), 305); // 5 g + 75 + 75 + 75 + 75
assert.strictEqual(A.ratWeight(10), 407);
assert.deepStrictEqual(A.ratCuts(305), { cuts: '1 Small Raw Meat, 1 Morsel, 1 Small Morsel', kcal: 965, value: 110 });
assert.strictEqual(A.best(A.ratTable(), 'perKFeed').age, 4);
console.log('tools tests passed');
