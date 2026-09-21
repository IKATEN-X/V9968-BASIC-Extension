'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { decodeSc2, decodeSc5, parseCsvPalette, unpackFile } = require('../decoder');

function bsave(data, start = 0) {
  const header = Buffer.alloc(7);
  header[0] = 0xfe;
  header.writeUInt16LE(start, 1);
  header.writeUInt16LE(start + data.length - 1, 3);
  return Buffer.concat([header, data]);
}

test('decodes both nibbles of a SCREEN 5 byte', () => {
  const image = decodeSc5(bsave(Buffer.from([0x2e])));
  assert.equal(image.width, 256);
  assert.equal(image.height, 1);
  assert.deepEqual([...image.rgba.subarray(0, 4)], [33, 200, 66, 255]);
  assert.deepEqual([...image.rgba.subarray(4, 8)], [204, 204, 204, 255]);
});

test('uses the SCREEN 2 name, pattern and color tables', () => {
  const vram = Buffer.alloc(0x3800);
  vram[0] = 0x80;
  vram[0x1800] = 0;
  vram[0x2000] = 0x21;
  const image = decodeSc2(vram);
  assert.deepEqual([...image.rgba.subarray(0, 4)], [33, 200, 66, 255]);
  assert.deepEqual([...image.rgba.subarray(4, 8)], [0, 0, 0, 255]);
});

test('places a BSAVE payload at its declared VRAM start address', () => {
  const parsed = unpackFile(bsave(Buffer.from([1, 2, 3]), 0x1234));
  assert.equal(parsed.start, 0x1234);
  assert.deepEqual([...parsed.data], [1, 2, 3]);
});

test('parses the project CSV palette and scales 5-bit components', () => {
  const palette = parseCsvPalette('2,31,0,16\n');
  assert.deepEqual(palette[2], [255, 0, 132]);
});

test('accepts the demo PALETTE.DAT color-count header', () => {
  const palette = parseCsvPalette('16\r\n0,0,0,0\r\n1,2,3,5\r\n15,31,31,31\r\n');
  assert.deepEqual(palette[1], [16, 25, 41]);
  assert.deepEqual(palette[15], [255, 255, 255]);
});

test('does not scale dark entries in an 8-bit CSV palette', () => {
  const palette = parseCsvPalette('2,10,20,30\n3,128,64,32\n');
  assert.deepEqual(palette[2], [10, 20, 30]);
});

test('rejects truncated BSAVE data', () => {
  const file = bsave(Buffer.from([1]));
  file.writeUInt16LE(10, 3);
  assert.throws(() => decodeSc5(file), /truncated/);
});
