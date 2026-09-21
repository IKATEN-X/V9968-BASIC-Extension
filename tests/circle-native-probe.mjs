import assert from 'node:assert/strict';
import {OpenMsx} from '../tools/openmsx.mjs';

const cases=[
  'CIRCLE(100,100),10',
  'CIRCLE STEP(10,-20),10',
  'CIRCLE(-10,100),30,1,,,1',
  'CIRCLE(260,100),30,1,,,1',
  'CIRCLE(-32768,100),0,1,,,1',
  'CIRCLE(32767,100),0,1,,,1',
  'CIRCLE(100,32767),0,1,,,1',
  'CIRCLE(32768,100),0',
  'CIRCLE(-32769,100),0',
  'POKE &HFCB7,255:POKE &HFCB8,127:CIRCLE STEP(1,0),0',
  'POKE &HFCB7,0:POKE &HFCB8,128:CIRCLE STEP(-1,0),0',
  'CIRCLE STEP(USR(5),10),0',
  'CIRCLE STEP(5,USR(10)),0',
  'CIRCLE(10,20),USR(0)',
  'CIRCLE(10,20),-1',
  'CIRCLE(10,20),10,16',
  'CIRCLE(10,20),10,1,,,0',
  'CIRCLE(10,20),10,1,,,1,XOR',
  'CIRCLE(10,20),10,1,-.5,-2,1',
  'CIRCLE(100,100),10,1,,,1',
  'CIRCLE(100,100),-10,1,,,1',
  'CIRCLE(100,100),30.4,1,,,1',
  'CIRCLE(100,100),-30.4,1,,,1',
  'CIRCLE(100,100),32768,1,,,1',
  'CIRCLE(100,100),-32768,1,,,1',
  '_CIRCLE(32768,100),0',
  '_CIRCLE(-32769,100),0',
];
const msx=new OpenMsx({rom:'dist/v9968-basic.rom',machine:'Panasonic_FS-A1ST(V9968)'});
try{
  await msx.command('set throttle on; set speed 400');await msx.advance(12);
  await msx.command('debug write_block memory 0xc100 [binary format H* 21c80022b7fc21960022b9fcc9];poke 0xc002 0');
  const p=['1 CLEAR 512,&HBFFF:ON ERROR GOTO 30000:DEFUSR=&HC100',
    '10 _SCREEN(5):POKE &HC002,1','20 IF PEEK(&HC000)=0 THEN 20',
    '30 A=PEEK(&HC000):POKE &HC000,0:_CLS(0):PSET(100,100),0'];
  for(let i=0;i<cases.length;i+=10)p.push(`${40+i/10} IF A>${i} AND A<=${i+10} THEN ON A-${i} GOSUB ${cases.slice(i,i+10).map((_,j)=>1000+(i+j)*100).join(',')}`);
  p.push('200 _WAIT VDP:POKE &HC001,1:GOTO 20','30000 POKE &HC003,ERR:RESUME 200');
  cases.forEach((c,i)=>p.push(`${1000+i*100} ${c}`,`${1010+i*100} RETURN`));
  await msx.type(p.join('\r')+'\rRUN\r');
  for(let i=0;i<200 && await msx.command('peek 0xc002')!=='1';i++)await msx.advance(.1);
  assert.equal(await msx.command('peek 0xc002'),'1');
  for(const [i,c] of cases.entries()){
    await msx.command(`poke 0xc001 0;poke 0xc003 0;poke 0xc000 ${i+1}`);
    for(let n=0;n<500 && await msx.command('peek 0xc001')!=='1';n++)await msx.advance(.1);
    assert.equal(await msx.command('peek 0xc001'),'1',c);
    const bytes=Buffer.from(await msx.command('binary encode hex [debug read_block {physical VRAM} 0 32768]'),'hex');
    const dots=bytes.reduce((n,v)=>n+(v>>4!==0)+( (v&15)!==0),0);
    console.log(c,await msx.command('list [peek 0xc003] [peek16 0xfcb7] [peek16 0xfcb9]'),`dots=${dots}`);
  }
}finally{await msx.stop();}
