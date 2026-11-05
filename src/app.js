/* Browser-only UI. No network requests, cookies, or runtime dependencies. */
(function () {
  'use strict';
  const C = window.IDotCore, V = window.IDotV23, D = window.IDotDesign, Z = window.IDotZip;
  const $ = id => document.getElementById(id);
  const state = { name: 'My_I.DOT_Protocol', sourceFormat: 96, targetFormat: 96, capacity: '',
    tasks: [], selected: new Set(), lastClicked: null, template: null, example: false,
    plan: null, importedPlates: null, activePlate: 0 };

  function announce(message, level) {
    const node = $('alert'); node.textContent = message; node.hidden = false;
    node.className = 'alert' + (level ? ' ' + level : '');
  }
  function errorMessage(err) { announce(err instanceof Error ? err.message : String(err), 'error'); }
  function download(name, text, type) {
    const blob = new Blob([text], { type: type || 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob); const link = document.createElement('a');
    link.href = url; link.download = name; document.body.appendChild(link); link.click(); link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
  }
  function downloadFile(name, blob) {
    const url = URL.createObjectURL(blob), link = document.createElement('a');
    link.href = url; link.download = name; document.body.appendChild(link); link.click(); link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
  }
  function slug(value) { return String(value || 'idot_protocol').trim().replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 90) || 'idot_protocol'; }
  function humanNumber(value) { return Number(C.numberText(value)).toLocaleString(undefined, { maximumFractionDigits: 8 }); }
  function getValidation() {
    const tasks = C.validateTasks(state.tasks, state.sourceFormat, state.targetFormat, state.capacity);
    const template = V.validateTemplate(state.template, state.targetFormat, state.sourceFormat);
    return { tasks, template };
  }
  function readInstrumentSettings() {
    return { sourcePlate: $('idot-source-plate').value, sourcePlateType: $('idot-source-type').value,
      liquidClass: $('idot-liquid-class').value, additional: $('idot-additional').value,
      wasteWell: $('idot-waste-well').value };
  }
  function writeInstrumentSettings(template) {
    if (!template || !template.defaults) return;
    const d = template.defaults;
    for (const [id, field] of [['idot-source-plate','sourcePlate'],['idot-source-type','sourcePlateType'],
      ['idot-liquid-class','liquidClass'],['idot-waste-well','wasteWell']]) {
      $(id).value = d[field] || '';
    }
    $('idot-additional').value = '0'; // Never inherit source overheads for unrelated new liquids.
  }
  function currentPlates() { return state.plan ? state.plan.plates : state.importedPlates; }
  function storeImportedPlate() {
    if (state.importedPlates && state.importedPlates[state.activePlate])
      state.importedPlates[state.activePlate].tasks = state.tasks;
  }
  function getSelectedSorted() {
    return [...state.selected].sort((a, b) => {
      const x = C.parseWell(a, state.targetFormat), y = C.parseWell(b, state.targetFormat);
      return x.row - y.row || x.col - y.col;
    });
  }
  function selectRect(from, to) {
    const a = C.parseWell(from, state.targetFormat), b = C.parseWell(to, state.targetFormat);
    for (let r = Math.min(a.row, b.row); r <= Math.max(a.row, b.row); r++) {
      for (let c = Math.min(a.col, b.col); c <= Math.max(a.col, b.col); c++) state.selected.add(C.rowName(r) + (c + 1));
    }
  }
  function handleWellClick(name, shiftKey) {
    if (shiftKey && state.lastClicked) selectRect(state.lastClicked, name);
    else if (state.selected.has(name)) state.selected.delete(name);
    else state.selected.add(name);
    state.lastClicked = name;
    render();
  }
  function buildPlate(container, format, mode, values) {
    const { rows, cols } = C.formatInfo(format);
    container.replaceChildren();
    container.dataset.format = String(format);
    container.style.setProperty('--rows', rows);
    container.style.setProperty('--cols', cols);
    const fragment = document.createDocumentFragment();
    const corner = document.createElement('span'); corner.className = 'axis-label'; fragment.appendChild(corner);
    for (let c = 1; c <= cols; c++) { const label = document.createElement('span'); label.className = 'axis-label'; label.textContent = String(c); fragment.appendChild(label); }
    const max = Math.max(0.001, ...Object.values(values));
    const assignments = mode === 'target' && state.plan ? new Map(state.plan.plates[state.activePlate].assignments.map(x => [x.well, x])) : null;
    const reserved = mode === 'target' && state.plan ? new Set(state.plan.plates[state.activePlate].reserved) : null;
    for (let r = 0; r < rows; r++) {
      const label = document.createElement('span'); label.className = 'axis-label'; label.textContent = C.rowName(r); fragment.appendChild(label);
      for (let c = 1; c <= cols; c++) {
        const well = C.rowName(r) + c;
        const volume = values[well] || 0;
        const button = document.createElement('button');
        button.type = 'button'; button.className = 'well'; button.dataset.well = well;
        button.textContent = well;
        button.setAttribute('aria-label', (mode === 'target' ? 'Target ' : 'Source ') + well + (volume ? ', ' + C.numberText(volume) + ' microliters' : ', empty'));
        if (volume) {
          button.classList.add('filled');
          const strength = 0.23 + 0.58 * Math.sqrt(volume / max);
          button.style.setProperty('--fill', 'rgba(167, 91, 219, ' + strength.toFixed(3) + ')');
        }
        if (assignments) {
          const assignment = assignments.get(well);
          if (assignment) {
            const activeCount = assignment.doses.filter(d => d > 0).length;
            button.classList.add(activeCount === 0 ? 'assigned-zero' : 'generated');
            if (activeCount > 0) {
              const hues = [0, 205, 192, 165, 280, 325, 23];
              button.style.setProperty('--fill', 'hsla(' + hues[activeCount] + ', 69%, 81%, .90)');
              button.classList.add('filled');
            }
            const doses = state.plan.config.compounds.map((c,i)=> c.name + ': ' + C.numberText(assignment.doses[i])).join(' · ');
            button.title = well + ' · combination #' + assignment.combinationId + ' · replicate ' + assignment.replicate + ' · ' + doses;
            button.setAttribute('aria-label', well + ' · assigned combination ' + assignment.combinationId);
          } else if (reserved.has(well)) {
            button.classList.add('reserved'); button.title = well + ' · reserved / no compound assignment';
            button.setAttribute('aria-label', well + ', reserved');
          }
        }
        if (mode === 'target') {
          if (state.selected.has(well)) button.classList.add('selected');
          button.setAttribute('aria-pressed', String(state.selected.has(well)));
        } else if ($('source-well').value.trim().toUpperCase() === well) button.classList.add('source-active');
        button.title = well + (volume ? ' · ' + humanNumber(volume) + ' µL' : ' · empty');
        fragment.appendChild(button);
      }
    }
    container.appendChild(fragment);
  }
  function renderWellDetails() {
    const root = $('well-details'); root.replaceChildren();
    const names = getSelectedSorted();
    $('selected-count').textContent = names.length + ' selected';
    $('selected-summary').textContent = names.length ? names.length + ' target well' + (names.length > 1 ? 's' : '') : 'Choose target wells';
    if (!names.length) { root.textContent = 'Select one or more target wells to review their planned steps.'; return; }
    for (const name of names.slice(0, 8)) {
      const items = state.tasks.filter(t => t.target === name);
      const assignment = state.plan && state.plan.plates[state.activePlate].assignments.find(x => x.well === name);
      const h = document.createElement('h4');
      h.textContent = name + ' · ' + humanNumber(items.reduce((n, t) => n + t.volume, 0)) + ' µL'; root.appendChild(h);
      if (assignment) {
        const entry = document.createElement('div'); entry.className = 'design-warning';
        entry.textContent = 'Combination #' + assignment.combinationId + ', replicate ' + assignment.replicate +
          (state.plan.config.volumeBasis === 'starting'
            ? ' · prefilled medium ' + humanNumber(assignment.startingMedium) + ' µL' +
              ' · total after additions ' + humanNumber(assignment.actualFinalVolume) + ' µL'
            : ' · external top-up ' + humanNumber(assignment.externalTopUp) + ' µL');
        root.appendChild(entry);
        const details = document.createElement('div'); details.className = 'muted';
        details.textContent = state.plan.config.compounds.map((c,i)=> c.name + ': ' + C.numberText(assignment.doses[i]) +
          (state.plan.config.doseMode === 'concentration' ? ' ' + state.plan.config.unit : ' µL') +
          (assignment.actualMicMultiples ? ' → ' + C.numberText(assignment.actualMicMultiples[i]) + '× MIC actual' : '')).join(' · ');
        root.appendChild(details);
      } else if (state.plan && state.plan.plates[state.activePlate].reserved.includes(name)) {
        const details = document.createElement('div'); details.className = 'muted'; details.textContent = 'Reserved well — no automated treatment assignment'; root.appendChild(details);
      }
      if (!items.length) { const empty = document.createElement('div'); empty.textContent = 'No steps'; root.appendChild(empty); }
      for (const task of items) {
        const row = document.createElement('div'); row.className = 'detail-row';
        const liquid = document.createElement('span'); liquid.textContent = task.liquid + ' from ' + task.source;
        const volume = document.createElement('b'); volume.textContent = C.numberText(task.volume) + ' µL';
        row.append(liquid, volume); root.appendChild(row);
      }
    }
    if (names.length > 8) {
      const more = document.createElement('div'); more.textContent = '+ ' + (names.length - 8) + ' more selected wells'; root.appendChild(more);
    }
  }
  function renderSources(sourceTotals) {
    const root = $('source-table'); root.replaceChildren();
    const entries = Object.entries(sourceTotals).sort((a, b) => {
      const x = C.parseWell(a[0], state.sourceFormat), y = C.parseWell(b[0], state.sourceFormat);
      return x.row - y.row || x.col - y.col;
    });
    if (!entries.length) { root.textContent = 'No source wells in use.'; return; }
    const table = document.createElement('table'); table.className = 'compact-table';
    const head = document.createElement('thead'); head.innerHTML = '<tr><th>Source well</th><th>Dispense total</th><th>Preparation estimate</th></tr>'; table.appendChild(head);
    const body = document.createElement('tbody');
    for (const [well, total] of entries) {
      const tr = document.createElement('tr');
      const estimate = $('source-overhead').checked ? total * 1.05 + 1 : total;
      for (const label of [well, humanNumber(total) + ' µL', humanNumber(estimate) + ' µL']) {
        const td = document.createElement('td'); td.textContent = label; tr.appendChild(td);
      }
      body.appendChild(tr);
    }
    table.appendChild(body); root.appendChild(table);
  }
  function renderValidation(validation) {
    const root = $('validation'); root.replaceChildren();
    const errs = validation.tasks.errors; const warns = [...validation.tasks.warnings, ...validation.template.warnings];
    const ready = errs.length === 0;
    const badge = $('valid-badge'); badge.className = 'status-chip' + (ready ? ' ok' : '');
    badge.textContent = ready ? 'Tasks valid' : 'Review tasks';
    if (ready) { const p = document.createElement('div'); p.className = 'ok'; p.textContent = 'Task-list CSV is ready to download.'; root.appendChild(p); }
    const renderMessages = (arr, cls) => {
      if (!arr.length) return;
      const list = document.createElement('ul'); list.className = cls;
      for (const message of arr.slice(0, 12)) { const li = document.createElement('li'); li.textContent = message; list.appendChild(li); }
      if (arr.length > 12) { const li = document.createElement('li'); li.textContent = (arr.length - 12) + ' additional issues'; list.appendChild(li); }
      root.appendChild(list);
    };
    renderMessages(errs, 'err');
    if (!state.template) {
      const p = document.createElement('p'); p.className = 'warn'; p.textContent = 'Import an Assay Studio CSV for full-protocol export.'; root.appendChild(p);
    } else renderMessages(validation.template.errors, 'err');
    renderMessages(warns, 'warn');
    $('export-list').disabled = !ready;
    $('export-manifest').disabled = !state.plan;
    $('export-batch').disabled = !state.plan;
    $('export-protocol').disabled = !ready || !!validation.template.errors.length;
    const plateGroup = currentPlates();
    $('export-all-protocol').disabled = !plateGroup || !!validation.template.errors.length ||
      plateGroup.some(p => C.validateTasks(p.tasks, state.sourceFormat, state.targetFormat, state.capacity).errors.length > 0);
  }
  function render() {
    const totals = C.totals(state.tasks), validation = getValidation();
    buildPlate($('plate-grid'), state.targetFormat, 'target', totals.targets);
    buildPlate($('source-grid'), state.sourceFormat, 'source', totals.sources);
    $('step-count').textContent = totals.stepCount.toLocaleString();
    $('summary-steps').textContent = totals.stepCount.toLocaleString();
    $('summary-targets').textContent = totals.targetCount.toLocaleString();
    $('summary-total').textContent = humanNumber(totals.total) + ' µL';
    $('target-count').textContent = state.plan ?
      state.plan.plates[state.activePlate].assignments.length + ' assigned wells' +
        (state.plan.plates[state.activePlate].reserved.length ? ' · ' + state.plan.plates[state.activePlate].reserved.length + ' reserved' : '') :
      totals.targetCount + ' filled wells';
    $('source-count').textContent = totals.sourceCount + ' used wells';
    $('template-status').textContent = state.template ? 'Assay Studio ' + (state.template.softwareVersion || 'unknown') + ' · ' + (state.template.plateLabel || 'unknown target') + ' · 16-column CSV' : 'No 2.3.x instrument CSV template loaded';
    renderWellDetails(); renderSources(totals.sources); renderValidation(validation);
    renderPlateNavigation();
    const locked = !!state.plan;
    for (const id of ['source-well', 'dispense-volume', 'liquid-name', 'apply-mode', 'apply', 'remove-selected']) $(id).disabled = locked;
    $('clear-design').disabled = !locked;
    $('design-status').textContent = locked ? 'Generated · ' + state.plan.summary.plates + ' plate(s) · ' +
      state.plan.summary.wells + ' assignments. Manual editor locked until design is cleared.' : 'No randomized design generated yet.';
    try {
      const preview = state.template && !validation.template.errors.length && !validation.tasks.errors.length
        ? V.exportProtocol(state.tasks, state.template, state.name, state.sourceFormat, state.targetFormat,
            { plateNumber: state.plan ? state.activePlate + 1 : (state.importedPlates ? state.importedPlates[state.activePlate].number : 1), settings: readInstrumentSettings() })
        : state.tasks.length ? C.exportTaskCsv(state.tasks, state.sourceFormat, state.targetFormat) : '';
      $('csv-preview').textContent = preview ? preview.split(/\r?\n/).slice(0, 14).join('\n') : 'Add valid transfers to preview CSV.';
    } catch (_) { $('csv-preview').textContent = 'Resolve validation issues to preview the export.'; }
  }
  function setFormats(format, kind) {
    if (state.plan || state.importedPlates) {
      $(kind === 'targetFormat' ? 'target-format' : 'source-format').value = String(state[kind]);
      return announce('Plate formats are locked while a generated design or multi-plate import is active. Import a new template or load an example to switch formats.', 'error');
    }
    const old = state[kind];
    const next = Number(format);
    try {
      for (const task of state.tasks) C.parseWell(kind === 'targetFormat' ? task.target : task.source, next);
      state[kind] = next;
      if (kind === 'targetFormat') {
        state.selected = new Set([...state.selected].filter(w => { try { C.parseWell(w, next); return true; } catch (_) { return false; } }));
        state.lastClicked = null;
      }
    } catch (_) {
      $(kind === 'targetFormat' ? 'target-format' : 'source-format').value = String(old);
      announce('Cannot change plate format: existing transfers would refer to wells outside the new plate. Clear those steps first.', 'error');
    }
    render();
  }
  function applyTransfers() {
    try {
      if (state.plan) throw new Error('Generated design is locked. Return to manual editor before adding steps.');
      const targets = getSelectedSorted();
      if (!targets.length) throw new Error('Select at least one target well.');
      const prototype = { source: $('source-well').value, target: targets[0], volume: $('dispense-volume').value, liquid: $('liquid-name').value };
      C.makeTask(prototype, state.sourceFormat, state.targetFormat);
      const mode = $('apply-mode').value;
      if (mode === 'replace') state.tasks = state.tasks.filter(t => !state.selected.has(t.target));
      for (const target of targets) state.tasks.push(C.makeTask({ ...prototype, target }, state.sourceFormat, state.targetFormat));
      state.example = false; storeImportedPlate();
      render(); announce('Added ' + targets.length + ' dispensing step' + (targets.length === 1 ? '' : 's') + '.', 'success');
    } catch (err) { errorMessage(err); }
  }
  function removeSelected() {
    if (state.plan) return announce('Generated design is locked. Return to manual editor to edit manually.', 'error');
    if (!state.selected.size) return announce('Select the target wells you want to clear.', 'error');
    const before = state.tasks.length;
    state.tasks = state.tasks.filter(t => !state.selected.has(t.target));
    storeImportedPlate(); render(); announce('Removed ' + (before - state.tasks.length) + ' step(s) from selected wells.', 'success');
  }
  async function decodeTextFile(file) {
    const bytes = new Uint8Array(await file.arrayBuffer());
    if (bytes[0] === 0xff && bytes[1] === 0xfe) return new TextDecoder('utf-16le').decode(bytes);
    if (bytes[0] === 0xfe && bytes[1] === 0xff) return new TextDecoder('utf-16be').decode(bytes);
    try { return new TextDecoder('utf-8', { fatal: true }).decode(bytes); }
    catch (_) { return new TextDecoder('windows-1252').decode(bytes); }
  }
  async function readFile(input, action) {
    const file = input.files && input.files[0]; if (!file) return;
    try { await action(await decodeTextFile(file)); }
    catch (err) { errorMessage(err); }
    finally { input.value = ''; }
  }
  function importTaskData(text, requireTemplate) {
    const isInstrument = V.isProtocol(text);
    if (requireTemplate && !isInstrument) throw new Error('Expected an Assay Studio 2.3.x CSV with sep=, and the 16-column row-five table header.');
    if (!requireTemplate && isInstrument) throw new Error('Use “Import Assay Studio CSV” for full 16-column protocols.');
    const parsed = isInstrument ? V.importProtocol(text, state.sourceFormat) : C.importCsv(text, state.sourceFormat, state.targetFormat);
    if (state.plan && parsed.template) {
      state.template = parsed.template; writeInstrumentSettings(parsed.template);
      render(); announce('2.3.x instrument template loaded. Generated randomized plate assignments were preserved; the imported dispensing rows were not applied.', 'success');
      return;
    }
    if (parsed.template) {
      state.template = parsed.template;
      state.targetFormat = parsed.targetFormat; state.sourceFormat = parsed.sourceFormat;
      $('target-format').value = String(state.targetFormat);
      $('source-format').value = String(state.sourceFormat);
      writeInstrumentSettings(parsed.template);
      state.name = parsed.originalName; $('protocol-name').value = state.name;
    }
    state.plan = null; state.activePlate = 0;
    state.importedPlates = parsed.plates && parsed.plates.length > 1 ? parsed.plates : null;
    state.tasks = state.importedPlates ? state.importedPlates[0].tasks : parsed.tasks;
    state.selected.clear(); state.example = false;
    render(); renderDesignSummary();
    announce('Imported ' + parsed.tasks.length + ' transfer(s)' +
      (parsed.plates ? ' across ' + parsed.plates.length + ' target plate(s), with 2.3.x metadata preserved.' : '.'), 'success');
  }
  function saveProject() {
    const data = { formatVersion: 3, name: state.name, sourceFormat: state.sourceFormat, targetFormat: state.targetFormat,
      capacity: state.capacity, tasks: state.tasks, template: state.template, plan: state.plan, importedPlates: state.importedPlates,
      instrumentSettings: readInstrumentSettings(), activePlate: state.activePlate };
    download(slug(state.name) + '.json', JSON.stringify(data, null, 2) + '\n', 'application/json;charset=utf-8');
  }
  function savedFieldsMatch(saved, generated) {
    if (Array.isArray(saved)) return Array.isArray(generated) && saved.length === generated.length &&
      saved.every((item, i) => savedFieldsMatch(item, generated[i]));
    if (saved !== null && typeof saved === 'object') return generated !== null && typeof generated === 'object' &&
      Object.keys(saved).every(key => Object.prototype.hasOwnProperty.call(generated, key) &&
        savedFieldsMatch(saved[key], generated[key]));
    return Object.is(saved, generated);
  }
  function loadProject(text) {
    const project = JSON.parse(text);
    if (!project || ![1,2,3].includes(project.formatVersion) || !Array.isArray(project.tasks)) throw new Error('Not a Plate Studio project JSON file');
    C.formatInfo(project.sourceFormat); C.formatInfo(project.targetFormat);
    const tasks = project.tasks.map(task => ({ ...C.makeTask(task, project.sourceFormat, project.targetFormat),
      ...(project.formatVersion === 3 ? { idot: task.idot, targetPlate: task.targetPlate } : {}) }));
    state.name = String(project.name || 'Imported_Protocol');
    state.sourceFormat = Number(project.sourceFormat); state.targetFormat = Number(project.targetFormat);
    if (![96,384].includes(state.sourceFormat)) throw new Error('Project source format must be 96 or 384');
    state.capacity = project.capacity === undefined ? '' : String(project.capacity);
    state.tasks = tasks; state.template = project.template || null;
    state.plan = null; state.importedPlates = null; state.activePlate = 0;
    if (project.formatVersion >= 2 && project.plan) {
      const regenerated = D.generateDesign(project.plan.config);
      // Older v3 JSON lacks the new v3.1 derived concentration fields. Compare all saved
      // properties recursively against regenerated values to keep legacy projects loadable.
      if (!savedFieldsMatch(project.plan.plates, regenerated.plates)) {
        throw new Error('Saved design differs from deterministic regeneration. Project cannot be opened safely.');
      }
      state.plan = regenerated;
      state.activePlate = Math.min(Math.max(0, Number(project.activePlate) || 0), regenerated.plates.length - 1);
      state.tasks = regenerated.plates[state.activePlate].tasks;
      writeDesignForm(regenerated.config);
    }
    if (project.formatVersion === 3 && Array.isArray(project.importedPlates)) {
      state.importedPlates = project.importedPlates.map(plate => ({ number: plate.number,
        tasks: plate.tasks.map(task => ({ ...C.makeTask(task, state.sourceFormat, state.targetFormat), idot: task.idot, targetPlate: task.targetPlate })) }));
      state.activePlate = Math.min(Math.max(0, Number(project.activePlate) || 0), state.importedPlates.length - 1);
      state.tasks = state.importedPlates[state.activePlate].tasks;
    }
    if (project.instrumentSettings) {
      for (const [id,field] of [['idot-source-plate','sourcePlate'],['idot-source-type','sourcePlateType'],
        ['idot-liquid-class','liquidClass'],['idot-additional','additional'],['idot-waste-well','wasteWell']])
        if (project.instrumentSettings[field] !== undefined) $(id).value = project.instrumentSettings[field];
    } else if (state.template && state.template.kind === 'idot-v23') writeInstrumentSettings(state.template);
    state.selected.clear(); state.example = false;
    $('protocol-name').value = state.name; $('source-format').value = String(state.sourceFormat);
    $('target-format').value = String(state.targetFormat); $('capacity').value = state.capacity;
    render(); renderDesignSummary(); announce('Project loaded. Confirm target plate, source plate, and liquid classes before export.', 'success');
  }
  function loadDemo() {
    state.name = 'EXAMPLE_NOT_FOR_INSTRUMENT'; state.sourceFormat = 96; state.targetFormat = 96;
    state.capacity = ''; state.template = null; state.plan = null; state.importedPlates = null; state.activePlate = 0;
    state.selected = new Set(['A1', 'A2', 'A3', 'A4']);
    state.tasks = [
      ...['A1','A2','A3','A4'].map((target, i) => C.makeTask({ source: 'A1', target, volume: [0.25,0.5,0.75,1][i], liquid:'Example_A' }, 96, 96)),
      ...['A1','A2','A3','A4'].map(target => C.makeTask({ source: 'A2', target, volume: 0.1, liquid:'Example_B' }, 96, 96))
    ];
    state.example = true;
    $('protocol-name').value = state.name; $('source-format').value = '96'; $('target-format').value = '96'; $('capacity').value = '';
    $('liquid-name').value = 'Example_A'; render(); renderDesignSummary();
    announce('Synthetic example loaded. Replace the example liquids and transfer volumes with your validated experimental values.', 'success');
  }
  function renderCompoundRows(compounds) {
    const body = $('compound-rows'); body.replaceChildren();
    for (const item of compounds) {
      const tr = document.createElement('tr');
      for (const [key, value] of [['name',item.name], ['source',item.source], ['stock',item.stock], ['levels',Array.isArray(item.levels) ? item.levels.join(', ') : item.levels]]) {
        const td = document.createElement('td'), input = document.createElement('input');
        input.className = 'compound-' + key;
        input.setAttribute('aria-label', key + ' for ' + item.name);
        input.value = value;
        if (key === 'stock') { input.type = 'number'; input.min = '0'; input.step = 'any'; }
        input.spellcheck = false;
        td.appendChild(input); tr.appendChild(td);
      }
      body.appendChild(tr);
    }
  }
  function readDesignForm() {
    const compounds = [...$('compound-rows').querySelectorAll('tr')].map(tr => ({
      name: tr.querySelector('.compound-name').value,
      source: tr.querySelector('.compound-source').value,
      stock: tr.querySelector('.compound-stock').value,
      levels: tr.querySelector('.compound-levels').value
    }));
    return {
      mode: $('design-mode').value, doseMode: $('design-dose-mode').value,
      volumeBasis: $('design-volume-basis').value,
      targetFormat: state.targetFormat, sourceFormat: state.sourceFormat,
      finalVolume: $('design-final-volume').value, unit: $('design-unit').value,
      maxWellVolume: state.capacity, stockMicMultiple: $('design-stock-mic-multiple').value,
      seed: $('design-seed').value, reserved: $('design-reserved').value,
      subsetSize: $('design-subset-size').value, uniqueCount: $('design-unique-size').value,
      replicates: $('design-replicates').value, compounds,
      addDiluent: $('design-add-diluent').checked, diluentSource: $('design-diluent-source').value,
      diluentName: $('design-diluent-name').value, minTransfer: $('design-min-transfer').value,
      maxTransfer: $('design-max-transfer').value, sourceCapacity: $('design-source-capacity').value
    };
  }
  function writeDesignForm(config) {
    const mapping = {
      'design-mode': config.mode, 'design-dose-mode': config.doseMode,
      'design-volume-basis': config.volumeBasis || 'final',
      'design-final-volume': config.finalVolume, 'design-unit': config.unit,
      'design-stock-mic-multiple': config.stockMicMultiple ?? '',
      'design-seed': config.seed, 'design-reserved': Array.isArray(config.reserved) ? config.reserved.join(',') : config.reserved,
      'design-subset-size': config.subsetSize, 'design-unique-size': config.uniqueCount,
      'design-replicates': config.replicates, 'design-diluent-source': config.diluentSource,
      'design-diluent-name': config.diluentName, 'design-min-transfer': config.minTransfer,
      'design-max-transfer': config.maxTransfer, 'design-source-capacity': config.sourceCapacity
    };
    for (const [id,value] of Object.entries(mapping)) $(id).value = value;
    $('design-add-diluent').checked = !!config.addDiluent;
    renderCompoundRows(config.compounds); updateDesignMode(); updateDoseLabels(); updateVolumeMode();
  }
  function updateDesignMode() {
    const mode = $('design-mode').value;
    for (const el of document.querySelectorAll('[data-show-mode]')) el.hidden = el.dataset.showMode !== mode;
  }
  function updateDoseLabels() {
    const concentration = $('design-dose-mode').value === 'concentration';
    const stockHead = document.querySelector('.compound-table th:nth-child(3)');
    const levelsHead = document.querySelector('.compound-table th:nth-child(4)');
    stockHead.textContent = concentration ? 'Stock concentration (same unit)' : 'Stock (not used in volume mode)';
    levelsHead.textContent = concentration ? 'Target concentrations, comma-separated' : 'Dispense volumes (µL), comma-separated';
    $('design-unit').disabled = !concentration;
    $('design-stock-mic-multiple').disabled = !concentration;
  }
  function updateVolumeMode() {
    const starting = $('design-volume-basis').value === 'starting';
    $('design-volume-label').textContent = starting ? 'Starting medium already in each well (µL)' : 'Final assay volume (µL)';
    $('design-dose-mode').options[0].textContent = starting
      ? 'Nominal target concentration vs starting medium'
      : 'Final concentration from stock';
    $('design-add-diluent').disabled = starting;
    if (starting) $('design-add-diluent').checked = false;
    $('design-caution').textContent = starting
      ? 'Fixed starting medium: every well already contains the specified medium volume. Antibiotics are added on top; no diluent is dispensed or requested. The manifest records final volume and dilution-adjusted concentrations per well. Confirm actual vessel capacity and headspace.'
      : 'Fixed final volume: if top-up transfers are disabled, add the manifest’s external_top_up_uL separately to reach the selected final assay volume. Verify consumables and source volumes.';
  }
  function renderPlateNavigation() {
    const nav = $('plate-navigation'), plates = currentPlates();
    nav.hidden = !plates || plates.length < 2;
    if (!plates) return;
    const select = $('active-plate'), current = state.activePlate;
    if (select.options.length !== plates.length || [...select.options].some((o,i)=>o.value!==String(i))) {
      select.replaceChildren();
      for (const [i,plate] of plates.entries()) {
        const option = document.createElement('option'); option.value = String(i);
        option.textContent = 'Target Plate ' + plate.number; select.appendChild(option);
      }
    }
    select.value = String(current);
    const plate = plates[current];
    $('active-plate-info').textContent = state.plan ?
      plate.assignments.length + ' treatments · ' + plate.tasks.length + ' steps · ' + plate.reserved.length + ' reserved' :
      plate.tasks.length + ' imported dispensing instructions';
  }
  function activatePlate(index) {
    const plates = currentPlates();
    if (!plates || !plates[index]) return;
    storeImportedPlate(); state.activePlate = index;
    state.tasks = plates[index].tasks;
    state.selected.clear(); state.lastClicked = null;
    render();
  }
  function renderDesignSummary() {
    const root = $('design-summary'); root.replaceChildren(); root.hidden = !state.plan;
    if (!state.plan) return;
    const plan = state.plan, top = document.createElement('div'); top.className = 'design-summary-top';
    for (const [label, value] of [
      ['Treatments',plan.summary.wells.toLocaleString()],['Plates',plan.summary.plates.toLocaleString()],
      ['Dispensing steps',plan.summary.transfers.toLocaleString()],['Possible combinations',plan.config.totalPossible.toLocaleString()]
    ]) {
      const cell = document.createElement('div'); cell.className = 'design-metric';
      const valueEl = document.createElement('b'); valueEl.textContent = value;
      const labelEl = document.createElement('span'); labelEl.textContent = label;
      cell.append(valueEl, labelEl); top.appendChild(cell);
    }
    root.appendChild(top);
    const heading = document.createElement('h3'); heading.textContent = 'Level balance across generated assignments'; root.appendChild(heading);
    const table = document.createElement('table'); table.className = 'compact-table';
    const thead = document.createElement('thead'), hrow = document.createElement('tr');
    for (const h of ['Compound','Dose levels → counts']) { const th = document.createElement('th'); th.textContent = h; hrow.appendChild(th); }
    thead.appendChild(hrow); table.appendChild(thead);
    const tbody = document.createElement('tbody');
    for (let i = 0; i < plan.config.compounds.length; i++) {
      const tr = document.createElement('tr');
      for (const v of [plan.config.compounds[i].name, plan.config.compounds[i].levels.map((l,j)=>
        C.numberText(l) + ' → ' + plan.summary.singleLevelCounts[i][j]).join('  ·  ')]) {
        const td = document.createElement('td'); td.textContent = v; tr.appendChild(td);
      }
      tbody.appendChild(tr);
    }
    table.appendChild(tbody); root.appendChild(table);
    const paragraph = document.createElement('p');
    const pair = plan.summary.pairCoverage;
    paragraph.textContent = 'Observed all level pairs for ' + pair.filter(x=>x.observed===x.possible).length + ' / ' + pair.length +
      ' compound pairs. Main effects are balanced by a greedy selection heuristic; this is not a guarantee of balanced higher-order interactions. ' +
      plan.warnings.join(' ');
    root.appendChild(paragraph);
  }
  function generateRandomized() {
    try {
      const config = readDesignForm();
      const plan = D.generateDesign(config);
      // Check every plate before changing the current view.
      for (const plate of plan.plates) {
        const validation = C.validateTasks(plate.tasks, plan.config.sourceFormat, plan.config.targetFormat, state.capacity);
        if (validation.errors.length) throw new Error('Plate ' + plate.number + ': ' + validation.errors.join(' '));
      }
      state.plan = plan; state.importedPlates = null; state.activePlate = 0; state.tasks = plan.plates[0].tasks;
      state.selected.clear(); state.lastClicked = null; state.example = false;
      render(); renderDesignSummary();
      announce('Created ' + plan.summary.wells + ' randomized assignments across ' + plan.plates.length +
        ' plate(s). Download the full experiment manifest to preserve the treatment-to-well map.', 'success');
    } catch (err) { errorMessage(err); }
  }
  function clearGeneratedDesign() {
    if (!state.plan) return;
    // Preserve the visible plate transfers only: other plates must be exported before leaving a plan.
    if (state.plan.plates.length > 1 && !window.confirm('Return to the manual editor? Only the currently viewed plate transfers will remain; the other generated plates and their assignment manifest will be discarded. Download the complete ZIP or project JSON first.')) return;
    state.tasks = state.plan.plates[state.activePlate].tasks.slice();
    state.plan = null; state.activePlate = 0; state.selected.clear(); state.lastClicked = null;
    render(); renderDesignSummary();
    announce('Returned to manual editing. The current plate transfers were kept; the randomized assignment manifest is no longer active.', 'success');
  }
  function exportCombinedProtocol() {
    try {
      const plates = currentPlates();
      if (!plates || !plates.length) throw new Error('No multiple-plate experiment to export.');
      for (const plate of plates) {
        const issues = C.validateTasks(plate.tasks, state.sourceFormat, state.targetFormat, state.capacity);
        if (issues.errors.length) throw new Error('Plate ' + plate.number + ': ' + issues.errors.join('; '));
      }
      const files = plates.map(plate => ({ number: plate.number, tasks: plate.tasks }));
      const csv = V.exportCombined({plates: files}, state.template, state.name,
        state.sourceFormat, state.targetFormat, {settings:readInstrumentSettings()});
      download(slug(state.name) + '_ALL_TARGET_PLATES_assay_studio_2_3.csv', csv);
      announce('Exported one 16-column Assay Studio CSV for ' + plates.length + ' target plates. Validate the import in Assay Studio before running.', 'success');
    } catch (err) { errorMessage(err); }
  }
  function exportBatch() {
    if (!state.plan) return;
    try {
      const plan = state.plan, files = [
        {name:'design_manifest.csv', content:D.manifestCsv(plan)},
        {name:'source_map.csv', content:D.sourceMapCsv(plan)},
        {name:'experiment_config.json', content:JSON.stringify({ name:state.name, ...plan.config,
          summary:plan.summary, warnings:plan.warnings },null,2)+'\n'},
        {name:'README.txt', content:'I.DOT Plate Studio v3.1 randomized design\n\n' +
          'The manifest includes reserved and all-zero-dose wells, even without programmed transfers.\n' +
          'Volume basis: ' + (plan.config.volumeBasis === 'starting' ? 'fixed starting medium; no top-up required.' : 'fixed final volume; external top-up may be required.') + '\n' +
          'The actual_final_volume_uL and per-compound actual-concentration fields describe the prepared mixture, assuming all required steps are performed.\n' +
          'If external_top_up_uL is nonzero, this volume is NOT dispensed by this protocol.\n' +
          'Verify liquid classes, source plate type, additional volume per source well, and instrument settings.\n' +
          'Instrument import is NOT confirmed until tested inside actual Assay Studio 2.3.x.\n'}
      ];
      const template = V.validateTemplate(state.template, state.targetFormat, state.sourceFormat);
      for (const plate of plan.plates) {
        const validation = C.validateTasks(plate.tasks,state.sourceFormat,state.targetFormat,state.capacity);
        if (validation.errors.length) throw new Error('Plate '+plate.number+': '+validation.errors.join(' '));
        const tag = String(plate.number).padStart(3,'0');
        files.push({name:'plates/plate_'+tag+'_tasks.csv',content:C.exportTaskCsv(plate.tasks,state.sourceFormat,state.targetFormat)});
        if (!template.errors.length && plate.tasks.length) {
          files.push({name:'plates/plate_'+tag+'_assay_studio_2_3.csv',content:V.exportProtocol(
            plate.tasks,state.template,state.name+'_plate_'+tag,state.sourceFormat,state.targetFormat,
            {plateNumber:plate.number,settings:readInstrumentSettings()})});
        }
      }
      if (!template.errors.length) files.push({name:'ALL_TARGET_PLATES_assay_studio_2_3.csv',content:
        V.exportCombined(plan,state.template,state.name,state.sourceFormat,state.targetFormat,{settings:readInstrumentSettings()})});
      downloadFile(slug(state.name)+'_all_plates.zip',Z.zipFiles(files));
      announce('ZIP exported for '+plan.plates.length+' plates'+
        (template.errors.length?' (task lists only; load a genuine instrument template for full protocols).':' with one combined I.DOT 2.3.x protocol.'),'success');
    } catch (err) { errorMessage(err); }
  }
  function bind() {
    $('plate-grid').addEventListener('click', ev => {
      const button = ev.target.closest('button[data-well]');
      if (button) handleWellClick(button.dataset.well, ev.shiftKey);
    });
    $('source-grid').addEventListener('click', ev => {
      const button = ev.target.closest('button[data-well]');
      if (button) { $('source-well').value = button.dataset.well; render(); }
    });
    $('select-all').addEventListener('click', () => { state.selected = new Set(C.allWells(state.targetFormat)); render(); });
    $('select-none').addEventListener('click', () => { state.selected.clear(); state.lastClicked = null; render(); });
    $('select-row').addEventListener('click', () => {
      const row = C.parseWell(state.lastClicked || 'A1', state.targetFormat).row;
      const { cols } = C.formatInfo(state.targetFormat);
      for (let c = 1; c <= cols; c++) state.selected.add(C.rowName(row) + c);
      render();
    });
    $('select-col').addEventListener('click', () => {
      const col = C.parseWell(state.lastClicked || 'A1', state.targetFormat).col + 1;
      const { rows } = C.formatInfo(state.targetFormat);
      for (let r = 0; r < rows; r++) state.selected.add(C.rowName(r) + col);
      render();
    });
    $('target-format').addEventListener('change', ev => setFormats(ev.target.value, 'targetFormat'));
    $('design-mode').addEventListener('change', updateDesignMode);
    $('design-dose-mode').addEventListener('change', updateDoseLabels);
    $('design-volume-basis').addEventListener('change', updateVolumeMode);
    $('generate-design').addEventListener('click', generateRandomized);
    $('clear-design').addEventListener('click', clearGeneratedDesign);
    $('active-plate').addEventListener('change', ev => { if (currentPlates()) activatePlate(Number(ev.target.value)); });
    $('export-manifest').addEventListener('click', () => {
      if (!state.plan) return;
      download(slug(state.name) + '_design_manifest.csv', D.manifestCsv(state.plan));
    });
    $('export-batch').addEventListener('click', exportBatch);
    $('export-all-protocol').addEventListener('click', exportCombinedProtocol);
    for (const id of ['idot-source-plate','idot-source-type','idot-liquid-class','idot-additional','idot-waste-well']) $(id).addEventListener('input', render);
    $('source-format').addEventListener('change', ev => setFormats(ev.target.value, 'sourceFormat'));
    $('protocol-name').addEventListener('input', ev => { state.name = ev.target.value; render(); });
    $('capacity').addEventListener('input', ev => { state.capacity = ev.target.value; render(); });
    $('source-overhead').addEventListener('change', render);
    $('source-well').addEventListener('change', render);
    $('apply').addEventListener('click', applyTransfers);
    $('remove-selected').addEventListener('click', removeSelected);
    $('load-template').addEventListener('change', ev => readFile(ev.target, text => importTaskData(text, true)));
    $('load-tasks').addEventListener('change', ev => readFile(ev.target, text => importTaskData(text, false)));
    $('load-project').addEventListener('change', ev => readFile(ev.target, loadProject));
    $('export-json').addEventListener('click', saveProject);
    $('load-demo').addEventListener('click', loadDemo);
    $('export-list').addEventListener('click', () => {
      try { download(slug(state.name) + (state.plan ? '_plate_' + String(state.activePlate + 1).padStart(3,'0') : '') + '_tasks.csv', C.exportTaskCsv(state.tasks, state.sourceFormat, state.targetFormat)); }
      catch (err) { errorMessage(err); }
    });
    $('export-protocol').addEventListener('click', () => {
      try {
        if (getValidation().tasks.errors.length) throw new Error('Resolve task validation issues before exporting.');
        download(slug(state.name) + (state.plan ? '_plate_' + String(state.activePlate + 1).padStart(3,'0') : '') + '_assay_studio.csv', V.exportProtocol(state.tasks, state.template, state.name, state.sourceFormat, state.targetFormat,
          {plateNumber:state.plan ? state.activePlate+1 : (state.importedPlates ? state.importedPlates[state.activePlate].number : 1),settings:readInstrumentSettings()}));
        announce('16-column Assay Studio 2.3.x candidate exported. Validate import and labware/liquid-class settings on the instrument.', 'success');
      } catch (err) { errorMessage(err); }
    });
  }
  renderCompoundRows(D.defaultConfig().compounds); bind(); updateDesignMode(); updateDoseLabels(); updateVolumeMode(); render();
})();
