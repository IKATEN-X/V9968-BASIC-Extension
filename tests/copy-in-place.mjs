import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { OpenMsx } from '../tools/openmsx.mjs';

const machine=process.argv.includes('V9968_Basic')?'V9968_Basic':'Panasonic_FS-A1ST(V9968)';
const screen=Number(process.argv.find(a=>a.startsWith('--screen='))?.split('=')[1]??0);
const quick=process.argv.includes('--quick');
const msx=new OpenMsx({rom:'dist/v9968-basic.rom',machine});
const cases=[],add=(code,error=0)=>{cases.push({code,error});return cases.length;};
const ops=[['PSET',0],['AND',1],['OR',2],['XOR',3],['PRESET',4],['TPSET',8],['TAND',9],['TOR',10],['TXOR',11],['TPRESET',12]];
const source='(SX,SY)-(SX+23,SY+16),P TO(DX,DY)';
const copies=ops.map(([op])=>add(`_COPY${source},P,${op}`));
// Native COPY needs explicitly reversed endpoints for a down/right overlap.
const native=ops.map(([op])=>add(`COPY(SX+23,SY+16)-(SX,SY),P TO(DX+23,DY+16),P,${op}:_WAIT VDP`));
const explicitIdentity=add(`_COPY${source}-(DX+23,DY+16),P,XOR,360,1`);
const transforms=[['90',0,1,1],[',.5',1,0,2],['90,2',0,1,.5],['0',1,0,1]];
const transformed=transforms.map(([tail])=>add(`_COPY${source}-(DX+31,DY+31),P,TPSET,${tail}`));
const rejected=transforms.slice(0,3).map(([tail])=>add(`_COPY${source},P,,${tail}`,5));
rejected.push(add(`_COPY${source}-(DX+31,DY+31),P`,5));
const resume=add(`_COPY${source},P,,Q`,5);
const once=add('DEFUSR=&HC100:POKE &HC010,0:_COPY(USR(SX),USR(SY))-(USR(SX+23),USR(SY+16)),USR(P) TO(USR(DX),USR(DY)),USR(P),XOR,USR(0),USR(1)');
const slow=add('VDP(21)=16'),fast=add('VDP(21)=17');
const large=add('_COPY(0,0)-(W-1,510),P TO(0,1),P:_COPY(0,1)-(W-1,511),P TO(0,0),P,XOR');
const protectedInit=add('_SCREEN(5):_SPRITE(3):_WAIT VDP');
const protectedCopy=add('_COPY(0,240)-(15,255),6 TO(1,240),6',5);
const fontInit=add('_SCREEN(5):_FONT(1):_WAIT VDP');
const fontCopy=add('_COPY(0,220)-(15,239),6 TO(1,221),6',5);
const finish=add('_SCREEN(0)');
const settings=[];
for(const mode of [5,6,7,8]) for(const fil of [0,4]) {
  const page=(mode<7?8:4)/(fil?2:1)-1;
  settings.push({mode,fil,page,init:add(`_SCREEN(${mode},,,,,${fil}):P=${page}:W=${mode===6||mode===7?512:256}:_WAIT VDP`)});
}
const dirs=[[-3,-2],[0,-2],[3,-2],[-3,0],[0,0],[3,0],[-3,2],[0,2],[3,2]];
const placements=dirs.map(([x,y])=>add(`DX=SX+${x}:DY=SY+${y}`));
const disjoint=add('DX=SX+32:DY=SY+32'),overlap=add('DX=SX+1:DY=SY+1:Q=90');
const low=add('SX=33:SY=30'),high=add('SX=W-50:SY=250');
const nativePage=add('P=0:DX=SX+3:DY=SY+2');
const number=async c=>Number(await msx.command(c));
const bytes=async (dev,a,n)=>Buffer.from(await msx.command(`binary encode hex [debug read_block {${dev}} ${a} ${n}]`),'hex');
const vram=()=>bytes('physical VRAM',0,262144);
async function verify(data,label) {
  assert.deepEqual(await vram(),data,label);
}
function location(m,f,p,x,y) {
  y+=p*(f?512:256);
  if(m===5) return [y*128+(x>>1),(1-(x&1))*4,15];
  if(m===6) return [y*128+(x>>2),(3-(x&3))*2,3];
  if(m===7) return [((x&2)<<15)|((y&511)<<7)|(x>>2)|((y&512)<<8),(1-(x&1))*4,15];
  return [((x&1)<<16)|((y&511)<<7)|(x>>1)|((y&512)<<8),0,255];
}
function pixel(data,m,f,p,x,y) {const [a,s,mask]=location(m,f,p,x,y);return (data[a]>>s)&mask;}
function put(data,m,f,p,x,y,c) {const [a,s,mask]=location(m,f,p,x,y);data[a]=(data[a]&~(mask<<s))|((c&mask)<<s);}
function logic(op,s,d,mask) {return (op&8)&&!s?d:[s,s&d,s|d,s^d,s^mask][op&7];}
let work;
async function state() {return {vram:await vram(),regs:await bytes('VDP regs',0,59),ram:await bytes('memory',work,32),
  hook:await bytes('memory',0xfee4,5),shadow:await bytes('memory',0xffe7,22),pages:await bytes('memory',0xfaf5,2)};}
