'use strict';
const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const C = require('../src/core.js');
const V = require('../src/idot_v23.js');
const D = require('../src/design.js');

const settings = {
  sourcePlate:'Source Plate 1', sourcePlateType:'L.100 Plate',
  liquidClass:'VSCY 1 mPa*s (H2O)', additional:'0', wasteWell:'Waste Tube'
};
const opts = { userLabel: 'Plate Studio', date: '2026-11-09T14:00:00-08:00',
  dispenseToWaste:'False', useDeionisation:'True', saveLiquids:'Never' };

test('new CSV export creates exact Assay Studio 2.3.2.6 5-row header, without any uploaded file', () => {
  const t=V.createDefaultTemplate(96,96,opts);
  assert.equal(t.softwareVersion, '2.3.2.6');
  assert.equal(t.generated, true);
  assert.deepEqual(V.validateTemplate(t,96,96).errors,[]);
  const csv=V.exportProtocol([{source:'A1',target:'B3',volume:0.15,liquid:'Doxycycline'}],t,'MyStudy',96,96,{settings});
  assert.equal(csv.charCodeAt(0),0xfeff);
  const rows=C.parseCsv(csv);
  assert.equal(rows[0][0], 'sep=');
  assert.equal(rows[1][0], 'MyStudy');
  assert.equal(rows[1][1], '2.3.2.6');
  assert.equal(rows[1][2], 'Plate Studio');
  assert.equal(rows[2][0], 'DispenseToWaste=False');
  assert.equal(rows[2][3], 'UseDeionisation=True');
  assert.equal(rows[2][6], 'SaveLiquids=Never');
  assert.deepEqual(rows[3],['']);
  assert.deepEqual(rows[4],V.HEADER);
  assert.equal(rows[5].length,16);
  assert.deepEqual(rows[5].slice(0,5),['Target Plate 1','96-Well','','B03','Waste Tube']);
  assert.equal(rows[5][8],'A01');
  assert.equal(Number(rows[5][9]),0.15);
  assert.equal(rows[5][10],'Doxycycline');
  assert.equal(V.importProtocol(csv,96).tasks.length,1);
});

test('new export preserves customized instrument metadata and escapes user labels',()=>{
  const t=V.createDefaultTemplate(384,96,{...opts,userLabel:'Research, Team',dispenseToWaste:'True',useDeionisation:'False',saveLiquids:'Ask'});
  const rows=C.parseCsv(t.headerLines.join('\r\n'));
  assert.equal(rows[1][2],'Research, Team');
  assert.equal(rows[2][0],'DispenseToWaste=True');
  assert.equal(rows[2][3],'UseDeionisation=False');
  assert.equal(rows[2][6],'SaveLiquids=Ask');
  assert.deepEqual(V.validateTemplate(t,384,96).errors,[]);
  assert.throws(()=>V.createDefaultTemplate(96,96,{...opts,userLabel:'=HYPERLINK("bad")'}),/unsafe/);
  assert.throws(()=>V.createDefaultTemplate(96,96,{...opts,dispenseToWaste:'Maybe'}),/DispenseToWaste/);
  assert.throws(()=>V.createDefaultTemplate(96,96,{...opts,date:'definitely not a date'}),/Invalid CSV generation date/);
});

test('randomized six-antibiotic plate with interspersed controls exports as new Assay Studio CSV',()=>{
  const conf=JSON.parse(fs.readFileSync(path.resolve(__dirname,'../examples/six-antibiotic-300uL-logrange-config.json'),'utf8'));
  const plan=D.generateDesign(conf);
  assert.equal(plan.plates.length,1);
  assert.equal(plan.plates[0].assignments.length,96);
  assert.equal(plan.plates[0].assignments.filter(a=>a.role==='control').length,24);
  const t=V.createDefaultTemplate(96,96,opts);
  const csv=V.exportCombined(plan,t,'Six_Antibiotics_96w',96,96,{settings});
  const parsed=V.importProtocol(csv,96);
  assert.equal(parsed.tasks.length, plan.plates[0].tasks.length);
  assert.ok(parsed.tasks.length>0);
  assert.equal(parsed.targetFormat,96);
  assert.equal(parsed.template.softwareVersion,'2.3.2.6');
  assert.ok(parsed.tasks.every(x=>x.volume>0));
  assert.ok(parsed.tasks.every(x=>x.targetPlate===1));
  assert.ok(parsed.tasks.some(x=>x.liquid==='Vehicle'));
});

test('existing-template export retains imported header and liquid metadata',()=>{
  const base=V.createDefaultTemplate(96,96,{...opts,userLabel:'Original Technician',saveLiquids:'Ask'});
  const importedCsv=V.exportProtocol([{source:'A1',target:'A1',volume:0.3,liquid:'Doxycycline'}],base,'SourceExport',96,96,{settings});
  const imported=V.importProtocol(importedCsv,96);
  const newCsv=V.exportProtocol([{source:'A1',target:'D12',volume:0.15,liquid:'Doxycycline'}],imported.template,'NewStudy',96,96,{settings});
  const rows=C.parseCsv(newCsv);
  assert.equal(rows[1][0],'NewStudy');
  assert.equal(rows[1][2],'Original Technician');
  assert.equal(rows[2][6],'SaveLiquids=Ask');
  assert.equal(rows[5][3],'D12');
  assert.equal(rows[5][10],'Doxycycline');
});
