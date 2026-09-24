import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdir, readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { OpenMsx, tclString } from '../tools/openmsx.mjs';

const machine=process.argv.includes('V9968_Basic')?'V9968_Basic':'Panasonic_FS-A1ST(V9968)';
const visual=process.argv.includes('--visual');
const root=resolve(import.meta.dirname,'..'),cases=[];
function add(code,error=0) { cases.push({code,error});return cases.length; }
const flat=add('_SCREEN(5,,,,,4):_WAIT VDP');
const normal=add('_SCREEN(5):_WAIT VDP');
const modes=[0,1,2,3,4].map(n=>add(`_SCREEN(,,,,,${n})`));
const pattern=add('_SET PAGE(0,0):_CLS(0):_LINE(10,240)-(30,270),3,BF:_LINE(45,400)-(35,250),5,B:_PSET(90,511),7:_WAIT VDP');
const diagonal=add('_LINE(80,511)-(80,0),6:_LINE(100,300)-(140,260),8:_LINE(150,260)-(190,300),9:_WAIT VDP');
const fullPages=[0,1,2,3].map(p=>add(`_SET PAGE(0,${p}):_CLS(${p+1}):_WAIT VDP`));
const copy=add('_SET PAGE(0,1):_CLS(0):_COPY(0,224)-(127,511),0 TO(0,224),1');
const rotated=add('_SET PAGE(0,1):_CLS(0):_COPY(0,224)-(127,351),0 TO(0,256),1,,90,1');
const scaled=add('_SET PAGE(0,1):_CLS(0):_COPY(0,224)-(127,351),0 TO(0,256)-(127,383),1,,,.5');
const chained=add('_COPY(0,0)-(255,511),0 TO(0,0),2:_COPY(0,0)-(255,511),2 TO(0,0),3');
const low=add('_SET PAGE(0,0)');
const even=add('_SET PAGE(2,2)');
const odd=add('_SET PAGE(1,1)');
const flags=add('VDP(22)=2:_SCREEN(,,,,,,3,1)');
const keep=add('_SCREEN(,,0):_SCREEN(,,,,,,1):_SCREEN(,,,,,,,0)');
const full8=add('_SCREEN(8,,,,,4)');
const draw8=add('_PSET(0,256),129:_WAIT VDP');
const noSprite=add('_SPRITE(3)',5),noFont=add('_FONT(1)',5);
const withFont=add('_SCREEN(5):_FONT(1):_WAIT VDP');
const withSprite=add('_SCREEN(5):_SPRITE(3):_WAIT VDP');
const rejectOn=add('_SCREEN(,,,,,4)',5);
const disabled=add('VDP(22)=VDP(22) OR 1');
const text=add('_SCREEN(0)');
const nativeOdd=add('SET PAGE 0,1');
const oddDraw=add('_PSET(0,300),1',5);
const rawFlat=add('VDP(22)=64:_SET PAGE(0,3)');
const reservedFont=[236,251].map(y=>add(`_PSET(0,${y}),1`,5));
const crossesFont=add('_LINE(0,200)-(0,300),1',5);
const overFont=add('_PSET(0,256),9:_WAIT VDP');
const reservedSat=[252,255].map(y=>add(`_PSET(0,${y}),1`,5));
const crossesSat=add('_COPY(0,200)-(31,300),0 TO(0,200),3',5);
const protectedClear=add('_CLS(2):_WAIT VDP');
const once=add('POKE &HC010,0:DEFUSR=&HC100:_SCREEN(USR(5),USR(2),USR(0),USR(2),USR(1),USR(4),USR(3),USR(1))');
const bad=[
  ['_SCREEN(5,,,,,5)',5],['_SCREEN(5,,,,,-1)',5],['_SCREEN(5,,,,,256)',5],
  ['_SCREEN(0,,,,,4)',5],['_SCREEN(5,,,,,"X")',13],['_SCREEN(5,,,,,1/0)',11],
  ['_SCREEN(5,,,,,4,4)',5],['_SCREEN(5,,,,,4,0,2)',5],['_SCREEN(5,,,,,4) XYZ',2],
  ['_PSET(0,512),1',5],['_PSET(0,-1),1',5],['_LINE(0,0)-(256,423),1',5],
  ['_SET PAGE(4,0)',5],['_SET PAGE(0,4)',5],
  ['_COPY(0,0)-(10,511),0 TO(0,1),1',5],['_COPY(0,256)-(10,255),0 TO(0,0),1',5],
  ['_COPY(0,0)-(10,10),0 TO(0,300)-(10,256),1',5],['_COPY(0,0)-(10,10),0 TO(0,0),0,,90',5],
  ['_COPY(0,0)-(10,10),4 TO(0,0),1',5]
].map(([code,error])=>add(code,error));
const highNormal=add('_PSET(0,256),1',5);
const recoverySetup=add('S%=5'),recovery=add('_SCREEN(,,,,,S%):POKE &HC006,1',5);
const nextError=add('_SCREEN(,,,,,5):POKE &HC006,2',5);
const copyRecoverySetup=add('S%=1');
const copyRecovery=add('_COPY(0,0)-(10,511),0 TO(0,S%),1:POKE &HC006,3',5);
const copyNext=add('_COPY(0,0)-(10,511),0 TO(0,1),1:POKE &HC006,4',5);
const copyRangeNext=add('_COPY(0,256)-(10,255),0 TO(0,0)-(10,10),1:POKE &HC006,5',5);
const image=add('_SCREEN(5,,,,,4):_COLOR=(0,0,0,0):_COLOR=(2,31,0,0):_COLOR=(3,0,31,0):_SET PAGE(0,0):_CLS(0):_LINE(32,300)-(63,331),2,BF:_LINE(96,100)-(127,131),3,BF:_WAIT VDP');
const imageStripes=add('_COLOR=(13,0,0,31):_COLOR=(15,31,31,31):FOR Y=128 TO 158 STEP 2:_LINE(160,Y)-(191,Y),15:_LINE(160,Y+1)-(191,Y+1),13:NEXT Y:_WAIT VDP');
const pageImage=add('_SET PAGE(0,1):_CLS(0):_COPY(0,0)-(255,511),0 TO(0,0),1:_SET PAGE(1,1)');
const msx=new OpenMsx({rom:'dist/v9968-basic.rom',machine});
const number=async command=>Number(await msx.command(command));
const bytes=async (device,address,size)=>Buffer.from(await msx.command(`binary encode hex [debug read_block {${device}} ${address} ${size}]`),'hex');
const vram=(address=0,size=262144)=>bytes('physical VRAM',address,size);
async function pixel(x,y,page=0) { const b=await number(`debug read {physical VRAM} ${page*65536+y*128+(x>>1)}`);return x&1?b&15:b>>4; }
async function run(n,recover=0) {
  await msx.command(`set ::fil_copies 0; set ::fil_busy 0; poke 0xc001 0; poke 0xc003 0; poke 0xc005 ${recover}; poke 0xc006 0; poke 0xc000 ${n}`);
  for(let i=0;i<120 && !await number('peek 0xc001');i++) await msx.advance(.1);
  assert.equal(await number('peek 0xc001'),1,`Timeout: ${cases[n-1].code}`);
  assert.equal(await number('peek 0xc003'),cases[n-1].error,cases[n-1].code);
  assert.equal(await number('peek 0xc00a'),0,'BASIC variables, arrays and strings survive');
  if(cases[n-1].error) assert.equal(await number('peek16 0xc008'),1000+(n-1)*100,'ERL');
  assert.equal(await number('set ::fil_busy'),0,'COPY busy/status selector at return');
}
async function snapshot() {
  const memory=[...await bytes('memory',0xfaf5,2),...await bytes('memory',0xffe7,22),...await bytes('memory',0xf3df,15),...await bytes('memory',0xfc4a,2)];
  return {vram:await vram(),regs:await bytes('VDP regs',0,59),memory,hook:await bytes('memory',0xfee4,5)};
}
async function rejected(n) { const before=await snapshot();await run(n);assert.deepEqual(await snapshot(),before,`Rejected without mutation: ${cases[n-1].code}`); }
try {
  await msx.ready;await msx.command('set throttle on; set speed 1000');await msx.advance(12);
  const work=(await number('peek16 0xfd2f'))&0xfffe,himem=await number('peek16 0xfc4a');
  const map=await readFile(resolve(root,'build/v9968-basic.map'),'ascii');
  const restore=/\brestore_text\s*= \$([0-9A-F]+)/i.exec(map)[1];
  await msx.command(`set ::fil_copies 0; set ::fil_busy 0
    debug set_bp 0x${restore} {[pc_in_slot 1] && [peek16 0xfd89] == 0x4f43 && [peek16 0xfd8b] == 0x5950} {
      incr ::fil_copies; set ::fil_busy [expr {$::fil_busy | ([debug read {VDP status regs} 2] & 1) | [debug read {VDP regs} 15]}]
    }
    debug write_block memory 0xc100 [binary format H* 2110c034c9]
    poke 0xc000 0; poke 0xc002 0; poke 0xc00a 0`);
  const program=['1 CLEAR 512,&HBFFF:DEFINT A-Z:ON ERROR GOTO 30000',
    '2 QA=12345:DIM QB(2):QB(0)=-123:QB(2)=456:QC$=STRING$(64,65)',
    '10 _SCREEN(5):POKE &HC002,1','20 IF PEEK(&HC000)=0 THEN 20','30 A=PEEK(&HC000):POKE &HC000,0'];
  for(let i=0;i<cases.length;i+=16) program.push(`${40+i} IF A>${i} AND A<=${i+16} THEN ON A-${i} GOSUB ${cases.slice(i,i+16).map((_,j)=>1000+(i+j)*100).join(',')}`);
  program.push('200 IF QA<>12345 OR QB(0)<>-123 OR QB(2)<>456 OR QC$<>STRING$(64,65) THEN POKE &HC00A,1',
    '210 POKE &HC001,1:GOTO 20',
    '30000 POKE &HC003,ERR:POKE &HC008,ERL MOD 256:POKE &HC009,ERL\\256',
    '30010 IF PEEK(&HC005)=1 THEN S%=4:RESUME','30015 IF PEEK(&HC005)=3 THEN S%=0:RESUME',
    '30020 IF PEEK(&HC005)=2 THEN RESUME NEXT','30030 RESUME 200');
  cases.forEach(({code},i)=>program.push(`${1000+i*100} ${code}`,`${1010+i*100} RETURN`));
  assert.ok(program.every(line=>line.length<255));
  await msx.type(program.join('\r')+'\rRUN\r');
  for(let i=0;i<100 && !await number('peek 0xc002');i++) await msx.advance(.5);
  assert.equal(await number('peek 0xc002'),1,'Harness startup');
  await run(once);assert.equal(await number('peek 0xc010'),8,'Each SCREEN expression runs once');
  assert.equal(await number('debug read {VDP regs} 9')&12,0,'FIL delegates I=0 to native SCREEN');
  assert.equal(await number('debug read {VDP regs} 21')&64,64);
  await run(normal);await run(even);await run(flags);
  const data=await vram();
  for(const mode of [4,0,4,1,4,2,4,3,4]) {
    await run(modes[mode]);
    assert.equal(await number('debug read {VDP regs} 21'),mode===4?66:2,'FIL preserves unrelated R21 bits and clears on legacy I values');
    assert.equal(await number('peek 0xfff4'),mode===4?66:2,'FIL BASIC shadow');
    assert.equal(await number('debug read {VDP regs} 9')&12,mode===4?0:((mode&1)<<3)|((mode&2)<<1));
    assert.deepEqual(await bytes('memory',0xfaf5,2),Buffer.from([2,2]),'Native page units stay unchanged');
    assert.deepEqual(await vram(),data,'Interlace-only updates do not rewrite VRAM');
  }
  await run(keep);assert.equal(await number('debug read {VDP regs} 21'),66,'Omitted I preserves FIL');
  await run(flat);
  for(const c of fullPages) await run(c);
  for(let p=0;p<4;p++) assert.deepEqual(await vram(p*65536,65536),Buffer.alloc(65536,(p+1)*17),'CLS fills one full 64KB page');
  await run(pattern);await run(diagonal);
  for(const [x,y,c] of [[10,240,3],[30,270,3],[9,256,0],[35,250,5],[45,400,5],[40,300,0],[90,511,7],[80,0,6],[80,511,6],[120,280,8],[170,280,9]]) assert.equal(await pixel(x,y),c,`9-bit drawing (${x},${y})`);
  const source=await vram(0,65536);
  await run(copy);assert.equal(await number('set ::fil_copies'),1);
  const copied=await vram(65536,65536);
  for(let y=224;y<512;y++) assert.deepEqual(copied.subarray(y*128,y*128+64),source.subarray(y*128,y*128+64),'COPY crosses 255/256');
  await run(rotated);assert.equal(await pixel(96,266,1),3,'Clockwise rotated high-Y source');
  await run(scaled);assert.equal(await pixel(37,296,1),3,'Scaled high-Y source');
  await run(chained);assert.equal(await number('set ::fil_copies'),2);
  for(const p of [2,3]) assert.deepEqual(await vram(p*65536,65536),source,'Full 512-row/chained COPY completes synchronously');
  console.log(`PASS [${machine}]: SCREEN I=4/legacy modes, expression count, partial preservation, 9-bit drawing, 64KB pages and synchronous transforms`);
  await run(low);
  for(const c of [...bad,noSprite,noFont]) await rejected(c);
  await run(nativeOdd);await rejected(oddDraw);await run(low);
  await run(normal);await rejected(highNormal);await run(odd);await rejected(rejectOn);
  await run(normal);await run(disabled);await rejected(rejectOn);
  await run(text);await rejected(rejectOn);
  await run(withFont);await rejected(rejectOn);
  await run(rawFlat);const font=await vram(0x37600,2048);
  for(const c of [...reservedFont,crossesFont]) await rejected(c);
  await run(overFont);await run(protectedClear);assert.deepEqual(await vram(0x37600,2048),font);
  assert.equal(await pixel(0,235,3),2);assert.equal(await pixel(0,256,3),9,'Protected CLS stops before the first reservation');
  await run(withSprite);await rejected(rejectOn);
  await run(rawFlat);const sat=await vram(0x37e00,512);
  for(const c of [...reservedSat,crossesSat]) await rejected(c);
  await run(overFont);await run(protectedClear);assert.deepEqual(await vram(0x37e00,512),sat);
  await run(flat);await run(recoverySetup);await run(recovery,1);assert.equal(await number('peek 0xc006'),1);
  await run(nextError,2);assert.equal(await number('peek 0xc006'),2);
  await run(copyRecoverySetup);await run(copyRecovery,3);assert.equal(await number('peek 0xc006'),3);
  await run(copyNext,2);assert.equal(await number('peek 0xc006'),4);
  await run(copyRangeNext,2);assert.equal(await number('peek 0xc006'),5);
  await run(full8);assert.equal(await number('debug read {VDP regs} 21')&64,64);await run(draw8);
  assert.equal(await number('debug read {physical VRAM} 32768'),129,'SCREEN 8 FIL drawing keeps high Y and all eight color bits');
  await run(normal);assert.equal(await number('debug read {VDP regs} 21'),0,'Explicit SCREEN defaults FIL off');
  assert.equal((await number('peek16 0xfd2f'))&0xfffe,work);assert.equal(await number('peek16 0xfc4a'),0xbfff);
  assert.ok(himem>0xbfff,'Harness has its own explicit BASIC reservation');
  console.log('PASS: errors/ERR/ERL/RESUME, unavailable combinations, native-page alignment, protected font/SAT and BASIC data');
  if(visual) {
    await msx.command('set renderer SDLGL-PP; set deinterlace on; set minframeskip 0; set maxframeskip 0; set speed 100');
    await run(image);
    await run(imageStripes);
    for(const [name,setup] of [['page0',null],['page1',pageImage]]) {
      if(setup) await run(setup);
      await msx.advance(.3);
      const directory=resolve(root,'build/screenshots');await mkdir(directory,{recursive:true});
      const path=resolve(directory,`interlace-${machine==='V9968_Basic'?'z80':'r800'}-${name}.png`);
      await msx.command(`screenshot -raw -size 640 ${tclString(path)}`);
      const png=JSON.parse(execFileSync('pwsh.exe',['-NoProfile','-File',resolve(root,'tests/read-png.ps1'),'-Path',path],{encoding:'utf8',windowsHide:true,maxBuffer:2**22}));
      assert.equal(png.height,480,'Capture both interlaced fields at full height');
      const rgb=Buffer.from(png.rgb,'base64'),ys=[[],[]],stripes=[new Set(),new Set()];
      for(let y=0;y<png.height;y++) for(let x=0;x<png.width;x++) {
        const i=(y*png.width+x)*3;
        if(rgb[i]>240 && rgb[i+1]<10 && rgb[i+2]<10) ys[0].push(y);
        if(rgb[i]<10 && rgb[i+1]>240 && rgb[i+2]<10) ys[1].push(y);
        if(rgb[i]>240 && rgb[i+1]>240 && rgb[i+2]>240) stripes[0].add(y);
        if(rgb[i]<10 && rgb[i+1]<10 && rgb[i+2]>240) stripes[1].add(y);
      }
      assert.ok(ys.every(a=>a.length>200),'Both high/low Y objects render');
      const delta=Math.min(...ys[0])-Math.min(...ys[1]);
      assert.ok(Math.abs(delta-200*png.height/480)<=2,`Continuous vertical coordinates, delta=${delta}, height=${png.height}`);
      assert.deepEqual(stripes.map(s=>s.size),[16,16],'Even and odd source rows both render');
      const white=[...stripes[0]],blue=[...stripes[1]];
      for(let i=0;i<16;i++) {
        assert.equal(white[i],white[0]+2*i,'Even lines are not doubled');
        assert.equal(blue[i],white[i]+1,'Odd lines appear between even lines');
      }
    }
    console.log('PASS: rendered 424-line coordinates, alternating single-pixel rows and page switching');
  }
  await run(text);
} finally {await msx.stop();}
