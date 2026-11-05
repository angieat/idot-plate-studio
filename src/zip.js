/* Dependency-free ZIP writer: UTF-8, STORE method, files under 4 GiB. */
(function(root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.IDotZip = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function() {
  'use strict';
  const encoder = new TextEncoder();
  const crcTable = Array.from({length:256}, (_, i) => {
    let n = i;
    for (let k = 0; k < 8; k++) n = (n & 1) ? 0xEDB88320 ^ (n >>> 1) : (n >>> 1);
    return n >>> 0;
  });
  function crc32(data) {
    let crc = 0xFFFFFFFF;
    for (const b of data) crc = crcTable[(crc ^ b) & 255] ^ (crc >>> 8);
    return (crc ^ 0xFFFFFFFF) >>> 0;
  }
  function write16(data, offset, n) { data[offset] = n & 255; data[offset+1] = (n >>> 8) & 255; }
  function write32(data, offset, n) { write16(data, offset, n); write16(data, offset+2, n >>> 16); }
  function zipFiles(entries) {
    if (!Array.isArray(entries) || entries.length === 0 || entries.length > 1000) throw new Error('ZIP requires 1–1000 files.');
    const chunks = [], central = [];
    let offset = 0;
    for (const entry of entries) {
      const name = String(entry.name);
      if (!name || name.startsWith('/') || name.includes('..') || /[\\\r\n]/.test(name)) throw new Error('Invalid ZIP entry name');
      const nameBytes = encoder.encode(name), data = encoder.encode(String(entry.content));
      const crc = crc32(data);
      const local = new Uint8Array(30 + nameBytes.length);
      write32(local, 0, 0x04034b50); write16(local, 4, 20); write16(local, 6, 0x0800);
      write16(local, 8, 0); write32(local, 14, crc); write32(local, 18, data.length); write32(local, 22, data.length);
      write16(local, 26, nameBytes.length); local.set(nameBytes, 30);
      chunks.push(local, data);
      const record = new Uint8Array(46 + nameBytes.length);
      write32(record, 0, 0x02014b50); write16(record, 4, 20); write16(record, 6, 20);
      write16(record, 8, 0x0800); write32(record, 16, crc); write32(record, 20, data.length);
      write32(record, 24, data.length); write16(record, 28, nameBytes.length); write32(record, 42, offset);
      record.set(nameBytes, 46); central.push(record);
      offset += local.length + data.length;
    }
    const centralOffset = offset, centralSize = central.reduce((n,r)=>n+r.length,0);
    const end = new Uint8Array(22);
    write32(end, 0, 0x06054b50); write16(end, 8, entries.length); write16(end, 10, entries.length);
    write32(end, 12, centralSize); write32(end, 16, centralOffset);
    return new Blob([...chunks, ...central, end], { type: 'application/zip' });
  }
  return { crc32, zipFiles };
});
