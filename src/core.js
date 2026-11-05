/* I.DOT Plate Studio — independent, offline CSV layout utilities. MIT licensed. */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.IDotCore = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  const FORMATS = Object.freeze({
    96: Object.freeze({ rows: 8, cols: 12 }),
    384: Object.freeze({ rows: 16, cols: 24 }),
    1536: Object.freeze({ rows: 32, cols: 48 })
  });
  const TASK_HEADER = Object.freeze(['Source Well', 'Target Well', 'Volume [µL]', 'Liquid Name']);

  function formatInfo(format) {
    const info = FORMATS[Number(format)];
    if (!info) throw new Error('Unsupported plate format: ' + format);
    return info;
  }
  function rowName(index) {
    if (!Number.isInteger(index) || index < 0) throw new Error('Invalid row index');
    let name = '';
    do { name = String.fromCharCode(65 + index % 26) + name; index = Math.floor(index / 26) - 1; } while (index >= 0);
    return name;
  }
  function rowIndex(name) {
    let n = 0;
    for (const ch of name) n = n * 26 + ch.charCodeAt(0) - 64;
    return n - 1;
  }
  function parseWell(well, format) {
    const match = /^([A-Za-z]+)0*([1-9][0-9]*)$/.exec(String(well || '').trim());
    if (!match) throw new Error('Invalid well position: ' + String(well));
    const r = rowIndex(match[1].toUpperCase());
    const c = Number(match[2]) - 1;
    const dims = formatInfo(format);
    if (r >= dims.rows || c >= dims.cols) throw new Error('Well ' + well + ' is outside the ' + format + '-well plate');
    return { row: r, col: c, name: rowName(r) + (c + 1) };
  }
  function allWells(format) {
    const { rows, cols } = formatInfo(format);
    const result = [];
    for (let r = 0; r < rows; r++) for (let c = 1; c <= cols; c++) result.push(rowName(r) + c);
    return result;
  }
  function orderTasks(tasks, format) {
    return tasks.slice().sort((a, b) => {
      const x = parseWell(a.target, format), y = parseWell(b.target, format);
      return x.row - y.row || x.col - y.col || a.liquid.localeCompare(b.liquid) || a.source.localeCompare(b.source);
    });
  }
  function cleanLiquid(text) {
    const v = String(text == null ? '' : text).trim();
    if (!v) throw new Error('Liquid name cannot be empty');
    if (/^[=+@\-\t\r]/.test(v)) throw new Error('Liquid name begins with a spreadsheet formula character: ' + v);
    if (/[\r\n]/.test(v)) throw new Error('Liquid name cannot contain a line break');
    return v;
  }
  function makeTask(record, sourceFormat, targetFormat) {
    const source = parseWell(record.source, sourceFormat).name;
    const target = parseWell(record.target, targetFormat).name;
    const raw = String(record.volume == null ? '' : record.volume).trim();
    if (!/^(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?$/.test(raw)) throw new Error('Invalid dispense volume: ' + raw);
    const volume = Number(raw);
    if (!Number.isFinite(volume) || volume <= 0) throw new Error('Dispense volume must be greater than zero');
    return { source, target, volume, liquid: cleanLiquid(record.liquid) };
  }
  function numberText(v) { return Number(Number(v).toPrecision(12)).toString(); }
  function csvCell(value) {
    const s = String(value == null ? '' : value);
    return /[",\r\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
  }
  function csvRows(rows, newline) { return rows.map(row => row.map(csvCell).join(',')).join(newline || '\r\n') + (newline || '\r\n'); }
  function parseCsv(text) {
    let contents = String(text || '').replace(/^\uFEFF/, '');
    const rows = [], row = [];
    let cell = '', inQuotes = false;
    for (let i = 0; i < contents.length; i++) {
      const ch = contents[i];
      if (inQuotes) {
        if (ch === '"' && contents[i + 1] === '"') { cell += '"'; i++; }
        else if (ch === '"') inQuotes = false;
        else cell += ch;
      } else if (ch === '"' && cell === '') inQuotes = true;
      else if (ch === ',') { row.push(cell); cell = ''; }
      else if (ch === '\n' || ch === '\r') {
        if (ch === '\r' && contents[i + 1] === '\n') i++;
        row.push(cell); rows.push(row.splice(0)); cell = '';
      } else cell += ch;
    }
    if (inQuotes) throw new Error('CSV has an unclosed quoted value');
    if (cell !== '' || row.length) { row.push(cell); rows.push(row); }
    return rows;
  }
  function headerCanonical(value) { return String(value || '').trim().toLowerCase().replace(/[µμ]/g, 'u').replace(/[^a-z0-9]/g, ''); }
  function isTaskHeader(row) {
    if (!row || row.length < 4) return false;
    const cells = row.slice(0, 4).map(headerCanonical);
    return /^sourcewell$/.test(cells[0]) && /^(targetwell|destinationwell)$/.test(cells[1]) && /^(volumeul|volume|dispensevolumeul)$/.test(cells[2]) && /^(liquidname|liquid)$/.test(cells[3]);
  }
  function detectLabelFormat(value) {
    const matches = String(value || '').match(/(?:^|[^\d])(1536|384|96)(?=[^\d]|$)/);
    return matches ? Number(matches[1]) : null;
  }
  function importCsv(text, sourceFormat, targetFormat) {
    const rows = parseCsv(text);
    if (!rows.length) throw new Error('CSV is empty');
    const full = rows.length >= 4 && isTaskHeader(rows[3]);
    const list = !full && isTaskHeader(rows[0]);
    const firstTask = full ? 4 : list ? 1 : 0;
    if (!full && rows[0] && rows[0].length !== 4) throw new Error('CSV row 1 must have exactly four task columns, unless importing an Assay Studio protocol');
    const tasks = [];
    for (let i = firstTask; i < rows.length; i++) {
      const row = rows[i];
      if (row.every(value => !String(value).trim())) continue;
      if (row.length < 4 || row.slice(4).some(x => String(x).trim() !== '')) throw new Error('CSV row ' + (i + 1) + ' must have exactly four task columns');
      try { tasks.push(makeTask({ source: row[0], target: row[1], volume: row[2], liquid: row[3] }, sourceFormat, targetFormat)); }
      catch (err) { throw new Error('CSV row ' + (i + 1) + ': ' + err.message); }
    }
    let template = null;
    if (full) {
      const lines = String(text).replace(/^\uFEFF/, '').split(/\r\n|\n|\r/);
      if (lines.length < 4) throw new Error('Cannot preserve the four-line header');
      template = {
        headerLines: lines.slice(0, 4),
        plateLabel: (rows[1] || [])[4] || '',
        sourceLabel: (rows[1] || [])[0] || '',
        softwareVersion: (rows[0] || [])[1] || '',
        originalName: (rows[0] || [])[0] || ''
      };
    }
    return { tasks, template, full, hasColumnHeader: full || list };
  }
  function validateTemplate(template, targetFormat, sourceFormat) {
    const errors = [], warnings = [];
    if (!template || !Array.isArray(template.headerLines) || template.headerLines.length !== 4 ||
        !isTaskHeader(parseCsv(template.headerLines[3])[0])) {
      errors.push('A valid Assay Studio CSV template with its original four-line header is required for full-protocol export.');
      return { errors, warnings };
    }
    const rows = parseCsv(template.headerLines.join('\n'));
    const dest = detectLabelFormat(rows[1] && rows[1][4]);
    const src = detectLabelFormat(rows[1] && rows[1][0]);
    if (dest && dest !== Number(targetFormat)) errors.push('The template target plate is ' + dest + '-well but the layout is ' + targetFormat + '-well.');
    if (!dest) warnings.push('Target plate format could not be inferred from template. Confirm its labware matches this layout.');
    if (src && src !== Number(sourceFormat)) errors.push('The template source plate is ' + src + '-well but the selected source format is ' + sourceFormat + '-well.');
    if (!src) warnings.push('Confirm template source plate type and physical source consumables.');
    return { errors, warnings };
  }
  function validateTasks(tasks, sourceFormat, targetFormat, maxPerWell) {
    const errors = [], warnings = [], checked = [];
    (tasks || []).forEach((task, i) => {
      try { checked.push(makeTask(task, sourceFormat, targetFormat)); }
      catch (err) { errors.push('Task ' + (i + 1) + ': ' + err.message); }
    });
    const byTarget = {}, liquidsBySource = {};
    for (const task of checked) {
      byTarget[task.target] = (byTarget[task.target] || 0) + task.volume;
      (liquidsBySource[task.source] ||= new Set()).add(task.liquid);
    }
    for (const [source, liquids] of Object.entries(liquidsBySource)) {
      if (liquids.size > 1) errors.push('Source ' + source + ' is assigned more than one liquid name: ' + [...liquids].join(', ') + '.');
    }
    const bound = Number(maxPerWell);
    if (Number.isFinite(bound) && bound > 0) {
      for (const [well, volume] of Object.entries(byTarget)) {
        if (volume > bound + 1e-9) errors.push('Target ' + well + ' has ' + numberText(volume) + ' µL, above the configured ' + bound + ' µL limit.');
      }
    }
    if (!checked.length) errors.push('Add at least one dispensing step.');
    if (checked.some(t => t.volume < 0.008)) warnings.push('Volumes below 0.008 µL (8 nL) need review against instrument and liquid-class specifications.');
    return { errors, warnings, checked };
  }
  function totals(tasks) {
    const sources = {}, targets = {};
    for (const t of tasks) {
      sources[t.source] = (sources[t.source] || 0) + t.volume;
      targets[t.target] = (targets[t.target] || 0) + t.volume;
    }
    return {
      sources, targets, total: tasks.reduce((sum, t) => sum + t.volume, 0),
      stepCount: tasks.length, targetCount: Object.keys(targets).length,
      sourceCount: Object.keys(sources).length
    };
  }
  function exportTaskCsv(tasks, sourceFormat, targetFormat) {
    const ready = validateTasks(tasks, sourceFormat, targetFormat);
    if (ready.errors.length) throw new Error(ready.errors.join(' '));
    return csvRows([TASK_HEADER, ...ready.checked.map(t => [t.source, t.target, numberText(t.volume), t.liquid])]);
  }
  function exportProtocolCsv(tasks, template, name, sourceFormat, targetFormat) {
    const checked = validateTasks(tasks, sourceFormat, targetFormat);
    const validated = validateTemplate(template, targetFormat, sourceFormat);
    const errors = [...checked.errors, ...validated.errors];
    if (errors.length) throw new Error(errors.join(' '));
    // Preserve line 4 byte-for-byte; update only the protocol name in A1.
    const headerLines = template.headerLines.slice();
    const headerFirst = parseCsv(headerLines[0])[0];
    const safeName = String(name || '').trim();
    if (!safeName || /[\r\n]/.test(safeName)) throw new Error('Enter a single-line protocol name');
    headerFirst[0] = safeName;
    headerLines[0] = headerFirst.map(csvCell).join(',');
    const newline = '\r\n';
    return headerLines.join(newline) + newline + checked.checked.map(t => [t.source, t.target, numberText(t.volume), t.liquid].map(csvCell).join(',')).join(newline) + newline;
  }
  return { FORMATS, TASK_HEADER, formatInfo, rowName, parseWell, allWells, orderTasks, makeTask,
    parseCsv, csvRows, csvCell, isTaskHeader, detectLabelFormat, importCsv, validateTemplate,
    validateTasks, totals, exportTaskCsv, exportProtocolCsv, numberText };
});
