import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { prepareDemoDisk } from '../tools/demo-disk.mjs';
import { OpenMsx } from '../tools/openmsx.mjs';

const source=await readFile('demo/KANJI.BAS','utf8');
assert.doesNotMatch(source,/ON STOP|STOP ON/,'Do not redirect native BREAK to the menu exit');
const disk=await prepareDemoDisk({entry:'KANJI.BAS'});
const rom=process.argv.find(arg=>arg.startsWith('--rom='))?.slice(6) ?? 'dist/v9968-basic.rom';
const map=await readFile('build/v9968-basic.map','utf8');
const bannerPrint=parseInt(/\bbanner_print\s+= \$([0-9A-F]+)/i.exec(map)[1],16);
const msx=new OpenMsx({rom,machine:'Panasonic_FS-A1ST(V9968)',diskDirectory:disk.directory});
const num=async c=>Number(await msx.command(c));
const bytes=(first,last)=>msx.command(`binary encode hex [debug read_block memory [peek16 ${first}] [expr {[peek16 ${last}]-[peek16 ${first}]}]]`);
async function waitFor(name,previous=0) {
  for(let i=0;i<200 && await num(`set ::${name}`)<=previous;i++)await msx.advance(.1);
  assert.ok(await num(`set ::${name}`)>previous,`Waiting for ${name}`);
}
async function stopAndInspect(label) {
  const program=await bytes('0xf676','0xf6c2');
  const arrays=await bytes('0xf6c4','0xf6c6');
  const ready=await num('set ::kb_prompts');
  await msx.command('keymatrixdown 6 2; keymatrixdown 7 16');
  try {await msx.advance(.08);}
  finally {await msx.command('keymatrixup 7 16; keymatrixup 6 2');}
  await waitFor('kb_prompts',ready);
  assert.equal(await bytes('0xf676','0xf6c2'),program,`${label}: BASIC program retained, not replaced by MENU.BAS`);
  assert.equal(await bytes('0xf6c4','0xf6c6'),arrays,`${label}: position arrays retained`);
  assert.equal(await num('set ::kb_exit'),0,`${label}: no Escape cleanup`);
  assert.equal(await num('set ::kb_error'),0);
  assert.equal(await num('set ::kb_banners'),0,`${label}: no delayed startup banner`);
  const prompt=await num('set ::kb_prompts');
  await msx.type('LIST 10\r');
  await waitFor('kb_prompts',prompt);
  assert.equal(await bytes('0xf676','0xf6c2'),program,'LIST leaves the demo intact');
  console.log(`PASS: ${label}: Ctrl+STOP reaches BASIC, retains program/arrays, accepts LIST`);
}
try {
  await msx.command(`set throttle on; set speed 400
    set ::kb_homes 0; set ::kb_previews 0; set ::kb_results 0; set ::kb_prompts 0
    set ::kb_exit 0; set ::kb_error 0; set ::kb_pending 0
    set ::kb_banners 0
    debug set_bp ${bannerPrint} {[pc_in_slot 1]} {incr ::kb_banners}
    debug set_bp 0xff07 {} {incr ::kb_prompts}
    debug set_watchpoint write_mem 0xf41d {} {
      set line [peek16 0xf41c]
      if {$line==70} {set ::kb_pending 1}
      if {$line==130 && $::kb_pending} {incr ::kb_homes; set ::kb_pending 0}
      if {$line==360} {incr ::kb_previews}
      if {$line==430} {incr ::kb_results}
      if {$line==900} {incr ::kb_exit}
      if {$line==950} {incr ::kb_error}
    }`);
  await waitFor('kb_homes');
  await stopAndInspect('Initial view');
  const home=await num('set ::kb_homes');
  await msx.type('RUN\r');
  await waitFor('kb_homes',home);
  await msx.type('b');
  await waitFor('kb_previews');
  await stopAndInspect('Native comparison preview');
  // Continue the native BREAK; it must not jump into an explicit exit handler.
  await msx.type('CONT\r');
  await waitFor('kb_results');
  await stopAndInspect('LFMM comparison result');
  await msx.type('CONT\r');
  await msx.advance(.2);
  await msx.type('\x1b');
  await msx.advance(3);
  assert.match(await msx.screen(),/V9968 DEMO DISK/);
  console.log('PASS: CONT and explicit Escape menu return remain available');
} finally {await msx.stop();}
