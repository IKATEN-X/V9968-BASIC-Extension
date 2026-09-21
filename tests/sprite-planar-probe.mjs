import assert from 'node:assert/strict';
import { OpenMsx } from '../tools/openmsx.mjs';

// Diagnostic only: native OUTs deliberately bypass the extension's mode guard.
const machine=process.argv.includes('V9968_Basic')?'V9968_Basic':'Panasonic_FS-A1ST(V9968)';
const msx=new OpenMsx({rom:'dist/v9968-basic.rom',machine});
const number=async c=>Number(await msx.command(c));
try {
  await msx.command('set throttle on; set speed 1000');await msx.advance(12);
  await msx.command('poke 0xc003 0');
  await msx.type('NEW\r1 CLEAR 200,&HBFFF\r10 IF PEEK(&HC003)=0 THEN 10\r20 M=PEEK(&HC003):POKE &HC003,0:_SCREEN(M):_WAIT VDP:VDP(21)=121:VDP(9)=VDP(9) OR 2\r25 POKE &HC000,1\r30 IF PEEK(&HC001)=0 THEN 30\r40 OUT &H99,13:OUT &H99,&H8E:OUT &H99,0:OUT &H99,&H7E:OUT &H98,&HA5:OUT &H98,&H5A\r50 POKE &HC000,2:GOTO 10\rRUN\r');
  for(const mode of [5,6,7,8]) {
    await msx.command(`poke 0xc000 0; poke 0xc001 0; poke 0xc003 ${mode}`);
    for(let i=0;i<100 && await number('peek 0xc000')!==1;i++) await msx.advance(.1);
    assert.equal(await number('peek 0xc000'),1,'Probe initialization');
    await msx.command('debug write {physical VRAM} 0x37e00 0; debug write {physical VRAM} 0x37e01 0; debug write {physical VRAM} 0x2bf00 0; debug write {physical VRAM} 0x3bf00 0; poke 0xc001 1');
    for(let i=0;i<100 && await number('peek 0xc000')!==2;i++) await msx.advance(.1);
    assert.equal(await number('peek 0xc000'),2,'Probe OUT completion');
    const addresses=[0x37e00,0x37e01,0x2bf00,0x3bf00],values=[];
    for(const a of addresses) values.push(await number(`debug read {physical VRAM} ${a}`));
    console.log(`SCREEN ${mode} SP3=1: ${addresses.map((a,i)=>`${a.toString(16)}=${values[i].toString(16).padStart(2,'0')}`).join(' ')}; expected linear a5 5a 00 00`);
    assert.deepEqual(values,mode<7?[0xa5,0x5a,0,0]:[0,0,0xa5,0x5a],'Pinned fork diagnostic changed; reassess planar support');
  }
} finally {await msx.stop();}
