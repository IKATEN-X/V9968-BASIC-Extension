import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { OpenMsx } from '../tools/openmsx.mjs';

const machine=process.argv.includes('V9968_Basic')?'V9968_Basic':'Panasonic_FS-A1ST(V9968)';
const copiesOnly=process.argv.includes('--copies-only');
const cases=[],add=(code,error=0)=>{cases.push({code,error});return cases.length;};
const modes=[0,1,2,3,4,5,6,7,8,10,11,12];
const setup=modes.map(m=>add(`SCREEN ${m}:VDP(22)=0:_V9968:_PATTERN OFF`));
const flat=[5,6,7,8].map(m=>add(`_SCREEN(${m},,,,,4)`));
const on=Array.from({length:8},(_,p)=>add(`_PATTERN ON(${p})`));
const off=add('_PATTERN OFF'),stable=add('_WAIT VDP');
const draw=add('_CLS(0):_LINE(0,0)-(31,31),14,BF:_LINE(0,0)-(31,31),3,B:_LINE(31,31)-(0,0),5:_PSET(255,255),15');
const edge=add('_PSET(255,255),15');
const fills=Array.from({length:8},(_,p)=>add(`_PATTERN ON(${p}):_CLS(${p}):_PSET(${p},255),15`));
const native6=add('PSET(400,100),2:_WAIT VDP'),normal6=add('_PSET(401,100),3:_WAIT VDP');
const native8=add('PSET(200,100),231:_WAIT VDP');
const source=add('_PATTERN ON(7):_CLS(0):FOR C=0 TO 15:_LINE(C,32)-(C,47),C:NEXT');
const reset=add('_PATTERN ON(5):FOR C=0 TO 31:_LINE(64,64+C)-(95,64+C),C AND 15:NEXT');
const ops=[['PSET',0],['AND',1],['OR',2],['XOR',3],['PRESET',4],['TPSET',8],['TAND',9],['TOR',10],['TXOR',11],['TPRESET',12]];
const variants=[
  {size:16,c:1,s:0,k:1,tail:op=>`,5,${op}`},
  {size:32,c:0,s:1,k:1,tail:op=>`-(95,95),5,${op},90`},
  {size:32,c:1,s:0,k:2,tail:op=>`-(95,95),5,${op},,.5`},
  {size:32,c:0,s:1,k:2,tail:op=>`-(95,95),5,${op},90,.5`}
];
const matrix=variants.map(v=>ops.map(([op])=>add(`_COPY(0,32)-(15,47),7 TO(64,64)${v.tail(op)}`)));
const inplace=add('_COPY(0,32)-(15,47),7 TO(3,35),7');
const disjoint=add('_COPY(0,32)-(15,47),7 TO(64,64)-(95,95),7,TPSET,90');
const full=add('_COPY(0,0)-(255,255),7 TO(0,0),4:_COPY(0,0)-(255,255),4 TO(0,0),3');
const invalid=[
  ['_PATTERN ON(8)',5],['_PATTERN ON(-1)',5],['_PATTERN ON(256)',5],['_PATTERN ON("X")',13],
  ['_PATTERN ON(1/0)',11],['_PATTERN ON(7) XYZ',2],['_PATTERN OFF(7)',2],['_PATTERN ON()',2],
  ['_PSET(256,0),1',5],['_PSET(0,256),1',5],['_PSET(-1,0),1',5],['_PSET(0,-1),1',5],
  ['_PSET(0,0),16',5],['_CLS(255)',5],['_LINE(0,0)-(256,1),1,BF',5],
  ['_COPY(0,0)-(15,15),7 TO(250,0),5',5],['_COPY(0,0)-(15,15),7 TO(0,250),5',5],
  ['_COPY(0,0)-(15,15),8 TO(0,0),0',5],['_COPY(0,0)-(15,15),7 TO(0,0),8',5],
  ['_COPY(0,32)-(15,47),7 TO(0,32),7,,90',5],
  ['_COPY(0,0)-(15,15),7 TO(0,0),5,PSET,TPSET',2]
].map(([code,error])=>add(code,error));
const defaults=add('POKE &HF3E9,254:POKE &HF3EA,253:_CLS:_PSET(0,0):_LINE(2,2)-(3,3),14,BF');
const once=add('DEFUSR=&HC100:POKE &HC010,0:_PATTERN ON(USR(7)):_PSET(USR(254),USR(254)),USR(15)');
const invalidOnce=add('POKE &HC010,0:_PATTERN ON(USR(8))',5);
const gc=add('DIM QD$(7):FOR J=0 TO 127:QD$(J AND 7)=STRING$(32,65+(J AND 7)):NEXT:J=FRE(""):B=0:FOR J=0 TO 7:B=B+(QD$(J)=STRING$(32,65+J)):NEXT:POKE &HC030,-B');
const recoverSetup=add('X%=8');
const resume=add('_PATTERN ON(X%):POKE &HC006,1',5),next=add('_PATTERN ON(8):POKE &HC006,2',5);
const missing=add('_PATTERN ON(7)',7),lowMemory=add('_PATTERN ON(6)',7);
const compatCommands=add('VDP(22)=VDP(22) OR 1'),compatVram=add('VDP(22)=VDP(22) OR 1'),noExtras=add('VDP(21)=0');
const deniedOn=add('_PATTERN ON(7)',5),deniedDraw=add('_PSET(0,0),1',5);
const font=add('_SCREEN(5):_PATTERN ON(7):_FONT(1)');
const sat=add('_SCREEN(5):_SPRITE(3):_PATTERN ON(7)');
const switches=[add('SCREEN 6:_V9968'),add('SCREEN 7:_V9968'),add('SCREEN 8:_V9968'),add('SCREEN 12:_V9968')];
const fontBad=add('_PSET(0,236),1',5),satBad=add('_PSET(0,252),1',5);
const reservedCopy=add('_COPY(0,0)-(15,15),7 TO(0,240),6',5);
const clear=add('_CLS(2)'),partial=add('_SCREEN(,,0)'),page=add('_SET PAGE(0,1)');
const end=add('_PATTERN ON(7):END');
assert.ok(cases.length<256);

