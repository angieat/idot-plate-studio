'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const D = require('../src/design.js');
const C = require('../src/core.js');
const Z = require('../src/zip.js');

function config(overrides = {}) { return { ...D.defaultConfig(), ...overrides }; }
const signatures = plan => plan.plates.flatMap(p => p.assignments.map(a => a.plate+'-'+a.well+':'+a.combinationId+':'+a.replicate));

test('balanced six-compound design: 96 distinct assignments, three levels each, same seed', () => {
  const p = D.generateDesign(config());
  assert.equal(p.summary.wells, 96);
  assert.equal(p.plates.length, 1);
  assert.equal(new Set(p.plates[0].assignments.map(a=>a.combinationId)).size, 96);
  for (const counts of p.summary.singleLevelCounts) assert.deepEqual(counts, [32,32,32]);
  for (const c of p.summary.pairCoverage) assert.equal(c.observed, 9);
  assert.deepEqual(signatures(p), signatures(D.generateDesign(config())));
  assert.notDeepEqual(signatures(p), signatures(D.generateDesign(config({seed:'other'}))));
  assert.equal(p.plates[0].tasks.length, 384);
});

test('full factorial splits 729 unique combinations across eight 96-well plates', () => {
  const p = D.generateDesign(config({ mode:'full' }));
  assert.equal(p.summary.wells, 729); assert.equal(p.plates.length, 8);
  assert.equal(p.plates[7].assignments.length, 57);
  assert.equal(new Set(p.plates.flatMap(x=>x.assignments.map(a=>a.combinationId))).size, 729);
  assert.ok(p.plates.every(x=>x.assignments.length <= 96));
});

test('randomized replicate mode assigns 24 conditions × 3 with distinct wells', () => {
  const p = D.generateDesign(config({mode:'replicates'}));
  assert.equal(p.summary.wells,72);
  const repeats = new Map();
  for(const a of p.plates.flatMap(x=>x.assignments)) repeats.set(a.combinationId, (repeats.get(a.combinationId)||0)+1);
  assert.equal(repeats.size,24);
  for(const v of repeats.values()) assert.equal(v,3);
  assert.equal(new Set(p.plates.flatMap(x=>x.assignments.map(a=>a.well))).size,72);
});

test('reserved wells and concentration-to-volume calculations preserved in manifest', () => {
  const p = D.generateDesign(config({subsetSize:93,reserved:'A1:A3'}));
  assert.equal(p.plates[0].assignments.length,93);
  assert.ok(p.plates[0].assignments.every(a=>!['A1','A2','A3'].includes(a.well)));
  const csv = D.manifestCsv(p);
  const rows = C.parseCsv(csv);
  assert.equal(rows.length,97);
  assert.ok(rows.some(r=>r[1]==='A1' && r[2]==='reserved'));
  for(const a of p.plates[0].assignments) {
    assert.ok(Math.abs(a.compoundTotal+a.externalTopUp - 20) < 1e-9);
    for(let i=0;i<6;i++) assert.ok(Math.abs(a.volumes[i] - a.doses[i]*20/1000) < 1e-9);
  }
});

test('direct volume mode skips stock conversions, can add diluent in feasible small assay', () => {
  const compounds = [ { name:'Test_A', source:'A1', stock:1, levels:[0,0.1] } ];
  const p = D.generateDesign(config({compounds, doseMode:'volume',finalVolume:1,
    addDiluent:true, subsetSize:2, sourceCapacity:80 }));
  assert.equal(p.plates[0].tasks.length,3);
  for(const a of p.plates[0].assignments) {
    assert.ok(Math.abs(a.compoundTotal+a.diluentVolume-1)<1e-9);
    assert.equal(a.externalTopUp,0);
  }
});

test('protects against overdosing, unavailable sub-min transfers and invalid sources', () => {
  assert.throws(()=>D.generateDesign(config({compounds:[{name:'A',source:'A1',stock:10000,levels:[0,0.1]}],subsetSize:2})),/below configured minimum/);
  assert.throws(()=>D.generateDesign(config({compounds:[{name:'A',source:'A1',stock:10,levels:[0,10]},
    {name:'B',source:'A2',stock:10,levels:[0,10]}],subsetSize:4})),/exceeds the final volume/);
  assert.throws(()=>D.generateDesign(config({compounds:[{name:'A',source:'A1',stock:100,levels:[0,1]},
    {name:'B',source:'A1',stock:100,levels:[0,1]}]})),/own source well/);
  assert.throws(()=>D.generateDesign(config({reserved:'A1:Z60'})),/outside the 96-well plate/);
  assert.throws(()=>D.generateDesign(config({mode:'subset',subsetSize:730})),/cannot exceed/);
});

test('source capacity rejects large diluent runs rather than silently generating overfilled plate', () => {
  assert.throws(()=>D.generateDesign(config({addDiluent:true})),/exceeding the configured 80 µL usable source volume/);
});

test('concentration levels can differ across compounds; 6 × 2-level full factorial = 64', () => {
  const compounds = D.defaultConfig().compounds.map(c=>({...c,levels:[0,5]}));
  assert.equal(D.generateDesign(config({mode:'full',compounds})).summary.wells,64);
});

test('ZIP builder generates valid signature and prevents path traversal', async () => {
  const blob = Z.zipFiles([{name:'abc/test.csv',content:'a,b\r\n1,2\r\n'}]);
  const bytes = new Uint8Array(await blob.arrayBuffer());
  assert.equal(bytes[0],0x50); assert.equal(bytes[1],0x4b);
  assert.throws(()=>Z.zipFiles([{name:'../evil',content:'bad'}]),/Invalid ZIP entry name/);
});
