import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { OpenMsx,tclString } from '../tools/openmsx.mjs';

const machine=process.argv.includes('V9968_Basic')?'V9968_Basic':'Panasonic_FS-A1ST(V9968)';
const visual=process.argv.includes('--visual');
const cases=[],add=(code,error=0)=>{cases.push({code,error});return cases.length;};
const setups=[1,2,3,4,5,6].map(m=>add(`_PATTERN OFF:SCREEN ${m}:COLOR 0,0,0:CLS:_V9968:_SPRITE(3)`));
const prepare=add('_PATTERN ON(7):_CLS(0):_LINE(0,0)-(7,7),2,BF:_LINE(8,0)-(15,7),3,BF:_LINE(0,8)-(7,15),5,BF:_LINE(8,8)-(15,127),15,BF:_PATTERN OFF');
const palette=add('_COLOR=(0,0,0,0):_COLOR=(1,0,0,0):_COLOR=(18,31,0,0):_COLOR=(19,0,31,0):_COLOR=(21,31,31,0):_COLOR=(31,0,31,31)');
const show=add('_PUT SPRITE(0,80,40),1,1792,SIZE(32,16)');
const move=add('_PUT SPRITE(0,96,40)');
const style=add('_PUT SPRITE(0,80,40),,,SIZE(16,32),FLIP(3),TRANS(50),PATTERN(32)');
const tall=add('_PUT SPRITE(0,80,40),,,PATTERN(128),SIZE(16,128),FLIP(0),TRANS(0)');
const all=add('FOR J=0 TO 63:_PUT SPRITE(J,(J MOD 16)*16,16+(J\\16)*40),1,1792,SIZE(16,16),PATTERN(16):NEXT');
const clear=add('_SPRITE CLEAR'),off=add('_SPRITE OFF'),on=add('_SPRITE ON');
const flags=add('_SCREEN(,,,,,,3,1)'),reinit=add('_SPRITE(3)');
const on6=add('_PATTERN ON(6)'),on7=add('_PATTERN ON(7)');
const protect=add('_CLS(2)'),badPixel=add('_PSET(0,252),1',5);
const bad=[['_PUT SPRITE(64,0,0)',5],['_PUT SPRITE(0,0,0),16',5],['_PUT SPRITE(0,0,0),,1776',5],
  ['_PUT SPRITE(0,512,0)',5],['_PUT SPRITE(0,0,0),,,TRANS(1)',5],['_FONT(1)',5]].map(([c,e])=>add(c,e));
const rejectSetups=[0,7,8,10,11,12].map(m=>add(`SCREEN ${m}:_V9968`));
const badMode=add('_SPRITE(3)',5);
const compatCommands=add('VDP(22)=VDP(22) OR 1'),compatVram=add('VDP(22)=VDP(22) OR 1'),missingPalette=add('VDP(21)=9');
const restore=add('_V9968'),disable=add('_SPRITE(0)');
const msx=new OpenMsx({rom:'dist/v9968-basic.rom',machine});
const num=async s=>Number(await msx.command(s));
const bytes=async(d,a,n)=>Buffer.from(await msx.command(`binary encode hex [debug read_block {${d}} ${a} ${n}]`),'hex');
const table=()=>bytes('physical VRAM',0x37e00,512);
function record(n,x,y,w=16,h=16,size=0,flip=0,trans=0) {y--;return Buffer.from([y&255,((y>>8)&3)|(size<<6),h&255,1|(flip<<4)|(trans<<6),x&255,((x>>8)&3)|0x70,w&255,0]);}
let work;
async function run(n) {
  await msx.command(`poke 0xc001 0; poke 0xc003 0; poke 0xc000 ${n}`);
  for(let i=0;i<120&&!await num('peek 0xc001');i++)await msx.advance(.1);
  assert.equal(await num('peek 0xc001'),1,cases[n-1].code);
  assert.equal(await num('peek 0xc003'),cases[n-1].error,cases[n-1].code);
  assert.equal(await num('peek 0xc00a'),0,'BASIC data');
}
async function state(){return {vram:await bytes('physical VRAM',0,262144),regs:await bytes('VDP regs',0,59),
  ram:await bytes('memory',work,32),shadow:await bytes('memory',0xffe7,22),pages:await bytes('memory',0xfaf5,2)};}
