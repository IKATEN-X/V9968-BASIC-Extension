import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { OpenMsx, tclString } from '../tools/openmsx.mjs';

const map = await readFile('build/v9968-basic.map', 'utf8');
const address = name => parseInt(new RegExp(`\\b${name}\\s+= \\$([0-9A-F]+)`, 'i').exec(map)[1], 16);
const boot = address('font_boot');
const clear = address('font_clear_hook');
const allocate = address('font_allocate');
const rom = await readFile('dist/v9968-basic.rom');
assert.equal(rom.readUInt16LE(2), boot, 'Build/map mismatch');
await mkdir('build', { recursive: true });
const directory = await mkdtemp(resolve('build/boot-'));
const callf = (slot, target) => [0xf7, slot, target & 255, target >> 8, 0xc9];
const selected = (name, values) => {
  const option = process.argv.find(arg => arg.startsWith(`--${name}=`));
  if (!option) return values;
  const value = option.slice(name.length + 3);
  assert.ok(values.some(item => String(item) === value), `Invalid ${name}: ${value}`);
  return values.filter(item => String(item) === value);
};

for (const machine of selected('machine', ['V9968_Basic', 'Panasonic_FS-A1ST(V9968)'])) {
  for (const mapper of selected('mapper', ['Normal', 'Mirrored', 'auto'])) {
    for (const slot of selected('slot', [1, 2])) {
      const context = `${machine}, ${mapper}, slot ${slot}`;
      const slotWork = 0xfd09 + slot * 32;
      const pointer = slotWork + 6;
      const previous = Buffer.from(callf(slot, 0x7f10));
      const wrapper = Buffer.from(callf(slot, 0x7f00));
      // Test-only ROM hooks: an earlier owner, then a wrapper installed between INITs.
      // No test hook code or counters occupy unreserved MSX RAM.
      const fixture = Buffer.from(rom);
      assert.ok(fixture.subarray(0x3f00, 0x3f11).every(byte => byte === 255));
      Buffer.from(callf(slot, clear)).copy(fixture, 0x3f00);
      fixture[0x3f10] = 0xc9;
      const file = resolve(directory, `slot-${slot}.rom`);
      await writeFile(file, fixture);
      const msx = new OpenMsx({ machine });
      const number = async code => Number(await msx.command(code));
      const block = async (start, size) => Buffer.from(await msx.command(
        `binary encode hex [debug read_block memory ${start} ${size}]`), 'hex');
      const write = async (start, bytes) => msx.command(
        [...bytes].map((byte, i) => `poke ${start + i} ${byte}`).join('; '));
      async function basic(code) {
        await msx.type(`${code}\r`);
        await msx.advance(1);
      }
      try {
        await msx.command('set power off');
        await msx.command(`cart${slot === 1 ? 'a' : 'b'} ${tclString(file)} ${mapper === 'auto' ? '' : `-romtype ${mapper}`}`);
        await msx.command(`
          debug set_bp ${boot} {[pc_in_slot ${slot}]} {
            incr ::boot_count
            lappend ::boot_pointers [peek16 ${pointer}]
            if {$::boot_count == 1} {
              debug write_block memory 0xfed0 [binary format H* ${previous.toString('hex')}]
            } elseif {$::boot_count == 2} {
              debug write_block memory 0xfed0 [binary format H* ${wrapper.toString('hex')}]
            }
          }
          debug set_bp ${clear} {[pc_in_slot ${slot}]} {incr ::clear_count}
          debug set_bp ${allocate} {[pc_in_slot ${slot}]} {incr ::alloc_count}
          debug set_bp 0x7f00 {[pc_in_slot ${slot}]} {incr ::wrapper_count}
          debug set_bp 0x7f10 {[pc_in_slot ${slot}]} {incr ::previous_count}
          set ::glyph_count 0
          debug set_bp ${address('font_draw')} {[pc_in_slot ${slot}]} {incr ::glyph_count}
        `);
        for (const reset of ['power', 'power-cycle']) {
          if (reset === 'power-cycle') await msx.command('set power off');
          await msx.command(`set ::boot_count 0; set ::boot_pointers {}; set ::clear_count 0;
            set ::alloc_count 0; set ::wrapper_count 0; set ::previous_count 0;
            set power on`);
          await msx.advance(12);
          const boots = mapper === 'Normal' ? 1 : 2;
          for (let i = 0; i < 10 && await number('set ::boot_count') < boots; i++) await msx.advance(1);
          assert.equal(await number('set ::boot_count'), boots, context);
          assert.equal(await msx.command('set ::boot_pointers'), boots === 1 ? '0' : '0 1',
            `${context}: reset must clear SLTWRK; duplicate INIT must retain the marker`);
          assert.equal(await number('set ::alloc_count'), 1, context);
          assert.match(await msx.screen(), /Ok/, `${context}: BASIC prompt after ${reset}`);
          assert.deepEqual(await block(slotWork, 6), Buffer.concat([previous, Buffer.from([0xc9])]));
          assert.deepEqual(await block(0xfed0, 5), boots === 1 ? Buffer.from(callf(slot, clear)) : wrapper);
          const work = await number(`peek16 ${pointer}`);
          const himem = await number('peek16 0xfc4a');
          assert.ok((work & 0xfffe) > himem && (work & 0xfffe) + 32 <= 0xf380);
          assert.equal(await number('set ::clear_count'), await number('set ::previous_count'));
          if (boots === 2) assert.equal(await number('set ::clear_count'), await number('set ::wrapper_count'));
          await basic('CLEAR:MAXFILES=2:NEW');
          assert.equal(await number(`peek16 ${pointer}`), work);
          assert.equal(await number('peek16 0xfc4a'), himem);
          assert.equal(await number('set ::alloc_count'), 1);
          console.log(`PASS: ${context}, ${reset}, ${boots} INIT / one allocation / hook chain`);
        }

        // Explicitly reserve test trampolines with BASIC before writing them.
        await basic('CLEAR 200,&HBFFF:_V9968:_SCREEN(5):_FONT(1):_PATTERN ON(7)');
        const trampoline = [0xf5, 0xc5, 0xd5, 0xe5, 0xdd, 0xe5, 0xfd, 0xe5,
          ...callf(slot, boot).slice(0, 4), 0xfd, 0xe1, 0xdd, 0xe1, 0xe1, 0xd1, 0xc1, 0xf1, 0xc9];
        await write(0xc000, trampoline);
        await write(0xfed0, wrapper);
        await msx.type('10 REM BOOT DATA SENTINEL\r');
        await msx.advance(0.5);
        await basic('DEFUSR=&HC000:DIM Q%(2):Q%(2)=1234:S$="KEEP":A=0:_PATTERN ON(7)');
        const work = await number(`peek16 ${pointer}`);
        assert.equal(work & 1, 0, `${context}: FONT must be installed`);
        assert.equal(await number(`peek ${work + 31}`), 0x87, 'PATTERN must be active');
        const state = await block(work, 32);
        const oldHook = await block(slotWork, 6);
        const outHook = await block(0xfee4, 5);
        const programStart = await number('peek16 0xf676');
        const programEnd = await number('peek16 0xf6c2');
        assert.ok(programStart >= 0x8000 && programEnd > programStart && programEnd < 0xc000,
          `${context}: program bounds ${programStart.toString(16)}..${programEnd.toString(16)}`);
        const program = await block(programStart, programEnd - programStart);
        const bootCount = await number('set ::boot_count');
        await basic('A=USR(0):A=USR(0)');
        assert.equal(await number('set ::boot_count'), bootCount + 2, 'Both runtime INIT calls must execute');
        assert.equal(await number(`peek16 ${pointer}`), work, 'Duplicate INIT must retain installed pointer');
        assert.equal(await number('peek16 0xfc4a'), 0xbfff);
        assert.equal(await number('set ::alloc_count'), 1);
        assert.deepEqual(await block(work, 32), state);
        assert.deepEqual(await block(slotWork, 6), oldHook);
        assert.deepEqual(await block(0xfed0, 5), wrapper);
        assert.deepEqual(await block(0xfee4, 5), outHook);
        assert.deepEqual(await block(programStart, programEnd - programStart), program);
        await write(0xc040, [0]);
        await basic('IF Q%(2)=1234 AND S$="KEEP" THEN POKE &HC040,91');
        assert.equal(await number('peek 0xc040'), 91, 'BASIC array/string must survive duplicate INIT');
        await basic('CLEAR:MAXFILES=1:SCREEN 5:OPEN "GRP:" AS #1:PSET(16,16):PRINT #1,"OK";:CLOSE');
        assert.equal(await number(`peek16 ${pointer}`), work);
        assert.equal(await number('set ::alloc_count'), 1);
        assert.equal(await number('set ::clear_count'), await number('set ::previous_count'));
        assert.ok(await number('set ::glyph_count') >= 2, 'GRP must still draw through the installed font hook');
        await basic('_SCREEN(0):PRINT "BOOT PASS"');
        assert.match(await msx.screen(), /BOOT PASS/);
        console.log(`PASS: ${context}, repeated runtime INIT preserves work, hooks and BASIC data`);
      } finally {
        await msx.stop();
      }
    }
  }
}
