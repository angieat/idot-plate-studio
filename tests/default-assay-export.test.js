'use strict';
const {test} = require('node:test');
const assert = require('node:assert/strict');
const C = require('../src/core.js');
const V = require('../src/idot_v23.js');
const D = require('../src/design.js');
const FIXED = new Date('2026-11-09T14:06:00');
const settings={sourcePlate:'Source Plate 1',sourcePlateType:'L.100 Plate',
  liquidClass:'VSCY 1 mPa*s (H2O)',additional:'0',wasteWell:'Waste Tube'};
const task=(s='A1',t='A1',v=0.3,liq='Antibiotic_A')=>({source:s,target:t,volume:v,liquid:liq});
function header(csv) {return C.parseCsv(csv).slice(0,5);}

test('new CSV defaults to Assay Studio 2.3.2.6 with exactly 5 metadata rows and 16 transfer columns',()=>{
  const template=V.createDefaultTemplate(96,96,{date:FIXED});
  const validation=V.validateTemplate(template,96,96);
  assert.deepEqual(validation.errors,[]);
  assert.equal(template.softwareVersion,V.VERSION);
  const csv=V.exportProtocol([task()],template,'Antibiotic_Screen',96,96,{settings});
  assert.equal(csv.charCodeAt(0),0xFEFF);
  assert.match(csv,/\r\n/);
  assert.equal(csv.split('\r\n').length,7);
  const lines=header(csv);
  assert.deepEqual(lines[0],['sep=','']);
  assert.deepEqual(lines[1],['Antibiotic_Screen','2.3.2.6','Plate Studio','11/09/2026','2:06 PM']);
  assert.deepEqual(lines[2],['DispenseToWaste=False','DispenseToWasteCycles=3','DispenseToWasteVolume=1e-7',
    'UseDeionisation=True','OptimizationLevel=ReorderAndParallel','WasteErrorHandlingLevel=Ask','SaveLiquids=Never']);
  assert.deepEqual(lines[3],['']);
  assert.deepEqual(lines[4],V.HEADER);
  assert.deepEqual(C.parseCsv(csv)[5].slice(0,4),['Target Plate 1','96-Well','','A01']);
  const reread=V.importProtocol(csv,96);
  assert.equal(reread.targetFormat,96);
  assert.equal(reread.tasks[0].volume,0.3);
  assert.equal(reread.tasks[0].liquid,'Antibiotic_A');
});

test('generated CSV header can be configured but version stays pinned to 2.3.2.6',()=>{
  const template=V.createDefaultTemplate(384,96,{date:FIXED,userLabel:'Researcher, Test',
    dispenseToWaste:'True',useDeionisation:'False',saveLiquids:'Ask'});
  const result=V.exportProtocol([task()],template,'Assay',96,384,{settings});
  const rows=C.parseCsv(result);
  assert.deepEqual(rows[1],['Assay','2.3.2.6','Researcher, Test','11/09/2026','2:06 PM']);
  assert.equal(rows[2][0],'DispenseToWaste=True');
  assert.equal(rows[2][3],'UseDeionisation=False');
  assert.equal(rows[2][6],'SaveLiquids=Ask');
  assert.throws(()=>V.createDefaultTemplate(96,96,{saveLiquids:'Always'}),/SaveLiquids/);
  assert.throws(()=>V.createDefaultTemplate(96,96,{dispenseToWaste:'yes'}),/DispenseToWaste/);
});

test('new CSV generation works with 1536-native well names and multi-plate export without an uploaded template',()=>{
  const template=V.createDefaultTemplate(1536,96,{date:FIXED});
  const plan={plates:[{number:1,tasks:[task('A1','A1',0.1)]},
    {number:2,tasks:[task('A2','AF48',0.2)]}]};
  const out=V.exportCombined(plan,template,'Across_Plates',96,1536,{settings});
  const parsed=V.importProtocol(out,96);
  assert.equal(parsed.plates.length,2);
  assert.equal(parsed.tasks.length,2);
  assert.equal(C.parseCsv(out)[5][3],'Aa01');
  assert.equal(C.parseCsv(out)[6][3],'Hd48');
});

test('generated 96-well sparse-screen CSV and imported-template method both preserve all dispensing steps',()=>{
  const config=D.defaultConfig();
  config.targetFormat=96;config.sourceFormat=96;config.mode='sparse';config.subsetSize=72;
  config.controls={untreated:12,vehicle:12,reference:0,vehicleSource:'H12',vehicleName:'Vehicle',vehicleVolume:0.3};
  config.reserved=[];config.seed=1701;
  const generated=D.generateDesign(config);
  const native=V.createDefaultTemplate(96,96,{date:FIXED});
  const newCsv=V.exportCombined(generated,native,'Sparse_Screen',96,96,{settings});
  const newParsed=V.importProtocol(newCsv,96);
  const reference=V.exportProtocol([task('A1','A1',0.1,'Water')],native,'Template_Screen',96,96,{settings});
  const imported=V.importProtocol(reference,96);
  const fromTemplate=V.exportCombined(generated,imported.template,'Sparse_Screen',96,96,{settings});
  const templateParsed=V.importProtocol(fromTemplate,96);
  assert.equal(newParsed.tasks.length,generated.plates.reduce((count,p)=>count+p.tasks.length,0));
  assert.equal(templateParsed.tasks.length,newParsed.tasks.length);
  assert.deepEqual(newParsed.tasks.map(x=>x.volume),templateParsed.tasks.map(x=>x.volume));
  assert.equal(newParsed.template.softwareVersion,'2.3.2.6');
});
