import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { OpenMsx } from '../tools/openmsx.mjs';
import { readPalette } from './palette-state.mjs';

const machine=process.argv[2] ?? 'Panasonic_FS-A1ST(V9968)';
const msx=new OpenMsx({rom:'dist/v9968-basic.rom',machine});
const cases=[];
function add(body,error=0) { cases.push({body,error}); return cases.length; }
const writes=add(['FOR N=48 TO 59:_VDP(N)=255:NEXT N']);
const expressions=add(['FOR N=48 TO 59:CALL VDP(N)=N*3-100:NEXT N']);
const invalid=[
  ['_VDP(47)=0',5],['_VDP(60)=0',5],['_VDP(-1)=0',5],['_VDP(256)=0',5],
  ['_VDP(48)=-1',5],['_VDP(48)=256',5],['_VDP(48) 0',2],['_VDP(48)=1,2',2],
  ['_VDP(48)="X"',13],['_VDP(48)=1/0',11],['_VDP(48)=40000',5],['_VDP(48)=1E20*1E20',6]
].map(([code,error])=>add([code],error));
const setup=add(['_SCREEN(5):_CLS(0):_WAIT VDP']);
const disabled=add(['VDP(21)=0']);
const rejected=[
  '_VDP(48)=17','_COLOR=(255,1,2,3)','_PSET(0,0),3','_LINE(0,0)-(5,5),3',
  '_CLS(3)','_COPY(0,0)-(3,3),0 TO(0,0),1','_SET PAGE(1,0)','_FONT(1)','_SPRITE(3)'
].map(code=>add([code],5));
const preserve=add([
  'VDP(21)=&H76:VDP(22)=1',
  '_VDP(48)=0:_COLOR=(255,31,12,7):_PSET(0,0),3:_WAIT VDP',
  '_SPRITE(3):_SPRITE(0):_V9968'
]);
const busy=add([
  'VDP(21)=&H70:VDP(22)=0',
  'FOR N=33 TO 46:VDP(N)=0:NEXT N',
  'VDP(42)=1:VDP(44)=3:VDP(45)=&H33:VDP(47)=&HC0',
  '_VDP(48)=19'
]);
const text=add(['_SCREEN(0):_V9968:_VDP(59)=255']);
const screen8=add([
  '_SCREEN(8):COLOR 255,0,0:CLS',
  'FOR N=0 TO 255:_COLOR=(N,N MOD 32,(N\\8) MOD 32,N\\8):NEXT N',
  'LINE(10,20)-(30,40),200,BF:PSET(60,60),255:_WAIT VDP'
]);
const extended8=add(['_PSET(0,0),193:_WAIT VDP']);
const resume=add(['_VDP(48)=23','POKE &HC006,1'],5);
const resumeNext=add(['_VDP(48)=24','POKE &HC006,2'],5);
const rawCopy=add([
  '_SCREEN(5):_SET PAGE(0,1):_CLS(0):_LINE(0,0)-(15,15),3,BF:_WAIT VDP',
  'FOR N=33 TO 46:VDP(N)=0:NEXT N:FOR N=48 TO 59:_VDP(N)=0:NEXT N',
  'VDP(36)=1:VDP(37)=40:VDP(39)=50:VDP(41)=16:VDP(43)=16',
  '_VDP(49)=1:_VDP(55)=1:_VDP(56)=15:_VDP(58)=15:_VDP(59)=1',
  'VDP(47)=&H30:_WAIT VDP'
]);
const finish=add(['ON ERROR GOTO 0:_SCREEN(0):POKE &HC001,1:END']);
const number=async code=>Number(await msx.command(code));
const masks=Buffer.from([255,255,255,255,255,1,255,7,255,1,255,7]);
const bytes=async (name,start,length)=>Buffer.from(await msx.command(`binary encode hex [debug read_block {${name}} ${start} ${length}]`),'hex');
async function run(index,{recovery=0}={}) {
  await msx.command(`poke 0xc001 0; poke 0xc003 0; poke 0xc005 ${recovery}; poke 0xc006 0; poke 0xc000 ${index}`);
  for(let i=0;i<100 && !await number('peek 0xc001');i++) await msx.advance(0.1);
  if(!await number('peek 0xc001')) console.log('Timeout state [line, PC, SP, ERR, CPU, R20, R21, R46, S2]:',await msx.command('list [peek16 0xf41c] [reg PC] [reg SP] [peek 0xc003] [get_active_cpu] [debug read {VDP regs} 20] [debug read {VDP regs} 21] [debug read {VDP regs} 46] [debug read {VDP status regs} 2]'));
  assert.ok(await number('peek 0xc001'),`Case ${index} timed out: ${cases[index-1].body}`);
  assert.equal(await number('peek 0xc003'),cases[index-1].error,`Case ${index}: ${cases[index-1].body}`);
  if(cases[index-1].error) assert.equal(await number('peek16 0xc008'),1000+(index-1)*100,'ERL must identify the failing statement');
}
async function snapshot() {
  return {
    regs:await bytes('VDP regs',0,59),
    palette:await bytes('VDP palette',0,32),
    vram:await bytes('physical VRAM',0,262144),
    mode:await number('peek16 0xfff3'),
    pages:await number('peek16 0xfaf5')
  };
}
try {
  await msx.advance(12);
  const map=await readFile('build/v9968-basic.map','ascii');
  const address=name=>'0x'+new RegExp(`\\b${name}\\s*= \\$([0-9A-F]+)`,'i').exec(map)[1];
  await msx.command(`set ::raw_writes 0; set ::raw_busy 0; set ::raw_entry_busy 0;
    debug set_bp ${address('cmd_vdp')} {[pc_in_slot 1]} {
      set ::raw_entry_busy [expr {$::raw_entry_busy | ([debug read {VDP status regs} 2] & 1)}]
    };
    debug set_bp ${address('write_reg')} {[pc_in_slot 1] && [reg C] >= 47 && [reg C] <= 58} {
      incr ::raw_writes
      set ::raw_busy [expr {$::raw_busy | ([debug read {VDP status regs} 2] & 1)}]
    }`);
  const program=[
    '1 CLEAR 200,&HBFFF:DEFINT A-Z:ON ERROR GOTO 9000',
    '10 _SCREEN(5)',
    '20 IF PEEK(&HC000)=0 THEN 20',
    '30 A=PEEK(&HC000):POKE &HC000,0',
    `40 ON A GOSUB ${cases.map((_,i)=>1000+i*100).join(',')}`,
    '50 POKE &HC001,1:GOTO 20',
    '9000 POKE &HC003,ERR:POKE &HC008,ERL MOD 256:POKE &HC009,ERL\\256',
    '9010 IF PEEK(&HC005)=1 THEN VDP(21)=&H71:RESUME',
    '9020 IF PEEK(&HC005)=2 THEN RESUME NEXT',
    '9030 POKE &HC001,255:RESUME 20'
  ];
  cases.forEach(({body},i)=>{
    body.forEach((line,j)=>program.push(`${1000+i*100+j*10} ${line}`));
    program.push(`${1000+i*100+body.length*10} RETURN`);
  });
  assert.ok(program.every(line=>line.length<255));
  await msx.type(program.join('\r')+'\rRUN\r');
  await msx.advance(6);
  await run(writes);
  assert.deepEqual(await bytes('VDP regs',47,12),masks);
  await run(expressions);
  assert.deepEqual(await bytes('VDP regs',47,12),Buffer.from(Array.from({length:12},(_,i)=>((48+i)*3-100)&masks[i])));
  for(const index of invalid) {
    const before=await snapshot();
    await run(index);
    assert.deepEqual(await snapshot(),before,'Invalid arguments must not change VDP, VRAM or BASIC shadows');
  }
  await run(setup);
  await run(disabled);
  for(const index of rejected) {
    const before=await snapshot();
    await run(index);
    assert.deepEqual(await snapshot(),before,'Disabled commands must fail without re-enabling or modifying state');
  }
  await run(resume,{recovery:1});
  assert.equal(await number('peek 0xc006'),1);
  assert.equal(await number('debug read {VDP regs} 47'),23);
  await run(disabled);
  await run(resumeNext,{recovery:2});
  assert.equal(await number('peek 0xc006'),2);
  assert.equal(await number('debug read {VDP regs} 47'),23);
  await run(preserve);
  assert.equal(await number('debug read {VDP regs} 20'),0x77);
  assert.equal(await number('peek 0xfff3'),0x77);
  assert.equal(await number('debug read {VDP regs} 21'),1);
  assert.equal(await number('peek 0xfff4'),1);
  await run(busy);
  assert.equal(await number('set ::raw_entry_busy'),1,'Test must exercise an actually busy VDP');
  assert.equal(await number('set ::raw_busy'),0,'Never change command parameters during execution');
  assert.equal(await number('debug read {VDP regs} 47'),19);
  assert.equal(await number('debug read {VDP regs} 15'),0);
  await run(text);
  assert.equal(await number('peek 0xfcaf'),0,'Raw parameters do not require SCREEN 5');
  await run(screen8);
  const palette=await readPalette(msx);
  for(let n=0;n<256;n++) assert.equal(palette[n],((Math.floor(n/8)%32)<<10)|((n%32)<<5)|Math.floor(n/8));
  // SCREEN 8 interleaves even/odd pixels across the two physical VRAM banks.
  const pixel=async (x,y)=>number(`debug read {physical VRAM} ${((y*256+x)>>1)+((x&1)*65536)}`);
  assert.equal(await pixel(10,20),200);
  assert.equal(await pixel(29,39),200);
  assert.equal(await pixel(60,60),255);
  assert.equal(await pixel(9,20),0);
  await run(extended8);
  assert.equal(await pixel(0,0),193,'Extended SCREEN 8 drawing accepts colors above 15');
  await run(rawCopy);
  assert.equal(await number('debug read {physical VRAM} 6420'),0x33);
  assert.equal(await number('debug read {physical VRAM} 8347'),0x33);
  assert.equal(await number('debug read {physical VRAM} 6419'),0);
  assert.ok(await number('set ::raw_writes')>=27);
  await run(finish);
  await msx.type('_VDP(48)=0\r'); await msx.advance(0.5);
  assert.match(await msx.screen(),/Illegal function call/);
  await msx.type('_V9968:_VDP(48)=42\r'); await msx.advance(0.5);
  assert.equal(await number('debug read {VDP regs} 47'),42);
  console.log(`PASS [${machine}]: _VDP ranges/expressions, no side effects on errors, ERR/ERL/RESUME/RESUME NEXT, disabled-state checks`);
  console.log('PASS: busy-before-write synchronization, R20/R21 preservation, raw LRMM with native VDP, direct-mode recovery, SCREEN 8 drawing and all 256 palette entries');
} finally {await msx.stop();}
