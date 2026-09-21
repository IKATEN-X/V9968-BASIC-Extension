import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { OpenMsx } from '../tools/openmsx.mjs';

const machine=process.argv.includes('V9968_Basic')?'V9968_Basic':'Panasonic_FS-A1ST(V9968)';
const msx=new OpenMsx({rom:'dist/v9968-basic.rom',machine});
const read=async c=>Number(await msx.command(c));
const bytes=async (dev,a,n)=>Buffer.from(await msx.command(`binary encode hex [debug read_block {${dev}} ${a} ${n}]`),'hex');
async function stage(n) {
  await msx.command(`poke 0xe000 ${n}`);
  for(let i=0;i<200&&!await read('peek 0xe001');i++) await msx.advance(.1);
  assert.equal(await read('peek 0xe001'),1,'BASIC stage completed');
  assert.equal(await read('peek 0xe00a'),0,'BASIC sentinels');
  await msx.command('poke 0xe001 0');
}
try {
  await msx.advance(12);
  const map=await readFile('build/v9968-basic.map','ascii');
  const restore=/\brestore_text\s*= \$([0-9A-F]+)/i.exec(map)[1];
  await msx.command(`poke 0xe000 0; poke 0xe001 0; poke 0xe002 0; poke 0xe003 0; poke 0xe00a 0
    set ::returns 0; set ::busy 0
    debug set_bp 0x${restore} {[pc_in_slot 1] && [peek16 0xfd89]==0x4f43 && [peek16 0xfd8b]==0x5950} {
      incr ::returns; set ::busy [expr {$::busy | ([debug read {VDP status regs} 2]&1) | [debug read {VDP regs} 15]}]
    }`);
  const program=[
    '1 CLEAR 256,&HDFFF:DEFINT A-Z:ON ERROR GOTO 900',
    '2 DIM A%(8193),B%(2):B%(0)=12345:B%(2)=-2345:S$="ARRAY SENTINEL":N=0',
    '3 _SCREEN(6):_CLS(1):_LINE(0,0)-(511,127),3,BF:_WAIT VDP:POKE &HE002,1',
    '10 IF PEEK(&HE000)=0 THEN 10',
    '20 N=PEEK(&HE000):POKE &HE000,0:ON N GOSUB 100,200,300,400',
    '30 IF B%(0)<>12345 OR B%(2)<>-2345 OR S$<>"ARRAY SENTINEL" THEN POKE &HE00A,1',
    '40 POKE &HE001,1:GOTO 10',
    '100 _COPY(0,0)-(511,127),0 TO A%:_COPY(A%) TO(0,128),0:RETURN',
    '200 _SCREEN(6,,,,,4):_COPY(0,0)-(511,511),0 TO A%',
    '210 RETURN',
    // Reallocate the same named array: no pointer may survive a COPY call.
    '300 ERASE A%:DIM A%(4):_SCREEN(5):_CLS(6):_COPY(0,0)-(2,2),0 TO A%:RETURN',
    '400 _COPY(A%) TO(10,10),0:RETURN',
    '900 POKE &HE003,ERR:POKE &HE008,ERL MOD 256:POKE &HE009,ERL\\256:RESUME NEXT',
  ];
  await msx.type(program.join('\r')+'\rRUN\r');
  for(let i=0;i<100&&!await read('peek 0xe002');i++) await msx.advance(.2);
  assert.equal(await read('peek 0xe002'),1,'BASIC initialized');
  const start=await read('peek16 0xf676'),textEnd=await read('peek16 0xf6c2');
  const text=await bytes('memory',start,textEnd-start);
  const array=(await read('peek16 0xf6c4'))+8;
  const following=await bytes('memory',array+16388,14);
  await stage(1);
  assert.equal(await read('peek 0xe003'),0);
  const data=await bytes('memory',array,16388);
  assert.equal(data.readUInt16LE(),512);assert.equal(data.readUInt16LE(2),128);
  assert.ok(data.subarray(4).every(b=>b===255),'65536 pixels / 16384 packed bytes');
  assert.deepEqual(await bytes('memory',array+16388,14),following,'exact-fit capture preserves following array');
  assert.ok((await bytes('physical VRAM',0,32768)).every(b=>b===255),'full 512-wide upload');
  assert.equal(await read('set ::returns'),2);assert.equal(await read('set ::busy'),0);
  await stage(2);
  assert.equal(await read('peek 0xe003'),5);assert.equal(await read('peek16 0xe008'),200);
  assert.ok((await bytes('memory',array,16388)).equals(data),'64KB payload rejection leaves array unchanged');
  await msx.command('poke 0xe003 0');
  await stage(3);await stage(4);
  assert.equal(await read('peek 0xe003'),0,'ERASE / re-DIM recovery');
  assert.equal(await read('set ::busy'),0);
  const after=await bytes('memory',start,textEnd-start);
  const targets=new Map();
  for(let p=0;text.readUInt16LE(p);p=text.readUInt16LE(p)-start) {
    targets.set(start+p-1,text.readUInt16LE(p+2));
  }
  // BASIC replaces line-number tokens with cached line pointers on first use.
  for(let i=0;i<text.length;i++) {
    if(text[i]===after[i]) continue;
    assert.equal(text[i],0x0e,`unexpected program change at ${i}`);
    assert.equal(after[i],0x0d,'only native line-pointer caching may change text');
    assert.equal(targets.get(after.readUInt16LE(i+1)),text.readUInt16LE(i+1),'cached target still names the same line');
    i+=2;
  }
  console.log(`PASS [${machine}]: exact 16KB buffer, 65536-pixel count, 64KB payload rejection, ERASE/re-DIM, BASIC program/data and synchronous returns`);
} finally {await msx.stop();}
