'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const D = require('../src/design.js');
const C = require('../src/core.js');
const V = require('../src/idot_v23.js');

const base = { ...D.defaultConfig(), volumeBasis: 'starting', finalVolume: 2000,
  mode: 'full', stockMicMultiple: 1000, sourceCapacity: 0, addDiluent: false };
const makeComp = (name, source, mic) => ({ name, source, stock: mic * 1000, levels: [0, mic] });
const compounds = [
  makeComp('Doxycycline', 'A1', 0.563),
  makeComp('Carbomycin', 'A2', 0.297),
  makeComp('Daptomycin', 'A3', 7.71),
  makeComp('Ceftriaxone', 'A4', 0.0541),
  makeComp('Amoxicillin', 'A5', 0.164),
  makeComp('Piperacillin', 'A6', 0.483)
];
const near = (actual, expected, tolerance = 1e-9) =>
  assert.ok(Math.abs(actual - expected) <= tolerance, `expected ${expected}, got ${actual}`);

test('2,000 µL prefilled medium + six antibiotics at 1× MIC yields 2,012 µL', () => {
  const p = D.generateDesign({ ...base, compounds });
  const all = p.plates[0].assignments.find(a => a.indices.every(x => x === 1));
  assert.ok(all);
  assert.equal(p.plates.length, 1);
  assert.equal(all.startingMedium, 2000);
  assert.equal(all.externalTopUp, 0);
  assert.equal(all.diluentVolume, 0);
  near(all.compoundTotal, 12);
  near(all.actualFinalVolume, 2012);
  for (const v of all.volumes) near(v, 2);
  for (const v of all.targetMicMultiples) near(v, 1);
  for (const v of all.actualMicMultiples) near(v, 2000 / 2012);
  assert.ok(!p.plates[0].tasks.some(t => t.liquid === 'Diluent'));
  assert.ok(p.warnings.some(w => w.includes('No top-up')));
});

test('one antibiotic at 1× MIC with the rest absent is 0.999× MIC', () => {
  const p = D.generateDesign({ ...base, compounds });
  const a = p.plates[0].assignments.find(x => x.indices.join(',') === '1,0,0,0,0,0');
  near(a.compoundTotal, 2);
  near(a.actualFinalVolume, 2002);
  near(a.actualMicMultiples[0], 2000 / 2002);
  near(a.actualMicMultiples[1], 0);
});

test('manifest records starting medium, actual well volume and actual MIC multiples per compound', () => {
  const p = D.generateDesign({ ...base, compounds, reserved: 'A1' });
  const rows = C.parseCsv(D.manifestCsv(p));
  const header = rows[0];
  const assigned = rows.find(r => r[header.indexOf('compound_dispense_total_uL')] === '12');
  assert.ok(assigned, 'all-six condition should be in manifest');
  assert.equal(assigned[header.indexOf('volume_basis')], 'starting');
  assert.equal(assigned[header.indexOf('starting_media_uL')], '2000');
  assert.equal(assigned[header.indexOf('actual_final_volume_uL')], '2012');
  assert.equal(assigned[header.indexOf('external_top_up_uL')], '0');
  near(Number(assigned[header.indexOf('Doxycycline_actual_MIC_multiple')]), 2000/2012, 1e-9);
  const reserved = rows.find(r => r[header.indexOf('status')] === 'reserved');
  assert.ok(reserved);
  assert.equal(reserved.length, header.length);
  assert.equal(reserved[header.indexOf('starting_media_uL')], '2000');
});

test('fixed-starting mode rejects unneeded top-up and respects optional physical well capacity', () => {
  assert.throws(() => D.generateDesign({ ...base, compounds, addDiluent:true }), /must not add a diluent top-up/);
  assert.throws(() => D.generateDesign({ ...base, compounds, maxWellVolume:2000 }), /exceeds the configured physical well limit/);
  assert.doesNotThrow(() => D.generateDesign({ ...base, compounds, maxWellVolume:2020 }));
});

test('additive direct-volume mode does not use source stock for concentration estimates', () => {
  const p = D.generateDesign({ ...base, doseMode:'volume', compounds:[{name:'A',source:'A1',stock:1,levels:[0,3]}],
    mode:'full', stockMicMultiple:null });
  const treated = p.plates[0].assignments.find(a => a.doses[0] === 3);
  near(treated.actualFinalVolume, 2003);
  assert.equal(treated.actualDoses, null);
  assert.equal(treated.externalTopUp, 0);
  const rows = C.parseCsv(D.manifestCsv(p));
  const idx = rows[0].indexOf('A_actual_concentration_µM');
  assert.ok(idx > 0);
  assert.equal(rows.find(r => r[2] === 'assigned' && r[rows[0].indexOf('A_dispense_uL')] === '3')[idx], '');
});

test('old saved configs default to fixed-final-volume behavior and still require top-up', () => {
  const raw = { ...D.defaultConfig() };
  delete raw.volumeBasis; delete raw.maxWellVolume; delete raw.stockMicMultiple;
  const p = D.generateDesign(raw);
  assert.equal(p.config.volumeBasis, 'final');
  const a = p.plates[0].assignments[0];
  near(a.compoundTotal + a.externalTopUp, 20);
  near(a.actualFinalVolume, 20);
});

test('generated 16-column Assay Studio tasks retain transfer volumes under additive mode', () => {
  const p = D.generateDesign({ ...base, compounds });
  const all = p.plates[0].assignments.find(a => a.indices.every(x=>x===1));
  const tasks = p.plates[0].tasks.filter(t=>t.target===all.well);
  assert.equal(tasks.length, 6);
  tasks.forEach(t=>near(t.volume, 2));
  // Synthetic 96-well template: test 16-column export without distributing any real instrument CSV.
  const templateRows = [
    ['sep=', ''],
    ['Template','2.3.2.6','User','11/05/2026','1:00 PM'],
    ['DispenseToWaste=False','DispenseToWasteCycles=3','DispenseToWasteVolume=1e-7',
      'UseDeionisation=True','OptimizationLevel=ReorderAndParallel','WasteErrorHandlingLevel=Ask','SaveLiquids=Never'],
    [], V.HEADER,
    ['Target Plate 1','96-Well','','A01','Waste Tube','Source Plate 1','L.100 Plate','','A01',
      '2e0','Template Liquid','0e0','VSCY 1 mPa*s (H2O)','','','']
  ];
  const input = '\uFEFF' + C.csvRows(templateRows);
  const imported = V.importProtocol(input, 96);
  const csv = V.exportCombined(p, imported.template, 'Randomized_Prefilled', 96, 96,
    {settings:{liquidClass:'VSCY 1 mPa*s (H2O)',additional:'0',sourcePlateType:'L.100 Plate'}});
  const exported = V.importProtocol(csv, 96);
  assert.equal(exported.tasks.length, p.summary.transfers);
  assert.equal(C.parseCsv(csv)[4].length, 16);
  const exportedTasks = exported.tasks.filter(t => t.target === all.well);
  assert.equal(exportedTasks.length, 6);
  exportedTasks.forEach(t => near(t.volume, 2));
});
