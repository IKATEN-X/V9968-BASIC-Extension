import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { OpenMsx, tclString } from '../tools/openmsx.mjs';

const machine=process.argv.includes('V9968_Basic')?'V9968_Basic':'Panasonic_FS-A1ST(V9968)';
const root=resolve(import.meta.dirname,'..');
const directory=resolve(root,`build/screenshots/svns-${machine==='V9968_Basic'?'z80':'r800'}`);
await mkdir(directory,{recursive:true});
const msx=new OpenMsx({rom:'dist/v9968-basic.rom',machine});
const setups=[null,...[1,2].map(mode=>[
  `SCREEN ${mode===1?2:4},0:COLOR 15,0,0:CLS:COLOR=(8,7,0,0):COLOR=(3,0,7,0)`,
  'SPRITE$(0)=STRING$(8,255):PUT SPRITE 0,(104,96),8,0:LINE(24,144)-(39,159),3,BF'
]),[
  '_SCREEN(5):_COLOR=(0,0,0,0):_COLOR=(2,31,0,0):_COLOR=(3,0,31,0)',
  '_SET PAGE(0,7):_CLS(0):_LINE(0,0)-(15,15),2,BF',
  '_SET PAGE(0,0):_CLS(0):_LINE(24,144)-(39,159),3,BF:_SPRITE(3):_PUT SPRITE(0,104,96),0,1792'
]];
const commands=[...new Set(['_SCREEN(0)',...setups.slice(1).flat(),
  'VDP(24)=0:_SCREEN(,,,,,,,1)','VDP(24)=32','_SCREEN(,,,,,,,0)','_SCREEN(,,,,,,,1)','VDP(24)=0:_SCREEN(0)'])];
async function statement(code) {
  const index=commands.indexOf(code);assert.ok(index>=0,code);
  await msx.command(`poke 0xc001 0; poke 0xc003 0; poke 0xc000 ${index+1}`);
  for(let i=0;i<100 && await msx.command('peek 0xc001')!=='1';i++) await msx.advance(0.1);
  assert.equal(await msx.command('peek 0xc003'),'0',`BASIC error in ${code}`);
  assert.equal(await msx.command('peek 0xc001'),'1',`Timeout: ${code}`);
}
async function capture(mode,name) {
  await msx.advance(0.1);
  const path=resolve(directory,`mode${mode}-${name}.png`);
  await msx.command(`screenshot -raw ${tclString(path)}`);
  const png=JSON.parse(execFileSync('pwsh.exe',['-NoProfile','-File',resolve(root,'tests/read-png.ps1'),'-Path',path],{encoding:'utf8',windowsHide:true,maxBuffer:2**20}));
  const rgb=Buffer.from(png.rgb,'base64');
  const points=color=>{
    const result=[];
    for(let y=0;y<png.height;y++) for(let x=0;x<png.width;x++) {
      const p=(y*png.width+x)*3;
      if(color(rgb[p],rgb[p+1],rgb[p+2])) result.push([x,y]);
    }
    assert.ok(result.length>20,`${name} missing rendered object`);
    return [Math.min(...result.map(p=>p[0])),Math.min(...result.map(p=>p[1])),result.length];
  };
  return {sprite:points((r,g,b)=>r>240 && g<10 && b<10),background:points((r,g,b)=>r<10 && g>240 && b<10)};
}
try {
  await msx.ready;await msx.command('set throttle on; set speed 1000');await msx.advance(12);
  await msx.command('poke 0xc000 0; poke 0xc001 0; poke 0xc002 0');
  const program=[
    '1 CLEAR 200,&HBFFF:ON ERROR GOTO 30000',
    '10 KEY OFF:POKE &HC002,1',
    '20 IF PEEK(&HC000)=0 THEN 20',
    '30 A=PEEK(&HC000):POKE &HC000,0',
    `40 ON A GOSUB ${commands.map((_,i)=>1000+i*100).join(',')}`,
    '50 POKE &HC001,1:GOTO 20',
    ...commands.flatMap((code,i)=>[`${1000+i*100} ${code}`,`${1010+i*100} RETURN`]),
    '30000 POKE &HC003,ERR:RESUME 50'
  ];
  await msx.type(program.join('\r')+'\rRUN\r');
  for(let i=0;i<100 && await msx.command('peek 0xc002')!=='1';i++) await msx.advance(0.5);
  assert.equal(await msx.command('peek 0xc002'),'1','Harness startup');
  await msx.command('set renderer SDLGL-PP; set speed 100');
  for(const mode of [1,2,3]) {
    await statement('_SCREEN(0)');
    for(const code of setups[mode]) await statement(code);
    await statement('VDP(24)=0:_SCREEN(,,,,,,,1)');
    const zero=await capture(mode,'zero');
    await statement('VDP(24)=32');
    const fixed=await capture(mode,'fixed');
    assert.deepEqual(fixed.sprite,zero.sprite,`Mode ${mode}: SVNS must keep sprites stationary`);
    assert.equal(fixed.background[1],zero.background[1]-32,'Background must scroll with SVNS enabled');
    const before=await msx.command('binary encode hex [debug read_block {physical VRAM} 0 262144]');
    await statement('_SCREEN(,,,,,,,0)');
    const moving=await capture(mode,'following');
    assert.equal(moving.sprite[1],fixed.sprite[1]-32,`Mode ${mode}: SVNS OFF must restore the scroll offset`);
    assert.equal(moving.sprite[0],fixed.sprite[0]);assert.equal(moving.sprite[2],fixed.sprite[2]);
    assert.deepEqual(moving.background,fixed.background);
    assert.equal(await msx.command('binary encode hex [debug read_block {physical VRAM} 0 262144]'),before,'SVNS must not rewrite VRAM');
    await statement('_SCREEN(,,,,,,,1)');
    assert.deepEqual(await capture(mode,'restored'),fixed,'SVNS restoration');
    console.log(`PASS [${machine}]: sprite mode ${mode}, rendered fixed/following positions, background scroll and unchanged VRAM`);
  }
  await statement('VDP(24)=0:_SCREEN(0)');
} finally {await msx.stop();}
