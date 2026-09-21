import assert from 'node:assert/strict';
import { OpenMsx } from '../tools/openmsx.mjs';

// The same turboR ROM with its original V9958 must reject the extension safely.
const msx=new OpenMsx({rom:'dist/v9968-basic.rom',machine:'Panasonic_FS-A1ST'});
const number=async code=>Number(await msx.command(code));
const cases=['_SCREEN(5)','_SCREEN(5,3,1,2,0,0,1)','_SCREEN(,,,,,,1)','_SCREEN(,,,,,,0)',
  '_SCREEN(5,,,,,,2)','_SCREEN(5,,,,,,3)','_SCREEN(,,,,,,2)','_SCREEN(,,,,,,3)',
  '_SCREEN(,,,,,,,0)','_SCREEN(,,,,,,,1)','_SCREEN(5,3,1,2,0,0,3,1)',
  '_SCREEN(5,,,,,4)','_SCREEN(,,,,,4)','_SCREEN(8,,,,,4)','_SCREEN(7)','_SCREEN(7,,,,,4)',
  '_SCREEN(6)','_SCREEN(6,,,,,4)','_PATTERN ON(7)','_SPRITE(3)'];
async function snapshot() {
  return msx.command('list [binary encode hex [debug read_block {VDP regs} 0 28]] '+
    '[binary encode hex [debug read_block {physical VRAM} 0 131072]] '+
    '[binary encode hex [debug read_block memory 0xffe7 16]] '+
    '[binary encode hex [debug read_block memory 0xfffa 3]] '+
    '[binary encode hex [debug read_block memory 0xf3df 8]] '+
    '[peek 0xfcaf] [peek16 0xfaf5] [peek16 0xfc4a] '+
    '[peek 0xf3db] [peek 0xf417] [binary encode hex [debug read_block memory 0xf406 5]]');
}
try {
  await msx.ready;
  await msx.advance(12);
  await msx.command('poke 0xc000 0; poke 0xc001 0; poke 0xc002 0; poke 0xc003 0');
  const program=[
    '1 CLEAR 200,&HBFFF:DEFINT A-Z:ON ERROR GOTO 30000',
    '10 SCREEN 5:POKE &HC000,1',
    '20 IF PEEK(&HC001)=0 THEN 20',
    '30 A=PEEK(&HC001):POKE &HC001,0',
    `40 ON A GOSUB ${cases.map((_,i)=>100+i*100).join(',')}`,
    '50 POKE &HC002,1:GOTO 20',
    '30000 POKE &HC003,ERR:POKE &HC004,ERL MOD 256:POKE &HC005,ERL\\256:RESUME NEXT',
    ...cases.flatMap((code,i)=>[`${100+i*100} ${code}`,`${110+i*100} RETURN`])
  ];
  await msx.type(program.join('\r')+'\rRUN\r');
  for(let i=0;i<30 && !await number('peek 0xc000');i++) await msx.advance(1);
  assert.equal(await number('peek 0xc000'),1,'BASIC harness startup');
  const before=await snapshot();
  for(let i=0;i<cases.length;i++) {
    await msx.command(`poke 0xc002 0; poke 0xc003 0; poke 0xc001 ${i+1}`);
    for(let n=0;n<40 && !await number('peek 0xc002');n++) await msx.advance(0.1);
    assert.equal(await number('peek 0xc002'),1,'RESUME NEXT');
    assert.equal(await number('peek 0xc003'),5,cases[i]);
    assert.equal(await number('peek16 0xc004'),100+i*100,'ERL');
    assert.equal(await snapshot(),before,`${cases[i]} changed V9958 state`);
  }
  console.log('PASS [Panasonic_FS-A1ST, V9958]: SCREEN/shuffle rejected with ERR=5, ERR/ERL/RESUME NEXT and unchanged VRAM/registers/native settings');
} finally { await msx.stop(); }
