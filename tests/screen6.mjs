import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdir, readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { OpenMsx, tclString } from '../tools/openmsx.mjs';

const machine=process.argv.includes('V9968_Basic')?'V9968_Basic':'Panasonic_FS-A1ST(V9968)';
const visual=process.argv.includes('--visual'),root=resolve(import.meta.dirname,'..');
const cases=[],add=(code,error=0)=>{cases.push({code,error});return cases.length;};
const normal=add('_SCREEN(6):_WAIT VDP'),flat=add('_SCREEN(6,,,,,4):_WAIT VDP');
const page=n=>add(`_SET PAGE(${n},${n})`);
const pages=Array.from({length:8},(_,p)=>page(p));
const nativePages=Array.from({length:4},(_,p)=>add(`SET PAGE ${p},${p}`));
const fills=Array.from({length:8},(_,p)=>add(`_SET PAGE(0,${p}):_CLS(${p&3}):_PSET(${p},${p}),${(p&3)^3}:_WAIT VDP`));
const flatFills=Array.from({length:4},(_,p)=>add(`_SET PAGE(0,${p}):_CLS(${p}):_PSET(${300+p},${300+p}),${p^3}:_WAIT VDP`));
const on=add('_SCREEN(,,,,,4)'),off=add('_SCREEN(,,,,,0)');
const flags=add('_SCREEN(,,,,,,3,1)'),keep=add('_SCREEN(,,0)');
const nativeDraw=add('SET PAGE 0,0:COLOR 3,0,0:CLS:FOR C=0 TO 3:PSET(255+C,10),C:LINE(260+C*20,30)-(275+C*20,45),C,BF:NEXT C:LINE(511,211)-(0,0),2:LINE(360,40)-(300,20),3,B:_WAIT VDP');
const extendedDraw=add('_SET PAGE(0,1):_CLS(0):FOR C=0 TO 3:_PSET(255+C,10),C:_LINE(260+C*20,30)-(275+C*20,45),C,BF:NEXT C:_LINE(511,211)-(0,0),2:_LINE(360,40)-(300,20),3,B:_WAIT VDP');
const defaults=add('POKE &HF3E9,254:POKE &HF3EA,253:_CLS:_PSET(511,200):_LINE(255,255)-(256,255):_WAIT VDP');
const boundary=add('_SET PAGE(0,0):_CLS(0):_LINE(255,255)-(256,256),3,BF:_PSET(511,511),2:_WAIT VDP');
const full=add('_COPY(0,0)-(511,511),0 TO(0,0),3');
const chain=add('_COPY(0,0)-(511,511),3 TO(0,0),1,XOR:_COPY(0,0)-(511,511),1 TO(0,0),2,TPSET');
const initLogic=add('_SET PAGE(0,1):_CLS(0):FOR C=0 TO 15:_LINE(300+C,SY)-(300+C,SY+15),C AND 3:NEXT C:_SET PAGE(0,0):_CLS(0):_WAIT VDP');
const reset=add('FOR C=0 TO 31:_LINE(320,DY+C)-(351,DY+C),C AND 3:NEXT C:_WAIT VDP');
const settings=[add('SY=64:DY=32'),add('SY=300:DY=288')];
const ops=[['PSET',0],['AND',1],['OR',2],['XOR',3],['PRESET',4],['TPSET',8],['TAND',9],['TOR',10],['TXOR',11],['TPRESET',12]];
const variants=[
  {name:'plain',size:16,c:1,s:0,k:1,tail:op=>`,0,${op}`},
  {name:'window',size:32,c:1,s:0,k:1,tail:op=>`-(351,DY+31),0,${op},0`},
  {name:'rotate',size:32,c:0,s:1,k:1,tail:op=>`-(351,DY+31),0,${op},90`},
  {name:'scale',size:32,c:1,s:0,k:2,tail:op=>`-(351,DY+31),0,${op},,.5`},
  {name:'combined',size:32,c:0,s:1,k:2,tail:op=>`-(351,DY+31),0,${op},90,.5`}
];
const source='(300,SY)-(315,SY+15),1 TO(320,DY)';
const matrix=variants.map(v=>ops.map(([op])=>add(`_COPY${source}${v.tail(op)}`)));
const nativeCopy=ops.map(([op])=>add(`COPY${source},0,${op}`));
const omitted=add(`_COPY${source},0`),twice=add(`_COPY${source},0,XOR:_COPY${source},0,XOR`);
const once=add('DEFUSR=&HC100:POKE &HC010,0:_SCREEN(USR(6),USR(2),USR(0),USR(2),USR(1),USR(4),USR(3),USR(1))');
const oncePoint=add('POKE &HC010,0:_PSET(USR(511),USR(423)),USR(3):_WAIT VDP');
const onceCopy=add('POKE &HC010,0:_COPY(USR(300),USR(300))-(USR(315),USR(315)),USR(1) TO(USR(320),USR(288)),USR(0),TOR,USR(90),USR(1)');
const invalid=[
  ['_PSET(512,0),1',5],['_PSET(-1,0),1',5],['_PSET(0,512),1',5],['_PSET(0,-1),1',5],
  ['_PSET(0,0),4',5],['_LINE(0,0)-(1,1),255,BF',5],['_CLS(-1)',5],['_CLS(4)',5],
  ['_PSET("X",0),1',13],['_PSET(1/0,0),1',11],['_PSET(0,0),1 XYZ',2],
  ['_COPY(0,0)-(15,15),1 TO(0,0),0,PSET,TPSET',2],
  ['_COPY(0,0)-(511,511),1 TO(1,0),0',5],['_COPY(0,0)-(511,511),1 TO(0,1),0',5],
  ['_COPY(0,0)-(1,1),0 TO(0,0),0,,90',5],['_SET PAGE(4,0)',5],['_SET PAGE(0,4)',5],
  ['_FONT(1)',5],['_SPRITE(3)',5],['_SCREEN(6,,,,,5)',5],['_SCREEN(6,,,,,,4)',5]
].map(([code,error])=>add(code,error));
const normalInvalid=[add('_PSET(511,256),1',5),add('_SET PAGE(8,0)',5)];
const odd=add('SET PAGE 0,1'),oddEntry=add('_SCREEN(,,,,,4)',5),oddDraw=add('_PSET(511,300),1',5);
const recoverySetup=add('X%=512');
const resume=add('_PSET(X%,423),3:POKE &HC006,1:_WAIT VDP',5);
const next=add('_CLS(4):POKE &HC006,2',5);
const stable=add('_PSET(0,0),0:_WAIT VDP');
const compatCommands=add('VDP(22)=VDP(22) OR 1'),compatVram=add('VDP(22)=VDP(22) OR 1');
const disabled=add('_PSET(0,0),1',5),disabledFil=add('_SCREEN(,,,,,4)',5);
const noHs=add('VDP(21)=16'),noEpal=add('VDP(21)=1'),preservedMode=add('VDP(22)=66');
const font=add('_SCREEN(5):_FONT(1):SCREEN 6:_WAIT VDP');
const sat=add('_SCREEN(5):_SPRITE(3):SCREEN 6:_WAIT VDP');
const reservedPage=add('_SET PAGE(0,6)'),rawFil=add('VDP(22)=64:_SET PAGE(0,3)');
const fontBad=[236,251].map(y=>add(`_PSET(511,${y}),1`,5));
const satBad=[252,255].map(y=>add(`_PSET(511,${y}),1`,5));
const cross=add('_LINE(511,200)-(511,300),1',5),copyReserved=add('_COPY(0,200)-(511,300),0 TO(0,200),3',5);
const above=add('_PSET(511,256),3:_WAIT VDP'),clear=add('_CLS(2):_WAIT VDP');
const visualInit=add('_COLOR=(0,0,0,0):_COLOR=(1,31,31,31):_COLOR=(2,0,31,0):_COLOR=(3,31,0,0)');
const visualPages=[0,1].map(fil=>Array.from({length:fil?4:8},(_,p)=>add(`_SET PAGE(0,${p}):_CLS(0):_LINE(${32+p*48},${fil?300:64})-(${63+p*48},${fil?331:95}),2,BF:_WAIT VDP`)));
const visualDetail=add('_SET PAGE(0,0):_CLS(0):_LINE(100,100)-(131,131),2,BF:_LINE(400,300)-(431,331),3,BF:FOR N=0 TO 15:_LINE(200,256+N)-(215,256+N),1-(N AND 1):_LINE(256+N,200)-(256+N,215),1-(N AND 1):NEXT:_PSET(511,423),1:_WAIT VDP');
const finish=add('_SCREEN(0)');
assert.ok(cases.length<256,'Harness selectors must fit in one byte');

