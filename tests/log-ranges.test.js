'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const D = require('../src/design.js');
const C = require('../src/core.js');
function setup() {
  const raw = D.defaultConfig();
  return { ...raw, targetFormat: 96, sourceFormat: 96,
    mode: 'sparse', subsetSize: 72, volumeBasis: 'starting', finalVolume: 300,
    stockMicMultiple: 1000, sourceCapacity: 80, seed: '1701',
    controls: {untreated: 12, vehicle: 12, reference: 0,
      vehicleSource: 'H12', vehicleName: 'Vehicle', vehicleVolume: 0.3},
    compounds: raw.compounds.map((c,i)=>({ ...c, stock: [563,297,7710,54.1,164,483][i],
      levels: [0, [0.563,0.297,7.71,0.0541,0.164,0.483][i]],
      doseScheme: 'log', logMin: [0.0563,0.0297,0.771,0.00541,0.0164,0.0483][i],
      logMax: [0.563,0.297,7.71,0.0541,0.164,0.483][i],
      logPoints: 3, logIncludeZero: true }))
  };
}
test('per-compound log spaced concentrations include 0 and exact endpoints', () => {
  assert.deepEqual(D.logSpacedLevels(0.1, 10, 3, true), [0,0.1,1,10]);
  assert.deepEqual(D.logSpacedLevels(0.25, 4, 3, false), [0.25,1,4]);
  assert.equal(D.logSpacedLevels(0.1, 1, 4).length,5);
});
test('invalid ranges, over-stock targets and log range in volume mode are rejected', () => {
  assert.throws(()=>D.logSpacedLevels(0,10,3),/positive/);
  assert.throws(()=>D.logSpacedLevels(1,1,3),/smaller/);
  assert.throws(()=>D.logSpacedLevels(1,10,1),/2–4/);
  assert.throws(()=>D.logSpacedLevels(1,10,5),/2–4/);
  assert.throws(()=>D.normalizeConfig({...setup(),doseMode:'volume'}),/require concentration dosing/);
  const c=setup(); c.compounds[0].logMax=600;
  assert.throws(()=>D.normalizeConfig(c),/target concentration exceeds/);
});
test('mixed manual and per-source log ranges retain their own dosage grids', () => {
  const c=setup(); c.compounds[0].doseScheme='manual'; c.compounds[0].levels=[0,0.2815,0.563];
  const normalized=D.normalizeConfig(c);
  assert.deepEqual(normalized.compounds[0].levels,[0,0.2815,0.563]);
  assert.equal(normalized.compounds[1].levels.length,4);
  assert.equal(normalized.compounds[1].doseScheme,'log');
  assert.equal(normalized.compounds[0].doseScheme,'manual');
});
test('sparse log-range experiment uses all 96 wells and preserves seeded assignments', () => {
  const plan=D.generateDesign(setup());
  assert.equal(plan.summary.wells,72);
  assert.equal(plan.summary.controls,24);
  assert.equal(plan.summary.assignedWells,96);
  assert.equal(plan.config.totalPossible,4096);
  const first=plan.plates[0].assignments;
  assert.equal(new Set(first.map(x=>x.well)).size,96);
  const other=D.generateDesign(plan.config);
  assert.deepEqual(first,other.plates[0].assignments);
  assert.ok(plan.config.compounds.every(c=>c.levels.length===4));
  assert.ok(plan.plates[0].assignments.every(a=>a.externalTopUp===0));
  for (const a of first.filter(x=>x.role==='treatment')) {
    for (let i=0;i<6;i++) assert.ok(plan.config.compounds[i].levels.includes(a.doses[i]));
    assert.ok(a.actualFinalVolume >= 300);
  }
  assert.ok(plan.plates[0].tasks.every(t=>t.volume >= 0.008));
});
test('model matrix, legend and manifest encode exact log-grid doses and controls', () => {
  const plan=D.generateDesign(setup());
  const rows=C.parseCsv(D.manifestCsv(plan));
  const matrix=C.parseCsv(D.featureMatrixCsv(plan));
  const legend=C.parseCsv(D.featureLegendCsv(plan));
  assert.equal(rows.length,97);
  assert.equal(matrix.length,97);
  assert.equal(legend.length,154); // 6*3 main + 15*9 pair features plus header
  assert.ok(rows[0].includes('Doxycycline_dose_µM')===false); // default names Compound_A etc.
  const ix=rows[0].indexOf('Compound_A_dose_µM');
  assert.ok(ix>=0);
  assert.ok(rows.some(r=>r[ix]==='0.0563'));
  assert.equal(matrix.filter(r=>r[2]==='control').length,24);
  assert.ok(legend.some(r=>r[3]==='0.178018' || r[3].startsWith('0.178')));
});
test('source usable volume limit still blocks unsafe log range plans',()=>{
  assert.throws(()=>D.generateDesign({...setup(),sourceCapacity:0.02}),/exceeding the configured/);
});
