import assert from 'node:assert/strict';
import { mkdir, readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { prepareDemoDisk } from '../tools/demo-disk.mjs';
import { OpenMsx, tclString } from '../tools/openmsx.mjs';
import { encodeMsxText } from '../tools/msx-text.mjs';

const disk=await prepareDemoDisk({entry:'KANJI.BAS'});
const source=await readFile('demo/KANJI.BAS','utf8');
const lines=source.trim().split(/\r?\n/);
const numbers=lines.map(l=>Number(l.split(' ')[0]));
assert.ok(lines.every(l=>encodeMsxText(l).length<255 && !/[\x00-\x1f\x7f]/.test(l)));
assert.ok(numbers.every((n,i)=>Number.isInteger(n) && (!i || n>numbers[i-1])));
const msx=new OpenMsx({rom:'dist/v9968-basic.rom',machine:'Panasonic_FS-A1ST(V9968)',diskDirectory:disk.directory});
const num=async c=>Number(await msx.command(c));
const arrays=()=>msx.command('binary encode hex [debug read_block memory [peek16 0xf6c4] [expr {[peek16 0xf6c6]-[peek16 0xf6c4]}]]');
let homeImage;
async function waitHome(previous) {
  for(let n=0;n<150 && await num('set ::kd_homes')===previous && !await num('set ::kd_error');n++)await msx.advance(.1);
  assert.equal(await num('set ::kd_error'),0,'Home redraw');
  assert.equal(await num('set ::kd_homes'),previous+1,'Home redraw finished');
  assert.equal(await msx.command('binary encode hex $::kd_home_pixels'),homeImage,'Restored initial picture');
  assert.equal(await num('peek 0xfcaf'),5);
}
async function home(key) {
  const previous=await num('set ::kd_homes'),prepared=await arrays();
  await msx.type(key);
  await waitHome(previous);
  assert.equal(await arrays(),prepared,'Home retains the prepared position arrays');
}
async function draw() {
  await msx.command('set ::kd_space 0');
  await msx.type(' ');
  for(let n=0;n<150 && !await num('set ::kd_space') && !await num('set ::kd_error');n++)await msx.advance(.2);
  assert.equal(await num('set ::kd_error'),0,'Space drawing');
  assert.equal(await num('set ::kd_space'),1);
  await msx.advance(.1);
}
try {
  await msx.command(`set throttle on; set speed 400; set ::kd_ready 0; set ::kd_error 0; set ::kd_space 0
    set ::kd_homes 0; set ::kd_home_pending 0; set ::kd_abort_preview 0
    set ::kd_native_start 0; set ::kd_native 0; set ::kd_lfmm_start 0; set ::kd_lfmm 0
    debug set_watchpoint write_mem 0xf41d {} {
      set ln [peek16 0xf41c]
      if {$ln==70} {set ::kd_home_pending 1}
      if {$ln==130 && $::kd_home_pending} {
        incr ::kd_homes; set ::kd_home_pending 0
        set ::kd_home_pixels [debug read_block {physical VRAM} 0 27136]
      }
      if {$ln==130} {set ::kd_ready 1}
      if {$ln==950} {set ::kd_error 1}
      if {$ln==190} {set ::kd_space 1}
      if {$ln==320} {set ::kd_native_start [machine_info time]}
      if {$ln==340} {set ::kd_native [expr {[machine_info time]-$::kd_native_start}]}
      if {$ln==360} {set ::kd_native_pixels [debug read_block {physical VRAM} 4096 20480]}
      if {$ln==370 && $::kd_abort_preview} {set ::kd_abort_preview 0; type_via_keybuf r}
      if {$ln==400 && $::kd_lfmm_start==0} {set ::kd_lfmm_start [machine_info time]}
      if {$ln==410} {set ::kd_lfmm [expr {[machine_info time]-$::kd_lfmm_start}]}
      if {$ln==420} {set ::kd_lfmm_pixels [debug read_block {physical VRAM} 4096 20480]}
    }`);
  for(let n=0;n<160 && !await num('set ::kd_ready') && !await num('set ::kd_error');n++)await msx.advance(.2);
  assert.equal(await num('set ::kd_error'),0,await msx.screen().catch(()=> 'graphics'));
  assert.equal(await num('set ::kd_ready'),1,'Demo startup');
  homeImage=await msx.command('binary encode hex $::kd_home_pixels');
  await mkdir('build/screenshots',{recursive:true});
  await msx.command('set renderer SDLGL-PP');
  await msx.advance(.2);
  await msx.command(`screenshot -raw -size 640 ${tclString(resolve('build/screenshots/kanji-demo.png'))}`);
  await draw();
  await home('r');
  await home('R');
  await msx.command('set ::kd_ready 0');
  await msx.type('b');
  for(let n=0;n<250 && !await num('set ::kd_lfmm') && !await num('set ::kd_error');n++)await msx.advance(.2);
  assert.equal(await num('set ::kd_error'),0,await msx.screen().catch(()=> 'graphics'));
  if(!await num('set ::kd_lfmm')) {
    console.log(await msx.command('list [peek16 0xf41c] [peek 0xfcaf] $::kd_native_start $::kd_native $::kd_ready'));
    console.log(await msx.screen().catch(()=> 'graphics'));
    await msx.command(`screenshot -raw -size 640 ${tclString(resolve('build/screenshots/kanji-demo-fail.png'))}`);
    assert.fail('Both benchmark loops must finish');
  }
  await msx.advance(.1);
  const native=Buffer.from(await msx.command('binary encode hex $::kd_native_pixels'),'hex');
  const lfmm=Buffer.from(await msx.command('binary encode hex $::kd_lfmm_pixels'),'hex');
  if(!native.equals(lfmm))console.log('Pixel differences:',[...native.keys()].filter(i=>native[i]!==lfmm[i]).slice(0,20).map(i=>[(i%128)*2,32+(i>>7),native[i],lfmm[i]]));
  assert.deepEqual(lfmm,native,'Native LOCATE/PRINT and LFMM must draw the same text at the same positions');
  console.log(`PASS: native LOCATE/PRINT ${await num('set ::kd_native')}s, LFMM GRP ${await num('set ::kd_lfmm')}s (100 strings, R800)`);
  await home('R');
  await msx.command('set ::kd_lfmm 0; set ::kd_lfmm_start 0');
  await msx.type('b');
  for(let n=0;n<250 && !await num('set ::kd_lfmm') && !await num('set ::kd_error');n++)await msx.advance(.2);
  assert.equal(await num('set ::kd_error'),0,'Repeated benchmark');
  assert.ok(await num('set ::kd_lfmm')>0,'Repeated benchmark finished');
  await msx.advance(.1);
  await draw();
  await home('r');
  const previous=await num('set ::kd_homes');
  await msx.command('set ::kd_abort_preview 1; set ::kd_lfmm 0; set ::kd_lfmm_start 0');
  await msx.type('b');
  await waitHome(previous);
  assert.equal(await num('set ::kd_abort_preview'),0,'R sent while native preview is showing');
  assert.equal(await num('set ::kd_lfmm'),0,'R cancels the rest of the comparison');
  await draw();
  await home('R');
  console.log('PASS: R/r after DRAW, COMPARE and native preview; repeated home, prepared arrays and subsequent drawing');
  await msx.type('\x1b');
  await msx.advance(3);
  assert.match(await msx.screen(),/V9968 DEMO DISK/);
  assert.match(await msx.screen(),/K\s+KANJI FONT/);
  console.log('PASS: KANJI.BAS startup, Kanji BASIC coexistence, benchmark pixels and menu return');
} finally {await msx.stop();}
