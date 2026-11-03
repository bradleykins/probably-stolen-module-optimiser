// Fish (RAS tank) and rat (Animal Cage) growth, from the game's FishSpecies / AquacultureHelper and
// AnimalSpecies / HusbandryHelper. Everything assumes the animal is kept fed (it ages one day per night).

const FISH_PIECES = {
  tilapia: [['Large Fish Fillet', 900, 143], ['Fish Fillet', 400, 57], ['Small Fish Fillet', 200, 26], ['Tiny Fish Fillet', 100, 13]],
  eel: [['Eel Fillet', 500, 136], ['Small Eel Fillet', 250, 68], ['Tiny Fish Fillet', 100, 13]],
};
// stage start days and weights: roe, fry, juvenile, adolescent, adult, elder. From oldAge each night has a 50% death roll.
const FISH = [
  { name: 'Tilapia', start: [0, 1, 3, 5, 8, 13], grams: [0, 0, 50, 200, 450, 600], water: [100, 100, 100, 350, 750, 1000], oldAge: 27, upkeep: 2, conv: 0.9, group: 6, pieces: 'tilapia', note: 'Breeds in the tank (15% a night with a fed adult pair). On a meat diet it ages up to 1.25 days a night.' },
  { name: 'Gutter Tilapia', start: [0, 1, 3, 6, 10, 16], grams: [0, 0, 50, 200, 450, 600], water: [100, 100, 100, 350, 750, 1000], oldAge: 33, upkeep: 2, conv: 0.85, group: 6, pieces: 'tilapia', note: 'Ignores waste, immune to pellet taint, and cleans 0.5 mL of waste per 100 g a night.' },
  { name: 'Graft Tilapia', start: [0, 1, 3, 5, 8, 13], grams: [0, 0, 50, 200, 450, 600], water: [100, 100, 100, 350, 750, 1000], oldAge: 27, upkeep: 2, conv: 0.7, group: 6, pieces: 'tilapia', graft: 200, note: 'Gives 1 Skin Graft (value 24) per full 200 g. Twice as sensitive to waste. Its roe is medical.' },
  { name: 'Eel', start: [0, 0, 0, 5, 10, 18], grams: [0, 0, 150, 600, 1400, 2400], water: [0, 0, 200, 600, 1200, 2000], oldAge: 36, upkeep: 3, conv: 0.9, pieces: 'eel', price: 100, note: 'Bought as a juvenile (100). Does not breed. Eats other fish.' },
  { name: 'Electric Eel', start: [0, 0, 0, 5, 10, 18], grams: [0, 0, 150, 600, 1400, 2400], water: [0, 0, 200, 600, 1200, 2000], oldAge: 36, upkeep: 5.25, conv: 0.75, pieces: 'eel', price: 100, note: 'Bought as a juvenile (100). Makes 1 / 2 / 3 / 3 power a night by stage, so keeping it longer is also a generator.' },
  { name: 'Sturgeon', start: [0, 0, 0, 10, 18, 34], grams: [0, 0, 500, 1500, 3500, 5000], water: [0, 0, 500, 1500, 3000, 4000], oldAge: 80, upkeep: 2, conv: 0.9, pieces: 'tilapia', price: 500, buyAge: 10, sturgeon: true, note: 'Bought as an adolescent (500), always female. Grown for caviar: see below.' },
];
const GROWTH_KCAL_PER_GRAM = 1.2;

const stageAt = (f, age) => { let s = 0; f.start.forEach((d, i) => { if (age >= d) s = i; }); return s; };
// AquacultureHelper.GetWeightAtAge
function fishWeight(f, age) {
  const s = stageAt(f, age);
  if (s >= 5) return f.grams[5];
  const span = f.start[s + 1] - f.start[s];
  if (span <= 0) return f.grams[s];
  const t = Math.min(1, Math.max(0, (age - f.start[s]) / span));
  return Math.round(f.grams[s] + (f.grams[s + 1] - f.grams[s]) * t);
}
// AquacultureHelper.GetExpectedKcalEatenAtAge: what a fully fed fish has eaten by this age (meat is conv x this).
function fishEaten(f, age) {
  let k = f.group ? GROWTH_KCAL_PER_GRAM * f.grams[2] : 0; // its share of the fry group's growth
  for (let i = f.start[2] + 1; i <= age; i++) {
    const w = fishWeight(f, i), up = w / 100 * f.upkeep * (stageAt(f, i) >= 5 ? 0.5 : 1);
    k += up + Math.max(0, w - fishWeight(f, i - 1)) * GROWTH_KCAL_PER_GRAM;
  }
  return k;
}
// AquacultureItems.BreakDownMeat + GetLeftoverScrapKcal: biggest pieces first; 25+ kcal left becomes Fish Scrap.
function fishCuts(kind, kcal) {
  const out = [];
  let value = 0;
  for (const [name, k, v] of FISH_PIECES[kind]) {
    const n = Math.floor(kcal / k);
    if (n) { out.push(`${n} ${name}`); kcal -= n * k; value += n * v; }
  }
  if (kcal >= 25) { out.push(`Fish Scrap (${kcal} kcal)`); value += Math.max(1, Math.round(kcal * 4 / 100)); }
  return { cuts: out.join(', '), value };
}

