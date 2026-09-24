import assert from 'node:assert/strict';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { OpenMsx, tclString } from '../tools/openmsx.mjs';

const machine='Panasonic_FS-A1ST(V9968)';
const z80=process.argv.includes('--z80');
const rom=Buffer.alloc(16384,255);
const code=await readFile('build/v9968-basic.rom');
assert.ok(code.length<=rom.length);
code.copy(rom);
await writeFile('build/kanji-test.rom',rom);
const msx=new OpenMsx({rom:'build/kanji-test.rom',machine});
const num=async t=>Number(await msx.command(t));
const block=async (dev,a,n)=>Buffer.from(await msx.command(`binary encode hex [debug read_block {${dev}} ${a} ${n}]`),'hex');
const pixel=(v,x,y)=>x&1?v[y*128+(x>>1)]&15:v[y*128+(x>>1)]>>4;
const text=bytes=>bytes.map(b=>`CHR$(${b})`).join('+');
const nihon=[0x93,0xfa,0x96,0x7b,0x8c,0xea];
const cases=[
  '_FONT(3):PSET(8,16),0:PRINT #1,"A"+J$+"B";',
  '_SET PAGE(0,1):_CLS(0):PUT KANJI(16,16),&H467C,15:PUT KANJI(32,16),&H4B5C,15:PUT KANJI(48,16),&H386C,15',
  '_SET PAGE(0,0):PSET(0,48),0:PRINT #1,"AB":PRINT #1,J$;',
  'PSET(0,96),0:PRINT #1,CHR$(147);:PRINT #1,CHR$(250);',
  'PSET(32,96),0:PRINT #1,CHR$(147);:PRINT #2,"A";:PRINT #1,"A";',
  'PSET(80,96),0:PRINT #1,CHR$(147);:_FONT(3):PRINT #1,"A";',
  'PSET(112,96),0:PRINT #1,CHR$(147)+CHR$(10)+"A";',
  'PSET(249,128),0:PRINT #1,LEFT$(J$,2);',
  'PSET(224,207),0:PRINT #1,LEFT$(J$,2);',
  'PSET(0,144),0:PRINT #1,CHR$(177)+CHR$(222)+"ABC";',
  '_FONT$(65)="12345678"',
  '_SET PAGE(0,6):_PSET(0,236),1',
  '_SET PAGE(0,0):PSET(0,176),0:PRINT #1,CHR$(234)+CHR$(164);',
  '_FONT(4)',
  '_SCREEN(7):_FONT(3)',
  '_SCREEN(5):_FONT(3):PSET(0,0),0:PRINT #1,"OK";',
  'PSET(80,0),0:PRINT #1,"A";',
  '_FONT(1):PSET(0,32),0:PRINT #1,"A";',
  '_FONT(3):PSET(0,48),0:PRINT #1,J$;',
  '_FONT(0)',
  '_FONT(3):PSET(0,80),0:PRINT #1,CHR$(1)+CHR$(65);',
];
async function run(i,error=0) {
  await msx.command(`poke 0xc001 0; poke 0xc003 0; poke 0xc000 ${i}`);
  for(let n=0;n<100 && !await num('peek 0xc001');n++)await msx.advance(.1);
  if(!await num('peek 0xc001'))throw new Error(`Case ${i} timeout: ${await msx.screen().catch(()=> 'graphics')}`);
  assert.equal(await num('peek 0xc003'),error,`Case ${i}, line ${await num('peek16 0xc008')}`);
  assert.equal(await num('peek 0xc00a'),0,'BASIC variables, arrays and strings');
}
try {
  await msx.command('set throttle on; set speed 400');
  await msx.advance(16);
  const work=(await num('peek16 0xfd2f'))&0xfffe;
  const map=await readFile('build/v9968-basic.map','ascii');
  const sym=name=>parseInt(new RegExp(`\\b${name}\\s*= \\$([0-9A-F]+)`,'i').exec(map)[1],16);
  await msx.command(`set ::kj_calls 0; set ::kj_busy 0; set ::kj_badregs 0; set ::kj_inject -1; set ::kj_heap 0; set ::kj_oom 0
    debug set_bp ${sym('kanji_advance')} {[pc_in_slot 1]} {
      incr ::kj_calls
      set ::kj_busy [expr {$::kj_busy | ([debug read {VDP status regs} 2] & 1)}]
      if {[debug read {VDP regs} 12] != [peek 0xffeb] || [debug read {VDP regs} 14] != [peek 0xffed] || [debug read {VDP regs} 15] != 0} {incr ::kj_badregs}
    }
    debug set_bp ${sym('font_stack_check')} {[pc_in_slot 1] && $::kj_inject >= 0} {
      set ::kj_heap [peek16 0xf6c6]; poke16 0xf6c6 [expr {[reg SP]-$::kj_inject}]; set ::kj_inject -1
    }
    debug set_bp ${sym('font_frame_allocate')} {[pc_in_slot 1] && $::kj_heap != 0} {
      poke16 0xf6c6 $::kj_heap; set ::kj_heap 0
    }
    debug set_bp ${sym('out_of_memory')} {[pc_in_slot 1] && $::kj_heap != 0} {
      incr ::kj_oom; poke16 0xf6c6 $::kj_heap; set ::kj_heap 0
    }
    debug write_block memory 0xc100 [binary format H* 3e00cd8001c9]
    poke 0xc000 0; poke 0xc001 0; poke 0xc002 0; poke 0xc00a 0`);
  const program=[
    '1 CLEAR 1024,&HBFFF:DEFINT A-Z:MAXFILES=2:ON ERROR GOTO 30000',
    '2 QA=12345:DIM QB(2):QB(0)=-123:QB(2)=456:QC$=STRING$(64,65)',
    `3 J$=${text(nihon)}`,
    ...(z80?['4 DEFUSR=&HC100:Z=USR(0)']:[]),
    '10 _SCREEN(5):COLOR 15,0,0:_CLS(0):OPEN "GRP:" AS #1:OPEN "GRP:" AS #2:POKE &HC002,1',
    '20 IF PEEK(&HC000)=0 THEN 20',
    '30 A=PEEK(&HC000):POKE &HC000,0',
    `40 IF A<=15 THEN ON A GOSUB ${cases.slice(0,15).map((_,i)=>1000+i*100).join(',')}`,
    `50 IF A>15 THEN ON A-15 GOSUB ${cases.slice(15).map((_,i)=>2500+i*100).join(',')}`,
    '200 IF QA<>12345 OR QB(0)<>-123 OR QB(2)<>456 OR QC$<>STRING$(64,65) THEN POKE &HC00A,1',
    '210 POKE &HC001,1:GOTO 20',
    '30000 POKE &HC003,ERR:POKE &HC008,ERL MOD 256:POKE &HC009,ERL\\256:RESUME 200',
  ];
  cases.forEach((c,i)=>program.push(`${1000+i*100} ${c}`,`${1010+i*100} RETURN`));
  await msx.type(program.join('\r')+'\rRUN\r');
  for(let n=0;n<160 && !await num('peek 0xc002');n++)await msx.advance(.1);
  if(!await num('peek 0xc002'))throw new Error(await msx.screen().catch(()=> 'Harness did not start'));
  const himem=await num('peek16 0xfc4a');
  assert.equal(await msx.command('get_active_cpu'),z80?'z80':'r800');
  await run(1);
  assert.equal(await num(`peek ${work}`),3);
  assert.equal(await num(`peek ${work+30}`),2,'JIS level detection');
  assert.equal(await num('peek16 0xfcb7'),72);
  const mixed=await block('physical VRAM',0,32768);
  await run(2);
  const native=await block('physical VRAM',32768,32768);
  for(let y=16;y<32;y++)for(let x=16;x<64;x++)
    assert.equal(pixel(mixed,x,y),pixel(native,x,y),`Native PUT KANJI (${x},${y})`);
  console.log('PASS: Japanese LFMM pixels match native PUT KANJI');
  // Independently inspect standard ROM quadrant order and halfwidth locations.
  const font=await readFile('.local/openmsx/share/systemroms/fs-a1st_kanjifont.rom');
  const glyph=(v,x,y,index,width=16,height=16)=>{
    for(let dy=0;dy<height;dy++)for(let dx=0;dx<Math.min(width,256-x);dx++) {
      const off=index*32+(dy<8?dy:dy+8)+(dx>=8?8:0);
      assert.equal(pixel(v,x+dx,y+dy),font[off]&(128>>(dx&7))?15:0,`ROM glyph ${index} (${dx},${dy}) at ${x},${y}`);
    }
  };
  glyph(mixed,8,16,65-32,8);glyph(mixed,64,16,66-32,8);
  await run(3);
  assert.equal(await num('peek16 0xfcb7'),48);
  assert.equal(await num('peek16 0xfcb9'),64);
  await run(4);await run(5);await run(6);await run(7);
  await run(8);assert.equal(await num('peek16 0xfcb7'),0);assert.equal(await num('peek16 0xfcb9'),144);
  await run(9);await run(10);
  const v=await block('physical VRAM',0,32768);
  const day=38*96+92-512;
  glyph(v,0,96,day);glyph(v,40,96,33,8);glyph(v,80,96,33,8);glyph(v,112,112,33,8);
  glyph(v,249,128,day);glyph(v,224,207,day,16,5);
  glyph(v,0,144,0xb1+704,8);glyph(v,8,144,0xde+704,8);
  await run(11,5);await run(12,5);await run(13);
  glyph(await block('physical VRAM',0,32768),0,176,4096+(84-48)*96+6);
  await run(14,5);await run(15,5);await run(16);
  console.log('PASS: halfwidth, JIS2, split bytes, channel/control resets, clipping, errors and recovery');
  for(const margin of [511,512,513]) {
    await msx.command(`set ::kj_inject ${margin}`);
    const before=await block('physical VRAM',0,32768);
    await run(17,margin<=512?7:0);
    if(margin<=512)assert.deepEqual(await block('physical VRAM',0,32768),before,'OOM before drawing');
  }
  assert.equal(await num('set ::kj_oom'),2);
  await run(18);await run(19);await run(20);assert.equal(await num(`peek ${work}`),0);
  await run(21);
  assert.equal(await num('set ::kj_busy'),0);
  assert.equal(await num('set ::kj_badregs'),0);
  assert.ok(await num('set ::kj_calls')>25);
  assert.equal(await num('peek16 0xfc4a'),himem);
  if(process.argv.includes('--visual')) {
    await mkdir('build/screenshots',{recursive:true});
    await msx.command('set renderer SDLGL-PP');
    await msx.advance(.2);
    await msx.command(`screenshot -raw -size 640 ${tclString(resolve('build/screenshots/kanji-test.png'))}`);
  }
  console.log(`PASS [${z80?'Z80':'R800'}]: synchronous glyphs, register restoration, OOM boundary and BASIC data protection; HIMEM unchanged`);
} finally {await msx.stop();}

// The minimal machine deliberately has no Kanji-ROM.
const bare=new OpenMsx({rom:'build/kanji-test.rom',machine:'V9968_Basic'});
try {
  await bare.command('set throttle on; set speed 400');
  await bare.advance(12);
  const work=Number(await bare.command('peek16 0xfd2f'))&0xfffe;
  await bare.command('poke 0xc001 0; poke 0xc003 0');
  await bare.type([
    '10 CLEAR 200,&HBFFF:_SCREEN(5):_FONT(1)',
    '20 ON ERROR GOTO 100:_FONT(3)',
    '30 POKE &HC001,1:END',
    '100 POKE &HC003,ERR:RESUME 30',
  ].join('\r')+'\rRUN\r');
  for(let i=0;i<150 && Number(await bare.command('peek 0xc001'))===0;i++)await bare.advance(.1);
  assert.equal(Number(await bare.command('peek 0xc001')),1);
  assert.equal(Number(await bare.command('peek 0xc003')),5,'No Kanji-ROM means ERR=5');
  assert.equal(Number(await bare.command(`peek ${work}`)),1,'Failed selection preserves the previous font');
  console.log('PASS: absent Kanji-ROM rejected without disabling FONT(1)');
} finally {await bare.stop();}