const msx=new OpenMsx({rom:'dist/v9968-basic.rom',machine});
const num=async c=>Number(await msx.command(c));
const bytes=async(d,a,n)=>Buffer.from(await msx.command(`binary encode hex [debug read_block {${d}} ${a} ${n}]`),'hex');
const vram=()=>bytes('physical VRAM',0,262144);
function pixel(data,x,y,p) {return (data[p*32768+y*128+(x>>1)]>>((1-(x&1))*4))&15;}
function put(data,x,y,p,c) {const a=p*32768+y*128+(x>>1),s=(1-(x&1))*4;data[a]=(data[a]&~(15<<s))|(c<<s);}
function logic(op,s,d) {return op&8 && !s?d:[s,s&d,s|d,s^d,s^15][op&7];}
let work;
async function run(n,recover=0) {
  await msx.command(`set ::pt_busy 0; set ::pt_copies 0; poke 0xc001 0; poke 0xc003 0; poke 0xc005 ${recover}; poke 0xc006 0; poke 0xc000 ${n}`);
  for(let i=0;i<200 && !await num('peek 0xc001');i++) await msx.advance(.1);
  assert.equal(await num('peek 0xc001'),1,`Timeout ${cases[n-1].code}`);
  assert.equal(await num('peek 0xc003'),cases[n-1].error,cases[n-1].code);
  if(cases[n-1].error) assert.equal(await num('peek16 0xc008'),1000+(n-1)*100,'ERL');
  assert.equal(await num('peek 0xc00a'),0,'BASIC data intact');
  assert.equal(await num('set ::pt_busy'),0,'Synchronous FG4/COPY return and restored ARG/S#0');
}
async function state() {return {vram:await vram(),regs:await bytes('VDP regs',0,59),ram:await bytes('memory',work,32),
  hooks:await bytes('memory',0xfee4,5),slot:await bytes('memory',0xfd29,8),pages:await bytes('memory',0xfaf5,2),
  shadow:await bytes('memory',0xffe7,22),legacy:await bytes('memory',0xf3df,15),logop:await num('peek 0xfb02')};}
