import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { OpenMsx, tclString } from '../tools/openmsx.mjs';

const root = resolve(import.meta.dirname, '..');
const machine = process.argv.includes('V9968_Basic') ? 'V9968_Basic' : 'Panasonic_FS-A1ST(V9968)';
const cpu = machine === 'V9968_Basic' ? 'z80' : 'r800';
const quick = process.argv.includes('--quick');
const out = resolve(root, 'build/lfmc-transfer');
await mkdir(out, { recursive: true });
execFileSync(process.env.Z80ASM ?? 'D:/z88dk/bin/z88dk-z80asm.exe',
  ['-b', '-m', `-O=${out}`, '-o=driver.bin', resolve(root, 'tests/lfmc-transfer.asm')],
  { cwd: root, windowsHide: true, stdio: 'pipe' });
const driver = await readFile(resolve(out, 'driver.bin'));
assert.ok(driver.length < 0x700, 'Driver does not overlap payload');
const msx = new OpenMsx({ machine });
const number = async code => Number(await msx.command(code));
const block = async (dev, a, n) => Buffer.from(await msx.command(
  `binary encode hex [debug read_block {${dev}} ${a} ${n}]`), 'hex');
const put = async (a, data) => msx.command(
  `debug write_block memory ${a} [binary format H* ${Buffer.from(data).toString('hex')}]`);
