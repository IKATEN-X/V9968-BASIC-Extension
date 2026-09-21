import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { OpenMsx } from '../tools/openmsx.mjs';
import { prepareDemoDisk } from '../tools/demo-disk.mjs';

const machine = process.argv.find(a => a === 'V9968_Basic' || a.startsWith('Panasonic_'))
  ?? 'Panasonic_FS-A1ST(V9968)';
const disk = process.argv.includes('--disk') ? await prepareDemoDisk({ entry: 'LFMCBUG.BAS' }) : null;
const program = await readFile('demo/LFMCBUG.BAS', 'ascii');
if (disk) {
  assert.match(await readFile(resolve(disk.directory, 'AUTOEXEC.BAS'), 'ascii'),
    /^10 RUN"A:LFMCBUG.BAS"\r\n\x1a$/);
  const packed = await readFile(resolve(disk.directory, 'LFMCBUG.BAS'), 'ascii');
  assert.equal(packed, program.trimEnd().replace(/\r?\n/g, '\r\n') + '\r\n\x1a');
}
// Standalone: no ROM; --disk: exercise the same AUTOEXEC/ROM setup as run.bat.
const msx = new OpenMsx({ machine, rom: disk ? 'dist/v9968-basic.rom' : null,
  diskDirectory: disk?.directory });
try {
  await msx.advance(16);
  if (!disk) await msx.type(program.trimEnd().replace(/\r?\n/g, '\r') + '\rRUN\r');
  let screen = '';
  for (let i = 0; i < 150; i++) {
    await msx.advance(0.1);
    if (Number(await msx.command('peek 0xfcaf')) > 1) continue;
    screen = await msx.screen();
    if (screen.includes('UNEXPECTED DRAWING') || screen.includes('UNCHANGED (EXPECTED)')) break;
  }
  const actual = /ACTUAL:\s+([0-9A-F]{8})/.exec(screen)?.[1];
  assert.ok(actual, `BASIC reproduction did not report its result:\n${screen}`);
  const cpu = await msx.command('get_active_cpu');
  assert.equal(cpu, machine === 'V9968_Basic' ? 'z80' : 'r800');
  assert.ok(actual === '33333535' || actual === '99999999', `Unexpected result ${actual}`);
  assert.equal(Number(await msx.command('debug read {VDP status regs} 2')) & 1, 0,
    'The diagnostic must abort LFMC before POINT and returning to the prompt');
  assert.equal(await msx.command('debug read {VDP regs} 15'), '0', 'Restore status selection');
  if (disk) {
    assert.equal(await msx.command('set DirAsDSKmode'), 'read_only');
    await msx.advance(1);
    assert.match(await msx.screen(), new RegExp(`ACTUAL:\\s+${actual}`), 'Keep the result visible');
  }
  console.log(`${machine} (${cpu}), ${disk ? 'disk AUTOEXEC with ROM' : 'without extension ROM'}: expected=99999999 actual=${actual}`);
  console.log(actual === '33333535' ? 'REPRODUCED: foreground 05h consumed as bitmap data'
    : 'NOT REPRODUCED: target remained unchanged');
} finally {
  await msx.stop();
}
