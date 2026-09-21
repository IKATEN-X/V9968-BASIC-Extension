import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { OpenMsx, tclString } from '../tools/openmsx.mjs';

const machine=process.argv.includes('V9968_Basic')?'V9968_Basic':'Panasonic_FS-A1ST(V9968)';
const visual=process.argv.includes('--visual'),root=resolve(import.meta.dirname,'..');
const msx=new OpenMsx({rom:'dist/v9968-basic.rom',machine});
const cases=[],add=(code,error=0)=>{cases.push({code,error});return cases.length;};
const prepare=add('_SCREEN(5):_SET PAGE(0,7):_CLS(0):_LINE(0,0)-(7,7),2,BF:_LINE(8,0)-(15,7),3,BF:_LINE(0,8)-(7,15),5,BF:_LINE(8,8)-(15,15),15,BF:_LINE(0,16)-(15,127),15,BF:_WAIT VDP');
const init=add('SCREEN 6:_SPRITE(3):_SET PAGE(0,0):_CLS(1):_LINE(0,0)-(3,3),3,BF:_WAIT VDP');
const palette=add('_COLOR=(0,0,0,0):_COLOR=(1,0,0,31):_COLOR=(3,31,0,31):_COLOR=(18,31,0,0):_COLOR=(19,0,31,0):_COLOR=(21,31,31,0):_COLOR=(31,0,31,31)');
const show=add('_PUT SPRITE(0,100,40),1,1792,SIZE(32,16)');
const move=add('_PUT SPRITE(0,304,44)'),style=add('_PUT SPRITE(0,100,40),,,FLIP(1),TRANS(50),SIZE(16,16)');
const hide=add('_SPRITE OFF(0)'),showAgain=add('_PUT SPRITE(0,100,40),,,FLIP(0),TRANS(0)');
const off=add('_SPRITE OFF'),on=add('_SPRITE ON');
const tall=add('_PUT SPRITE(0,100,40),,,PATTERN(128),SIZE(16,128)');
const edge=add('_PUT SPRITE(63,511,211),1,1792,SIZE(1,1)');
const clear=add('_SPRITE CLEAR');
const all=add('FOR J=0 TO 63:_PUT SPRITE(J,(J MOD 16)*16,16+(J\\16)*40),1,1792:NEXT');
const flags=add('_SCREEN(,,,,,,3,1)'),reinit=add('_SPRITE(3)');
const protect=add('_SET PAGE(0,6):_CLS(2):_WAIT VDP');
const bad=[['_PSET(511,252),3',5],['_COPY(0,240)-(15,255),6 TO(1,240),6',5],
  ['_PUT SPRITE(0,1,1),16,1792',5],['_PUT SPRITE(0,1,1),0,1776',5],
  ['_PUT SPRITE(0,1,1),,2047,PATTERN(32)',5],['_PUT SPRITE(64,1,1)',5],
  ['_PUT SPRITE(0,512,1)',5],['_PUT SPRITE(0,1,1),,,TRANS(1)',5],
  ['_PUT SPRITE(0,1,1),,,BOGUS(1)',2],['_PUT SPRITE(0,1,1),,,SIZE(1/0,2)',11],
  ['_FONT(1)',5],['_SCREEN(,,,,,4)',5]].map(([s,e])=>add(s,e));