// One row per age the fish can be culled at. waterNights: mL x nights of tank water it used since it arrived
// (a fry group shares its stage's water between its fish). value: meat and grafts, less the purchase price.
function fishTable(f) {
  const first = f.buyAge ?? f.start[2], rows = [];
  let waterNights = f.group ? f.water.slice(0, 2).reduce((s, w, i) => s + w / f.group * (f.start[i + 1] - f.start[i]), 0) : 0;
  const eaten0 = f.price ? fishEaten(f, first) : 0; // a bought fish arrives with this already in it (SeedKcalEatenForAge)
  for (let age = first; age <= f.oldAge + 2; age++) {
    if (age > first) waterNights += f.water[stageAt(f, age)];
    const w = fishWeight(f, age), eaten = fishEaten(f, age), meat = Math.floor(eaten * f.conv);
    const { cuts, value: meatValue } = fishCuts(f.pieces, meat);
    const grafts = f.graft ? Math.floor(w / f.graft) : 0;
    const value = meatValue + grafts * 24 - (f.price || 0);
    const fed = eaten - eaten0;
    rows.push({ age, stage: stageAt(f, age), weight: w, water: f.water[stageAt(f, age)], fed: Math.round(fed), meat, cuts: cuts + (grafts ? `, ${grafts} Skin Graft` : ''),
      value, perKFeed: fed > 0 ? value / fed * 1000 : 0, perLNight: waterNights > 0 ? value / waterNights * 1000 : 0, risky: age >= f.oldAge });
  }
  return rows;
}

// Rats: stage start days and weights (AnimalSpecies.Rat). Each night: age +1, eat, then grow by the stage's
// grams per day (rounded), times the Growth Rate gene. Last stage: no growth. From day 14 x Longevity, 75% death a night.
const RAT = { start: [0, 1, 3, 5, 11, 14], grams: [5, 50, 200, 350, 450, 400] };
const RAT_CUTS = [['Raw Meat', 400, 1200, 159], ['Small Raw Meat', 200, 550, 65], ['Morsel', 100, 275, 30]];
function ratWeight(age, growth = 1) {
  let w = RAT.grams[0];
  for (let a = 1; a <= age; a++) {
    let s = 0; RAT.start.forEach((d, i) => { if (a >= d) s = i; });
    if (s >= 5) continue;
    const rate = Math.round((RAT.grams[s + 1] - RAT.grams[s]) / (RAT.start[s + 1] - RAT.start[s]) * growth);
    w = Math.max(Math.round(RAT.grams[s] * 0.25), w + rate);
  }
  return w;
}
// HusbandryHelper.CreateButcherCuts: 400 g Raw Meat, 200 g Small Raw Meat, 100 g Morsel, every 50 g started is a Small Morsel.
function ratCuts(grams) {
  const out = [];
  let kcal = 0, value = 0;
  for (const [name, g, k, v] of RAT_CUTS) {
    const n = Math.floor(grams / g);
    if (n) { out.push(`${n} ${name}`); grams -= n * g; kcal += n * k; value += n * v; }
  }
  const small = Math.ceil(grams / 50);
  if (small) { out.push(`${small} Small Morsel`); kcal += small * 140; value += small * 15; }
  return { cuts: out.join(', '), kcal, value };
}
// fed: a newborn starts at 25% of 500 hunger and is topped up to the feeder's target, then eats its Hunger Rate each night.
function ratTable({ growth = 1, hunger = 65, target = 85 } = {}) {
  const rows = [];
  for (let age = 1; age <= 16; age++) {
    const weight = ratWeight(age, growth), c = ratCuts(weight);
    const fed = Math.max(0, 500 * target / 100 - 125) + hunger * age;
    rows.push({ age, weight, ...c, fed, perKFeed: c.kcal / fed, valuePerNight: c.value / age, risky: age >= 14 });
  }
  return rows;
}

const best = (rows, key) => rows.filter(r => !r.risky).reduce((a, r) => (r[key] > a[key] ? r : a));

if (typeof module !== 'undefined') module.exports = { FISH, fishTable, fishWeight, fishEaten, ratTable, ratWeight, ratCuts, best };
