import assert from 'node:assert/strict';
import { mkdir, readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { OpenMsx, tclString } from '../tools/openmsx.mjs';
import { prepareDemoDisk } from '../tools/demo-disk.mjs';

const root=resolve(import.meta.dirname,'..');
const pal=process.argv.includes('--pal'),visual=process.argv.includes('--visual');
const disk=await prepareDemoDisk({entry:'SHOOT.BAS'});
const msx=new OpenMsx({rom:'dist/v9968-basic.rom',machine:'Panasonic_FS-A1ST(V9968)',diskDirectory:disk.directory});
const number=async command=>Number(await msx.command(command));
const bytes=async (address,size)=>Buffer.from(await msx.command(`binary encode hex [debug read_block {physical VRAM} ${address} ${size}]`),'hex');
async function checkpoint() {
  for(let i=0;i<1200;i++) {
    const line=await number('set ::intro_line');
    if(line) return line;
    await new Promise(r=>setTimeout(r,10));
  }
  assert.fail('Shooter did not reach the next loading/entrance checkpoint');
}
async function next() {
  await msx.command('set ::intro_line 0; debug cont');
  return checkpoint();
}
function bounds(data) {
  let left=256,top=212,right=-1,bottom=-1,ink=0;
  for(let y=0;y<212;y++) for(let x=0;x<256;x++) {
    const b=data[y*128+(x>>1)],c=x&1?b&15:b>>4;
    if(c) {left=Math.min(left,x);right=Math.max(right,x);top=Math.min(top,y);bottom=Math.max(bottom,y);ink++;}
  }
  return {width:right-left+1,height:bottom-top+1,ink};
}
async function screenshot(name) {
  if(!visual) return;
  const path=resolve(root,`build/screenshots/shoot-${pal?'pal':'ntsc'}-${name}.png`);
  await mkdir(resolve(root,'build/screenshots'),{recursive:true});
  await msx.command(`screenshot -raw ${tclString(path)}`);
}
try {
  await msx.ready;
  await msx.command(`set throttle on; set speed 1000; set ::intro_line 0
    debug set_watchpoint write_mem 0xf41d {[peek 0xfcaf] == 5 && [peek16 0xf41c] in {20 50 80 884}} {
      set ::intro_line [peek16 0xf41c]; debug break
    }`);
  if(visual) await msx.command('set renderer SDLGL-PP');
  assert.equal(await checkpoint(),20);
  if(pal) await msx.command('debug write {VDP regs} 9 [expr {[debug read {VDP regs} 9] | 2}]; poke 0xffe8 [debug read {VDP regs} 9]');
  const loading=await bytes(0,32768),font=await bytes(0x37600,2048);
  const loadingBounds=bounds(loading);
  assert.ok(loadingBounds.ink>100 && loadingBounds.ink<800,'LOADING text is visible, without a bitmap background');
  assert.ok(loadingBounds.width<=80 && loadingBounds.height<=8,'Loading label fits its centered text area');
  assert.equal(await next(),50);
  assert.deepEqual(await bytes(0,32768),loading,'All six BLOADs leave the loading display intact');
  await screenshot('loading');
  for(const [page,file,length] of [[1,'CITY.SC5',32768],[2,'POWER.SC5',32768],[3,'CARGO.SC5',32768],[4,'TITLE.SC5',32768],[5,'RUNWAY.SC5',32768],[7,'SHIPS.SC5',16384]]) {
    assert.deepEqual(await bytes(page*32768,length),(await readFile(resolve(disk.directory,file))).subarray(7),`Loaded ${file} on page ${page}`);
  }
  const title=(await readFile(resolve(disk.directory,'TITLE.SC5'))).subarray(7);
  const quadrants=new Map([[0,[64,53]],[12,[93,112]],[24,[160,133]],[36,[172,208]],[48,[256,212]]]);
  let preserved,previous,start;
  for(let frame=0;frame<=48;frame++) {
    assert.equal(await next(),884,`Entrance step ${frame}`);
    if(!frame) {
      start=await number('machine_info time');
      preserved=await bytes(32768,262144-32768);
    }
    const current=await bytes(0,32768),b=bounds(current);
    assert.ok(b.ink>2000,'Every entrance step contains visible title pixels');
    if(previous) assert.notDeepEqual(current,previous,'Rotation/scale advances on every step');
    previous=current;
    assert.deepEqual(current.subarray(212*128),Buffer.alloc(44*128),'The animation stays inside 256x212');
    assert.deepEqual(await bytes(32768,262144-32768),preserved,'Animation preserves assets, font, SAT and unused VRAM');
    assert.equal((await number('debug read {VDP status regs} 2'))&1,0,'COPY has completed at the BASIC boundary');
    assert.equal((await number('debug read {VDP regs} 8'))&2,2,'Sprites stay hidden during rotation');
    if(quadrants.has(frame)) {
      const [width,height]=quadrants.get(frame);
      assert.ok(Math.abs(b.width-width)<=2 && Math.abs(b.height-height)<=2,`Rotated/scaled bounds at step ${frame}: ${JSON.stringify(b)}`);
      await screenshot(`intro-${frame}`);
    }
  }
  assert.equal(await next(),80);
  const seconds=await number('machine_info time')-start;
  assert.ok(seconds>0.5 && seconds<4,`Brief but visible entrance: ${seconds} seconds`);
  assert.deepEqual(await bytes(0,32768),title,'The settled image is exactly the original full title page');
  assert.deepEqual(await bytes(0x37600,2048),font,'Loading and animation preserve the font reservation');
  assert.deepEqual(await bytes(32768,262144-32768),preserved);
  console.log(`PASS: persistent LOADING, six assets, 49 animated steps, rotated bounds, synchronous COPY and pristine final title (${seconds.toFixed(3)} s, ${pal?'PAL':'NTSC'})`);

  // Reenter from the disk menu and cancel mid-rotation. The gameplay suite
  // separately checks the timed GAME OVER return and held-trigger behavior.
  await msx.type('\x1b');await msx.command('type_via_keybuf::handleinterrupt; set ::intro_line 0; debug cont');
  await msx.advance(4);
  assert.match(await msx.screen(),/V9968 DEMO DISK/);
  await msx.type('9');
  assert.equal(await checkpoint(),20);assert.equal(await next(),50);assert.equal(await next(),884);
  await msx.type('\x1b');await msx.command('type_via_keybuf::handleinterrupt; set ::intro_line 0; debug cont');
  await msx.advance(4);
  assert.match(await msx.screen(),/V9968 DEMO DISK/);
  assert.equal(await number('debug read {VDP regs} 20'),0);
  assert.equal(await number('debug read {VDP regs} 23'),0);
  console.log('PASS: Escape during rotation restores the menu and VDP state');
} finally {await msx.stop();}
