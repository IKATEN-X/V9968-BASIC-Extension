import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdir, readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { OpenMsx, tclString } from '../tools/openmsx.mjs';

const machine=process.argv.find(a=>a==='V9968_Basic' || a.startsWith('Panasonic_')) ?? 'Panasonic_FS-A1ST(V9968)';
const visual=process.argv.includes('--visual');
const root=resolve(import.meta.dirname,'..');
const msx=new OpenMsx({rom:'dist/v9968-basic.rom',machine});
const cases=[];
function add(body,error=0) { cases.push({body,error}); return cases.length; }
const setup=add([
  '_SCREEN(5):_SET PAGE(2,2):_CLS(3):_FONT(1):_SPRITE(3)',
  '_PUT SPRITE(0,48,80),0,1792:_WAIT VDP',
  'VDP(21)=&H1E:VDP(22)=2:VDP(26)=4'
]);
const on=add(['_SCREEN(,,,,,,1)']);
const off=add(['_SCREEN(,,,,,,0)']);
const wide=add(['_SCREEN(,,,,,,2)']);
const both=add(['_SCREEN(,,,,,,3)']);
const fixed=add(['_SCREEN(,,,,,,,1)']);
const following=add(['_SCREEN(,,,,,,,0)']);
const combined=add(['_SCREEN(,,,,,,2,1)']);
const expression=add(['S%=1:CALL SCREEN( , , , , , , S% AND 1):POKE &HC006,3']);
const spriteCommands=['_SPRITE OFF','_SPRITE ON','_SPRITE OFF(0)','_SPRITE CLEAR','_SPRITE(3)','_SPRITE(0)'].map(code=>add([code]));
const fontPrint=add(['OPEN "GRP:" AS #1:PSET(24,48):PRINT #1,"A";:CLOSE #1']);
const protectedFont=add(['_SET PAGE(2,6):_PSET(0,236),1'],5);
const protectedSprite=add(['_PSET(0,252),1'],5);
const reset=add(['_SCREEN(5)']);
const initialized=add(['_SCREEN(2+3,,,,,,2+1,1)']);
const screen8=add(['_SCREEN(8,,,,,,2)']);
const text=add(['_SCREEN(0)']);
const textOn=add(['_SCREEN(,,,,,,1)'],5);
const textInitOn=add(['_SCREEN(0,,,,,,1)'],5);
const textInitOff=add(['_SCREEN(0,,,,,,0)']);
const textFlags=[2,3].flatMap(flags=>[
  add([`_SCREEN(,,,,,,${flags})`],5),add([`_SCREEN(0,,,,,,${flags})`],5)
]);
const textSvns=[add(['_SCREEN(,,,,,,,1)'],5),add(['_SCREEN(0,,,,,,,1)'],5)];
const legacy=add(['SCREEN 1']);
const disabled=add(['VDP(21)=0:VDP(22)=1']);
const reservedSize=add(['_SCREEN(,2,0,2,0,3,0)'],5);
const settingsWithReservations=add(['_SCREEN(,,0,2,0,3):_SCREEN(,,1,1,1,0)']);
const nativeCases=[',0',',1',',2',',3',',,0',',,255',',,,1',',,,2',',,,,0',',,,,255',',,,,,0',',,,,,1',',,,,,2',',,,,,3',',3,255,2,255,3'].map(args=>({
  args, native:add([`SCREEN ${args}`]), extended:add([`_SCREEN(${args})`])
}));
const allArgs=add(['_SCREEN(5,3,255,2,255,3,3,1):POKE &HC006,4']);
const fontOnly=add(['_SCREEN(5):_FONT(1)']);
const once=add(['POKE &HC010,0:DEFUSR=&HC100',
  '_SCREEN(USR(5),USR(3),USR(1),USR(2),USR(1),USR(0),USR(3),USR(1))']);