const msx=new OpenMsx({rom:process.env.V9968_TEST_ROM??'dist/v9968-basic.rom',machine});
const number=async c=>Number(await msx.command(c));
const bytes=async (dev,a,n)=>Buffer.from(await msx.command(`binary encode hex [debug read_block {${dev}} ${a} ${n}]`),'hex');
const vram=()=>bytes('physical VRAM',0,262144);
function put(data,x,y,page,fil,color) {
  const a=(page*(fil?512:256)+y)*128+(x>>2),s=(3-(x&3))*2;
  data[a]=(data[a]&~(3<<s))|(color<<s);
}
function pixel(data,x,y,page=0,fil=false) {return (data[(page*(fil?512:256)+y)*128+(x>>2)]>>((3-(x&3))*2))&3;}
function logic(op,s,d) {return op&8 && !s?d:[s,s&d,s|d,s^d,s^3][op&7];}
async function run(n,recover=0) {
  await msx.command(`set ::s6_copies 0; set ::s6_busy 0; poke 0xc001 0; poke 0xc003 0; poke 0xc005 ${recover}; poke 0xc006 0; poke 0xc000 ${n}`);
  for(let i=0;i<250 && !await number('peek 0xc001');i++) await msx.advance(.1);
  assert.equal(await number('peek 0xc001'),1,`Timeout: ${cases[n-1].code}`);
  assert.equal(await number('peek 0xc003'),cases[n-1].error,cases[n-1].code);
  if(cases[n-1].error) assert.equal(await number('peek16 0xc008'),1000+(n-1)*100,'ERL');
  assert.equal(await number('peek 0xc00a'),0,'BASIC scalars, array and string intact');
  assert.equal(await number('set ::s6_busy'),0,'COPY complete and R15=0 at return');
}
let work;
async function state() {return {vram:await vram(),regs:await bytes('VDP regs',0,59),work:await bytes('memory',work,32),
  hooks:await bytes('memory',0xfee4,5),slot:await bytes('memory',0xfd29,8),pages:await bytes('memory',0xfaf5,2),
  shadow:await bytes('memory',0xffe7,22),legacy:await bytes('memory',0xf3df,15),logop:await number('peek 0xfb02')};}