async function run(n,recover=0) {
  await msx.command(`set ::copies 0; set ::busy 0; poke 0xc001 0; poke 0xc003 0; poke 0xc005 ${recover}; poke 0xc000 ${n}`);
  let result;
  for(let i=0;i<200;i++) {
    result=(await msx.command('list [peek 0xc001] [peek 0xc003] [peek16 0xc008] [peek 0xc00a] $::busy')).split(' ').map(Number);
    if(result[0]) break;
    await msx.advance(.1);
  }
  assert.equal(result[0],1,cases[n-1].code);
  assert.equal(result[1],cases[n-1].error,cases[n-1].code);
  if(cases[n-1].error) assert.equal(result[2],1000+(n-1)*10,'ERL');
  assert.equal(result[3],0,'BASIC variables/string/array intact');
  assert.equal(result[4],0,'COPY complete and R15 restored at return');
}
async function seed() {
  const b=Buffer.alloc(262144);for(let i=0;i<b.length;i++) b[i]=(i*73+(i>>7)*29+(i>>13)*11)&255;
  await msx.command(`debug write_block {physical VRAM} 0 [binary format H* ${b.toString('hex')}]`);
  return b;
}
try {
  await msx.command('set throttle on; set speed 100');await msx.advance(12);
  work=(await number('peek16 0xfd2f'))&0xfffe;
  const map=await readFile('build/v9968-basic.map','ascii');
  const restore=/\brestore_text\s*= \$([0-9A-F]+)/i.exec(map)[1];
  await msx.command(`set ::copies 0; set ::busy 0
    debug set_bp 0x${restore} {[pc_in_slot 1] && [peek16 0xfd89]==0x4f43 && [peek16 0xfd8b]==0x5950} {
      incr ::copies; set ::busy [expr {$::busy | ([debug read {VDP status regs} 2]&1) | [debug read {VDP regs} 15]}]
    }
    poke 0xc000 0; poke 0xc002 0; poke 0xc00a 0; debug write_block memory 0xc100 [binary format H* 2110c034c9]`);
  const program=['1 CLEAR 512,&HBFFF:DEFINT A-Z:ON ERROR GOTO 30000',
    '2 QA=12345:DIM QB(2):QB(2)=456:QC$=STRING$(64,65):POKE &HC002,1',
    '20 IF PEEK(&HC000)=0 THEN 20','30 N=PEEK(&HC000):POKE &HC000,0'];
  for(let i=0;i<cases.length;i+=16) program.push(`${40+i} IF N>${i} AND N<=${i+16} THEN ON N-${i} GOSUB ${cases.slice(i,i+16).map((_,j)=>1000+(i+j)*10).join(',')}`);
  program.push('200 IF QA<>12345 OR QB(2)<>456 OR QC$<>STRING$(64,65) THEN POKE &HC00A,1',
    '210 POKE &HC001,1:GOTO 20','30000 POKE &HC003,ERR:POKE &HC008,ERL MOD 256:POKE &HC009,ERL\\256',
    '30010 IF PEEK(&HC005)=1 THEN Q=0:RESUME','30020 RESUME NEXT');
  cases.forEach(({code},i)=>program.push(`${1000+i*10} ${code}`,`${1001+i*10} RETURN`));
  assert.ok(program.every(l=>l.length<255));
  await msx.type(program.join('\r')+'\rRUN\r');
  for(let i=0;i<100 && !await number('peek 0xc002');i++) await msx.advance(.2);
  assert.equal(await number('peek 0xc002'),1);
  for(const {mode,fil,page,init} of settings.filter(s=>!screen||s.mode===screen)) {
    await run(init);await run(fil?high:low);
    const width=mode===6||mode===7?512:256,sx=fil?width-50:33,sy=fil?250:30,mask=mode===6?3:mode===8?255:15;
    let data=await seed();
    for(let oi=0;oi<ops.length;oi++) for(let di=0;di<dirs.length;di++) {
      if(quick&&oi>0&&di!==oi%dirs.length) continue;
      await run(placements[di]);
      const [ox,oy]=dirs[di],expected=Buffer.from(data),op=ops[oi][1];
      for(let y=0;y<17;y++) for(let x=0;x<24;x++) put(expected,mode,fil,page,sx+ox+x,sy+oy+y,
        logic(op,pixel(data,mode,fil,page,sx+x,sy+y),pixel(data,mode,fil,page,sx+ox+x,sy+oy+y),mask));
      await run(copies[oi]);assert.equal(await number('set ::copies'),1);
      await verify(expected,`${mode}/${fil} ${ops[oi][0]} dir=${ox},${oy}`);data=expected;
    }
    console.log(`PASS [${machine}] SCREEN ${mode} FIL=${fil}: overlap operators/directions (${quick?'focused':'full matrix'})`);
    await run(placements[8]);data=await seed();const expected=Buffer.from(data);
    for(let y=0;y<17;y++) for(let x=0;x<24;x++) put(expected,mode,fil,page,sx+3+x,sy+2+y,
      pixel(data,mode,fil,page,sx+x,sy+y)^pixel(data,mode,fil,page,sx+3+x,sy+2+y));
    await run(explicitIdentity);assert.deepEqual(await vram(),expected);
    data=await seed();await run(once);assert.equal(await number('peek 0xc010'),10);assert.deepEqual(await vram(),expected);
    await run(low);await run(disjoint);
    for(let i=0;i<transforms.length;i++) {
      data=await seed();const expected=Buffer.from(data),[,c,s,k]=transforms[i];
      const ax=33,ay=30,dx=ax+32,dy=ay+32;
      const startX=ax+12-Math.trunc(16*c*k)+Math.trunc(16*-s*k);
      const startY=ay+8-Math.trunc(16*-s*k)-Math.trunc(16*c*k);
      for(let y=0;y<32;y++) for(let x=0;x<32;x++) {
        const tx=Math.floor(startX+k*(c*x+s*y)),ty=Math.floor(startY+k*(-s*x+c*y));
        const color=tx>=ax&&tx<ax+24&&ty>=ay&&ty<ay+17?pixel(data,mode,fil,page,tx,ty):0;
        if(color) put(expected,mode,fil,page,dx+x,dy+y,color);
      }
      await run(transformed[i]);assert.deepEqual(await vram(),expected,`Disjoint ${mode}/${fil}: ${transforms[i][0]}`);
    }
    await run(overlap);
    for(const n of rejected) {const before=await state();await run(n);assert.deepEqual(await state(),before);}
    await run(resume,1);assert.equal(await number('set ::copies'),1);
    await msx.command('set speed 100');
    await run(slow);await run(copies[0]);await run(fast);
    if(fil) {
      data=await seed();const expected=Buffer.from(data);
      for(let y=0;y<511;y++) for(let x=0;x<width;x++) put(expected,mode,fil,page,x,y+1,pixel(data,mode,fil,page,x,y));
      const middle=Buffer.from(expected);
      for(let y=0;y<511;y++) for(let x=0;x<width;x++) put(expected,mode,fil,page,x,y,
        pixel(middle,mode,fil,page,x,y+1)^pixel(middle,mode,fil,page,x,y));
      await run(large);assert.equal(await number('set ::copies'),2);assert.deepEqual(await vram(),expected);
    } else {
      await run(nativePage);
      for(let i=0;i<ops.length;i++) {
        await seed();await run(copies[i]);const extended=await vram();
        await seed();await run(native[i]);assert.deepEqual(await vram(),extended,`Native overlap parity ${mode} ${ops[i][0]}`);
      }
    }
    console.log(`PASS [${machine}] SCREEN ${mode} FIL=${fil}: 10 operations / 9 overlap directions (${quick?'focused':'full matrix'}), self-copy, transforms, errors/recovery, full VRAM/BASIC preservation, synchronous${fil?', large chained copies':''}`);
  }
  for(const [init,n] of [[protectedInit,protectedCopy],[fontInit,fontCopy]]) {
    await run(init);const before=await state();await run(n);assert.deepEqual(await state(),before);
  }
  await run(finish);console.log('PASS: same-page font/SAT destination protection');
} finally {await msx.stop();}
