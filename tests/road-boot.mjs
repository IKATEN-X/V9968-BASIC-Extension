import assert from 'node:assert/strict';
import { prepareDemoDisk } from '../tools/demo-disk.mjs';
import { OpenMsx } from '../tools/openmsx.mjs';

const disk=await prepareDemoDisk({entry:'ROAD.BAS'});
const msx=new OpenMsx({rom:'dist/v9968-basic.rom',machine:'Panasonic_FS-A1ST(V9968)',diskDirectory:disk.directory});
const number=async code=>Number(await msx.command(code));
try {
  await msx.ready;await msx.advance(25);
  assert.equal(await number('peek 0xfcaf'),5,`ROAD direct boot: ${await msx.screen().catch(()=>'(graphics mode)')}`);
  assert.equal(await number('debug read {VDP regs} 20'),0x1b,'SVNS and sprite mode 3');
  assert.equal(await number('debug read {VDP regs} 8')&2,0,'Player sprite is enabled');
  const scroll=await number('debug read {VDP regs} 23');
  let moved=false;
  for(let i=0;i<5 && !moved;i++) {await msx.advance(.1);moved=(await number('debug read {VDP regs} 23'))!==scroll;}
  assert.ok(moved,'Road is scrolling after direct boot');
  await msx.type('\x1b');await msx.advance(3);
  assert.equal(await number('peek 0xfcaf'),0);
  assert.match(await msx.screen(),/V9968 DEMO DISK/,'Moved exit line returns to the menu');
  console.log('PASS: direct ROAD.BAS boot through AUTOEXEC, scrolling, sprite mode 3 and Escape menu return');
} finally {await msx.stop();}
