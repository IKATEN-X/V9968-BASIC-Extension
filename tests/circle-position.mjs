import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {OpenMsx} from '../tools/openmsx.mjs';

const machine=process.argv.includes('V9968_Basic')?'V9968_Basic':'Panasonic_FS-A1ST(V9968)';
const trace=process.argv.includes('--trace');
const from=Number(process.argv.find(a=>a.startsWith('--from='))?.split('=')[1]??0);
const cases=[];
const add=(code,error=0)=>(cases.push({code,error}),cases.length);
const modes=[];
for(const s of [5,6,7,8])for(const fil of [false,true]) {
  const width=s===6||s===7?512:256,height=fil?512:256;
  const page=s<7?(fil?3:7):(fil?1:3);
  modes.push({s,fil,page,width,height,init:add(`_SCREEN(${s}${fil?',,,,,4':''}):_SET PAGE(0,${page}):_CLS(0):_WAIT VDP`)});
}
const pattern={s:5,fil:false,page:7,width:256,height:256,init:add('SCREEN 1:_V9968:_PATTERN ON(7):_CLS(0):_WAIT VDP')};
const blank=add('_CLS(0):_WAIT VDP');
const shapes=[];
function shape(mode,cx,cy,r,a=1,start=null,end=null) {
  const angles=start===null?',,':`,${start},${end}`;
  const n=add(`_CIRCLE(${cx},${cy}),${r},1${angles},${a}:_WAIT VDP`);
  shapes.push({mode,cx,cy,r,a,start,end,n});
}
for(const mode of [...modes,pattern]) {
  const {width:w,height:h}=mode;
  shape(mode,-10,80,40);
  shape(mode,w+10,80,40,.5);
  shape(mode,80,-10,40,2);
  shape(mode,80,h+10,40);
  shape(mode,-15,-15,50,1,-5.2,-6.1);
  shape(mode,w+15,h+15,50,1,-2,-3.8);
}
const mode=modes[0];
for(const [cx,cy,r,a,s,e] of [
  [-50,100,140,1,-.2,-5.8],[300,100,140,1,-2.8,-3.6],
  [100,-50,140,1,-4.4,-5],[100,300,140,1,-1.2,-2],
  [-80,100,220,.5,-.2,-5.5],[100,-80,220,2,-4.4,-5.2],
  [-32768,100,32767,1,null,null],[32767,100,32767,1,null,null],
  [100,-32768,32767,1,null,null],[100,32767,32767,1,null,null],
  [-32768,-32768,32767,1,null,null],[-32767,100,32767,1,null,null],
  [32767,100,32767,1,-3.14,-3.14],[100,32767,32767,1,-1.57,-1.57],
  [-32760,100,32767,1,-6.283,-6.283],[100,-32760,32767,1,-4.713,-4.713],
  [-30000,-100,32767,1,-6.27,-6.27],[30000,400,32767,1,-3.13,-3.13],
  [100,-32768,32767,1000,null,null],[-32768,100,32767,.001,null,null],
  [-32760,-32760,32767,1,-2,-2],[32767,32767,32767,1,-5,-5],
  [32000,100,32767,1,-.1,-.1],[-32000,100,32767,1,-3.1,-3.1],
  [-1,100,0,1,null,null],[256,100,0,1,null,null],
])shape(mode,cx,cy,r,a,s,e);

