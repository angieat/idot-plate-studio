'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const C = require('../src/core.js');
const V = require('../src/idot_v23.js');
const D = require('../src/design.js');
const head = [
  'sep=,',
  'test_v3,2.3.2.6,<User Name>,11/03/2026,2:11 PM',
  'DispenseToWaste=False,DispenseToWasteCycles=3,DispenseToWasteVolume=1e-7,UseDeionisation=True,OptimizationLevel=ReorderAndParallel,WasteErrorHandlingLevel=Ask,SaveLiquids=Never',
  '',
  V.HEADER.join(',')
];
const row = (fmt, target, source, liquid, plate=1, volume='2e-1') => [
  'Target Plate '+plate,fmt+'-Well','',target,'Waste Tube','Source Plate 1','L.100 Plate','',source,volume,liquid,'0e0',
  'VSCY 1 mPa*s (H2O)','','',''
];
const mini = (fmt, rows) => '\uFEFF'+C.csvRows([...head.map((x,i)=>i===4?V.HEADER: i===3?[]:C.parseCsv(x)[0]),...rows]);

test('v3 uses exact 16 columns and native 1536-well coordinate scheme',()=>{
  assert.equal(V.HEADER.length,16);
  assert.equal(V.toIdotWell('A1',1536),'Aa01');
  assert.equal(V.toIdotWell('H48',1536),'Ha48');
  assert.equal(V.toIdotWell('I1',1536),'Ab01');
  assert.equal(V.toIdotWell('AF48',1536),'Hd48');
  assert.equal(V.fromIdotWell('Hd48',1536),'AF48');
  assert.equal(V.fromIdotWell('Ab01',1536),'I1');
  assert.equal(V.toIdotWell('P24',384),'P24');
  assert.equal(V.toIdotWell('A1',384),'A01');
  assert.throws(()=>V.fromIdotWell('Hd49',1536),/outside/);
});

test('synthetic v3 Assay Studio CSV imports and exports same 5-line structure, BOM and CRLF',()=>{
  const csv=mini(1536,[row(1536,'Aa01','A01','Water'),row(1536,'Hd48','B02','Buffer')]);
  const imported=V.importProtocol(csv,96);
  assert.equal(imported.targetFormat,1536);
  assert.equal(imported.tasks[1].target,'AF48');
  assert.equal(V.exportProtocol(imported.tasks,imported.template,imported.originalName,96,1536),csv);
  assert.equal(C.parseCsv(csv)[4].length,16);
  assert.equal(csv.charCodeAt(0),0xfeff);
  assert.ok(csv.includes('\r\n'));
});

test('multiple target plates are retained in one combined 16-column protocol',()=>{
  const csv=mini(384,[row(384,'A01','A01','Water',1,'2e0'),row(384,'B02','B01','Buffer',2,'3e-1')]);
  const imported=V.importProtocol(csv,96);
  assert.equal(imported.plates.length,2);
  assert.equal(imported.tasks[1].targetPlate,2);
  const combined=V.exportCombined({plates: imported.plates},imported.template,imported.originalName,96,384);
  assert.equal(combined,csv);
  const rows=C.parseCsv(combined);
  assert.equal(rows[5][0],'Target Plate 1');
  assert.equal(rows[6][0],'Target Plate 2');
});

test('randomized design exports candidate 16-column full protocol and preserves level balance',()=>{
  const sample=V.importProtocol(mini(384,[row(384,'A01','A01','Water')]),96);
  const config={...D.defaultConfig(),targetFormat:384,subsetSize:96};
  const generated=D.generateDesign(config);
  assert.equal(generated.summary.wells,96);
  const text=V.exportCombined(generated,sample.template,'Six_Compound_Study',96,384,{
    settings:{liquidClass:'VSCY 1 mPa*s (H2O)',additional:'0',sourcePlateType:'L.100 Plate'}
  });
  const parsed=V.importProtocol(text,96);
  assert.equal(parsed.tasks.length,generated.plates[0].tasks.length);
  assert.equal(parsed.tasks[0].liquid,generated.plates[0].tasks[0].liquid);
  assert.equal(parsed.template.originalName,'Six_Compound_Study');
  assert.ok(parsed.tasks.every(t=>t.idot.additional==='0'));
});

test('rejects invalid 2.3.x template, mismatched target plates and negative source overhead',()=>{
  const sample=V.importProtocol(mini(384,[row(384,'A01','A01','Water')]),96);
  assert.ok(V.validateTemplate(sample.template,1536,96).errors.length);
  assert.throws(()=>V.exportProtocol(sample.tasks,sample.template,'Test',96,1536),/template target plate/);
  assert.throws(()=>V.exportProtocol([{source:'A1',target:'A1',volume:1,liquid:'X'}],sample.template,'New',96,384,
    {settings:{additional:-1}}),/additional source volume/);
  assert.throws(()=>V.importProtocol('Source Well,Target Well,Volume [uL],Liquid Name',96),/Not an Assay Studio/);
});

// When the original researcher's instrument files are present, verify full exact round trips.
// Fixtures are intentionally not distributed in the public repository.
for(const [filename,format,plates,n] of [
  ['plate384_6_liquids_different_targets.csv',384,6,2304],
  ['plate1536_8liquid_test.csv',1536,1,960]
]) {
  const located=path.resolve(__dirname,'../../',filename);
  if(fs.existsSync(located)) test('original reference file byte-for-byte CSV round-trip: '+filename,()=>{
    const original=fs.readFileSync(located,'utf8');
    const parsed=V.importProtocol(original,96);
    assert.equal(parsed.targetFormat,format);
    assert.equal(parsed.plates.length,plates);
    assert.equal(parsed.tasks.length,n);
    const exported=V.exportProtocol(parsed.tasks,parsed.template,parsed.originalName,96,format);
    assert.equal(exported,original);
  });
}
