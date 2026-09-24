import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { OpenMsx, tclString } from '../../tools/openmsx.mjs';

const [userDataDirectory, binary] = process.argv.slice(2);
const basicStatement = process.argv.includes('--basic-statement');
const fullShadow = process.argv.includes('--full-shadow');
const expandedSlot0 = process.argv.includes('--expanded-slot0');
const keepMainRom = process.argv.includes('--keep-mainrom');
const romIndex = process.argv.indexOf('--rom-hook');
const rom = romIndex >= 0 ? process.argv[romIndex + 1] : null;
assert.ok(romIndex < 0 || rom, '--rom-hook requires the experimental ROM path');
assert.ok(!(rom && basicStatement), 'ROM hook and standard BASIC probes are separate');
assert.ok(!fullShadow || (!rom && !basicStatement), 'Full shadow is a separate BASIC probe');
assert.ok(fullShadow || (!expandedSlot0 && !keepMainRom));
assert.ok(userDataDirectory && binary, 'Use experiments/vdp-port-shadow/run.ps1');
const code = await readFile(binary);
assert.ok(code.length > 12 && code.length < 0x1000);
const map = rom ? await readFile(resolve(dirname(binary), 'probe.map'), 'utf8') : '';
function address(name) {
  const match = new RegExp(`^${name}\\s+= \\$([0-9A-F]+)`, 'mi').exec(map);
  assert.ok(match, `Missing probe symbol: ${name}`);
  return parseInt(match[1], 16);
}
const msx = new OpenMsx({ machine: 'PortShadow', extensions: ['HRA_V9968'], userDataDirectory, rom });
const number = async command => Number(await msx.command(command));
const bytes = async (name, start, length) => Buffer.from(await msx.command(
  `binary encode hex [debug read_block ${tclString(name)} ${start} ${length}]`), 'hex');
const result = { machine: 'PortShadow / MSX2+ / Z80', extension: 'HRA_V9968',
  basicStatementRequested: basicStatement, romHookRequested: Boolean(rom),
  fullShadowRequested: fullShadow, expandedSlot0, keepMainRom, stages: [] };
let internal, external;
const slotState = () => msx.command(
  'list [debug read ioports 0xa8] [peek 0xffff]' +
  ' [debug read ioports 0xfc] [debug read ioports 0xfd]' +
  ' [debug read ioports 0xfe] [debug read ioports 0xff]');

async function run(action) {
  await msx.command(`set ::probe_done 0; set ::probe_error 0; poke 0xc001 0; poke 0xc000 ${action}`);
  for (let i = 0; i < 100 && await number('set ::probe_done') === 0; i++) await msx.advance(.1);
  if (await number('set ::probe_done') !== 1) {
    result.failureState = await msx.command(
      'list PC [reg PC] SP [reg SP] primary [debug read ioports 0xa8] secondaryRead [peek 0xffff]' +
      ' mapper0 [debug read ioports 0xfc] mapper1 [debug read ioports 0xfd]' +
      ' portRead [peek 6] portWrite [peek 7] line [peek16 0xf41c]' +
      ' EXPTBL0 [peek 0xfcc1] MAINROM [peek 0xfff7]' +
      ' SLTTBL [binary encode hex [debug read_block memory 0xfcc5 4]]');
    result.failedAction = action;
    console.log('Failure state:', result.failureState);
  }
  assert.equal(await number('set ::probe_done'), 1,
    `Action ${action}: BASIC did not return, latched error=${await number('set ::probe_error')}`);
  assert.equal(await number('peek 0xc002'), 0, 'BASIC error / array or string corruption');
  if (rom) assert.equal(await number('peek 0xc018'), 0, 'ROM call register/stack/slot checks');
  assert.equal(await number('peek16 0xfc4a'), 0xbfff, 'HIMEM changed');
}

