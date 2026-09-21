import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { OpenMsx } from '../tools/openmsx.mjs';

const machine = process.argv.includes('V9968_Basic') ? 'V9968_Basic' : 'Panasonic_FS-A1ST(V9968)';
const trace = process.argv.includes('--trace');
const speed = Number(process.argv.find(a=>a.startsWith('--speed='))?.split('=')[1]??100);
const cases = [];
const add = (code, error = 0) => (cases.push({code, error}), cases.length);
const shapes = [
  {r:30, tail:',1', aspect:null},
  {r:30, tail:',1,,,1', aspect:1},
  {r:30, tail:',1,,,.5', aspect:.5},
  {r:30, tail:',1,,,2', aspect:2},
  {r:30, tail:',1,0,1.5707963267949,1', aspect:1, start:0, end:Math.PI/2},
  {r:30, tail:',1,5,1,1', aspect:1, start:5, end:1},
  {r:30, tail:',1,0,0,1', aspect:1, start:0, end:0},
  {r:30, tail:',1,-.5,-2,1', aspect:1, start:.5, end:2, rays:true},
  {r:0, tail:',1,,,1', aspect:1},
  {r:1, tail:',1,,,1', aspect:1},
];
const native = [5,6,7,8].map(s => shapes.map(v => add(`SCREEN ${s}:COLOR 1,0,0:CLS:CIRCLE(100,100),${v.r}${v.tail}`)));
const extended = [5,6,7,8].map(s => shapes.map(v => add(`_SCREEN(${s}):_CLS(0):_CIRCLE(100,100),${v.r}${v.tail}:_WAIT VDP`)));
const pageCases = [];
for (const s of [5,6,7,8]) for (const fil of [false,true]) {
  const page = s < 7 ? (fil ? 3 : 7) : (fil ? 1 : 3);
  const x = s === 6 || s === 7 ? 400 : 200, y = fil ? 400 : 240;
  pageCases.push({s,fil,page,x,y, n:add(`_SCREEN(${s}${fil?',,,,,4':''}):_SET PAGE(0,${page}):_CLS(0):_CIRCLE(${x},${y}),30,${s===6?3:s===8?231:14},,,1:_WAIT VDP`)});
}
const patternModes = [0,1,2,3,4,5,6,7,8,10,11,12];
const patterns = patternModes.map(s=>add(`SCREEN ${s}:VDP(22)=0:_V9968:_PATTERN ON(7):_CLS(0):_CIRCLE(128,128),50,14`));
const setup = add('_SCREEN(5):_CLS(0)');
const blank = add('_CLS(0):_WAIT VDP');
const clipped = add('_CIRCLE(0,0),30,1,,,1:_WAIT VDP');
const radiusLarge = add('_CIRCLE(0,0),32767,1,,,1:_WAIT VDP');
const fractional = add('_CIRCLE(100,100),30.4,1,,,1:_WAIT VDP');
const omitted = add('POKE &HF3E9,15:_CIRCLE(100,100),30,,,,:_WAIT VDP');
const subsequent = add('_CIRCLE(10,10),3,1:_WAIT VDP');
const invalid = [
  ['_CIRCLE(-32769,0),10',6],['_CIRCLE(32768,0),10',6],['_CIRCLE(0,32768),10',6],
  ['_CIRCLE(10,10),-1',5],['_CIRCLE(10,10),32768',5],['_CIRCLE(10,10),100000',6],['_CIRCLE(10,10),10,16',5],
  ['_CIRCLE(10,10),10,1,6.29',5],['_CIRCLE(10,10),10,1,0,-7',5],
  ['_CIRCLE(10,10),10,1,,,0',5],['_CIRCLE(10,10),10,1,,,-1',5],
  ['_CIRCLE(10,10),10,1,,,1,0',2],['_CIRCLE(10,10),10,1,(',24],
  ['_CIRCLE(10,10),"X"',13],['_CIRCLE(10,10),10,1,"X"',13],
  ['_CIRCLE(10,10),10,1,,,"X"',13],['_CIRCLE(10,10),10,1,1/0',11],
  ['_CIRCLE(10,10),10,1,,,1/0',11],['_CIRCLE(10,10)',2],
  ['_CIRCLE(10,10),',24],['_CIRCLE(10,10),10 XYZ',2]
].map(([c,e])=>add(c,e));
const screenBad = [0,1,4,10,11,12].map(s=>[add(`SCREEN ${s}:VDP(22)=0:_V9968`),add('_CIRCLE(10,10),2',5)]);
const extensionsBad = [81,49].map(v=>[add(`_SCREEN(5):VDP(21)=${v}`),add('_CIRCLE(10,10),2',5)]);
const font = add('_SCREEN(5):_FONT(1):_SET PAGE(0,6)');
const fontBad = add('_CIRCLE(100,230),10,1,,,1',5);
const fontGood = add('_CIRCLE(100,225),10,1,,,1:_WAIT VDP');
const sat = add('_SCREEN(5):_SPRITE(3):_SET PAGE(0,6)');
const satBad = add('_CIRCLE(100,246),10,1,,,1',5);
const planar = add('SCREEN 7:_V9968:_SET PAGE(0,2)');
const rawFil = add('VDP(22)=64');
const patternReserved = add('_PATTERN ON(6)');
const once = add('DEFUSR=&HC100:POKE &HC010,0:_CIRCLE(USR(100),USR(100)),USR(20),USR(1),USR(0),USR(6),USR(1):_WAIT VDP');
const onceBad = add('POKE &HC010,0:_CIRCLE(100,100),10,1,,,USR(0)',5);
const resumeSetup = add('RR%=-1');
const resume = add('_CIRCLE(20,20),RR%:POKE &HC006,1',5);
const resumeNext = add('_CIRCLE(20,20),-1:POKE &HC006,2',5);
const gc = add('DIM QD$(7):FOR J=0 TO 127:QD$(J AND 7)=STRING$(32,65+(J AND 7)):NEXT:J=FRE(""):B=0:FOR J=0 TO 7:B=B+(QD$(J)=STRING$(32,65+J)):NEXT:POKE &HC030,-B');
const arcs = [
  [.3,4.5],[4,2],[0,Math.PI*2],[Math.PI,0],[Math.PI*2,0],
  [.0001,.0002],[1,1.0001],[3,3.1415926535898],
  [.00001,.00002],[1.5708,1.57081],[3.14159,3.14160],[4.71239,4.71240],
  [6.28318,.00001],[.00002,.00001]
].map(([s,e])=>({s,e,n:add(`_CLS(0):_CIRCLE(100,100),80,1,${s},${e},1:_WAIT VDP`)}));
const flatDefaults = [5,6,7,8].map(s=>({s,n:add(`_SCREEN(${s},,,,,4):_CLS(0):_CIRCLE(120,330),40,1:_WAIT VDP`)}));
const patternFlat = add('_SCREEN(7,,,,,4):_SET PAGE(0,1):_PATTERN ON(7):_CLS(0):_CIRCLE(128,128),50,14');
const largeVisible = add('_SCREEN(5):_CLS(0):_CIRCLE(0,0),32767,1,,,1000:_WAIT VDP');
const noHs = add('_SCREEN(5):VDP(21)=112:_CIRCLE(100,100),30,1,,,1:_WAIT VDP');
const fgError = add('_PATTERN ON(7):_CIRCLE(100,100),20,16',5);
const badFilPage = add('_SCREEN(7,,,,,4):SET PAGE 0,1');
const deniedFilPage = add('_CIRCLE(100,100),20',5);
const lowStack = add('_CIRCLE(100,100),20',7);
const explicitAspect = add('_SCREEN(5):_CLS(0):POKE &HF40D,0:POKE &HF40E,0:_CIRCLE(100,100),30,1,,,1:_WAIT VDP');
const longRay = add('_SCREEN(5):_CLS(0):_CIRCLE(128,128),32767,1,-1.5707963267949,-1.5707963267949,1:_WAIT VDP');
const mutatedModes = [
  [add('_SCREEN(5,,,,,4):DEFUSR1=&HC120'),add('_CIRCLE(100,300),10,1,,,USR1(1)',5)],
  [add('_SCREEN(6):DEFUSR1=&HC130'),add('_CIRCLE(400,100),10,1,,,USR1(1)',5)],
  [add('_SCREEN(5):DEFUSR1=&HC140'),add('_CIRCLE(100,100),10,15,,,USR1(1)',5)]
];
const octantArcs=[];
for(let oct=0;oct<8;oct++)for(const sweep of [.15,2,5.9]) {
  const s=oct*Math.PI/4+.03,e=(s+sweep)%(Math.PI*2),a=sweep===2?2:.5;
  octantArcs.push({s,e,a,n:add(`_CLS(0):_CIRCLE(120,120),60,1,${s},${e},${a}:_WAIT VDP`)});
}
assert.ok(cases.length < 256);

