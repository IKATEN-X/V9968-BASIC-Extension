import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdir, readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { OpenMsx, tclString } from '../tools/openmsx.mjs';
import { prepareDemoDisk } from '../tools/demo-disk.mjs';
import { roadAssets } from '../tools/road-assets.mjs';

const root=resolve(import.meta.dirname,'..'),visual=process.argv.includes('--visual');
const scrollStep=4,steerStep=4;
const source=await readFile(resolve(root,'demo/ROAD.BAS'),'ascii');
const lines=source.trim().split(/\r?\n/),numbers=lines.map(line=>Number(line.split(' ')[0]));
assert.ok(lines.every(line=>line.length<255 && /^[\x20-\x7e]+$/.test(line)));
assert.ok(numbers.every((n,i)=>i===0 || n>numbers[i-1]),'Ascending BASIC line numbers');
assert.doesNotMatch(source,/SIN\(|COS\(|SQR\(|ROTATE|SCALE/i);
assert.match(source,/^800 _WAIT VBLANK:GOTO 100$/m,'Preserve the user-added loop pacing');
assert.equal((source.match(/_WAIT/g)??[]).length,1,'One common wait, not one wait per command');
assert.match(source,/VDP\(24\)=SG/,'Scroll directly; synchronize only at the loop end');
assert.doesNotMatch(source,/RUN"A:MENU.BAS"/,'Standalone source stays standalone');
const assets=roadAssets();
for(const [name,height] of [['ROAD.SC5',192],['CAR.SC5',32]]) {
  const data=assets.get(name);
  assert.equal(data.length,7+height*128);
  assert.deepEqual(data.subarray(0,7),Buffer.from([254,0,0,(height*128-1)&255,(height*128-1)>>8,0,0]));
}
const colors=assets.get('ROAD.PAL').toString('ascii').trim().split('\r\n').map(line=>line.split(',').map(Number));
assert.equal(colors.length,32);
colors.forEach(([i,...rgb],index)=>{assert.equal(i,index);assert.equal(rgb.length,3);assert.ok(rgb.every(c=>c>=0 && c<=31));});
const atlas=assets.get('ROAD.SC5').subarray(7),car=assets.get('CAR.SC5').subarray(7);
assert.deepEqual(atlas.subarray(160*128,176*128),atlas.subarray(176*128,192*128),'Grass is independent of lane-marking phase');
const pixel=(data,x,y)=>x&1?data[y*128+(x>>1)]&15:data[y*128+(x>>1)]>>4;
for(let slope=0;slope<5;slope++) for(let phase=0;phase<2;phase++) for(let y=0;y<16;y++) {
  const cy=(slope*2+phase)*16+y,cx=80+Math.floor(((slope-2)*4*(16-y)+8)/16);
  assert.equal(pixel(atlas,cx-65,cy),1);assert.equal(pixel(atlas,cx+65,cy),1);
  assert.equal(pixel(atlas,cx-59,cy),6);assert.equal(pixel(atlas,cx+59,cy),6);
  for(const x of [0,159]) assert.equal(pixel(atlas,x,cy),((x&1)&&(y&1))?3:2);
}
for(let y=0;y<32;y++) for(let x=16;x<256;x++) assert.equal(pixel(car,x,y),0);
const disk=await prepareDemoDisk();
for(const [name,data] of assets) assert.deepEqual(await readFile(resolve(disk.directory,name)),data);
assert.match(await readFile(resolve(disk.directory,'ROAD.BAS'),'ascii'),/demo stopped\.".*:RUN"A:MENU.BAS"/);
console.log('PASS: road/car assets, five diagonal slopes, palette, BASIC source and disk packaging');

const msx=new OpenMsx({rom:'dist/v9968-basic.rom',machine:'Panasonic_FS-A1ST(V9968)',diskDirectory:disk.directory});
const number=async code=>Number(await msx.command(code));
const bytes=async (device,address,size)=>Buffer.from(await msx.command(`binary encode hex [debug read_block {${device}} ${address} ${size}]`),'hex');
async function basicState() {
  const [start,end]=(await msx.command('list [peek16 0xf6c2] [peek16 0xf6c4]')).split(' ').map(Number);
  const data=await bytes('memory',start,end-start),values={},slots={};
  for(let i=0;i<data.length;) {
    const size=data[i],name=String.fromCharCode(data[i+1]&127,...(data[i+2]?[data[i+2]&127]:[]));
    assert.ok([2,3,4,8].includes(size),`Variable type at ${i}`);
    if(size===2) {values[name]=data.readInt16LE(i+3);slots[name]=start+i+3;}
    i+=size+3;
  }
  return {values,slots};
}
async function stopped() {
  for(let i=0;i<1500;i++) {
    const [steps,error]=(await msx.command('list $::road_steps $::road_error')).split(' ').map(Number);
    if(error) assert.fail(`ROAD BASIC error: ${JSON.stringify((await basicState()).values)}`);
    if(steps===0)return;
    await new Promise(r=>setTimeout(r,10));
  }
  assert.fail(`Road did not reach input loop: ${await msx.screen().catch(e=>e.message)}`);
}
async function frames(n,checkWait=true) {
  const before=await number('set ::road_waits');
  await msx.command(`set ::road_steps ${n}; debug cont`);await stopped();
  if(checkWait)assert.equal((await number('set ::road_waits'))-before,n,'Every update passes through the common VBLANK wait');
}
async function hold(mask,n) {
  await msx.command(`keymatrixdown 8 ${mask}`);
  try {await frames(n);} finally {await msx.command(`keymatrixup 8 ${mask}`);}
}
async function timing() {
  await msx.command(`set ::road_profile 1; set ::road_last_line 0; set ::road_last_time [machine_info time]
    array set ::road_ms {}; array set ::road_count {}
    debug set_watchpoint write_mem 0xf41d {$::road_profile && (($::wp_last_value == 0 && [peek 0xf41c] >= 100 && [peek 0xf41c] <= 180) || ($::wp_last_value == 3 && [peek 0xf41c] == 32))} {
      set now [machine_info time]
      if {$::road_last_line != 0} {
        set line $::road_last_line
        if {![info exists ::road_ms($line)]} {set ::road_ms($line) 0; set ::road_count($line) 0}
        set ::road_ms($line) [expr {$::road_ms($line) + 1000*($now-$::road_last_time)}]
        incr ::road_count($line)
      }
      set ::road_last_line [peek16 0xf41c]; set ::road_last_time $now
    }`);
  const start=await number('machine_info time');await frames(960);
  const idle=960/((await number('machine_info time'))-start);
  await msx.command('set ::road_last_line 0; array unset ::road_ms; array unset ::road_count');
  const movingStart=await number('machine_info time');
  for(let i=0;i<40;i++)await hold(i&1?16:128,24);
  const moving=960/((await number('machine_info time'))-movingStart);
  const profile=await msx.command('set result {}; foreach line [lsort -integer [array names ::road_ms]] {lappend result "$line: [format %.3f [expr {$::road_ms($line)/$::road_count($line)}]] ms"}; join $result "\n"');
  await msx.command('set ::road_profile 0');
  console.log(`TIMING: idle ${idle.toFixed(1)} / steering ${moving.toFixed(1)} updates/s; average BASIC line times while steering:\n${profile}`);
}
async function sprite() {
  const b=await bytes('physical VRAM',0x37e00,8),signed=n=>n>=512?n-1024:n;
  return {x:signed(b[4]|((b[5]&3)<<8)),y:signed(b[0]|((b[1]&3)<<8))+1,p:b[7]|((b[5]>>4)<<8)};
}
function visibleRoad(data,scroll) {
  let last,diagonal=0;
  for(let y=0;y<212;y++) {
    const py=(y+scroll)&255,edges=[];
    for(let x=0;x<256;x++) if(pixel(data,x,py)===1)edges.push(x);
    assert.equal(edges.length,4,`Two complete road edges on visible row ${y}`);
    assert.equal(edges[3]-edges[0],130,'Constant road width');
    const center=(edges[0]+edges[3])/2;
    if(last!==undefined) {assert.ok(Math.abs(center-last)<=1,`Continuous road on row ${y}`);if(center!==last)diagonal++;}
    last=center;
  }
  return diagonal;
}
async function capture(name) {
  if(!visual)return;
  const path=resolve(root,`build/screenshots/road-${name}.png`);
  await mkdir(resolve(root,'build/screenshots'),{recursive:true});
  await msx.command('set renderer SDLGL-PP; set throttle on; set speed 100; set minframeskip 0; set maxframeskip 0; set ::road_steps -1; debug cont');
  await msx.advance(.2);
  await msx.command(`debug break; screenshot -raw -size 320 ${tclString(path)}`);
  const png=JSON.parse(execFileSync('pwsh.exe',['-NoProfile','-File',resolve(root,'tests/read-png.ps1'),'-Path',path],{encoding:'utf8',windowsHide:true,maxBuffer:2**20}));
  assert.equal(png.width,320);assert.equal(png.height,240);
  const rgb=Buffer.from(png.rgb,'base64'),counts=new Map(),window=[];
  for(let i=0;i<rgb.length;i+=3) {
    const [r,g,b]=rgb.subarray(i,i+3),c=rgb.subarray(i,i+3).toString('hex');
    counts.set(c,(counts.get(c)??0)+1);
    if(r<100 && g>120 && b>160)window.push({x:(i/3)%png.width,y:Math.floor(i/3/png.width)});
  }
  assert.ok([...counts.values()].filter(n=>n>30).length>=8,'Road and car are rendered');
  assert.ok(window.length>=20,'Car windows are visible');
  const top=Math.min(...window.map(p=>p.y)),bottom=Math.max(...window.map(p=>p.y));
  assert.ok(top>=168 && bottom<230,'Car stays at the bottom of the screen');
  await msx.command('set renderer none; set throttle off');await frames(1,false);
  return {top,bottom};
}
try {
  await msx.ready;await msx.advance(20);
  assert.match(await msx.screen(),/R\s+ROAD DRIVE/);
  assert.equal(await msx.command('get_active_cpu'),'r800');
  const himem=await number('peek16 0xfc4a'),work=await number('peek16 0xfd2f');
  await msx.command(`set ::road_steps 1; set ::road_error 0; set ::road_record 0; set ::road_strips {}; set ::road_waits 0
    debug set_watchpoint write_mem 0xf41d {$::wp_last_value == 0 && [peek 0xf41c] == 100 && [peek 0xfcaf] == 5} {
      if {$::road_steps > 0} {incr ::road_steps -1; if {$::road_steps == 0} {debug break}}
    }
    debug set_watchpoint write_mem 0xf41d {$::wp_last_value == 3 && [peek 0xf41c] == 192} {set ::road_error 1; debug break}
    debug set_watchpoint write_mem 0xf41d {$::wp_last_value == 3 && [peek 0xf41c] == 32} {incr ::road_waits}`);
  await msx.type('r');await stopped();
  assert.equal(await number('debug read {VDP regs} 20'),0x1b,'SVNS with sprite mode 3');
  assert.equal((await number('debug read {VDP regs} 8'))&2,0,'Sprites enabled');
  assert.equal(await number('debug read {VDP regs} 23'),0);
  assert.deepEqual(await sprite(),{x:120,y:168,p:1792});
  const sat=await bytes('physical VRAM',0x37e00,512);
  assert.equal(sat[2],32);assert.equal(sat[6],16,'Unscaled 16x32 car');
  for(let n=1;n<64;n++)assert.equal(sat[n*8]|((sat[n*8+1]&3)<<8),510,'Only one sprite is in use');
  for(let y=0;y<32;y++)assert.deepEqual(await bytes('physical VRAM',7*32768+y*128,8),car.subarray(y*128,y*128+8));
  assert.deepEqual(await bytes('physical VRAM',32768,atlas.length),atlas,'BLOAD road strip catalog');
  const protectedVram=await bytes('physical VRAM',32768,6*32768);
  const expected=await bytes('physical VRAM',0,32768);visibleRoad(expected,0);
  const {slots}=await basicState(),names=['C','K','PH','BT','SG','DP'];
  names.forEach(name=>assert.ok(slots[name],name));
  await msx.command(`set ::road_record 1
    debug set_watchpoint write_mem 0xf41d {$::road_record && $::wp_last_value == 2 && [peek 0xf41c] == 48} {
      lappend ::road_strips [list ${names.map(n=>`[peek16 ${slots[n]}]`).join(' ')}]
    }`);
  let diagonal=0,previousSlope,previousCenter,total=0;
  const slopes=new Set(),start=await number('machine_info time');
  for(let batch=0;batch<16;batch++) {
    await frames(128);total+=128;
    const log=await msx.command('join $::road_strips "\n"');await msx.command('set ::road_strips {}');
    const strips=log.trim().split('\n');
    assert.equal(strips.length,128*scrollStep/16,'Replenish once per 16 dots without skipping a strip');
    for(const line of strips) {
      const [c,k,ph,bt,sg,dp]=line.split(' ').map(Number);
      assert.equal(dp,0);assert.equal((sg-bt)&255,16,'Replenishment is behind the visible region');
      assert.ok(c>=92 && c<=164,`Curve center ${c}`);assert.ok(k>=0 && k<=4);slopes.add(k);
      if(previousSlope!==undefined) {
        assert.ok(Math.abs(k-previousSlope)<=1,'Gradual slope change');
        assert.equal(c,previousCenter+(previousSlope-2)*4,'Strip boundary joins exactly');
      }
      previousSlope=k;previousCenter=c;
      const sy=(k*2+ph)*16,gy=160+ph*16;
      for(let y=0;y<16;y++) {
        atlas.copy(expected,(bt+y)*128,(gy+y)*128,(gy+y+1)*128);
        atlas.copy(expected,(bt+y)*128+(c-80)/2,(sy+y)*128,(sy+y)*128+80);
      }
    }
    const actual=await bytes('physical VRAM',0,32768),scroll=await number('debug read {VDP regs} 23');
    assert.equal(scroll,(-total*scrollStep)&255);
    assert.deepEqual(actual,expected,'Only the two copied hidden strips change VRAM');
    diagonal+=visibleRoad(actual,scroll);
    assert.deepEqual(await sprite(),{x:120,y:168,p:1792},'Car is independent of scrolling');
  }
  const seconds=(await number('machine_info time'))-start;
  assert.ok(slopes.has(0) && slopes.has(2) && slopes.has(4),'Left, straight and right course segments');
  assert.ok(diagonal>200,'Visible diagonal road throughout random course generation');
  assert.deepEqual(await bytes('physical VRAM',32768,6*32768),protectedVram,'Atlas, spare pages and reserved VRAM stay unchanged');
  console.log(`PASS: ${total} updates / ${total*scrollStep/256} VRAM wraps, hidden strip COPY oracle, continuous random curves, fixed sprite; ${(total/seconds).toFixed(1)} updates/s on R800`);
  await frames(1);assert.equal(await number('debug read {VDP regs} 23'),256-scrollStep,'Four-dot scroll immediately after wrapping');
  visibleRoad(await bytes('physical VRAM',0,32768),256-scrollStep);
  const first=await capture('curves');
  await hold(128,24);assert.equal((await sprite()).x,120+24*steerStep);
  const second=await capture('steering');
  if(visual)assert.deepEqual(second,first,'Rendered sprite Y remains fixed while background scrolls');
  await hold(16,150);assert.equal((await sprite()).x,0);
  await hold(128,150);assert.equal((await sprite()).x,240);
  await frames(10);assert.equal((await sprite()).x,240,'Released steering does not move the car');
  await hold(32,8);assert.equal((await sprite()).x,240,'Up alone does not steer');
  await hold(64,8);assert.equal((await sprite()).x,240,'Down alone does not steer');
  await hold(16|32,8);assert.equal((await sprite()).x,240-8*steerStep,'Up-left steers left');
  await hold(16|64,8);assert.equal((await sprite()).x,240-16*steerStep,'Down-left steers left');
  await hold(128|32,8);assert.equal((await sprite()).x,240-8*steerStep,'Up-right steers right');
  await hold(128|64,8);assert.equal((await sprite()).x,240,'Down-right steers right');
  assert.equal(await number('peek16 0xfc4a'),himem);assert.equal(await number('peek16 0xfd2f'),work);
  await msx.type('\x1b');await msx.command('type_via_keybuf::handleinterrupt; set ::road_steps -1; debug cont');await msx.advance(3);
  assert.match(await msx.screen(),/R\s+ROAD DRIVE/);
  assert.equal(await number('debug read {VDP regs} 23'),0,'Exit clears vertical scroll');
  await msx.command('set ::road_record 0; set ::road_steps 1');await msx.type('R');await stopped();
  assert.deepEqual(await sprite(),{x:120,y:168,p:1792},'Menu restart resets the car');
  visibleRoad(await bytes('physical VRAM',0,32768),0);
  assert.equal(await number('peek16 0xfc4a'),himem);assert.equal(await number('peek16 0xfd2f'),work);
  console.log('PASS: cursor steering and bounds, rendered car, Escape menu return, restart and unchanged resident RAM');
  if(process.argv.includes('--timing'))await timing();
} finally {await msx.stop();}
