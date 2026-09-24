import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { OpenMsx } from '../tools/openmsx.mjs';
import { checkFontDemo } from './font-demo.mjs';

const machine = process.argv.find(a => a === 'V9968_Basic' || a.startsWith('Panasonic_')) ?? 'Panasonic_FS-A1ST(V9968)';
const visual = process.argv.includes('--visual');
const msx = new OpenMsx({rom: 'dist/v9968-basic.rom', machine});
const sample = [
  'PSET(16,16):PRINT #1,"ABCD 0123";',
  'PRINT #1," EF"',
  'PRINT #1,"NEXT";',
  'PSET(24,48):PRINT #1,123;" / ";-45;',
  'PSET(24,72):PRINT #1,USING "###.##";12.5',
  'PSET(160,40),15,XOR:PRINT #1,"XOR";',
  'COLOR 6,3:PSET(160,64):PRINT #1,"COLOR";:COLOR 15,0',
  'PSET(248,96):PRINT #1,"ABCD";',
  'PSET(16,120):PRINT #1,CHR$(1)+CHR$(65)+CHR$(1)+CHR$(95);',
  'PSET(16,136):PRINT #1,"A"+CHR$(9)+"B"+CHR$(8)+"C";',
  'PSET(16,152):PRINT #1,CHR$(1)+"abAB";',
  'PSET(0,160):FOR C=32 TO 255:PRINT #1,CHR$(C);:NEXT C',
  'PSET(16,208):PRINT #1,"EDGE";'
];
const cases = [
  ['_FONT(0):_SET PAGE(0,0):_CLS(5):COLOR 15,0,0', ...sample, '_WAIT VDP'],
  ['_FONT(1):_SET PAGE(1,1):_CLS(5)', ...sample],
  ['_FONT(2):_SET PAGE(2,2):_CLS(0):PSET(16,16):PRINT #1,"ABCD";'],
  ['A$=CHR$(129)+CHR$(66)+CHR$(36)+CHR$(24)', '_FONT$(65)=A$+A$', 'PSET(16,40):PRINT #1,"A";'],
  ['_FONT(4)'],
  ['_FONT$(-1)="12345678"'],
  ['_FONT$(256)="12345678"'],
  ['_FONT$(65)="1234567"'],
  ['_FONT$(65)=123'],
  ['_SET PAGE(2,6):_PSET(0,236),1'],
  ['_LINE(0,240)-(255,200),1'],
  ['_COPY(0,0)-(15,15),0 TO (0,230),6'],
  ['_CLS(3):_WAIT VDP'],
  ['_SPRITE(3):_PUT SPRITE(0,50,50),0,1792', '_FONT(1):_WAIT VDP'],
  ['_PUT SPRITE(1,50,50),0,1760'],
  ['_FONT(0):_SET PAGE(3,3):_CLS(5)', ...sample, '_WAIT VDP'],
  ['_FONT$(65)="12345678"'],
  ['_FONT(1):_SET PAGE(2,2):_CLS(5)', 'PSET(249,120):PRINT #1,"AB";', 'PSET(253,144):PRINT #1,"AB";'],
  ['OPEN "CRT:" AS #2:PRINT #2,"CRT OUTPUT":CLOSE #2'],
  ['_SET PAGE(2,7):_CLS(0):PSET(160,40):PRINT #1,"AB";'],
  ['_SCREEN(0):CLOSE:PRINT "FONT TEST DONE":POKE &HC001,1:END'],
  ['_FONT(1):VDP(21)=VDP(21) AND 254:_SET PAGE(2,2):_CLS(5):COLOR 15,0,0', ...sample]
];
const read = async a => Number(await msx.command(`peek ${a}`));
const block = async (dev, addr, size) => Buffer.from(await msx.command(`binary encode hex [debug read_block {${dev}} ${addr} ${size}]`), 'hex');
async function run(index, error = 0) {
  await msx.command(`poke 0xC001 0; poke 0xC003 0; poke 0xC000 ${index}`);
  for (let i = 0; i < 40 && !await read(0xC001); i++) await msx.advance(0.2);
  if(!await read(0xC001))console.log('Timeout state:',await msx.command('list [reg PC] [reg SP] [peek16 0xf41c] [peek 0xfcaf] [peek16 0xf6c6]'),await msx.screen().catch(()=> 'graphics'));
  assert.ok(await read(0xC001), `case ${index} timed out, ERR=${await read(0xC003)}`);
  if(await read(0xC003)!==error) console.log('Error trace:', await msx.command('set ::font_error'));
  assert.equal(await read(0xC003), error, `case ${index}: ${cases[index-1].join(':')}`);
}
try {
  if(process.argv.includes('--realtime')) await msx.command('set throttle on; set speed 100');
  await msx.advance(12);
  const work = (await read(0xFD2F) + 256*await read(0xFD30)) & 0xFFFE;
  const himem = await read(0xFC4A) + 256*await read(0xFC4B);
  assert.ok(work > himem && work+32 <= 0xF380, 'font RAM must be outside BASIC memory');
  const word = async a => Number(await msx.command(`peek16 ${a}`));
  const files = await read(0xF85F)+1, fileTable = await word(0xF860);
  assert.equal(fileTable+files*267,himem,'Boot reservation must also relocate BASIC file buffers');
  assert.equal(await word(0xF672)+2,fileTable,'String heap must end below file buffers before the first CLEAR');
  assert.equal(await word(0xF862),fileTable+files*2+9,'Default output buffer must follow its relocated FCB');
  for(let n=0;n<files;n++) assert.equal(await word(fileTable+n*2),fileTable+files*2+n*265,'FCB pointers must follow relocated buffers');
  const map = await readFile('build/v9968-basic.map', 'utf8');
  const draw = /font_draw\s+= \$([0-9A-F]+)/i.exec(map)[1];
  const advance = /\bfont_advance\s+= \$([0-9A-F]+)/i.exec(map)[1];
  const illegal = /\billegal\s+= \$([0-9A-F]+)/i.exec(map)[1];
  await msx.command(`set ::font_error {}; debug set_bp 0x${illegal} {[pc_in_slot 1]} {set ::font_error [list [reg A] [reg HL] [reg IX] [binary encode hex [debug read_block memory [reg SP] 8]] [binary encode hex [debug read_block memory 0xFD89 16]] [binary encode hex [debug read_block memory [reg HL] 16]]]}`);
  await msx.command(`set ::font_calls 0; debug set_bp 0x${draw} {[pc_in_slot 1]} {incr ::font_calls}`);
  // Check each visible glyph before cursor advance, not after BASIC or host polling has allowed it to finish.
  await msx.command(`set ::font_completions 0; set ::font_busy 0; set ::font_register_errors 0;
    debug set_bp 0x${advance} {[pc_in_slot 1] && [peek16 0xFCB7] < 256 && [peek16 0xFCB9] < 212} {
      incr ::font_completions
      set ::font_busy [expr {$::font_busy | ([debug read {VDP status regs} 2] & 1)}]
      if {[debug read {VDP regs} 12] != [peek 0xFFEB] || [debug read {VDP regs} 15] != 0} {
        incr ::font_register_errors
      }
    }`);
  const program = [
    '1 CLEAR 200,&HBFFF:MAXFILES=2', '5 ON ERROR GOTO 30000',
    '6 POKE &HC000,0:POKE &HC001,0:POKE &HC003,0',
    '10 _V9968:_SCREEN(5):OPEN "GRP:" AS #1',
    '11 POKE &HC002,1',
    '20 IF PEEK(&HC000)=0 THEN 20', '30 A=PEEK(&HC000):POKE &HC000,0',
    `40 IF A<=15 THEN ON A GOSUB ${cases.slice(0,15).map((_,i)=>1000+i*100).join(',')}`,
    `45 IF A>15 THEN ON A-15 GOSUB ${cases.slice(15).map((_,i)=>2500+i*100).join(',')}`,
    '50 POKE &HC001,A:GOTO 20',
    '30000 POKE &HC003,ERR:POKE &HC001,255:RESUME 20'
  ];
  for (const [i, lines] of cases.entries()) {
    lines.forEach((line, j) => program.push(`${1000+i*100+j*5} ${line}`));
    program.push(`${1000+i*100+lines.length*5} RETURN`);
  }
  await msx.command('poke 0xC002 0');
  await msx.type(program.join('\r')+'\rRUN\r');
  for(let i=0;i<100 && !await read(0xC002);i++) await msx.advance(0.2);
  assert.equal(await read(0xC002),1,'Font test program did not finish loading and initialization');
  const previousHook = await block('memory', 0xFEE4, 5);
  const countingHook = [0xF5,0xE5,0x21,0x80,0xC0,0x34,0xE1,0xF1,0xC3,0x10,0xC1];
  const pokes = countingHook.map((v,i)=>`poke ${0xC100+i} ${v}`);
  [...previousHook,0xC9].forEach((v,i)=>pokes.push(`poke ${0xC110+i} ${v}`));
  [0xC3,0,0xC1,0,0].forEach((v,i)=>pokes.push(`poke ${0xFEE4+i} ${v}`));
  await msx.command(pokes.join('; '));
  await run(1);
  const native = await block('physical VRAM', 0, 27136);
  await run(2);
  const rendered = await block('physical VRAM', 32768, 27136);
  if (!rendered.equals(native)) {
    const differences = [];
    for(let i=0;i<native.length && differences.length<20;i++) if(native[i]!==rendered[i]) differences.push([i%128*2,Math.floor(i/128),native[i],rendered[i]]);
    console.log('First differences [x,y,native,font]:', differences);
  }
  assert.ok(rendered.equals(native), 'LFMM must match ordinary GRP including formatting and whole-character edges');
  assert.ok(Number(await msx.command('set ::font_calls'))>20, 'GRP must actually use the V9968 renderer');
  const regularFont = await block('physical VRAM', 0x37600, 2048);
  assert.equal(await read(work), 1);
  assert.equal(Number(await msx.command('debug read {VDP regs} 12')), await read(0xFFEB));
  assert.equal(Number(await msx.command('debug read {VDP regs} 14')), await read(0xFFED));
  console.log(`PASS [${machine}]: native GRP compatibility, numeric formatting, semicolons, CR/LF and clipping`);
  await run(3);
  const bold = await block('physical VRAM', 0x37600, 2048);
  assert.deepEqual(bold, regularFont.map(b => b | (b >>> 1)));
  await run(4);
  assert.deepEqual(await block('physical VRAM', 0x37600+65*8, 8), Buffer.from([129,66,36,24,129,66,36,24]));
  const page = await block('physical VRAM', 65536, 27136);
  for(let y=0;y<8;y++) for(let x=0;x<8;x++) {
    const byte=page[(40+y)*128+((16+x)>>1)];
    const color=x&1?byte&15:byte>>4;
    assert.equal(color, ([129,66,36,24][y%4] & (128>>x)) ? 15 : 0);
  }
  console.log('PASS: bold selection, BASIC string expression and custom glyph rendered through GRP');
  for(const [i,e] of [[5,5],[6,5],[7,5],[8,5],[9,13],[10,5],[11,5],[12,5]]) await run(i,e);
  const customFont = await block('physical VRAM', 0x37600, 2048);
  await run(13);
  assert.deepEqual(await block('physical VRAM', 0x37600, 2048), customFont);
  await run(14);
  assert.deepEqual(await block('physical VRAM', 0x37600, 2048), regularFont);
  const sat = await block('physical VRAM', 0x37E00, 512);
  assert.equal(sat[4],50);
  await run(15,5);
  assert.deepEqual(await block('physical VRAM', 0x37E00, 512), sat);
  console.log('PASS: atomic errors, font VRAM protection, CLS, Sprite mode 3 coexistence');
  await run(16);
  assert.deepEqual(await block('physical VRAM', 98304, 27136), native);
  await run(17,5);
  await run(18);
  const clipped = await block('physical VRAM', 65536, 27136);
  for(const [x,y] of [[249,120],[253,144]]) for(let row=0;row<8;row++) for(let col=0;col<256-x;col++) {
    const byte=clipped[(y+row)*128+((x+col)>>1)];
    assert.equal((x+col)&1?byte&15:byte>>4, regularFont[65*8+row]&(128>>col)?15:0, 'partial glyph must clip each source row');
  }
  const calls = await msx.command('set ::font_calls');
  await msx.command('poke 0xC080 0');
  await run(19);
  assert.equal(await msx.command('set ::font_calls'), calls, 'CRT: must not use the font renderer');
  assert.ok(await read(0xC080), 'previous H.OUTD hook must still be called');
  const page3 = await block('physical VRAM', 98304, 27136);
  await run(20);
  assert.deepEqual(await block('physical VRAM', 98304, 27136), page3, 'expanded page output must not alias page 3');
  const page7 = await block('physical VRAM', 7*32768, 27136);
  for(let row=0;row<8;row++) for(let col=0;col<16;col++) {
    const byte=page7[(40+row)*128+((160+col)>>1)];
    assert.equal(col&1?byte&15:byte>>4, regularFont[(65+(col>>3))*8+row]&(128>>(col&7))?15:0);
  }
  const slowCalls=Number(await msx.command('set ::font_calls'));
  await run(22);
  assert.deepEqual(await block('physical VRAM',65536,27136),native,'HS-off LFMM must match native GRP pixels');
  assert.ok(Number(await msx.command('set ::font_calls'))>slowCalls+20,'Disabling HS must not bypass LFMM');
  assert.equal(Number(await msx.command('debug read {VDP regs} 20'))&1,0,'Font output must not re-enable HS');
  console.log('PASS: LFMM with HS disabled, no implicit re-enable or native-renderer fallback');
  await run(21);
  assert.match(await msx.screen(), /FONT TEST DONE/);
  assert.equal(await read(work), 0);
  console.log('PASS: FONT(0), partial glyph clipping, CRT: pass-through, SCREEN reset and normal text output');
  await msx.type('NEW\r');
  await msx.advance(0.5);
  await msx.command('poke 0xC000 0; poke 0xC001 0');
  await msx.type([
    '10 _SCREEN(5):_FONT(1):_FONT$(65)="12345678"',
    '20 CLEAR 200,&HBFFF',
    '30 OPEN "GRP:" AS #1:PSET(16,16):PRINT #1,"A";',
    '40 POKE &HC001,1', '50 IF PEEK(&HC000)=0 THEN 50',
    '60 CLOSE:_FONT(0):_SCREEN(0):END'
  ].join('\r')+'\rRUN\r');
  await msx.advance(5);
  assert.equal(await read(0xC001),1,'NEW/CLEAR must leave the hook usable');
  assert.equal(await read(work),1);
  assert.deepEqual(await block('physical VRAM',0x37600+65*8,8),Buffer.from('12345678'));
  await msx.command('poke 0xC000 1');
  await msx.advance(0.5);
  console.log('PASS: boot RAM reservation, previous hook chaining, NEW/CLEAR lifecycle, VDP register restoration');
  console.log('PASS: expanded page 7');
  await checkFontDemo(msx,{machine,visual});
  assert.ok(Number(await msx.command('set ::font_completions'))>1000,'Must check LFMM completion across samples and the full-screen font demo');
  assert.equal(Number(await msx.command('set ::font_busy')),0,'Font output must wait for each LFMM transfer before returning');
  assert.equal(Number(await msx.command('set ::font_register_errors')),0,'Font output must restore background and status selection before returning');
  console.log('PASS: synchronous LFMM glyph output and register restoration without explicit WAIT VDP');
} finally { await msx.stop(); }
