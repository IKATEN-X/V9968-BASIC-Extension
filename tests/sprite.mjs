import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdir, readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { OpenMsx, tclString } from '../tools/openmsx.mjs';

const machine = process.argv.find(a => a === 'V9968_Basic' || a.startsWith('Panasonic_')) ?? 'Panasonic_FS-A1ST(V9968)';
const visual = process.argv.includes('--visual');
const root = resolve(import.meta.dirname, '..');
const msx = new OpenMsx({ rom: 'dist/v9968-basic.rom', machine });
const sat = 0x37e00;
const cases = [
  ['init', ['_SPRITE(3)']],
  ['image', [
    '_SET PAGE(0,7):_CLS(0)',
    '_LINE (0,0)-(7,7),2,BF:_LINE (8,0)-(15,7),3,BF',
    '_LINE (0,8)-(7,15),5,BF:_LINE (8,8)-(15,15),15,BF',
    '_LINE (6,6)-(9,9),0,BF:_LINE (0,16)-(15,127),15,BF',
    '_COLOR=(1,0,0,31):_COLOR=(2,31,0,0):_COLOR=(3,0,31,0)',
    '_COLOR=(5,31,31,0):_COLOR=(14,31,0,31):_COLOR=(15,31,31,31)',
    '_COLOR=(18,0,31,31):_COLOR=(19,31,0,0):_COLOR=(21,0,31,0):_COLOR=(31,31,31,0)',
    '_SET PAGE(0,0):_CLS(1):_LINE (0,0)-(3,3),14,BF',
    '_PUT SPRITE(0,40,40),0,1792:_WAIT VDP'
  ]],
  ['move', ['X=60:Y=60:_PUT SPRITE(0,X,Y)']],
  ['attributes', ['_PUT SPRITE(0,40,40),1,1792,SIZE(32,24),FLIP(3),TRANS(50)']],
  ['off', ['_SPRITE OFF']],
  ['on', ['_SPRITE ON']],
  ['hide', ['_SPRITE OFF(0)']],
  ['show', ['_PUT SPRITE(0,80,80)']],
  ['clear', ['_SPRITE CLEAR']],
  ['64 planes', ['FOR I=0 TO 63:_PUT SPRITE(I,(I MOD 16)*16,16+(I\\16)*40),0,1792:NEXT I']],
  ['priority', ['_SPRITE CLEAR', '_PUT SPRITE(0,100,100),0,1792,TRANS(50)', '_PUT SPRITE(1,100,100),1,1792']],
  ['256 size', ['_SPRITE CLEAR', '_PUT SPRITE(0,-8,-8),0,1792,SIZE(256,256)']],
  ['32 source', ['_PUT SPRITE(0,40,40),0,1792,SIZE(16,32),PATTERN(32)']],
  ['64 source', ['_PUT SPRITE(0,40,40),0,1792,PATTERN(64),SIZE(16,64)']],
  ['128 source', ['_PUT SPRITE(0,40,40),0,1792,SIZE(16,128),PATTERN(128)']],
  ['last pattern', ['_PUT SPRITE(63,511,-512),15,2047,PATTERN(16),SIZE(1,1)']],
  ['omitted fields', ['_PUT SPRITE(0,50,50),,,SIZE(12,13)', '_PUT SPRITE(0,51,51),,1793']],
  ['protect clear', ['_SET PAGE(0,6):_CLS(4):_WAIT VDP']],
  ['other drawing', ['_SET PAGE(1,1):_CLS(1):_PSET(10,10),3', '_COPY (0,0)-(15,15),7 TO (50,50),1', '_COLOR=(2,31,0,0):_V9968:_WAIT VDP:_SET PAGE(0,0)']],
  ['release', ['_SPRITE(0):_SET PAGE(0,6):_CLS(4):_WAIT VDP']],
  ['screen reset', ['_SCREEN(5)']],
  ['text', ['_SCREEN(0)']],
  ['end', ['_SCREEN(0):END']],
  ['flip x', ['_PUT SPRITE(0,40,40),0,1792,SIZE(16,16),FLIP(1),TRANS(0)']],
  ['flip y', ['_PUT SPRITE(0,40,40),0,1792,FLIP(2)']],
  ['trans25', ['_PUT SPRITE(0,40,40),0,1792,FLIP(0),TRANS(25)']],
  ['trans75', ['_PUT SPRITE(0,40,40),0,1792,TRANS(75)']],
  ['end marker safety', ['_SPRITE CLEAR', '_PUT SPRITE(0,0,217),0,1792', '_PUT SPRITE(63,40,40),0,1792']],
  ['nested expressions', ['_PUT SPRITE((1-1),(20+1)*2,ABS(-40)):POKE &HC006,1']],
  ['once', ['POKE &HC010,0:DEFUSR=&HC100', '_PUT SPRITE(USR(0),USR(40),USR(40))']],
  ['prepare retry', ['N%=64']],
  ['retry', ['_PUT SPRITE(N%,70,71):POKE &HC006,2']],
  ['resume next', ['_PUT SPRITE(0),(10,20)', '_PUT SPRITE(0,72,73):POKE &HC006,3']],
];
for (const [name, command, error = 5] of [
  ['plane high', '_PUT SPRITE(64,0,0)'],
  ['plane low', '_SPRITE OFF(-1)'],
  ['x low', '_PUT SPRITE(0,-513,0)'],
  ['x high', '_PUT SPRITE(0,512,0)'],
  ['y high', '_PUT SPRITE(0,0,512)'],
  ['zero width', '_PUT SPRITE(0,0,0),0,1792,SIZE(0,16)'],
  ['large width', '_PUT SPRITE(0,0,0),0,1792,SIZE(257,16)'],
  ['zero height', '_PUT SPRITE(0,0,0),0,1792,SIZE(16,0)'],
  ['palette high', '_PUT SPRITE(0,0,0),16,1792'],
  ['pattern high', '_PUT SPRITE(0,0,0),0,2048'],
  ['pattern low', '_PUT SPRITE(0,0,0),0,-1'],
  ['source height', '_PUT SPRITE(0,0,0),0,1792,PATTERN(48)'],
  ['flip bits', '_PUT SPRITE(0,0,0),0,1792,FLIP(4)'],
  ['transparency', '_PUT SPRITE(0,0,0),0,1792,TRANS(1)'],
  ['source overflow', '_PUT SPRITE(0,0,0),0,2047,PATTERN(32)'],
  ['source SAT', '_PUT SPRITE(0,0,0),0,1776,PATTERN(16)'],
  ['unknown option', '_PUT SPRITE(0,0,0),0,1792,BOGUS(1)', 2],
  ['trailing text', '_PUT SPRITE(0,0,0),0,1792 XYZ', 2],
  ['expression error', '_PUT SPRITE(0,0,0),0,1792,SIZE(1/0,16)', 11],
  ['old syntax', '_PUT SPRITE(0),(0,0),0,1792', 2],
  ['old variable syntax', '_PUT SPRITE(N%),(X,Y)', 2],
  ['split syntax', '_PUT SPRITE(0),0,0', 2],
  ['missing opener', '_PUT SPRITE 0,0,0', 2],
  ['missing plane', '_PUT SPRITE(,0,0)', 2],
  ['missing x', '_PUT SPRITE(0,,0)', 2],
  ['missing y', '_PUT SPRITE(0,0,)', 2],
  ['short arguments', '_PUT SPRITE(0,0)', 2],
  ['extra argument', '_PUT SPRITE(0,0,0,1)', 2],
  ['missing closer', '_PUT SPRITE(0,0,0', 2],
  ['plane type', '_PUT SPRITE("X",0,0)', 13],
  ['coordinate type', '_PUT SPRITE(0,"X",0)', 13],
  ['coordinate expression', '_PUT SPRITE(0,0,1/0)', 11],
  ['off extra argument', '_SPRITE OFF(0,1)', 2],
  ['off missing closer', '_SPRITE OFF(0', 2],
  ['protected point', '_PSET(255,255),3'],
  ['protected line', '_LINE (0,251)-(1,252),3'],
  ['protected box', '_LINE (0,255)-(255,0),3,BF'],
  ['protected copy', '_COPY (0,0)-(15,15),7 TO (0,240),6'],
  ['invalid mode', '_SPRITE(2)'],
]) cases.push([name, [command], error]);

