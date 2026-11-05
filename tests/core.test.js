'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const C = require('../src/core.js');

const originalHeader = [
  'Original Protocol,1.9.1,Lab User,02/11/2026,09:30',
  'S.100 Plate,Source Plate 1,,8.00E-05,MWP 96,Target Plate 1,,Waste Tube',
  'DispenseToWaste=False,DispenseToWasteCycles=1,DispenseToWasteVolume=5e-8,UseDeionization=False,OptimizationLevel=NoOptimization,WasteErrorHandling=Ask,SaveLiquids=Ask',
  'Source Well,Target Well,Volume [µL],Liquid Name'
];
const full = originalHeader.join('\r\n') + '\r\nA1,B1,0.25,Water\r\nB1,B2,1e-2,"Liquid, A"\r\n';

test('plate labels and boundaries for 96/384/1536', () => {
  assert.equal(C.parseWell('h12', 96).name, 'H12');
  assert.equal(C.parseWell('P24', 384).name, 'P24');
  assert.equal(C.parseWell('AF48', 1536).name, 'AF48');
  assert.equal(C.allWells(1536).length, 1536);
  assert.throws(() => C.parseWell('P24', 96), /outside/);
  assert.throws(() => C.parseWell('A0', 96), /Invalid/);
});

test('CSV handles quoted cells, embedded commas, and scientific volumes', () => {
  const data = C.importCsv('Source Well,Target Well,Volume [µL],Liquid Name\nA1,A1,2.5e-1,"Water, filtered"\n', 96, 96);
  assert.equal(data.tasks[0].volume, 0.25);
  assert.equal(data.tasks[0].liquid, 'Water, filtered');
  assert.equal(data.full, false);
  const roundTrip = C.parseCsv(C.exportTaskCsv(data.tasks, 96, 96));
  assert.deepEqual(roundTrip[1], ['A1', 'A1', '0.25', 'Water, filtered']);
});

test('imports four-line full protocol and preserves exact original line four', () => {
  const imported = C.importCsv(full, 96, 96);
  assert.equal(imported.full, true);
  assert.equal(imported.tasks.length, 2);
  assert.deepEqual(imported.template.headerLines, originalHeader);
  const exported = C.exportProtocolCsv(imported.tasks, imported.template, 'New Protocol', 96, 96);
  const lines = exported.split('\r\n');
  assert.equal(lines[3], originalHeader[3]);
  assert.equal(lines[1], originalHeader[1]);
  assert.equal(lines[2], originalHeader[2]);
  assert.equal(lines[0].split(',')[0], 'New Protocol');
  assert.equal(C.importCsv(exported, 96, 96).tasks[1].liquid, 'Liquid, A');
});

test('refuses full protocol without original template or with mismatched plate', () => {
  const tasks = [C.makeTask({source:'A1',target:'A1',volume:1,liquid:'Water'}, 96, 96)];
  assert.throws(() => C.exportProtocolCsv(tasks, null, 'Name', 96, 96), /template/);
  assert.throws(() => C.exportProtocolCsv(tasks, C.importCsv(full, 96, 96).template, 'Name', 96, 384), /target plate/);
});

test('checks volume, source and destination bounds and configured capacity', () => {
  assert.throws(() => C.makeTask({source:'A1',target:'A2',volume:0,liquid:'Water'}, 96, 96), /greater than zero/);
  assert.throws(() => C.makeTask({source:'A1',target:'A2',volume:1,liquid:'=HYPERLINK()'}, 96, 96), /formula/);
  assert.equal(C.validateTasks([{source:'A1',target:'A1',volume:5,liquid:'Water'}], 96, 96, 4).errors.length, 1);
  assert.equal(C.validateTasks([{source:'A1',target:'B1',volume:5,liquid:'Water'}], 96, 96, '').errors.length, 0);
});

test('source and target totals sum multiple liquids at same target', () => {
  const tasks = [
    {source:'A1',target:'B1',volume:0.25,liquid:'A'},
    {source:'A2',target:'B1',volume:0.75,liquid:'B'},
    {source:'A1',target:'B2',volume:0.5,liquid:'A'}
  ];
  assert.equal(C.totals(tasks).total, 1.5);
  assert.equal(C.totals(tasks).targets.B1, 1);
  assert.equal(C.totals(tasks).sources.A1, 0.75);
});

test('rejects improperly formatted CSV rather than quietly stripping extra fields', () => {
  assert.throws(() => C.importCsv('A1,B1,1,Water,unexpected', 96, 96), /exactly four/);
  assert.throws(() => C.parseCsv('A1,B1,1,"unterminated'), /unclosed/);
});


test('one source well cannot represent different liquids in a single plan', () => {
  const invalid = [
    {source:'A1',target:'A1',volume:1,liquid:'Water'},
    {source:'A1',target:'A2',volume:1,liquid:'Buffer'}
  ];
  assert.match(C.validateTasks(invalid, 96, 96).errors.join('; '), /more than one liquid/);
});
