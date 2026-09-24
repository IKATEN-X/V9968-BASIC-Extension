import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { OpenMsx } from '../tools/openmsx.mjs';

const machine=process.argv.includes('V9968_Basic')?'V9968_Basic':'Panasonic_FS-A1ST(V9968)';
const msx=new OpenMsx({rom:'dist/v9968-basic.rom',machine});
const cases=[],add=(code,error=0)=>{cases.push({code,error});return cases.length;};
const ops=[['PSET',0],['AND',1],['OR',2],['XOR',3],['PRESET',4],['TPSET',8],['TAND',9],['TOR',10],['TXOR',11],['TPRESET',12]];
const capture=add('_COPY(SX,SY)-(SX+W-1,SY+H-1),P TO A%');
const reverseCapture=add('_COPY(SX+W-1,SY+H-1)-(SX,SY),P TO A%');
const nativeCapture=add('COPY(SX,SY)-(SX+W-1,SY+H-1),0 TO NN%');
const nativeLoad=ops.map(([op])=>add(`COPY A%,D TO(DX,DY),0,${op}`));
const load=ops.map(([op])=>add(`_COPY(A%),D TO(DX,DY),0,${op}`));
const defaultLoad=add('_COPY(A%) TO(DX,DY),0');
const omittedLogic=add('_COPY(A%) TO(DX,DY),0,');
const settings=[];
for(const mode of [5,6,7,8]) for(const fil of [0,4]) settings.push({mode,fil,
  init:add(`_SCREEN(${mode},,,,,${fil}):SX=${mode===6||mode===7?501:245}:SY=${fil?253:11}:W=7:H=5:P=${(mode<7?8:4)/(fil?2:1)-1}:DX=60:DY=70:D=0`)});
