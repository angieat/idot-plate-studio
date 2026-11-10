'use strict';
const {test} = require('node:test');
const assert = require('node:assert/strict');
const D = require('../src/design.js');
const C = require('../src/core.js');
const V = require('../src/idot_v23.js');

const stocks = [563,297,7710,54.1,164,483];
const mins = [.0563,.0297,.771,.00541,.0164,.0483];
const maxs = [.563,.297,7.71,.0541,.164,.483];
function config(overrides={}) {
  const root = D.defaultConfig();
  return {...root, mode:'bernoulli', targetFormat:96, sourceFormat:96,
    volumeBasis:'starting', finalVolume:300, stockMicMultiple:1000,
    subsetSize:72, inclusionProbability:0.5, ...overrides,
    controls: {untreated:12,vehicle:12,reference:0,vehicleSource:'H12',vehicleName:'Vehicle',vehicleVolume:.3,referenceCompound:'',referenceDose:'', ...overrides.controls},
    compounds: overrides.compounds || stocks.map((stock,i)=>({name:'Antibiotic_'+(i+1),source:'A'+(i+1),stock,
      doseScheme:'continuous',logMin:mins[i],logMax:maxs[i],levels:[0,mins[i],maxs[i]]}))
  };
}
test('independent 50/50 Bernoulli sampling generates 72 treatment wells with continuous positive doses',()=>{
  const plan = D.generateDesign(config());
  assert.equal(plan.plates.length,1);
  assert.equal(plan.config.totalPossible,null);
  assert.equal(plan.summary.wells,72);
  assert.equal(plan.summary.controls,24);
  assert.equal(plan.summary.assignedWells,96);
  assert.equal(new Set(plan.plates[0].assignments.map(a=>a.well)).size,96);
  assert.equal(plan.plates[0].assignments.filter(a=>a.controlType==='untreated').length,12);
  assert.equal(plan.plates[0].assignments.filter(a=>a.controlType==='vehicle').length,12);
  const treatments=plan.plates[0].assignments.filter(a=>a.role==='treatment');
  for(let i=0;i<6;i++) {
    const positive=treatments.map(a=>a.doses[i]).filter(d=>d>0);
    assert.ok(positive.length>20&&positive.length<52, 'inclusion near 50/50 on '+i);
    assert.ok(positive.every(v=>v>=mins[i]&&v<=maxs[i]));
    assert.ok(new Set(positive.map(v=>v.toPrecision(10))).size >= positive.length-1);
  }
  for(const a of treatments) {
    assert.equal(a.externalTopUp,0);
    assert.ok(a.actualFinalVolume>=300&&a.actualFinalVolume<=301.8);
    for(let i=0;i<6;i++) {
      assert.equal(a.volumes[i]>0,a.doses[i]>0);
      assert.ok(Math.abs(a.volumes[i]-a.doses[i]*300/stocks[i])<1e-12);
    }
  }
  assert.ok(plan.plates[0].assignments.filter(a=>a.role==='control').every(a=>a.doses.every(x=>x===0)));
  assert.ok(plan.plates[0].tasks.every(t=>t.volume>=0.008));
});
test('seeded design is reproducible, with different seeds generating different values',()=>{
  const a=D.generateDesign(config());
  assert.deepEqual(a.plates,D.generateDesign(a.config).plates);
  assert.notDeepEqual(a.plates,D.generateDesign(config({seed:'another seed'})).plates);
});
test('probability applies independently to every source/well and supports boundary values',()=>{
  const none=D.generateDesign(config({inclusionProbability:0}));
  assert.equal(none.plates[0].assignments.filter(a=>a.role==='treatment').every(a=>a.doses.every(x=>x===0)),true);
  const all=D.generateDesign(config({inclusionProbability:1}));
  assert.equal(all.plates[0].assignments.filter(a=>a.role==='treatment').every(a=>a.doses.every(x=>x>0)),true);
  assert.throws(()=>D.generateDesign(config({inclusionProbability:1.1})),/between 0 and 1/);
  assert.throws(()=>D.generateDesign(config({inclusionProbability:-.01})),/between 0 and 1/);
});
test('rejects invalid continuous ranges, subminimum transfers, and unsupported schemes',()=>{
  assert.throws(()=>D.generateDesign(config({compounds:[{name:'Bad',source:'A1',stock:1000,doseScheme:'continuous',logMin:0,logMax:1}]})),/positive/);
  assert.throws(()=>D.generateDesign(config({compounds:[{name:'Bad',source:'A1',stock:1000,doseScheme:'continuous',logMin:1,logMax:1}]})),/smaller/);
  assert.throws(()=>D.generateDesign(config({compounds:[{name:'Bad',source:'A1',stock:1000,doseScheme:'continuous',logMin:.001,logMax:.1}]})),/below configured minimum/);
  assert.throws(()=>D.generateDesign(config({compounds:[{name:'Bad',source:'A1',stock:1,doseScheme:'continuous',logMin:1,logMax:2}]})),/exceeds its stock/);
  assert.throws(()=>D.generateDesign(config({compounds:[{name:'Bad',source:'A1',stock:100,doseScheme:'manual',levels:[0,1]}]})),/continuous log ranges are required/);
  assert.throws(()=>D.generateDesign({...config(),mode:'sparse'}),/unavailable in other design modes/);
});
test('reference controls use a configured real-valued dose without fake discrete level',()=>{
  const ref=.137;
  const plan=D.generateDesign(config({subsetSize:70,controls:{untreated:12,vehicle:12,reference:2,referenceCompound:'Antibiotic_1',referenceDose:ref}}));
  assert.equal(plan.summary.controls,26);
  for(const a of plan.plates[0].assignments.filter(a=>a.controlType==='reference')) {
    assert.equal(a.doses[0],ref);
    assert.equal(a.doses.slice(1).every(d=>d===0),true);
    assert.ok(a.actualDoses[0]>0);
  }
  assert.throws(()=>D.generateDesign(config({controls:{reference:1,referenceCompound:'Antibiotic_1',referenceDose:.6}})),/inside the selected compound continuous log range/);
});
test('model matrix represents continuous normalized log doses and pairwise effects',()=>{
  const plan=D.generateDesign(config());
  const matrix=C.parseCsv(D.featureMatrixCsv(plan));
  const legend=C.parseCsv(D.featureLegendCsv(plan));
  const manifest=C.parseCsv(D.manifestCsv(plan));
  assert.equal(matrix.length,97);
  assert.equal(manifest.length,97);
  assert.equal(legend.length,43); // 12 main + 30 pair + header
  const header=matrix[0];
  assert.ok(header.includes('main__0__presence'));
  assert.ok(header.includes('main__0__logdose'));
  assert.ok(header.includes('pair__0__1__presence'));
  assert.ok(header.includes('pair__0__1__logdose'));
  const byWell=new Map(plan.plates[0].assignments.map(a=>[a.well,a]));
  for(const row of matrix.slice(1)) {
    const a=byWell.get(row[1]), present=Number(a.doses[0]>0);
    assert.equal(Number(row[header.indexOf('main__0__presence')]),present);
    const scaled = a.doses[0] ? Math.log(a.doses[0]/mins[0])/Math.log(maxs[0]/mins[0]) : 0;
    assert.ok(Math.abs(Number(row[header.indexOf('main__0__logdose')])-scaled)<1e-9);
    assert.equal(Number(row[header.indexOf('pair__0__1__presence')]),Number(a.doses[0]>0&&a.doses[1]>0));
    assert.ok(Number(row[header.indexOf('main__0__logdose')])>=0);
    assert.ok(Number(row[header.indexOf('main__0__logdose')])<=1);
  }
  assert.equal(legend.filter(r=>r[1]==='pair_logdose').length,15);
});
test('continuous 96-well design can generate Assay Studio 2.3.2.6 CSV without template',()=>{
  const plan=D.generateDesign(config());
  const template=V.createDefaultTemplate(96,96);
  const csv=V.exportProtocol(plan.plates[0].tasks,template,'Bernoulli_96well',96,96);
  assert.ok(csv.includes('2.3.2.6'));
  const parsed=V.importProtocol(csv);
  assert.equal(parsed.tasks.length,plan.plates[0].tasks.length);
});
test('source-capacity and destination-capacity validation remain effective',()=>{
  assert.throws(()=>D.generateDesign(config({sourceCapacity:1})),/exceeding the configured/);
  assert.throws(()=>D.generateDesign(config({maxWellVolume:300})),/exceeds the configured physical well limit/);
});
