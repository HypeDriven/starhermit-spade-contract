/* Unit tests for the platform adapter's zip/base64 helpers (node:test).
 * The strict-reader cross-check (python3 zipfile / unzip -t) lives outside
 * this file; these tests pin the structure the cookbook snippet promises. */
'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { writeFileSync, mkdtempSync } = require('node:fs');
const { tmpdir } = require('node:os');
const path = require('node:path');

const Platform = require('../platform.js');
const { zipStore, unzipFirstEntry, bytesToBase64, base64ToBytes, crc32 } = Platform.__zip;

test('crc32 matches the standard check vector', () => {
  // CRC32('123456789') === 0xCBF43926
  assert.equal(crc32(new TextEncoder().encode('123456789')), 0xCBF43926);
});

test('zipStore emits a structurally valid single-entry stored zip', () => {
  const data = new TextEncoder().encode(JSON.stringify({ version: 1, match: { seed: 42 } }));
  const zip = zipStore('save.json', data);
  const dv = new DataView(zip.buffer, zip.byteOffset, zip.byteLength);

  // Local file header at offset 0.
  assert.equal(dv.getUint32(0, true), 0x04034b50);
  assert.equal(dv.getUint16(8, true), 0); // stored (no compression)
  assert.equal(dv.getUint32(14, true), crc32(data)); // CRC in header
  assert.equal(dv.getUint32(18, true), data.length); // compressed size
  assert.equal(dv.getUint32(22, true), data.length); // uncompressed size
  const nameLen = dv.getUint16(26, true);
  assert.equal(new TextDecoder().decode(zip.slice(30, 30 + nameLen)), 'save.json');

  // Central directory record where the EOCD says it is.
  const eocdOff = zip.length - 22; // no comment field written
  assert.equal(dv.getUint32(eocdOff, true), 0x06054b50);
  assert.equal(dv.getUint16(eocdOff + 10, true), 1); // one entry
  const cdSize = dv.getUint32(eocdOff + 12, true);
  const cdOff = dv.getUint32(eocdOff + 16, true);
  assert.equal(dv.getUint32(cdOff, true), 0x02014b50);
  assert.equal(cdSize + cdOff, eocdOff); // CD ends exactly where the EOCD begins
  assert.equal(dv.getUint32(cdOff + 20, true), data.length);
});

test('zip round-trips through the stored-entry reader', () => {
  const payload = JSON.stringify({ version: 1, savedAt: '2026-09-11T00:00:00Z', match: { round: 3, scores: [120, -30] } });
  const data = new TextEncoder().encode(payload);
  const zip = zipStore('save.json', data);
  const back = unzipFirstEntry(zip);
  assert.equal(new TextDecoder().decode(back), payload);
});

test('base64 round-trips binary save bytes', () => {
  const data = new Uint8Array(4096);
  for (let i = 0; i < data.length; i++) data[i] = (i * 31 + 7) & 0xff;
  const restored = base64ToBytes(bytesToBase64(data));
  assert.deepEqual(restored, data);
});

test('output passes python zipfile + unzip -t (strict readers)', () => {
  const data = new TextEncoder().encode(JSON.stringify({ hello: 'spade-contract' }));
  const dir = mkdtempSync(path.join(tmpdir(), 'spade-zip-'));
  const file = path.join(dir, 'save.zip');
  writeFileSync(file, zipStore('save.json', data));
  const { execFileSync } = require('node:child_process');
  execFileSync('python3', ['-m', 'zipfile', '-t', file]);
  execFileSync('unzip', ['-t', file]);
});
