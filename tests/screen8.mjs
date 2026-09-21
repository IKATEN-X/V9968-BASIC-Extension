import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdir, readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { OpenMsx, tclString } from '../tools/openmsx.mjs';

const machine=process.argv.includes('V9968_Basic')?'V9968_Basic':'Panasonic_FS-A1ST(V9968)';
const visual=process.argv.includes('--visual');
const yjkOnly=process.argv.includes('--yjk-only');
const root=resolve(import.meta.dirname,'..'),cases=[];
function add(code,error=0) {cases.push({code,error});return cases.length;}
const normal=add('_SCREEN(8):_WAIT VDP'),flat=add('_SCREEN(8,,,,,4):_WAIT VDP');
const nativePage=add('SET PAGE 1,1'),extendedPage=add('_SET PAGE(1,1)'),lowPage=add('_SET PAGE(0,0)'),upperPage=add('_SET PAGE(2,2)');
const on=add('_SCREEN(,,,,,4)'),off=add('_SCREEN(,,,,,0)');
const fill=[17,85,170,255].map((c,p)=>add(`_SET PAGE(0,${p}):_CLS(${c}):_WAIT VDP`));
const flatFill=[128,254].map((c,p)=>add(`_SET PAGE(0,${p}):_CLS(${c}):_WAIT VDP`));
const colors=add('_SET PAGE(0,0):FOR C=0 TO 255:_LINE(C,0)-(C,255),C:NEXT C:_WAIT VDP');
const defaultCls=add('COLOR 201,173,0:_CLS:_WAIT VDP');
const defaultDraw=add('_PSET(0,0):_LINE(255,255)-(240,240):_LINE(20,20)-(40,40):_WAIT VDP');
const pattern=add('_CLS(0):_LINE(255,200)-(0,200),193:_LINE(110,110)-(90,90),137,B:_LINE(32,64)-(55,87),200,BF:_PSET(255,255),255:_WAIT VDP');
const nativePattern=add('COLOR 255,0,0:CLS:LINE(255,200)-(0,200),193:LINE(110,110)-(90,90),137,B:LINE(32,64)-(55,87),200,BF:PSET(255,255),255:_WAIT VDP');
const full=add('_COPY(0,0)-(255,511),0 TO(0,0),1');
const chain=add('_COPY(0,0)-(255,511),1 TO(0,0),0:_COPY(0,0)-(255,511),0 TO(0,0),1');
const flatPattern=add('_SET PAGE(0,0):_CLS(0):_LINE(255,511)-(0,0),193:_LINE(32,240)-(55,270),200,BF:_LINE(110,400)-(90,250),137,B:_PSET(255,423),255:_WAIT VDP');
const stable=add('_SET PAGE(0,0):_PSET(0,0),0:_WAIT VDP');
const bad=[
  ['_PSET(256,0),1',5],['_PSET(-1,0),1',5],['_PSET(0,512),1',5],['_PSET(0,-1),1',5],
  ['_PSET(0,0),256',5],['_PSET(0,0),-1',5],['_CLS(256)',5],['_LINE(0,0)-(2,2),256',5],
  ['_PSET("X",0),1',13],['_PSET(1/0,0),1',11],['_PSET(0,0),"X"',13],['_PSET(0,0),255 XYZ',2],
  ['_SET PAGE(2,0)',5],['_SET PAGE(0,2)',5],
  ['_COPY(0,0)-(255,10),0 TO(1,0),1',5],['_COPY(0,0)-(10,511),0 TO(0,1),1',5],
  ['_COPY(10,0)-(9,10),0 TO(0,0),1',5],['_COPY(0,0)-(10,10),0 TO(0,0),0,,90',5],
  ['_COPY(0,0)-(10,10),0 TO(0,0),1,PSET,TPSET',2]
].map(([code,error])=>add(code,error));
const normalBad=[add('_PSET(255,256),1',5),add('_SET PAGE(4,0)',5),add('_SET PAGE(0,4)',5)];
const noFont=add('_FONT(1)',5),noSprite=add('_SPRITE(3)',5);
const odd=add('SET PAGE 0,1'),oddDraw=add('_PSET(1,300),128',5),oddEntry=add('_SCREEN(,,,,,4)',5);
const once=add('DEFUSR=&HC100:POKE &HC010,0:_PSET(USR(255),USR(511)),USR(255):_WAIT VDP');
const onceCopy=add('POKE &HC010,0:_COPY(USR(0),USR(256))-(USR(31),USR(287)),USR(0) TO(USR(32),USR(256)),USR(1),,USR(90),USR(1)');
const recoverySetup=add('QZ=256'),recovery=add('_PSET(0,0),QZ:POKE &HC006,1:_WAIT VDP',5);
const resumeNext=add('_PSET(0,0),256:POKE &HC006,2',5);
const noEvr=add('VDP(21)=49'),noEcom=add('VDP(21)=81'),disabled=add('_PSET(0,0),255',5);
const noHs=add('VDP(21)=112:_PSET(255,511),254:_WAIT VDP');
const noEpal=add('VDP(21)=97:_PSET(255,511),253:_WAIT VDP');
const fid=add('VDP(21)=113:VDP(22)=65:_PSET(255,511),252:_WAIT VDP');
const font=add('_SCREEN(5):_FONT(1):SCREEN 8:_WAIT VDP');
const sat=add('_SCREEN(5):_SPRITE(3):SCREEN 8:_WAIT VDP');
const reservationPage=add('_SET PAGE(0,2)'),rawFlat=add('VDP(22)=64:_SET PAGE(0,1)');
const fontBad=[236,251].map(y=>add(`_PSET(1,${y}),255`,5));
const satBad=[252,255].map(y=>add(`_PSET(1,${y}),255`,5));
const cross=add('_LINE(1,200)-(1,300),255',5),crossReverse=add('_LINE(1,300)-(1,200),255',5);
const copyReserved=add('_COPY(0,200)-(255,300),0 TO(0,200),1,TPSET',5);
const clear=add('_CLS(199):_WAIT VDP'),above=add('_PSET(1,256),254:_WAIT VDP');
const legacy=add('_SCREEN(5):_SPRITE(3)'),badSpritePalette=add('_PUT SPRITE(0,0,0),16',5),bad16=add('_PSET(0,0),16',5);
const unsupported=[10,11,12].map(mode=>add(`_SCREEN(8):SCREEN ${mode}:_WAIT VDP`));
const unsupportedDraw=add('_PSET(0,0),15',5),unsupportedFil=add('_SCREEN(,,,,,4)',5),unsupportedPage=add('_SET PAGE(0,0)',5);
const slowCopy=add('VDP(21)=112:_COPY(0,0)-(255,511),0 TO(0,0),1,TXOR');
const ops=[['PSET',0],['AND',1],['OR',2],['XOR',3],['PRESET',4],['TPSET',8],['TAND',9],['TOR',10],['TXOR',11],['TPRESET',12]];
const matrix=ops.map(([op])=>add(`_COPY(0,SY)-(255,SY+255),1 TO(0,DY),0,${op}`));
const native=ops.map(([op])=>add(`COPY(0,0)-(255,211),1 TO(0,0),0,${op}`));
const variants=[
  {cos:1,sin:0,inv:1,tail:'0'},
  {cos:0,sin:1,inv:1,tail:'90'},
  {cos:1,sin:0,inv:2,tail:',.5'},
  {cos:0,sin:1,inv:2,tail:'90,.5'}
];
const transforms=variants.map(v=>ops.map(([op])=>add(`_COPY(0,SY)-(15,SY+15),1 TO(64,DY)-(95,DY+31),0,${op},${v.tail}`)));
const settings=[add('SY=0:DY=0'),add('SY=256:DY=256')];
const finish=add('_SCREEN(0)');
const visualBase=add('_SCREEN(8,,,,,4):_SET PAGE(0,0):_CLS(0):_COLOR=(0,0,0,0):_COLOR=(129,31,0,0):_COLOR=(200,0,31,0):_COLOR=(254,0,0,31):_COLOR=(255,31,31,31)');
const visualRects=add('_LINE(32,100)-(47,131),200,BF:_LINE(192,300)-(207,331),129,BF:_LINE(0,0)-(255,423),255,B:_WAIT VDP');
const visualStripes=add('FOR Y=256 TO 270 STEP 2:_LINE(100,Y)-(107,Y),255:_LINE(100,Y+1)-(107,Y+1),254:NEXT Y:_WAIT VDP');

