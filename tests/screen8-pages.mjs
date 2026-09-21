import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { OpenMsx, tclString } from '../tools/openmsx.mjs';

const root=resolve(import.meta.dirname,'..');
const machine=process.argv.includes('V9968_Basic')?'V9968_Basic':'Panasonic_FS-A1ST(V9968)';
const msx=new OpenMsx({rom:'dist/v9968-basic.rom',machine});
const number=async code=>Number(await msx.command(code));
const vram=async()=>await msx.command('binary encode hex [debug read_block {physical VRAM} 0 262144]');
const colors=[[255,0,0],[0,255,0],[0,0,255],[255,255,255]];
try {
  await msx.command('set throttle on; set speed 400');await msx.advance(12);
  assert.equal(await msx.command('get_active_cpu'),machine==='V9968_Basic'?'z80':'r800','Actual test CPU');
  await msx.command('poke 0xc000 0; poke 0xc002 0');
  const program=['10 CLEAR 512,&HBFFF:DEFINT A-Z:_SCREEN(8):COLOR 255,0,0',
    '20 _COLOR=(128,31,0,0):_COLOR=(129,0,31,0):_COLOR=(130,0,0,31):_COLOR=(131,31,31,31)',
    '30 FOR P=0 TO 3:_SET PAGE(0,P):_CLS(128+P):NEXT P:_SET PAGE(0,0):_WAIT VDP:POKE &HC002,1',
    '40 IF PEEK(&HC000)=0 THEN 40',
    '50 A=PEEK(&HC000):POKE &HC000,0:_SCREEN(,,,,,0):_SET PAGE(0,0)',
    '60 IF A<5 THEN _SET PAGE(A-1,0) ELSE _SCREEN(,,,,,4):_SET PAGE(A-5,0)',
    '70 POKE &HC001,1:GOTO 40'];
  await msx.type(program.join('\r')+'\rRUN\r');
  for(let i=0;i<100 && !await number('peek 0xc002');i++) await msx.advance(.5);
  assert.equal(await number('peek 0xc002'),1,'BASIC harness startup');
  const material=await vram();
  await mkdir(resolve(root,'build/screenshots'),{recursive:true});
  await msx.command('set renderer SDLGL-PP; set deinterlace on; set minframeskip 0; set maxframeskip 0');
  for(let i=0;i<6;i++) {
    await msx.command(`poke 0xc001 0; poke 0xc000 ${i+1}`);
    for(let n=0;n<50 && !await number('peek 0xc001');n++) await msx.advance(.1);
    assert.equal(await number('peek 0xc001'),1,`Page selection ${i}`);
    await msx.advance(.2);
    const fil=i>=4,page=fil?i-4:i,path=resolve(root,`build/screenshots/screen8-pages-${machine==='V9968_Basic'?'z80':'r800'}-${fil?'fil':'normal'}-${page}.png`);
    await msx.command(`screenshot -raw -size 640 ${tclString(path)}`);
    const png=JSON.parse(execFileSync('pwsh.exe',['-NoProfile','-File',resolve(root,'tests/read-png.ps1'),'-Path',path],{encoding:'utf8',windowsHide:true,maxBuffer:2**22}));
    assert.equal(png.width,640);assert.equal(png.height,480);
    const rgb=Buffer.from(png.rgb,'base64'),at=y=>[...rgb.subarray((y*640+320)*3,(y*640+320)*3+3)];
    // Pin the existing fork limitation, rather than claiming four displayed pages.
    assert.deepEqual(at(100),colors[fil?0:page%2]);
    assert.deepEqual(at(400),colors[fil?1:page%2]);
    assert.equal(await vram(),material,'Display switches do not modify any page');
    assert.equal(await number('peek 0xfaf5'),fil?page*2:page,'Native display page shadow');
    console.log(`PASS [${machine}]: ${fil?'FIL':'normal'} requested page ${page}, displayed ${fil?'native pages 0/1':`native page ${page%2}`}, all source bytes intact`);
  }
  console.log('CONFIRMED: pinned fork displays normal pages 0/1 and FIL page 0 only; upper drawing pages alias the lower display pages. Emulator code unchanged.');
} finally {await msx.stop();}