async function bytes(address, length) {
  return Buffer.from(await msx.command(`binary encode hex [debug read_block {physical VRAM} ${address} ${length}]`), 'hex');
}
async function reg(number) { return Number(await msx.command(`debug read {VDP regs} ${number}`)); }
async function run(name, error, recover = 0) {
  const index = cases.findIndex(c => c[0] === name);
  assert.ok(index >= 0, name);
  await msx.command(`poke 0xc001 0; poke 0xc003 0; poke 0xc005 ${recover}; poke 0xc006 0; poke 0xc008 0; poke 0xc009 0; poke 0xc000 ${index+1}`);
  let done = false;
  for (let attempt = 0; attempt < 40; attempt++) {
    await msx.advance(0.1);
    if (Number(await msx.command('peek 0xc001'))) { done = true; break; }
  }
  assert.ok(done, `${name}: BASIC did not complete`);
  const expectedError = error ?? cases[index][2] ?? 0;
  assert.equal(Number(await msx.command('peek 0xc003')), expectedError, name);
  if (expectedError) assert.equal(Number(await msx.command('peek16 0xc008')),2000+index*100,`${name}: ERL`);
}
function record({ x=0, y=511, w=16, h=16, palette=0, pattern=0, size=0, flip=0, trans=0 } = {}) {
  y=y===217 ? 510 : y-1;
  return Buffer.from([y&255, ((y>>8)&3)|(size<<6), h&255, palette|(flip<<4)|(trans<<6), x&255, ((x>>8)&3)|((pattern>>8)<<4), w&255, pattern&255]);
}
async function checkRecord(n, expected) { assert.deepEqual(await bytes(sat+n*8,8), record(expected)); }
async function checkCleared() {
  const table = await bytes(sat,512);
  for (let n=0; n<64; n++) assert.deepEqual(table.subarray(n*8,n*8+8), record(), `plane ${n}`);
}
let origin;
async function frame(name) {
  await msx.advance(0.1);
  const path = resolve(root, `build/screenshots/sprite-${name}.png`);
  await msx.command(`screenshot -raw ${tclString(path)}`);
  const decoded = JSON.parse(execFileSync('pwsh.exe', ['-NoProfile','-File',resolve(root,'tests/read-png.ps1'),'-Path',path], { encoding:'utf8', windowsHide:true, maxBuffer:2**20 }));
  const rgb = Buffer.from(decoded.rgb,'base64');
  if (!origin) {
    let anchor = -1;
    for (let i=0; i<rgb.length; i+=3) {
      if (rgb[i]===255 && rgb[i+1]===0 && rgb[i+2]===255) { anchor=i/3; break; }
    }
    assert.ok(anchor>=0, 'SCREEN 5 calibration marker is missing');
    origin=[anchor%decoded.width, Math.floor(anchor/decoded.width)];
  }
  const [ox,oy]=origin;
  return (x,y) => [...rgb.subarray(((y+oy)*decoded.width+x+ox)*3, ((y+oy)*decoded.width+x+ox)*3+3)];
}

