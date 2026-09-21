import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdir, readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { OpenMsx, tclString } from '../tools/openmsx.mjs';

const root=resolve(import.meta.dirname,'..');
const machine=process.argv.includes('V9968_Basic')?'V9968_Basic':'Panasonic_FS-A1ST(V9968)';
const visual=process.argv.includes('--visual'), pal=process.argv.includes('--pal');
const msx=new OpenMsx({rom:'dist/v9968-basic.rom',machine});
const number=async command=>Number(await msx.command(command));
const bytes=async (address,size)=>Buffer.from(await msx.command(`binary encode hex [debug read_block {physical VRAM} ${address} ${size}]`),'hex');
async function flags(value) {
  const [r20,s20,r25,s25]=(await msx.command('list [debug read {VDP regs} 20] [peek 0xfff3] [debug read {VDP regs} 25] [peek 0xfffa]')).split(' ').map(Number);
  assert.equal(r20,(value&2)?128:0,'Only S16 may be enabled in R20');
  assert.equal(s20,r20,'R20 BASIC shadow');
  assert.equal(r25&128,(value&1)?128:0,'Independent shuffle setting');
  assert.equal(s25,r25,'R25 BASIC shadow');
}
async function ready(mode) {
  await msx.command('set speed 1000');
  await msx.advance(30);
  assert.equal(await number('peek 0xfcaf'),mode*2,`Sprite mode ${mode}`);
  const [r8,s8]=(await msx.command('list [debug read {VDP regs} 8] [peek 0xffe7]')).split(' ').map(Number);
  assert.equal(r8&2,0,'Native sprite display must be enabled');
  assert.equal(s8,r8,'R8 BASIC shadow');
  assert.equal((await number('debug read {VDP regs} 9'))&2,pal?2:0,'Requested 50/60 Hz timing');
  assert.equal((await number('debug read {VDP regs} 1'))&3,0,'Unmagnified 8x8 sprites');
  await flags(0);
  if(visual) await msx.command('set speed 100');
}
async function key(character) { await msx.type(character); await msx.advance(0.5); }
async function capture(directory,name) {
  await msx.advance(0.1);
  await msx.command(`screenshot -raw ${tclString(resolve(directory,name))}`);
}
async function sequence(directory,prefix) {
  const vram=await bytes(0,131072), calls=await number('set ::sprite16_demo_calls');
  await msx.command(`set ::sd_dir ${tclString(directory)}; set ::sd_prefix ${prefix}; set ::sd_frame 0; set ::sd_done 0;
    proc sd_capture {} {
      screenshot -raw [file join $::sd_dir [format "%s-%02d.png" $::sd_prefix $::sd_frame]]
      incr ::sd_frame
      if {$::sd_frame < 32} {after frame sd_capture} else {set ::sd_done 1}
    }; after frame sd_capture`);
  for(let i=0;i<100 && !await number('set ::sd_done');i++) await msx.advance(0.05);
  assert.equal(await number('set ::sd_done'),1,'32-frame capture');
  assert.deepEqual(await bytes(0,131072),vram,'Hardware shuffle must not rewrite VRAM');
  assert.equal(await number('set ::sprite16_demo_calls'),calls,'Hardware shuffle must not call extension commands');
}
async function checkMode(mode) {
  const sat=await number('peek16 0xf928'), pattern=await number('peek16 0xf926');
  const attributes=await bytes(sat,128), patternBytes=await bytes(pattern,8);
  const colors=mode===2?await bytes(sat-512,512):null;
  assert.deepEqual(patternBytes,Buffer.from([24,60,126,255,255,126,60,24]));
  for(let i=0;i<32;i++) {
    const expected=[72,i*8,0,3+2*(i%4)];
    const record=attributes.subarray(i*4,i*4+4);
    if(mode===1) assert.deepEqual(record,Buffer.from(expected),`Plane ${i}`);
    else {
      assert.deepEqual(record.subarray(0,3),Buffer.from(expected.slice(0,3)),`Plane ${i}`);
      assert.deepEqual(colors.subarray(i*16,i*16+8),Buffer.alloc(8,expected[3]),`Plane ${i} line colors`);
    }
  }
  const unchanged=async()=>{
    assert.deepEqual(await bytes(sat,128),attributes,'Toggle must not move or reorder sprites');
    assert.deepEqual(await bytes(pattern,8),patternBytes,'Toggle must not change patterns');
    if(colors) assert.deepEqual(await bytes(sat-512,512),colors,'Toggle must not change line colors');
  };
  const idle=async()=>{
    const vram=await bytes(0,131072), calls=await number('set ::sprite16_demo_calls');
    await msx.advance(1);
    assert.deepEqual(await bytes(0,131072),vram,'Idle must not redraw VRAM');
    assert.equal(await number('set ::sprite16_demo_calls'),calls,'Idle must not call extension commands');
  };
  const toggle=async(character,value)=>{
    await key(character); await flags(value); await unchanged(); await idle();
  };
  const directory=resolve(root,`build/screenshots/sprite16-demo-${machine==='V9968_Basic'?'z80':'r800'}-${pal?'pal':'ntsc'}-mode${mode}`);
  if(visual) await mkdir(directory,{recursive:true});
  await idle();
  if(visual) await capture(directory,'off.png');
  await toggle(' ',2);
  if(visual) await capture(directory,'sixteen.png');
  await toggle('s',3);
  if(visual) await sequence(directory,'both');
  await toggle('t',1);
  if(visual) await sequence(directory,'shuffle');
  await toggle('S',0);
  if(visual) {
    await capture(directory,'restored.png');
    const frames=JSON.parse(execFileSync('pwsh.exe',['-NoProfile','-File',resolve(root,'tests/read-sprite16-demo.ps1'),'-Directory',directory],{encoding:'utf8',windowsHide:true,maxBuffer:2**20}));
    const off=frames.find(f=>f.name==='off.png');
    assert.ok(off.reference.every(rgb=>rgb.some(c=>c>0)),'All 32 pattern references must be visible');
    const visible=frame=>frame.sprites.map((rgb,i)=>rgb.join(',')===off.reference[i].join(','));
    const first=count=>Array.from({length:32},(_,i)=>i<count);
    assert.deepEqual(visible(off),first(mode*4),'OFF must show the first 4/8 sprites');
    assert.deepEqual(visible(frames.find(f=>f.name==='sixteen.png')),first(16),'S16 alone must show only the first 16');
    assert.deepEqual(visible(frames.find(f=>f.name==='restored.png')),visible(off),'OFF must restore the native limit');
    for(const frame of frames) {
      assert.deepEqual(frame.reference,off.reference,'All states must preserve reference pixels');
      assert.equal(frame.text.length,10);
      for(const label of frame.text) {
        if(label.position[1]===16 || label.position[1]===40) assert.deepEqual(label.cursor,[0,0,0],`Stray text positioning dot: ${frame.name}, ${label.position}`);
        assert.ok(label.ink>0,`Missing text: ${frame.name}, ${label.position}`);
      }
    }
    for(const [prefix,limit] of [['both',16],['shuffle',mode*4]]) {
      const animated=frames.filter(f=>f.name.startsWith(prefix+'-'));
      assert.equal(animated.length,32);
      for(const frame of animated) assert.equal(visible(frame).filter(Boolean).length,limit,`${prefix} scanline limit`);
      for(let i=0;i<32;i++) assert.ok(animated.some(frame=>visible(frame)[i]),`${prefix}: plane ${i} must become visible`);
    }
  }
  await toggle('s',1); await toggle('T',3); await toggle('S',2); await toggle('s',3);
  console.log(`PASS [${machine}, sprite mode ${mode}]: 32 fixed sprites, independent Space/t/T/s/S toggles, unchanged attributes/patterns, idle without redraw or extension calls${visual?', rendered 4/8 vs 16, all 32 planes across shuffle frames, OFF restoration and text without stray dots':''}`);
}
try {
  await msx.ready;
  await msx.command('set throttle on; set speed 1000');
  await msx.advance(12);
  await msx.type('VDP(9)=VDP(9) OR 2\r'); await msx.advance(0.5);
  assert.equal((await number('debug read {VDP regs} 8'))&2,2,'Start with sprites disabled by a preceding demo');
  const symbols=await readFile(resolve(root,'build/v9968-basic.map'),'ascii');
  const statement=/\bstatement\s*= \$([0-9a-f]+)/i.exec(symbols)[1];
  await msx.command(`set ::sprite16_demo_calls 0; debug set_bp 0x${statement} {[pc_in_slot 1]} {incr ::sprite16_demo_calls}`);
  const cpu=await msx.command('get_active_cpu'), himem=await number('peek16 0xfc4a');
  const program=await readFile(resolve(root,'demo/SPRITE16.BAS'));
  assert.ok(program.every(byte=>byte<128),'ASCII BASIC source');
  assert.ok(program.toString('ascii').split(/\r?\n/).every(line=>line.length<255));
  assert.doesNotMatch(program.toString('ascii'),/_WAIT/i);
  await msx.type(program.toString('ascii').replace(/\r?\n/g,'\r')+(pal?'\r15 VDP(10)=VDP(10) OR 2\r':'')+'\rRUN\r');
  await ready(1);
  if(visual) {
    await mkdir(resolve(root,'build/screenshots'),{recursive:true});
    await msx.command('set renderer SDLGL-PP');
  }
  await checkMode(1);
  await msx.type('2'); await ready(2); await checkMode(2);
  await msx.type('1'); await ready(1);
  await key('T'); await key('S'); await flags(3);
  await key('\x1b');
  assert.equal(await number('peek 0xfcaf'),0,'Escape must return to BASIC');
  await flags(0);
  assert.match(await msx.screen(),/sprite16 demo stopped/);
  assert.equal(await msx.command('get_active_cpu'),cpu,'Demo must not change CPU mode');
  assert.equal(await number('peek16 0xfc4a'),himem,'Demo must not reserve resident RAM');
  console.log(`PASS: repeated mode changes while S16/SPS ON, Escape cleanup, unchanged HIMEM and ${cpu.toUpperCase()} CPU mode (${pal?'50':'60'} Hz)`);
} finally { await msx.stop(); }