async function state(name) {
  const stage = { name, ports: [...await bytes('memory', 6, 2)],
    internalR7: await number(`debug read ${tclString(internal)} 7`),
    externalR7: await number(`debug read ${tclString(external)} 7`),
    idBits: await number('peek 0xc010'), slots: await slotState(),
    exptbl: [...await bytes('memory', 0xfcc1, 4)],
    slttbl: [...await bytes('memory', 0xfcc5, 4)], mainrom: await number('peek 0xfff7') };
  result.stages.push(stage);
  console.log(`${name}: ports=${stage.ports.map(n => n.toString(16)).join('/')}` +
    ` R7 internal=${stage.internalR7.toString(16)} external=${stage.externalR7.toString(16)}` +
    ` ID=${stage.idBits} MAINROM=${stage.mainrom.toString(16)}`);
  return stage;
}

try {
  await msx.command('set throttle on; set speed 1000');
  await msx.advance(12);
  assert.equal(await msx.command('get_active_cpu'), 'z80');
  assert.notEqual(await number('lsearch -exact [list_extensions] HRA_V9968'), -1,
    'HRA_V9968 must be loaded as an extension, not as an internal VDP');
  console.log('Configuration: PortShadow (internal V9958) + HRA_V9968 extension');
  if (rom) {
    await msx.command('set ::rom_calls 0; debug set_bp 0x4020 {[pc_in_slot 1]} {incr ::rom_calls}');
    console.log('Experimental WRTVDP ROM: slot 1, entry 4020h');
  }
  const registers = (await msx.command(
    'join [lsearch -all -inline -glob [debug list] {* regs}] "\n"')).split('\n');
  internal = registers.find(name => name === 'VDP regs');
  external = registers.find(name => name === 'V9968 regs');
  assert.ok(internal && external, `VDP register blocks: ${registers.join(', ')}`);
  assert.equal(await number(`debug read ${tclString(external)} 0`) & 0x10, 0);
  assert.equal(await number(`debug read ${tclString(external)} 1`) & 0x20, 0,
    'External IRQ must stay disabled; this experiment keeps the internal BIOS IRQ');
  const externalR21 = await number(`debug read ${tclString(external)} 21`);
  result.externalR21 = externalR21;

  // Reserve the harness before loading any machine code or test mailboxes.
  await msx.type('CLEAR 512,&HBFFF\r');
  await msx.advance(1);
  assert.equal(await number('peek16 0xfc4a'), 0xbfff);
  await msx.command(`debug write_block memory 0xc000 [binary format H* ${'00'.repeat(256)}];
    debug write_block memory 0xc100 [binary format H* ${code.toString('hex')}]`);
  // Latch the write in the reserved RAM; a transient slot switch can hide C001h.
  await msx.command(`set ::probe_done 0; set ::probe_error 0;
    debug set_watchpoint write_mem 0xc001 {[watch_in_slot 3 0] && $::wp_last_value == 1} {set ::probe_done 1};
    debug set_watchpoint write_mem 0xc002 {[watch_in_slot 3 0] && $::wp_last_value != 0} {set ::probe_error $::wp_last_value}`);
  const original = await state('Initial');
  assert.deepEqual(original.ports, [0x98, 0x98]);
  await msx.command(`poke 0xc014 ${original.externalR7}; poke 0xc015 ${externalR21};
    poke 0xc019 ${keepMainRom ? 0 : 1}`);
  const slots = await slotState();
  const [primary, secondaryRead] = slots.split(' ').map(Number);
  assert.equal(primary & 0xcf, 0xc0, 'Page 0/1 BIOS in slot 0, page 3 RAM in slot 3');
  assert.equal((secondaryRead ^ 255) & 0xc0, 0, 'Page 3 must use secondary slot 0');
  assert.equal(original.exptbl[0], expandedSlot0 ? 0x80 : 0);
  assert.equal(original.mainrom, expandedSlot0 ? 0x80 : 0);
  for (let port = 0xfc; port <= 0xff; port++) {
    const segment = (await number(`debug read ioports ${port}`)) & 7;
    assert.ok(![4, ...(fullShadow ? [5] : [])].includes(segment),
      'Reserved segments must not be mapped in the fresh diskless machine');
  }
  const copySize = fullShadow ? 0x8000 : 0x4000;
  const bios = await bytes('memory', 0, copySize);
  const biosR7 = await number('peek 0xf3e6');
  await msx.command(`poke 0xc017 ${biosR7}`);
  await msx.type([
    'NEW',
    '10 ON ERROR GOTO 900',
    '20 DEFUSR0=&HC100:DEFUSR1=&HC103:DEFUSR2=&HC106:DEFUSR3=&HC109',
    ...(rom ? [`25 DEFUSR4=&H${address('hook_install').toString(16)}:DEFUSR5=&H${address('hook_remove').toString(16)}:DEFUSR6=&H${address('checked_call').toString(16)}`] : []),
    '30 DIM T%(127):FOR I=0 TO 127:T%(I)=I*17+3:NEXT:S$="UNCHANGED"',
    '35 VDP(7)=PEEK(&HC017)',
    '40 POKE &HC001,1',
    '100 IF PEEK(&HC000)=0 THEN 100',
    '110 A=PEEK(&HC000):POKE &HC000,0',
    `120 ON A GOSUB 500,510,520,530,540${rom ? ',550,560,570,580' : fullShadow ? ',550' : ''}`,
    '130 FOR I=0 TO 127:IF T%(I)<>I*17+3 THEN POKE &HC002,250:END',
    '140 NEXT:IF S$<>"UNCHANGED" THEN POKE &HC002,251:END',
    '150 POKE &HC001,1:GOTO 100',
    '500 A=USR0(0):RETURN',
    '510 A=USR1(0):RETURN',
    '520 A=USR2(0):RETURN',
    '530 A=USR3(0):RETURN',
    '540 VDP(7)=9:RETURN',
    ...(fullShadow ? ['550 FOR J=0 TO 255:VDP(7)=J:NEXT:RETURN'] : []),
    ...(rom ? ['550 A=USR4(0):RETURN', '560 A=USR5(0):RETURN', '570 A=USR6(0):RETURN',
      '580 FOR J=0 TO 255:POKE &HC017,J:A=USR6(0):NEXT:RETURN'] : []),
    '900 POKE &HC002,ERR:END',
    'RUN', ''
  ].join('\r'));
  for (let i = 0; i < 100 && await number('set ::probe_done') === 0; i++) await msx.advance(.1);
  assert.equal(await number('set ::probe_done'), 1, 'Harness ready after baseline BASIC VDP');
  const programStart = await number('peek16 0xf676');
  const programLength = await number('peek16 0xf6c2') - programStart;
  assert.ok(programStart >= 0x8000 && programLength > 0 && programStart + programLength < 0xc000);
  const program = await bytes('memory', programStart, programLength);

  assert.equal(await number(`debug read ${tclString(internal)} 7`), biosR7);
  assert.equal(await number(`debug read ${tclString(external)} 7`), original.externalR7);
  result.baselineBasicPass = true;
  console.log('PASS: standard BASIC VDP statement before relocation');

  await run(2);
  const before = await state('Reference before shadow');
  assert.equal(before.internalR7, (biosR7 & 0xf0) | 12);
  assert.equal(before.externalR7, original.externalR7);
  assert.equal(before.idBits, 4, 'Internal V9958 ID bits');

  await run(1);
  assert.equal(await number('peek 0xc011'), 1);
  const shadow = Buffer.from(bios);
  shadow[6] = shadow[7] = 0x88;
  assert.deepEqual(await bytes('memory', 0, copySize), shadow, 'Only two BIOS bytes may change');
  if (fullShadow) {
    assert.equal(await number('peek 0xfcc1'), keepMainRom ? original.exptbl[0] : 0x83);
    assert.equal(await number('peek 0xfff7'), keepMainRom ? original.mainrom : 0x83);
    assert.equal((await number('debug read ioports 0xa8')) & 15, 15);
    assert.equal((await number('peek 0xffff') ^ 255) & 15, 0);
    assert.equal((await number('debug read ioports 0xfc')) & 7, 4);
    assert.equal((await number('debug read ioports 0xfd')) & 7, 5);
    result.fullCopyPass = true;
  }
  await run(2);
  const after = await state('Reference after shadow');
  assert.deepEqual(after.ports, [0x88, 0x88]);
  assert.equal(after.internalR7, before.internalR7);
  assert.equal(after.externalR7, (biosR7 & 0xf0) | 12);
  assert.equal(after.idBits, 6, 'External V9968 ID bits');
  assert.equal(await number(`debug read ${tclString(external)} 21`), externalR21,
    'Temporary FID change must be restored');
  assert.equal(await number(`debug read ${tclString(external)} 15`), 0, 'Return to S#0');

  if (rom) {
    await run(6);
    const patched = Buffer.from(shadow);
    patched.writeUInt16LE(address('rom_bridge'), 0x48);
    assert.deepEqual(await bytes('memory', 0, 0x4000), patched,
      'Only the port bytes and 0047h jump target may change');
    const hookedSlots = await msx.command(
      'list [debug read ioports 0xa8] [peek 0xffff] [debug read ioports 0xfc] [debug read ioports 0xfd]');
    await run(3);
    const hooked = await state('0047h via experimental ROM');
    assert.equal(hooked.internalR7, before.internalR7);
    assert.equal(hooked.externalR7, (biosR7 & 0xf0) | 10);
    assert.equal(await number('set ::rom_calls'), 1, 'Reached ROM in slot 1');
    await msx.command('poke 0xc016 7');
    const values = [0, 1, 15, 16, 128, 255];
    for (const value of values) {
      await msx.command(`poke 0xc017 ${value}`);
      await run(8);
      assert.equal(await number(`debug read ${tclString(external)} 7`), value);
      assert.equal(await number('peek 0xf3e6'), value, 'BIOS R#7 shadow');
      assert.equal(await number(`debug read ${tclString(internal)} 7`), before.internalR7);
    }
    await run(9);
    assert.equal(await number('set ::rom_calls'), 1 + values.length + 256);
    assert.equal(await number('peek16 0xc020'), await number('peek16 0xc022'), 'Stack balanced');
    assert.deepEqual([...await bytes('memory', 0xc024, 8)], [0x56, 0x34, 0x78, 0x56, 0x57, 0x13, 0x68, 0x24]);
    assert.equal(await msx.command(
      'list [debug read ioports 0xa8] [peek 0xffff] [debug read ioports 0xfc] [debug read ioports 0xfd]'), hookedSlots);
    const internalR6 = await number(`debug read ${tclString(internal)} 6`);
    const externalR6 = await number(`debug read ${tclString(external)} 6`);
    await msx.command(`poke 0xc016 6; poke 0xc017 ${internalR6}`);
    await run(8);
    assert.equal(await number('set ::rom_calls'), 263, 'R#6 must bypass the experimental ROM');
    assert.equal(await number(`debug read ${tclString(internal)} 6`), internalR6);
    assert.equal(await number(`debug read ${tclString(external)} 6`), externalR6);
    await run(7);
    assert.deepEqual(await bytes('memory', 0, 0x4000), shadow, 'Original 0047h jump restored');
    await run(3);
    assert.equal(await number(`debug read ${tclString(internal)} 7`), 0xfa);
    assert.equal(await number(`debug read ${tclString(external)} 7`), 255);
    assert.equal(await number('set ::rom_calls'), 263, 'Unhooked call must no longer enter the ROM');
    result.romCalls = 263;
    result.romHookPass = true;
    console.log('PASS: 263 ROM calls returned, register/stack/slot checks, R#7 shadow, unhook');
  } else {
    await run(3);
    const native = await state('BIOS WRTVDP after shadow');
    assert.deepEqual(native.ports, [0x88, 0x88]);
    assert.equal(native.internalR7, (biosR7 & 0xf0) | 10);
    assert.equal(native.externalR7, after.externalR7);
  }
  const time = await number('peek16 0xfc9e');
  await msx.advance(.5);
  assert.notEqual(await number('peek16 0xfc9e'), time, 'Internal BIOS interrupt still runs');

  await run(4);
  const restored = await state('Restored');
  assert.deepEqual(await bytes('memory', 0, copySize), bios, 'Original BIOS/BASIC visible again');
  assert.equal(await number('peek 0xc011'), 0);
  assert.equal(await slotState(), slots);
  assert.deepEqual(restored.exptbl, original.exptbl);
  assert.deepEqual(restored.slttbl, original.slttbl);
  assert.equal(restored.mainrom, original.mainrom);
  assert.equal(restored.internalR7, original.internalR7);
  assert.equal(restored.externalR7, original.externalR7);
  assert.equal(await number('peek 0xf3e6'), biosR7);
  const programAfter = await bytes('memory', programStart, programLength);
  const targets = new Map();
  for (let p = 0; program.readUInt16LE(p); p = program.readUInt16LE(p) - programStart) {
    targets.set(programStart + p - 1, program.readUInt16LE(p + 2));
  }
  // As in copy-array-boundary.mjs, allow BASIC's own line-pointer caching only.
  for (let i = 0; i < program.length; i++) {
    if (program[i] === programAfter[i]) continue;
    assert.equal(program[i], 0x0e, `Unexpected BASIC program change at ${i}`);
    assert.equal(programAfter[i], 0x0d, 'Only native line-pointer caching may change text');
    assert.equal(targets.get(programAfter.readUInt16LE(i + 1)), program.readUInt16LE(i + 1),
      'Cached pointer must refer to the same BASIC line');
    i += 2;
  }
  result.corePass = true;
  console.log('PASS: shadow copy, reference access, fixed BIOS access, BASIC data and restore');

  if (fullShadow) {
    console.log('32KB shadow: standard BASIC VDP statement');
    await run(1);
    await run(2);
    const fullSlots = await slotState();
    await msx.command(`set ::slot_trace {};
      proc probe_trace {kind} {
        if {[llength $::slot_trace] < 64} {
          lappend ::slot_trace [format "%s PC=%04X value=%02X primary=%02X secondaryRead=%02X SP=%04X" \
            $kind [reg PC] $::wp_last_value [debug read ioports 0xa8] [peek 0xffff] [reg SP]]
        }
      }
      debug set_watchpoint write_io 0xa8 {} {probe_trace primary};
      debug set_watchpoint write_mem 0xffff {} {probe_trace secondary}`);
    await run(5);
    const basic = await state('BASIC VDP(7)=9 after full shadow');
    assert.equal(basic.internalR7, 9);
    assert.equal(basic.externalR7, after.externalR7);
    assert.equal(await slotState(), fullSlots, 'Slots after BASIC VDP');
    result.basicStatementPass = true;
    await run(6);
    assert.equal(await number(`debug read ${tclString(internal)} 7`), 255);
    assert.equal(await number(`debug read ${tclString(external)} 7`), after.externalR7);
    assert.equal(await slotState(), fullSlots, 'Slots after 256 BASIC VDP statements');
    assert.deepEqual(await bytes('memory', 0, copySize), shadow, '32KB copy remains intact');
    result.basicStressPass = true;
    await run(4);
    const final = await state('Restored after BASIC statements');
    assert.deepEqual(await bytes('memory', 0, copySize), bios);
    assert.equal(final.slots, slots);
    assert.deepEqual(final.exptbl, original.exptbl);
    assert.deepEqual(final.slttbl, original.slttbl);
    assert.equal(final.mainrom, original.mainrom);
    assert.equal(final.internalR7, original.internalR7);
    assert.equal(final.externalR7, original.externalR7);
  } else if (basicStatement) {
    // Keep this known-failing compatibility probe separate from the restore test above.
    console.log('Separate probe: standard BASIC VDP statement (currently known to stop)');
    await run(1);
    await run(2);
    await run(5);
    const basic = await state('BASIC VDP(7)=9 after shadow');
    assert.equal(basic.internalR7, 9);
    assert.equal(basic.externalR7, after.externalR7);
    await run(4);
    assert.deepEqual(await bytes('memory', 0, 0x4000), bios);
    result.basicStatementPass = true;
  } else if (!rom && !fullShadow) {
    console.log('Standard BASIC VDP after relocation not tested here; use -BasicStatement separately.');
  }
  result.pass = true;
} catch (error) {
  result.pass = false;
  result.error = error.stack;
  throw error;
} finally {
  if (fullShadow) {
    try {
      result.slotTrace = (await msx.command('join $::slot_trace "\\n"')).split('\n');
    } catch { /* The trace is created only after the copy/restore checks. */ }
  }
  await msx.stop();
  await writeFile(resolve(dirname(binary), 'result.json'), JSON.stringify(result, null, 2) + '\n');
}
