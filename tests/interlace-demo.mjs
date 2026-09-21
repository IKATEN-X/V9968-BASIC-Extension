import assert from 'node:assert/strict';
import { mkdir, readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { OpenMsx, tclString } from '../tools/openmsx.mjs';

const root=resolve(import.meta.dirname,'..');
const machine=process.argv.includes('V9968_Basic')?'V9968_Basic':'Panasonic_FS-A1ST(V9968)';
const visual=process.argv.includes('--visual');
const msx=new OpenMsx({rom:'dist/v9968-basic.rom',machine});
const number=async code=>Number(await msx.command(code));
const vram=async()=>Buffer.from(await msx.command('binary encode hex [debug read_block {physical VRAM} 0 262144]'),'hex');
function pixel(data,x,y,page=0) {
  const address=page*131072+((x&2)<<15)+(y<<7)+(x>>2);
  return (data[address]>>((x&1)?0:4))&15;
}
async function checkpoint() {
  for(let n=0;n<1500;n++) {
    if(await number('set ::fil_frame_ready')) return;
    await new Promise(r=>setTimeout(r,10));
  }
  assert.fail(`Rotation checkpoint timed out: ${await msx.screen()}`);
}
async function screenshot(name) {
  if(!visual) return;
  await mkdir(resolve(root,'build/screenshots'),{recursive:true});
  await msx.command('set renderer SDLGL-PP; set deinterlace on; set minframeskip 0; set maxframeskip 0; set speed 100');
  await msx.advance(.2);
  await msx.command(`screenshot -raw -size 640 ${tclString(resolve(root,`build/screenshots/interlace-rotate-${machine==='V9968_Basic'?'z80':'r800'}-${name}.png`))}`);
  await msx.command('set speed 1000');
}
try {
  await msx.command('set throttle on; set speed 1000');await msx.advance(12);
  const map=await readFile(resolve(root,'build/v9968-basic.map'),'ascii');
  const addr=name=>'0x'+new RegExp(`\\b${name}\\s*= \\$([0-9A-F]+)`,'i').exec(map)[1];
  await msx.command(`set ::fil_frame_ready 0; set ::fil_break 1; set ::fil_angle -1; set ::fil_copies 0; set ::fil_busy 0
    debug set_watchpoint write_mem 0xf41d {$::fil_break && [peek 0xfcaf] == 7 && [peek16 0xf41c] == 200} {
      set ::fil_frame_ready 1; debug break
    }
    debug set_bp ${addr('compute_vectors')} {[pc_in_slot 1]} {set ::fil_angle [peek16 [expr {[reg IX]+44}]]}
    debug set_bp ${addr('restore_text')} {[pc_in_slot 1] && [peek16 0xfd89] == 0x4f43 && [peek16 0xfd8b] == 0x5950} {
      incr ::fil_copies; set ::fil_busy [expr {$::fil_busy | ([debug read {VDP status regs} 2] & 1) | [debug read {VDP regs} 15]}]
    }`);
  const program=await readFile(resolve(root,'demo/INTERLAC.BAS'),'ascii');
  assert.ok(program.trim().split(/\r?\n/).every(line=>line.length<255));
  await msx.type(program.replace(/\r?\n/g,'\r')+'\rRUN\r');
  let first,previous;
  for(let frame=0;frame<=60;frame++) {
    await checkpoint();
    assert.equal(await number('set ::fil_angle'),(frame*6)%360,'Six-degree steps and angle wrap');
    assert.equal(await number('set ::fil_busy'),0,'COPY finishes and restores the status selector before BASIC continues');
    const current=await vram();
    if(!frame) first=current;
    assert.deepEqual(current.subarray(131072),first.subarray(131072),'The entire source page is immutable');
    for(let y=0;y<512;y++) for(let x=0;x<512;x++) {
      if(x>=128 && x<=383 && y>=128 && y<=383) continue;
      assert.equal(pixel(current,x,y),pixel(first,x,y),'Only the destination rectangle changes');
    }
    if(frame%15===0) {
      const cos=[1,0,-1,0][(frame/15)%4],sin=[0,1,0,-1][(frame/15)%4];
      for(let y=128;y<=383;y++) for(let x=128;x<=383;x++) {
        const sx=400+cos*(x-256)+sin*(y-256),sy=344-sin*(x-256)+cos*(y-256);
        const source=sx>=320 && sx<=479 && sy>=288 && sy<=399?pixel(first,sx,sy,1):0;
        assert.equal(pixel(current,x,y),source,`Quarter-turn ${frame*6} at ${x},${y}`);
      }
    }
    if(previous) assert.notDeepEqual(current.subarray(0,131072),previous.subarray(0,131072),'Each frame rotates');
    if(frame===60) assert.deepEqual(current,first,'A complete revolution reproduces the initial image');
    previous=current;
    if(frame<60) await msx.command('set ::fil_frame_ready 0; debug cont');
  }
  assert.equal(await number('set ::fil_copies'),62,'One title COPY and 61 opaque rotations, without background restoration');
  console.log(`PASS [${machine}]: 61 real BASIC frames, high-X/Y source page, exact quarter-turn pixels, angle wrap, synchronous COPY and unchanged surroundings/source`);

  await msx.type('p');await msx.command('type_via_keybuf::handleinterrupt; set ::fil_break 0; debug cont');
  await msx.advance(.5);
  const paused=await vram(),count=await number('set ::fil_copies');
  await msx.advance(.5);assert.deepEqual(await vram(),paused,'P freezes both pages');
  assert.equal(await number('set ::fil_copies'),count,'No unnecessary COPY while paused');
  await screenshot('paused');
  await msx.type('tT');await msx.advance(.5);
  assert.deepEqual(await vram(),paused,'Logical comparison belongs to its separate demo; T is ignored');
  assert.equal(await number('set ::fil_copies'),count);
  await msx.type(' ');await msx.advance(.5);
  assert.equal((await number('debug read {VDP regs} 21'))&64,0);
  assert.deepEqual(await vram(),paused,'Normal-mode comparison keeps the image');
  await msx.type('P');await msx.advance(.5);
  assert.deepEqual(await vram(),paused,'Unpausing in normal mode cannot submit out-of-range FIL coordinates');
  assert.equal(await number('set ::fil_copies'),count);
  await msx.type(' ');await msx.advance(.5);
  assert.equal((await number('debug read {VDP regs} 21'))&64,64);
  assert.ok(await number('set ::fil_copies')>count,'Returning to FIL resumes animation');
  await msx.type('p');await msx.advance(.5);
  const rotated=await vram();
  assert.deepEqual(rotated.subarray(131072),first.subarray(131072));
  assert.notDeepEqual(rotated.subarray(0,131072),paused.subarray(0,131072));
  await screenshot('rotated');
  await msx.type('P');await msx.advance(.2);await msx.type('\x1b');await msx.advance(2);
  assert.equal(await number('peek 0xfcaf'),0);
  assert.equal(await number('debug read {VDP regs} 21'),0);
  assert.match(await msx.screen(),/interlace demo stopped/);
  console.log(`PASS [${machine}]: opaque-only rotation, pause/resume, ignored T, normal-mode freeze, FIL restart and Escape cleanup`);
} finally {await msx.stop();}
