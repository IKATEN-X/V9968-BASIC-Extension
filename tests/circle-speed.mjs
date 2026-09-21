import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import {OpenMsx} from '../tools/openmsx.mjs';

const option=(name,fallback)=>process.argv.find(v=>v.startsWith(`--${name}=`))?.split('=').slice(1).join('=')??fallback;
const rom=option('rom','dist/v9968-basic.rom');
const compare=option('compare',null);
const label=option('label','current');
const trace=process.argv.includes('--trace');
const speed=option('speed',null);
if(speed!==null)assert.ok(Number.isFinite(Number(speed))&&Number(speed)>0);
assert.match(label,/^[a-z0-9-]+$/i);
const shapes=[['circle',',60,1,,,1'],['default',',60,1'],['ellipse',',60,1,,,.5'],['arc',',60,1,.5,2,1']];
const timed=shapes.flatMap(([name,tail])=>[false,true].map(extended=>({name,extended,
  code:`_SCREEN(5):_CLS(0):_WAIT VDP:TIME=0:FOR I=1 TO 20:${extended?'_':''}CIRCLE(100,100)${tail}:NEXT:_WAIT VDP:T=TIME:POKE &HC004,T MOD 256:POKE &HC005,T\\256`} )));

// Exercise every octant boundary, both sweep directions, and Q14 rounding
// independently of the native CIRCLE's different endpoint rasterization.
const geometry=[];
for(let oct=0;oct<8;oct++)for(const delta of [-.00001,0,.00001])for(const sweep of [.15,2,5.9]) {
  const s=(oct*Math.PI/4+delta+2*Math.PI)%(2*Math.PI),e=(s+sweep)%(2*Math.PI);
  const aspect=[1,.25,2][Math.round(sweep) % 3];
  geometry.push(`_CIRCLE(120,120),60,1,${s},${e},${aspect}`);
}
for(const [x,y,r,a] of [[0,0,0,1],[255,255,1,.5],[0,255,31,2],[255,0,100,.25],[128,128,32767,1000],[0,0,32767,.001],[120,120,60,.00001]])
  geometry.push(`_CIRCLE(${x},${y}),${r},1,,,${a}`);
for(const [s,e] of [[-.5,-2],[-5,-1],[0,0],[0,2*Math.PI],[2*Math.PI,0],[.00001,.00002],[.00002,.00001],[1,1.00001]])
  geometry.push(`_CIRCLE(120,120),60,1,${s},${e},1`);
const pixels=geometry.map(code=>({code:`_SCREEN(5):_CLS(0):${code}:_WAIT VDP`}));

async function run(machine,target,cases,capture=false){
  const msx=new OpenMsx({rom:target,machine});
  try{
    // Bound host scheduling during long bitmap matrices. TIME still measures
    // emulated time, including in the unthrottled, separate timing runs.
    if(capture||speed!==null)await msx.command(`set throttle on; set speed ${Number(speed??400)}`);
    await msx.advance(12);
    const cpu=await msx.command('get_active_cpu');
    await msx.command('poke 0xc002 0');
    const p=['1 CLEAR 512,&HBFFF:ON ERROR GOTO 30000','10 POKE &HC002,1',
      '20 IF PEEK(&HC000)=0 THEN 20','30 A=PEEK(&HC000):POKE &HC000,0'];
    for(let i=0;i<cases.length;i+=16)p.push(`${40+i/16} IF A>${i} AND A<=${i+16} THEN ON A-${i} GOSUB ${cases.slice(i,i+16).map((_,j)=>1000+(i+j)*100).join(',')}`);
    p.push('200 POKE &HC001,1:GOTO 20','30000 POKE &HC003,ERR:RESUME 200');
    cases.forEach((c,i)=>p.push(`${1000+i*100} ${c.code}`,`${1010+i*100} RETURN`));
    assert.ok(p.every(line=>line.length<255));
    await msx.type(p.join('\r')+'\rRUN\r');
    for(let i=0;i<300 && await msx.command('peek 0xc002')!=='1';i++)await msx.advance(.1);
    assert.equal(await msx.command('peek 0xc002'),'1','Harness startup');
    const results=[];
    for(let n=0;n<cases.length;n++){
      if(trace)console.log(`${machine} ${target} ${n+1}/${cases.length}: ${cases[n].code}`);
      await msx.command(`poke 0xc001 0;poke 0xc003 0;poke 0xc000 ${n+1}`);
      for(let i=0;i<400 && await msx.command('peek 0xc001')!=='1';i++)await msx.advance(.1);
      assert.equal(await msx.command('peek 0xc001'),'1',`Timeout: ${cases[n].code}`);
      assert.equal(await msx.command('peek 0xc003'),'0',cases[n].code);
      if(capture)results.push(Buffer.from(await msx.command('binary encode hex [debug read_block {physical VRAM} 0 32768]'),'hex'));
      else {
        assert.equal(Number(await msx.command('debug read {VDP regs} 9'))&2,0,'60Hz timing');
        const ticks=Number(await msx.command('peek16 0xc004'));
        const result={machine,cpu,shape:cases[n].name,extended:cases[n].extended,ticks,seconds:ticks/60};
        results.push(result);console.log(JSON.stringify(result));
      }
    }
    return results;
  }finally{await msx.stop();}
}

const results=[];
for(const machine of ['Panasonic_FS-A1ST(V9968)','V9968_Basic']){
  if(compare){
    const reference=await run(machine,compare,pixels,true);
    const actual=await run(machine,rom,pixels,true);
    for(let i=0;i<pixels.length;i++)assert.ok(actual[i].equals(reference[i]),`${machine}: ${geometry[i]}`);
    console.log(`PASS [${machine}]: ${geometry.length} exact bitmap comparisons against ${compare}`);
  }
  results.push(...await run(machine,rom,timed));
}
await mkdir('build',{recursive:true});
await writeFile(`build/circle-speed-${label}.json`,JSON.stringify({rom,iterations:20,hz:60,results},null,2)+'\n');
