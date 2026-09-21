import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { OpenMsx } from '../tools/openmsx.mjs';

const machine=process.argv.includes('V9968_Basic')?'V9968_Basic':'Panasonic_FS-A1ST(V9968)';
const errorsOnly=process.argv.includes('--errors-only');
const msx=new OpenMsx({rom:'dist/v9968-basic.rom',machine});
const ops=[['PSET',0],['AND',1],['OR',2],['XOR',3],['PRESET',4],
  ['TPSET',8],['TAND',9],['TOR',10],['TXOR',11],['TPRESET',12]];
const cases=[];
function add(code,error=0) {cases.push({code,error});return cases.length;}
const init=add('_SCREEN(M,,,,,I):_SET PAGE(0,1):_CLS(0):FOR C=0 TO 15:_LINE(SX+C,SY)-(SX+C,SY+15),C:NEXT C:_SET PAGE(0,0):_CLS(0):_WAIT VDP');
const reset=add('FOR C=0 TO 31:_LINE(DX,DY+C)-(DX+31,DY+C),C AND 15,BF:NEXT C:_WAIT VDP');
const source='(SX,SY)-(SX+15,SY+15),1 TO(DX,DY)';
const variants=[
  {name:'plain',size:16,cos:1,sin:0,inv:1,tail:op=>`,0,${op}`},
  {name:'window',size:32,cos:1,sin:0,inv:1,tail:op=>`-(DX+31,DY+31),0,${op},0`},
  {name:'rotate',size:32,cos:0,sin:1,inv:1,tail:op=>`-(DX+31,DY+31),0,${op},90`},
  {name:'scale',size:32,cos:1,sin:0,inv:2,tail:op=>`-(DX+31,DY+31),0,${op},,.5`},
  {name:'combined',size:32,cos:0,sin:1,inv:2,tail:op=>`-(DX+31,DY+31),0,${op},90,.5`}
];
const matrices=variants.map(v=>ops.map(([op])=>add(`_COPY${source}${v.tail(op)}`)));
const native=ops.map(([op])=>add(`COPY(SX,SY)-(SX+15,SY+15),1 TO(DX,DY),0,${op}`));
const omitted=add(`_COPY${source},0`);
const spaced=add(`_COPY${source},0,T AND`);
const twice=add(`_COPY${source},0,XOR:_COPY${source},0,XOR`);
const stable=add('_PSET(0,0),0:_WAIT VDP');
const once=add('POKE &HC010,0:DEFUSR=&HC100:_COPY(USR(SX),USR(SY))-(USR(SX+15),USR(SY+15)),USR(1) TO(USR(DX),USR(DY))-(USR(DX+31),USR(DY+31)),USR(0),TOR,USR(90),USR(1)');
const bad=[
  ['PSET,TPSET',2],['TPSET,PSET',2],['PSET,PSET',2],['TAND,90,XOR',2],
  [',,,',2],['TPSET,0,1,',2],['TPSET,0,1,2',2],['TPSETX',2],['TAN',2],['TO',2],['T',2],
  ['IMP',2],['NOT',2],['8',2],['"TPSET"',2],['TPSET,1/0',11],
  ['TOR,,"X"',13],[',,"X"',13],['TXOR,"X"',13],
  ['TAND,,0',11],['TPSET,,.1',5],['TPSET,,-1',5],['TPSET,,5',5],
  ['PSET,1E30*1E30*1E30',6],['PSET,(90',2],['PSET,,(1',2],['PSET,,1 XYZ',2],
  ['ROTATE(30),SCALE(.75)',2],['SCALE(.75)',2]
].map(([option,error])=>add(`_COPY${source},0,${option}`,error));
const syntaxInit=add('AN=90:K#=.75:DIM AX(1),KY#(1):AX(1)=90:KY#(1)=.5');
const positional=[];
for(let mask=0;mask<8;mask++) positional.push({
  tail:','+[(mask&1)?'XOR':'',(mask&2)?'90':'',(mask&4)?'.5':''].join(','),
  op:(mask&1)?3:0,cos:(mask&2)?0:1,sin:(mask&2)?1:0,inv:(mask&4)?2:1
});
for(const tail of ['',',',',,',',PSET',',PSET,',',,0',',,0,',',,,1'])
  positional.push({tail,op:0,cos:1,sin:0,inv:1});