const msx=new OpenMsx({rom:'dist/v9968-basic.rom',machine});
const number=async code=>Number(await msx.command(code));
const bytes=async(device,address,size)=>Buffer.from(await msx.command(`binary encode hex [debug read_block {${device}} ${address} ${size}]`),'hex');
const vram=()=>bytes('physical VRAM',0,262144);
function address(x,y,page=0,fil=false) {
  const row=y+page*(fil?512:256);
  return ((x&1)<<16)|((row&511)<<7)|(x>>1)|((row&512)<<8);
}
const pixel=(data,x,y,page=0,fil=false)=>data[address(x,y,page,fil)];
function decoded(data,page,fil=false) {
  const result=Buffer.alloc(256*(fil?512:256));
  for(let y=0;y<result.length/256;y++) for(let x=0;x<256;x++) result[y*256+x]=pixel(data,x,y,page,fil);
  return result;
}
function logic(op,s,d) {return (op&8) && !s?d:[s,s&d,s|d,s^d,s^255][op&7];}
function equalVram(actual,expected,message) {
  const i=actual.findIndex((value,index)=>value!==expected[index]);
  assert.equal(i,-1,`${message}: first difference at physical ${i.toString(16)}, ${actual[i]} != ${expected[i]}`);
}
async function seed(data) {await msx.command(`debug write_block {physical VRAM} 0 [binary format H* ${data.toString('hex')}]`);}
async function run(n,recover=0) {
  await msx.command(`set ::s8_copies 0; set ::s8_busy 0; poke 0xc001 0; poke 0xc003 0; poke 0xc005 ${recover}; poke 0xc006 0; poke 0xc000 ${n}`);
  for(let i=0;i<600 && !await number('peek 0xc001');i++) await msx.advance(.1);
  if(!await number('peek 0xc001')) {
    const state=await msx.command('list [peek16 0xf41c] [reg PC] [reg SP] [peek 0xc003] [get_active_cpu] [debug read {VDP regs} 20] [debug read {VDP regs} 25]');
    assert.fail(`Timeout: ${cases[n-1].code}; line/PC/SP/ERR/CPU/R20/R25: ${state}`);
  }
  assert.equal(await number('peek 0xc003'),cases[n-1].error,cases[n-1].code);
  if(cases[n-1].error) assert.equal(await number('peek16 0xc008'),1000+(n-1)*100,'ERL');
  assert.equal(await number('peek 0xc00a'),0,'BASIC variables/array/string are intact');
  assert.equal(await number('set ::s8_busy'),0,'COPY completes before returning and restores status selector');
}
let work;
async function snapshot() {
  return {vram:await vram(),regs:await bytes('VDP regs',0,59),work:await bytes('memory',work,32),
    hook:await bytes('memory',0xfee4,5),slot:await bytes('memory',0xfd29,8),pages:await bytes('memory',0xfaf5,2),
    shadow:await bytes('memory',0xffe7,22),legacy:await bytes('memory',0xf3df,15)};
}
async function rejected(n) {const before=await snapshot();await run(n);assert.deepEqual(await snapshot(),before,cases[n-1].code);}
const pageSettings=async()=>[...await bytes('memory',0xfaf5,2),await number('debug read {VDP regs} 2'),await number('peek 0xf3e1')];
try {
  await msx.command('set throttle on; set speed 400');await msx.advance(12);
  assert.equal(await msx.command('get_active_cpu'),machine==='V9968_Basic'?'z80':'r800','Actual test CPU');
  work=(await number('peek16 0xfd2f'))&0xfffe;
  const map=await readFile(resolve(root,'build/v9968-basic.map'),'ascii');
  const restore=/\brestore_text\s*= \$([0-9A-F]+)/i.exec(map)[1];
  await msx.command(`set ::s8_copies 0; set ::s8_busy 0
    debug set_bp 0x${restore} {[pc_in_slot 1] && [peek16 0xfd89] == 0x4f43 && [peek16 0xfd8b] == 0x5950} {
      incr ::s8_copies; set ::s8_busy [expr {$::s8_busy | ([debug read {VDP status regs} 2] & 1) | [debug read {VDP regs} 15]}]
    }
    debug write_block memory 0xc100 [binary format H* 2110c034c9]
    poke 0xc000 0; poke 0xc002 0; poke 0xc00a 0`);
  const program=['1 CLEAR 512,&HBFFF:DEFINT A-Z:ON ERROR GOTO 30000',
    '2 QA=12345:DIM QB(2):QB(0)=-123:QB(2)=456:QC$=STRING$(64,65)',
    '10 _SCREEN(8):POKE &HC002,1','20 IF PEEK(&HC000)=0 THEN 20','30 A=PEEK(&HC000):POKE &HC000,0'];
  for(let i=0;i<cases.length;i+=16) program.push(`${40+i} IF A>${i} AND A<=${i+16} THEN ON A-${i} GOSUB ${cases.slice(i,i+16).map((_,j)=>1000+(i+j)*100).join(',')}`);
  program.push('200 IF QA<>12345 OR QB(0)<>-123 OR QB(2)<>456 OR QC$<>STRING$(64,65) THEN POKE &HC00A,1',
    '210 POKE &HC001,1:GOTO 20','30000 POKE &HC003,ERR:POKE &HC008,ERL MOD 256:POKE &HC009,ERL\\256',
    '30010 IF PEEK(&HC005)=1 THEN QZ=255:RESUME','30020 IF PEEK(&HC005)=2 THEN RESUME NEXT','30030 RESUME 200');
  cases.forEach(({code},i)=>program.push(`${1000+i*100} ${code}`,`${1010+i*100} RETURN`));
  assert.ok(cases.length<=160 && 1000+cases.length*100<30000,'Dispatch lines must stay below 200');
  assert.ok(program.every(line=>line.length<255));
  await msx.type(program.join('\r')+'\rRUN\r');
  for(let i=0;i<150 && !await number('peek 0xc002');i++) await msx.advance(.5);
  assert.equal(await number('peek 0xc002'),1,'Harness startup');
  let data;
  if(!yjkOnly) {
    await run(nativePage);const nativeSettings=await pageSettings();await run(lowPage);await run(extendedPage);
    assert.deepEqual(await pageSettings(),nativeSettings,'Native SCREEN 8 SET PAGE parity');
    for(const c of fill) await run(c);
    data=await vram();
    for(let p=0;p<4;p++) assert.deepEqual(decoded(data,p),Buffer.alloc(65536,[17,85,170,255][p]),'Four 64KB byte-color pages');
    await run(colors);data=decoded(await vram(),0);
    for(let y=0;y<256;y++) for(let x=0;x<256;x++) assert.equal(data[y*256+x],x,'All 256 explicit drawing colors');
    await run(defaultCls);assert.deepEqual(decoded(await vram(),0),Buffer.alloc(65536,173),'Omitted CLS keeps all background-color bits');
    await run(defaultDraw);data=await vram();
    for(const [x,y] of [[0,0],[255,255],[240,240],[20,20],[40,40]]) assert.equal(pixel(data,x,y),201,'Omitted PSET/LINE color');
    await run(pattern);const patternData=await vram();await run(nativePattern);
    assert.deepEqual(decoded(await vram(),0),decoded(patternData,0),'Native PSET/LINE/box/fill parity');
    for(const c of [...normalBad,noFont,noSprite]) await rejected(c);
    await run(upperPage);data=await vram();await run(on);
    assert.deepEqual(await pageSettings(),[2,2,95,95],'FIL retains native 64KB page units');
    await run(off);assert.deepEqual(await vram(),data,'Partial FIL changes preserve pixels');
    await run(flat);for(const c of flatFill) await run(c);
    data=await vram();for(let p=0;p<2;p++) assert.deepEqual(decoded(data,p,true),Buffer.alloc(131072,p?254:128));
    await run(flatPattern);data=await vram();
    for(const [x,y,c] of [[32,240,200],[55,270,200],[90,250,137],[110,400,137],[255,511,193],[255,423,255]]) assert.equal(pixel(data,x,y,0,true),c);
    await run(full);assert.equal(await number('set ::s8_copies'),1);assert.deepEqual(decoded(await vram(),1,true),decoded(data,0,true));
    await run(chain);assert.equal(await number('set ::s8_copies'),2);assert.deepEqual(decoded(await vram(),0,true),decoded(data,0,true));
    await run(once);assert.equal(await number('peek 0xc010'),3);await run(onceCopy);assert.equal(await number('peek 0xc010'),10);
    console.log(`PASS [${machine}]: SCREEN 8 colors 0..255/defaults, native drawing/pages, 64/128KB pages, FIL boundaries, 256x512 chained synchronous COPY and single evaluation`);

    for(const fil of [false,true]) {
      await run(fil?flat:normal);await run(settings[fil?1:0]);const sy=fil?256:0,dy=sy;
      const initial=await vram();
      for(let y=0;y<256;y++) for(let x=0;x<256;x++) {
        initial[address(x,sy+y,1,fil)]=x;initial[address(x,dy+y,0,fil)]=y;
      }
      for(let o=0;o<ops.length;o++) {
        const expected=Buffer.from(initial),[name,code]=ops[o];
        for(let y=0;y<256;y++) for(let x=0;x<256;x++) expected[address(x,dy+y,0,fil)]=logic(code,x,y);
        await seed(initial);const logop=await number('peek 0xfb02');await run(matrix[o]);
        assert.equal(await number('set ::s8_copies'),1);assert.equal(await number('peek 0xfb02'),logop);
        equalVram(await vram(),expected,`${name}, FIL=${fil}, every 256x256 source/destination color pair`);
        if(!fil) {
          // Native COPY clips at the 212-row viewport; extension pages have 256 rows.
          const nativeExpected=Buffer.from(initial);
          for(let y=0;y<212;y++) for(let x=0;x<256;x++) nativeExpected[address(x,y)]=expected[address(x,y)];
          await seed(initial);await run(native[o]);equalVram(await vram(),nativeExpected,`Native ${name}`);
        }
      }
      for(let vi=0;vi<variants.length;vi++) for(let o=0;o<ops.length;o++) {
        const v=variants[vi],fixture=Buffer.from(initial),expected=Buffer.from(initial),code=ops[o][1];
        for(let y=0;y<16;y++) for(let x=0;x<16;x++) {
          const value=x?128+x+y*7:0;
          fixture[address(x,sy+y,1,fil)]=value;expected[address(x,sy+y,1,fil)]=value;
        }
        for(let y=0;y<32;y++) for(let x=0;x<32;x++) {
          const sx=8+v.inv*(v.cos*(x-16)+v.sin*(y-16)),oy=8+v.inv*(-v.sin*(x-16)+v.cos*(y-16));
          const s=sx>=0 && sx<16 && oy>=0 && oy<16?fixture[address(sx,sy+oy,1,fil)]:0;
          const a=address(64+x,dy+y,0,fil);expected[a]=logic(code,s,fixture[a]);
        }
        await seed(fixture);await run(transforms[vi][o]);assert.equal(await number('set ::s8_copies'),1);
        equalVram(await vram(),expected,`8-bit transforms/window skip: FIL=${fil}, ${v.tail}, ${ops[o][0]}`);
      }
      console.log(`PASS [${machine}]: FIL=${fil}, all 10 logical operators x 65536 color pairs, native parity, rotation/scale/transparent window misses, source and unrelated VRAM preserved`);
    }
    await run(stable);for(const c of [...bad,noFont,noSprite]) await rejected(c);
    await run(odd);await rejected(oddDraw);await run(normal);await run(odd);await rejected(oddEntry);
    await run(flat);await run(recoverySetup);await run(recovery,1);assert.equal(await number('peek 0xc006'),1);
    await run(resumeNext,2);assert.equal(await number('peek 0xc006'),2);
    await run(noHs);assert.equal(pixel(await vram(),255,511,0,true),254);
    const slowBefore=await vram(),slowExpected=Buffer.from(slowBefore);
    for(let y=0;y<512;y++) for(let x=0;x<256;x++) {
      const src=address(x,y,0,true),dst=address(x,y,1,true);
      slowExpected[dst]=logic(11,slowBefore[src],slowBefore[dst]);
    }
    await run(slowCopy);assert.equal(await number('set ::s8_copies'),1);equalVram(await vram(),slowExpected,'128KB synchronous logical COPY without HS');
    await run(noEpal);assert.equal(pixel(await vram(),255,511,0,true),253);
    await run(fid);assert.equal(await number('debug read {VDP regs} 21'),65);
    for(const c of [noEvr,noEcom]) {await run(c);await rejected(disabled);}
    for(const [setup,invalid,base,size,top] of [[font,fontBad,0x37600,2048,236],[sat,satBad,0x37e00,512,252]]) {
      await run(setup);await run(reservationPage);const protectedData=await bytes('physical VRAM',base,size);
      for(const c of invalid) await rejected(c);
      await run(clear);assert.deepEqual(await bytes('physical VRAM',base,size),protectedData);
      await run(rawFlat);for(const c of [...invalid,cross,crossReverse,copyReserved]) await rejected(c);
      await run(above);await run(clear);data=await vram();
      assert.deepEqual(await bytes('physical VRAM',base,size),protectedData,'Physical reservation survives native SCREEN 8 and raw FIL');
      assert.equal(pixel(data,1,top-1,1,true),199);assert.equal(pixel(data,1,256,1,true),254);
    }
    await run(legacy);await rejected(badSpritePalette);await rejected(bad16);
  }
  for(const mode of unsupported) {
    await run(mode);assert.equal(await number('peek 0xfcaf'),8,'Native YJK shares SCRMOD=8');
    assert.equal(await number('debug read {VDP regs} 20')&8,0,'No SP3 state to mask a missing YJK guard');
    assert.equal(await number('debug read {VDP regs} 25')&8,8,'Native YJK is active');
    await rejected(unsupportedDraw);await rejected(unsupportedFil);await rejected(unsupportedPage);
  }
  assert.equal((await number('peek16 0xfd2f'))&0xfffe,work);assert.equal(await number('peek16 0xfc4a'),0xbfff);
  console.log(yjkOnly?'PASS: isolated SCREEN 10..12 drawing/page/FIL rejection, unchanged VRAM/registers/BASIC data, no SP3 state masking the YJK guard':'PASS: ERR/ERL/RESUME/RESUME NEXT, unchanged state/BASIC data, ECOM/EVR required, HS/EPAL optional, FID restoration, odd pages, font/SAT reservations, unchanged legacy color limits and SCREEN 10..12 rejection');
  if(visual) {
    await run(visualBase);await run(visualRects);await run(visualStripes);
    data=await vram();
    for(let n=0;n<16;n++) assert.equal(pixel(data,100,256+n,0,true),n%2?254:255,'Alternating rows in VRAM');
    for(let y=0;y<424;y++) {
      assert.equal(pixel(data,0,y,0,true),255,'Left frame edge in VRAM');
      assert.equal(pixel(data,255,y,0,true),255,'Right frame edge in VRAM');
    }
    for(let x=0;x<256;x++) {
      assert.equal(pixel(data,x,0,0,true),255,'Top frame edge in VRAM');
      assert.equal(pixel(data,x,423,0,true),255,'Bottom frame edge in VRAM');
    }
    await msx.command('set renderer SDLGL-PP; set deinterlace on; set minframeskip 0; set maxframeskip 0; set speed 100');await msx.advance(.3);
    await mkdir(resolve(root,'build/screenshots'),{recursive:true});
    const path=resolve(root,`build/screenshots/screen8-${machine==='V9968_Basic'?'z80':'r800'}.png`);
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
    const left=Math.min(...green.map(p=>p[0]))-64,top=Math.min(...green.map(p=>p[1]))-100;
    const at=(x,y)=>[...rgb.subarray(((top+y)*640+left+x*2)*3,((top+y)*640+left+x*2)*3+3)];
    assert.equal(Math.min(...red.map(p=>p[0]))-left,384);assert.equal(Math.min(...red.map(p=>p[1]))-top,300);
    for(let n=0;n<16;n++) assert.deepEqual(at(100,256+n),n%2?[0,0,255]:[255,255,255]);
    assert.deepEqual(at(254,423),[255,255,255]);
    // The pinned renderer clips the final column, despite correct VRAM pixels.
    assert.deepEqual(at(255,423),[0,0,0],'Known SCREEN 8 FIL right-column display clipping');
    console.log('PASS: FIL colors above 127, continuous Y=256+, alternating rows and all frame edges in VRAM; known last-column renderer clipping reproduced');
  }
  await run(finish);
} finally {await msx.stop();}
