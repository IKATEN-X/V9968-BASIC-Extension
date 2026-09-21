import assert from 'node:assert/strict';
import { mkdir, readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { OpenMsx, tclString } from '../tools/openmsx.mjs';

const root=resolve(import.meta.dirname,'..');
const machine=process.argv.includes('V9968_Basic')?'V9968_Basic':'Panasonic_FS-A1ST(V9968)';
const visual=process.argv.includes('--visual'),pal=process.argv.includes('--pal');
const program=await readFile(resolve(root,'demo/COPYLOG.BAS'),'ascii');
const lines=program.trim().split(/\r?\n/);
assert.ok(lines.every(line=>line.length<255));
const burst=lines.filter(line=>Number(line.split(' ')[0])>=200 && Number(line.split(' ')[0])<270);
assert.equal(burst.length,60);
assert.ok(burst.every(line=>/^\d+ _COPY.*,(T?(PSET|PRESET|AND|OR|XOR))$/.test(line)),'The measured burst contains COPY only');
assert.doesNotMatch(program,/_WAIT|ROTATE|SCALE/);
const msx=new OpenMsx({rom:'dist/v9968-basic.rom',machine});
const number=async code=>Number(await msx.command(code));
const bytes=async(device,address,size)=>Buffer.from(await msx.command(`binary encode hex [debug read_block {${device}} ${address} ${size}]`),'hex');
const vram=()=>bytes('physical VRAM',0,262144);
const address=(x,y,page=0)=>((x&2)<<15)+((y+page*256)<<7)+(x>>2);
const pixel=(data,x,y,page=0)=>(data[address(x,y,page)]>>((x&1)?0:4))&15;
function put(data,x,y,color) {
  const a=address(x,y),shift=(x&1)?0:4;
  data[a]=(data[a] & ~(15<<shift)) | (color<<shift);
}
async function checkpoint() {
  for(let i=0;i<2000;i++) {
    if(await number('set ::copy_ready')) return;
    await new Promise(r=>setTimeout(r,10));
  }
  assert.fail(`COPY demo checkpoint timed out: ${await msx.screen()}`);
}
async function next(line) {
  await msx.command(`set ::copy_target ${line}; set ::copy_ready 0; debug cont`);
  await checkpoint();
}
async function values() {
  const start=await number('peek16 0xf6c2'),end=await number('peek16 0xf6c4');
  const data=await bytes('memory',start,end-start),result={};
  for(let i=0;i<data.length;) {
    const size=data[i],name=String.fromCharCode(data[i+1]&127,...(data[i+2]?[data[i+2]&127]:[]));
    assert.ok([2,3,4,8].includes(size));
    if(size===2) result[name]=data.readInt16LE(i+3);
    if(size===3) result[name]=(await bytes('memory',data.readUInt16LE(i+4),data[i+3])).toString('ascii');
    i+=size+3;
  }
  return result;
}
async function screenshot(pass) {
  if(!visual) return;
  await mkdir(resolve(root,'build/screenshots'),{recursive:true});
  await msx.command('set renderer SDLGL-PP; set deinterlace on; set minframeskip 0; set maxframeskip 0');
  await msx.advance(.2);
  const name=`copy-logic-${machine==='V9968_Basic'?'z80':'r800'}-${pal?'pal':'ntsc'}-${pass}`;
  await msx.command(`screenshot -raw -size 640 ${tclString(resolve(root,`build/screenshots/${name}.png`))}`);
}
try {
  await msx.command('set throttle on; set speed 400');await msx.advance(12);
  if(pal) await msx.command('debug write {VDP regs} 9 [expr {[debug read {VDP regs} 9] | 2}]; poke 0xffe8 [debug read {VDP regs} 9]');
  const map=await readFile(resolve(root,'build/v9968-basic.map'),'ascii');
  const restore=/\brestore_text\s*= \$([0-9A-F]+)/i.exec(map)[1];
  await msx.command(`set ::copy_target 190; set ::copy_ready 0; set ::copy_collect 0; set ::copy_ops {}; set ::copy_busy 0; set ::copy_count 0
    debug set_watchpoint write_mem 0xf41d {[peek 0xfcaf] == 7 && [peek16 0xf41c] == $::copy_target} {set ::copy_ready 1; debug break}
    debug set_bp 0x${restore} {[pc_in_slot 1] && [peek16 0xfd89] == 0x4f43 && [peek16 0xfd8b] == 0x5950} {
      incr ::copy_count
      if {$::copy_collect} {lappend ::copy_ops [peek [expr {[reg IX]+14}]]}
      set ::copy_busy [expr {$::copy_busy | ([debug read {VDP status regs} 2] & 1) | [debug read {VDP regs} 15]}]
    }`);
  await msx.type(program.replace(/\r?\n/g,'\r')+'\rRUN\r');
  await checkpoint();
  const himem=await number('peek16 0xfc4a'),work=await number('peek16 0xfd2f');
  let material,previous;
  for(let pass=0;pass<2;pass++) {
    const before=await vram(),expected=Buffer.from(before),v=await values();
    assert.equal(v.HZ,pal?50:60);
    assert.equal(v.S,pass*32);
    assert.equal((await number('debug read {VDP regs} 21'))&64,0,'Normal SCREEN 7');
    const source=Buffer.concat([before.subarray(0x8000,0x10000),before.subarray(0x18000,0x20000)]);
    if(!material) material=source;else assert.deepEqual(source,material);
    let zeroes=0,ink=0;
    for(let y=0;y<32;y++) for(let x=0;x<32;x++) {
      if(pixel(before,x,y+v.S,1)) ink++;else zeroes++;
    }
    assert.ok(zeroes>200 && ink>200,'Both transparent and colored source pixels are visible');
    for(let op=0;op<10;op++) for(let y=0;y<64;y++) for(let x=0;x<96;x++) {
      const dx=8+(op%5)*100+x,dy=48+Math.floor(op/5)*96+y;
      const s=pixel(before,x%32,(y%32)+v.S,1),d=pixel(before,64+x,y,1);
      assert.equal(pixel(before,dx,dy),d,'Identical backgrounds prepared before timing');
      const color=op>=5 && s===0?d:[s,s&d,s|d,s^d,(~s)&15][op%5];
      put(expected,dx,dy,color);
    }
    // Cross the 16-bit TIME wrap during each burst, without changing BASIC variables.
    await msx.command('poke16 0xfc9e 65530; set ::copy_collect 1; set ::copy_ops {}');
    await next(270);
    const ticks=(await number('peek16 0xfc9e')-65530+65536)%65536;
    assert.ok(ticks>6 && ticks<600,'The measured burst crosses TIME wrap');
    assert.equal(await number('set ::copy_busy'),0,'Every COPY returns complete with status selector restored');
    const ops=(await msx.command('set ::copy_ops')).split(' ').map(Number);
    assert.deepEqual(ops,Array.from({length:60},(_,i)=>0x30+(i%10<5?i%10:8+i%10-5)),'Six copies of all ten operators, no restores in the timed burst');
    const after=await vram();
    assert.deepEqual(after,expected,'All operator pixels match; labels, source and every byte outside the panels remain intact');
    if(previous) assert.notDeepEqual(after,previous,'The next pass changes the source picture');
    previous=after;
    await msx.command('set ::copy_collect 0');await next(300);
    const rate=Number((await values()).R);
    assert.ok(Math.abs(rate-Math.floor(60*v.HZ/ticks))<=2,'BASIC COPY/s uses 60 calls, refresh rate and elapsed TIME, excluding setup');
    console.log(`PASS [${machine}, ${v.HZ} Hz]: source ${pass}, 60 synchronous COPYs, all ten pixel oracles, TIME wrap, ${rate} BASIC COPY/s`);
    if(pass===0) {await msx.type('p');await msx.command('type_via_keybuf::handleinterrupt');}
    await msx.command('set ::copy_target -1; debug cont');await msx.advance(.5);
    const paused=await vram(),count=await number('set ::copy_count');
    assert.equal((await values()).P,1);
    await msx.advance(1.5);
    assert.deepEqual(await vram(),paused,'Pause keeps the completed comparison visible');
    assert.equal(await number('set ::copy_count'),count,'No COPY while paused');
    await screenshot(pass);
    if(pass===0) {
      await msx.command('set ::copy_target 190; set ::copy_ready 0');await msx.type(' ');await checkpoint();
      assert.equal((await values()).P,1,'Space advances one batch without unpausing');
    }
  }
  await msx.command('set ::copy_target 190; set ::copy_ready 0');await msx.type('P');await checkpoint();
  assert.equal((await values()).P,0,'P resumes automatic repetition');
  await msx.type('\x1b');await msx.command('type_via_keybuf::handleinterrupt; set ::copy_target -1; debug cont');await msx.advance(4);
  assert.equal(await number('peek 0xfcaf'),0);
  assert.match(await msx.screen(),/logical COPY demo stopped/);
  assert.equal(await number('peek16 0xfc4a'),himem);
  assert.equal(await number('peek16 0xfd2f'),work);
  console.log(`PASS [${machine}]: P/Space/Escape, queued escape during burst, clean text-mode return and unchanged extension allocation`);
} finally {await msx.stop();}
