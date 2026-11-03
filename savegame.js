// Reads a Probably Stolen save (save_0.es3): the modules and nodes you own, and your machines.
// The save is Easy Save 3 text. Game items sit inside it as JSON strings, sometimes nested.

function readSaveItems(text) {
  const items = new Map(); // uniqueId -> item, so an item seen twice counts once
  function walk(o) {
    if (!o || typeof o !== 'object') return;
    if (typeof o.identifier === 'string' && Array.isArray(o._keys)) items.set(o.uniqueId, o);
    for (const v of Object.values(o)) {
      if (typeof v !== 'string') walk(v);
      else if (v.length > 50 && v.includes('"identifier"')) parseOrScan(v);
    }
  }
  function parseOrScan(s) {
    let o;
    try { o = JSON.parse(s); } catch { return scan(s); }
    walk(o);
  }
  // The outer file is not strict JSON, so look for string literals that hold item JSON.
  function scan(s) {
    const re = /"((?:[^"\\]|\\.)*)"/g;
    for (let m; (m = re.exec(s));) {
      if (m[1].length < 50 || !m[1].includes('identifier')) continue;
      let inner;
      try { inner = JSON.parse('"' + m[1] + '"'); } catch { continue; }
      parseOrScan(inner);
    }
  }
  scan(text);
  return [...items.values()];
}

const saveTag = (o, k) => o._values[o._keys.indexOf(k)];
const saveInt = (o, k) => (o._keys.includes(k) ? saveTag(o, k).valueInt : 0);
const saveStr = (o, k) => (o._keys.includes(k) ? saveTag(o, k).internalValueString : '');
const isModuleItem = o => (o.itemTypes || []).includes('NODE') || o._keys.includes('MODULE_TAG');

// One module or node item as an optimiser entry (without count).
function moduleEntry(o, effects) {
  const sh = o.itemShape, w = sh['<width>k__BackingField'];
  const cells = sh.data.flatMap((v, i) => (v ? [[Math.floor(i / w), i % w]] : []));
  if ((o.itemTypes || []).includes('NODE')) return { name: o.name, cells, base: [0, 0, 0], node: true };
  const effs = ['MODULE_EFFECT1_TAG', 'MODULE_EFFECT2_TAG'].map(k => effects.find(e => e.id === saveStr(o, k))).filter(Boolean);
  const m = {
    name: o.name + (effs.length ? ' · ' + effs.map(e => e.name).join(', ') : '') + (o._keys.includes('MODULE_STUCK_TAG') ? ' (stuck in a machine)' : ''),
    type: saveStr(o, 'MODULE_TYPE').replace('MODULE_TYPE_', '').toLowerCase().replace('dna_manipulator', 'dna') || 'universal',
    cells,
    // BONUS_* is the module's current base, already including shape, Premium, Learning Algorithm progress, etc.
    base: ['PERFORMANCE', 'EFFICIENCY', 'QUALITY'].map(s => saveInt(o, `BONUS_PERCENTAGE_${s}_INT`)),
  };
  for (const e of effs) if (e.flag) m[e.flag] = true;
  // Learning Algorithm: each positive stat starts at 0 and grows +1 per machine cycle up to 2x the module's
  // stat (ModuleEffectHelper.InitLearningAlgo / OnUsedLearningAlgo). learnMax = those caps.
  const learnMax = ['PERFORMANCE', 'EFFICIENCY', 'QUALITY'].map(s => saveInt(o, `LEARNING_ALGO_MAX_${s}_INT`));
  if (learnMax.some(v => v > 0)) m.learnMax = learnMax;
  return m;
}

// Bay cell indexes an installed item covers. data is the unrotated shape; orientation/flipped
// are applied as in the game's GridShape.ForwardTransform, then offset by minX/minY.
function placedCells(s, cols) {
  const w = s['<width>k__BackingField'], h = s.data.length / w, o = s['<orientation>k__BackingField'] % 4;
  const x0 = s['<minX>k__BackingField'], y0 = s['<minY>k__BackingField'], out = [];
  s.data.forEach((v, i) => {
    if (!v) return;
    let lx = i % w, ly = Math.floor(i / w);
    if (s['<flipped>k__BackingField']) lx = w - 1 - lx;
    const [x, y] = o === 1 ? [ly, w - 1 - lx] : o === 2 ? [w - 1 - lx, h - 1 - ly] : o === 3 ? [h - 1 - ly, lx] : [lx, ly];
    out.push((y0 + y) * cols + x0 + x);
  });
  return out;
}