const once=add('DEFUSR=&HC100:POKE &HC010,0:_PUT SPRITE(USR(0),USR(300),USR(40)),USR(1),USR(1792),SIZE(USR(32),USR(16))');
const recoverInit=add('J=64'),recover=add('_PUT SPRITE(J,300,40)',5);
const release=add('_SPRITE(0):_CLS(2):_WAIT VDP');
const fil=add('_SCREEN(6,,,,,4)'),filReject=add('_SPRITE(3)',5);
const other=[7,8].map(m=>[add(`_SCREEN(${m})`),add('_SPRITE(3)',5)]);
const finish=add('_SCREEN(0)');
const number=async c=>Number(await msx.command(c));
const bytes=async (dev,a,n)=>Buffer.from(await msx.command(`binary encode hex [debug read_block {${dev}} ${a} ${n}]`),'hex');
const table=()=>bytes('physical VRAM',0x37e00,512);
async function run(n,recovery=0) {
  await msx.command(`poke 0xc001 0; poke 0xc003 0; poke 0xc005 ${recovery}; poke 0xc000 ${n}`);
  for(let i=0;i<100&&!await number('peek 0xc001');i++) await msx.advance(.1);
  assert.equal(await number('peek 0xc001'),1,cases[n-1].code);
  assert.equal(await number('peek 0xc003'),cases[n-1].error,cases[n-1].code);
  if(cases[n-1].error) assert.equal(await number('peek16 0xc008'),1000+(n-1)*10);
  assert.equal(await number('peek 0xc00a'),0,'BASIC data protected');
  if(/^_(PUT SPRITE|SPRITE)/.test(cases[n-1].code)&&!cases[n-1].error)
    assert.equal(await number('debug read {VDP regs} 14'),await number('peek 0xffed'),'R14 restored');
}
let work;
async function state() {return {vram:await bytes('physical VRAM',0,262144),regs:await bytes('VDP regs',0,59),
  work:await bytes('memory',work,32),hook:await bytes('memory',0xfee4,5),pages:await bytes('memory',0xfaf5,2),
  shadow:await bytes('memory',0xffe7,22),slot:await bytes('memory',0xfd29,8)};}
