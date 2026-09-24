import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdir, readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { OpenMsx, tclString } from '../tools/openmsx.mjs';

const machine=process.argv.includes('V9968_Basic')?'V9968_Basic':'Panasonic_FS-A1ST(V9968)';
const visual=process.argv.includes('--visual');
const root=resolve(import.meta.dirname,'..'),cases=[];
function add(code,error=0) { cases.push({code,error});return cases.length; }
const normal=add('_SCREEN(7):_WAIT VDP');
const flat=add('_SCREEN(7,,,,,4):_WAIT VDP');
const nativePage=add('SET PAGE 1,1');
const extendedPage=add('_SET PAGE(1,1)');
const upperPage=add('_SET PAGE(2,2)');
const lowPage=add('_SET PAGE(0,0)');
const on=add('_SCREEN(,,,,,4)'),off=add('_SCREEN(,,,,,0)');
const keep=add('_SCREEN(,,0):_SCREEN(,,,,,,3,1)');
const fill=[0,1,2,3].map(p=>add(`_SET PAGE(0,${p}):_CLS(${p+1}):_WAIT VDP`));
const fillFlat=[0,1].map(p=>add(`_SET PAGE(0,${p}):_CLS(${p+5}):_WAIT VDP`));
const pattern=add('_SET PAGE(0,0):_CLS(0):_LINE(280,64)-(303,87),3,BF:_LINE(511,200)-(0,200),6:_LINE(270,60)-(240,40),5,B:_PSET(511,255),7:_WAIT VDP');
const copy=add('_SET PAGE(0,1):_CLS(0):_COPY(240,0)-(511,255),0 TO(128,0),1');
const rotate=add('_SET PAGE(0,1):_CLS(0):_COPY(256,32)-(383,159),0 TO(320,64),1,,90');
const scale=add('_SET PAGE(0,1):_CLS(0):_COPY(256,32)-(383,159),0 TO(320,64),1,,,.5');
const stable=add('_SET PAGE(0,0):_PSET(0,0),0:_WAIT VDP');
const flatPattern=add('_SET PAGE(0,0):_CLS(0):_LINE(240,240)-(280,280),3,BF:_LINE(450,450)-(255,255),5,B:_LINE(511,511)-(0,0),6:_PSET(511,423),7:_WAIT VDP');
const flatLines=add('_LINE(511,0)-(0,511),8:_LINE(300,511)-(300,0),9:_LINE(0,300)-(511,300),10:_WAIT VDP');
const fullCopy=add('_COPY(0,0)-(511,511),0 TO(0,0),1');
const chain=add('_COPY(0,0)-(511,511),0 TO(0,0),1:_COPY(0,0)-(511,511),1 TO(0,0),0');
const highSource=add('_SET PAGE(0,0):_CLS(0):_LINE(280,288)-(303,311),3,BF:_WAIT VDP');
const highRotate=add('_SET PAGE(0,1):_CLS(0):_COPY(256,256)-(383,383),0 TO(320,256),1,,90');
const highScale=add('_SET PAGE(0,1):_CLS(0):_COPY(256,256)-(383,383),0 TO(320,256),1,,,.5');
const once=add('POKE &HC010,0:DEFUSR=&HC100:_SCREEN(USR(7),USR(2),USR(0),USR(2),USR(1),USR(4),USR(3),USR(1))');
const oncePoint=add('POKE &HC010,0:_PSET(USR(511),USR(423)),USR(15):_WAIT VDP');
const onceCopy=add('POKE &HC010,0:_COPY(USR(256),USR(256))-(USR(383),USR(383)),USR(0) TO(USR(320),USR(256))-(USR(447),USR(383)),USR(1),,USR(90),USR(1)');
const noFont=add('_FONT(1)',5),noSprite=add('_SPRITE(3)',5);
const bad=[
  ['_PSET(512,0),1',5],['_PSET(-1,0),1',5],['_PSET(0,512),1',5],['_PSET(0,-1),1',5],
  ['_PSET("X",0),1',13],['_PSET(1/0,0),1',11],['_PSET(511,423),1 XYZ',2],
  ['_SET PAGE(2,0)',5],['_SET PAGE(0,2)',5],
  ['_COPY(0,0)-(511,10),0 TO(1,0),1',5],['_COPY(0,0)-(10,511),0 TO(0,1),1',5],
  ['_COPY(256,0)-(255,10),0 TO(0,0)-(10,10),1',5],
  ['_COPY(0,0)-(10,10),0 TO(256,0)-(255,10),1',5],
  ['_COPY(0,0)-(10,10),0 TO(0,0),0,,90',5],['_SCREEN(7,,,,,5)',5]
].map(([code,error])=>add(code,error));
const normalBad=[add('_PSET(511,256),1',5),add('_SET PAGE(4,0)',5)];
const oddNative=add('SET PAGE 0,1');
const oddDraw=add('_PSET(511,300),1',5),oddEntry=add('_SCREEN(,,,,,4)',5);
const recoverySetup=add('X%=512');
const recovery=add('_PSET(X%,423),15:POKE &HC006,1:_WAIT VDP',5);
const next=add('_COPY(0,0)-(511,10),0 TO(1,0),1:POKE &HC006,2',5);
const compatVram=add('VDP(22)=VDP(22) OR 1'),disabledDraw=add('_PSET(511,200),15',5);
const noHs=add('VDP(21)=16:_PSET(511,511),11:_WAIT VDP');
const preservedMode=add('VDP(22)=66:_PSET(511,511),12:_WAIT VDP');
const font=add('_SCREEN(5):_FONT(1):SCREEN 7:_WAIT VDP');
const sat=add('_SCREEN(5):_SPRITE(3):SCREEN 7:_WAIT VDP');
const sp3Blocked=['_PSET(0,0),1','_LINE(0,0)-(31,31),1','_CIRCLE(16,16),8,1',
  '_CLS(2)','_SET PAGE(0,2)','_COPY(0,0)-(15,15),0 TO(32,32),1'
].map(code=>add(code,5));
const rawFlat=add('VDP(22)=64:_SET PAGE(0,1)');
const fontBad=[236,251].map(y=>add(`_PSET(2,${y}),1`,5));
const crossing=add('_LINE(2,200)-(2,300),1',5);
const copyReserved=add('_COPY(0,200)-(511,300),0 TO(0,200),1',5);
const above=add('_PSET(2,256),9:_WAIT VDP');
const clear=add('_CLS(2):_WAIT VDP');
const normalReservedPage=add('_SET PAGE(0,2)');
const finish=add('_SCREEN(0)');
const visualBase=add('_SCREEN(7,,,,,4):_SET PAGE(0,0):_CLS(0):_COLOR=(0,0,0,0):_COLOR=(2,31,0,0):_COLOR=(3,0,31,0):_COLOR=(4,0,0,31):_COLOR=(15,31,31,31):_COLOR=(6,31,31,0)');
const visualRects=add('_LINE(100,100)-(131,131),3,BF:_LINE(400,300)-(431,331),2,BF:_LINE(0,0)-(511,423),6,B:_WAIT VDP');
const visualStripes=add('FOR Y=256 TO 270 STEP 2:_LINE(200,Y)-(215,Y),15:_LINE(200,Y+1)-(215,Y+1),4:NEXT Y:FOR X=256 TO 270 STEP 2:_LINE(X,200)-(X,215),15:_LINE(X+1,200)-(X+1,215),4:NEXT X:_WAIT VDP');

