import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { OpenMsx, tclString } from '../tools/openmsx.mjs';
import { prepareDemoDisk } from '../tools/demo-disk.mjs';

const map = await readFile('build/v9968-basic.map', 'utf8');
const address = name => parseInt(new RegExp(`\\b${name}\\s+= \\$([0-9A-F]+)`, 'i').exec(map)[1], 16);
const romPath = process.argv.find(arg => arg.startsWith('--rom='))?.slice(6) ?? 'dist/v9968-basic.rom';
const rom = await readFile(romPath);
await mkdir('build', { recursive: true });
const directory = await mkdtemp(resolve('build/banner-'));
const callf = target => [0xf7, 1, target & 255, target >> 8, 0xc9];
const previous = Buffer.from(callf(0x7f20));
const wrapper = Buffer.from(callf(0x7f00));
const fixture = Buffer.from(rom);
assert.ok(fixture.subarray(0x3f00, 0x3f60).every(byte => byte === 255));
Buffer.from(callf(address('banner_ready'))).copy(fixture, 0x3f00);
fixture[0x3f20] = 0xc9;
// Install the existing font trampoline before the first READY, preserving input registers.
const install = address('font_install'), ready = address('banner_ready');
Buffer.from([0xf5, 0xc5, 0xd5, 0xe5, 0xdd, 0xe5, 0xfd, 0xe5,
  0xcd, install & 255, install >> 8,
  0xfd, 0xe1, 0xdd, 0xe1, 0xe1, 0xd1, 0xc1, 0xf1,
  0xc3, ready & 255, ready >> 8]).copy(fixture, 0x3f40);
const file = resolve(directory, 'banner.rom');
await writeFile(file, fixture);

for (const machine of ['V9968_Basic', 'Panasonic_FS-A1ST(V9968)']) {
  for (const mode of ['previous', 'wrapped', 'font-first']) {
    const msx = new OpenMsx({ machine });
    const number = async code => Number(await msx.command(code));
    const block = async (start, size) => Buffer.from(await msx.command(
      `binary encode hex [debug read_block memory ${start} ${size}]`), 'hex');
    try {
      await msx.command('set throttle on; set speed 100');
      await msx.command('set power off');
      await msx.command(`carta ${tclString(file)} -romtype Normal`);
      await msx.command(`
        set ::banner_count 0; set ::ready_count 0; set ::previous_count 0
        set ::font_prepared 0; set ::register_failures 0
        debug set_bp ${address('banner_install')} {[pc_in_slot 1]} {
          debug write_block memory 0xff07 [binary format H* ${previous.toString('hex')}]
        }
        debug set_bp ${ready} {[pc_in_slot 1]} {
          if {"${mode}" eq "font-first" && !$::font_prepared} {
            set ::font_prepared 1
            reg PC 0x7f40
          } else {
            incr ::ready_count
            set ::ready_registers [list [reg AF] [reg BC] [reg DE] [reg HL]]
            if {"${mode}" eq "wrapped"} {
              debug write_block memory 0xff07 [binary format H* ${wrapper.toString('hex')}]
            }
          }
        }
        debug set_bp ${address('banner_print')} {[pc_in_slot 1]} {incr ::banner_count}
        debug set_bp 0x7f20 {[pc_in_slot 1]} {
          incr ::previous_count
          if {$::previous_count == 1 && $::ready_registers ne [list [reg AF] [reg BC] [reg DE] [reg HL]]} {
            incr ::register_failures
          }
        }
        set power on
      `);
      await msx.advance(12);
      const text = await msx.screen();
      assert.match(text, /V9968 BASIC Extension 0\.1\s+Ok/);
      assert.equal(await number('set ::banner_count'), 1);
      assert.equal(await number('set ::register_failures'), 0, 'Preserve registers before the predecessor');
      assert.equal(await number('set ::previous_count'), 1);
      assert.deepEqual(await block(0xff07, 5), mode === 'wrapped' ? wrapper : previous);
      const work = (await number('peek16 0xfd2f')) & 0xfffe;
      assert.deepEqual(await block(work + 23, 7), Buffer.concat([previous, Buffer.from([0xc9, 0])]));
      const himem = await number('peek16 0xfc4a');
      await msx.type('10 END\r'); await msx.advance(0.2);
      for (const code of ['CLEAR:RUN', 'NEW', 'PRINT 1/0', 'PRINT "READY AGAIN"']) {
        await msx.type(`${code}\r`); await msx.advance(0.5);
      }
      assert.equal(await number('set ::banner_count'), 1);
      assert.equal(await number('peek16 0xfc4a'), himem);
      assert.deepEqual(await block(0xff07, 5), mode === 'wrapped' ? wrapper : previous);
      assert.match(await msx.screen(), /READY AGAIN/);
      assert.ok(await number('set ::previous_count') > 1, 'Keep chaining the previous owner');
      if (mode === 'wrapped') {
        assert.equal(await number('set ::ready_count'), await number('set ::previous_count'));
      }
      console.log(`PASS: ${machine}, ${mode}, banner once / preserved hook and registers / lifecycle`);
    } finally {
      await msx.stop();
    }
  }
}

const source = await mkdtemp(resolve('build/banner-disk-'));
await writeFile(resolve(source, 'START.BAS'),
  '10 _V9968:_SCREEN(5):_FONT(1):_SCREEN(0):PRINT "BANNER DISK BOOT":END\n');
const disk = await prepareDemoDisk({ source, entry: 'START.BAS' });
const msx = new OpenMsx({ rom: romPath, machine: 'Panasonic_FS-A1ST(V9968)',
  diskDirectory: disk.directory });
try {
  await msx.command('set throttle on; set speed 100');
  await msx.advance(20);
  assert.match(await msx.screen(), /BANNER DISK BOOT\s+Ok/);
  assert.doesNotMatch(await msx.screen(), /V9968 BASIC Extension/);
  await msx.type('PRINT "DISK READY"\r'); await msx.advance(0.5);
  assert.match(await msx.screen(), /DISK READY/);
  assert.doesNotMatch(await msx.screen(), /V9968 BASIC Extension/);
  console.log('PASS: AUTOEXEC cancels the pending banner; FONT and BASIC prompt after disk boot');
} finally {
  await msx.stop();
}

if (process.argv.includes('--visual')) {
  const msx = new OpenMsx({ rom: romPath, machine: 'Panasonic_FS-A1ST(V9968)' });
  try {
    await msx.advance(12);
    await mkdir('build/screenshots', { recursive: true });
    await msx.command('set renderer SDLGL-PP; set throttle on');
    await msx.advance(0.2);
    await msx.command(`screenshot -raw -size 640 ${tclString(resolve('build/screenshots/boot-banner.png'))}`);
    console.log(await msx.screen());
  } finally {
    await msx.stop();
  }
}
