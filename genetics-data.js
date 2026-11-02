// Plant genetics data extracted from Probably Stolen (PlantList, PlantTraitList, PlantGeneticsHelper, HydroponicHelper).
// Ranks scale as rank^0.75. Stat multiplier = product over traits of (1 + percent * rank^0.75 / 100).
// Complexity counts only changes from a plant's innate ranks; each operation also adds heat (2 + |complexity|)
// until the seed is harvested (new seeds start with no heat). Success = 95 - 5 * (complexity + heat) + DNA Quality/2.

const GENETICS = {
  plants: [
    { id: 'nutrifruit', name: 'Nutrifruit', progress: 23, harvest: 5, value: 12, returnsSeeds: true,
      innate: { complex_genome: 2, fast_grower: 2, nutritious: 1, bountiful: 2, hardy: 1, infertile: 10 } },
    { id: 'kotton', name: 'Kotton', progress: 32, harvest: 9, value: 46, returnsSeeds: true,
      innate: { bountiful: 3, thirsty: 2, frail: 2, slow_grower: 1 } },
    { id: 'dream_cap', name: 'Dream Cap', progress: 28, harvest: 8, value: 23, returnsSeeds: true,
      actives: { dream_cap_mush: 27.333 }, // mL per item from its composition, before Potent/Weak
      target: { name: 'dream cap mush (for Dream Dust / Pink Alt)', weights: { dream_cap_mush: 1 } },
      innate: { prod_dream_cap_mush: 1, weak: 1, fertile: 1 } },
    { id: 'coffee', name: 'Coffee', progress: 21, harvest: 8, value: 28, returnsSeeds: false,
      actives: { caffeine: 4.4, coffee_mush: 25.84 },
      target: { name: 'caffeine, counting the 75% of coffee mush that extraction turns into caffeine', weights: { caffeine: 1, coffee_mush: 0.75 } },
      innate: { prod_caffeine: 1, prod_coffee_mush: 1, potent: 1 } },
    { id: 'fillerweed', name: 'Fillerweed', progress: 11, harvest: 4, value: 11, returnsSeeds: true,
      innate: { simple_genome: 2, edible: 1, unappetizing: 1, hardy: 3, bountiful: 2, fast_grower: 2, thirsty: 3, nutrient_poor: 2 } },
    { id: 'hydroreed', name: 'Hydroreed', progress: 18, harvest: 0, value: null, returnsSeeds: true, durable: true,
      innate: { purifying: 4, dense: 1, hardy: 1 }, note: 'Harvest comes from the Hydroreed Filter module, not the plant.' },
    { id: 'bloomberry', name: 'Bloomberry', progress: 18, harvest: 8, value: null, returnsSeeds: false, refruit: 10,
      innate: { perennial: 1, edible: 1 } },
  ],

  // group: traits in the same group cannot be on one seed together. pct: stat % at rank 1.
  // max: highest rank (omitted = unlimited). locked: cannot be extracted onto a disk.
  traits: [
    { id: 'edible', name: 'Edible', c: 2, group: 'edible', max: 1 },
    { id: 'nutritious', name: 'Nutritious', c: 3, group: 'nutrition', pct: { CALORIES: 25 } },
    { id: 'nutrient_poor', name: 'Nutrient-Poor', c: -2, group: 'nutrition', pct: { CALORIES: -25 } },
    { id: 'fast_grower', name: 'Fast Grower', c: 4, group: 'growth', pct: { GROWTH_SPEED: 25 } },
    { id: 'slow_grower', name: 'Slow Grower', c: -3, group: 'growth', pct: { GROWTH_SPEED: -25 } },
    { id: 'bountiful', name: 'Bountiful', c: 4, group: 'yield', pct: { HARVEST_QUANTITY: 20 } },
    { id: 'sparse', name: 'Sparse', c: -3, group: 'yield', pct: { HARVEST_QUANTITY: -20 } },
    { id: 'delicious', name: 'Delicious', c: 3, group: 'taste', pct: { SELL_PRICE: 15 } },
    { id: 'unappetizing', name: 'Unappetizing', c: -2, group: 'taste', pct: { SELL_PRICE: -15 } },
    { id: 'drought_resistant', name: 'Drought Resistant', c: 2, group: 'water', pct: { WATER_USE: -25 } },
    { id: 'thirsty', name: 'Thirsty', c: -1, group: 'water', pct: { WATER_USE: 25 } },
    { id: 'hardy', name: 'Hardy', c: 3, group: 'resilience', pct: { CONTAMINANT_SENSITIVITY: -30 } },
    { id: 'frail', name: 'Frail', c: -2, group: 'resilience', pct: { CONTAMINANT_SENSITIVITY: 30 } },
    { id: 'fertile', name: 'Fertile', c: 2, group: 'seeds', pct: { SEED_YIELD: 25 }, needsSeeds: true },
    { id: 'infertile', name: 'Infertile', c: -1, group: 'seeds', pct: { SEED_YIELD: -25 }, needsSeeds: true },
    { id: 'simple_genome', name: 'Simple Genome', c: 0, group: 'genome', offset: -4, locked: true },
    { id: 'complex_genome', name: 'Complex Genome', c: 0, group: 'genome', offset: 4, locked: true },
    { id: 'perennial', name: 'Perennial', c: 5, max: 1, perennial: true, pct: { HARVEST_QUANTITY: -25, GROWTH_SPEED: -20, SEED_YIELD: -50 }, incompatible: ['infertile'] },
    { id: 'purifying', name: 'Purifying', c: 3, group: 'water_quality' },
    { id: 'polluting', name: 'Polluting', c: -2, group: 'water_quality' },
    { id: 'dense', name: 'Dense', c: 3, group: 'fibre', pct: { DURABILITY: 25 }, needsDurable: true },
    { id: 'prod_caffeine', name: 'Caffeine Production', c: 3, produces: ['caffeine', 2] },
    { id: 'prod_coffee_mush', name: 'Coffee Mush Production', c: 2, produces: ['coffee_mush', 10] },
    { id: 'prod_dream_cap_mush', name: 'Dream Cap Mush Production', c: 4, produces: ['dream_cap_mush', 2] },
    { id: 'potent', name: 'Potent', c: 3, group: 'potency', pct: { ACTIVES: 25 }, needsActive: true },
    { id: 'weak', name: 'Weak', c: -2, group: 'potency', pct: { ACTIVES: -25 }, needsActive: true },
  ],
};

