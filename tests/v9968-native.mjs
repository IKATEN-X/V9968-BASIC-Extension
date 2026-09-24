import assert from 'node:assert/strict';
import { OpenMsx } from '../tools/openmsx.mjs';

const machine = process.argv.includes('V9968_Basic')
  ? 'V9968_Basic' : 'Panasonic_FS-A1ST(V9968)';
const msx = new OpenMsx({ rom: 'dist/v9968-basic.rom', machine });
const cases = [
  '_SCREEN(0)',
  'VDP(22)=3:_V9968',
  '_SCREEN(5):VDP(21)=0:_SET PAGE(0,7):_PSET(0,0),5:_WAIT VDP',
  'VDP(22)=VDP(22) OR 1',
  '_PSET(0,0),7',
  '_V9968:_PSET(0,0),6:_WAIT VDP',
  '_SCREEN(0)',
  '_SCREEN(5):_SPRITE(3):SCREEN 7:_WAIT VDP',
  '_PSET(0,0),7',
  '_PATTERN ON(7):_PSET(0,0),8:_WAIT VDP',
  '_PATTERN OFF:_SCREEN(5):_SPRITE(3):SCREEN 8:_WAIT VDP',
  '_PSET(0,0),255',
  '_PATTERN ON(7):_PSET(0,0),9:_WAIT VDP',
  '_PATTERN OFF:_SCREEN(0)'
];
const number = async code => Number(await msx.command(code));
const bytes = async (dev, start, size) => Buffer.from(await msx.command(
  `binary encode hex [debug read_block {${dev}} ${start} ${size}]`), 'hex');
async function run(index, error = 0) {
  await msx.command(`poke 0xc001 0; poke 0xc003 0; poke 0xc000 ${index}`);
  for (let i = 0; i < 100 && !await number('peek 0xc001'); i++) await msx.advance(.1);
  assert.equal(await number('peek 0xc001'), 1, cases[index - 1]);
  assert.equal(await number('peek 0xc003'), error, cases[index - 1]);
  assert.equal(await number('peek 0xc004'), 0, 'BASIC values preserved');
}
async function mode(r20, r21) {
  assert.deepEqual(await bytes('VDP regs', 20, 2), Buffer.from([r20, r21]));
  assert.deepEqual(await bytes('memory', 0xfff3, 2), Buffer.from([r20, r21]),
    'Hardware and BASIC mirrors agree');
}
try {
  await msx.command('set throttle on; set speed 400');
  await msx.advance(12);
  const work = await number('peek16 0xfd2f');
  await msx.command('poke 0xc000 0; poke 0xc002 0; poke 0xc004 0');
  const program = [
    '1 CLEAR 512,&HBFFF:DEFINT A-Z:ON ERROR GOTO 9000',
    '2 QA=12345:DIM QB(1):QB(1)=-234:QC$=STRING$(64,65):POKE &HC002,1',
    '10 IF PEEK(&HC000)=0 THEN 10',
    '20 N=PEEK(&HC000):POKE &HC000,0',
    `30 ON N GOSUB ${cases.map((_, i) => 1000 + i * 100).join(',')}`,
    '40 IF QA<>12345 OR QB(1)<>-234 OR QC$<>STRING$(64,65) THEN POKE &HC004,1',
    '50 POKE &HC001,1:GOTO 10',
    '9000 POKE &HC003,ERR:RESUME 40'
  ];
  cases.forEach((code, i) => program.push(`${1000 + i * 100} ${code}:RETURN`));
  await msx.type(program.join('\r') + '\rRUN\r');
  for (let i = 0; i < 100 && !await number('peek 0xc002'); i++) await msx.advance(.1);
  assert.equal(await number('peek 0xc002'), 1, 'Harness startup');
  await run(1); await mode(0, 1);
  await run(2); await mode(0x11, 2);
  await run(3); await mode(0, 0);
  assert.equal((await number('debug read {physical VRAM} 0x38000')) >> 4, 5,
    'Native mode enables upper VRAM and commands without old ECOM/EVR bits');
  await run(4); await mode(0, 1);
  const before = await bytes('physical VRAM', 0, 262144);
  await run(5, 5);
  assert.deepEqual(await bytes('physical VRAM', 0, 262144), before,
    'Compatibility rejection leaves every VRAM byte unchanged');
  await run(6); await mode(0x11, 0);
  assert.equal((await number('debug read {physical VRAM} 0x38000')) >> 4, 6);
  await run(7); await mode(0, 1);
  for (const [setup, reject, material, color] of [[8, 9, 10, 8], [11, 12, 13, 9]]) {
    await run(setup);
    const snapshot = await bytes('physical VRAM', 0, 262144);
    await run(reject, 5);
    assert.deepEqual(await bytes('physical VRAM', 0, 262144), snapshot,
      'SP3 left active by native SCREEN 7/8 is rejected without mutation');
    await run(material);
    assert.equal((await number('debug read {physical VRAM} 0x38000')) >> 4, color,
      'FG4 remains usable when ordinary planar drawing is rejected');
    assert.deepEqual(await bytes('physical VRAM', 0x37e00, 512), snapshot.subarray(0x37e00, 0x38000),
      'Material drawing preserves the physical SAT');
  }
  await run(14); await mode(0, 1);
  assert.equal(await number('peek16 0xfd2f'), work, 'Resident pointer unchanged');
  assert.equal(await number('peek16 0xfc4a'), 0xbfff, 'No dynamic HIMEM allocation');
  console.log(`PASS [${machine}]: native/compat transitions, R21 preservation, no ECOM/EVR dependency, upper VRAM, SP3 guards/FG4, BASIC mirrors/data and allocation`);
} finally {
  await msx.stop();
}