// Returns {modules, machines}.
// modules: owned modules and nodes, identical ones grouped: {...entry, count, where: {machineUid: n}}.
// machines: those GAME knows: {uid, gameIndex, name, stage, totals, job, installed: [{module, cells}]}.
function readSave(text, GAME) {
  const items = readSaveItems(text);
  const byUuid = new Map(items.map(o => [o.uuid, o]));

  const machines = [], placeOf = new Map(); // module uniqueId -> machine uid
  for (const o of items) {
    const gameIndex = GAME.machines.findIndex(m => m.id === o.identifier);
    if (gameIndex < 0 || !o._keys.includes('IS_OWNED_TAG') && !o._keys.includes('IMPORTANT_TAG')) continue;
    const gm = GAME.machines[gameIndex];
    const cols = GAME.bays[gm.bay][0].layout[0].length;
    // Machine windows list power first, then the module bay: bay items have inventory index 3.
    // (The 3D Printer keeps spare modules in its chip storage, index 4; those are not installed.)
    const bayItems = (o.childItems || []).filter((u, i) => (o.childItemInventoryNode || [])[i] === 3);
    const installed = bayItems.map(u => byUuid.get(u)).filter(c => c && isModuleItem(c)).map(c => {
      placeOf.set(c.uniqueId, o.uniqueId);
      return { module: moduleEntry(c, GAME.effects), cells: placedCells(c.itemModifiedShape, cols) };
    });
    const job = o._keys.includes('MACHINE_PROGRESS_TARGET_TAG') && saveStr(o, 'MACHINE_STATE_TAG') === 'STATE_WORKING'
      ? { current: saveInt(o, 'MACHINE_PROGRESS_CURRENT_TAG'), target: saveInt(o, 'MACHINE_PROGRESS_TARGET_TAG'), label: saveStr(o, 'DESEQUENCER_TARGET_ID_TAG').replace(/_/g, ' ') }
      : null;
    machines.push({
      uid: o.uniqueId, gameIndex, name: `${o.name} #${o.uniqueId}`,
      stage: Math.min(saveInt(o, 'MODULE_UPGRADE_STAGE_INT'), GAME.bays[gm.bay].length - 1),
      totals: ['PERFORMANCE', 'POWER', 'QUALITY'].map(s => saveInt(o, `TOTAL_PERCENTAGE_${s}_BONUS_INT`)),
      job, installed,
    });
  }

  const groups = new Map();
  for (const o of items) {
    if (!o._keys.includes('IS_OWNED_TAG') || !isModuleItem(o)) continue;
    const m = moduleEntry(o, GAME.effects), key = JSON.stringify(m);
    if (!groups.has(key)) groups.set(key, { ...m, count: 0, where: {} });
    const g = groups.get(key), at = placeOf.get(o.uniqueId) || 0;
    g.count++;
    g.where[at] = (g.where[at] || 0) + 1;
  }
  const modules = [...groups.values()].sort((a, b) => !!a.node - !!b.node || a.name.localeCompare(b.name));

  // Owned seeds, grouped by plant + trait ranks + genetic heat. Trait ids as the game stores them (PLANT_TRAIT_<ID>).
  const seedGroups = new Map();
  for (const o of items) {
    if (!o._keys.includes('SEED_ITEM_TAG') || !o._keys.includes('IS_OWNED_TAG')) continue;
    const ranks = {};
    for (const k of o._keys) if (k.startsWith('PLANT_TRAIT_') && saveInt(o, k) > 0) ranks[k.slice(12).toLowerCase()] = saveInt(o, k);
    const s = { plant: saveStr(o, 'PLANT_ID_STRING') || o.identifier, ranks, heat: saveInt(o, 'GENETIC_HEAT_INT') };
    const key = JSON.stringify(s);
    if (!seedGroups.has(key)) seedGroups.set(key, { ...s, count: 0 });
    seedGroups.get(key).count += o.unitCount || 1;
  }
  // DNA: traits on your written disks, and the trait each Precision Extraction module copied from a disk.
  const owned = items.filter(o => o._keys.includes('IS_OWNED_TAG'));
  const disks = owned.map(o => saveStr(o, 'DNA_DISK_TRAIT_STRING')).filter(Boolean);
  const precision = owned.map(o => saveStr(o, 'DNA_PRECISION_TRAIT_STRING')).filter(Boolean);
  return { modules, machines, seeds: [...seedGroups.values()], disks, precision };
}

// Modules only, for the single-machine page.
function readSaveModules(text, effects) {
  return readSave(text, { machines: [], bays: {}, effects }).modules.map(({ where, ...m }) => m);
}

if (typeof module !== 'undefined') module.exports = { readSave, readSaveModules };