const positionSetup=add('_SCREEN(5):_CLS(0):PSET(100,100),0:_WAIT VDP');
const positions=[
  ['_CIRCLE STEP(10,-20),10,1,,,1',[110,80]],
  ['_CIRCLE STEP(-20,10),0,1,,,1',[90,90]],
  ['_CIRCLE(40,50),0:PSET STEP(5,6),1',[45,56]],
  ['_CIRCLE STEP(5,4),0:LINE -STEP(10,10),1',[60,70]],
  ['_CIRCLE(32767,100),0:_CIRCLE STEP(1,0),0',[-32768,100]],
  ['_CIRCLE STEP(-1,0),0',[32767,100]],
  ['_CIRCLE(30.4,50.6),0',[30,50]],
  ['_CIRCLE STEP(.6,-.6),0',[30,50]],
  ['DEFUSR=&HC100:_CIRCLE STEP(USR(5),10),0',[205,160]],
  ['_CIRCLE STEP(5,USR(10)),0',[205,160]],
  ['_CIRCLE(10,20),USR(0)',[10,20]],
].map(([code,pos])=>({n:add(code+':_WAIT VDP'),pos}));
const once=add('DEFUSR1=&HC120:POKE &HC010,0:_CIRCLE STEP(USR1(1),USR1(2)),USR1(3),USR1(1),USR1(0),USR1(6),USR1(1):_WAIT VDP');
const errors=[
  ['_CIRCLE STEP(32768,0),1',6],['_CIRCLE STEP(-32769,0),1',6],
  ['_CIRCLE STEP("X",0),1',13],['_CIRCLE STEP(0,"X"),1',13],
  ['_CIRCLE STEP(1/0,0),1',11],['_CIRCLE STEP(1,2),1,16',5],
  ['_CIRCLE STEP(1,2),1,,,,-1',5],['_CIRCLE STEP(1,2),1,1,,,1,XOR',2],
  ['_CIRCLE STEP(1,2)',2],['_CIRCLE(32000,-32000),5,16',5],
].map(([c,e])=>add(c,e));
const recover=add('_CIRCLE STEP(5,6),0,1,,,1:_WAIT VDP');
const fontSetup=add('_SCREEN(5):_FONT(1):_SET PAGE(0,6)');
const fontReject=add('_CIRCLE(-10,240),30,1,,,1',5);
const fontEmpty=add('_CIRCLE(-100,240),30,1,,,1');
const satSetup=add('_SCREEN(5):_SPRITE(3):_SET PAGE(0,6)');
const satReject=add('_CIRCLE(270,254),30,1,,,1',5);
const patternSetup=add('_PATTERN ON(6)');
const clearMode=add('_PATTERN OFF:_SCREEN(5):VDP(22)=VDP(22) OR 1');
const missing=add('_CIRCLE STEP(1,2),0',5);
const resumeSetup=add('_SCREEN(5):RR%=-1:PSET(100,100),0');
const resume=add('_CIRCLE STEP(5,6),RR%:POKE &HC006,1',5);
const resumeNext=add('_CIRCLE STEP(5,6),-1:POKE &HC006,2',5);
const grp=add('_SCREEN(5):OPEN "GRP:" AS #1:_CIRCLE(20,40),0:PRINT #1,"A";:CLOSE #1');
assert.ok(cases.length<256);

const round=x=>Math.sign(x)*Math.round(Math.abs(x));
function oracle(v) {
  const {cx,cy,r,a,start,end,mode:{width,height}}=v;
  const fx=a>1?Math.round(16384/a):16384,fy=a>1?16384:Math.round(16384*a);
  const scale=(n,f)=>round(n*f/16384);
  const result=new Set();
  const plot=(x,y)=>{if(x>=0&&x<width&&y>=0&&y<height)result.add(`${x},${y}`);};
  const local=(x,y)=>plot(cx+scale(x,fx),cy-scale(y,fy));
  // Isolate raster/clipping from BASIC trig precision: use parsed directions
  // only, then independently compute every point and Bresenham step below.
  const full=start===null,ds=v.startVector,de=v.endVector;
  const span=full?Math.PI*2:(Math.abs(end)-Math.abs(start)+Math.PI*2)%(Math.PI*2);
  let x=0,y=r,d=1-r;
  while(x<=y) {
    for(const [px,py] of [[y,x],[x,y],[-x,y],[-y,x],[-y,-x],[-x,-y],[x,-y],[y,-x]]) {
      if(full){local(px,py);continue;}
      if(span===0)continue;
      const after=ds[0]*py-ds[1]*px>=0,before=de[0]*py-de[1]*px<=0;
      if(span>Math.PI?after||before:after&&before)local(px,py);
    }
    x++;if(d<0)d+=2*x+1;else{y--;d+=2*(x-y)+1;}
  }
  if(!full)for(const [t,[vx,vy]] of [[start,ds],[end,de]]) {
    const px=scale(vx,r),py=scale(vy,r);
    local(px,py);
    if(t>=0)continue;
    const dx=scale(px,fx),dy=-scale(py,fy),sx=dx<0?-1:1,sy=dy<0?-1:1;
    const ax=Math.abs(dx),ay=Math.abs(dy),major=Math.max(ax,ay),minor=Math.min(ax,ay);
    let xx=cx,yy=cy,acc=Math.floor(major/2);
    for(let i=0;i<=major;i++) {
      plot(xx,yy);acc+=minor;
      if(acc>=major){acc-=major;if(ax>ay)yy+=sy;else xx+=sx;}
      if(ax>ay)xx+=sx;else yy+=sy;
    }
  }
  return result;
}
function paint(data,mode,points) {
  const result=Buffer.from(data),{s,fil,page,width}=mode,ppb=s===6?4:s===8?1:2;
  const base=page*(s<7?32768:65536)*(fil?2:1),bits=8/ppb;
  for(const p of points) {
    const [x,y]=p.split(',').map(Number);
    let a=base+y*width/ppb+Math.floor(x/ppb);
    if(s>=7)a=((a&0x1ffff)>>1)|((a&1)<<16)|(a&0x20000);
    const shift=(ppb-1-x%ppb)*bits;
    result[a]=(result[a]&~(((1<<bits)-1)<<shift))|(1<<shift);
  }
  return result;
}

