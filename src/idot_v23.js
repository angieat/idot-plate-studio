/* I.DOT Assay Studio 2.3.2.6 CSV import/export — offline; based on user-provided CSV examples. */
(function (root, factory) {
  const core = typeof module === 'object' && module.exports ? require('./core.js') : root.IDotCore;
  const api = factory(core);
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.IDotV23 = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function (C) {
  'use strict';
  const HEADER = Object.freeze([
    'Target Plate', 'Target Plate Type', 'Target Plate Barcode', 'Target Well', 'Waste Well',
    'Source Plate', 'Source Plate Type', 'Source Plate Barcode', 'Source Well', 'Volume [uL]',
    'Liquid Name', 'Additional Volume Per Source Well', 'Liquid Class Name', 'X Offset', 'Y Offset', 'Spot Array'
  ]);
  const VERSION = '2.3.2.6';
  const validText = value => String(value == null ? '' : value);
  const plateName = number => 'Target Plate ' + number;
  function safe(value, what) {
    const v = validText(value).trim();
    if (!v || /[\r\n]/.test(v) || /^[=+@\-\t\r]/.test(v)) throw new Error(what + ' is empty or unsafe: ' + v);
    return v;
  }
  function toIdotWell(well, format) {
    const pos = C.parseWell(well, format), col = String(pos.col + 1).padStart(2, '0');
    if (Number(format) === 1536) {
      return String.fromCharCode(65 + pos.row % 8) + String.fromCharCode(97 + Math.floor(pos.row / 8)) + col;
    }
    return C.rowName(pos.row) + col;
  }
  function fromIdotWell(well, format) {
    const text = validText(well).trim();
    if (Number(format) === 1536) {
      const m = /^([A-H])([a-d])0?([1-9][0-9]?)$/.exec(text);
      if (m) return C.parseWell(C.rowName((m[2].charCodeAt(0) - 97) * 8 + m[1].charCodeAt(0) - 65) + Number(m[3]), format).name;
    }
    return C.parseWell(text, format).name;
  }
  function scientific(number) {
    const n = Number(number);
    if (!Number.isFinite(n) || n < 0) throw new Error('Non-finite or negative number is not supported');
    if (n === 0) return '0e0';
    const [mantissa, exponent] = n.toExponential(11).split('e');
    return Number(mantissa).toString() + 'e' + Number(exponent).toString();
  }
  function formatLabel(format) { C.formatInfo(format); return format + '-Well'; }
  function readName(s) {
    const m = /^Target Plate ([1-9]\d*)$/.exec(validText(s));
    if (!m) throw new Error('Unexpected Target Plate value: ' + s);
    return Number(m[1]);
  }
  function headerIsExact(row) { return !!row && row.length === HEADER.length && HEADER.every((x, i) => row[i] === x); }
  function isProtocol(text) {
    const rows = C.parseCsv(text);
    return rows.length >= 5 && rows[0].length === 2 && rows[0][0] === 'sep=' && headerIsExact(rows[4]);
  }
  function importProtocol(text, sourceFormat) {
    const rows = C.parseCsv(text);
    if (rows.length < 6 || rows[0].length !== 2 || rows[0][0] !== 'sep=' || !headerIsExact(rows[4])) {
      throw new Error('Not an Assay Studio 2.3.x 16-column CSV with sep=, and the complete fifth-line table header.');
    }
    if (rows[1].length !== 5 || rows[2].length !== 7 || rows[3].some(v => v.trim())) {
      throw new Error('Assay Studio metadata rows are not in the expected 2.3.2.6 structure.');
    }
    const dims = new Set(), byPlate = new Map(), liquidProfiles = {}, parsed = [];
    const sourceFmt = Number(sourceFormat) || 96;
    for (let i = 5; i < rows.length; i++) {
      const row = rows[i];
      if (row.length === 1 && !row[0]) continue;
      if (row.length !== HEADER.length) throw new Error('Line ' + (i + 1) + ' has ' + row.length + ' columns; expected 16.');
      const match = /^(96|384|1536)-Well$/.exec(row[1]);
      if (!match) throw new Error('Line ' + (i + 1) + ': unsupported Target Plate Type: ' + row[1]);
      const targetFormat = Number(match[1]);
      dims.add(targetFormat);
      const plate = readName(row[0]);
      let task;
      try {
        task = C.makeTask({ source: fromIdotWell(row[8], sourceFmt),
          target: fromIdotWell(row[3], targetFormat), volume: row[9], liquid: row[10] }, sourceFmt, targetFormat);
      } catch (err) { throw new Error('Line ' + (i + 1) + ': ' + err.message); }
      const meta = {
        targetPlate: row[0], targetPlateType: row[1], targetBarcode: row[2], wasteWell: row[4],
        sourcePlate: row[5], sourcePlateType: row[6], sourceBarcode: row[7], additional: row[11],
        liquidClass: row[12], xOffset: row[13], yOffset: row[14], spotArray: row[15],
        originalVolumeText: row[9]
      };
      task.idot = meta; task.targetPlate = plate;
      parsed.push(task);
      if (!byPlate.has(plate)) byPlate.set(plate, []);
      byPlate.get(plate).push(task);
      if (!liquidProfiles[task.liquid]) liquidProfiles[task.liquid] = {
        sourcePlate: meta.sourcePlate, sourcePlateType: meta.sourcePlateType, sourceBarcode: meta.sourceBarcode,
        wasteWell: meta.wasteWell, additional: meta.additional, liquidClass: meta.liquidClass
      };
    }
    if (!parsed.length) throw new Error('The Assay Studio CSV has no dispensing rows.');
    if (dims.size > 1) throw new Error('Mixed plate formats in one import cannot be shown in one plate map.');
    const fmt = [...dims][0];
    const rawLines = validText(text).replace(/^\uFEFF/, '').split(/\r\n|\n|\r/);
    const template = {
      kind: 'idot-v23', headerLines: rawLines.slice(0,5), softwareVersion: rows[1][1],
      originalName: rows[1][0], targetFormat: fmt, sourceFormat: sourceFmt,
      plateLabel: formatLabel(fmt), liquidProfiles,
      defaults: { sourcePlate: parsed[0].idot.sourcePlate, sourcePlateType: parsed[0].idot.sourcePlateType,
        sourceBarcode: parsed[0].idot.sourceBarcode, targetBarcode: parsed[0].idot.targetBarcode,
        wasteWell: parsed[0].idot.wasteWell, liquidClass: parsed[0].idot.liquidClass,
        additional: '0e0', xOffset: '', yOffset: '', spotArray: '' },
      originalPlateNumbers: [...byPlate.keys()].sort((a,b)=>a-b)
    };
    const plates = [...byPlate.entries()].sort((a,b)=>a[0]-b[0]).map(([number,tasks]) => ({number,tasks}));
    return { full:true, tasks: parsed, template, plates, targetFormat: fmt, sourceFormat: sourceFmt, originalName: rows[1][0] };
  }
  // Creates a candidate Assay Studio 2.3.2.6 CSV without an uploaded template.
  // Header/settings are derived from two provided 2.3.2.6 instrument exports;
  // the vendor has not validated a synthesized header or 96-well destination export.
  function createDefaultTemplate(targetFormat, sourceFormat, options={}) {
    const target = Number(targetFormat), source = Number(sourceFormat);
    C.formatInfo(target); C.formatInfo(source);
    if (![96,384].includes(source)) throw new Error('Source format must be 96 or 384 wells.');
    const date = options.date === undefined ? new Date() : new Date(options.date);
    if (!Number.isFinite(date.getTime())) throw new Error('Invalid CSV generation date.');
    const pad = value => String(value).padStart(2, '0');
    const dateLabel = pad(date.getMonth()+1) + '/' + pad(date.getDate()) + '/' + date.getFullYear();
    const hour = date.getHours(), timeLabel = (hour % 12 || 12) + ':' + pad(date.getMinutes()) + ' ' + (hour < 12 ? 'AM' : 'PM');
    const label = safe(options.userLabel === undefined ? 'Plate Studio' : options.userLabel, 'User label');
    const boolSetting = (value, defaultValue, field) => {
      const result = value === undefined ? defaultValue : String(value);
      if (!['True','False'].includes(result)) throw new Error('Invalid ' + field + ': expected True or False.');
      return result;
    };
    const dispenseToWaste = boolSetting(options.dispenseToWaste, 'False', 'DispenseToWaste');
    const useDeionisation = boolSetting(options.useDeionisation, 'True', 'UseDeionisation');
    const saveLiquids = options.saveLiquids === undefined ? 'Never' : String(options.saveLiquids);
    if (!['Never','Ask'].includes(saveLiquids)) throw new Error('SaveLiquids must be Never or Ask.');
    const metadata = [
      'DispenseToWaste=' + dispenseToWaste,
      'DispenseToWasteCycles=3',
      'DispenseToWasteVolume=1e-7',
      'UseDeionisation=' + useDeionisation,
      'OptimizationLevel=ReorderAndParallel',
      'WasteErrorHandlingLevel=Ask',
      'SaveLiquids=' + saveLiquids
    ];
    const makeLine = columns => columns.map(C.csvCell).join(',');
    return {
      kind: 'idot-v23', generated: true, softwareVersion: VERSION,
      originalName: '', targetFormat: target, sourceFormat: source, plateLabel: formatLabel(target),
      headerLines: ['sep=,', makeLine(['Generated_Protocol',VERSION,label,dateLabel,timeLabel]),
        makeLine(metadata), '', makeLine(HEADER)],
      liquidProfiles: {},
      defaults: { sourcePlate:'Source Plate 1',sourcePlateType:'L.100 Plate',sourceBarcode:'',targetBarcode:'',
        wasteWell:'Waste Tube',liquidClass:'VSCY 1 mPa*s (H2O)',additional:'0e0',xOffset:'',yOffset:'',spotArray:'' },
      originalPlateNumbers: []
    };
  }
  function validateTemplate(template, targetFormat, sourceFormat) {
    const errors = [], warnings = [];
    if (!template || template.kind !== 'idot-v23' || !Array.isArray(template.headerLines) || template.headerLines.length !== 5) {
      errors.push('Select Generate new Assay Studio CSV, or import a matching 2.3.x protocol template for template-based export.');
      return { errors, warnings };
    }
    try {
      const rows = C.parseCsv(template.headerLines.join('\r\n'));
      if (rows[0][0] !== 'sep=' || !headerIsExact(rows[4]) || rows[1].length !== 5 || rows[2].length !== 7 || rows[3].some(Boolean)) {
        errors.push('The Assay Studio 2.3.x template header is malformed.');
      }
      if (Number(template.targetFormat) !== Number(targetFormat)) errors.push('The template target plate is ' + template.targetFormat + '-well but the layout is ' + targetFormat + '-well.');
      if (Number(template.sourceFormat) !== Number(sourceFormat)) errors.push('Source format mismatch: template was loaded as ' + template.sourceFormat + '-well, but current source is ' + sourceFormat + '-well.');
      if (rows[1][1] !== VERSION) warnings.push('Template reports software version ' + rows[1][1] + '; tested reference files use ' + VERSION + '.');
    } catch (err) { errors.push('Cannot parse Assay Studio header: ' + err.message); }
    return { errors, warnings };
  }
  function cleanSettings(template, settings) {
    const defaults = template.defaults || {};
    return { sourcePlate: safe(settings.sourcePlate || defaults.sourcePlate || 'Source Plate 1','Source plate'),
      sourcePlateType: safe(settings.sourcePlateType || defaults.sourcePlateType || 'L.100 Plate','Source plate type'),
      sourceBarcode: validText(settings.sourceBarcode ?? defaults.sourceBarcode ?? ''),
      targetBarcode: validText(settings.targetBarcode ?? defaults.targetBarcode ?? ''),
      wasteWell: safe(settings.wasteWell || defaults.wasteWell || 'Waste Tube','Waste well'),
      liquidClass: safe(settings.liquidClass || defaults.liquidClass || 'VSCY 1 mPa*s (H2O)','Liquid class'),
      additional: validText(settings.additional ?? defaults.additional ?? '0e0').trim(),
      xOffset: validText(settings.xOffset ?? ''), yOffset: validText(settings.yOffset ?? ''), spotArray: validText(settings.spotArray ?? '')
    };
  }
  function exportProtocol(tasks, template, name, sourceFormat, targetFormat, options={}) {
    const validation = validateTemplate(template, targetFormat, sourceFormat);
    if (validation.errors.length) throw new Error(validation.errors.join(' '));
    if (!Array.isArray(tasks) || !tasks.length) throw new Error('Cannot export an empty protocol.');
    const title = safe(name, 'Protocol name');
    const settings = cleanSettings(template, options.settings || {});
    const defaultPlate = Number(options.plateNumber) || 1;
    const liquidProfiles = template.liquidProfiles || {};
    const out = [];
    for (const [i, raw] of tasks.entries()) {
      let task;
      try { task = C.makeTask(raw, sourceFormat, targetFormat); }
      catch (err) { throw new Error('Dispense ' + (i + 1) + ': ' + err.message); }
      const plateNo = Number(raw.targetPlate || defaultPlate);
      if (!Number.isSafeInteger(plateNo) || plateNo < 1) throw new Error('Dispense ' + (i + 1) + ': invalid target plate number');
      const meta = raw.idot || {};
      const profile = liquidProfiles[task.liquid] || {};
      const choose = (field) => meta[field] !== undefined ? meta[field] : (profile[field] !== undefined ? profile[field] : settings[field]);
      const additional = validText(choose('additional'));
      if (!/^(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?$/.test(additional) || !Number.isFinite(Number(additional)) || Number(additional)<0) {
        throw new Error('Dispense ' + (i+1) + ': additional source volume must be zero or positive numeric µL');
      }
      const textVolume = meta.originalVolumeText && Number(meta.originalVolumeText) === task.volume ? meta.originalVolumeText : scientific(task.volume);
      const cell = [
        plateName(plateNo), formatLabel(targetFormat), validText(choose('targetBarcode')),
        toIdotWell(task.target, targetFormat), safe(choose('wasteWell'),'Waste well'),
        safe(choose('sourcePlate'),'Source plate'), safe(choose('sourcePlateType'),'Source plate type'),
        validText(choose('sourceBarcode')), toIdotWell(task.source, sourceFormat), textVolume, task.liquid,
        additional, safe(choose('liquidClass'),'Liquid class'), validText(choose('xOffset')),
        validText(choose('yOffset')), validText(choose('spotArray'))
      ];
      out.push(cell);
    }
    const lines = template.headerLines.slice();
    const nameRow = C.parseCsv(lines[1])[0]; nameRow[0] = title;
    lines[1] = nameRow.map(C.csvCell || (x=>x)).join(',');
    return '\uFEFF' + lines.join('\r\n') + '\r\n' + C.csvRows(out, '\r\n');
  }
  function exportCombined(plan, template, name, sourceFormat, targetFormat, options={}) {
    if (!plan || !Array.isArray(plan.plates)) throw new Error('Expected multiple plates');
    const all = [];
    for (const plate of plan.plates) for (const task of plate.tasks) all.push({ ...task, targetPlate: plate.number });
    return exportProtocol(all, template, name, sourceFormat, targetFormat, options);
  }
  return { HEADER, VERSION, isProtocol, importProtocol, createDefaultTemplate, validateTemplate, toIdotWell,
    fromIdotWell, scientific, exportProtocol, exportCombined };
});