async function rejected(n) {const before=await state();await run(n);assert.deepEqual(await state(),before,cases[n-1].code);}
async function pageState() {return [...await bytes('memory',0xfaf5,2),await number('debug read {VDP regs} 2'),await number('peek 0xf3e1')];}
async function capture(name) {
  await msx.command('set renderer SDLGL-PP; set throttle on; set speed 100; set deinterlace on; set minframeskip 0; set maxframeskip 0');
  await msx.advance(.2);
  const path=resolve(root,`build/screenshots/screen6-${machine==='V9968_Basic'?'z80':'r800'}-${name}.png`);
  await mkdir(resolve(root,'build/screenshots'),{recursive:true});
  await msx.command(`screenshot -raw -size 640 ${tclString(path)}`);
  const png=JSON.parse(execFileSync('pwsh.exe',['-NoProfile','-File',resolve(root,'tests/read-png.ps1'),'-Path',path],{encoding:'utf8',windowsHide:true,maxBuffer:2**22}));
  assert.equal(png.width,640);assert.equal(png.height,480);
  const rgb=Buffer.from(png.rgb,'base64'),green=[],red=[];
  for(let y=0;y<480;y++) for(let x=0;x<640;x++) {
    const i=(y*640+x)*3;
    if(rgb[i]<10 && rgb[i+1]>240 && rgb[i+2]<10) green.push([x,y]);
    if(rgb[i]>240 && rgb[i+1]<10 && rgb[i+2]<10) red.push([x,y]);
  }
  return {rgb,green,red};
}
try {
  await msx.command('set throttle on; set speed 400');await msx.advance(16);
  assert.equal(await msx.command('get_active_cpu'),machine==='V9968_Basic'?'z80':'r800');
  work=(await number('peek16 0xfd2f'))&0xfffe;
  const map=await readFile('build/v9968-basic.map','ascii'),restore=/\brestore_text\s*= \$([0-9A-F]+)/i.exec(map)[1];
  await msx.command(`set ::s6_copies 0; set ::s6_busy 0
    debug set_bp 0x${restore} {[pc_in_slot 1] && [peek16 0xfd89] == 0x4f43 && [peek16 0xfd8b] == 0x5950} {
      incr ::s6_copies; set ::s6_busy [expr {$::s6_busy | ([debug read {VDP status regs} 2] & 1) | [debug read {VDP regs} 15]}]
    }
    debug write_block memory 0xc100 [binary format H* 2110c034c9]
    poke 0xc000 0; poke 0xc002 0; poke 0xc00a 0`);
  const program=['1 CLEAR 512,&HBFFF:DEFINT A-Z:ON ERROR GOTO 30000',
    '2 QA=12345:DIM QB(2):QB(0)=-123:QB(2)=456:QC$=STRING$(64,65)',
    '10 _SCREEN(6):POKE &HC002,1','20 IF PEEK(&HC000)=0 THEN 20','30 A=PEEK(&HC000):POKE &HC000,0'];
  for(let i=0;i<cases.length;i+=16) program.push(`${40+i/16} IF A>${i} AND A<=${i+16} THEN ON A-${i} GOSUB ${cases.slice(i,i+16).map((_,j)=>1000+(i+j)*100).join(',')}`);
  program.push('200 IF QA<>12345 OR QB(0)<>-123 OR QB(2)<>456 OR QC$<>STRING$(64,65) THEN POKE &HC00A,1',
    '210 POKE &HC001,1:GOTO 20','30000 POKE &HC003,ERR:POKE &HC008,ERL MOD 256:POKE &HC009,ERL\\256',
    '30010 IF PEEK(&HC005)=1 THEN X%=511:RESUME','30020 IF PEEK(&HC005)=2 THEN RESUME NEXT','30030 RESUME 200');
  cases.forEach(({code},i)=>program.push(`${1000+i*100} ${code}`,`${1010+i*100} RETURN`));
  assert.ok(program.every(l=>l.length<255));
  await msx.type(program.join('\r')+'\rRUN\r');
  for(let i=0;i<150 && !await number('peek 0xc002');i++) await msx.advance(.2);
  assert.equal(await number('peek 0xc002'),1,'Harness startup');
  for(let p=0;p<4;p++) {await run(nativePages[p]);const native=await pageState();await run(pages[0]);await run(pages[p]);assert.deepEqual(await pageState(),native);}
  for(const c of fills) await run(c);
  let data=await vram();
  for(let p=0;p<8;p++) {const expected=Buffer.alloc(32768,(p&3)*85);put(expected,p,p,0,false,(p&3)^3);assert.deepEqual(data.subarray(p*32768,(p+1)*32768),expected,`Native page ${p}`);}
  await run(normal);await run(nativeDraw);await run(extendedDraw);data=await vram();
  assert.deepEqual(data.subarray(0,27136),data.subarray(32768,32768+27136),'Native 2bpp PSET/LINE/box parity');
  await run(defaults);data=await vram();
  assert.equal(pixel(data,0,0,1),1);for(const [x,y] of [[511,200],[255,255],[256,255]]) assert.equal(pixel(data,x,y,1),2,'Default color masks to two bits');
  for(const c of normalInvalid) await rejected(c);
  await run(pages[6]);data=await vram();await run(on);assert.deepEqual(await pageState(),[6,6,223,223]);
  await run(flags);await run(keep);assert.equal(await number('debug read {VDP regs} 21')&64,64);
  assert.equal(await number('debug read {VDP regs} 20')&130,130);assert.equal(await number('debug read {VDP regs} 25')&128,128);
  await run(off);assert.deepEqual(await vram(),data,'Partial updates preserve all VRAM');
  await run(flat);for(const c of flatFills) await run(c);data=await vram();
  for(let p=0;p<4;p++) {const expected=Buffer.alloc(65536,p*85);put(expected,300+p,300+p,0,true,p^3);assert.deepEqual(data.subarray(p*65536,(p+1)*65536),expected,`FIL page ${p}`);}
  await run(boundary);data=await vram();
  for(const [x,y] of [[255,255],[256,255],[255,256],[256,256]]) assert.equal(pixel(data,x,y,0,true),3);
  assert.equal(pixel(data,511,511,0,true),2);
  await run(full);assert.equal(await number('set ::s6_copies'),1);assert.deepEqual((await vram()).subarray(196608),data.subarray(0,65536));
  const beforeChain=await vram(),expectedChain=Buffer.from(beforeChain);
  for(let n=0;n<65536;n++) {expectedChain[65536+n]^=beforeChain[196608+n];for(let x=0;x<4;x++){const s=(expectedChain[65536+n]>>(x*2))&3;if(s)expectedChain[131072+n]=(expectedChain[131072+n]&~(3<<(x*2)))|(s<<(x*2));}}
  await run(chain);assert.equal(await number('set ::s6_copies'),2);assert.deepEqual(await vram(),expectedChain);
  console.log(`PASS [${machine}]: 2bpp drawing/defaults, native parity, eight/four pages, partial flags/FIL, 9-bit axes and large chained synchronous copies`);
  for(let fil=0;fil<2;fil++) {
    await run(fil?flat:normal);await run(settings[fil]);await run(initLogic);
    const dy=fil?288:32;
    for(let vi=0;vi<variants.length;vi++) for(let oi=0;oi<ops.length;oi++) {
      const v=variants[vi],[op,code]=ops[oi];await run(reset);const before=await vram(),expected=Buffer.from(before),logop=await number('peek 0xfb02');
      for(let y=0;y<v.size;y++) for(let x=0;x<v.size;x++) {
        const sx=8+v.k*(v.c*(x-v.size/2)+v.s*(y-v.size/2));
        const sy=8+v.k*(-v.s*(x-v.size/2)+v.c*(y-v.size/2));
        const s=sx>=0 && sx<16 && sy>=0 && sy<16?sx&3:0;
        put(expected,320+x,dy+y,0,fil,logic(code,s,y&3));
      }
      await run(matrix[vi][oi]);assert.equal(await number('set ::s6_copies'),1);assert.equal(await number('peek 0xfb02'),logop);
      assert.deepEqual(await vram(),expected,`FIL=${fil} ${v.name} ${op}`);
      if(!fil && !vi) {await run(reset);await run(nativeCopy[oi]);assert.deepEqual(await vram(),expected,`Native COPY ${op}`);}
    }
    await run(reset);const before=await vram();await run(twice);assert.deepEqual(await vram(),before);assert.equal(await number('set ::s6_copies'),2);
    await run(reset);await run(matrix[0][0]);const expected=await vram();await run(reset);await run(omitted);assert.deepEqual(await vram(),expected);
    console.log(`PASS: SCREEN 6 FIL=${fil}, ten operators/all color pairs, transforms, source-window transparency, native COPY and LOGOPR/source protection`);
  }
  await run(once);assert.equal(await number('peek 0xc010'),8);await run(oncePoint);assert.equal(await number('peek 0xc010'),3);
  await run(onceCopy);assert.equal(await number('peek 0xc010'),10);await run(stable);
  for(const c of invalid) await rejected(c);
  await run(odd);await rejected(oddDraw);await run(normal);await run(odd);await rejected(oddEntry);
  await run(flat);await run(recoverySetup);await run(resume,1);assert.equal(await number('peek 0xc006'),1);await run(next,2);assert.equal(await number('peek 0xc006'),2);
  await run(noHs);await run(reset);await run(matrix[0][5]);await run(noEpal);await run(matrix[0][0]);await run(preservedMode);await run(stable);assert.equal(await number('debug read {VDP regs} 21'),66);
  await run(compatCommands);await rejected(disabled);await run(compatVram);await rejected(disabled);await rejected(disabledFil);
  for(const [setup,invalid,address,size,top] of [[font,fontBad,0x37600,2048,236],[sat,satBad,0x37e00,512,252]]) {
    await run(setup);await run(reservedPage);const protectedData=await bytes('physical VRAM',address,size);
    for(const c of invalid) await rejected(c);
    await run(rawFil);for(const c of [...invalid,cross,copyReserved]) await rejected(c);
    await run(above);await run(clear);assert.deepEqual(await bytes('physical VRAM',address,size),protectedData);
    data=await vram();assert.equal(pixel(data,511,top-1,3,true),2);assert.equal(pixel(data,511,256,3,true),3);
  }
  assert.equal((await number('peek16 0xfd2f'))&0xfffe,work);assert.equal(await number('peek16 0xfc4a'),0xbfff);
  console.log('PASS: single evaluation, ERR/ERL/RESUME, unchanged rejected state/BASIC data, disabled modes and physical font/SAT protection');
  if(visual) {
    for(let fil=0;fil<2;fil++) {
      await run(fil?flat:normal);await run(visualInit);for(const c of visualPages[fil]) await run(c);
      const before=await vram(),mapping=[];let left;
      for(let p=0;p<(fil?4:8);p++) {
        await run(pages[p]);const {green}=await capture(`${fil?'fil':'normal'}-page${p}`);
        assert.equal(green.length,fil?1024:2048,'Full 32x32 marker');
        const min=Math.min(...green.map(v=>v[0]));if(!p)left=min-32;
        mapping.push((min-left-32)/48);
      }
      assert.deepEqual(mapping,fil?[0,1,0,1]:[0,1,2,3,0,1,2,3],'Pinned fork upper display aliasing');
      assert.deepEqual(await vram(),before,'Display selection preserves source pages');
      console.log(`PASS: rendered ${fil?'FIL':'normal'} page mapping ${mapping}`);
    }
    await run(flat);await run(visualInit);await run(visualDetail);const {rgb,green,red}=await capture('detail');
    assert.equal(green.length,1024);assert.equal(red.length,1024);
    const left=Math.min(...green.map(p=>p[0]))-100,top=Math.min(...green.map(p=>p[1]))-100;
    assert.equal(Math.min(...red.map(p=>p[0]))-left,400);assert.equal(Math.min(...red.map(p=>p[1]))-top,300);
    const at=(x,y)=>[...rgb.subarray(((top+y)*640+left+x)*3,((top+y)*640+left+x)*3+3)];
    for(let n=0;n<16;n++) {const c=n&1?[0,0,0]:[255,255,255];assert.deepEqual(at(200,256+n),c);assert.deepEqual(at(256+n,200),c);}
    assert.deepEqual(at(511,423),[255,255,255],'Bottom-right visible pixel');
    console.log('PASS: rendered 512x424, one-pixel rows/columns and bottom-right edge');
  }
  await run(finish);
} finally {await msx.stop();}
