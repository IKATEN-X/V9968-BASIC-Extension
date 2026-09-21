'use strict';

const DEFAULT_PALETTE = Object.freeze([
  [0, 0, 0],       [0, 0, 0],       [33, 200, 66],    [94, 220, 120],
  [84, 85, 237],   [125, 118, 252], [212, 82, 77],    [66, 235, 245],
  [252, 85, 84],   [255, 121, 120], [212, 193, 84],   [230, 206, 128],
  [33, 176, 59],   [201, 91, 186],  [204, 204, 204],  [255, 255, 255]
]);

function unpackFile(input) {
  const bytes = Buffer.from(input);
  if (bytes.length >= 7 && bytes[0] === 0xfe) {
    const start = bytes.readUInt16LE(1);
    const end = bytes.readUInt16LE(3);
    if (end < start) throw new Error('BSAVE header has an end address before its start address.');
    const declaredLength = end - start + 1;
    const availableLength = bytes.length - 7;
    if (availableLength < declaredLength) {
      throw new Error(`BSAVE data is truncated (expected ${declaredLength} bytes, found ${availableLength}).`);
    }
    return { data: bytes.subarray(7, 7 + declaredLength), start, header: true };
  }
  return { data: bytes, start: 0, header: false };
}

function makeVram(file, minimumSize) {
  const unpacked = unpackFile(file);
  const end = unpacked.start + unpacked.data.length;
  const vram = Buffer.alloc(Math.max(minimumSize, end));
  unpacked.data.copy(vram, unpacked.start);
  return { ...unpacked, vram, end };
}

function putPixel(rgba, pixel, color, palette) {
  const offset = pixel * 4;
  const rgb = palette[color & 15] || DEFAULT_PALETTE[color & 15];
  rgba[offset] = rgb[0];
  rgba[offset + 1] = rgb[1];
  rgba[offset + 2] = rgb[2];
  rgba[offset + 3] = 255;
}

function decodeSc2(file, palette = DEFAULT_PALETTE) {
  const image = makeVram(file, 0x3800);
  if (image.end < 0x3800) {
    throw new Error('SCREEN 2 data must include VRAM through address &H37FF.');
  }
  const width = 256;
  const height = 192;
  const rgba = Buffer.alloc(width * height * 4);
  for (let y = 0; y < height; y++) {
    const tileY = y >> 3;
    const bankOffset = (tileY >> 3) * 0x800;
    const row = y & 7;
    for (let tileX = 0; tileX < 32; tileX++) {
      const character = image.vram[0x1800 + tileY * 32 + tileX];
      const patternOffset = bankOffset + character * 8 + row;
      const pattern = image.vram[patternOffset];
      const color = image.vram[0x2000 + patternOffset];
      const foreground = color >> 4;
      const background = color & 15;
      const firstPixel = y * width + tileX * 8;
      for (let bit = 0; bit < 8; bit++) {
        putPixel(rgba, firstPixel + bit, pattern & (0x80 >> bit) ? foreground : background, palette);
      }
    }
  }
  return { width, height, rgba, header: image.header, start: image.start, byteLength: image.data.length };
}

function decodeSc5(file, palette = DEFAULT_PALETTE) {
  const image = makeVram(file, 0);
  if (!image.data.length) throw new Error('SCREEN 5 data is empty.');
  if (image.start >= 0x8000) throw new Error('SCREEN 5 data starts outside the first 256-line page.');
  const storedEnd = Math.min(0x8000, image.end);
  const height = Math.max(1, Math.min(256, Math.ceil(storedEnd / 128)));
  const width = 256;
  const rgba = Buffer.alloc(width * height * 4);
  for (let y = 0; y < height; y++) {
    for (let byteX = 0; byteX < 128; byteX++) {
      const packed = image.vram[y * 128 + byteX];
      putPixel(rgba, y * width + byteX * 2, packed >> 4, palette);
      putPixel(rgba, y * width + byteX * 2 + 1, packed & 15, palette);
    }
  }
  return { width, height, rgba, header: image.header, start: image.start, byteLength: image.data.length };
}

function parseCsvPalette(text) {
  const palette = DEFAULT_PALETTE.map(rgb => [...rgb]);
  const entries = [];
  let declaredCount = null;
  for (const sourceLine of text.replace(/^\ufeff/, '').split(/\r?\n/)) {
    const line = sourceLine.replace(/[#;].*$/, '').trim();
    if (!line) continue;
    const values = line.split(/[\s,]+/).map(Number);
    if (values.length === 1 && entries.length === 0 && declaredCount === null &&
        Number.isInteger(values[0]) && values[0] > 0) {
      declaredCount = values[0];
      continue;
    }
    if (values.length !== 4 || values.some(value => !Number.isFinite(value))) {
      throw new Error('Palette lines must be: index, red, green, blue (an optional color count may appear first)');
    }
    const [index, ...components] = values;
    if (!Number.isInteger(index) || index < 0 || index > 15) continue;
    entries.push([index, components]);
  }
  if (!entries.length) throw new Error('The palette does not contain entries 0 through 15.');
  if (declaredCount !== null && declaredCount < entries.length) {
    throw new Error(`Palette declares ${declaredCount} colors but contains ${entries.length} entries.`);
  }
  const scale = entries.every(([, components]) => components.every(value => value >= 0 && value <= 31)) ? 255 / 31 : 1;
  for (const [index, components] of entries) {
    palette[index] = components.map(value => Math.max(0, Math.min(255, Math.round(value * scale))));
  }
  return palette;
}

function decode(file, extension, palette = DEFAULT_PALETTE) {
  switch (extension.toLowerCase()) {
    case '.sc2': return decodeSc2(file, palette);
    case '.sc5': return decodeSc5(file, palette);
    default: throw new Error(`Unsupported MSX image extension: ${extension}`);
  }
}

module.exports = { DEFAULT_PALETTE, decode, decodeSc2, decodeSc5, parseCsvPalette, unpackFile };