const msx=new OpenMsx({rom:'dist/v9968-basic.rom',machine});
const num=async c=>Number(await msx.command(c));
const bytes=async(d,a,n)=>Buffer.from(await msx.command(`binary encode hex [debug read_block {${d}} ${a} ${n}]`),'hex');
const vram=()=>bytes('physical VRAM',0,262144);
const cursor=async()=>[await num('peek16 0xfcb7'),await num('peek16 0xfcb9')].map(v=>v>=32768?v-65536:v);
async function run(n,recovery=0) {
  const {code,error}=cases[n-1];if(trace)console.log(n,code);
  await msx.command(`poke 0xc001 0;poke 0xc003 0;poke 0xc005 ${recovery};poke 0xc006 0;poke 0xc000 ${n}`);
  for(let i=0;i<500&&await num('peek 0xc001')!==1;i++)await msx.advance(.1);
  if(await num('peek 0xc001')!==1)console.log(await msx.screen());
  assert.equal(await num('peek 0xc001'),1,`Timeout: ${code}`);
  assert.equal(await num('peek 0xc003'),error,code);
  if(error)assert.equal(await num('peek16 0xc008'),1000+(n-1)*100,'ERL');
  assert.equal(await num('peek 0xc00a'),0,'BASIC data sentinels');
}
async function unchanged(n) {
  const image=await vram(),pos=await cursor(),regs=await bytes('VDP regs',0,59);
  await run(n);assert.deepEqual(await vram(),image);assert.deepEqual(await cursor(),pos);
  assert.deepEqual(await bytes('VDP regs',0,59),regs);
}
try {
  await msx.command('set throttle on;set speed 400');await msx.advance(12);
  const map=await readFile('build/v9968-basic.map','ascii');
  const arcReady=parseInt(/\bcircle_arc_ready\s*= \$([0-9A-F]+)/i.exec(map)[1],16);
  await msx.command(`set ::ci_vectors {};debug set_bp ${arcReady} {[pc_in_slot 1]} {
    set ::ci_vectors [binary encode hex [debug read_block memory [expr {[reg IX]+78}] 8]]
  }`);
  await msx.command(`debug write_block memory 0xc100 [binary format H* 21c80022b7fc21960022b9fcc9]
    debug write_block memory 0xc120 [binary format H* 2110c034c9]
    poke 0xc000 0;poke 0xc002 0;poke 0xc00a 0`);
  const p=['1 CLEAR 512,&HBFFF:ON ERROR GOTO 30000',
    '2 QA%=12345:DIM QB%(2):QB%(0)=-123:QB%(2)=456:QC$=STRING$(64,65)',
    '10 _SCREEN(5):POKE &HC002,1','20 IF PEEK(&HC000)=0 THEN 20','30 A%=PEEK(&HC000):POKE &HC000,0'];
  for(let i=0;i<cases.length;i+=16)p.push(`${40+i/16} IF A%>${i} AND A%<=${i+16} THEN ON A%-${i} GOSUB ${cases.slice(i,i+16).map((_,j)=>1000+(i+j)*100).join(',')}`);
  p.push('200 IF QA%<>12345 OR QB%(0)<>-123 OR QB%(2)<>456 OR QC$<>STRING$(64,65) THEN POKE &HC00A,1',
    '210 POKE &HC001,1:GOTO 20','30000 POKE &HC003,ERR:POKE &HC008,ERL MOD 256:POKE &HC009,ERL\\256',
    '30010 IF PEEK(&HC005)=1 THEN RR%=0:RESUME','30020 IF PEEK(&HC005)=2 THEN RESUME NEXT','30030 RESUME 200');
  cases.forEach(({code},i)=>p.push(`${1000+i*100} ${code}`,`${1010+i*100} RETURN`));
  assert.ok(p.every(l=>l.length<255));
  await msx.type(p.join('\r')+'\rRUN\r');
  for(let i=0;i<200&&await num('peek 0xc002')!==1;i++)await msx.advance(.1);
  assert.equal(await num('peek 0xc002'),1,'Harness start');
  let previous,checked=0;
  if(!process.argv.includes('--positions-only'))for(const v of shapes) {
    if(v.n<from)continue;
    if(previous!==v.mode){await run(v.mode.init);previous=v.mode;}else await run(blank);
    const before=await vram();
    await run(v.n);
    if(v.start!==null){const b=Buffer.from(await msx.command('set ::ci_vectors'),'hex');v.startVector=[b.readInt16LE(0),b.readInt16LE(2)];v.endVector=[b.readInt16LE(4),b.readInt16LE(6)];}
    const expected=paint(before,v.mode,oracle(v));
    const actual=await vram();
    if(!actual.equals(expected)) {
      const differences=[];for(let i=0;i<actual.length&&differences.length<20;i++)if(actual[i]!==expected[i])differences.push([i.toString(16),actual[i],expected[i]]);
      assert.fail(`${cases[v.n-1].code}: cursor ${await cursor()}, VRAM differences ${JSON.stringify(differences)}`);
    }
    assert.deepEqual(await cursor(),[v.cx,v.cy]);
    checked++;
  }
  if(checked)console.log(`PASS [${machine}]: ${checked} exact clipped circles/arcs/radii, signed extremes, SCREEN 5..8/FIL/PATTERN, all-VRAM bounds`);
  await run(positionSetup);
  for(const v of positions){await run(v.n);assert.deepEqual(await cursor(),v.pos,cases[v.n-1].code);}
  await run(positionSetup);await run(once);assert.equal(await num('peek 0xc010'),7);assert.deepEqual(await cursor(),[101,102]);
  for(const n of errors)await unchanged(n);
  await run(recover);assert.deepEqual(await cursor(),[106,108]);
  await run(fontSetup);await unchanged(fontReject);
  const before=await vram(),regs=await bytes('VDP regs',0,59);
  await run(fontEmpty);assert.deepEqual(await vram(),before);assert.deepEqual(await bytes('VDP regs',0,59),regs);assert.deepEqual(await cursor(),[-100,240]);
  await run(patternSetup);await unchanged(fontReject);
  await run(satSetup);await unchanged(satReject);await run(patternSetup);await unchanged(satReject);
  await run(clearMode);await unchanged(missing);
  await run(resumeSetup);await run(resume,1);assert.deepEqual(await cursor(),[105,106]);assert.equal(await num('peek 0xc006'),1);
  await run(resumeNext,2);assert.deepEqual(await cursor(),[105,106]);assert.equal(await num('peek 0xc006'),2);
  await run(grp);assert.deepEqual(await cursor(),[28,40]);
  console.log('PASS: STEP/native drawing/GRP position, wrap/rounding, single evaluation/USR, atomic errors/ERL/RESUME, font/SAT protection and BASIC data');
} finally {await msx.stop();}
