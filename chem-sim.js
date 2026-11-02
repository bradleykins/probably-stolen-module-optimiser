// Chemistry simulator: a port of Probably Stolen's container reactions (ChemicalHelper), machines and finisher.
// Amounts are µL (1 mL = 1000). One tick = one second of game time. Integer maths follows the game.

const CHEM = (() => {
  const trunc = Math.trunc;
  // C# Math.Round / Mathf.RoundToInt round halves to even.
  const roundEven = v => { const r = Math.round(v); return Math.abs(v % 1) === 0.5 && r % 2 !== 0 ? r - 1 : r; };

  // Liquids that matter here: particle size (filters remove sizes >= the filter's), boiling point if it evaporates.
  // filterKeep: share a filter cannot remove (filterMinimumPurity).
  const LIQUIDS = {
    water: { particle: 10, boil: 100 }, alcohol: { particle: 10, boil: 78.37 }, lipobond_agent: { particle: 5, boil: 55 },
    heavy_metal: { particle: 12 }, organic_waste: { particle: 40, filterKeep: 0.0016 }, microplastic: { particle: 25, filterKeep: 0.002 },
    microbe: { particle: 50, unfilterable: true }, chemical_contaminant: { particle: 2 }, physical_contaminant: { particle: 100, filterKeep: 0.0016 },
    mineral: { particle: 30, filterKeep: 0.0016 }, dream_cap_mush: { particle: 200 }, dream_cap_extract: { particle: 5 },
    plant_matter: { particle: 200 }, caffeine: { particle: 5 }, protein: { particle: 5 }, fat: { particle: 5 }, starch: { particle: 5 },
    sugar: { particle: 5 }, coffee_mush: { particle: 200 }, nightmare_extract: { particle: 5 }, nightmare_cap_mush: { particle: 200 },
    chlorine: { particle: 5 }, fanta: { particle: 5 }, methylol: { particle: 5 }, reducing_agent: { particle: 5 }, acid: { particle: 5 },
    base: { particle: 5 }, stabilizing_agent: { particle: 5 }, debris: { particle: 200 }, nomore: { particle: 5 },
    contraceptive: { particle: 5 }, zyanide: { particle: 5 },
  };
  const EVAPORATIVE = Object.keys(LIQUIDS).filter(k => LIQUIDS[k].boil);

  // What you put in. Plants per item; bottles are what the shop sells (bottles carry 2-8% random impurity: 5% average).
  const ITEMS = {
    dream_cap: { name: 'Dream Cap (32.5 g)', blend: { dream_cap_mush: 27333, water: 4000, protein: 2000, mineral: 500, microbe: 2000, physical_contaminant: 2000 } },
    nightmare_cap: { name: 'Nightmare Cap (32.5 g)', blend: { nightmare_cap_mush: 18000, water: 8000, protein: 2000, mineral: 500, microbe: 5000, physical_contaminant: 2000 } },
    coffee_bean: { name: 'Coffee Bean (80 g)', blend: { water: 3200, fat: 8000, coffee_mush: 25840, caffeine: 4400, physical_contaminant: 8000, protein: 8000 } },
    alcohol: { name: 'Mini Alcohol Bottle', bottle: { alcohol: 175000, water: 75000 } },
    acid: { name: 'Acid bottle', bottle: { acid: 250000 }, impure: true },
    base: { name: 'Base bottle', bottle: { base: 250000 }, impure: true },
    reducing_agent: { name: 'Reducing Agent bottle', bottle: { reducing_agent: 250000 }, impure: true },
    lipobond_agent: { name: 'Lipobond Agent bottle', bottle: { lipobond_agent: 150000 }, impure: true },
    fanta_precursor: { name: 'Fanta Precursor bottle', bottle: { methylol: 125000, stabilizing_agent: 125000 }, impure: true },
  };
  const IMPURITIES = ['chemical_contaminant', 'physical_contaminant', 'microbe', 'heavy_metal'];

  const PRODUCTS = {
    dream_dust: { name: 'Dream Dust', active: 'dream_cap_extract', volume: 2000 },
    nightmare_dust: { name: 'Nightmare Dust', active: 'nightmare_extract', volume: 4000 },
    caffeine_pill: { name: 'Caffeine Pill', active: 'caffeine', volume: 5000 },
    fanta_pill: { name: 'Fanta Pill', active: 'fanta', volume: 500 },
    pink_alt_injector: { name: 'Pink Alt Injector', active: 'nomore', volume: 4000 },
  };
  const GRADES = [[99, 'Lab Pure'], [90, 'Pharma Grade'], [80, 'Near Pharma'], [60, 'Street Standard'], [45, 'Cut Product'], [30, 'Junk Grade'], [0, 'Starch Grade']];
  const grade = purity => GRADES.find(([p]) => purity >= p)[1];
  const BLENDER_LOSS = [35, 20, 10, 5, 0];   // % lost, by Chemical Equipment Modules installed (0-4)
  const FINISHER_LOSS = [12, 6, 3, 1, 0];

  // ---- container state ----
  const newContainer = () => ({ l: {}, temp: 26 });
  const get = (s, id) => s.l[id] || 0;
  const set = (s, id, v) => { s.l[id] = v; };
  const add = (s, id, v) => { s.l[id] = (s.l[id] || 0) + v; };
  const total = s => Object.values(s.l).reduce((a, b) => a + b, 0);
  const empty = s => total(s) <= 0;

  // ---- reactions, in the game's order (HandleTemperatureReaction) ----
  function degrade(s, id, startT, firstBandWidth, toId) {
    const T = s.temp, amt = get(s, id);
    if (amt <= 0 || T < startT) return;
    let f = 0;
    if (T < 70) f = 0.1 * ((T - startT) / firstBandWidth);
    else if (T < 100) f = 0.1 + 0.8 * ((T - 70) / 30);
    else f = 0.9 + 0.1 * Math.min((T - 100) / 20, 1);
    const d = trunc(amt * f);
    if (d > 0) { set(s, id, amt - d); if (toId) add(s, toId, d); }
  }
  function capMush(s, mush, extract) {
    if (s.temp < 40) return;
    const m = get(s, mush), alc = get(s, 'alcohol');
    if (m <= 0 || alc <= 0) return;
    const proc = Math.min(Math.max(2000, roundEven(m * 0.1)), m);
    const ratio = alc / m, eff = ratio >= 5 ? 0.5 : Math.max(0, 0.5 * (ratio / 5));
    const ex = roundEven(proc * eff);
    set(s, mush, m - proc); add(s, extract, ex); add(s, 'plant_matter', proc - ex);
  }
  function coffee(s, solvent, minT, share, maxEff) {
    if (s.temp < minT) return;
    const m = get(s, 'coffee_mush'), sol = get(s, solvent);
    if (m <= 0 || sol <= 0) return;
    const proc = Math.max(1, roundEven(m * share)), ratio = sol / proc;
    const eff = ratio < 5 ? Math.max(0, maxEff * (ratio / 5)) : maxEff;
    const ex = roundEven(proc * eff);
    set(s, 'coffee_mush', m - proc); add(s, 'caffeine', ex); add(s, 'plant_matter', proc - ex);
  }
  const R = [
    function microbeHeat(s) { const m = get(s, 'microbe'); if (m <= 0) return; if (s.temp >= 100) set(s, 'microbe', 0); else if (s.temp >= 70) set(s, 'microbe', trunc(Math.max(0, m * 0.8))); },
    function microbeAlcohol(s) { const a = get(s, 'alcohol'), m = get(s, 'microbe'); if (a <= 0 || m <= 0 || a < total(s) * 0.4) return; set(s, 'microbe', m - Math.min(m, a)); },
    function organicWasteHeat(s) {
      const w = get(s, 'organic_waste'); if (w <= 0 || s.temp < 80) return;
      const v = Math.min(s.temp >= 100 ? w : Math.ceil(w * 0.15), w);
      set(s, 'organic_waste', w - v); add(s, 'physical_contaminant', roundEven(v * 0.33));
    },
    s => capMush(s, 'dream_cap_mush', 'dream_cap_extract'),
    s => capMush(s, 'nightmare_cap_mush', 'nightmare_extract'),
    s => coffee(s, 'alcohol', 50, 0.15, 0.75),
    s => coffee(s, 'water', 80, 0.05, 0.125),
    function nomore(s) {
      if (s.temp < 45 || s.temp > 55) return;
      const ex = get(s, 'dream_cap_extract'), red = get(s, 'reducing_agent'), lip = get(s, 'lipobond_agent');
      if (ex <= 0 || red <= 0 || lip <= 0 || get(s, 'alcohol') * 10 > total(s)) return;
      const rate = s.temp >= 50 ? 0.1 : 0.05, lipF = Math.min(1, lip * 4 / ex), pool = Math.min(ex, red);
      let r = roundEven(pool * rate * lipF);
      r = Math.min(Math.max(r, Math.min(pool, 100)), pool);
      const n = roundEven(r * 0.6);
      set(s, 'dream_cap_extract', ex - r); set(s, 'reducing_agent', red - r); add(s, 'nomore', n); add(s, 'debris', r - n);
    },
    s => degrade(s, 'dream_cap_extract', 60, 10),
    s => degrade(s, 'dream_cap_mush', 50, 10, 'plant_matter'),
    s => degrade(s, 'nightmare_extract', 50, 2),
    s => degrade(s, 'nightmare_cap_mush', 50, 10, 'plant_matter'),
    function organicWasteMineral(s) {
      const a = get(s, 'acid'), b = get(s, 'base'), w = get(s, 'organic_waste'); if (w <= 0 || a + b <= 0) return;
      const p = Math.min(w, (a + b) * 40); if (p <= 0) return;
      const need = trunc((p + 39) / 40), ac = Math.min(a, need), bc = Math.min(b, need - ac);
      set(s, 'organic_waste', w - p); add(s, 'mineral', trunc(p / 10)); if (ac > 0) set(s, 'acid', a - ac); if (bc > 0) set(s, 'base', b - bc);
    },
    function acidBaseMicrobe(s) {
      const a = get(s, 'acid'), b = get(s, 'base'), m = get(s, 'microbe'); if (m <= 0 || a + b <= 0) return;
      const k = Math.min(m, (a + b) * 20); if (k <= 0) return;
      const need = trunc((k + 99) / 100), ac = Math.min(a, need), bc = Math.min(b, need - ac);
      set(s, 'microbe', m - k); if (ac > 0) set(s, 'acid', a - ac); if (bc > 0) set(s, 'base', b - bc);
    },
    function stabilizingSediment(s) {
      const a = get(s, 'acid'), b = get(s, 'base'), st = get(s, 'stabilizing_agent'); if (st <= 0 || (a <= 0 && b <= 0)) return;
      const n = Math.min(a + b, st), x = Math.min(n, Math.max(1000, trunc(n * 0.2)));
      set(s, 'stabilizing_agent', st - x); add(s, 'debris', x);
      set(s, 'acid', Math.max(0, a - Math.min(a, Math.max(100, trunc(a * 0.05))))); set(s, 'base', Math.max(0, b - Math.min(b, Math.max(100, trunc(b * 0.05)))));
    },
    function proteinPrecip(s) {
      const a = get(s, 'acid'), b = get(s, 'base'), p = get(s, 'protein'); if (p <= 0) return;
      const ex = Math.max(0, a - b) + Math.max(0, b - a); if (ex <= 0) return;
      const n = Math.min(ex, p), d = Math.min(Math.max(1, trunc(n * 0.2)), n);
      const ar = Math.min(Math.max(0, a - b), d), br = Math.min(Math.max(0, b - a), d - ar);
      set(s, 'protein', p - d); add(s, 'debris', d); set(s, 'acid', Math.max(0, a - ar)); set(s, 'base', Math.max(0, b - br));
    },
    function lipobondSediment(s) {
      const l = get(s, 'lipobond_agent'), f = get(s, 'fat'); if (l <= 0 || f <= 0) return;
      const n = Math.min(f, l * 8), o = Math.min(n, Math.max(1000, trunc(n * 0.2))), lc = trunc(o / 8);
      set(s, 'fat', f - o); set(s, 'lipobond_agent', l - lc); add(s, 'debris', o + lc);
    },
    function acidBaseNeutral(s) {
      const a = get(s, 'acid'), b = get(s, 'base'); if (a <= 0 || b <= 0) return;
      const n = Math.min(a, b), x = Math.min(n, Math.max(1000, trunc(n * 0.1)));
      set(s, 'acid', a - x); set(s, 'base', b - x);
    },
    function fantaHeat(s) { const f = get(s, 'fanta'); if (f > 0 && s.temp >= 130) set(s, 'fanta', trunc(Math.max(0, f * 0.98))); },
    function methylolHeat(s) {
      const m = get(s, 'methylol'), red = get(s, 'reducing_agent'), st = get(s, 'stabilizing_agent'), T = s.temp;
      if (m <= 0 || m <= st) return;
      const pool = Math.min(m - st, red);
      let rate;
      if (T >= 110 && T < 120) rate = 0.025; else if (T >= 120 && T < 130) rate = 0.15; else return;
      const r = Math.min(pool, Math.max(1000, trunc(pool * rate)));
      set(s, 'methylol', m - r); set(s, 'reducing_agent', Math.max(0, red - roundEven(r * 0.75))); add(s, 'fanta', roundEven(r * 0.1));
    },
    function boiling(s) {
      for (const id of EVAPORATIVE) {
        if (s.temp <= LIQUIDS[id].boil) continue;
        const have = get(s, id);
        set(s, id, have - Math.min(Math.max(trunc(have * 0.02), 100), have));
      }
    },
  ];

  // One second: heat on the plate (target °C, rate factor) or cool to the 26 °C room, then react.
  function tick(s, plate) {
    if (empty(s)) return;
    const v = total(s);
    if (plate) {
      if (s.temp < plate.target) s.temp = Math.min(s.temp + (plate.target - s.temp) * (plate.factor / 350) + 1, plate.target);
    } else {
      const k = 0.05 / (Math.sqrt(v) + 11);
      s.temp = 26 + (s.temp - 26) * Math.exp(-k * 125);
    }
    for (const r of R) r(s);
    for (const id of Object.keys(s.l)) if (s.l[id] <= 0) delete s.l[id];
  }

  // ---- steps a recipe can use ----
  // Heating plate rate: low 10, high 30; x4 with 3 Chemical Equipment Modules, x16 with 4.
  const plateFactor = (high, modules) => (high ? 30 : 10) * (modules >= 4 ? 16 : modules === 3 ? 4 : 1);
  const STEPS = {
    blend(s, { item, count, modules }) {
      const loss = BLENDER_LOSS[modules] / 100;
      for (const [id, v] of Object.entries(ITEMS[item].blend)) add(s, id, Math.round(v * count * (1 - loss)));
    },
    pour(s, { item, amount }) { // amount in µL of the bottle's contents
      const b = ITEMS[item].bottle, full = Object.values(b).reduce((x, y) => x + y, 0);
      const imp = ITEMS[item].impure ? 0.05 : 0;
      for (const [id, v] of Object.entries(b)) add(s, id, Math.round(amount * (v / full) * (1 - imp)));
      for (const id of IMPURITIES) if (imp) add(s, id, Math.round(amount * imp / IMPURITIES.length));
    },
    heat(s, { target, seconds, high, modules }) { const plate = { target, factor: plateFactor(high, modules) }; for (let i = 0; i < seconds; i++) tick(s, plate); },
    wait(s, { seconds }) { for (let i = 0; i < seconds; i++) tick(s, null); },
    filter(s, { size }) { // pour through a filter into a clean container
      for (const id of Object.keys(s.l)) {
        const L = LIQUIDS[id];
        if (!L || L.unfilterable || size > L.particle) continue;
        s.l[id] = Math.round(s.l[id] * (L.filterKeep || 0));
      }
    },
    evaporate(s, { nights, performance }) { // Evaporator: up to 300 mL x (1 + P/100) per night, split by share
      for (let n = 0; n < nights; n++) {
        const have = EVAPORATIVE.map(id => [id, get(s, id)]).filter(([, v]) => v > 0), sum = have.reduce((a, [, v]) => a + v, 0);
        if (!sum) break;
        const cap = Math.min(Math.round(300000 * Math.max(0, 1 + performance / 100)), sum);
        let taken = 0, left = have.length;
        for (const [id, v] of have) {
          left--;
          const x = Math.min(Math.max(left === 0 ? cap - taken : trunc(cap * v / sum), 0), v);
          taken += x; set(s, id, v - x);
        }
      }
    },
  };

  // Evaporator until the Chem Finisher accepts it (evaporating liquids <= 100 µL); records the nights taken.
  STEPS.dry = (s, st) => {
    st.nights = 0;
    while (EVAPORATIVE.reduce((a, id) => a + get(s, id), 0) > 100 && st.nights < 60) {
      STEPS.evaporate(s, { nights: 1, performance: st.performance });
      st.nights++;
    }
  };

  // Run a list of steps; returns the container and a summary of the finished product.
  function run(steps, product, finisherModules) {
    const s = newContainer();
    let seconds = 0, nights = 0;
    for (const st of steps) {
      st.present = Object.keys(s.l).filter(id => s.l[id] > 0); // what was in the container when this step started
      STEPS[st.op](s, st);
      if (st.seconds) seconds += st.seconds;
      if (st.nights) nights += st.nights;
    }
    for (const id of Object.keys(s.l)) if (s.l[id] <= 0) delete s.l[id];
    const P = PRODUCTS[product], tot = total(s), act = get(s, P.active);
    const wet = EVAPORATIVE.reduce((a, id) => a + get(s, id), 0) > 100;
    const loss = FINISHER_LOSS[finisherModules];
    const purity = tot > 0 ? (act / tot) * 100 * (1 - loss / 100) : 0;
    return { container: s, total: tot, active: act, wet, purity, grade: grade(purity), units: Math.floor(tot / P.volume), seconds, nights };
  }

  // Hottest a step may go before something in the container is ruined (degrades or boils off).
  // A heating step also counts what it makes: mush becomes extract, methylol becomes fanta.
  const RUIN = {
    dream_cap_mush: [50, 'dream cap mush breaks down'], dream_cap_extract: [60, 'dream cap extract breaks down'],
    nightmare_cap_mush: [50, 'nightmare cap mush breaks down'], nightmare_extract: [50, 'nightmare extract breaks down'],
    fanta: [130, 'fanta breaks down'], alcohol: [78, 'alcohol (the solvent) boils off'], lipobond_agent: [55, 'lipobond agent boils off'],
  };
  const MAKES = { dream_cap_mush: 'dream_cap_extract', nightmare_cap_mush: 'nightmare_extract', methylol: 'fanta' };
  function maxSafeTemp(present, ignore = []) {
    const ids = new Set(present);
    for (const id of present) if (MAKES[id]) ids.add(MAKES[id]);
    let best = null;
    for (const id of ids) if (RUIN[id] && !ignore.includes(id) && (!best || RUIN[id][0] < best.temp)) best = { temp: RUIN[id][0], why: RUIN[id][1] };
    return best;
  }

  return { maxSafeTemp, LIQUIDS, ITEMS, PRODUCTS, GRADES, BLENDER_LOSS, FINISHER_LOSS, grade, run, STEPS, tick, newContainer };
})();

if (typeof module !== 'undefined') module.exports = CHEM;