async function reject(n){const before=await state();await run(n);assert.deepEqual(await state(),before,cases[n-1].code);}
async function frame(mode,name) {
  await mkdir(resolve('build/screenshots'),{recursive:true});
  await msx.command('set renderer SDLGL-PP; set speed 100; set minframeskip 0; set maxframeskip 0');await msx.advance(.2);
  const path=resolve(`build/screenshots/sprite-sc${mode}-${machine==='V9968_Basic'?'z80':'r800'}-${name}.png`);
  await msx.command(`screenshot -raw -size 640 ${tclString(path)}`);
  const png=JSON.parse(execFileSync('pwsh.exe',['-NoProfile','-File',resolve('tests/read-png.ps1'),'-Path',path],{encoding:'utf8',windowsHide:true,maxBuffer:2**22}));
  const data=Buffer.from(png.rgb,'base64'),red=[],green=[];
  for(let i=0;i<data.length;i+=3){const p=[(i/3)%png.width,Math.floor(i/3/png.width)];if(data[i]>240&&data[i+1]<10&&data[i+2]<10)red.push(p);if(data[i]<10&&data[i+1]>240&&data[i+2]<10)green.push(p);}
  return {red,green};
}
try {
  await msx.command('set throttle on; set speed 200');await msx.advance(12);
  work=(await num('peek16 0xfd2f'))&0xfffe;
  await msx.command('poke 0xc000 0; poke 0xc002 0; poke 0xc00a 0');
  const program=['1 CLEAR 512,&HBFFF:DEFINT A-Z:ON ERROR GOTO 30000',
    '2 QA=12345:DIM QB(2):QB(2)=456:QC$=STRING$(64,65):POKE &HC002,1',
    '20 IF PEEK(&HC000)=0 THEN 20','30 A=PEEK(&HC000):POKE &HC000,0'];
  for(let i=0;i<cases.length;i+=16)program.push(`${40+i} IF A>${i} AND A<=${i+16} THEN ON A-${i} GOSUB ${cases.slice(i,i+16).map((_,j)=>1000+(i+j)*100).join(',')}`);
  program.push('200 IF QA<>12345 OR QB(2)<>456 OR QC$<>STRING$(64,65) THEN POKE &HC00A,1',
    '210 POKE &HC001,1:GOTO 20','30000 POKE &HC003,ERR:RESUME 200');
  cases.forEach(({code},i)=>program.push(`${1000+i*100} ${code}`,`${1010+i*100} RETURN`));
  await msx.type(program.join('\r')+'\rRUN\r');
  for(let i=0;i<120&&!await num('peek 0xc002');i++)await msx.advance(.1);
  for(let m=1;m<=6;m++) {
    await run(setups[m-1]);const before=await bytes('physical VRAM',0,16384);
    await run(prepare);assert.deepEqual(await bytes('physical VRAM',0,16384),before,'Native background unaffected');
    await run(palette);await run(show);assert.deepEqual((await table()).subarray(0,8),record(0,80,40,32));
    let original;
    if(visual){original=await frame(m,'normal');const scale=m===6?1:2;assert.equal(original.red.length,16*8*scale*2);assert.equal(original.green.length,original.red.length);}
    await run(move);assert.deepEqual((await table()).subarray(0,8),record(0,96,40,32));
    if(visual){const shifted=await frame(m,'move');assert.equal(Math.min(...shifted.red.map(p=>p[0]))-Math.min(...original.red.map(p=>p[0])),16*(m===6?1:2));}
    await run(style);assert.deepEqual((await table()).subarray(0,8),record(0,80,40,16,32,1,3,2));
    await run(tall);assert.deepEqual((await table()).subarray(0,8),record(0,80,40,16,128,3));
    await run(off);if(visual)assert.equal((await frame(m,'off')).red.length,0);
    await run(on);await run(clear);await run(all);const sat=await table();
    for(let n=0;n<64;n++)assert.deepEqual(sat.subarray(n*8,n*8+8),record(n,(n%16)*16,16+Math.floor(n/16)*40));
    await run(flags);await run(reinit);assert.equal((await num('debug read {VDP regs} 20'))&0x82,0x82);assert.equal((await num('debug read {VDP regs} 25'))&128,128);
    await run(on6);const preserved=await table();await run(protect);await reject(badPixel);assert.deepEqual(await table(),preserved);
    for(const n of bad.slice(0,m===5?-1:undefined))await reject(n);
    for(const n of [compatCommands,compatVram,missingPalette]){await run(n);await reject(badMode);await run(restore);}
    await run(disable);await run(on7);
    console.log(`PASS [${machine}]: SCREEN ${m} mode3, FG4 assets, 64 SAT records, options/omissions, flags, protection and errors${visual?', rendered pixels/motion/OFF':''}`);
  }
  for(const n of rejectSetups){await run(n);await reject(badMode);}
  console.log('PASS: SCREEN 0 and pending planar 7..12 reject before mutation');
} finally {await msx.stop();}
