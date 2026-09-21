import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { OpenMsx } from '../tools/openmsx.mjs';

// Diagnostic only: exercise the fork through guest OUT, without changing the ROM.
const machine = process.argv.find(a => a === 'V9968_Basic' || a.startsWith('Panasonic_'))
  ?? 'Panasonic_FS-A1ST(V9968)';
const msx = new OpenMsx({ rom: 'dist/v9968-basic.rom', machine });
const read = async address => Number(await msx.command(`peek ${address}`));
const block = async (device, address, size) => Buffer.from(await msx.command(
  `binary encode hex [debug read_block {${device}} ${address} ${size}]`), 'hex');
async function waitMarker(value) {
  for (let i = 0; i < 150; i++) {
    if (await read(0xc001) === value) return;
    await msx.advance(0.1);
  }
  throw new Error(`LFMC probe did not reach ${value}: ${await msx.screen()}`);
}
async function pixels() {
  const vram = await block('physical VRAM', 0, 65540);
  return Array.from({ length: 16 }, (_, x) => {
    const packed = vram[((x & 2) << 15) | (x >> 2)];
    return x & 1 ? packed & 15 : packed >> 4;
  });
}
try {
  await msx.advance(16);
  await msx.command('poke 0xc001 0');
  const program = [
    '1 CLEAR 200,&HBFFF:DEFINT A-Z',
    '2 DEFUSR=&HC100:FOR I=0 TO 24:READ A:POKE &HC100+I,A:NEXT',
    '3 DATA 243,62,2,211,153,62,143,211,153,219,153,50,16,192,175,211,153,62,143,211,153,251,201,0,0',
    '10 _SCREEN(7):_CLS(9):_WAIT VDP',
    '20 VDP(13)=3',
    '30 FOR I=33 TO 44:VDP(I)=0:NEXT',
    '40 VDP(41)=16:VDP(43)=1:VDP(45)=5:VDP(46)=0',
    '50 POKE &HC000,0:VDP(47)=&H20',
    '60 A=USR(0):POKE &HC001,1',
    '70 IF PEEK(&HC000)=0 THEN 70',
    '80 OUT &H99,&HF0:OUT &H99,&HAC',
    '90 A=USR(0):POKE &HC001,2',
    '100 A=USR(0):GOTO 100'
  ];
  await msx.type(program.join('\r') + '\rRUN\r');
  await waitMarker(1);
  await msx.advance(0.02);
  assert.equal(await read(0xfcaf), 7, 'Must probe SCREEN 7, not the prompt');
  const before = await pixels();
  const beforeStatus = await read(0xc010);
  assert.ok(beforeStatus & 128, 'Only submit glyph data when S#2.TR is set');
  await msx.command('poke 0xc000 1');
  await waitMarker(2);
  await msx.advance(0.02);
  const after = await pixels();
  const afterStatus = await read(0xc010);
  const result = {
    machine,
    cpu: await msx.command('get_active_cpu'),
    foreground: 5, background: 3, initialColor: 9,
    command: 'LFMC, DX=DY=0, NX=16, NY=1, PSET, first data byte F0h',
    before, beforeStatus, after, afterStatus,
    commandRegisters: [...await block('VDP regs', 32, 15)],
    expectedBefore: Array(16).fill(9),
    expectedAfter: [5, 5, 5, 5, 3, 3, 3, 3, ...Array(8).fill(9)],
    program
  };
  result.matchesDocumentedTransfer = before.every(c => c === 9)
    && after.every((c, i) => c === result.expectedAfter[i])
    && Boolean(afterStatus & 1);
  await mkdir('build', { recursive: true });
  const output = `build/lfmc-probe-${machine === 'V9968_Basic' ? 'z80' : 'r800'}.json`;
  await writeFile(output, JSON.stringify(result, null, 2) + '\n');
  console.log(JSON.stringify(result, null, 2));
  console.log(`Diagnostic saved: ${output}`);
} finally {
  await msx.stop();
}
