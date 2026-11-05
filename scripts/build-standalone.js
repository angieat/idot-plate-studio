#!/usr/bin/env node
'use strict';
// Builds an entirely offline Mac-compatible HTML file from the GitHub project sources.
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
let html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const css = fs.readFileSync(path.join(root, 'src/styles.css'), 'utf8');
const link = '<link rel="stylesheet" href="src/styles.css">';
if (!html.includes(link)) throw new Error('Expected stylesheet link is missing from index.html');
html = html.replace(link, '<style>\n' + css + '\n</style>');
const inlineScripts = [];
for (const file of ['src/core.js','src/idot_v23.js','src/design.js','src/zip.js','src/app.js']) {
  const tag = `<script defer src="${file}"></script>`;
  if (!html.includes(tag)) throw new Error('Expected script tag is missing: ' + tag);
  const contents = fs.readFileSync(path.join(root, file), 'utf8');
  if (contents.includes('</script>')) throw new Error('Inline script terminator in ' + file);
  // Inline scripts cannot rely on the HTML `defer` attribute: insert them after
  // the body has been parsed, preserving their original dependency order.
  const fullLine = '  ' + tag + '\n';
  html = html.includes(fullLine) ? html.replace(fullLine, '') : html.replace(tag, '');
  inlineScripts.push('<script>\n' + contents + '\n</script>');
}
if (!html.includes('</body>')) throw new Error('Missing closing body tag');
html = html.replace('</body>', inlineScripts.join('\n') + '\n</body>');
const destination = path.join(root, 'dist/I.DOT_Plate_Studio_v3_1_for_Mac.html');
if (process.argv.includes('--check')) {
  if (!fs.existsSync(destination) || fs.readFileSync(destination, 'utf8') !== html) {
    throw new Error('Standalone HTML is stale. Run: node scripts/build-standalone.js');
  }
  console.log('Standalone distribution is synchronized.');
} else {
  fs.mkdirSync(path.dirname(destination), { recursive: true });
  fs.writeFileSync(destination, html);
  console.log('Built ' + path.relative(root, destination));
}