const invalid=[
  ['_SCREEN(5,,,,,,4)',5],['_SCREEN(0,,,,,,1)',5],['_SCREEN(9,,,,,,1)',5],
  ['_SCREEN(,,,,,,255)',5],['_SCREEN(5,,,,,,5)',5],
  ['_SCREEN(-1,,,,,,1)',5],['_SCREEN(256,,,,,,1)',5],
  ['_SCREEN(5,,,,,,-1)',5],['_SCREEN(5,,,,,,256)',5],
  ['_SCREEN(5,,,,,,40000)',5],['_SCREEN(5,,,,,,"X")',13],
  ['_SCREEN(5,,,,,,1/0)',11],['_SCREEN(5,,,,,,1E20*1E20)',6],
  ['_SCREEN()',2],['_SCREEN(,)',2],['_SCREEN(5,)',2],
  ['_SCREEN(,,,,,,)',2],['_SCREEN(5,,,,,,1,0,0)',2],
  ['_SCREEN(5,,,,,,1,)',2],['_SCREEN(5,,,,,,1',2],
  ['_SCREEN(5,,,,,,1) XYZ',2],['_SCREEN(5;1)',2],
  ['_SCREEN(5,4)',5],['_SCREEN(5,,256)',5],['_SCREEN(5,,,0)',5],
  ['_SCREEN(5,,,3)',5],['_SCREEN(5,,,,256)',5],['_SCREEN(5,,,,,5)',5],
  ['_SCREEN(5,3,0,2,0,0,4)',5],['_SCREEN(5,3,0,2,0,"X",1)',13],
  ['_SCREEN(5,,,,,,,2)',5],['_SCREEN(,,,,,,,255)',5],
  ['_SCREEN(5,,,,,,,-1)',5],['_SCREEN(5,,,,,,,256)',5],
  ['_SCREEN(5,,,,,,,40000)',5],['_SCREEN(5,,,,,,,"X")',13],
  ['_SCREEN(5,,,,,,,1/0)',11],['_SCREEN(5,,,,,,,1E20*1E20)',6],
  ['_SCREEN(5,,,,,,,)',2],['_SCREEN(5,,,,,,,1',2],
  ['_SCREEN(5,,,,,,,1) XYZ',2]
].map(([code,error])=>add([code],error));
const prepareRecovery=add(['S%=4']);
const recovery=add(['_SCREEN(,,,,,,S%):POKE &HC006,1'],5);
const next=add(['_SCREEN(,,,,,,4):POKE &HC006,2'],5);
const svnsRecovery=add(['_SCREEN(,,,,,,,S%):POKE &HC006,5'],5);
const svnsNext=add(['_SCREEN(,,,,,,,2):POKE &HC006,6'],5);
const image=add([
  '_SCREEN(5):_COLOR=(0,0,0,0):_COLOR=(2,31,0,0):_COLOR=(3,0,31,0):_COLOR=(14,31,0,31)',
  '_SET PAGE(0,7):_CLS(0):_LINE(0,0)-(15,15),2,BF:_LINE(16,0)-(31,15),3,BF',
  '_SET PAGE(0,0):_CLS(0):_LINE(0,0)-(3,3),14,BF:_SPRITE(3)',
  '_PUT SPRITE(0,48,80),0,1792:_PUT SPRITE(1,48,80),0,1793',
  'FOR I=0 TO 23:_PUT SPRITE(I+2,I*10,120),0,1792,SIZE(8,8):NEXT I:_WAIT VDP'
]);
const finish=add(['ON ERROR GOTO 0:_SCREEN(0):POKE &HC001,1:END']);
const number=async code=>Number(await msx.command(code));
const bytes=async (device,start,size)=>Buffer.from(await msx.command(`binary encode hex [debug read_block {${device}} ${start} ${size}]`),'hex');
async function run(index,recover=0) {
  await msx.command(`poke 0xc001 0; poke 0xc003 0; poke 0xc005 ${recover}; poke 0xc006 0; poke 0xc000 ${index}`);
  for(let i=0;i<100 && !await number('peek 0xc001');i++) await msx.advance(0.1);
  assert.ok(await number('peek 0xc001'),`Timed out: ${cases[index-1].body}`);
  assert.equal(await number('peek 0xc00a'),0,'Existing BASIC variables, arrays and strings must survive');
  assert.equal(await number('peek 0xc003'),cases[index-1].error,`${cases[index-1].body}`);
  if(cases[index-1].error) assert.equal(await number('peek16 0xc008'),1000+(index-1)*100,'ERL');
}
let fontWork;
async function snapshot() {
  const fields={
    regs:['VDP regs',0,59], palette:['VDP palette',0,32], vram:['physical VRAM',0,262144],
    mode:['memory',0xfcaf,1], pages:['memory',0xfaf5,2], shadows:['memory',0xffe7,16],
    shadow25:['memory',0xfffa,3], legacyShadows:['memory',0xf3df,8], click:['memory',0xf3db,1],
    printer:['memory',0xf417,1], cassette:['memory',0xf406,5], colors:['memory',0xf3e9,3],
    font:['memory',fontWork,32], hook:['memory',0xfee4,5], himem:['memory',0xfc4a,2]
  };
  const reads=Object.values(fields).map(([device,start,size])=>`[binary encode hex [debug read_block {${device}} ${start} ${size}]]`);
  const values=(await msx.command(`join [list ${reads.join(' ')}] "\\n"`)).split('\n');
  return Object.fromEntries(Object.keys(fields).map((key,i)=>[key,Buffer.from(values[i],'hex')]));
}
async function change(index,flags,svns) {
  const before=await snapshot();
  await run(index);
  if(flags!==undefined) {
    before.regs[25]=(before.regs[25]&127)|((flags&1)?128:0);
    before.shadow25[0]=(before.shadow25[0]&127)|((flags&1)?128:0);
    before.regs[20]=(before.regs[20]&127)|((flags&2)?128:0);
    before.shadows[12]=(before.shadows[12]&127)|((flags&2)?128:0);
  }
  if(svns!==undefined) {
    before.regs[20]=(before.regs[20]&253)|(svns?2:0);
    before.shadows[12]=(before.shadows[12]&253)|(svns?2:0);
  }
  assert.deepEqual(await snapshot(),before,'Partial SCREEN must only change supplied SPS/S16/SVNS and their BASIC shadows');
}
async function checkSvns(expected) {
  const reg=await number('debug read {VDP regs} 20');
  assert.equal(reg&2,expected?2:0,'SVNS');
  assert.equal(await number('peek 0xfff3'),reg,'R20 BASIC shadow');
}
async function checkSps(expected) {
  const [reg,shadow]=(await msx.command('list [debug read {VDP regs} 25] [peek 0xfffa]')).split(' ').map(Number);
  assert.equal(reg&128,expected?128:0,'SPS');
  assert.equal(shadow,reg,'R25 BASIC shadow');
}
async function checkFlags(expected) {
  await checkSps(Boolean(expected&1));
  const [reg,shadow]=(await msx.command('list [debug read {VDP regs} 20] [peek 0xfff3]')).split(' ').map(Number);
  assert.equal(reg&128,(expected&2)?128:0,'S16');
  assert.equal(shadow,reg,'R20 BASIC shadow');
}
async function nativeSettings() {
  return {
    size:(await number('debug read {VDP regs} 1'))&3,
    sizeShadow:(await number('peek 0xf3e0'))&3,
    click:await number('peek 0xf3db'),
    printer:await number('peek 0xf417'),
    cassette:await bytes('memory',0xf406,5),
    interlace:(await number('debug read {VDP regs} 9'))&12,
    interlaceShadow:(await number('peek 0xffe8'))&12
  };
}
try {
  await msx.ready;
  await msx.command('set throttle on; set speed 1000');
  await msx.advance(12);
  fontWork=(await number('peek16 0xfd2f'))&0xfffe;
  const map=await readFile(resolve(root,'build/v9968-basic.map'),'ascii');
  const addr=name=>'0x'+new RegExp(`\\b${name}\\s*= \\$([0-9A-F]+)`,'i').exec(map)[1];
  await msx.command(`set ::shuffle_glyphs 0; debug set_bp ${addr('font_draw')} {[pc_in_slot 1]} {incr ::shuffle_glyphs}`);
  const program=[
    '1 CLEAR 200,&HBFFF:DEFINT A-Z:ON ERROR GOTO 30000',
    '2 QA=12345:QB#=123.25:DIM QC(3):QC(0)=-123:QC(3)=456:QD$=STRING$(64,65)',
    '10 _SCREEN(5):POKE &HC002,1',
    '20 IF PEEK(&HC000)=0 THEN 20',
    '30 A=PEEK(&HC000):POKE &HC000,0'
  ];
  for(let start=0;start<cases.length;start+=16) {
    const targets=cases.slice(start,start+16).map((_,i)=>1000+(start+i)*100).join(',');
    program.push(`${40+start} IF A>${start} AND A<=${start+16} THEN ON A-${start} GOSUB ${targets}`);
  }
  program.push(`200 IF QA<>12345 OR QB#<>123.25 OR QC(0)<>-123 OR QC(3)<>456 OR QD$<>"${'A'.repeat(64)}" THEN POKE &HC00A,1`,
    '210 POKE &HC001,1:GOTO 20',
    '30000 POKE &HC003,ERR:POKE &HC008,ERL MOD 256:POKE &HC009,ERL\\256',
    '30010 IF PEEK(&HC005)=1 THEN S%=1:RESUME',
    '30020 IF PEEK(&HC005)=2 THEN RESUME NEXT',
    '30030 RESUME 200');
  cases.forEach(({body},i)=>{
    body.forEach((line,j)=>program.push(`${1000+i*100+j*10} ${line}`));
    program.push(`${1000+i*100+body.length*10} RETURN`);
  });
  assert.ok(program.every(line=>line.length<255));
  await msx.command('poke 0xc000 0; poke 0xc001 0; poke 0xc002 0; poke 0xc003 0; poke 0xc00a 0');
  // USR leaves its argument in DAC and counts evaluations without altering it.
  await msx.command('debug write_block memory 0xc100 [binary format H* 2110c034c9]');
  await msx.type(program.join('\r')+'\rRUN\r');
  for(let i=0;i<60 && !await number('peek 0xc002');i++) await msx.advance(1);
  if(await number('peek 0xc002')!==1) assert.fail(`BASIC test did not start: ${await msx.screen()}`);
  await run(setup);
  await change(following,undefined,0);
  await change(following,undefined,0);
  await change(fixed,undefined,1);
  await change(fixed,undefined,1);
  await change(combined,2,1);
  await change(on,true);
  await change(on,true);
  await change(off,false);
  await change(off,false);
  await change(expression,true);
  assert.equal(await number('peek 0xc006'),3,'Colon continuation');
  for(const [index,flags] of [[both,3],[wide,2],[wide,2],[on,1],[off,0],[both,3]]) {
    await change(index,flags); await checkFlags(flags);
  }
  for(const index of invalid) {
    const before=await snapshot();
    await run(index);
    assert.deepEqual(await snapshot(),before,`Rejected operation changed state: ${cases[index-1].body}`);
  }
  const reserved=await snapshot();
  await run(reservedSize);
  assert.deepEqual(await snapshot(),reserved,'Size-only update must not clear mode-3/font VRAM');
  await run(settingsWithReservations);
  await checkFlags(3);
  await checkSvns(1);
  const afterSettings=await snapshot();
  for(const key of ['vram','font','hook','pages','mode','himem']) assert.deepEqual(afterSettings[key],reserved[key],`Partial native settings changed ${key}`);
  await change(off,false);
  await run(prepareRecovery);
  await run(recovery,1);
  await checkSps(true);
  assert.equal(await number('peek 0xc006'),1,'RESUME');
  await change(off,false);
  await run(next,2);
  await checkSps(false);
  assert.equal(await number('peek 0xc006'),2,'RESUME NEXT');
  await change(following,undefined,0);
  await run(prepareRecovery); await run(svnsRecovery,1); await checkSvns(1);
  assert.equal(await number('peek 0xc006'),5,'SVNS RESUME');
  await run(svnsNext,2); await checkSvns(1);
  assert.equal(await number('peek 0xc006'),6,'SVNS RESUME NEXT');
  await change(both,3);
  await run(fontPrint);
  assert.ok(await number('set ::shuffle_glyphs')>0,'Partial SCREEN disabled the GRP font hook');
  await run(protectedFont);
  await run(protectedSprite);
  for(const index of spriteCommands) { await run(index); await checkFlags(3); await checkSvns(1); }
  console.log(`PASS [${machine}]: partial SCREEN, expressions, native shadows, VRAM/font/SAT/page preservation, idempotent toggles and sprite initialization`);
  console.log('PASS: argument/syntax/type/arithmetic errors without side effects, ERR/ERL, RESUME and RESUME NEXT');
  await run(reset); await checkFlags(0); await checkSvns(0);
  await run(initialized); await checkFlags(3); await checkSvns(1);
  await run(screen8); await checkFlags(2); await checkSvns(0);
  await change(fixed,undefined,1);
  assert.equal(await number('peek 0xfcaf'),8);
  await change(off,false);
  await run(text); await checkFlags(0); await checkSvns(0);
  for(const index of [textOn,textInitOn,...textFlags,...textSvns]) {
    const before=await snapshot(); await run(index); assert.deepEqual(await snapshot(),before);
  }
  await change(off,false);
  await change(following,undefined,0);
  await run(textInitOff); await checkSps(false);
  await run(legacy);
  await run(disabled);
  await change(on,true);
  assert.equal(await number('peek 0xfff3'),0,'SPS must not enable unrelated palette/command extensions');
  await change(wide,2); await checkFlags(2);
  assert.equal(await number('peek 0xfff3'),128,'S16 must not enable unrelated palette/command extensions');
  await change(both,3); await checkFlags(3);
  await change(off,false);
  await change(fixed,undefined,1);
  assert.equal(await number('peek 0xfff3'),2,'SVNS must not enable unrelated palette/command extensions');
  await change(following,undefined,0);
  console.log('PASS: SCREEN 0/5/8 initialization and default OFF, text-mode ON rejection, native sprite mode without unrelated extension dependencies');
  for(const test of nativeCases) {
    await run(reset); await run(test.native);
    const expected=await nativeSettings();
    await run(reset); await change(both,3); await change(fixed,undefined,1); await run(test.extended);
    assert.deepEqual(await nativeSettings(),expected,`Native SCREEN parameter behavior: ${test.args}`);
    await checkFlags(3);
    await checkSvns(1);
  }
  await run(allArgs); await checkFlags(3); await checkSvns(1);
  assert.equal(await number('peek 0xfcaf'),5);
  assert.equal(await number('peek 0xc006'),4);
  const all=await nativeSettings();
  assert.equal(all.size,3); assert.equal(all.click,255); assert.equal(all.printer,255); assert.equal(all.interlace,12);
  await run(fontOnly);
  const fontBefore=await snapshot(); await run(reservedSize);
  assert.deepEqual(await snapshot(),fontBefore,'Size-only update must protect a font even without SP3');
  await run(once); await checkFlags(3); await checkSvns(1);
  assert.equal(await number('peek 0xc010'),8,'Every input expression must be evaluated exactly once');
  console.log('PASS: all six native SCREEN arguments, omissions, byte extrema, expressions, full initialization and reservation guards');
  console.log('PASS: all four SPS/S16 combinations, BASIC data integrity, independent register bits and mode-3/font coexistence');
  console.log('PASS: SVNS partial/init/defaults, ILNS preservation, independent bits, eight expressions evaluated once and error recovery');
  if(visual) {
    await run(image);
    const directory=resolve(root,`build/screenshots/shuffle-${machine.startsWith('Panasonic_')?'r800':'z80'}`);
    await mkdir(directory,{recursive:true});
    await msx.command('set renderer SDLGL-PP; set speed 100');
    await msx.advance(0.1);
    await msx.command(`screenshot -raw ${tclString(resolve(directory,'off.png'))}`);
    await change(on,true);
    const before=await snapshot();
    // Capture every frame, so the priority cycle cannot alias with host polling.
    await msx.command(`set ::shuffle_dir ${tclString(directory)}; set ::shuffle_frame 0; set ::shuffle_done 0;
      proc shuffle_capture {} {
        screenshot -raw [file join $::shuffle_dir [format "on-%02d.png" $::shuffle_frame]]
        incr ::shuffle_frame
        if {$::shuffle_frame < 64} {after frame shuffle_capture} else {set ::shuffle_done 1}
      }; after frame shuffle_capture`);
    for(let i=0;i<100 && !await number('set ::shuffle_done');i++) await msx.advance(0.05);
    assert.equal(await number('set ::shuffle_done'),1,'Frame capture');
    assert.deepEqual(await snapshot(),before,'Hardware shuffling must not rewrite VRAM or BASIC state');
    await change(off,false);
    await msx.advance(0.1);
    await msx.command(`screenshot -raw ${tclString(resolve(directory,'restored.png'))}`);
    const frames=JSON.parse(execFileSync('pwsh.exe',['-NoProfile','-File',resolve(root,'tests/read-shuffle.ps1'),'-Directory',directory],{encoding:'utf8',windowsHide:true,maxBuffer:2**20}));
    const isRed=p=>p[0]===255 && p[1]===0 && p[2]===0;
    const fixed=frames.find(f=>f.name==='off.png');
    assert.ok(isRed(fixed.overlap),'Plane 0 must be in front with SPS OFF');
    assert.deepEqual(fixed.planes.map(isRed),Array.from({length:24},(_,i)=>i<16),'Fixed horizontal sprite limit');
    const animated=frames.filter(f=>f.name.startsWith('on-'));
    assert.equal(animated.length,64);
    assert.ok(animated.some(f=>isRed(f.overlap)),'Front red sprite never appeared');
    assert.ok(animated.some(f=>f.overlap.join(',')==='0,255,0'),'Rear green sprite never moved to the front');
    for(let n=0;n<24;n++) assert.ok(animated.some(f=>isRed(f.planes[n])),`Shuffling never displayed plane ${n+2}`);
    for(const f of animated) assert.equal(f.planes.filter(isRed).length,16,'Shuffling must not increase the hardware line limit');
    const restored=frames.find(f=>f.name==='restored.png');
    assert.deepEqual(restored.planes,fixed.planes);
    assert.deepEqual(restored.overlap,fixed.overlap);
    console.log('PASS: 64 rendered frames, automatic front/back switching, all 24 overflow sprites visible over time, 16-per-line limit and OFF restoration');
  }
  await run(finish);
  await msx.type('_SCREEN(,,,,,,4)\r'); await msx.advance(0.2);
  assert.match(await msx.screen(),/Illegal function call/);
  await msx.command('poke 0xc002 0');
  await msx.type('_SCREEN(5,,,,,,1):POKE &HC002,2\r');
  for(let i=0;i<50 && await number('peek 0xc002')!==2;i++) await msx.advance(0.1);
  assert.equal(await number('peek 0xc002'),2,'Direct-mode continuation');
  await msx.advance(0.5);
  await checkSps(true);
  console.log('PASS: direct-mode error and recovery');
} finally { await msx.stop(); }