const msx=new OpenMsx({rom:'dist/v9968-basic.rom',machine});
const number=async command=>Number(await msx.command(command));
const bytes=async (device,address,size)=>Buffer.from(await msx.command(`binary encode hex [debug read_block {${device}} ${address} ${size}]`),'hex');
const vram=()=>bytes('physical VRAM',0,262144);
function pixel(data,x,y,page=0,fil=false) {
  const row=y+page*(fil?512:256);
  const address=((x&2)<<15)|((row&511)<<7)|(x>>2)|((row&512)<<8);
  return (data[address]>>((x&1)?0:4))&15;
}
function decodedPage(data,page,fil=false) {
  const rows=fil?512:256,decoded=Buffer.alloc(512*rows);
  for(let y=0;y<rows;y++) for(let x=0;x<512;x++) decoded[y*512+x]=pixel(data,x,y,page,fil);
  return decoded;
}
async function run(n,recover=0) {
  await msx.command(`set ::s7_copies 0; set ::s7_busy 0; poke 0xc001 0; poke 0xc003 0; poke 0xc005 ${recover}; poke 0xc006 0; poke 0xc000 ${n}`);
  for(let i=0;i<150 && !await number('peek 0xc001');i++) await msx.advance(.1);
  assert.equal(await number('peek 0xc001'),1,`Timeout: ${cases[n-1].code}`);
  assert.equal(await number('peek 0xc003'),cases[n-1].error,cases[n-1].code);
  if(cases[n-1].error) assert.equal(await number('peek16 0xc008'),1000+(n-1)*100,'ERL');
  assert.equal(await number('peek 0xc00a'),0,'BASIC variables/array/string are intact');
  assert.equal(await number('set ::s7_busy'),0,'COPY finishes and restores status selector');
}
let work;
async function snapshot() {
  return {vram:await vram(),regs:await bytes('VDP regs',0,59),
    work:await bytes('memory',work,32),hook:await bytes('memory',0xfee4,5),
    pages:await bytes('memory',0xfaf5,2),shadow:await bytes('memory',0xffe7,22),
    legacy:await bytes('memory',0xf3df,15),pointer:await bytes('memory',0xfd2f,2)};
}
async function rejected(n) { const before=await snapshot();await run(n);assert.deepEqual(await snapshot(),before,cases[n-1].code); }
async function pageSettings() { return [...await bytes('memory',0xfaf5,2),await number('debug read {VDP regs} 2'),await number('peek 0xf3e1')]; }
try {
  await msx.command('set throttle on; set speed 1000');await msx.advance(12);
  work=(await number('peek16 0xfd2f'))&0xfffe;
  const map=await readFile(resolve(root,'build/v9968-basic.map'),'ascii');
  const restore=/\brestore_text\s*= \$([0-9A-F]+)/i.exec(map)[1];
  await msx.command(`set ::s7_copies 0; set ::s7_busy 0
    debug set_bp 0x${restore} {[pc_in_slot 1] && [peek16 0xfd89] == 0x4f43 && [peek16 0xfd8b] == 0x5950} {
      incr ::s7_copies; set ::s7_busy [expr {$::s7_busy | ([debug read {VDP status regs} 2] & 1) | [debug read {VDP regs} 15]}]
    }
    debug write_block memory 0xc100 [binary format H* 2110c034c9]
    poke 0xc000 0; poke 0xc002 0; poke 0xc00a 0`);
  const program=['1 CLEAR 512,&HBFFF:DEFINT A-Z:ON ERROR GOTO 30000',
    '2 QA=12345:DIM QB(2):QB(0)=-123:QB(2)=456:QC$=STRING$(64,65)',
    '10 _SCREEN(7):POKE &HC002,1','20 IF PEEK(&HC000)=0 THEN 20','30 A=PEEK(&HC000):POKE &HC000,0'];
  for(let i=0;i<cases.length;i+=16) program.push(`${40+i} IF A>${i} AND A<=${i+16} THEN ON A-${i} GOSUB ${cases.slice(i,i+16).map((_,j)=>1000+(i+j)*100).join(',')}`);
  program.push('200 IF QA<>12345 OR QB(0)<>-123 OR QB(2)<>456 OR QC$<>STRING$(64,65) THEN POKE &HC00A,1',
    '210 POKE &HC001,1:GOTO 20','30000 POKE &HC003,ERR:POKE &HC008,ERL MOD 256:POKE &HC009,ERL\\256',
    '30010 IF PEEK(&HC005)=1 THEN X%=511:RESUME','30020 IF PEEK(&HC005)=2 THEN RESUME NEXT','30030 RESUME 200');
  cases.forEach(({code},i)=>program.push(`${1000+i*100} ${code}`,`${1010+i*100} RETURN`));
  assert.ok(program.every(line=>line.length<255));
  await msx.type(program.join('\r')+'\rRUN\r');
  for(let i=0;i<100 && !await number('peek 0xc002');i++) await msx.advance(.5);
  assert.equal(await number('peek 0xc002'),1,'Harness startup');
  await run(nativePage);const native=await pageSettings();await run(lowPage);await run(extendedPage);
  assert.deepEqual(await pageSettings(),native,'Native SCREEN 7 SET PAGE parity, including R2');
  for(const c of fill) await run(c);
  let data=await vram();
  for(let p=0;p<4;p++) assert.deepEqual(decodedPage(data,p),Buffer.alloc(512*256,p+1),'Four 64KB planar pages');
  await run(pattern);data=await vram();
  for(const [x,y,c] of [[280,64,3],[303,87,3],[0,200,6],[511,200,6],[240,40,5],[270,60,5],[255,50,0],[511,255,7]]) assert.equal(pixel(data,x,y),c,`Normal pixel ${x},${y}`);
  const source=decodedPage(data,0);
  await run(copy);assert.equal(await number('set ::s7_copies'),1);data=decodedPage(await vram(),1);
  for(let y=0;y<256;y++) assert.deepEqual(data.subarray(y*512+128,y*512+400),source.subarray(y*512+240,y*512+512));
  await run(rotate);assert.equal(pixel(await vram(),400,96,1),3,'Rotated high-X source/destination');
  await run(scale);assert.equal(pixel(await vram(),368,120,1),3,'Scaled high-X source/destination');
  await run(stable);
  for(const c of [...normalBad,noFont,noSprite]) await rejected(c);
  await run(upperPage);data=await vram();await run(on);
  assert.deepEqual(await pageSettings(),[2,2,95,95],'FIL keeps native 64KB units');
  await run(keep);assert.equal(await number('debug read {VDP regs} 21')&64,64);
  await run(off);assert.deepEqual(await vram(),data,'Partial mode changes preserve VRAM');
  await run(flat);
  for(const c of fillFlat) await run(c);
  data=await vram();
  for(let p=0;p<2;p++) assert.deepEqual(decodedPage(data,p,true),Buffer.alloc(512*512,p+5),'Two 128KB FIL pages');
  await run(flatPattern);await run(flatLines);data=await vram();
  for(const [x,y,c] of [[240,240,6],[240,250,3],[280,280,6],[255,260,5],[450,440,5],[511,423,7],[511,0,8],[0,511,8],[300,511,9],[511,300,10]]) assert.equal(pixel(data,x,y,0,true),c,`FIL pixel ${x},${y}`);
  await run(fullCopy);assert.equal(await number('set ::s7_copies'),1);
  assert.deepEqual(decodedPage(await vram(),1,true),decodedPage(data,0,true),'Full 512x512 COPY');
  await run(chain);assert.equal(await number('set ::s7_copies'),2);
  const chained=await vram();
  for(let p=0;p<2;p++) assert.deepEqual(decodedPage(chained,p,true),decodedPage(data,0,true),'Chained full-page copies');
  await run(highSource);await run(highRotate);assert.equal(pixel(await vram(),400,288,1,true),3);
  await run(highScale);assert.equal(pixel(await vram(),368,312,1,true),3);
  await run(once);assert.equal(await number('peek 0xc010'),8);await run(oncePoint);assert.equal(await number('peek 0xc010'),3);
  await run(onceCopy);assert.equal(await number('peek 0xc010'),12);
  console.log(`PASS [${machine}]: SCREEN 7, native page parity, 512-wide drawing, 64/128KB planar pages, 9-bit boundaries, synchronous COPY/rotate/scale and single evaluation`);
  await run(lowPage);
  for(const c of [...bad,noFont,noSprite]) await rejected(c);
  await run(oddNative);await rejected(oddDraw);await run(normal);await run(oddNative);await rejected(oddEntry);
  await run(flat);await run(recoverySetup);await run(recovery,1);assert.equal(await number('peek 0xc006'),1);
  await run(next,2);assert.equal(await number('peek 0xc006'),2);
  await run(noHs);assert.equal(await number('debug read {VDP regs} 20'),16);assert.equal(pixel(await vram(),511,511,0,true),11);
  await run(preservedMode);assert.equal(await number('debug read {VDP regs} 21'),66);
  await run(compatVram);await rejected(disabledDraw);
  await run(sat);for(const c of sp3Blocked) await rejected(c);
  for(const [setup,invalid,address,size,top] of [[font,fontBad,0x37600,2048,236]]) {
    await run(setup);await run(normalReservedPage);
    const protectedData=await bytes('physical VRAM',address,size);
    for(const c of invalid) await rejected(c);
    await run(rawFlat);
    for(const c of [...invalid,crossing,copyReserved]) await rejected(c);
    await run(above);await run(clear);
    assert.deepEqual(await bytes('physical VRAM',address,size),protectedData,'Physical font/SAT reservation across planar/FIL mappings');
    data=await vram();assert.equal(pixel(data,2,top-1,1,true),2);assert.equal(pixel(data,2,256,1,true),9);
  }
  assert.equal((await number('peek16 0xfd2f'))&0xfffe,work);assert.equal(await number('peek16 0xfc4a'),0xbfff);
  console.log('PASS: errors/ERR/ERL/RESUME/RESUME NEXT, disabled states, odd native pages, planar font/SAT protection and unchanged BASIC data');
  if(visual) {
    await run(visualBase);await run(visualRects);await run(visualStripes);
    await msx.command('set renderer SDLGL-PP; set deinterlace on; set minframeskip 0; set maxframeskip 0; set speed 100');
    await msx.advance(.3);
    const directory=resolve(root,'build/screenshots');await mkdir(directory,{recursive:true});
    const path=resolve(directory,`screen7-${machine==='V9968_Basic'?'z80':'r800'}.png`);
    await msx.command(`screenshot -raw -size 640 ${tclString(path)}`);
    const png=JSON.parse(execFileSync('pwsh.exe',['-NoProfile','-File',resolve(root,'tests/read-png.ps1'),'-Path',path],{encoding:'utf8',windowsHide:true,maxBuffer:2**22}));
    assert.equal(png.width,640);assert.equal(png.height,480);
    const rgb=Buffer.from(png.rgb,'base64'),red=[],green=[];
    for(let y=0;y<480;y++) for(let x=0;x<640;x++) {
      const i=(y*640+x)*3;
      if(rgb[i]>240 && rgb[i+1]<10 && rgb[i+2]<10) red.push([x,y]);
      if(rgb[i]<10 && rgb[i+1]>240 && rgb[i+2]<10) green.push([x,y]);
    }
    assert.equal(red.length,1024);assert.equal(green.length,1024);
    const left=Math.min(...green.map(p=>p[0]))-100,top=Math.min(...green.map(p=>p[1]))-100;
    assert.equal(Math.min(...red.map(p=>p[0]))-left,400,'High X is not truncated or doubled');
    assert.equal(Math.min(...red.map(p=>p[1]))-top,300,'High Y is continuous');
    const at=(x,y)=>[...rgb.subarray(((top+y)*640+left+x)*3,((top+y)*640+left+x)*3+3)];
    for(let n=0;n<16;n++) {
      const expected=n%2?[0,0,255]:[255,255,255];
      assert.deepEqual(at(200,256+n),expected,'Alternating one-pixel rows');
      assert.deepEqual(at(256+n,200),expected,'Alternating one-pixel columns');
    }
    assert.deepEqual(at(511,423),[255,255,0],'Bottom-right visible pixel');
    console.log('PASS: rendered 512x424, one-pixel horizontal/vertical detail and bottom-right edge');
  }
  await run(finish);
} finally {await msx.stop();}
