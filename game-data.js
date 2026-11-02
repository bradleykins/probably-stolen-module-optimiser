// Game data extracted from Probably Stolen (Assembly-CSharp.dll + resources.assets, build of 2026-10-31).
// Stats are [Performance, Efficiency, Quality] in whole percent. The game truncates toward zero everywhere.
// Shapes: rows top to bottom, '#' = filled cell. Players can rotate and mirror items.

const trunc = Math.trunc;
const pct = v => (v > 0 ? '+' : '') + v + '%';
// Machine power draw after Efficiency (MachineryHelper/ModuleHelper.ApplyBasicModuleEffect).
const powerUse = (base, bonus) => Math.max(1, base - trunc(base * bonus / 100));
// Progress speed per cycle; some machines only get 1/ratio of Performance.
const speed = (base, P, ratio) => ratio ? trunc(base + trunc(base * P / ratio) / 100) : base + trunc(base * P / 100);

const GAME = {
  // '#' = blocked slot. Standard machines start at stage 0; each Module Bay Expansion Kit opens the next stage.
  bays: {
    standard: [
      { name: 'Starting bay (26 slots)', layout: ['#.....#', '...#...', '..###..', '...#...', '#.....#'] },
      { name: 'Expansion 1 (31 slots)', layout: ['#.....#', '.......', '.......', '.......', '#.....#'] },
      { name: 'Expansion 2 (35 slots)', layout: ['.......', '.......', '.......', '.......', '.......'] },
    ],
    small: [{ name: '4×4 bay (16 slots)', layout: ['....', '....', '....', '....'] }],
  },

  // Random shape a module drops with, and what it does to base stats.
  variants: {
    basic: [
      { name: 'Square', shape: ['##', '##'], mult: 1 },
      { name: 'L', shape: ['###', '..#'], mult: 1 },
      { name: 'T', shape: ['.#', '##', '.#'], mult: 1 },
      { name: 'Corner (×0.75)', shape: ['##', '.#'], mult: 0.75 },
    ],
    advanced: [
      { name: 'Square', shape: ['##', '##'], mult: 1 },
      { name: 'S (×1.25)', shape: ['##', '.#', '##'], mult: 1.25 },
      { name: 'H (×1.25)', shape: ['##', '##', '.#'], mult: 1.25 },
    ],
  },

  // Random module effects (0-2 per module). mult scales base stats; flag changes how placement matters.
  effects: [
    { id: 'MODULE_EFFECT_PREMIUM', name: 'Premium', mult: 1.2 },
    { id: 'MODULE_EFFECT_INFERIOR', name: 'Inferior', mult: 0.8 },
    { id: 'MODULE_EFFECT_OVERVOLTED', name: 'Overcharged', mult: 2, note: '10% chance per use to be ruined' },
    { id: 'MODULE_EFFECT_DEGRADING', name: 'Degrading', mult: 2, note: 'positive stats drop 1 per use: enter current stats' },
    { id: 'MODULE_EFFECT_LEARNING_ALGORITHM', name: 'Learning Algorithm', mult: 1, note: 'positive stats start at 0 and grow: enter current stats' },
    { id: 'MODULE_EFFECT_RECEIVER', name: 'Receiver', flag: 'receiver' },
    { id: 'MODULE_EFFECT_TOP_MOUNT', name: 'Top Mount', flag: 'top' },
    { id: 'MODULE_EFFECT_SIDE_MOUNT', name: 'Side Mount', flag: 'side' },
    { id: 'MODULE_EFFECT_NEGATIVE_FEEDBACK', name: 'Negative Feedback', mult: 1.25, flag: 'feedback' },
  ],

  modules: [
    { name: 'Performance Module', type: 'universal', base: [16, 0, 0], variants: 'basic' },
    { name: 'Efficiency Module', type: 'universal', base: [0, 16, 0], variants: 'basic' },
    { name: 'Quality Module', type: 'universal', base: [0, 0, 8], variants: 'basic' },
    { name: 'Overclock Module', type: 'universal', base: [36, -44, 0], variants: 'advanced' },
    { name: 'Eco Module', type: 'universal', base: [-16, 32, 0], variants: 'advanced' },
    { name: 'Refinement Module', type: 'universal', base: [-8, -15, 25], variants: 'advanced' },
    { name: 'Streamlining Module', type: 'universal', base: [8, 25, -16], shape: ['##', '##'] },
    { name: 'Neural Core Module (Capped)', type: 'universal', base: [100, -100, 50], shape: ['##', '##'] },
    { name: 'Neural Core Module (Uncapped)', type: 'universal', base: [200, -100, 100], shape: ['##', '##'] },
    { name: 'Corrupted Module', type: 'universal', base: [-8, -5, 0], shape: ['##', '##'] },
    { name: 'Ruined Module', type: 'universal', base: [0, 0, 0], shape: ['##', '.#'] },
    { name: 'Blank Module', type: 'universal', base: [0, 0, 0], shape: ['##', '##'] },
    { name: 'Furnace Module (Blast)', type: 'furnace', base: [0, -100, 0], shape: ['#', '#', '#', '#'] },
    { name: 'Furnace Module (Junk Processing)', type: 'furnace', base: [0, 0, 0], shape: ['#', '#', '#', '#'] },
    { name: 'Alarm Transmitter Module', type: 'alarm', base: [0, -50, 0], shape: ['#', '#', '#', '#'] },
    { name: 'Metal Printer Module', type: 'printer', base: [0, -50, 0], shape: ['#', '#', '#', '#'] },
    { name: 'Melee Batch Module', type: 'printer', base: [-50, -50, 0], shape: ['#', '#', '#', '#'] },
    { name: 'Computer Numerical Control Module', type: 'printer', base: [-25, -25, 0], shape: ['#', '#', '#', '#'] },
    { name: 'Evaporator Solvent Recovery Module', type: 'evaporator', base: [0, -25, 50], shape: ['#', '#', '#', '#'] },
    { name: 'Genetic Stabilizer Module', type: 'dna', base: [-50, -25, 0], shape: ['#', '#', '#', '#'] },
    { name: 'Positive Trait Filter Module', type: 'dna', base: [0, -25, 0], shape: ['#', '#', '#', '#'] },
    { name: 'Negative Trait Filter Module', type: 'dna', base: [0, -25, 0], shape: ['#', '#', '#', '#'] },
    { name: 'Precision Extraction Module', type: 'dna', base: [-75, -75, 0], shape: ['#', '#', '#', '#'] },
    { name: 'Hydroponic Smuggler Module', type: 'hydroponic', base: [0, 0, 0], shape: ['#', '#'] },
    { name: 'Hydroreed Filter Hydroponic Module', type: 'hydroponic', base: [0, -15, 0], shape: ['#', '#', '#', '#'] },
    { name: 'Fillerweed Production Hydroponic Module', type: 'hydroponic', base: [0, -25, 0], shape: ['#', '#', '#', '#'] },
    { name: 'Dream Cap Nightmare Hydroponic Module', type: 'hydroponic', base: [-33, -50, 0], shape: ['#', '#'] },
    { name: 'Dream Cap Neutralizer Hydroponic Module', type: 'hydroponic', base: [15, 15, 0], shape: ['#', '#', '#', '#'] },
    { name: 'Nutrifruit Hydroponic Module', type: 'hydroponic', base: [-10, -10, 0], shape: ['#', '#', '#', '#'] },
    { name: 'Kotton Auto Loom Hydroponic Module', type: 'hydroponic', base: [-50, -100, 0], shape: ['#', '#', '#', '#'] },
  ],

  // Nodes have no stats: each is trunc(sum of touching modules' base stats / 5).
  nodes: [
    { name: 'Node (Medium)', shape: ['#', '#'] },
    { name: 'Node (Small)', shape: ['#'] },
  ],

  // stats: what each stat does on this machine. readout(P, E, Q): result lines for a layout.
  // presets: targets to pick from. mins = minimum [P, E, Q] totals (null = none), weights = what to maximise after.
  machines: [
    {
      name: 'Water Purifier', id: 'water_purifier', bay: 'standard', accepts: ['universal'], power: 4,
      stats: 'Quality sets max purity (raw total; the tooltip ratio 0.5 is not used). Performance cleans more per cycle.',
      readout: (P, E, Q) => {
        const steps = [[200, '100%'], [100, '99.9%'], [75, '99.8%'], [50, '99.65%'], [25, '99.35%'], [15, '99.15%']];
        const hit = steps.find(([q]) => Q >= q);
        return [`Max purity: ${hit ? hit[1] : '99%'}`, `Cleaning amount: ${pct(P)} on top of the dirt bonus`, `Power: ${powerUse(4, E)} per cycle`];
      },
      presets: [
        { label: '100% purity (Quality ≥ 200)', mins: [null, null, 200], weights: [1, 0.5, 0] },
        { label: '99.9% purity (Quality ≥ 100)', mins: [null, null, 100], weights: [1, 0.5, 0] },
        { label: '99.8% purity (Quality ≥ 75)', mins: [null, null, 75], weights: [1, 0.5, 0] },
        { label: '99.65% purity (Quality ≥ 50)', mins: [null, null, 50], weights: [1, 0.5, 0] },
        { label: 'Highest Quality', mins: [null, null, null], weights: [0, 0, 1] },
      ],
    },
    {
      name: 'Moisture Farm', id: 'moisture_farm', bay: 'standard', accepts: ['universal'], power: 6,
      stats: 'Quality sets the water grade (raw total + 50). Performance sets output volume.',
      readout: (P, E, Q) => {
        const g = Q + 50;
        const grade = g < 0 ? 'Gutterflow' : g < 50 ? 'Rustwater' : g < 100 ? 'Ghostwater' : g < 150 ? 'Basewater' : g < 200 ? 'High Quality Water' : 'Pure Water';
        return [`Water grade: ${grade}`, `Output: ${Math.max(0, 100 + P)}% of base`, `Power: ${powerUse(6, E)} per cycle`];
      },
      presets: [
        { label: 'Pure Water (Quality ≥ 150)', mins: [null, null, 150], weights: [1, 0.5, 0] },
        { label: 'High Quality Water (Quality ≥ 100)', mins: [null, null, 100], weights: [1, 0.5, 0] },
        { label: 'Basewater (Quality ≥ 50)', mins: [null, null, 50], weights: [1, 0.5, 0] },
        { label: 'Most water (Performance)', mins: [null, null, null], weights: [1, 0.25, 0] },
      ],
    },
    {
      name: 'Furnace', id: 'furnace', bay: 'standard', accepts: ['universal', 'furnace'], power: 8,
      stats: 'Quality: +1 ingot per batch for every 100 (raw total; Blast module takes 1 off). Performance has no effect.',
      readout: (P, E, Q) => [`Extra ingots per batch: ${Math.max(0, trunc(Q / 100))}`, `Power: ${powerUse(8, E)} per cycle`],
      presets: [
        { label: '+2 ingots (Quality ≥ 200)', mins: [null, null, 200], weights: [0, 1, 0] },
        { label: '+1 ingot (Quality ≥ 100)', mins: [null, null, 100], weights: [0, 1, 0] },
        { label: 'Highest Quality', mins: [null, null, null], weights: [0, 0.1, 1] },
      ],
    },
    {
      name: 'Evaporator', id: 'evaporator', bay: 'small', accepts: ['universal', 'evaporator'], power: 6,
      stats: 'Quality = % of evaporated liquid recovered as distillate (0-100). Performance = amount per cycle.',
      readout: (P, E, Q) => [`Distillate recovered: ${Math.min(100, Math.max(0, Q))}%`, `Amount per cycle: ${Math.max(0, 100 + P)}%`, `Power: ${powerUse(6, E)} per cycle`],
      presets: [
        { label: 'Full recovery (Quality ≥ 100)', mins: [null, null, 100], weights: [1, 0.5, 0] },
        { label: 'Fastest (Performance)', mins: [null, null, null], weights: [1, 0.25, 0] },
      ],
    },
    {
      name: 'Mirage Projector', id: 'mirage_projector', bay: 'standard', accepts: ['universal'], power: 16,
      stats: 'Attractiveness = 100% + Quality/2 + Performance/4.',
      readout: (P, E, Q) => [`Attractiveness: ${Math.max(0, 100 + trunc(Q / 2) + trunc(P / 4))}%`, `Power: ${powerUse(16, E)} per cycle`],
      presets: [{ label: 'Most attractive', mins: [null, null, null], weights: [0.25, 0.05, 0.5] }],
    },
    {
      name: 'Alarm System', id: 'security_alarm', bay: 'standard', accepts: ['universal', 'alarm'], power: 4,
      stats: 'Theft prevention = 50% + Performance. Quality has no effect.',
      readout: (P, E) => [`Theft prevention: ${Math.max(0, P + 50)}%`, `Power: ${powerUse(4, E)} per cycle`],
      presets: [
        { label: '100% theft prevention (Performance ≥ 50)', mins: [50, null, null], weights: [0, 1, 0] },
        { label: 'Most Performance', mins: [null, null, null], weights: [1, 0.1, 0] },
      ],
    },
    {
      name: 'Cryptographic Desequencer', id: 'desequencer', progress: { base: 33 }, jobs: [['Command keycard', 150], ['Security keycard', 125], ['Medical keycard', 100], ['Engineering keycard', 100], ['Supply keycard', 75], ['Service keycard', 75]], bay: 'standard', accepts: ['universal', 'alarm'], power: 10,
      stats: 'Performance = progress per cycle (base 33). Quality has no effect.',
      readout: (P, E) => [`Progress per cycle: ${speed(33, P)}`, `Power: ${powerUse(10, E)} per cycle`],
      presets: [{ label: 'Fastest', mins: [null, null, null], weights: [1, 0.25, 0] }],
    },
    {
      name: 'DNA Manipulator', id: 'plant_dna_manipulator', progress: { base: 10, ratio: 2 }, jobs: [['Complexity 0', 20], ['Complexity 1', 24], ['Complexity 2', 28], ['Complexity 3', 32], ['Complexity 4', 36], ['Complexity 5', 40], ['Complexity 6', 44]], bay: 'standard', accepts: ['universal', 'dna'], power: 12,
      stats: 'Success chance = 95% − 5% × complexity + Quality/2. Performance/2 speeds progress (base 10).',
      readout: (P, E, Q) => [`Success chance bonus: ${pct(trunc(Q / 2))}`, `Progress per cycle: ${speed(10, P, 2)}`, `Power: ${powerUse(12, E)} per cycle`],
      presets: [
        { label: '+50% success (Quality ≥ 100)', mins: [null, null, 100], weights: [1, 0.5, 0] },
        { label: '+25% success (Quality ≥ 50)', mins: [null, null, 50], weights: [1, 0.5, 0] },
        { label: 'Highest Quality', mins: [null, null, null], weights: [0.1, 0.05, 1] },
      ],
    },
    {
      name: 'Hydroponic System', id: 'hydroponic', progress: { base: 8, ratio: 2 }, jobs: [['Fillerweed', 11], ['Hydroreed', 18], ['Bloomberry', 18], ['Coffee', 21], ['Nutrifruit', 23], ['Dream Cap', 28], ['Kotton', 32]], bay: 'standard', accepts: ['universal', 'hydroponic'], power: 8,
      stats: 'Quality/2 = % more harvest. Performance/2 speeds growth (base 8 per cycle).',
      readout: (P, E, Q) => [`Harvest: ${pct(trunc(Q / 2))}`, `Growth per cycle: ${speed(8, P, 2)}`, `Power: ${powerUse(8, E)} per cycle`],
      presets: [
        { label: 'Double harvest (Quality ≥ 200)', mins: [null, null, 200], weights: [1, 0.5, 0] },
        { label: '+50% harvest (Quality ≥ 100)', mins: [null, null, 100], weights: [1, 0.5, 0] },
        { label: 'Balanced', mins: [null, null, null], weights: [1, 0.25, 1] },
      ],
    },
    {
      name: '3D Printer', id: 'printer', progress: { base: 24 }, jobs: [['Small Plastic Bottle x6', 10], ['Improved Internal Springs x4', 20], ['Makeshift RDS x4', 20], ['Toy Laser Pointer x4', 20], ['RDS x2', 24], ['Laser Sight x2', 24], ['Silencer x2', 24], ['.22 Mag x2', 24], ['Gun Part x3', 30], ['Box Cutter x3', 34], ['.22 Mag High x2', 36], ['10mm Mag x2', 36], ['.22 Mag Ext x2', 48], ['10mm Mag High', 48], ['.22 Pistol', 50], ['.22 Pistol x2', 60], ['10mm Mag Ext', 60], ['Nestfire Compact Frame', 60], ['Kitchen Knife x4', 64], ['Ironcraft 10 Frame', 70], ['Hatchet x4', 75], ['Meat Cleaver x4', 82], ['Combat Knife x5', 98], ['Combat Machete x3', 120]], bay: 'standard', accepts: ['universal', 'printer'], power: 8,
      stats: 'Quality/4 = print quality (melee condition roll 20-30 + Quality/4: Good at 60, Excellent at 90). Performance = progress (base 24).',
      readout: (P, E, Q) => {
        const q = trunc(Q / 4);
        return [`Print quality bonus: ${pct(q)}`, `Melee condition roll: ${20 + q}-${30 + q} (Good 60+, Excellent 90+)`, `Progress per cycle: ${speed(24, P)}`, `Power: ${powerUse(8, E)} per cycle`];
      },
      presets: [
        { label: 'Always Excellent melee (Quality ≥ 280)', mins: [null, null, 280], weights: [1, 0.5, 0] },
        { label: 'Always Good melee (Quality ≥ 160)', mins: [null, null, 160], weights: [1, 0.5, 0] },
        { label: 'Fastest', mins: [null, null, null], weights: [1, 0.25, 0] },
      ],
    },
    {
      name: 'Deal Maker', id: 'deal_maker', bay: 'standard', accepts: ['universal'], power: 25,
      stats: 'Chance bonus = 10% + Quality/10. Both Efficiency and Performance lower power use.',
      readout: (P, E, Q) => [`Chance increase: ${Math.max(0, 10 + trunc(Q / 10))}%`, `Power: ${powerUse(25, E + P)} per cycle`],
      presets: [{ label: 'Best chance', mins: [null, null, null], weights: [0.05, 0.05, 1] }],
    },
  ],
  notOptimised: 'Blender, Heating Plate and Chem Finisher only take the Chemical Equipment Module, which has no stats.',
};

// Progress machines run once per night. Work done per night at a Performance total, and the
// lowest Performance that finishes `work` within `nights` (null if out of reach).
GAME.speedOf = (m, P) => speed(m.progress.base, P, m.progress.ratio);
GAME.nightsFor = (m, P, work) => { const s = GAME.speedOf(m, P); return s > 0 ? Math.ceil(work / s) : Infinity; };
GAME.minPerformance = (m, work, nights) => {
  const need = Math.ceil(work / Math.max(1, nights));
  for (let P = -100; P <= 2000; P++) if (GAME.speedOf(m, P) >= need) return P;
  return null;
};

if (typeof module !== 'undefined') module.exports = GAME;