function record({x=0,y=511,w=16,h=16,palette=0,pattern=0,size=0,flip=0,trans=0}={}) {
  y--;return Buffer.from([y&255,((y>>8)&3)|(size<<6),h&255,palette|(flip<<4)|(trans<<6),x&255,((x>>8)&3)|((pattern>>8)<<4),w&255,pattern&255]);
}
async function check(n,options) {assert.deepEqual((await table()).subarray(n*8,n*8+8),record(options));}
let origin;
async function frame(name) {
  await mkdir(resolve(root,'build/screenshots'),{recursive:true});
  await msx.command('set renderer SDLGL-PP; set speed 100; set minframeskip 0; set maxframeskip 0');await msx.advance(.2);
  const path=resolve(root,`build/screenshots/sprite-screen6-${machine==='V9968_Basic'?'z80':'r800'}-${name}.png`);
  await msx.command(`screenshot -raw -size 640 ${tclString(path)}`);
  const p=JSON.parse(execFileSync('pwsh.exe',['-NoProfile','-File',resolve(root,'tests/read-png.ps1'),'-Path',path],{encoding:'utf8',windowsHide:true,maxBuffer:2**22}));
  const rgb=Buffer.from(p.rgb,'base64');
  if(!origin) {
    const points=[];
    for(let i=0;i<rgb.length;i+=3) if(rgb[i]>240&&rgb[i+1]<10&&rgb[i+2]>240) points.push([i/3%p.width,Math.floor(i/3/p.width)]);
    assert.ok(points.length,'Bitmap origin marker');origin=[Math.min(...points.map(a=>a[0])),Math.min(...points.map(a=>a[1]))];
  }
  return (x,y)=>{const i=((origin[1]+y*2)*p.width+origin[0]+x)*3;return [...rgb.subarray(i,i+3)];};
}
try {
  await msx.command('set throttle on; set speed 100');await msx.advance(12);
  work=(await number('peek16 0xfd2f'))&0xfffe;
  await msx.command('poke 0xc000 0; poke 0xc002 0; poke 0xc00a 0; debug write_block memory 0xc100 [binary format H* 2110c034c9]');
  const program=['1 CLEAR 512,&HBFFF:DEFINT A-Z:ON ERROR GOTO 30000',
    '2 QA=12345:DIM QB(2):QB(2)=456:QC$=STRING$(64,65):POKE &HC002,1',
    '20 IF PEEK(&HC000)=0 THEN 20','30 N=PEEK(&HC000):POKE &HC000,0'];
  for(let i=0;i<cases.length;i+=16) program.push(`${40+i} IF N>${i} AND N<=${i+16} THEN ON N-${i} GOSUB ${cases.slice(i,i+16).map((_,j)=>1000+(i+j)*10).join(',')}`);
  program.push('200 IF QA<>12345 OR QB(2)<>456 OR QC$<>STRING$(64,65) THEN POKE &HC00A,1',
    '210 POKE &HC001,1:GOTO 20','30000 POKE &HC003,ERR:POKE &HC008,ERL MOD 256:POKE &HC009,ERL\\256',
    '30010 IF PEEK(&HC005)=1 THEN J=0:RESUME','30020 RESUME NEXT');
  cases.forEach(({code},i)=>program.push(`${1000+i*10} ${code}`,`${1001+i*10} RETURN`));
  assert.ok(program.every(l=>l.length<255));await msx.type(program.join('\r')+'\rRUN\r');
  for(let i=0;i<100&&!await number('peek 0xc002');i++) await msx.advance(.2);
  await run(prepare);const source=await bytes('physical VRAM',0x38000,32768);
  await run(init);assert.deepEqual(await bytes('physical VRAM',0x38000,32768),source,'Native SCREEN 6 keeps upper pattern set');
  const initialTable=await table();
  for(let n=0;n<64;n++) assert.deepEqual(initialTable.subarray(n*8,n*8+8),record());
  await run(palette);await run(show);await check(0,{x:100,y:40,w:32,palette:1,pattern:1792});
  if(visual) {
    const p=await frame('normal');assert.deepEqual(p(100,40),[255,0,0]);assert.deepEqual(p(99,40),[0,0,255]);
    assert.deepEqual(p(116,40),[0,255,0]);assert.deepEqual(p(100,48),[255,255,0]);assert.deepEqual(p(116,48),[0,255,255]);
    assert.deepEqual(p(132,40),[0,0,255]);
  }
  await run(move);await check(0,{x:304,y:44,w:32,palette:1,pattern:1792});
  if(visual) assert.deepEqual((await frame('right-clipped'))(304,44),[0,0,255],'Known fork clipping: X >= 256');
  await run(style);const styled={x:100,y:40,palette:1,pattern:1792,flip:1,trans:2};await check(0,styled);
  if(visual) {const c=(await frame('blend'))(101,41);assert.ok(c[0]===0&&c[1]>0&&c[2]>0);}
  await run(hide);await check(0,{...styled,y:511});await run(showAgain);await run(off);
  if(visual) assert.deepEqual((await frame('off'))(100,40),[0,0,255]);
  await run(on);await run(tall);await check(0,{x:100,y:40,palette:1,pattern:1792,h:128,size:3});
  await run(edge);await check(63,{x:511,y:211,palette:1,pattern:1792,w:1,h:1});
  if(visual) {const p=await frame('tall-edge');assert.deepEqual(p(100,167),[0,255,255]);assert.deepEqual(p(511,211),[0,0,255],'Known fork clipping at right edge');}
  await run(clear);await run(all);
  if(visual) {const p=await frame('64');for(let n=0;n<64;n++) assert.deepEqual(p((n%16)*16,16+Math.floor(n/16)*40),[255,0,0]);}
  await run(flags);await run(reinit);assert.equal((await number('debug read {VDP regs} 20'))&0x82,0x82);
  assert.equal((await number('debug read {VDP regs} 25'))&0x80,0x80);
  await run(once);assert.equal(await number('peek 0xc010'),7);await check(0,{x:300,y:40,palette:1,pattern:1792,w:32});
  const sat=await table();await run(protect);assert.deepEqual(await table(),sat);
  for(const n of bad) {const before=await state();await run(n);assert.deepEqual(await state(),before,cases[n-1].code);}
  await run(recoverInit);await run(recover,1);await check(0,{x:300,y:40,palette:1,pattern:1792,w:32});
  await run(release);assert.deepEqual(await table(),Buffer.alloc(512,0xaa));
  await run(fil);const before=await state();await run(filReject);assert.deepEqual(await state(),before);
  for(const [init,reject] of other) {await run(init);const before=await state();await run(reject);assert.deepEqual(await state(),before);}
  await run(finish);
  console.log(`PASS [${machine}]: SCREEN 6 mode-3 64 planes, wide SAT coordinates, size/flip/blend/pattern heights, omitted args, flags, protection, ERR/ERL/RESUME, BASIC data${visual?', left-half rendered pixels and known X>=256 clipping':''}; SCREEN 7/8 and FIL remain rejected`);
} finally {await msx.stop();}
