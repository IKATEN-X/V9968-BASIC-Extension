import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { OpenMsx, tclString } from '../tools/openmsx.mjs';

const root=resolve(import.meta.dirname,'..');
const machine=process.argv.includes('V9968_Basic')?'V9968_Basic':'Panasonic_FS-A1ST(V9968)';
const visual=process.argv.includes('--visual'), pal=process.argv.includes('--pal');
const msx=new OpenMsx({rom:'dist/v9968-basic.rom',machine});
const number=async code=>Number(await msx.command(code));
const bytes=async (device,start,size)=>Buffer.from(await msx.command(`binary encode hex [debug read_block {${device}} ${start} ${size}]`),'hex');
async function request(action,flags=0) {
  await msx.command(`poke 0xc001 0; poke 0xc002 ${flags}; poke 0xc000 ${action}`);
  for(let i=0;i<100 && !await number('peek 0xc001');i++) await msx.advance(0.2);
  assert.equal(await number('peek 0xc001'),1,`BASIC action ${action} failed or timed out`);
}
async function state() {
  return {
    regs:await bytes('VDP regs',0,59),
    shadows:await bytes('memory',0xffe7,22),
    vram:await bytes('physical VRAM',0,262144),
    himem:await number('peek16 0xfc4a')
  };
}
async function flags(value) {
  const before=await state();
  await request(3,value);
  before.regs[20]=(before.regs[20]&127)|((value&2)?128:0);
  before.regs[25]=(before.regs[25]&127)|((value&1)?128:0);
  before.shadows[12]=before.regs[20];
  before.shadows[19]=before.regs[25];
  assert.deepEqual(await state(),before,'S16/SPS must not rewrite VRAM or unrelated registers');
  assert.equal(before.regs[20]&127,0,'Native sprite modes must not require ECOM/EVR/EPAL/SP3');
}
async function capture(directory,name) {
  await msx.advance(0.1);
  await msx.command(`screenshot -raw ${tclString(resolve(directory,name))}`);
}
async function sequence(directory,prefix) {
  await msx.command(`set ::s16_dir ${tclString(directory)}; set ::s16_prefix ${prefix}; set ::s16_frame 0; set ::s16_done 0;
    proc s16_capture {} {
      screenshot -raw [file join $::s16_dir [format "%s-%02d.png" $::s16_prefix $::s16_frame]]
      incr ::s16_frame
      if {$::s16_frame < 32} {after frame s16_capture} else {set ::s16_done 1}
    }; after frame s16_capture`);
  for(let i=0;i<100 && !await number('set ::s16_done');i++) await msx.advance(0.05);
  assert.equal(await number('set ::s16_done'),1,'32-frame capture');
}
try {
  await msx.ready;
  await msx.command('set throttle on; set speed 1000');
  await msx.advance(12);
  const program=[
    '1 CLEAR 200,&HBFFF:DEFINT A-Z:ON ERROR GOTO 9000',
    '10 _SCREEN(0):POKE &HC001,1',
    '20 IF PEEK(&HC000)=0 THEN 20',
    '30 A=PEEK(&HC000):POKE &HC000,0',
    '40 ON A GOSUB 1000,1100,1200',
    '50 POKE &HC001,1:GOTO 20',
    '1000 M=2:GOSUB 2000:RETURN',
    '1100 M=4:GOSUB 2000:RETURN',
    '1200 _SCREEN(,,,,,,PEEK(&HC002)):RETURN',
    '2000 _SCREEN(,,,,,,0):SCREEN M,0:COLOR 15,1,1:CLS',
    ...(pal?['2010 VDP(10)=VDP(10) OR 2']:[]),
    '2020 SPRITE$(0)=STRING$(8,255)',
    '2030 FOR I=0 TO 31:PUT SPRITE I,(0,224),0,0:NEXT I',
    '2040 LINE(0,0)-(255,0),15',
    '2050 FOR I=0 TO 23:X=8+I*10:C=3+2*(I MOD 4)',
    '2060 PUT SPRITE I,(X,72),C,0:LINE(8+I*8,112)-(15+I*8,119),C,BF:NEXT I',
    '2070 RETURN',
    '9000 POKE &HC001,ERR+128:END'
  ];
  await msx.command('poke 0xc000 0; poke 0xc001 0');
  await msx.type(program.join('\r')+'\rRUN\r');
  for(let i=0;i<60 && !await number('peek 0xc001');i++) await msx.advance(0.2);
  assert.equal(await number('peek 0xc001'),1,'Harness startup');
  if(visual) await msx.command('set renderer SDLGL-PP; set speed 100');
  for(const mode of [1,2]) {
    await request(mode);
    assert.equal(await number('peek 0xfcaf'),mode*2);
    assert.equal((await number('debug read {VDP regs} 9'))&2,pal?2:0);
    const directory=resolve(root,`build/screenshots/sprite16-${machine==='V9968_Basic'?'z80':'r800'}-${pal?'pal':'ntsc'}-mode${mode}`);
    if(visual) await mkdir(directory,{recursive:true});
    await flags(0);
    if(visual) await capture(directory,'off.png');
    await flags(2); await flags(2);
    if(visual) await capture(directory,'sixteen.png');
    await flags(3);
    const both=await state();
    if(visual) await sequence(directory,'both');
    else await msx.advance(1);
    assert.deepEqual(await state(),both,'Hardware shuffling must not modify VRAM');
    await flags(1);
    if(visual) await sequence(directory,'shuffle');
    await flags(0);
    if(visual) {
      await capture(directory,'restored.png');
      const frames=JSON.parse(execFileSync('pwsh.exe',['-NoProfile','-File',resolve(root,'tests/read-sprite16.ps1'),'-Directory',directory],{encoding:'utf8',windowsHide:true,maxBuffer:2**20}));
      const off=frames.find(f=>f.name==='off.png');
      assert.ok(off.reference.every(rgb=>rgb.some(c=>c>0)),'Reference tiles must be visible');
      const visible=frame=>frame.sprites.map((rgb,i)=>rgb.join(',')===off.reference[i].join(','));
      const first=n=>Array.from({length:24},(_,i)=>i<n);
      assert.deepEqual(visible(off),first(mode*4),'Native 4/8-per-line limit');
      assert.deepEqual(visible(frames.find(f=>f.name==='sixteen.png')),first(16),'S16 must show exactly the first 16, not 24');
      for(const [prefix,limit] of [['both',16],['shuffle',mode*4]]) {
        const animated=frames.filter(f=>f.name.startsWith(prefix+'-'));
        assert.equal(animated.length,32);
        for(const frame of animated) {
          assert.equal(visible(frame).filter(Boolean).length,limit,`${prefix} line limit`);
          assert.deepEqual(frame.reference,off.reference,'Unchanged background');
        }
        for(let i=0;i<24;i++) assert.ok(animated.some(f=>visible(f)[i]),`${prefix}: plane ${i} must appear`);
      }
      assert.deepEqual(visible(frames.find(f=>f.name==='restored.png')),visible(off),'OFF restores the native limit');
    }
    console.log(`PASS [${machine}, sprite mode ${mode}, ${pal?50:60} Hz]: flags 0/1/2/3, unchanged VRAM/RAM reservation, no unrelated extension bits${visual?', native 4/8 -> 16 limit, overflow and two 32-frame shuffle sequences':''}`);
  }
} finally { await msx.stop(); }
