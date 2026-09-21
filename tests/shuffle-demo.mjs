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
async function ready(mode) {
  for(let i=0;i<90 && await number('set ::shuffle_demo_mode')!==mode;i++) await msx.advance(1);
  assert.equal(await number('set ::shuffle_demo_mode'),mode,`Demo did not finish preparing sprite mode ${mode/2}`);
  assert.equal(await number('peek 0xfcaf'),mode);
  const [r8,s8]=(await msx.command('list [debug read {VDP regs} 8] [peek 0xffe7]')).split(' ').map(Number);
  assert.equal(r8&2,0,'Native sprite display must be enabled');
  assert.equal(s8,r8,'R8 BASIC shadow');
  assert.equal((await number('debug read {VDP regs} 9'))&2,pal?2:0,'Requested 50/60 Hz timing');
  assert.equal(await number('debug read {VDP regs} 20'),0,'Use native sprites with S16, SP3 and EPAL disabled');
  assert.equal((await number('debug read {VDP regs} 1'))&3,1,'8x8 patterns magnified to 16x16');
}
async function sps(expected) {
  const [reg,shadow]=(await msx.command('list [debug read {VDP regs} 25] [peek 0xfffa]')).split(' ').map(Number);
  assert.equal(reg&128,expected?128:0);
  assert.equal(shadow,reg,'R25 BASIC shadow');
}
async function key(character) { await msx.type(character); await msx.advance(0.5); }
async function select(mode) {
  await msx.command('set ::shuffle_demo_mode 0');
  await msx.type(String(mode));
  await ready(mode*2);
  await sps(false);
}
async function capture(directory,name) {
  await msx.advance(0.1);
  await msx.command(`screenshot -raw ${tclString(resolve(directory,name))}`);
}
async function checkMode(mode) {
  const count=8*mode, spacing=256/count;
  const sat=await number('peek16 0xf928'), pattern=await number('peek16 0xf926');
  const attributes=await bytes(sat,128), patternBytes=await bytes(pattern,8);
  const colors=mode===2?await bytes(sat-512,512):null;
  assert.deepEqual(patternBytes,Buffer.from([24,60,126,255,255,126,60,24]));
  for(let i=0;i<32;i++) {
    const record=attributes.subarray(i*4,i*4+4);
    const expected=i<count?[72,i*spacing+(spacing-16)/2,0,3+2*(i%4)]:[224,0,0,0];
    if(mode===1) assert.deepEqual(record,Buffer.from(expected),`Native plane ${i}`);
    else {
      assert.deepEqual(record.subarray(0,3),Buffer.from(expected.slice(0,3)),`Native plane ${i}`);
      assert.deepEqual(colors.subarray(i*16,i*16+8),Buffer.alloc(8,expected[3]),`Mode-2 line colors ${i}`);
    }
  }
  let directory;
  if(visual) {
    directory=resolve(root,`build/screenshots/shuffle-demo-${machine==='V9968_Basic'?'z80':'r800'}-${pal?'pal':'ntsc'}-mode${mode}`);
    await mkdir(directory,{recursive:true});
    await capture(directory,'off.png');
  }
  await key('s'); await sps(true);
  assert.deepEqual(await bytes(sat,128),attributes,'S must not reorder or move sprite attributes');
  assert.deepEqual(await bytes(pattern,8),patternBytes,'S must not modify sprite patterns');
  if(colors) assert.deepEqual(await bytes(sat-512,512),colors,'S must not modify mode-2 color attributes');
  const vram=await bytes(0,131072);
  if(visual) {
    await msx.command(`set ::sd_dir ${tclString(directory)}; set ::sd_frame 0; set ::sd_done 0;
      proc sd_capture {} {
        screenshot -raw [file join $::sd_dir [format "on-%02d.png" $::sd_frame]]
        incr ::sd_frame
        if {$::sd_frame < 32} {after frame sd_capture} else {set ::sd_done 1}
      }; after frame sd_capture`);
    for(let i=0;i<60 && !await number('set ::sd_done');i++) await msx.advance(0.05);
    assert.equal(await number('set ::sd_done'),1,'Frame capture');
  } else { await msx.advance(1); }
  assert.deepEqual(await bytes(0,131072),vram,'Hardware shuffle must work without BASIC rewriting VRAM');
  await key('S'); await sps(false);
  assert.deepEqual(await bytes(sat,128),attributes,'OFF must not reinitialize the native sprites');
  if(visual) {
    await capture(directory,'restored.png');
    const frames=JSON.parse(execFileSync('pwsh.exe',['-NoProfile','-File',resolve(root,'tests/read-shuffle-demo.ps1'),'-Directory',directory,'-Count',String(count)],{encoding:'utf8',windowsHide:true,maxBuffer:2**20}));
    for(const frame of frames) {
      assert.equal(frame.text.length,count+4);
      for(const label of frame.text) {
        // These labels start with S or a space; other glyphs can have a lit corner.
        if(label.position[1]===16 || label.position[1]===40) {
          assert.deepEqual(label.cursor,[0,0,0],`Stray positioning dot at ${label.position} in ${frame.name}`);
        }
        assert.ok(label.ink>0,`Missing text at ${label.position} in ${frame.name}`);
      }
    }
    const off=frames.find(f=>f.name==='off.png');
    assert.ok(off.reference.every(rgb=>rgb.some(c=>c>0)),'All pattern references must be visible');
    const visible=frame=>frame.sprites.map((rgb,i)=>rgb.join(',')===off.reference[i].join(','));
    assert.deepEqual(visible(off),Array.from({length:count},(_,i)=>i<count/2),'OFF must show only the first 4/8 sprites');
    const animated=frames.filter(f=>f.name.startsWith('on-'));
    assert.equal(animated.length,32);
    for(const frame of animated) {
      assert.equal(visible(frame).filter(Boolean).length,count/2,'The native scanline limit must remain unchanged');
      assert.deepEqual(frame.reference,off.reference,'The comparison background must remain unchanged');
    }
    for(let i=0;i<count;i++) assert.ok(animated.some(frame=>visible(frame)[i]),`Plane ${i} never became visible`);
    assert.deepEqual(visible(frames.find(f=>f.name==='restored.png')),visible(off),'OFF must restore fixed priority');
  }
  console.log(`PASS [${machine}, sprite mode ${mode}]: ${count} fixed planes, ${count/2}/line limit, hidden unused planes, S toggle, unchanged SAT/pattern/VRAM${visual?', text without stray dots, 32 rendered frames and all planes visible over time':''}`);
}
try {
  await msx.ready;
  await msx.command('set throttle on; set speed 1000');
  await msx.advance(12);
  await msx.type('VDP(9)=VDP(9) OR 2\r'); await msx.advance(0.5);
  assert.equal((await number('debug read {VDP regs} 8'))&2,2,'Start with sprites disabled by a preceding demo');
  const map=await readFile(resolve(root,'build/v9968-basic.map'),'ascii');
  const wait=/cmd_wait_vblank\s*= \$([0-9a-f]+)/i.exec(map)[1];
  await msx.command(`set ::shuffle_demo_mode 0; debug set_bp 0x${wait} {[pc_in_slot 1]} {set ::shuffle_demo_mode [peek 0xfcaf]}`);
  const program=await readFile(resolve(root,'demo/SHUFFLE.BAS'),'ascii');
  assert.ok(program.split(/\r?\n/).every(line=>line.length<255));
  await msx.type(program.replace(/\r?\n/g,'\r')+(pal?'\r15 VDP(10)=VDP(10) OR 2\r':'')+'\rRUN\r');
  await ready(2); await sps(false);
  const cpu=await msx.command('get_active_cpu');
  if(visual) await msx.command('set renderer SDLGL-PP; set speed 100');
  await checkMode(1);
  await key('s'); await sps(true);
  await select(2); await checkMode(2);
  await key('s'); await sps(true);
  await select(1);
  await key('s'); await sps(true);
  await key('\x1b');
  assert.equal(await number('peek 0xfcaf'),0,'Escape must return to BASIC');
  assert.equal(await number('debug read {VDP regs} 20'),0);
  await sps(false);
  assert.match(await msx.screen(),/shuffle demo stopped/);
  assert.equal(await msx.command('get_active_cpu'),cpu,'Demo must not switch CPU mode');
  console.log(`PASS: repeated native mode changes with SPS ON, Escape cleanup, unchanged ${cpu.toUpperCase()} CPU mode (${pal?'50':'60'} Hz)`);
} finally { await msx.stop(); }