const msx = new OpenMsx({rom:'dist/v9968-basic.rom',machine});
const num = async s=>Number(await msx.command(s));
const bytes = async(d,a,n)=>Buffer.from(await msx.command(`binary encode hex [debug read_block {${d}} ${a} ${n}]`),'hex');
const vram = ()=>bytes('physical VRAM',0,262144);
let work;
async function run(n,recover=0) {
  if(trace)console.log(n,cases[n-1].code);
  await msx.command(`set ::ci_bad 0; poke 0xc001 0; poke 0xc003 0; poke 0xc005 ${recover}; poke 0xc006 0; poke 0xc000 ${n}`);
  // Native screen/slot transitions can transiently read FF, not our ready byte.
  for(let i=0;i<500 && await num('peek 0xc001')!==1;i++)await msx.advance(.1);
  if(await num('peek 0xc001')!==1){console.log('FAIL STATE',await msx.command('list [reg PC] [reg SP] [reg IX] [peek 0xc003] [peek16 0xc008] [peek 0xc000] [peek 0xc001] [peek 0xc00a]'));console.log(await msx.screen().catch(e=>e.message));}
  assert.equal(await num('peek 0xc001'),1,`Timeout: ${cases[n-1].code}`);
  assert.equal(await num('peek 0xc003'),cases[n-1].error,cases[n-1].code);
  if(cases[n-1].error)assert.equal(await num('peek16 0xc008'),1000+(n-1)*100,'ERL');
  assert.equal(await num('peek 0xc00a'),0,'BASIC scalar, array, string sentinels');
  assert.equal(await num('set ::ci_bad'),0,'FG4 completion, cleared R45 and restored S0 at return');
}
async function state() {
  const spans=[['physical VRAM',0,262144],['VDP regs',0,59],['memory',work,32],['memory',0xfaf5,2],
    ['memory',0xffe7,22],['memory',0xfb02,1],['memory',0xfee4,5],['memory',0xfd29,8],['memory',0xfcb7,4]];
  return Buffer.from(await msx.command(`binary encode hex "${spans.map(([d,a,n])=>`[debug read_block {${d}} ${a} ${n}]`).join('')}"`),'hex');
}
async function rejected(n) {const before=await state();await run(n);assert.deepEqual(await state(),before,cases[n-1].code);}
function pixels(data,s,page=0,fil=false) {
  const width=s===6||s===7?512:256, height=fil?512:256, ppb=s===6?4:s===8?1:2;
  const base=page*(s<7?32768:65536)*(fil?2:1), result=new Set();
  for(let y=0;y<height;y++)for(let x=0;x<width;x++) {
    let a=base+y*(width/ppb)+Math.floor(x/ppb);
    if(s>=7)a=((a&0x1ffff)>>1)|((a&1)<<16)|(a&0x20000);
    const c=(data[a]>>((ppb-1-x%ppb)*(8/ppb)))&((1<<(8/ppb))-1);
    if(c)result.add(`${x},${y}`);
  }
  return result;
}
function midpoint(cx,cy,r,aspect,width=256,height=256) {
  const result=new Set(),fx=aspect>1?1/aspect:1,fy=aspect>1?1:aspect;
  let x=0,y=r,d=1-r;
  const round=v=>Math.sign(v)*Math.round(Math.abs(v));
  while(x<=y){for(const [px,py] of [[y,x],[x,y],[-x,y],[-y,x],[-y,-x],[-x,-y],[x,-y],[y,-x]]) {
    const xx=cx+round(px*fx),yy=cy-round(py*fy);
    if(xx>=0&&xx<width&&yy>=0&&yy<height)result.add(`${xx},${yy}`);
  }x++;if(d<0)d+=2*x+1;else{y--;d+=2*(x-y)+1}}
  return result;
}
function near(reference,result,label,tolerance=1) {
  for(const p of reference){const [x,y]=p.split(',').map(Number);let found=false;
    for(let dy=-tolerance;dy<=tolerance;dy++)for(let dx=-tolerance;dx<=tolerance;dx++)if(result.has(`${x+dx},${y+dy}`))found=true;
    assert.ok(found,`${label}: missing near ${p}`);
  }
}
function q14Arc(s,e,a) {
  const round=v=>Math.sign(v)*Math.round(Math.abs(v));
  const dir=t=>[Math.round(Math.cos(t)*16384),Math.round(Math.sin(t)*16384)];
  const [sx,sy]=dir(s),[ex,ey]=dir(e),major=(e-s+Math.PI*2)%(Math.PI*2)>Math.PI;
  const fx=a>1?1/a:1,fy=a>1?1:a,result=new Set();
  const plot=(x,y)=>result.add(`${120+round(x*fx)},${120-round(y*fy)}`);
  // Direct cross products form an independent oracle for incremental octants.
  for(const p of midpoint(0,0,60,1,256,256)) {
    const [x,y]=p.split(',').map(Number);
    for(const [px,py] of [[x,y],[-x,y],[-x,-y],[x,-y]]) {
      const start=sx*py-sy*px>=0,end=ex*py-ey*px<=0;
      if(major?start||end:start&&end)plot(px,py);
    }
  }
  for(const t of [s,e]){const [x,y]=dir(t);plot(round(60*x/16384),round(60*y/16384));}
  return result;
}
try {
  await msx.command(`set throttle on; set speed ${speed}`);await msx.advance(12);
  work=(await num('peek16 0xfd2f'))&0xfffe;
  const map=await readFile('build/v9968-basic.map','ascii');
  const sym=n=>parseInt(new RegExp(`\\b${n}\\s*= \\$([0-9A-F]+)`,'i').exec(map)[1],16);
  await msx.command(`set ::ci_bad 0; set ::ci_inject -1; set ::ci_heap 0
    debug set_bp ${sym('restore_text')} {[pc_in_slot 1] && [peek16 0xfd89] == 0x4943} {
      set ::ci_bad [expr {$::ci_bad | [debug read {VDP regs} 15]}]
      if {[debug read memory [expr {[reg IX]+13}]] & 128} {
        set ::ci_bad [expr {$::ci_bad | ([debug read {VDP status regs} 2] & 1) | [debug read {VDP regs} 45]}]
      }
    }
    debug write_block memory 0xc100 [binary format H* 2110c034c9]
    debug write_block memory 0xc120 [binary format H* af32f4ff3e0432affcc9]
    debug write_block memory 0xc130 [binary format H* 3e0932affcc9]
    debug write_block memory 0xc140 [binary format H* 3e0632affcc9]
    debug set_bp ${sym('call_stack_check')} {[pc_in_slot 1] && $::ci_inject >= 0} {
      set ::ci_heap [peek16 0xf6c6]; poke16 0xf6c6 [expr {[reg SP]-$::ci_inject}]; set ::ci_inject -1
    }
    debug set_bp ${sym('out_of_memory')} {[pc_in_slot 1] && $::ci_heap != 0} {
      poke16 0xf6c6 $::ci_heap; set ::ci_heap 0
    }
    poke 0xc000 0; poke 0xc002 0; poke 0xc00a 0`);
  const program=['1 CLEAR 512,&HBFFF:ON ERROR GOTO 30000',
    '2 QA%=12345:DIM QB%(2):QB%(0)=-123:QB%(2)=456:QC$=STRING$(64,65)',
    '10 _SCREEN(5):POKE &HC002,1','20 IF PEEK(&HC000)=0 THEN 20','30 A%=PEEK(&HC000):POKE &HC000,0'];
  for(let i=0;i<cases.length;i+=16)program.push(`${40+i/16} IF A%>${i} AND A%<=${i+16} THEN ON A%-${i} GOSUB ${cases.slice(i,i+16).map((_,j)=>1000+(i+j)*100).join(',')}`);
  program.push('200 IF QA%<>12345 OR QB%(0)<>-123 OR QB%(2)<>456 OR QC$<>STRING$(64,65) THEN POKE &HC00A,1',
    '210 POKE &HC001,1:GOTO 20','30000 POKE &HC003,ERR:POKE &HC008,ERL MOD 256:POKE &HC009,ERL\\256',
    '30010 IF PEEK(&HC005)=1 THEN RR%=4:RESUME','30020 IF PEEK(&HC005)=2 THEN RESUME NEXT','30030 RESUME 200');
  cases.forEach(({code},i)=>program.push(`${1000+i*100} ${code}`,`${1010+i*100} RETURN`));
  assert.ok(program.every(l=>l.length<255));
  await msx.type(program.join('\r')+'\rRUN\r');
  for(let i=0;i<200 && await num('peek 0xc002')!==1;i++)await msx.advance(.1);
  assert.equal(await num('peek 0xc002'),1,'Harness start');
  if(!process.argv.includes('--checks-only') && !process.argv.includes('--errors-only')) {
  for(const [si,s] of [5,6,7,8].entries())for(const [vi,v] of shapes.entries()) {
    await run(native[si][vi]);const ref=new Set([...pixels(await vram(),s)].filter(p=>Number(p.split(',')[1])<212));
    await run(extended[si][vi]);const result=pixels(await vram(),s);
    const aspect=v.aspect??(s===6||s===7?.5:1);
    if(v.start===undefined)assert.deepEqual(result,midpoint(100,100,v.r,aspect,s===6||s===7?512:256),`SC${s} shape ${vi}`);
    if(trace)console.log('counts',s,vi,ref.size,result.size);
    const tolerance=v.start===undefined?1:2;
    near(ref,result,`SC${s} native shape${vi}`,tolerance);near(result,ref,`SC${s} extension shape${vi}`,tolerance);
  }
  console.log(`PASS [${machine}]: circles, ellipses, radians/arcs/wrap/radii, default aspect, radius 0/1, native geometry (1px outline / 2px arc endpoint tolerance)`);
  for(const v of pageCases){await run(v.n);const data=await vram();assert.deepEqual(pixels(data,v.s,v.page,v.fil),midpoint(v.x,v.y,30,1,v.s===6||v.s===7?512:256,v.fil?512:256));
    if(v.s===8){const a=(v.page*(v.fil?512:256)+v.y)*256+v.x+30;assert.equal(data[((a&0x1ffff)>>1)|((a&1)<<16)|(a&0x20000)],231,'SCREEN 8 full-byte color');}
  }
  console.log('PASS: SCREEN 5..8 normal/FIL, high pages, 9-bit X/Y and clipping');
  }
  if(!process.argv.includes('--errors-only')) {
  // Include transition out of FIL before exercising native text-mode drawing.
  await run(pageCases.at(-1).n);
  for(const n of patterns){await run(n);assert.deepEqual(pixels(await vram(),5,7),midpoint(128,128,50,1));}
  await run(patternFlat);assert.deepEqual(pixels(await vram(),5,7),midpoint(128,128,50,1));
  console.log('PASS: physical 4bpp PATTERN in SCREEN 0..8 and 10..12, synchronous cleanup');
  await run(setup);await run(clipped);assert.deepEqual(pixels(await vram(),5),midpoint(0,0,30,1));
  await run(blank);await run(radiusLarge);assert.equal(pixels(await vram(),5).size,0);
  await run(fractional);assert.deepEqual(pixels(await vram(),5),midpoint(100,100,30,1));
  await run(blank);await run(omitted);assert.deepEqual(pixels(await vram(),5),midpoint(100,100,30,1));
  const outline=midpoint(100,100,80,1);
  for(const a of arcs){await run(a.n);const result=pixels(await vram(),5),s=Math.abs(a.s),e=Math.abs(a.e),span=e>=s?e-s:e-s+Math.PI*2;
    const expect=new Set([...outline].filter(p=>{const [x,y]=p.split(',').map(Number);const angle=(Math.atan2(100-y,x-100)+Math.PI*2)%(Math.PI*2);return ((angle-s+Math.PI*2)%(Math.PI*2))<=span+1e-10;}));
    for(const angle of [s,e])expect.add(`${100+Math.round(80*Math.cos(angle))},${100-Math.round(80*Math.sin(angle))}`);
    near(expect,result,`Arc ${s},${e}`);near(result,expect,`Arc extras ${s},${e}`);
  }
  for(const a of octantArcs){await run(a.n);assert.deepEqual(pixels(await vram(),5),q14Arc(a.s,a.e,a.a),`Q14 octants ${a.s},${a.e},${a.a}`);}
  console.log('PASS: exact Q14 cross-product oracle, all eight octants, minor/major/wrapped elliptical arcs');
  for(const v of flatDefaults){await run(v.n);assert.deepEqual(pixels(await vram(),v.s,0,true),midpoint(120,330,40,v.s===6||v.s===7?1:2,v.s===6||v.s===7?512:256,512));}
  // Q14 rounds 1/1000 to 16/16384 = 1/1024.
  await run(largeVisible);assert.deepEqual(pixels(await vram(),5),midpoint(0,0,32767,1024));
  await run(noHs);assert.ok(pixels(await vram(),5).has('130,100'));
  console.log('PASS: independent arc geometry, FIL default aspect, large-radius arithmetic and HS-optional');
  }
  await run(setup);
  for(const n of invalid)await rejected(n);
  for(const [init,n] of [...screenBad,...extensionsBad]){await run(init);await rejected(n);}
  await run(setup);await run(once);assert.equal(await num('peek 0xc010'),7);await rejected(onceBad);assert.equal(await num('peek 0xc010'),1);
  await run(resumeSetup);await run(resume,1);assert.equal(await num('peek 0xc006'),1);
  await run(resumeNext,2);assert.equal(await num('peek 0xc006'),2);await run(subsequent);
  await run(gc);assert.equal(await num('peek 0xc030'),8);await run(subsequent);
  console.log('PASS: validation before mutation, errors/ERL/RESUME, single evaluation, BASIC data and GC');
  await run(font);await rejected(fontBad);await run(fontGood);
  await run(planar);await rejected(fontBad);await run(rawFil);await rejected(fontBad);
  await run(patternReserved);await rejected(fontBad);
  await run(sat);await rejected(satBad);await run(patternReserved);await rejected(satBad);
  await run(setup);await run(fgError);await rejected(invalid[6]);
  await run(badFilPage);await rejected(deniedFilPage);
  await run(setup);await msx.command('set ::ci_inject 512');await rejected(lowStack);await run(subsequent);
  for(const [init,n] of mutatedModes){await run(init);const before=await vram();await run(n);assert.deepEqual(await vram(),before,'USR mode changes revalidated before circle mutation');}
  await run(explicitAspect);assert.deepEqual(pixels(await vram(),5),midpoint(100,100,30,1),'Explicit aspect does not evaluate unused native default');
  await run(longRay);assert.deepEqual(pixels(await vram(),5),new Set(Array.from({length:129},(_,y)=>`128,${y}`)),'Huge radius ray clips at page edge');
  console.log('PASS: font/SAT protection including native screen changes, raw FIL and FG4');
} finally {await msx.stop();}