try {
  if(!visual) await msx.command('set throttle on; set speed 1000');
  await msx.advance(12);
  const program = ['1 CLEAR 200,&HBFFF', '5 ON ERROR GOTO 30000', '10 _V9968:_SCREEN(5)',
    '20 IF PEEK(&HC000)=0 THEN 20', '30 A=PEEK(&HC000):POKE &HC000,0'];
  for (let start=0; start<cases.length; start+=16) {
    const targets=cases.slice(start,start+16).map((_,i)=>2000+(start+i)*100).join(',');
    program.push(`${40+start} IF A>${start} AND A<=${start+16} THEN ON A-${start} GOSUB ${targets}`);
  }
  program.push('200 POKE &HC001,1:GOTO 20',
    '30000 POKE &HC003,ERR:POKE &HC008,ERL MOD 256:POKE &HC009,INT(ERL/256)',
    '30010 IF PEEK(&HC005)=1 THEN N%=0:RESUME',
    '30020 IF PEEK(&HC005)=2 THEN RESUME NEXT',
    '30030 POKE &HC001,255:RESUME 20');
  cases.forEach(([,commands],i) => {
    commands.forEach((command,j)=>program.push(`${2000+i*100+j*5} ${command}`));
    program.push(`${2000+i*100+commands.length*5} RETURN`);
  });
  assert.ok(program.every(line => line.length<255), 'BASIC line exceeds input buffer');
  // USR counts evaluations while leaving the argument in BASIC's DAC unchanged.
  await msx.command('debug write_block memory 0xc100 [binary format H* 2110c034c9]');
  await msx.type(program.join('\r')+'\rRUN\r');
  await msx.advance(15);
  assert.equal(Number(await msx.command('peek 0xfcaf')),5,'BASIC did not start');
  await run('move',5);
  await run('init');
  assert.equal(await reg(20),0x79);
  assert.equal(await reg(8)&2,0);
  assert.equal(await reg(5),0xfc);
  assert.equal(await reg(11),6);
  assert.equal(await reg(6),0);
  await checkCleared();
  console.log(`PASS [${machine}]: Sprite mode 3 initialization, 64 hidden records`);
  await run('image');
  await checkRecord(0,{x:40,y:40,pattern:1792});
  assert.equal(await reg(20),0x79);
  assert.equal(await reg(14),Number(await msx.command('peek 0xffed')),'R#14 was not restored');
  if (visual) {
    await mkdir(resolve(root,'build/screenshots'),{recursive:true});
    await msx.command('set throttle on; set renderer SDLGL-PP');
    const p=await frame('normal');
    assert.deepEqual(p(40,40),[255,0,0],'sprite and bitmap origins must match');
    assert.deepEqual(p(40,39),[0,0,255]);
    assert.deepEqual(p(42,42),[255,0,0]);
    assert.deepEqual(p(53,42),[0,255,0]);
    assert.deepEqual(p(42,53),[255,255,0]);
    assert.deepEqual(p(53,53),[255,255,255]);
    assert.deepEqual(p(47,47),[0,0,255],'color zero must be transparent');
  }
  await run('move');
  await checkRecord(0,{x:60,y:60,pattern:1792});
  await run('attributes');
  const styled={x:40,y:40,pattern:1792,w:32,h:24,palette:1,flip:3,trans:2};
  await checkRecord(0,styled);
  if (visual) {
    const p=await frame('attributes');
    assert.ok(p(42,42)[0]>0 && p(42,42)[1]>0 && p(42,42)[2]>0,'flipped palette 1 white tile should blend yellow with blue');
    assert.deepEqual(p(72,42),[0,0,255],'sprite exceeded width');
    assert.deepEqual(p(42,64),[0,0,255],'sprite exceeded height');
  }
  await run('off');
  assert.equal(await reg(8)&2,2);
  await checkRecord(0,styled);
  if (visual) assert.deepEqual((await frame('off'))(42,42),[0,0,255]);
  await run('on');
  assert.equal(await reg(8)&2,0);
  await run('hide');
  await checkRecord(0,{...styled,y:511});
  await run('show');
  await checkRecord(0,{...styled,x:80,y:80});
  await run('nested expressions');
  await checkRecord(0,{...styled,x:42,y:40});
  assert.equal(Number(await msx.command('peek 0xc006')),1,'Colon continuation');
  await run('once');
  await checkRecord(0,styled);
  assert.equal(Number(await msx.command('peek 0xc010')),3,'N/X/Y must each be evaluated exactly once');
  await run('flip x');
  await checkRecord(0,{x:40,y:40,pattern:1792,flip:1});
  if (visual) assert.deepEqual((await frame('flip-x'))(42,42),[0,255,0]);
  await run('flip y');
  await checkRecord(0,{x:40,y:40,pattern:1792,flip:2});
  if (visual) assert.deepEqual((await frame('flip-y'))(42,42),[255,255,0]);
  await run('trans25');
  await checkRecord(0,{x:40,y:40,pattern:1792,trans:1});
  const trans25=visual ? (await frame('trans25'))(42,42) : null;
  await run('trans75');
  await checkRecord(0,{x:40,y:40,pattern:1792,trans:3});
  if (visual) {
    const trans75=(await frame('trans75'))(42,42);
    assert.ok(trans25[0]>trans75[0] && trans25[2]<trans75[2],'25/75% blend weights');
  }
  console.log('PASS: movement retains attributes, independent size, palette, flip, transparency, hide/show');
  await run('clear');
  await checkCleared();
  await run('64 planes');
  for (let n=0;n<64;n++) await checkRecord(n,{x:(n%16)*16,y:16+Math.floor(n/16)*40,pattern:1792});
  if (visual) {
    const p=await frame('64');
    for (let n=0;n<64;n++) assert.deepEqual(p((n%16)*16+2,18+Math.floor(n/16)*40),[255,0,0],`visible plane ${n}`);
  }
  await run('priority');
  if (visual) {
    const p=await frame('priority');
    assert.ok(p(102,102)[0]>0 && p(102,102)[1]===0 && p(102,102)[2]>0,'front sprite must blend with background, not the rear sprite');
  }
  await run('end marker safety');
  await checkRecord(0,{x:0,y:217,pattern:1792});
  await checkRecord(63,{x:40,y:40,pattern:1792});
  if (visual) assert.deepEqual((await frame('end-marker'))(42,42),[255,0,0]);
  await run('256 size');
  await checkRecord(0,{x:-8,y:-8,pattern:1792,w:256,h:256});
  if (visual) {
    const p=await frame('256');
    assert.deepEqual(p(0,0),[255,0,0]);
    assert.deepEqual(p(247,0),[0,255,0]);
    assert.deepEqual(p(248,0),[0,0,255]);
  }
  await run('32 source');
  await checkRecord(0,{x:40,y:40,pattern:1792,w:16,h:32,size:1});
  if (visual) assert.deepEqual((await frame('32'))(42,64),[255,255,255]);
  await run('64 source');
  await checkRecord(0,{x:40,y:40,pattern:1792,w:16,h:64,size:2});
  await run('128 source');
  await checkRecord(0,{x:40,y:40,pattern:1792,w:16,h:128,size:3});
  if (visual) {
    const p=await frame('128');
    assert.deepEqual(p(42,167),[255,255,255]);
    assert.deepEqual(p(42,168),[0,0,255]);
  }
  await run('last pattern');
  await checkRecord(63,{x:511,y:-512,pattern:2047,palette:15,w:1,h:1});
  await run('omitted fields');
  await checkRecord(0,{x:51,y:51,pattern:1793,w:12,h:13,size:3});
  console.log('PASS: all 64 planes, signed coordinates, 1/256 dimensions, 16/32/64/128 source heights, omitted fields');
  const before=await bytes(sat,512);
  await run('protect clear');
  assert.deepEqual(await bytes(sat,512),before);
  assert.deepEqual(await bytes(6*32768+251*128,128),Buffer.alloc(128,0x44));
  for (const [name,,error] of cases.filter(c=>c[2])) {
    await run(name,error);
    assert.deepEqual(await bytes(sat,512),before,`${name} altered sprite attributes`);
  }
  await run('other drawing');
  assert.deepEqual(await bytes(sat,512),before);
  assert.equal(await reg(20),0x79);
  console.log('PASS: malformed arguments and ON ERROR recovery, drawing/COPY/palette coexistence, protected SAT');
  await run('prepare retry');
  await run('retry',5,1);
  await checkRecord(0,{x:70,y:71,pattern:1793,w:12,h:13,size:3});
  assert.equal(Number(await msx.command('peek 0xc006')),2,'RESUME must retry the failed statement');
  await run('resume next',2,2);
  await checkRecord(0,{x:72,y:73,pattern:1793,w:12,h:13,size:3});
  assert.equal(Number(await msx.command('peek 0xc006')),3,'RESUME NEXT must allow a subsequent valid command');
  console.log('PASS: unified syntax, old syntax rejection, nested expressions, single evaluation, ERR/ERL, RESUME/RESUME NEXT');
  await run('release');
  assert.equal(await reg(20),0x71);
  assert.equal(await reg(8)&2,2);
  assert.deepEqual(await bytes(sat,512),Buffer.alloc(512,0x44));
  await run('init');
  await checkCleared();
  await run('screen reset');
  assert.equal(await reg(20),0x71);
  await run('move',5);
  await run('text');
  assert.equal(await reg(20),0);
  console.log(`PASS: release/reinitialize, SCREEN 5 reset, SCREEN 0 cleanup${visual ? ', rendered pixel checks' : ''}`);
  await msx.command(`poke 0xc000 ${cases.findIndex(c=>c[0]==='end')+1}`);
  await msx.advance(0.5);
  const example=(await readFile(resolve(root,'demo/SPRITE-SIMPLE.BAS'),'utf8')).replace(/\r?\n/g,'\r');
  await msx.type('NEW\r'+example+'\rRUN\r');
  await msx.advance(10);
  assert.equal(Number(await msx.command('peek 0xfcaf')),5,'Sprite example did not start');
  await checkRecord(0,{x:32,y:80,pattern:1792,w:32,h:32});
  await checkRecord(1,{x:104,y:72,pattern:1792,w:48,h:48,palette:1,flip:1});
  await checkRecord(2,{x:176,y:64,pattern:1792,w:64,h:64,trans:2});
  await msx.command('keymatrixdown 8 128');
  await msx.advance(0.3);
  await msx.command('keymatrixup 8 128');
  await msx.advance(0.1);
  assert.ok((await bytes(sat,8))[4]>32,'Right cursor did not move the example sprite');
  if (visual) await msx.command(`screenshot -raw ${tclString(resolve(root,'build/screenshots/sprite-example.png'))}`);
  await msx.type('\x1b');
  await msx.advance(1);
  assert.equal(Number(await msx.command('peek 0xfcaf')),0,'Escape did not exit the sprite example');
  assert.match(await msx.screen(),/sprite example stopped/);
  console.log('PASS: actual SPRITE-SIMPLE.BAS, cursor movement, Escape returns to BASIC');
} finally { await msx.stop(); }