positional.push(
  {tail:',,,.75',op:0,cos:1,sin:0,inv:341/256},
  {tail:',PSET,AN,K#',op:0,cos:0,sin:1,inv:341/256},
  {tail:',TOR,AX(1),KY#(1)',op:10,cos:0,sin:1,inv:2},
  {tail:', T AND , (30+60) , (1/2) ',op:9,cos:0,sin:1,inv:2},
  {tail:',TPSET,VAL(MID$("090",2,2)),VAL(".5")',op:8,cos:0,sin:1,inv:2},
  {tail:',,-90',op:0,cos:0,sin:-1,inv:1},
  {tail:',,360',op:0,cos:1,sin:0,inv:1},
  {tail:',,,.25',op:0,cos:1,sin:0,inv:4},
  {tail:',,,4',op:0,cos:1,sin:0,inv:.25}
);
for(const [i,c] of positional.entries()) {
  c.marker=i%2?3:0;
  c.id=add(`_COPY${source}-(DX+31,DY+31),0${c.tail}${c.marker?':POKE &HC006,3':''}`);
}
const nestedOnce=add(`POKE &HC010,0:_COPY${source}-(DX+31,DY+31),0,,USR(30)+USR(60),USR(1)/USR(2)`);
const recoverySetup=add('QZ=0');
const resume=add(`_COPY${source},0,TPSET,360/QZ`,11);
const resumeNext=add(`_COPY${source},0,TPSET,TPSET:POKE &HC006,1`,2);
const disable=add('VDP(21)=80');
const disabledCopy=add(`_COPY${source},0,TPSET`,5);
const enable=add('VDP(21)=113');
const noHs=add('VDP(21)=112');
const font=add('_SCREEN(5):_FONT(1)');
const fontReject=add('_COPY(0,0)-(15,15),1 TO(0,236),6,TPSET',5);
const sat=add('_SCREEN(5):_SPRITE(3)');
const satReject=add('_COPY(0,0)-(15,3),1 TO(0,252),6,TXOR',5);
const full=add('_SCREEN(7,,,,,4):_SET PAGE(0,0):_CLS(5):_SET PAGE(0,1):_CLS(3):_COPY(0,0)-(511,511),1 TO(0,0),0,XOR:_COPY(0,0)-(511,511),0 TO(0,0),1,TOR');
const finish=add('_SCREEN(0)');
const number=async code=>Number(await msx.command(code));
const bytes=async (device,start,size)=>Buffer.from(await msx.command(`binary encode hex [debug read_block {${device}} ${start} ${size}]`),'hex');
const vram=()=>bytes('physical VRAM',0,262144);
function address(mode,fil,page,x,y) {
  const row=y+page*(fil?512:256);
  return mode===5?row*128+(x>>1):((x&2)<<15)|((row&511)<<7)|(x>>2)|((row&512)<<8);
}
function pixel(data,mode,fil,page,x,y) {return (data[address(mode,fil,page,x,y)]>>((x&1)?0:4))&15;}
function put(data,mode,fil,x,y,color) {
  const a=address(mode,fil,0,x,y),shift=(x&1)?0:4;
  data[a]=(data[a]&~(15<<shift))|(color<<shift);
}
function logic(op,s,d) {
  if((op&8) && !s) return d;
  return [s,s&d,s|d,s^d,(~s)&15][op&7];
}
async function run(n,recover=0) {
  if(process.argv.includes('--trace')) console.log(`CASE ${n}: ${cases[n-1].code}`);
  await msx.command(`set ::logic_returns 0; set ::logic_busy 0; poke 0xc001 0; poke 0xc003 0; poke 0xc005 ${recover}; poke 0xc006 0; poke 0xc000 ${n}`);
  for(let i=0;i<150 && !await number('peek 0xc001');i++) await msx.advance(.1);
  assert.equal(await number('peek 0xc001'),1,`Timeout: ${cases[n-1].code}`);
  assert.equal(await number('peek 0xc003'),cases[n-1].error,cases[n-1].code);
  if(cases[n-1].error) assert.equal(await number('peek16 0xc008'),1000+(n-1)*10,'ERL');
  assert.equal(await number('peek 0xc00a'),0,'BASIC variables, array and string survive');
  assert.equal(await number('set ::logic_busy'),0,'COPY is complete and R15 restored at return');
}
let work;
async function state() {
  return {vram:await vram(),regs:await bytes('VDP regs',0,59),work:await bytes('memory',work,32),
    hook:await bytes('memory',0xfee4,5),slot:await bytes('memory',0xfd29,8),pages:await bytes('memory',0xfaf5,2),
    shadow:await bytes('memory',0xffe7,22),legacy:await bytes('memory',0xf3df,15),logop:await number('peek 0xfb02')};
}
async function rejected(n,recover=0) {const before=await state();await run(n,recover);assert.deepEqual(await state(),before,cases[n-1].code);}
try {
  await msx.command(`set throttle on; set speed ${process.argv.includes('--realtime')?100:400}`);await msx.advance(12);
  work=(await number('peek16 0xfd2f'))&0xfffe;
  const map=await readFile('build/v9968-basic.map','ascii');
  const restore=/\brestore_text\s*= \$([0-9A-F]+)/i.exec(map)[1];
  await msx.command(`set ::logic_returns 0; set ::logic_busy 0
    debug set_bp 0x${restore} {[pc_in_slot 1] && [peek16 0xfd89] == 0x4f43 && [peek16 0xfd8b] == 0x5950} {
      incr ::logic_returns; set ::logic_busy [expr {$::logic_busy | ([debug read {VDP status regs} 2] & 1) | [debug read {VDP regs} 15]}]
    }
    poke 0xc000 0; poke 0xc002 0; poke 0xc00a 0
    debug write_block memory 0xc100 [binary format H* 2110c034c9]`);
  const modes=[[5,0],[7,0],[5,4],[7,4]];
  const settings=modes.map(([m,i])=>add(`M=${m}:I=${i}:SX=${m===7?300:32}:SY=${i?300:32}:DX=${m===7?320:96}:DY=${i?288:64}`));
  assert.ok(cases.length<256);
  const program=['1 CLEAR 512,&HBFFF:DEFINT A-Z:ON ERROR GOTO 30000',
    '2 QA=12345:DIM QB(2):QB(0)=-123:QB(2)=456:QC$=STRING$(64,65):POKE &HC002,1',
    '20 IF PEEK(&HC000)=0 THEN 20','30 N=PEEK(&HC000):POKE &HC000,0'];
  for(let i=0;i<cases.length;i+=16) program.push(`${40+i} IF N>${i} AND N<=${i+16} THEN ON N-${i} GOSUB ${cases.slice(i,i+16).map((_,j)=>1000+(i+j)*10).join(',')}`);
  program.push('200 IF QA<>12345 OR QB(0)<>-123 OR QB(2)<>456 OR QC$<>STRING$(64,65) THEN POKE &HC00A,1',
    '210 POKE &HC001,1:GOTO 20',
    '30000 POKE &HC003,ERR:POKE &HC008,ERL MOD 256:POKE &HC009,ERL\\256',
    '30010 IF PEEK(&HC005)=1 THEN QZ=4:RESUME','30020 RESUME NEXT');
  cases.forEach(({code},i)=>program.push(`${1000+i*10} ${code}`,`${1001+i*10} RETURN`));
  assert.ok(program.every(line=>line.length<255));
  await msx.type(program.join('\r')+'\rRUN\r');
  for(let i=0;i<100 && !await number('peek 0xc002');i++) await msx.advance(.2);
  assert.equal(await number('peek 0xc002'),1,'Harness startup');
  for(let modeIndex=errorsOnly?modes.length-1:0;modeIndex<modes.length;modeIndex++) {
    const [mode,fil]=modes[modeIndex],dx=mode===7?320:96,dy=fil?288:64;
    await run(settings[modeIndex]);await run(init);
    if(errorsOnly) break;
    for(let vi=0;vi<variants.length;vi++) for(let oi=0;oi<ops.length;oi++) {
      const variant=variants[vi],[op,code]=ops[oi];
      await run(reset);const before=await vram(),expected=Buffer.from(before),logop=await number('peek 0xfb02');
      for(let y=0;y<variant.size;y++) for(let x=0;x<variant.size;x++) {
        const sx=8+variant.inv*(variant.cos*(x-variant.size/2)+variant.sin*(y-variant.size/2));
        const sy=8+variant.inv*(-variant.sin*(x-variant.size/2)+variant.cos*(y-variant.size/2));
        const s=sx>=0 && sx<16 && sy>=0 && sy<16?sx:0;
        put(expected,mode,fil,dx+x,dy+y,logic(code,s,y&15));
      }
      await run(matrices[vi][oi]);
      assert.equal(await number('set ::logic_returns'),1);
      assert.equal(await number('peek 0xfb02'),logop,'Extension COPY does not change native LOGOPR');
      assert.deepEqual(await vram(),expected,`SCREEN ${mode}, FIL=${fil}, ${variant.name}, ${op}`);
      if(!fil && vi===0) {
        await run(reset);await run(native[oi]);
        assert.deepEqual(await vram(),expected,`Native COPY parity: SCREEN ${mode}, ${op}`);
      }
    }
    await run(reset);const before=await vram();await run(twice);
    assert.equal(await number('set ::logic_returns'),2);assert.deepEqual(await vram(),before,'Two XOR copies restore the destination');
    await run(reset);await run(matrices[0][0]);const defaultImage=await vram();
    await run(reset);await run(omitted);assert.deepEqual(await vram(),defaultImage,'Omitted op defaults to PSET after other operations');
    await run(reset);await run(matrices[0][6]);const andImage=await vram();
    await run(reset);await run(spaced);assert.deepEqual(await vram(),andImage,'T AND spelling');
    await run(once);assert.equal(await number('peek 0xc010'),12,'Expressions evaluated once, including after TOR');
    console.log(`PASS [${machine}]: SCREEN ${mode} FIL=${fil}: all 10 operations, all source/destination colors, transforms/windows, unchanged source/other VRAM, defaults/XOR/single evaluation${fil?'':', native COPY parity'}`);
  }
  await run(syntaxInit);
  for(const c of positional) {
    await run(reset);const expected=await vram();
    // LRMM starts at integer coordinates; origin products truncate toward zero.
    const ox=8-Math.trunc(c.inv*c.cos*16)-Math.trunc(c.inv*c.sin*16);
    const oy=8+Math.trunc(c.inv*c.sin*16)-Math.trunc(c.inv*c.cos*16);
    for(let y=0;y<32;y++) for(let x=0;x<32;x++) {
      const sx=ox+Math.floor(c.inv*(c.cos*x+c.sin*y));
      const sy=oy+Math.floor(c.inv*(-c.sin*x+c.cos*y));
      put(expected,7,4,320+x,288+y,logic(c.op,sx>=0&&sx<16&&sy>=0&&sy<16?sx:0,y&15));
    }
    await run(c.id);assert.equal(await number('peek 0xc006'),c.marker,'Line/statement boundary');
    assert.equal(await number('set ::logic_returns'),1);
    assert.deepEqual(await vram(),expected,`Positional fields ${c.tail}`);
  }
  await run(once);assert.equal(await number('peek 0xc010'),12,'Every supplied expression evaluated once');
  await run(nestedOnce);assert.equal(await number('peek 0xc010'),4,'Nested expressions evaluated once');
  console.log(`PASS [${machine}]: positional COPY fields, all omission combinations, trailing omissions, variables/arrays/expressions, scale bounds and next-statement parsing`);
  await run(stable);
  for(const n of bad) await rejected(n);
  await rejected(resumeNext,2);assert.equal(await number('peek 0xc006'),1,'RESUME NEXT continues after a rejected option');
  await run(recoverySetup);await run(resume,1);assert.equal(await number('set ::logic_returns'),1,'RESUME retries successfully');
  await run(disable);await rejected(disabledCopy);await run(enable);
  await run(noHs);await run(reset);await run(matrices[0][5]);await run(enable);
  await run(font);await rejected(fontReject);
  await run(sat);await rejected(satReject);
  await run(full);assert.equal(await number('set ::logic_returns'),2);
  const image=await vram();
  for(let y=0;y<512;y++) for(let x=0;x<512;x++) {
    assert.equal(pixel(image,7,true,0,x,y),6);assert.equal(pixel(image,7,true,1,x,y),7);
  }
  await run(finish);
  console.log(`PASS [${machine}]: syntax/type/expression errors, ERR/ERL/RESUME, state/memory preservation, reservations, HS optional and large chained synchronous copies`);
} finally {await msx.stop();}
