import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { OpenMsx, tclString } from '../tools/openmsx.mjs';
import { prepareDemoDisk } from '../tools/demo-disk.mjs';

const root=resolve(import.meta.dirname,'..');
const machine=process.argv.includes('V9968_Basic')?'V9968_Basic':'Panasonic_FS-A1ST(V9968)';
const visual=process.argv.includes('--visual'),diskMode=process.argv.includes('--disk');
const pal=process.argv.includes('--pal');
assert.ok(!diskMode || machine!=='V9968_Basic');
const program=await readFile(resolve(root,'demo/WIRE.BAS'),'ascii');
const lines=program.trim().split(/\r?\n/);
assert.ok([...program].every(c=>c.charCodeAt(0)<128));
assert.ok(lines.every(line=>line.length<255));
const numbers=lines.map(line=>Number(line.split(' ')[0]));
assert.ok(numbers.every((n,i)=>i===0 || n>numbers[i-1]));
assert.doesNotMatch(program,/_TURBO|_WAIT/);
assert.doesNotMatch(lines.filter(line=>Number(line.split(' ')[0])>=200).join('\n'),/\b(SIN|COS)\(/);
const loop=lines.filter(line=>{const n=Number(line.split(' ')[0]);return n>=300 && n<500;}).join('\n');
assert.doesNotMatch(loop,/!|\b(INT|SIN|COS)\(|PZ\b/,'Playback has no floating-point projection or depth calculations');
assert.match(loop,/PC\(I,F\)/,'Edge colors come from the cache');
const disk=diskMode?await prepareDemoDisk():null;
const msx=new OpenMsx({rom:'dist/v9968-basic.rom',machine,diskDirectory:disk?.directory});
const number=async code=>Number(await msx.command(code));
const bytes=async(device,address,size)=>Buffer.from(await msx.command(`binary encode hex [debug read_block ${tclString(device)} ${address} ${size}]`),'hex');
const vram=()=>bytes('physical VRAM',0,262144);
const pixel=(data,x,y,page)=>(data[((x&2)<<15)+((y+page*256)<<7)+(x>>2)]>>((x&1)?0:4))&15;
async function values() {
  const start=await number('peek16 0xf6c2'),end=await number('peek16 0xf6c4');
  const data=await bytes('memory',start,end-start),result={};
  for(let i=0;i<data.length;) {
    const size=data[i],name=String.fromCharCode(data[i+1]&127,...(data[i+2]?[data[i+2]&127]:[]));
    assert.ok([2,3,4,8].includes(size));
    if(size===2) result[name]=data.readInt16LE(i+3);
    i+=size+3;
  }
  return result;
}
async function ready() {
  const end=Date.now()+180000;
  while(Date.now()<end) {
    if(await number('set ::wire_ready')) {
      if(await number('set ::wire_error')) assert.fail(`BASIC error: ${JSON.stringify(await values())}`);
      return;
    }
    await new Promise(r=>setTimeout(r,20));
  }
  assert.fail(`Wireframe checkpoint timed out at line ${await number('peek16 0xf41c')}: ${JSON.stringify(await values())}`);
}
async function next(key,count=1) {
  await msx.command(`debug break; set ::wire_goal [expr {$::wire_frames+${count}}]; set ::wire_ready 0`);
  if(key) await msx.type(key);
  await msx.command('debug cont');
  await ready();
}
async function hold(mask,count) {
  await msx.command(`debug break; keymatrixdown 8 ${mask}`);
  try {await next(null,count);} finally {await msx.command(`keymatrixup 8 ${mask}`);}
}
async function idle(seconds=.5) {
  await msx.command('set ::wire_goal -1; debug cont');
  await msx.advance(seconds);
}

// Read only this demo's simple, comma-separated DATA records (no embedded commas).
const data=lines.filter(line=>/^\d+ DATA /.test(line)).flatMap(line=>line.replace(/^\d+ DATA /,'').split(','));
const models=[];
for(let m=0;m<3;m++) {
  const name=data.shift(),nv=Number(data.shift()),ne=Number(data.shift());
  const colors=data.splice(0,3).map(Number),vertices=[],edges=[];
  for(let i=0;i<nv;i++)vertices.push(data.splice(0,3).map(Number));
  for(let i=0;i<ne;i++)edges.push(data.splice(0,2).map(n=>Number(n)-1));
  assert.ok(edges.every(([a,b])=>a>=0 && b>=0 && a<nv && b<nv && a!==b));
  models.push({name,vertices,edges,colors});
}
assert.deepEqual(models.map(m=>[m.vertices.length,m.edges.length]),[[8,12],[6,12],[12,30]]);
assert.equal(data.length,18);
function project(model,{LA,LB,ZO}) {
  const a=LA*Math.PI/180,b=LB*Math.PI/180;
  return model.vertices.map(([x,y,z])=>{
    const x1=x*Math.cos(a)-z*Math.sin(a),z1=x*Math.sin(a)+z*Math.cos(a);
    const y1=y*Math.cos(b)-z1*Math.sin(b),z2=y*Math.sin(b)+z1*Math.cos(b),f=ZO/(4-z2);
    return [Math.floor(256+x1*f+.5),Math.floor(112-y1*f*.5+.5),z2];
  });
}
async function cache() {
  const v=await values(),start=await number('peek16 0xf6c4'),end=await number('peek16 0xf6c6');
  const data=await bytes('memory',start,end-start),arrays={};
  assert.ok(end<await number('peek16 0xf674')-1024,'Leave room for the BASIC stack');
  for(let i=0;i<data.length;) {
    const name=String.fromCharCode(data[i+1]&127,...(data[i+2]?[data[i+2]&127]:[]));
    const next=i+5+data.readUInt16LE(i+3),dims=data[i+5],offset=i+6+dims*2;
    assert.ok(next<=data.length);
    if(['PX','PY','PC'].includes(name)) {
      assert.equal(data[i],2);assert.equal(dims,2);
      const width=name==='PC'?v.NE:v.NV;
      assert.equal(data.readUInt16LE(i+6),v.NT);assert.equal(data.readUInt16LE(i+8),width);
      assert.equal(next-offset,width*v.NT*2);
      arrays[name]=data.subarray(offset,next);
    }
    i=next;
  }
  const model=models[v.M];
  assert.equal(v.HS,v.M===2?30:15);assert.equal(v.NH,360/v.HS);assert.equal(v.NT,v.NH*12);
  for(let f=0;f<v.NT;f++) {
    const points=project(model,{LA:(f%v.NH)*v.HS,LB:Math.floor(f/v.NH)*30,ZO:v.ZO});
    for(let i=0;i<v.NV;i++) {
      const x=arrays.PX.readInt16LE((f*v.NV+i)*2),y=arrays.PY.readInt16LE((f*v.NV+i)*2);
      assert.ok(Math.abs(x-points[i][0])<=1 && Math.abs(y-points[i][1])<=1,`Cached vertex ${f}:${i}`);
      assert.ok(x>=64 && x<=447 && y>=24 && y<=199,'Every cached pose fits the viewport');
    }
    for(let i=0;i<v.NE;i++) {
      const [a,b]=model.edges[i],depth=points[a][2]+points[b][2];
      const palette=[...model.colors,15],boundaries=[-1.2,0,1.2],level=boundaries.filter(t=>depth>=t).length;
      const actual=arrays.PC.readInt16LE((f*v.NE+i)*2),allowed=new Set([palette[level]]);
      boundaries.forEach((t,n)=>{if(Math.abs(depth-t)<.0001){allowed.add(palette[n]);allowed.add(palette[n+1]);}});
      assert.ok(allowed.has(actual),`Cached depth color ${f}:${i}`);
    }
  }
  return {v,arrays,bytes:Object.values(arrays).reduce((sum,b)=>sum+b.length,0)};
}
async function frame() {
  const v=await values(),image=await vram(),page=await number('peek 0xfaf5');
  assert.equal(page,1-v.PG,'Completed page is displayed; the other page is selected for drawing');
  assert.equal(await number('peek 0xfaf6'),v.PG);
  assert.equal((await number('debug read {VDP status regs} 2'))&1,0,'Page flip waits for drawing');
  assert.equal(await number('debug read {VDP regs} 15'),0);
  const model=models[v.M],points=project(model,v),mask=Buffer.alloc(512*212);
  assert.equal(v.NV,model.vertices.length);assert.equal(v.NE,model.edges.length);
  for(const [x,y] of points) assert.ok(x>=64 && x<=447 && y>=24 && y<=199,'Projection fits the cleared viewport');
  for(const [a,b] of model.edges) {
    const [x1,y1]=points[a],[x2,y2]=points[b],steps=Math.max(Math.abs(x2-x1),Math.abs(y2-y1),1);
    for(let i=0;i<=steps;i++) {
      const x=Math.round(x1+(x2-x1)*i/steps),y=Math.round(y1+(y2-y1)*i/steps);
      let ink=false;
      for(let dy=-1;dy<=1;dy++)for(let dx=-1;dx<=1;dx++) {
        mask[(y+dy)*512+x+dx]=1;
        if(pixel(image,x+dx,y+dy,page))ink=true;
      }
      assert.ok(ink,`Missing projected edge ${a}-${b} near ${x},${y}`);
    }
  }
  let count=0;const colors=new Set();
  for(let y=24;y<200;y++)for(let x=64;x<448;x++) {
    const c=pixel(image,x,y,page);
    if(c) {assert.ok(mask[y*512+x],`Stale/unexpected line at ${x},${y}`);count++;colors.add(c);}
  }
  assert.ok(count>150,'Nonblank wireframe');
  assert.ok([...colors].every(c=>[...model.colors,15].includes(c)),'Depth palette belongs to this model');
  return {v,image,page,count};
}
async function capture(name) {
  if(!visual)return;
  await idle();
  await mkdir(resolve(root,'build/screenshots'),{recursive:true});
  await msx.command('set renderer SDLGL-PP; set throttle on; set speed 100; set minframeskip 0; set maxframeskip 0');
  await msx.advance(.2);
  const path=resolve(root,`build/screenshots/wire-${machine==='V9968_Basic'?'z80':'r800'}-${name}.png`);
  await msx.command(`screenshot -raw -size 640 ${tclString(path)}`);
  const png=JSON.parse(execFileSync('pwsh.exe',['-NoProfile','-File',resolve(root,'tests/read-png.ps1'),'-Path',path],{encoding:'utf8',windowsHide:true,maxBuffer:2**22}));
  assert.equal(png.width,640);assert.equal(png.height,480);
  const rgb=Buffer.from(png.rgb,'base64');let bright=0;
  for(let i=0;i<rgb.length;i+=3)if(Math.max(rgb[i],rgb[i+1],rgb[i+2])>100)bright++;
  assert.ok(bright>600,'Rendered screenshot is nonblank');
  await msx.command('set renderer none; set throttle off');
}
try {
  await msx.command('set throttle off');await msx.advance(20);
  if(pal) await msx.command('debug write {VDP regs} 9 [expr {[debug read {VDP regs} 9] | 2}]; poke 0xffe8 [debug read {VDP regs} 9]');
  const cpu=await msx.command('get_active_cpu');
  if(diskMode) assert.match(await msx.screen(),/W\s+WIREFRAME/);
  await msx.command(`set ::wire_frames 0; set ::wire_pending 0; set ::wire_times {}; set ::wire_profiles {}; set ::wire_preparation_times {}; set ::wire_preparations 0; set ::wire_goal 1; set ::wire_ready 0; set ::wire_error 0;
    debug set_watchpoint write_mem 0xf41d {} {
      set line [peek16 0xf41c]
      if {$line == 960} {set ::wire_error 1; set ::wire_ready 1; debug break}
      if {$line == 500} {incr ::wire_preparations; set ::wire_prepare_input 0; set ::wire_prepare_start [machine_info time]}
      if {$line == 525} {set ::wire_prepare_input 1}
      if {$line == 700} {lappend ::wire_preparation_times [expr {[machine_info time]-$::wire_prepare_start}]}
      if {[peek 0xfcaf] == 7} {
        if {$line in {330 340 350 430} && ![info exists ::wire_stage($line)]} {
          set ::wire_stage($line) [machine_info time]
        }
        if {$line == 430} {set ::wire_pending 1}
        if {$line == 200 && $::wire_pending} {
          set ::wire_pending 0; incr ::wire_frames; lappend ::wire_times [machine_info time]
          set profile {}; set previous 330
          foreach stage {340 350 430} {
            lappend profile [expr {$::wire_stage($stage)-$::wire_stage($previous)}]
            set previous $stage
          }
          lappend profile [expr {[machine_info time]-$::wire_stage(430)}]
          lappend ::wire_profiles $profile
          array unset ::wire_stage
          if {$::wire_frames == $::wire_goal} {set ::wire_ready 1; debug break}
        }
      }
    }`);
  if(diskMode) await msx.type('w');else await msx.type(lines.join('\r')+'\rRUN\r');
  await ready();
  const himem=await number('peek16 0xfc4a'),work=await number('peek16 0xfd2f');
  const firstCache=await cache();assert.equal(firstCache.bytes,16128);
  assert.equal(firstCache.v.KR,pal?17:20);
  const first=await frame();assert.equal(first.v.AU,0);
  await idle();assert.equal(await number('set ::wire_frames'),1,'No redraw while controls are idle');
  assert.deepEqual(await vram(),first.image);
  await capture('cube');
  await msx.command('debug break; poke16 0xfc9e 65528');
  await hold(128,4);const right=await frame();
  assert.equal(right.v.LA,90);assert.equal(right.v.LB,30);
  assert.ok(await number('peek16 0xfc9e')<300,'Held-key repeat crosses the TIME wrap');
  const heldTimes=(await msx.command('join [lrange $::wire_times end-3 end] " "')).split(' ').map(Number);
  for(let i=1;i<heldTimes.length;i++) assert.ok(heldTimes[i]-heldTimes[i-1]>=(right.v.KR-2)/(pal?50:60),`Held-key repeat is limited without blocking input: KR=${right.v.KR}, times=${JSON.stringify(heldTimes)}`);
  assert.notDeepEqual(right.image,first.image,'Arrow input rotates the solid');
  await hold(32,3);const up=await frame();
  assert.equal(up.v.LA,90);assert.equal(up.v.LB,300);
  assert.deepEqual((await cache()).arrays,firstCache.arrays,'Rotation only reads the prepared arrays');
  await capture('rotated');
  for(const key of ['2','3']) {
    if(key==='3') {await hold(128,1);assert.equal((await values()).LA,105);}
    await next(key);const selected=await frame();
    assert.equal(selected.v.M,Number(key)-1);assert.equal(selected.v.LA,90);assert.equal(selected.v.LB,300);
    const cached=await cache();assert.equal(cached.bytes,key==='2'?13824:15552);
    await capture(models[selected.v.M].name.toLowerCase());
  }
  const originalZoom=await cache();
  await next('+');await frame();const zoom=await cache();assert.equal(zoom.v.ZO,300);
  assert.notDeepEqual(zoom.arrays.PX,originalZoom.arrays.PX,'Zoom rebuilds projected positions');
  assert.deepEqual(zoom.arrays.PC,originalZoom.arrays.PC,'Zoom does not change depth colors');
  await capture('zoom');
  await next('-');await frame();assert.deepEqual((await cache()).arrays,originalZoom.arrays);
  await next('1');await frame();await cache();
  await next('r');const reset=await frame();
  assert.equal(reset.v.LA,30);assert.equal(reset.v.LB,30);assert.equal(reset.v.ZO,280);
  const prepared=await number('set ::wire_preparations');
  const selectedFrames=await number('set ::wire_frames');
  await msx.type('1');await idle();
  assert.equal(await number('set ::wire_preparations'),prepared,'Selecting the same model does not rebuild');
  assert.equal(await number('set ::wire_frames'),selectedFrames);
  const before=await cache();
  await next(' ');const horizontal=await frame();
  assert.equal(horizontal.v.LA,45);assert.equal(horizontal.v.LB,30);
  await next(null);const vertical=await frame();
  assert.equal(vertical.v.LA,45);assert.equal(vertical.v.LB,60);
  await next(null,31);const auto=await frame();
  assert.equal(auto.v.AU,1);assert.equal(auto.v.LA,285);assert.equal(auto.v.LB,150);
  assert.equal(await number('set ::wire_preparations'),prepared,'Playback never rebuilds the cache');
  assert.deepEqual((await cache()).arrays,before.arrays);
  const times=(await msx.command('join $::wire_times " "')).split(' ').map(Number);
  const fps=32/(times.at(-1)-times.at(-33));
  const profiles=(await msx.command('join [lrange $::wire_profiles end-31 end] "\\n"')).split('\n').map(row=>row.split(' ').map(Number));
  assert.equal(profiles.length,32);
  const stages=['frameLookup','clear','edges','pageFlip'];
  const milliseconds=Object.fromEntries(stages.map((stage,i)=>[stage,profiles.reduce((sum,row)=>sum+row[i],0)*1000/32]));
  milliseconds.inputAndControl=1000/fps-Object.values(milliseconds).reduce((sum,value)=>sum+value,0);
  await hold(16,1);const manual=await frame();assert.equal(manual.v.AU,0,'Manual input cancels auto rotation');
  const frames=await number('set ::wire_frames');await idle(1);
  assert.equal(await number('set ::wire_frames'),frames);
  assert.deepEqual(await vram(),manual.image,'Manual mode stays still');
  await next(' ',2);assert.equal((await values()).AU,1);
  await msx.type(' ');await idle();
  assert.equal((await values()).AU,0,'Space also pauses auto rotation');
  const paused=await number('set ::wire_frames');await idle();
  assert.equal(await number('set ::wire_frames'),paused);
  await next('r');await frame();
  await msx.type('\x1b');await idle(5);
  assert.equal(await number('peek 0xfcaf'),0);
  assert.match(await msx.screen(),diskMode?/V9968 DEMO DISK/:/wireframe demo stopped/);
  assert.equal(await number('peek16 0xfc4a'),himem);
  assert.equal(await number('peek16 0xfd2f'),work);
  assert.equal(await msx.command('get_active_cpu'),cpu);
  const preparationSeconds=(await msx.command('join $::wire_preparation_times " "')).split(' ').map(Number);
  const completed=await number('set ::wire_frames'),preparations=await number('set ::wire_preparations');
  await msx.type(diskMode?'w':'RUN\r');
  for(let n=0;await number('set ::wire_preparations')===preparations || !await number('set ::wire_prepare_input');n++) {
    assert.ok(n<30,'Restart enters preparation');await msx.advance(1);
  }
  await msx.type('\x1b');await msx.advance(10);
  if(await number('set ::wire_error')) assert.fail(`BASIC error during cancellation: ${JSON.stringify(await values())}`);
  assert.equal(await number('set ::wire_frames'),completed,'Preparation can be cancelled before drawing');
  assert.equal(await number('peek 0xfcaf'),0);
  assert.match(await msx.screen(),diskMode?/V9968 DEMO DISK/:/wireframe demo stopped/);
  assert.equal(await number('peek16 0xfc4a'),himem);
  assert.equal(await number('peek16 0xfd2f'),work);
  await mkdir(resolve(root,'build'),{recursive:true});
  await writeFile(resolve(root,`build/wire-demo-${cpu}${diskMode?'-disk':''}${pal?'-pal':''}.json`),JSON.stringify({machine,cpu,diskMode,pal,updatesPerSecond:fps,milliseconds,preparationSeconds,cacheBytes:firstCache.bytes,frames},null,2)+'\n');
  console.log(`PASS [${cpu}${diskMode?', disk':''}${pal?', PAL':''}]: three models, cached projection/depth colors, paced arrows (TIME wrap)/zoom/reset/alternating auto, idle, page flips, preparation cancellation, clean exit; ${fps.toFixed(2)} cube updates/s`);
  console.log(`Mean emulated milliseconds/update: ${JSON.stringify(milliseconds)}`);
  console.log(`Preparation seconds: ${JSON.stringify(preparationSeconds)}`);
} finally {await msx.stop();}
