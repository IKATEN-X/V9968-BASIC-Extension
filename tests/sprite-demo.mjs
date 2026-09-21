import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { OpenMsx, tclString } from '../tools/openmsx.mjs';

const root=resolve(import.meta.dirname,'..');
const visual=process.argv.includes('--visual');
const pal=process.argv.includes('--pal');
const machine=process.argv.includes('V9968_Basic') ? 'V9968_Basic' : 'Panasonic_FS-A1ST(V9968)';
const msx=new OpenMsx({rom:'dist/v9968-basic.rom',machine});
const count=24, sat=0x37e00;
async function snapshot() {
  const raw=Buffer.from(await msx.command(`binary encode hex [debug read_block {physical VRAM} ${sat} ${64*8}]`),'hex');
  const signed=n=>n>=512 ? n-1024 : n;
  return Array.from({length:64},(_,i)=>{
    const b=raw.subarray(i*8,i*8+8);
    return {x:signed(b[4]|((b[5]&3)<<8)),y:signed(b[0]|((b[1]&3)<<8))+1,
      w:b[6]||256,h:b[2]||256,alpha:b[3]>>6,flip:(b[3]>>4)&3,palette:b[3]&15,pattern:b[7]|((b[5]>>4)<<8)};
  });
}
function checkBounds(sprites) {
  const scanlines=Array(212).fill(0);
  for (const [i,s] of sprites.entries()) {
    if (i>=count) { assert.equal(s.y,511,`unused plane ${i}`); continue; }
    assert.ok(s.x>=0 && s.y>=0 && s.x+s.w<=256 && s.y+s.h<=212,`plane ${i} escaped: ${JSON.stringify(s)}`);
    assert.ok(s.w>=16 && s.w<=64 && s.h>=16 && s.h<=64,`plane ${i} size`);
    assert.equal(s.pattern,1792+i%4);
    assert.equal(s.palette,1+i%4);
    for (let y=s.y;y<s.y+s.h;y++) scanlines[y]++;
  }
  assert.ok(Math.max(...scanlines)<=16,'Demo exceeds the 16 sprites per scanline limit');
}
async function key(character) { await msx.type(character); await msx.advance(2); }
async function screenshot(name) {
  const path=resolve(root,`build/screenshots/sprite-demo-${name}.png`);
  await msx.advance(0.1);
  await msx.command(`screenshot -raw ${tclString(path)}`);
  return imagePixels(path);
}
function imagePixels(path) {
  const png=JSON.parse(execFileSync('pwsh.exe',['-NoProfile','-File',resolve(root,'tests/read-png.ps1'),'-Path',path],{encoding:'utf8',windowsHide:true,maxBuffer:2**20}));
  return Buffer.from(png.rgb,'base64');
}
function changedPixels(a,b) {
  let count=0;
  for (let i=0;i<a.length;i+=3) if (a[i]!==b[i] || a[i+1]!==b[i+1] || a[i+2]!==b[i+2]) count++;
  return count;
}
try {
  await msx.advance(12);
  const symbols=await readFile(resolve(root,'build/v9968-basic.map'),'utf8');
  const commit=/sprite_commit\s*= \$([0-9A-F]+)/i.exec(symbols);
  const wait=/cmd_wait_vdp\s*= \$([0-9A-F]+)/i.exec(symbols);
  const write=/write_reg\s*= \$([0-9A-F]+)/i.exec(symbols);
  const line=/cmd_line\s*= \$([0-9A-F]+)/i.exec(symbols);
  assert.ok(commit && wait && write && line,'Build the ROM before running this test');
  await mkdir(resolve(root,'build/screenshots'),{recursive:true});
  const introPath=resolve(root,'build/screenshots/sprite-demo-patterns.png');
  if (visual) await msx.command('set renderer SDLGL-PP; set throttle on');
  await msx.command('set ::intro_start -1; set ::intro_seconds -1; set ::intro_lines 0');
  await msx.command(`debug set_bp 0x${line[1]} {[pc_in_slot 1] && [peek 0xfaf6] == 2 && ([debug read {VDP regs} 2] >> 5) == 2} {incr ::intro_lines}`);
  await msx.command(`debug set_bp 0x${wait[1]} {[pc_in_slot 1] && [peek 0xfaf6] == 2 && $::intro_start < 0} {
    set ::intro_start [machine_info time]
    set ::intro_page [expr {[debug read {VDP regs} 2] >> 5}]
    set ::intro_disabled [expr {[debug read {VDP regs} 8] & 2}]
    after time 0.1 {
      set ::intro_patterns [binary encode hex [debug read_block {physical VRAM} 229376 2048]]
      set ::intro_visible [binary encode hex [debug read_block {physical VRAM} 65536 2048]]
    }
    ${visual ? `after time 0.2 {screenshot -raw ${tclString(introPath)}}` : ''}
  }`);
  await msx.command(`debug set_bp 0x${write[1]} {[pc_in_slot 1] && [reg C] == 2 && [reg A] == 31 && $::intro_start >= 0 && $::intro_seconds < 0} {
    set ::intro_seconds [expr {[machine_info time] - $::intro_start}]
  }`);
  await msx.command(`set ::sprite_frames 0; debug set_bp 0x${commit[1]} {[pc_in_slot 1] && [peek [expr {[reg IX]+32}]] == 23} {incr ::sprite_frames}`);
  const program=await readFile(resolve(root,'demo/SPRITE.BAS'),'utf8');
  assert.ok(program.split(/\r?\n/).every(line=>line.length<255),'BASIC input line is too long');
  await msx.type(program.replace(/\r?\n/g,'\r')+(pal ? '\r15 VDP(10)=VDP(10) OR 2\r' : '')+'\rRUN\r');
  await msx.advance(35);
  const screenMode=Number(await msx.command('peek 0xfcaf'));
  if (screenMode!==5) console.log(await msx.screen());
  assert.equal(screenMode,5,'Demo did not reach graphics mode');
  const introSeconds=Number(await msx.command('set ::intro_seconds'));
  assert.ok(introSeconds>=2.9 && introSeconds<=3.15,`Pattern preview duration: ${introSeconds}s`);
  assert.equal(Number(await msx.command('set ::intro_page')),2,'Pattern drawing was hidden');
  assert.equal(Number(await msx.command('set ::intro_disabled')),2,'Sprites obscured the pattern preview');
  assert.ok(Number(await msx.command('set ::intro_lines'))>=40,'LINE commands were not drawn on the visible page');
  const patterns=Buffer.from(await msx.command('set ::intro_patterns'),'hex');
  const visiblePatterns=Buffer.from(await msx.command('set ::intro_visible'),'hex');
  for (let y=0;y<16;y++) assert.deepEqual(patterns.subarray(y*128,y*128+32),visiblePatterns.subarray(y*128,y*128+32),'Displayed patterns differ from the sprite source');
  for (let tile=0;tile<4;tile++) {
    let colored=0;
    for (let y=0;y<16;y++) for (let x=0;x<8;x++) {
      const b=patterns[y*128+tile*8+x];
      colored+=(b>>4)!==0;
      colored+=(b&15)!==0;
    }
    assert.ok(colored>=40,`Pattern ${tile} was not completed before the preview`);
  }
  if (visual) {
    const pixels=imagePixels(introPath);
    const colored=changedPixels(pixels,Buffer.alloc(pixels.length));
    assert.ok(colored>=200 && colored<=1100,'Preview should show four unscaled patterns on black');
  }
  console.log(`PASS: visible LINE/PSET pattern construction, ${introSeconds.toFixed(3)}s hold (${pal ? 50 : 60} Hz), then demo`);
  assert.ok(Number(await msx.command('set ::sprite_frames'))>2,'Animation did not start');
  const initial=await snapshot();
  checkBounds(initial);
  assert.ok(initial.slice(0,count).some(s=>s.alpha===0),'Missing opaque sprites');
  for (const alpha of [1,2,3]) assert.ok(initial.slice(0,count).some(s=>s.alpha===alpha),`Missing alpha ${alpha}`);
  const changed=new Set(),scaled=new Set(),bounced=new Set();
  let crossing=false;
  const [time0,frames0]=(await msx.command('list [machine_info time] $::sprite_frames')).split(' ').map(Number);
  for (let sample=0;sample<30;sample++) {
    await msx.advance(0.5);
    const now=await snapshot();
    checkBounds(now);
    for (let i=0;i<count;i++) {
      if (now[i].x!==initial[i].x || now[i].y!==initial[i].y) changed.add(i);
      if (now[i].w!==initial[i].w || now[i].h!==initial[i].h) scaled.add(i);
      if (now[i].flip!==initial[i].flip) bounced.add(i);
    }
    crossing ||= now.slice(0,4).some(a=>now.slice(4,count).some(b=>b.alpha===0 && a.x<b.x+b.w && b.x<a.x+a.w && a.y<b.y+b.h && b.y<a.y+a.h));
  }
  const [time1,frames1]=(await msx.command('list [machine_info time] $::sprite_frames')).split(' ').map(Number);
  const fps=(frames1-frames0)/(time1-time0);
  const cpu=(await msx.command('get_active_cpu')).toUpperCase();
  assert.equal(changed.size,count,'Every sprite should move');
  assert.equal(scaled.size,count,'Every sprite should pulse');
  assert.ok(bounced.size>=8,'Too few wall reflections');
  assert.ok(crossing,'Opaque and translucent sprites never crossed');
  console.log(`PASS [${machine}, ${cpu}]: 24 moving/pulsing sprites, bounds, wall reflections, intersections; ${fps.toFixed(2)} full updates/s`);
  await key(' ');
  const paused=await snapshot();
  await msx.advance(1);
  assert.deepEqual(await snapshot(),paused,'Space did not pause the animation');
  await key('+');
  await key('-');
  assert.deepEqual(await snapshot(),paused,'Speed keys moved the paused sprites');
  await key('s');
  assert.equal(Number(await msx.command('debug read {VDP regs} 25'))&128,0,'S must not enable shuffle in this demo');
  await key('S');
  assert.equal(Number(await msx.command('debug read {VDP regs} 25'))&128,0,'Shuffle belongs to the separate demo');
  assert.deepEqual(await snapshot(),paused,'S must not affect the multi-sprite demo');
  await mkdir(resolve(root,'build/screenshots'),{recursive:true});
  if (visual) await msx.command('set throttle on; set renderer SDLGL-PP');
  const blended=visual ? await screenshot('blended') : null;
  await key('t');
  const opaque=await snapshot();
  for (let i=0;i<count;i++) assert.deepEqual(opaque[i],{...paused[i],alpha:0},'T should only change transparency');
  if (visual) {
    const solid=await screenshot('opaque');
    assert.ok(changedPixels(blended,solid)>500,'Transparency toggle did not visibly change the picture');
  }
  await key('T');
  assert.deepEqual(await snapshot(),paused,'T did not restore transparency');
  await key('b');
  assert.equal(Number(await msx.command('debug read {VDP regs} 2'))>>5,1);
  if (visual) {
    const plain=await screenshot('plain');
    assert.ok(changedPixels(blended,plain)>15000,'Background comparison did not change enough pixels');
  }
  await key('B');
  assert.equal(Number(await msx.command('debug read {VDP regs} 2'))>>5,0);
  assert.deepEqual(await snapshot(),paused,'Background switching altered sprites');
  await key(' ');
  assert.notDeepEqual(await snapshot(),paused,'Space did not resume animation');
  if (visual) {
    const first=await screenshot('moving-1');
    await msx.advance(1);
    const second=await screenshot('moving-2');
    assert.ok(changedPixels(first,second)>1000,'Rendered animation is not moving');
  }
  await key('\x1b');
  assert.equal(Number(await msx.command('peek 0xfcaf')),0,'Escape did not restore BASIC');
  assert.match(await msx.screen(),/sprite demo stopped/);
  await writeFile(resolve(root,'build/sprite-demo-result.json'),JSON.stringify({machine,cpu,sprites:count,introSeconds,pal,updatesPerSecond:fps,moving:changed.size,scaling:scaled.size,bouncing:bounced.size,crossing,visual},null,2)+'\n');
  console.log('PASS: pause/resume, separate shuffle controls, transparency comparison, background comparison, speed keys, Escape');
} finally { await msx.stop(); }
