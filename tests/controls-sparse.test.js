'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const D=require('../src/design');
const C=require('../src/core');
const config=(changes={})=>({...D.defaultConfig(),volumeBasis:'starting',finalVolume:300,
  stockMicMultiple:1000,mode:'sparse',subsetSize:72,
  controls:{untreated:12,vehicle:12,reference:0,vehicleSource:'H12',vehicleName:'Vehicle',vehicleVolume:0.3},
  ...changes});
const signature=p=>p.plates.flatMap(x=>x.assignments.map(a=>[a.plate,a.well,a.role,a.controlType,a.combinationId]));

test('96-well sparse design mixes 72 treatments, 12 untreated and 12 vehicle controls into all rows',()=>{
  const p=D.generateDesign(config());
  assert.equal(p.summary.wells,72);assert.equal(p.summary.controls,24);
  assert.equal(p.summary.assignedWells,96);
  assert.equal(p.plates.length,1);
  const a=p.plates[0].assignments;
  assert.equal(new Set(a.map(x=>x.well)).size,96);
  assert.deepEqual(a.reduce((o,x)=>(o[x.controlType||'treatment']=(o[x.controlType||'treatment']||0)+1,o),{}),
    {treatment:72,vehicle:12,untreated:12});
  assert.equal(new Set(a.filter(x=>x.role==='treatment').map(x=>x.combinationId)).size,72);
  assert.ok(new Set(a.filter(x=>x.role==='control').map(x=>x.well[0])).size>2);
  assert.equal(p.plates[0].reserved.length,0);
  for(const x of a.filter(x=>x.controlType==='vehicle')) {
    assert.ok(Math.abs(x.actualFinalVolume-300.3)<1e-9);
    assert.equal(x.volumes.every(v=>v===0),true);
    assert.equal(x.externalTopUp,0);
    assert.equal(p.plates[0].tasks.filter(t=>t.target===x.well).length,1);
  }
  for(const x of a.filter(x=>x.controlType==='untreated')) {
    assert.equal(x.actualFinalVolume,300);
    assert.equal(p.plates[0].tasks.filter(t=>t.target===x.well).length,0);
  }
  assert.equal(p.summary.pairCoverage.every(c=>c.observed===9),true);
});
test('randomized control positions and treatment assignments repeat with the same seed',()=>{
  assert.deepEqual(signature(D.generateDesign(config())),signature(D.generateDesign(config())));
  assert.notDeepEqual(signature(D.generateDesign(config())),signature(D.generateDesign(config({seed:'different'}))));
});
test('manifest, model matrix, legend and response template include all wells and control labels',()=>{
  const plan=D.generateDesign(config());
  const manifest=C.parseCsv(D.manifestCsv(plan));
  const matrix=C.parseCsv(D.featureMatrixCsv(plan));
  const legend=C.parseCsv(D.featureLegendCsv(plan));
  const response=C.parseCsv(D.measurementsTemplateCsv(plan));
  assert.equal(manifest.length,97);
  assert.equal(matrix.length,97);
  assert.equal(response.length,97);
  assert.ok(manifest[0].includes('control_type'));
  assert.ok(manifest[0].includes('vehicle_dispense_uL'));
  assert.equal(legend.length,73); // 6*2 mains + 15*4 pair features + heading
  assert.equal(matrix[0].length,78); // six metadata cols + 72 model features
  assert.equal(matrix.filter(r=>r[2]==='control').length,24);
  assert.equal(manifest.filter(r=>r[2]==='control').length,24);
  const untreated=matrix.find(r=>r[3]==='untreated');
  assert.ok(untreated.slice(6).every(v=>v==='0'));
  assert.ok(plan.plates[0].assignments.every(a=>a.externalTopUp===0));
});
test('reference controls use a single antibiotic and preserve correct MIC calculation',()=>{
  const c=config({subsetSize:80,controls:{untreated:4,vehicle:4,reference:8,
    vehicleSource:'H12',vehicleName:'Vehicle',vehicleVolume:0.3,
    referenceCompound:'Compound_A',referenceDose:5}});
  const plan=D.generateDesign(c);
  assert.equal(plan.summary.controls,16);
  assert.equal(plan.summary.wells,80);
  const references=plan.plates[0].assignments.filter(a=>a.controlType==='reference');
  assert.equal(references.length,8);
  for(const a of references) {
    assert.deepEqual(a.doses,[5,0,0,0,0,0]);
    assert.ok(Math.abs(a.actualFinalVolume-301.5)<1e-9);
    assert.equal(a.targetMicMultiples[0],5);
    assert.ok(Math.abs(a.actualMicMultiples[0]-(5*300/301.5))<1e-9);
  }
});
test('controls that cannot fit are rejected, and source conflicts are rejected',()=>{
  assert.throws(()=>D.generateDesign(config({controls:{untreated:50,vehicle:47,reference:0}})),/leave at least one treatment well/);
  assert.throws(()=>D.generateDesign(config({controls:{untreated:0,vehicle:2,reference:0,vehicleSource:'A1'}})),/Vehicle source must differ/);
  assert.throws(()=>D.generateDesign(config({controls:{untreated:0,vehicle:1,reference:0,vehicleSource:'H12',vehicleVolume:80}})),/Vehicle dispense is outside/);
  assert.throws(()=>D.generateDesign(config({controls:{untreated:0,vehicle:0,reference:1,referenceCompound:'missing',referenceDose:1}})),/Reference control compound/);
});
test('source-volume checks include vehicle and reference control usage',()=>{
  assert.throws(()=>D.generateDesign(config({sourceCapacity:2})),/exceeding the configured/);
});
test('multi-plate controls repeat per plate and can coexist with previous reserved wells',()=>{
  const p=D.generateDesign(config({subsetSize:100,controls:{untreated:2,vehicle:2,reference:0,
    vehicleSource:'H12',vehicleName:'Vehicle',vehicleVolume:0.3},reserved:'A1:A2'}));
  assert.equal(p.plates.length,2);
  assert.equal(p.summary.controls,8);
  for(const plate of p.plates) {
    assert.equal(plate.assignments.filter(a=>a.role==='control').length,4);
    assert.ok(plate.assignments.every(a=>!['A1','A2'].includes(a.well)));
  }
});
