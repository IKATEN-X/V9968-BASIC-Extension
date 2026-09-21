import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { OpenMsx } from '../tools/openmsx.mjs';

const machine = process.argv[2] ?? 'V9968_Basic';
const msx = new OpenMsx({ rom: 'dist/v9968-basic.rom', machine });
const cases = [
  ['_SET PAGE(0,7)', '_CLS(0)', '_COLOR=(3,31,12,7)', '_LINE (10,20)-(30,40),3,BF', '_WAIT VDP'],
  ['_SET PAGE(0,0):_CLS(0)', '_COPY (0,0)-(63,63),7 TO (0,0),0'],
  ['_CLS(0)', '_COPY (0,0)-(63,63),7 TO (0,0)-(63,63),0,,90,1.0'],
  ['_CLS(0)', '_COPY (0,0)-(63,63),7 TO (0,0)-(127,127),0,,0,0.5'],
  ['_CLS(0)', '_COPY (0,0)-(63,63),7 TO (0,0),0,,-90,1'],
  ['_CLS(0)', '_LINE (30,40)-(10,20),5,B', '_LINE (50,50)-(60,60),6', '_PSET(90,90),7', '_WAIT VDP'],
  ['_CLS(0)', 'AN=45+45:K#=1/2', '_COPY (0,0)-(63,63),7 TO (0,0)-(127,127),0,,AN,K#'],
  ['_WAIT VBLANK', '_SET PAGE(7,0)', '_WAIT VDP'],
  ['_COLOR=(0,32,0,0)'],
  ['_SET PAGE(0,8)'],
  ['_COPY (0,0)-(10,10),7 TO (0,0),7,,90'],
  ['_COPY (0,0)-(10,10),7 TO (0,0),0,,,0'],
  ['_COPY (0,0)-(10,10),7 TO (0,0),0,,,0.1'],
  ['_LINE (0,0)-(10,10),3,NOPE'],
  ['_SCREEN(9)'],
  ['_SET PAGE(0,0):_CLS(4)', '_WAIT VDP'],
  ['_SET PAGE(0,7):_CLS(3)', '_SET PAGE(0,0)', '_COPY (0,0)-(255,255),7 TO (0,0),0'],
  ['_COPY (0,0)-(255,255),0 TO (0,0),1', '_COPY (0,0)-(255,255),1 TO (0,0),2'],
];
async function read(address) { return Number(await msx.command(`peek ${address}`)); }
async function runCase(index, expectedError = 0) {
  await msx.command('set ::copy_returns 0; set ::copy_busy 0; set ::copy_r15 0');
  await msx.command(`poke 0xc001 0; poke 0xc003 0; poke 0xc000 ${index}`);
  for (let attempt=0; attempt<20 && !await read(0xc001); attempt++) await msx.advance(0.2);
  const marker = await read(0xc001);
  assert.ok(marker, `case ${index} did not complete`);
  assert.equal(await read(0xc003), expectedError, `case ${index}: ${cases[index-1].join(':')}`);
  const copies = expectedError ? 0 : cases[index-1].filter(code => code.startsWith('_COPY ')).length;
  assert.equal(Number(await msx.command('set ::copy_returns')),copies,`case ${index}: COPY return checks`);
  assert.equal(Number(await msx.command('set ::copy_busy')),0,`case ${index}: COPY returned while VDP was busy`);
  assert.equal(Number(await msx.command('set ::copy_r15')),0,`case ${index}: COPY must restore status register selection`);
}
async function pixel(x, y, page=0) {
  const byte = Number(await msx.command(`debug read {physical VRAM} ${page*32768+y*128+(x>>1)}`));
  return x&1 ? byte&15 : byte>>4;
}
try {
  if(process.argv.includes('--realtime')) await msx.command('set throttle on; set speed 100');
  await msx.advance(12);
  const map = await readFile('build/v9968-basic.map','utf8');
  const restore = /\brestore_text\s+= \$([0-9A-F]+)/i.exec(map)[1];
  // Sample at COPY's final restore_text, before BASIC parsing or host polling can hide an unfinished transfer.
  await msx.command(`debug set_bp 0x${restore} {[pc_in_slot 1] && [peek16 0xFD89] == 0x4F43 && [peek16 0xFD8B] == 0x5950} {
    incr ::copy_returns
    set ::copy_busy [expr {$::copy_busy | ([debug read {VDP status regs} 2] & 1)}]
    set ::copy_r15 [expr {$::copy_r15 | [debug read {VDP regs} 15]}]
  }`);
  const program = [
    '1 CLEAR 200,&HBFFF', '5 ON ERROR GOTO 9000', '10 _V9968:_SCREEN(5)',
    '20 IF PEEK(&HC000)=0 THEN 20', '30 A=PEEK(&HC000):POKE &HC000,0',
    `40 ON A GOSUB ${cases.map((_,i)=>1000+i*100).join(',')}`,
    '50 POKE &HC001,A:GOTO 20', '9000 POKE &HC003,ERR:POKE &HC001,255:RESUME 20'
  ];
  for (let i=0; i<cases.length; i++) {
    cases[i].forEach((code,j)=>program.push(`${1000+i*100+j*10} ${code}`));
    program.push(`${1000+i*100+cases[i].length*10} RETURN`);
  }
  await msx.type(program.join('\r')+'\rRUN\r');
  await msx.advance(8);
  assert.equal(await read(0xfcaf),5,'BASIC did not enter SCREEN 5');
  assert.equal(Number(await msx.command('debug read {VDP regs} 20')),0x71);
  console.log(`PASS [${machine}]: BASIC extension boot and V9968 detection`);
  await runCase(1);
  assert.equal(await pixel(10,20,7),3);
  assert.equal(await pixel(30,40,7),3);
  assert.equal(await pixel(9,20,7),0);
  const palette = await msx.command('binary encode hex [debug read_block {VDP palette} 6 2]');
  assert.equal(palette,'e733');
  console.log('PASS: 15-bit palette, VRAM page 7, filled rectangle');
  await runCase(2);
  assert.equal(await pixel(10,20),3);
  assert.equal(await pixel(30,40),3);
  assert.equal(await pixel(9,20),0);
  console.log('PASS: LRMM identity copy from expanded VRAM');
  await runCase(3);
  assert.equal(await pixel(44,10),3);
  assert.equal(await pixel(24,30),3);
  assert.equal(await pixel(20,20),0);
  console.log('PASS: clockwise 90-degree rotation, single precision scale');
  await runCase(4);
  assert.equal(await pixel(54,60),3);
  assert.equal(await pixel(40,40),0);
  console.log('PASS: half-size scaling inside a destination rectangle');
  await runCase(5);
  assert.equal(await pixel(20,54),3);
  assert.equal(await pixel(40,34),3);
  console.log('PASS: negative angle, integer scale');
  await runCase(6);
  assert.equal(await pixel(10,20),5);
  assert.equal(await pixel(30,40),5);
  assert.equal(await pixel(20,30),0);
  assert.equal(await pixel(55,55),6);
  assert.equal(await pixel(90,90),7);
  console.log('PASS: reversed box coordinates, diagonal LINE, PSET');
  await runCase(7);
  assert.equal(await pixel(70,55),3);
  console.log('PASS: BASIC expressions and double precision scale');
  await runCase(8);
  assert.equal(Number(await msx.command('debug read {VDP regs} 2')),255);
  console.log('PASS: frame synchronization and display page 7');
  for (const [index,error] of [[9,5],[10,5],[11,5],[12,11],[13,5],[14,2],[15,5]]) await runCase(index,error);
  await runCase(16);
  assert.equal(await pixel(0,0),4);
  assert.equal(await pixel(255,255),4);
  console.log('PASS: argument errors, ON ERROR recovery, subsequent full-page clear');
  await runCase(17);
  assert.equal(await pixel(0,0),3);
  assert.equal(await pixel(255,255),3);
  await runCase(18);
  for (const page of [1,2]) {
    assert.equal(await pixel(0,0,page),3);
    assert.equal(await pixel(255,255,page),3);
  }
  console.log('PASS: synchronous COPY return, rotations/scaling, full-page and chained copies without WAIT VDP');
} finally { await msx.stop(); }
