// Reads the modules and nodes you own from a Probably Stolen save (save_0.es3).
// The save is Easy Save 3 text. Game items sit inside it as JSON strings, sometimes nested.
// Returns module entries for the optimiser, identical items grouped with a count.
function readSaveModules(text, effects) {
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

  const groups = new Map();
  for (const o of items.values()) {
    const node = (o.itemTypes || []).includes('NODE');
    if (!o._keys.includes('IS_OWNED_TAG') || (!node && !o._keys.includes('MODULE_TAG'))) continue;
    const tag = k => o._values[o._keys.indexOf(k)];
    const int = k => (o._keys.includes(k) ? tag(k).valueInt : 0);
    const str = k => (o._keys.includes(k) ? tag(k).internalValueString : '');
    const sh = o.itemShape, w = sh['<width>k__BackingField'];
    const cells = sh.data.flatMap((v, i) => (v ? [[Math.floor(i / w), i % w]] : []));
    const effs = ['MODULE_EFFECT1_TAG', 'MODULE_EFFECT2_TAG'].map(k => effects.find(e => e.id === str(k))).filter(Boolean);
    const m = node
      ? { name: o.name, cells, base: [0, 0, 0], count: 0, node: true }
      : {
          name: o.name + (effs.length ? ' · ' + effs.map(e => e.name).join(', ') : '') + (o._keys.includes('MODULE_STUCK_TAG') ? ' (stuck in a machine)' : ''),
          type: str('MODULE_TYPE').replace('MODULE_TYPE_', '').toLowerCase().replace('dna_manipulator', 'dna') || 'universal',
          cells,
          // BONUS_* is the module's current base, already including shape, Premium, Learning Algorithm progress, etc.
          base: ['PERFORMANCE', 'EFFICIENCY', 'QUALITY'].map(s => int(`BONUS_PERCENTAGE_${s}_INT`)),
          count: 0,
        };
    for (const e of effs) if (e.flag) m[e.flag] = true;
    const key = JSON.stringify(m);
    if (!groups.has(key)) groups.set(key, m);
    groups.get(key).count++;
  }
  return [...groups.values()].sort((a, b) => !!a.node - !!b.node || a.name.localeCompare(b.name));
}

if (typeof module !== 'undefined') module.exports = readSaveModules;
