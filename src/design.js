/* Deterministic combinatorial experiment design for I.DOT Plate Studio. No dependencies. */
(function (root, factory) {
  const api = factory(typeof module === 'object' && module.exports ? require('./core.js') : root.IDotCore);
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.IDotDesign = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function (C) {
  'use strict';
  function assert(ok, message) { if (!ok) throw new Error(message); }
  function seededRandom(seed) {
    let h = 2166136261 >>> 0;
    for (const c of String(seed)) { h ^= c.charCodeAt(0); h = Math.imul(h, 16777619); }
    return function () { h += 0x6D2B79F5; let t = h; t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  }
  function shuffle(a, random) {
    for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
    return a;
  }
  function positiveInteger(value, name, zeroAllowed) {
    const n = Number(value);
    assert(Number.isSafeInteger(n) && (zeroAllowed ? n >= 0 : n > 0), name + ' must be ' + (zeroAllowed ? 'a nonnegative' : 'a positive') + ' integer.');
    return n;
  }
  function positiveNumber(value, name, zeroAllowed) {
    const n = Number(value);
    assert(String(value).trim() !== '' && Number.isFinite(n) && (zeroAllowed ? n >= 0 : n > 0), name + ' must be ' + (zeroAllowed ? 'a nonnegative' : 'a positive') + ' finite number.');
    return n;
  }
  function parseLevels(value, name) {
    const pieces = Array.isArray(value) ? value : String(value).split(',');
    assert(pieces.length >= 2 && pieces.length <= 5, name + ': specify 2–5 distinct comma-separated levels.');
    const levels = pieces.map(item => positiveNumber(item, name + ' dose level', true));
    assert(new Set(levels).size === levels.length, name + ': dose levels must be distinct.');
    return levels;
  }
  function parseReserved(text, format) {
    const selected = new Set();
    const str = String(text || '').trim();
    if (!str) return selected;
    for (const entry of str.split(/[;,\s]+/).filter(Boolean)) {
      const parts = entry.split(':');
      assert(parts.length <= 2, 'Invalid reserved-well range: ' + entry);
      const first = C.parseWell(parts[0], format);
      if (parts.length === 1) { selected.add(first.name); continue; }
      const last = C.parseWell(parts[1], format);
      for (let r = Math.min(first.row, last.row); r <= Math.max(first.row, last.row); r++) {
        for (let col = Math.min(first.col, last.col); col <= Math.max(first.col, last.col); col++) selected.add(C.rowName(r) + (col + 1));
      }
    }
    return selected;
  }
  function normalizeConfig(raw) {
    assert(raw && typeof raw === 'object', 'Experimental design configuration is missing.');
    const mode = String(raw.mode || 'subset');
    assert(['full', 'subset', 'replicates'].includes(mode), 'Choose full factorial, balanced subset, or randomized replicates.');
    const targetFormat = Number(raw.targetFormat || 96), sourceFormat = Number(raw.sourceFormat || 96);
    C.formatInfo(targetFormat); assert([96,384].includes(sourceFormat), 'Source plate format must be 96 or 384.');
    const doseMode = raw.doseMode || 'concentration';
    assert(['concentration', 'volume'].includes(doseMode), 'Dose mode must be concentration or volume.');
    // Backwards compatibility: v2/v3 projects did not record a volume basis.
    const volumeBasis = raw.volumeBasis || 'final';
    assert(['final', 'starting'].includes(volumeBasis), 'Volume basis must be fixed final volume or fixed starting medium.');
    const finalVolume = positiveNumber(raw.finalVolume, 'Final volume');
    const maxWellVolume = raw.maxWellVolume === undefined || raw.maxWellVolume === null || String(raw.maxWellVolume).trim() === ''
      ? null : positiveNumber(raw.maxWellVolume, 'Maximum destination well volume');
    const stockMicMultiple = raw.stockMicMultiple === undefined || raw.stockMicMultiple === null || String(raw.stockMicMultiple).trim() === ''
      ? null : positiveNumber(raw.stockMicMultiple, 'Stock multiple of MIC');
    const unit = String(raw.unit || 'µM').trim();
    assert(/^[a-zA-Zµμ/%0-9 ._-]{1,24}$/.test(unit), 'Use a short concentration unit without punctuation or line breaks.');
    assert(Array.isArray(raw.compounds) && raw.compounds.length >= 1 && raw.compounds.length <= 12, 'Provide 1–12 compounds.');
    const compounds = raw.compounds.map((item, i) => {
      const name = C.makeTask({ source: item.source, target: 'A1', volume: 1, liquid: item.name }, sourceFormat, targetFormat).liquid;
      const source = C.parseWell(item.source, sourceFormat).name;
      const stock = doseMode === 'concentration' ? positiveNumber(item.stock, name + ' stock concentration') : Number(item.stock) || 1;
      const levels = parseLevels(item.levels, name);
      if (doseMode === 'concentration') assert(levels.every(v => v <= stock), name + ': a target concentration exceeds its stock concentration.');
      else if (volumeBasis === 'final') assert(levels.every(v => v <= finalVolume), name + ': a dispense volume exceeds final volume.');
      return { name, source, stock, levels };
    });
    assert(new Set(compounds.map(c => c.name.toLowerCase())).size === compounds.length, 'Compound names must be unique.');
    assert(new Set(compounds.map(c => c.source)).size === compounds.length, 'Each compound needs its own source well.');
    const reserved = [...parseReserved(raw.reserved || '', targetFormat)];
    const capacity = C.allWells(targetFormat).length - reserved.length;
    assert(capacity > 0, 'No target wells remain after reserving wells.');
    const subsetSize = positiveInteger(raw.subsetSize ?? 96, 'Subset size');
    const uniqueCount = positiveInteger(raw.uniqueCount ?? 24, 'Unique combination count');
    const replicates = positiveInteger(raw.replicates ?? 3, 'Replicates');
    const totalPossible = compounds.reduce((n, c) => n * c.levels.length, 1);
    const sampleCount = mode === 'full' ? totalPossible : mode === 'subset' ? subsetSize : uniqueCount * replicates;
    assert(sampleCount <= 25000, 'This design exceeds 25,000 assignments. Reduce the factorial or split your experiment.');
    if (mode === 'subset') assert(subsetSize <= totalPossible, 'A no-replacement subset cannot exceed ' + totalPossible + ' unique combinations.');
    if (mode === 'replicates') assert(uniqueCount <= totalPossible, 'Unique combinations cannot exceed ' + totalPossible + '.');
    assert(Math.ceil(sampleCount / capacity) <= 200, 'This design exceeds 200 plates. Change the plate format or reduce the design.');
    const minTransfer = positiveNumber(raw.minTransfer ?? 0.008, 'Minimum dispense volume');
    const maxTransfer = positiveNumber(raw.maxTransfer ?? 30, 'Maximum dispense volume');
    assert(minTransfer <= maxTransfer, 'The minimum transfer must be no larger than the maximum.');
    const sourceCapacity = positiveNumber(raw.sourceCapacity ?? 80, 'Source-well usable volume', true);
    const addDiluent = !!raw.addDiluent;
    assert(volumeBasis !== 'starting' || !addDiluent,
      'Fixed starting medium mode must not add a diluent top-up; uncheck Include top-up/diluent.');
    const diluentSource = C.parseWell(raw.diluentSource || 'H12', sourceFormat).name;
    const diluentName = C.makeTask({ source: diluentSource, target: 'A1', volume: 1, liquid: raw.diluentName || 'Diluent' }, sourceFormat, targetFormat).liquid;
    if (addDiluent) {
      assert(!compounds.some(c => c.source === diluentSource), 'Diluent source well must differ from compound source wells.');
      assert(!compounds.some(c => c.name.toLowerCase() === diluentName.toLowerCase()), 'Diluent liquid name must differ from compound names.');
    }
    return { mode, targetFormat, sourceFormat, doseMode, volumeBasis, finalVolume,
      maxWellVolume, stockMicMultiple, unit, compounds, reserved: reserved.sort(),
      subsetSize, uniqueCount, replicates, sampleCount, totalPossible, capacity,
      seed: String(raw.seed ?? '1701'), addDiluent, diluentSource, diluentName, minTransfer, maxTransfer, sourceCapacity };
  }
  function enumerate(compounds) {
    let results = [[]];
    for (const comp of compounds) {
      const next = [];
      for (const combo of results) for (let level = 0; level < comp.levels.length; level++) next.push([...combo, level]);
      results = next;
    }
    return results.map((indices, i) => ({ id: i + 1, indices }));
  }
  function balancedPick(pool, count, compounds, random) {
    if (count === pool.length) return shuffle(pool.slice(), random);
    // Greedy minimum imbalance on main-effect levels, with mild pairwise-level coverage weighting.
    const selected = [], remaining = shuffle(pool.slice(), random);
    const single = compounds.map(c => Array(c.levels.length).fill(0));
    const pairs = [];
    for (let i = 0; i < compounds.length; i++) for (let j = i + 1; j < compounds.length; j++) {
      pairs.push({ i, j, counts: Array(compounds[i].levels.length * compounds[j].levels.length).fill(0), nJ: compounds[j].levels.length });
    }
    for (let n = 0; n < count; n++) {
      let best = Infinity, choice = -1;
      // Sampling large pools prevents quadratic runtimes without sacrificing seeded reproducibility.
      const cap = Math.min(remaining.length, 640);
      const start = remaining.length <= cap ? 0 : Math.floor(random() * remaining.length);
      for (let z = 0; z < cap; z++) {
        const at = (start + z) % remaining.length;
        const indices = remaining[at].indices;
        let score = 0;
        for (let i = 0; i < single.length; i++) score += 2 * single[i][indices[i]] + 1;
        for (const p of pairs) score += 0.26 * (2 * p.counts[indices[p.i] * p.nJ + indices[p.j]] + 1);
        if (score < best - 1e-10) { best = score; choice = at; }
      }
      const picked = remaining.splice(choice, 1)[0]; selected.push(picked);
      picked.indices.forEach((index, i) => single[i][index]++);
      for (const p of pairs) p.counts[picked.indices[p.i] * p.nJ + picked.indices[p.j]]++;
    }
    return shuffle(selected, random);
  }
  function makeAssignments(config, random) {
    const pool = enumerate(config.compounds);
    if (config.mode === 'full') return shuffle(pool, random).map(c => ({ ...c, replicate: 1 }));
    const count = config.mode === 'subset' ? config.subsetSize : config.uniqueCount;
    const subset = balancedPick(pool, count, config.compounds, random);
    if (config.mode === 'subset') return subset.map(c => ({ ...c, replicate: 1 }));
    const result = [];
    for (const c of subset) for (let replicate = 1; replicate <= config.replicates; replicate++) result.push({ ...c, replicate });
    return shuffle(result, random);
  }
  function calculateVolumes(config, indices) {
    const doses = [], volumes = [];
    for (let i = 0; i < indices.length; i++) {
      const comp = config.compounds[i], dose = comp.levels[indices[i]];
      const volume = config.doseMode === 'concentration' ? dose * config.finalVolume / comp.stock : dose;
      assert(Number.isFinite(volume), 'Non-finite volume for ' + comp.name);
      doses.push(dose); volumes.push(volume);
    }
    const compoundTotal = volumes.reduce((a, b) => a + b, 0);
    const startingMedium = config.volumeBasis === 'starting' ? config.finalVolume : 0;
    if (config.volumeBasis === 'final') {
      assert(compoundTotal <= config.finalVolume + 1e-9,
        'Sum of compound volumes (' + C.numberText(compoundTotal) + ' µL) exceeds the final volume (' + config.finalVolume + ' µL). Reduce levels or use more concentrated stocks.');
    }
    // In starting-medium mode, the media is already present and MUST NOT be topped up.
    const topUp = config.volumeBasis === 'starting' ? 0 : Math.max(0, config.finalVolume - compoundTotal);
    const actualFinalVolume = startingMedium + compoundTotal + topUp;
    if (config.maxWellVolume !== null) {
      assert(actualFinalVolume <= config.maxWellVolume + 1e-9,
        'Expected well volume (' + C.numberText(actualFinalVolume) + ' µL) exceeds the configured physical well limit (' +
        C.numberText(config.maxWellVolume) + ' µL). Verify the target labware and headspace.');
    }
    // Calculated concentrations refer to the final mixture, not just starting media.
    const actualDoses = config.doseMode === 'concentration'
      ? config.compounds.map((c, i) => c.stock * volumes[i] / actualFinalVolume) : null;
    const targetMicMultiples = config.doseMode === 'concentration' && config.stockMicMultiple !== null
      ? config.compounds.map((c, i) => doses[i] * config.stockMicMultiple / c.stock) : null;
    const actualMicMultiples = actualDoses && config.stockMicMultiple !== null
      ? config.compounds.map((c, i) => actualDoses[i] * config.stockMicMultiple / c.stock) : null;
    return { doses, volumes, compoundTotal, topUp, startingMedium, actualFinalVolume,
      actualDoses, targetMicMultiples, actualMicMultiples };
  }
  function generateDesign(raw) {
    const config = normalizeConfig(raw), random = seededRandom(config.seed);
    const selected = makeAssignments(config, random);
    const available = C.allWells(config.targetFormat).filter(w => !config.reserved.includes(w));
    const plateCount = Math.ceil(selected.length / available.length);
    const plates = [];
    const warnings = [];
    let cursor = 0;
    for (let index = 0; index < plateCount; index++) {
      const wells = shuffle(available.slice(), random);
      const assignments = [], tasks = [];
      while (cursor < selected.length && assignments.length < wells.length) {
        const entry = selected[cursor++], well = wells[assignments.length];
        const v = calculateVolumes(config, entry.indices);
        v.volumes.forEach((volume, i) => {
          if (volume === 0) return;
          assert(volume >= config.minTransfer - 1e-12, 'Plate ' + (index+1) + ' ' + well + ': ' + config.compounds[i].name + ' needs ' + C.numberText(volume) + ' µL, below configured minimum ' + config.minTransfer + ' µL. Dilute stock or raise target dose.');
          assert(volume <= config.maxTransfer + 1e-9, 'Plate ' + (index+1) + ' ' + well + ': ' + config.compounds[i].name + ' exceeds the configured maximum per dispense.');
          tasks.push(C.makeTask({ source: config.compounds[i].source, target: well, volume, liquid: config.compounds[i].name }, config.sourceFormat, config.targetFormat));
        });
        if (config.addDiluent && v.topUp > 1e-10) {
          assert(v.topUp >= config.minTransfer - 1e-12 && v.topUp <= config.maxTransfer + 1e-9,
            'Plate ' + (index+1) + ' ' + well + ': diluent volume ' + C.numberText(v.topUp) + ' µL is outside the configured dispense limits.');
          tasks.push(C.makeTask({ source: config.diluentSource, target: well, volume: v.topUp, liquid: config.diluentName }, config.sourceFormat, config.targetFormat));
        }
        assignments.push({ plate: index + 1, well, combinationId: entry.id, replicate: entry.replicate,
          indices: entry.indices.slice(), doses: v.doses, volumes: v.volumes,
          startingMedium: v.startingMedium, actualFinalVolume: v.actualFinalVolume,
          actualDoses: v.actualDoses, targetMicMultiples: v.targetMicMultiples,
          actualMicMultiples: v.actualMicMultiples,
          compoundTotal: v.compoundTotal, diluentVolume: config.addDiluent ? v.topUp : 0,
          externalTopUp: config.addDiluent ? 0 : v.topUp, finalVolume: v.actualFinalVolume });
      }
      const sourceTotals = C.totals(tasks).sources;
      if (config.sourceCapacity > 0) for (const [source, dispensed] of Object.entries(sourceTotals)) {
        assert(dispensed <= config.sourceCapacity + 1e-9,
          'Plate ' + (index + 1) + ': source ' + source + ' requires ' + C.numberText(dispensed) + ' µL, exceeding the configured ' + config.sourceCapacity + ' µL usable source volume (before dead volume).');
      }
      plates.push({ number: index + 1, assignments, tasks, reserved: config.reserved.slice() });
    }
    if (config.volumeBasis === 'starting') {
      warnings.push('Each well already contains ' + C.numberText(config.finalVolume) +
        ' µL starting medium. No top-up is generated. Final well volumes and actual concentrations include all planned compound additions; confirm labware capacity and headspace.');
    } else if (!config.addDiluent) {
      warnings.push('The I.DOT tasks omit the per-well external top-up. Add the manifest’s external_top_up_uL with a separate validated step to reach final volume and intended concentrations.');
    }
    if (config.volumeBasis === 'starting' && config.doseMode === 'concentration')
      warnings.push('Target concentrations are nominal relative to the starting medium; actual concentrations are lower after pooled compound additions.');
    if (config.sourceCapacity > 0) warnings.push('Source consumption checks exclude dead volume, priming, and extra instrument requirements.');
    return { version: 1, config, plates, warnings, summary: summarize(config, plates) };
  }
  function summarize(config, plates) {
    const counts = config.compounds.map(c => c.levels.map(() => 0));
    const pairCounts = [];
    for (let i = 0; i < config.compounds.length; i++) for (let j = i + 1; j < config.compounds.length; j++) {
      pairCounts.push({ a: i, b: j, cells: new Set() });
    }
    for (const plate of plates) for (const a of plate.assignments) {
      a.indices.forEach((level, i) => counts[i][level]++);
      for (const p of pairCounts) p.cells.add(a.indices[p.a] + ':' + a.indices[p.b]);
    }
    return { plates: plates.length, wells: plates.reduce((n,p)=>n+p.assignments.length,0),
      transfers: plates.reduce((n,p)=>n+p.tasks.length,0), singleLevelCounts: counts,
      pairCoverage: pairCounts.map(p=>({ a:config.compounds[p.a].name,b:config.compounds[p.b].name,
        observed:p.cells.size,possible:config.compounds[p.a].levels.length*config.compounds[p.b].levels.length })) };
  }
  function manifestCsv(plan) {
    assert(plan && plan.config && Array.isArray(plan.plates), 'Missing generated design');
    const cfg = plan.config;
    const heading = ['plate', 'target_well', 'status', 'combination_id', 'replicate', 'final_volume_uL',
      'compound_dispense_total_uL', 'diluent_dispense_uL', 'external_top_up_uL'];
    for (const c of cfg.compounds) {
      heading.push(c.name + '_dose_' + (cfg.doseMode === 'concentration' ? cfg.unit : 'uL'));
      heading.push(c.name + '_dispense_uL');
    }
    heading.push('volume_basis', 'starting_media_uL', 'actual_final_volume_uL');
    for (const c of cfg.compounds) {
      heading.push(c.name + '_actual_concentration_' + cfg.unit,
        c.name + '_target_MIC_multiple', c.name + '_actual_MIC_multiple');
    }
    const rows = [heading];
    for (const plate of plan.plates) {
      for (const a of plate.assignments.slice().sort((x, y) => {
        const wx = C.parseWell(x.well, cfg.targetFormat), wy = C.parseWell(y.well, cfg.targetFormat);
        return wx.row - wy.row || wx.col - wy.col;
      })) {
        const row = [a.plate, a.well, 'assigned', a.combinationId, a.replicate, C.numberText(a.finalVolume),
          C.numberText(a.compoundTotal), C.numberText(a.diluentVolume), C.numberText(a.externalTopUp)];
        for (let i = 0; i < cfg.compounds.length; i++) row.push(C.numberText(a.doses[i]), C.numberText(a.volumes[i]));
        row.push(cfg.volumeBasis, C.numberText(a.startingMedium), C.numberText(a.actualFinalVolume));
        for (let i = 0; i < cfg.compounds.length; i++) {
          row.push(a.actualDoses ? C.numberText(a.actualDoses[i]) : '',
            a.targetMicMultiples ? C.numberText(a.targetMicMultiples[i]) : '',
            a.actualMicMultiples ? C.numberText(a.actualMicMultiples[i]) : '');
        }
        rows.push(row);
      }
      for (const well of plate.reserved) {
        rows.push([plate.number, well, 'reserved', '', '', '', '', '', '',
          ...cfg.compounds.flatMap(() => ['', '']),
          cfg.volumeBasis, cfg.volumeBasis === 'starting' ? C.numberText(cfg.finalVolume) : '',
          cfg.volumeBasis === 'starting' ? C.numberText(cfg.finalVolume) : '',
          ...cfg.compounds.flatMap(() => ['', '', ''])]);
      }
    }
    return C.csvRows(rows);
  }
  function sourceMapCsv(plan) {
    const rows = [['plate', 'source_well', 'liquid_name', 'stock_concentration', 'concentration_unit', 'required_dispense_uL', 'estimated_prep_uL_5pct_plus_1uL']];
    for (const plate of plan.plates) {
      const totals = C.totals(plate.tasks).sources;
      for (const comp of plan.config.compounds) rows.push([plate.number, comp.source, comp.name, plan.config.doseMode === 'concentration' ? C.numberText(comp.stock) : '',
        plan.config.doseMode === 'concentration' ? plan.config.unit : '', C.numberText(totals[comp.source] || 0), C.numberText((totals[comp.source] || 0) * 1.05 + 1)]);
      if (plan.config.addDiluent) rows.push([plate.number, plan.config.diluentSource, plan.config.diluentName, '', '',
        C.numberText(totals[plan.config.diluentSource] || 0), C.numberText((totals[plan.config.diluentSource] || 0) * 1.05 + 1)]);
    }
    return C.csvRows(rows);
  }
  function defaultConfig() {
    return { mode: 'subset', targetFormat: 96, sourceFormat: 96, doseMode: 'concentration',
      volumeBasis: 'final', finalVolume: 20, maxWellVolume: null, stockMicMultiple: null, unit: 'µM',
      compounds: Array.from({length:6}, (_,i)=>({ name:'Compound_'+String.fromCharCode(65+i), source:'A'+(i+1), stock:1000, levels:[0,1,5] })),
      reserved: '', subsetSize: 96, uniqueCount: 24, replicates: 3, seed: '1701',
      addDiluent: false, diluentSource: 'H12', diluentName: 'Diluent', minTransfer: 0.008, maxTransfer: 30, sourceCapacity: 80 };
  }
  return { seededRandom, shuffle, parseLevels, parseReserved, normalizeConfig, enumerate, balancedPick,
    calculateVolumes, generateDesign, manifestCsv, sourceMapCsv, defaultConfig };
});