const cases = [], results = [];
const program = [
  '1 CLEAR 200,&HBFFF:DEFINT A-Z',
  '2 DEFUSR0=&HC100:DEFUSR1=&HC103:DEFUSR2=&HC106:DEFUSR3=&HC109:DEFUSR4=&HC10C',
  '3 POKE &HC002,1',
  '10 IF PEEK(&HC000)=0 THEN 10',
  '20 N=PEEK(&HC000):POKE &HC000,0',
  '30 ON N GOSUB 1000,1100,1200,1300,1400,1500',
  '40 POKE &HC001,1:GOTO 10',
  '1000 A=USR3(0):SCREEN PEEK(&HC003):VDP(22)=VDP(22) AND 254:VDP(21)=PEEK(&HC004)',
  '1010 COLOR PEEK(&HC006),PEEK(&HC005),PEEK(&HC005):CLS:RETURN',
  '1100 A=USR0(0):RETURN',
  '1200 A=USR1(0):RETURN',
  '1300 A=USR2(0):RETURN',
  '1400 A=USR3(0):RETURN',
  '1500 A=USR4(0):RETURN'
];
async function run(n) {
  await msx.command(`poke 0xc001 0; poke 0xc000 ${n}`);
  for (let i = 0; i < 100; i++) {
    if (await number('peek 0xc001') === 1) return;
    await msx.advance(.01);
  }
  throw new Error(`Harness command ${n} timeout: ${await msx.screen()}`);
}
function sample(vram, mode, width, height) {
  const values = [];
  for (let y = 64; y < 64 + height; y++) for (let x = 64; x < 64 + width; x++) {
    let a, shift, mask;
    if (mode === 5) [a, shift, mask] = [y * 128 + (x >> 1), (1 - (x & 1)) * 4, 15];
    if (mode === 6) [a, shift, mask] = [y * 128 + (x >> 2), (3 - (x & 3)) * 2, 3];
    if (mode === 7) [a, shift, mask] = [((x & 2) << 15) | (y << 7) | (x >> 2), (1 - (x & 1)) * 4, 15];
    if (mode === 8) [a, shift, mask] = [((x & 1) << 16) | (y << 7) | (x >> 1), 0, 255];
    values.push((vram[a] >> shift) & mask);
  }
  return values;
}
for (const mode of quick ? [7] : [5, 6, 7, 8]) {
  for (const hs of [0, 1]) for (const port of [0, 1]) for (const delayed of [false, true]) {
    cases.push({ mode, hs, port, delayed, width: 16, height: 1, glyph: [0xf0, 0x0f], command: 'LFMC' });
  }
  for (const hs of [0, 1]) for (const port of [0, 1]) for (const guestWait of [1, 2]) {
    cases.push({ mode, hs, port, delayed: false, guestWait, width: 16, height: 1, glyph: [0xf0, 0x0f], command: 'LFMC' });
  }
  cases.push({ mode, hs: 1, port: 0, delayed: true, width: 16, height: 1, glyph: [0xf0, 0x0f], command: 'LMMC' });
  for (const guestWait of [1, 2]) {
    cases.push({ mode, hs: 1, port: 1, delayed: false, guestWait, width: 16, height: 1, glyph: [0xf0, 0x0f], command: 'LMMC' });
  }
  if (!quick) for (const [width, height] of [[8, 1], [8, 16], [16, 16], [13, 2]]) {
    cases.push({ mode, hs: 1, port: 1, delayed: false, width, height,
      glyph: Array.from({ length: Math.ceil(width / 8) * height }, (_, i) => [0xa5, 0x5a, 0xff, 0][i % 4]), command: 'LFMC' });
  }
}
try {
  await msx.command('set throttle on; set speed 400');
  await msx.advance(12);
  assert.equal(await msx.command('get_active_cpu'), cpu);
  await msx.command('poke 0xc000 0; poke 0xc002 0');
  await msx.type(program.join('\r') + '\rRUN\r');
  for (let i = 0; i < 100 && !await number('peek 0xc002'); i++) await msx.advance(.1);
  assert.equal(await number('peek 0xc002'), 1);
  await put(0xc100, driver);
  for (const test of cases) {
    const { mode, hs, port, delayed, guestWait = 0, width, height, glyph, command } = test;
    const [fg, bg, initial] = mode === 6 ? [3, 1, 2] : mode === 8 ? [197, 131, 73] : [5, 3, 9];
    const expected = Array.from({ length: width * height }, (_, i) => {
      const x = i % width, y = Math.floor(i / width);
      return glyph[y * Math.ceil(width / 8) + (x >> 3)] & (0x80 >> (x & 7)) ? fg : bg;
    });
    const payload = command === 'LFMC' ? glyph : expected.slice(1);
    await put(0xc003, [mode, hs, initial, fg, bg, payload.length & 255, payload.length >> 8, port, guestWait]);
    await run(1);
    const registers = Buffer.alloc(15);
    registers.writeUInt16LE(64, 4); registers.writeUInt16LE(64, 6);
    registers.writeUInt16LE(width, 8); registers.writeUInt16LE(height, 10);
    registers[12] = command === 'LFMC' ? fg : expected[0]; registers[14] = command === 'LFMC' ? 0x20 : 0xb0;
    await put(0xc020, registers); await put(0xc800, payload);
    const baseline = await block('physical VRAM', 0, 262144);
    assert.deepEqual(sample(baseline, mode, width, height), Array(width * height).fill(initial));
    let before;
    if (delayed) {
      await run(2); await msx.advance(.05); await run(4);
      before = sample(await block('physical VRAM', 0, 262144), mode, width, height);
      if (command === 'LFMC') assert.deepEqual(before, Array(width * height).fill(initial), 'No premature glyph');
      await run(3);
    } else await run(6);
    await msx.advance(.02); await run(4);
    const status = await number('peek 0xc010');
    const actual = sample(await block('physical VRAM', 0, 262144), mode, width, height);
    const result = { ...test, foreground: fg, background: bg, initial,
      before, actual, expected, status, transferStatus: await number('peek 0xc011'),
      sent: await number('peek16 0xc012'), ioError: await number('peek 0xc00c'),
      registers: [...await block('VDP regs', 32, 15)],
      pixelsMatch: actual.every((c, i) => c === expected[i]), complete: !(status & 1) };
    results.push(result);
    if (process.argv.includes('--state') && command === 'LFMC' && mode === 7 && hs === 1 && port === 1 && guestWait === 2) {
      await msx.command(`store_machine [machine] ${tclString(resolve(out, `after-frame-${cpu}.xml.gz`))}`);
    }
    assert.equal(await number('debug read {VDP regs} 15'), 0, 'S#0 restored');
    const timing = guestWait ? `guest-frame-${guestWait === 1 ? 'before' : 'between'}` : delayed ? 'host-delayed' : 'immediate';
    console.log(`${command} SC${mode} HS${hs} ${port ? 'indirect' : 'direct'} ${timing} ${width}x${height}: sent=${result.sent}/${payload.length} io=${result.ioError} S2=${status.toString(16)} pixels=${result.pixelsMatch} CE=${status & 1}`);
    await run(5);
    assert.equal((await number('peek 0xc010')) & 1, 0, 'Abort is bounded and leaves CE clear');
  }
  const hash = createHash('sha256').update(await readFile(resolve(root, '.local/openmsx/openmsx.exe'))).digest('hex');
  await writeFile(resolve(out, `results-${cpu}${quick ? '-quick' : ''}.json`),
    JSON.stringify({ machine, cpu, executableSha256: hash, extensionRom: false, program, results }, null, 2) + '\n');
  assert.ok(results.filter(r => r.command === 'LMMC').every(r => r.pixelsMatch && r.complete && !r.ioError),
    'The same transfer path must pass the LMMC positive control');
  console.log(`DIAGNOSTIC: ${results.filter(r => r.command === 'LFMC' && r.pixelsMatch && r.complete).length}/${results.filter(r => r.command === 'LFMC').length} LFMC cases pass; LMMC controls pass. No ROM/emulator modifications.`);
} finally {
  await msx.stop();
}