const dimensions=[1,2,3,4,5,7,8,9].map(w=>({w,n:add(`W=${w}:H=3:P=0:SX=13:SY=19`)}));
const directions=[0,1,2,3].map(d=>add(`D=${d}`));
const large=add('W=255:H=31:SX=0:SY=230:DX=0:DY=100:D=0');
const normalLarge=add('W=255:H=25:SX=0:SY=230:DX=0:DY=100:D=0');
const fg4=add('_SCREEN(8,,,,,4):_PATTERN ON(7):SX=13:SY=19:W=7:H=5:P=7:DX=60:DY=70:D=0');
const fg4Yjk=add('_PATTERN OFF:SCREEN 12:_PATTERN ON(7)');
const fg4Text=add('_PATTERN OFF:SCREEN 1:_PATTERN ON(7)');
const setup=add('_PATTERN OFF:_SCREEN(5):SX=13:SY=19:W=7:H=5:P=0:DX=60:DY=70:D=0');
const typed=add('_COPY(13,19)-(19,23),0 TO SS!:_COPY(SS!) TO(60,70),0:_COPY(13,19)-(19,23),0 TO DD#:_COPY(DD#) TO(80,70),0');
const defaultType=add('DEFINT T:_COPY(13,19)-(19,23),0 TO TT:_COPY(TT) TO(90,70),0');
const longName=add('_COPY(13,19)-(19,23),0 TO ARRAY%:_COPY(ARRAY%) TO(100,70),0');
const relocate=add('DEFUSR1=&HE120:_COPY(A%) TO(USR1(60),70+VAL(MID$("000",2,1))+0*FRE("")),0');
const once=add('DEFUSR=&HE100:POKE &HE010,0:_COPY(USR(13),USR(19))-(USR(19),USR(23)),USR(0) TO A%:_COPY(A%),USR(0) TO(USR(60),USR(70)),USR(0),PSET');
const errors=[
  ['_COPY(QQ%) TO(0,0),0',5],
  ['_COPY(0,0)-(1,1),0 TO QQ%',5],
  ['_COPY(QS$) TO(0,0),0',13],
  ['_COPY(0,0)-(1,1),0 TO QS$',13],
  ['_COPY(A%(0)) TO(0,0),0',2],
  ['_COPY(A%) TO(0,0),0,,90',2],
  ['_COPY(A%) TO(0,0),0,PSET,,.75',2],
  ['_COPY(A%),4 TO(0,0),0',5],
  ['_COPY(A%) TO(254,254),0',5],
  ['_COPY(A%),3 TO(0,0),0',5],
  ['_COPY(A%) TO(0,0),8',5],
  ['_COPY(0,0)-(10,10),0 TO TINY%',5],
  ['_COPY(TINY%) TO(0,0),0',5],
  ['_COPY(0,0)-(255,255),0 TO A%',5],
  ['_COPY(0,0)-(1,1),0 TO A%,PSET',2],
  ['_COPY(A%) TO(0,0),0,AND,XOR',2],
  ['_COPY(A%) TO(1/0,0),0',11],
].map(([code,error])=>add(code,error));
const badHeader=add('_COPY(A%) TO(0,0),0',5);
const recover=add('_COPY(A%) TO(XX,YY),0',5);
const invalidState=add('VDP(22)=VDP(22) OR 1:_COPY(A%) TO(0,0),0',5);
const validState=add('_V9968');
const font=add('_SCREEN(5):_FONT(1)');
const fontWrite=add('_COPY(A%) TO(0,236),6',5);
const fontReverse=add('_COPY(A%),2 TO(0,252),6',5);
const sprite=add('_SCREEN(5):_SPRITE(3)');
const spriteWrite=add('_COPY(A%) TO(0,252),6',5);
const spriteReverse=add('_COPY(A%),2 TO(0,256-1),6',5);
const filCross=add('_SCREEN(5):_FONT(1):_SPRITE(3):VDP(22)=64');
const filWrite=add('_COPY(A%),2 TO(0,256),3',5);
const reset=add('_SCREEN(5)');
const finished=add('_SCREEN(0)');
const slow=add('VDP(21)=16'),fast=add('VDP(21)=17');
const fullWidth=[256,512].map(w=>add(`W=${w}:H=3:SX=0:SY=11:DX=0:DY=70:D=0`));
const bytes=async(dev,a,n)=>Buffer.from(await msx.command(`binary encode hex [debug read_block {${dev}} ${a} ${n}]`),'hex');
const write=async(dev,a,b)=>msx.command(`debug write_block {${dev}} ${a} [binary format H* ${b.toString('hex')}]`);
const number=async(c)=>Number(await msx.command(c));
const vram=()=>bytes('physical VRAM',0,262144);
function equal(actual,expected,label='VRAM') {
  const offset=actual.findIndex((b,i)=>b!==expected[i]);
  assert.equal(offset,-1,`${label}: first mismatch ${offset.toString(16)}: actual ${actual[offset]} expected ${expected[offset]}`);
}
function location(m,f,p,x,y) {
  y+=p*(f?512:256);
  if(m===5) return [y*128+(x>>1),(1-(x&1))*4,15];
  if(m===6) return [y*128+(x>>2),(3-(x&3))*2,3];
  if(m===7) return [((x&2)<<15)|((y&511)<<7)|(x>>2)|((y&512)<<8),(1-(x&1))*4,15];
  return [((x&1)<<16)|((y&511)<<7)|(x>>1)|((y&512)<<8),0,255];
}
function pixel(b,m,f,p,x,y) {const[a,s,mask]=location(m,f,p,x,y);return(b[a]>>s)&mask;}
function put(b,m,f,p,x,y,c) {const[a,s,mask]=location(m,f,p,x,y);b[a]=(b[a]&~(mask<<s))|((c&mask)<<s);}
function packed(b,m,f,p,x,y,w,h,reverse=false) {
  const bits=m===6?2:m===8?8:4,r=Buffer.alloc(4+Math.ceil(w*h*bits/8));
  r.writeUInt16LE(w);r.writeUInt16LE(h,2);
  for(let j=0;j<h;j++) for(let i=0;i<w;i++) {
    const n=j*w+i;r[4+(n*bits>>3)]|=pixel(b,m,f,p,x+(reverse?w-1-i:i),y+(reverse?h-1-j:j))<<(8-bits-(n*bits%8));
  }
  return r;
}
function logical(op,s,d,mask) {return(op&8)&&!s?d:[s,s&d,s|d,s^d,s^mask][op&7];}
function loaded(b,image,m,f,p,x,y,dir,op) {
  const r=Buffer.from(b),w=image.readUInt16LE(),h=image.readUInt16LE(2),bits=m===6?2:m===8?8:4,mask=(1<<bits)-1;
  for(let j=0;j<h;j++) for(let i=0;i<w;i++) {
    const n=j*w+i,c=(image[4+(n*bits>>3)]>>(8-bits-(n*bits%8)))&mask,xx=x+((dir&1)?-i:i),yy=y+((dir&2)?-j:j);
    put(r,m,f,p,xx,yy,logical(op,c,pixel(b,m,f,p,xx,yy),mask));
  }
  return r;
}
async function arrays() {
  const [start,end]=(await msx.command('list [peek16 0xf6c4] [peek16 0xf6c6]')).split(' ').map(Number);
  const b=await bytes('memory',start,end-start),r={};
  for(let n=0;n<b.length;) {
    const type=b[n],name=String.fromCharCode(b[n+1])+(b[n+2]?String.fromCharCode(b[n+2]):''),len=b.readUInt16LE(n+3),off=n+6+2*b[n+5];
    r[name]={type,address:start+off,data:Buffer.from(b.subarray(off,n+5+len))};n+=5+len;
  }
  return r;
}
async function run(n,repair=false) {
  if(process.argv.includes('--trace')) console.log(n,cases[n-1].code);
  const log=cases[n-1].code.startsWith('_COPY')?await number('peek 0xfb02'):null;
  await msx.command(`set ::returns 0; set ::busy 0; poke 0xe001 0; poke 0xe003 0; poke 0xe005 ${repair?1:0}; poke 0xe000 ${n}`);
  let result;
  for(let i=0;i<200;i++) {
    result=(await msx.command('list [peek 0xe001] [peek 0xe003] [peek16 0xe008] [peek 0xe00a] $::busy')).split(' ').map(Number);
    if(result[0]) break;
    await msx.advance(.1);
  }
  assert.equal(result[0],1,`completion: ${cases[n-1].code}`);
  assert.equal(result[1],cases[n-1].error,`ERR: ${cases[n-1].code}`);
  if(cases[n-1].error) assert.equal(result[2],1000+(n-1)*10,'ERL');
  assert.equal(result[3],0,'BASIC sentinel variables/arrays/strings');
  assert.equal(result[4],0,'COPY return: CE=0, R15=0, FG4 restored');
  assert.equal(await number('peek 0xf6a5'),0,'SUBFLG restored');
  if(log!==null) assert.equal(await number('peek 0xfb02'),log,'LOGOPR preserved');
}
async function seed() {
  const b=Buffer.alloc(262144);for(let i=0;i<b.length;i++) b[i]=(i*73+(i>>7)*29+(i>>13)*11)&255;
  await write('physical VRAM',0,b);return b;
}
async function checkCapture(n,b,m,f,p,x,y,w,h,reverse=false) {
  let a=(await arrays()).A;const image=packed(b,m,f,p,x,y,w,h,reverse),tail=Buffer.from(a.data.subarray(image.length));
  await run(n);a=(await arrays()).A;
  assert.deepEqual(a.data.subarray(0,image.length),image,`capture ${m}/${f} ${w}x${h}`);
  assert.deepEqual(a.data.subarray(image.length),tail,'unused array bytes intact');
  equal(await vram(),b,'capture is VRAM read-only');return image;
}
try {
  await msx.command('set throttle on; set speed 200');await msx.advance(12);
  const map=await readFile('build/v9968-basic.map','ascii'),restore=/\brestore_text\s*= \$([0-9A-F]+)/i.exec(map)[1];
  await msx.command(`set ::returns 0; set ::busy 0; poke 0xe000 0; poke 0xe002 0; poke 0xe00a 0
    debug write_block memory 0xe100 [binary format H* 2110e034c9]
    debug write_block memory 0xe120 [binary format H* 2af8f7e5af32a5f62150e1cda45ee122f8f73e023263f6c9]
    debug write_block memory 0xe150 [binary format H* 5a5a2500]
    debug set_bp 0x${restore} {[pc_in_slot 1] && [peek16 0xfd89]==0x4f43 && [peek16 0xfd8b]==0x5950} {
      incr ::returns; set ::busy [expr {$::busy | ([debug read {VDP status regs} 2]&1) | [debug read {VDP regs} 15] | ([debug read {VDP regs} 45]&128)}]
    }`);
  const program=['1 CLEAR 512,&HDFFF:DEFINT A-Z:ON ERROR GOTO 30000',
    '2 QA=12345:DIM QB(2),QS$(1):QB(2)=456:QC$=STRING$(64,65):QS$(1)="KEEP"',
    '3 DIM A%(4095),NN%(200),SS!(32),DD#(1,2,3),TT%(30),ARRAY%(30),TINY%(0):XX=255:YY=255',
    '4 SX=0:SY=0:DX=0:DY=0:W=0:H=0:P=0:D=0:N=0:POKE &HE002,1',
    '20 IF PEEK(&HE000)=0 THEN 20','30 N=PEEK(&HE000):POKE &HE000,0'];
  for(let i=0;i<cases.length;i+=16) program.push(`${40+i} IF N>${i} AND N<=${i+16} THEN ON N-${i} GOSUB ${cases.slice(i,i+16).map((_,j)=>1000+(i+j)*10).join(',')}`);
  program.push('200 IF QA<>12345 OR QB(2)<>456 OR QC$<>STRING$(64,65) OR QS$(1)<>"KEEP" THEN POKE &HE00A,1',
    '210 POKE &HE001,1:GOTO 20','30000 POKE &HE003,ERR:POKE &HE008,ERL MOD 256:POKE &HE009,ERL\\256',
    '30010 IF PEEK(&HE005)=1 THEN XX=10:YY=10:RESUME','30020 RESUME NEXT');
  cases.forEach(({code},i)=>program.push(`${1000+i*10} ${code}`,`${1001+i*10} RETURN`));
  assert.ok(program.every(l=>l.length<255));
  await msx.type(program.join('\r')+'\rRUN\r');
  for(let i=0;i<100&&!await number('peek 0xe002');i++) await msx.advance(.2);
  assert.equal(await number('peek 0xe002'),1,await msx.screen());
  const pointers=await bytes('memory',0xf672,4),himem=await number('peek16 0xfc4a');
  for(const {mode,fil,init} of process.argv.includes('--checks-only')?[]:settings) {
    await run(init);let b=await seed();
    const sx=mode===6||mode===7?501:245,sy=fil?253:11,p=(mode<7?8:4)/(fil?2:1)-1;
    put(b,mode,fil,p,sx,sy,0);await write('physical VRAM',0,b);
    let image=await checkCapture(capture,b,mode,fil,p,sx,sy,7,5);
    for(let i=0;i<ops.length;i++) {
      const d=i%4;await run(directions[d]);
      b=loaded(b,image,mode,fil,0,60,70,d,ops[i][1]);
      await run(load[i]);equal(await vram(),b,`load ${mode}/${fil} ${ops[i][0]} direction ${d}`);
      assert.equal(await number('set ::returns'),1);
    }
    await checkCapture(reverseCapture,b,mode,fil,p,sx,sy,7,5,true);
    if(!fil) for(const {w,n} of dimensions) {
      await run(n);image=await checkCapture(capture,b,mode,fil,0,13,19,w,3);
      await run(nativeCapture);assert.deepEqual((await arrays()).NN.data.subarray(0,image.length),image,'native capture format parity');
    }
    await run(init);b=await seed();await run(fil?large:normalLarge);
    image=await checkCapture(capture,b,mode,fil,p,0,230,255,fil?31:25);
    b=loaded(b,image,mode,fil,0,0,100,0,0);await run(defaultLoad);equal(await vram(),b,'large synchronous transfer');
    await run(fullWidth[mode===6||mode===7?1:0]);
    image=await checkCapture(capture,b,mode,fil,p,0,11,mode===6||mode===7?512:256,3);
    b=loaded(b,image,mode,fil,0,0,70,0,0);await run(defaultLoad);equal(await vram(),b,'full-width transfer');
    console.log(`PASS [${machine}]: SCREEN ${mode}/${fil?'FIL':'normal'}, packed capture, 10 logical loads, flips, native format and large transfer`);
  }
  await run(setup);let b=await seed();let image=await checkCapture(capture,b,5,0,0,13,19,7,5);
  for(let i=0;i<ops.length;i++) {
    const d=i%4;await run(directions[d]);const expected=loaded(b,image,5,0,0,60,70,d,ops[i][1]);
    await run(nativeLoad[i]);equal(await vram(),expected,'native array load parity');await write('physical VRAM',0,b);
  }
  await run(omittedLogic);b=loaded(b,image,5,0,0,60,70,0,0);equal(await vram(),b);
  await run(typed);await run(defaultType);await run(longName);
  for(const name of ['SS','DD','TT','AR']) assert.deepEqual((await arrays())[name].data.subarray(0,image.length),image,'numeric type/name parity');
  const address=(await arrays()).A.address;await run(relocate);assert.ok((await arrays()).A.address>address,'new scalar relocated the array');
  assert.deepEqual((await arrays()).A.data.subarray(0,image.length),image,'source remained intact through relocation/GC');
  await run(once);assert.equal(await number('peek 0xe010'),9,'each numeric argument evaluated once');
  await run(slow);b=await vram();image=await checkCapture(capture,b,5,0,0,13,19,7,5);
  b=loaded(b,image,5,0,0,60,70,0,0);await run(defaultLoad);equal(await vram(),b,'HS is optional');await run(fast);
  console.log('PASS: native load parity, integer/single/double and multidimensional arrays, names, relocation, GC, single evaluation');
  for(const n of [fg4,fg4Yjk,fg4Text]) {
    await run(n);b=await seed();image=await checkCapture(capture,b,5,0,7,13,19,7,5);
    b=loaded(b,image,5,0,0,60,70,0,0);await run(defaultLoad);equal(await vram(),b,'FG4 physical material');
  }
  await run(setup);b=await seed();image=await checkCapture(capture,b,5,0,0,13,19,7,5);
  for(const n of errors) {
    const before=await arrays();await run(n);
    assert.deepEqual(await arrays(),before,'rejected operation did not change arrays');equal(await vram(),b,'rejected operation did not change VRAM');
  }
  for(const [w,h] of [[0,5],[7,0],[257,1],[1,257],[256,256],[65535,65535]]) {
    const a=(await arrays()).A,header=Buffer.alloc(4);header.writeUInt16LE(w);header.writeUInt16LE(h,2);await write('memory',a.address,header);
    const before=await arrays();await run(badHeader);assert.deepEqual(await arrays(),before);equal(await vram(),b);
  }
  await run(capture);await run(recover,true);b=loaded(b,image,5,0,0,10,10,0,0);equal(await vram(),b,'RESUME retries after fixing coordinate');
  await run(invalidState);equal(await vram(),b);await run(validState);
  for(const [init,checks] of [[font,[fontWrite,fontReverse]],[sprite,[spriteWrite,spriteReverse]],[filCross,[filWrite]]]) {
    await run(init);b=await vram();const a=await arrays();
    for(const n of checks) {await run(n);equal(await vram(),b,'font/SAT protected');assert.deepEqual(await arrays(),a);}
  }
  await run(reset);await run(defaultLoad);
  assert.equal(await number('peek16 0xfc4a'),himem);assert.deepEqual(await bytes('memory',0xf672,4),pointers,'no allocation or string-area changes');
  await run(finished);
  console.log('PASS: FG4/FIL/YJK material, malformed headers/capacity/errors/ERL/RESUME, font/SAT and BASIC-data protection, unchanged allocation');
} finally {await msx.stop();}