async function rejected(n) {const before=await state();await run(n);assert.deepEqual(await state(),before,cases[n-1].code);}
async function pattern(value) {assert.equal(await num(`peek ${work+31}`),value,'Persistent pattern state');}
try {
  await msx.command('set throttle on; set speed 400');await msx.advance(16);
  assert.equal(await msx.command('get_active_cpu'),machine==='V9968_Basic'?'z80':'r800');
  work=(await num('peek16 0xfd2f'))&0xfffe;await pattern(0);
  const map=await readFile('build/v9968-basic.map','ascii');
  const sym=name=>parseInt(new RegExp(`\\b${name}\\s*= \\$([0-9A-F]+)`,'i').exec(map)[1],16);
  await msx.command(`set ::pt_inject -1; set ::pt_saved_heap 0; set ::pt_oom 0
    debug set_bp ${sym('restore_text')} {[pc_in_slot 1]} {
      if {([debug read memory [expr {[reg IX]+13}]] & 128) || [peek16 0xfd89] == 0x4f43} {
        set ::pt_busy [expr {$::pt_busy | ([debug read {VDP status regs} 2] & 1) | [debug read {VDP regs} 15] | ([debug read {VDP regs} 45] & 128)}]
      }
      if {[peek16 0xfd89] == 0x4f43} {incr ::pt_copies}
    }
    debug set_bp ${sym('call_stack_check')} {[pc_in_slot 1] && $::pt_inject >= 0} {
      set ::pt_saved_heap [peek16 0xf6c6]; poke16 0xf6c6 [expr {[reg SP]-$::pt_inject}]; set ::pt_inject -1
    }
    debug set_bp ${sym('call_frame_allocate')} {[pc_in_slot 1] && $::pt_saved_heap != 0} {
      poke16 0xf6c6 $::pt_saved_heap; set ::pt_saved_heap 0
    }
    debug set_bp ${sym('out_of_memory')} {[pc_in_slot 1] && $::pt_saved_heap != 0} {
      incr ::pt_oom; poke16 0xf6c6 $::pt_saved_heap; set ::pt_saved_heap 0
    }
    debug write_block memory 0xc100 [binary format H* 2110c034c9]
    poke 0xc000 0; poke 0xc002 0; poke 0xc00a 0; set ::pt_busy 0; set ::pt_copies 0`);
  const program=['1 CLEAR 512,&HBFFF:DEFINT A-Z:ON ERROR GOTO 30000',
    '2 QA=12345:DIM QB(2):QB(0)=-123:QB(2)=456:QC$=STRING$(64,65)',
    '10 _SCREEN(6):POKE &HC002,1','20 IF PEEK(&HC000)=0 THEN 20','30 A=PEEK(&HC000):POKE &HC000,0'];
  for(let i=0;i<cases.length;i+=16) program.push(`${40+i/16} IF A>${i} AND A<=${i+16} THEN ON A-${i} GOSUB ${cases.slice(i,i+16).map((_,j)=>1000+(i+j)*100).join(',')}`);
  program.push('200 IF QA<>12345 OR QB(0)<>-123 OR QB(2)<>456 OR QC$<>STRING$(64,65) THEN POKE &HC00A,1',
    '210 POKE &HC001,1:GOTO 20','30000 POKE &HC003,ERR:POKE &HC008,ERL MOD 256:POKE &HC009,ERL\\256',
    '30010 IF PEEK(&HC005)=1 THEN X%=7:RESUME','30020 IF PEEK(&HC005)=2 THEN RESUME NEXT','30030 RESUME 200');
  cases.forEach(({code},i)=>program.push(`${1000+i*100} ${code}`,`${1010+i*100} RETURN`));
  assert.ok(program.every(l=>l.length<255));
  await msx.type(program.join('\r')+'\rRUN\r');
  for(let i=0;i<200 && !await num('peek 0xc002');i++) await msx.advance(.1);
  assert.equal(await num('peek 0xc002'),1,'Harness start');
  if(!copiesOnly) {
  for(const [i,c] of [...setup,...flat].entries()) {
    await run(c);await run(on[7]);const before=await state();await run(on[7]);assert.deepEqual(await state(),before,'Repeated ON');
    await run(draw);const data=await vram();
    for(let y=0;y<256;y++) for(let x=0;x<256;x++) {
      let color=0;if(x<32 && y<32)color=x===y?5:(x===0||x===31||y===0||y===31)?3:14;
      if(x===255 && y===255)color=15;
      assert.equal(pixel(data,x,y,7),color,`Case ${i} (${x},${y})`);
    }
    assert.deepEqual(data.subarray(0,7*32768),before.vram.subarray(0,7*32768),'Other VRAM unchanged');
    assert.deepEqual(await bytes('memory',0xfaf5,2),before.pages,'Native pages unchanged');
    assert.equal(await num('debug read {VDP regs} 45'),0);
    await run(off);await pattern(0);const disabled=await state();await run(off);assert.deepEqual(await state(),disabled);
  }
  console.log(`PASS [${machine}]: SCREEN 0..8/10..12 and FIL 5..8, physical FG4 pixels, repeated ON/OFF, native page and VRAM isolation`);
  await run(setup[modes.indexOf(8)]);for(const c of fills)await run(c);
  let data=await vram();for(let p=0;p<8;p++){const expected=Buffer.alloc(32768,p*17);put(expected,p,255,0,15);assert.deepEqual(data.subarray(p*32768,(p+1)*32768),expected);}
  await run(on[0]);await pattern(128);await run(on[7]);await pattern(135);
  await run(defaults);data=await vram();assert.equal(pixel(data,0,0,7),14);assert.equal(pixel(data,255,255,7),13);
  await run(native8);data=await vram();const nativeAddress=(100*256+200);assert.equal(data[(nativeAddress>>1)|((nativeAddress&1)<<16)],231);
  await run(setup[modes.indexOf(6)]);await run(on[7]);await run(draw);await run(native6);data=await vram();assert.equal((data[100*128+100]>>6)&3,2);
  await run(off);await run(normal6);data=await vram();assert.equal((data[100*128+100]>>4)&3,3);
  }
  for(const [screen,init] of [[6,setup[6]],[8,setup[8]],[12,setup[11]],['7 FIL',flat[2]]]) {
    await run(init);assert.equal((await num('debug read {VDP regs} 21'))&64,screen==='7 FIL'?64:0);
    await run(source);
    for(let vi=0;vi<variants.length;vi++)for(let oi=0;oi<ops.length;oi++) {
      await run(reset);const before=await vram(),expected=Buffer.from(before),v=variants[vi],op=ops[oi][1];
      for(let y=0;y<v.size;y++)for(let x=0;x<v.size;x++){
        const sx=8+v.k*(v.c*(x-v.size/2)+v.s*(y-v.size/2)),sy=8+v.k*(-v.s*(x-v.size/2)+v.c*(y-v.size/2));
        const s=sx>=0&&sx<16&&sy>=0&&sy<16?sx:0;
        put(expected,64+x,64+y,5,logic(op,s,y&15));
      }
      await run(matrix[vi][oi]);assert.deepEqual(await vram(),expected,`SC${screen} variant${vi} ${ops[oi][0]}`);assert.equal(await num('set ::pt_copies'),1);
    }
    await run(source);const before=await vram(),expected=Buffer.from(before);
    for(let y=0;y<16;y++)for(let x=0;x<16;x++)put(expected,x+3,y+35,7,pixel(before,x,y+32,7));
    await run(inplace);assert.deepEqual(await vram(),expected,'In-place LMMM preserves FG4');
    await run(disjoint);await run(full);assert.equal(await num('set ::pt_copies'),2);const data=await vram();
    assert.deepEqual(data.subarray(3*32768,4*32768),data.subarray(7*32768));
    assert.deepEqual(data.subarray(4*32768,5*32768),data.subarray(7*32768));
    console.log(`PASS: SCREEN ${screen} FG4 logical/transform/overlap/chained-copy matrix`);
  }
  console.log('PASS: ten logical operations/all 16x16 colors, normal/FIL transforms, overlap and synchronous chained FG4 COPY');
  if(!copiesOnly) {
  await run(flat[3]);await run(on[7]);await run(stable);for(const c of invalid)await rejected(c);
  await run(once);assert.equal(await num('peek 0xc010'),4);await run(invalidOnce);assert.equal(await num('peek 0xc010'),1);await pattern(135);
  await run(gc);await pattern(135);assert.equal(await num('peek 0xc030'),8,'Array strings survive GC');
  await run(recoverSetup);await run(resume,1);assert.equal(await num('peek 0xc006'),1);await run(next,2);assert.equal(await num('peek 0xc006'),2);
  const ptr=await num('peek16 0xfd2f');await msx.command('poke16 0xfd2f 1');await rejected(missing);await run(off);await msx.command(`poke16 0xfd2f ${ptr}`);
  for(const size of [511,512]) {await msx.command(`set ::pt_inject ${size}`);await rejected(lowMemory);}
  await msx.command('set ::pt_inject 513');await run(on[6]);assert.equal(await num('set ::pt_oom'),2);await run(on[7]);
  for(const c of [compatCommands,compatVram]) {await run(c);await rejected(deniedOn);await rejected(deniedDraw);await run(off);await pattern(0);await run(setup[8]);await run(on[7]);}
  await run(noExtras);await run(edge);await pattern(135);
  await run(setup[6]);await run(on[7]);await run(partial);await pattern(135);await run(page);await pattern(135);
  for(const [init,bad,top,address,size] of [[font,fontBad,236,0x37600,2048],[sat,satBad,252,0x37e00,512]]) {
    await run(init);await pattern(135);const reserved=await bytes('physical VRAM',address,size);
    for(const sw of switches){await run(sw);await run(on[6]);await rejected(bad);if(top===236)await rejected(reservedCopy);await run(clear);assert.deepEqual(await bytes('physical VRAM',address,size),reserved);const data=await vram();assert.equal(pixel(data,0,top-1,6),2);}
  }
  console.log('PASS: ERR/ERL/RESUME, type/syntax/range/state failures, one evaluation, stack preflight boundaries, font/SAT protection and first-font-install coexistence');
  await msx.command(`poke 0xc000 ${end}`);await msx.advance(1);await pattern(135);
  for(const statement of ['CLEAR','MAXFILES=2','NEW']) {
    await msx.type('_PATTERN ON(7)\r');await msx.advance(.3);await pattern(135);
    await msx.type(statement+'\r');await msx.advance(.5);await pattern(statement==='MAXFILES=2'?135:0);
    assert.equal((await num('peek16 0xfd2f'))&0xfffe,work,'Reservation idempotent');
  }
  await msx.type(`10 POKE &HC020,PEEK(${work+31})\r20 END\r_PATTERN ON(7)\rRUN\r`);await msx.advance(.5);
  await pattern(0);assert.equal(await num('peek 0xc020'),0,'RUN clears before first statement');
  await msx.type('_PATTERN ON(7)\r');await msx.advance(.3);await pattern(135);
  await msx.type('_SCREEN(5)\r');await msx.advance(.5);await pattern(0);
  console.log('PASS: CLEAR/NEW/RUN/full SCREEN reset, MAXFILES preservation and unchanged 32-byte reservation');
  }
} finally {await msx.stop();}