GENETICS.rankScale = r => (r > 0 ? Math.pow(r, 0.75) : 0);
GENETICS.trait = id => GENETICS.traits.find(t => t.id === id);

// Stat multiplier for ranks {traitId: rank}.
GENETICS.mult = (ranks, stat) => {
  let m = 1;
  for (const [id, r] of Object.entries(ranks)) {
    const p = GENETICS.trait(id).pct?.[stat];
    if (p && r > 0) m *= 1 + Math.max(-99.99, p * GENETICS.rankScale(r)) / 100;
  }
  return Math.max(0.000100016594, m);
};

// Permanent complexity of a seed with these ranks (changes from innate only, plus genome offsets).
GENETICS.complexity = (plant, ranks) => {
  let c = 0;
  for (const t of GENETICS.traits) {
    const r = ranks[t.id] || 0, d = r - (plant.innate[t.id] || 0);
    c += d < 0 ? Math.abs(t.c) * -d : t.c * d;
    c += (t.offset || 0) * r;
  }
  return c;
};

GENETICS.success = (effectiveComplexity, dnaQuality) =>
  Math.min(100, Math.max(5, 95 - 5 * Math.max(0, effectiveComplexity) + Math.trunc(dnaQuality / 2)));

if (typeof module !== 'undefined') module.exports = GENETICS;
