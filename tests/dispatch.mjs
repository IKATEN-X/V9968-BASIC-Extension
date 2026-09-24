import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { OpenMsx } from '../tools/openmsx.mjs';

const root=resolve(import.meta.dirname,'..');
const baseline=process.argv.includes('--baseline');
const machine=process.argv.includes('--r800')?'Panasonic_FS-A1ST(V9968)':'V9968_Basic';
const cpu=process.argv.includes('--r800')?'r800':'z80';
const expected=new Map(Object.entries({
  CIRCLE:'cmd_circle',CIRCLESTEP:'cmd_circle_step',CLS:'cmd_cls','COLOR=':'cmd_palette',COPY:'cmd_copy',
  FONT:'cmd_font',LINE:'cmd_line',PATTERNOFF:'cmd_pattern_off',PATTERNON:'cmd_pattern_on',
  PSET:'cmd_pset',PUTSPRITE:'cmd_put_sprite',SCREEN:'cmd_screen',SETPAGE:'cmd_page',
  SPRITE:'cmd_sprite',SPRITECLEAR:'cmd_sprite_clear',SPRITEOFF:'cmd_sprite_off',SPRITEON:'cmd_sprite_on',
  V9968:'cmd_init',VDP:'cmd_vdp',WAITVBLANK:'cmd_wait_vblank',WAITVDP:'cmd_wait_vdp'
}));
const map=await readFile(resolve(root,'build/v9968-basic.map'),'utf8');
const indexed=/\bcommand_initials\s*=/.test(map);
const frontCoded=/\bdispatch_skip_record\s*=/.test(map);
const address=name=>{
  const found=new RegExp(`\\b${name}\\s*= \\$([0-9A-F]+)`,'i').exec(map);
  assert.ok(found,`Symbol ${name}`);return parseInt(found[1],16);
};
const romOption=process.argv.find(arg=>arg.startsWith('--rom='));
const rom=await readFile(resolve(root,romOption?romOption.slice(6):'dist/v9968-basic.rom'));
assert.equal(rom.length,16384);assert.equal(rom.readUInt16LE(2),address('font_boot'),'ROM/map match');
assert.equal(rom.readUInt16LE(4),address('statement'));
const candidates=new Map();
function group(start,initial=null) {
  const names=[];let p=start-0x4000,previous=initial??'';
  while(rom[p]) {
    assert.ok(p>=0 && p<rom.length-3,'Table within ROM');
    const string=p+(frontCoded?2:0),end=rom.indexOf(0,string);
    assert.ok(end>=string && end-string<=15 && end+3<=rom.length,'Terminated command name');
    const suffix=rom.toString('ascii',string,end),name=frontCoded?previous.slice(0,rom[p])+suffix:suffix;
    const target=rom.readUInt16LE(end+1);
    if(frontCoded) {
      let common=0;while(common<previous.length && previous[common]===name[common])common++;
      assert.equal(rom[p],common,`Common prefix of ${previous} / ${name}`);
      assert.equal(rom[p+1],end+3-string,`Skip distance of ${name}`);
      assert.ok(rom[p]+rom[p+1]<256,'Remaining distance fits in one register');
    }
    assert.ok(expected.has(name),`Known command ${name}`);
    if(initial!==null)assert.equal(name[0],initial,'Group cannot include another initial');
    assert.equal(target,address(expected.get(name)),`Target of ${name}`);
    assert.ok(!candidates.has(name),`No duplicate ${name}`);
    names.push(name);candidates.set(name,names.length);previous=name;p=end+3;
  }
  assert.ok(p<rom.length && rom[p]===0,'Group terminator within ROM');
  if(initial!==null)assert.deepEqual(names,[...names].sort(),'Alphabetical command order');
}
if(!indexed)group(address('commands'));
else {
  const table=address('command_initials')-0x4000;
  for(let i=0;i<26;i++)group(rom.readUInt16LE(table+i*2),String.fromCharCode(65+i));
}
assert.equal(candidates.size,expected.size,'All 21 commands remain registered');

// Isolate dispatch: replace the selected handler with a RET in a test-only ROM.
// The real dispatcher, stack guard, frame allocation and return path still run.
const fixture=Buffer.from(rom),stub=0x7f00;
assert.equal(fixture[stub-0x4000],255,'Unused ROM byte for test stub');fixture[stub-0x4000]=0xc9;
await mkdir(resolve(root,'build'),{recursive:true});
const directory=await mkdtemp(resolve(root,'build/dispatch-'));
const path=resolve(directory,'dispatch.rom');await writeFile(path,fixture);
const msx=new OpenMsx({rom:path,machine});
const number=async code=>Number(await msx.command(code));
const bytes=async (address,size)=>Buffer.from(await msx.command(`binary encode hex [debug read_block memory ${address} ${size}]`),'hex');
const samples=new Map();
const names=new Set();
for(const name of expected.keys()) {
  names.add(name);names.add(' '+name);names.add(name+'  ');names.add(name[0]+' '+name.slice(1));
  names.add(name+'X');names.add(name.toLowerCase());
  for(let n=1;n<name.length;n++)names.add(name.slice(0,n));
  for(let n=1;n<name.length;n++) {
    for(const replacement of ['-','Z'])names.add(name.slice(0,n)+replacement+name.slice(n+1));
    names.add(name.slice(0,n)+' '+name.slice(n));
  }
}
for(const name of ['', '               ', '  PUT SPRITE  ', 'SPRITE CLEAR', 'PATTERN OFF', 'WAIT VBLANK',
  'CIRCLE STEP','PUTSPRITEXXXXXX','\tCOPY','C\tOPY','@COPY','[COPY','1COPY','_COPY','\x80COPY','\xffCOPY'])names.add(name);
for(let i=0;i<26;i++)names.add(String.fromCharCode(65+i)+'XXXXXXXXXXXXXX');

async function waitDone() {
  for(let i=0;i<300;i++) {
    if(await number('set ::dispatch_done'))return;
    await new Promise(r=>setTimeout(r,10));
  }
  assert.fail(`Dispatch fixture did not complete: ${await msx.screen()}`);
}
async function check(name) {
  const data=Buffer.alloc(16);assert.ok(name.length<16);data.write(name,0,'latin1');
  await msx.command(`debug write_block memory 0xfd89 [binary format H* ${data.toString('hex')}]
    set ::dispatch_done 0; set ::dispatch_hit -1; set ::dispatch_candidates 0; set ::dispatch_positions {}
    poke 0xc041 0; poke 0xc040 1; debug cont`);
  await waitDone();
  const [hit,count,us]=(await msx.command('list $::dispatch_hit $::dispatch_candidates $::dispatch_us')).split(' ').map(Number);
  const trace=await msx.command('set ::dispatch_positions'),positions=trace?trace.split(' ').map(Number):[];
  const normalized=name.replaceAll(' ',''),handler=expected.get(normalized),result=await bytes(0xc042,8);
  assert.equal(hit,handler?address(handler):-1,`Handler for ${JSON.stringify(name)}`);
  assert.equal(result[0]&1,handler?0:1,`Carry for ${JSON.stringify(name)}: unknown names must fall through`);
  assert.equal(result.readUInt16LE(2),0xc180,'Preserve argument pointer on return');
  assert.equal(result.readUInt16LE(4),result.readUInt16LE(6),'Balanced stack on success and failure');
  if(handler)assert.equal(count,candidates.get(normalized),`Candidate count for ${name}`);
  else if(indexed) {
    const size=[...expected.keys()].filter(n=>n[0]===normalized[0]).length;
    if(frontCoded)assert.ok(count<=size,'Early rejection stays within the selected initial');
    else assert.equal(count,size,'Never search a different initial');
  }
  if(frontCoded) {
    assert.ok(positions.every((p,i)=>p>name.search(/[^ ]/) && (i===0 || p>=positions[i-1])),`Input cursor never restarts: ${JSON.stringify(name)} / ${trace}`);
    if(name==='SPRITEOFF')assert.deepEqual(positions,[1,1,1,2,3,4,5,6,6,6,7,8,9],'Scan C/E/P at the second letter, then reuse SPRITE');
  }
  if(expected.has(name)) {
    const previous=samples.get(name);
    if(!previous || us<previous.us)samples.set(name,{count,us,comparisons:positions.length});
  }
}
try {
  await msx.ready;await msx.advance(12);assert.equal(await msx.command('get_active_cpu'),cpu);
  const statement=address('statement');
  // The fixture lives above HIMEM, explicitly reserved through standard CLEAR.
  await msx.type('CLEAR 200,&HBFFF\r');await msx.advance(1);
  assert.equal(await number('peek16 0xfc4a'),0xbfff);
  const trampoline=Buffer.from([
    0xf5,0xc5,0xd5,0xe5,0xdd,0xe5,0xfd,0xe5,
    0xed,0x73,0x46,0xc0,0x21,0x80,0xc1,0x37,
    0xf7,1,statement&255,statement>>8,
    0x22,0x44,0xc0,0xed,0x73,0x48,0xc0,
    0xf5,0xe1,0x7d,0x32,0x42,0xc0,
    0xfd,0xe1,0xdd,0xe1,0xe1,0xd1,0xc1,0xf1,0xc9
  ]);
  await msx.command(`debug write_block memory 0xc000 [binary format H* ${trampoline.toString('hex')}]
    poke 0xc040 0; poke 0xc041 0; poke 0xc180 0
    set ::dispatch_done 0; set ::dispatch_hit -1; set ::dispatch_candidates 0; set ::dispatch_us 0; set ::dispatch_positions {}
    debug set_bp ${statement} {[pc_in_slot 1]} {set ::dispatch_start [machine_info time]}
    debug set_bp ${address('dispatch_next')} {[pc_in_slot 1] && [peek [reg DE]] != 0} {incr ::dispatch_candidates}
    debug set_bp ${address('dispatch_char')} {[pc_in_slot 1]} {lappend ::dispatch_positions [expr {[reg HL]-0xfd89}]}
    debug set_bp ${address('call_stack_check')} {[pc_in_slot 1]} {
      set ::dispatch_hit [reg BC]; set ::dispatch_us [expr {([machine_info time]-$::dispatch_start)*1000000}]
      reg BC ${stub}
    }
    debug set_watchpoint write_mem 0xc041 {$::wp_last_value == 1} {set ::dispatch_done 1; debug break}`);
  await msx.type('10 DEFUSR=&HC000\r20 IF PEEK(&HC040)=0 THEN 20\r30 POKE &HC040,0:A=USR(0):POKE &HC041,1:GOTO 20\rRUN\r');
  await msx.advance(2);await msx.command('debug break');
  const work=await number('peek16 0xfd2f');
  for(const name of names)await check(name);
  for(let repeat=0;repeat<2;repeat++)for(const name of expected.keys())await check(name);
  assert.equal(await number('peek16 0xfc4a'),0xbfff);assert.equal(await number('peek16 0xfd2f'),work);
  console.log(`PASS [${cpu}]: ${names.size} names, all handlers, spaces, prefixes, suffixes, invalid initials, carry/HL, balanced stack and unchanged resident allocation`);
  const output=Object.fromEntries(samples),file=resolve(root,`build/dispatch-baseline-${cpu}.json`);
  if(baseline)await writeFile(file,JSON.stringify(output,null,2)+'\n');
  let old=null;
  if(!baseline) {
    try {old=JSON.parse(await readFile(file,'utf8'));}catch(error){if(error.code!=='ENOENT')throw error;}
  }
  for(const name of ['SPRITE','SPRITECLEAR','SPRITEOFF','SPRITEON','PUTSPRITE','COPY','LINE','WAITVBLANK','V9968','FONT']) {
    const value=output[name],before=old?.[name];
    console.log(`${name}: ${before?`${before.comparisons} -> `:''}${value.comparisons} character comparisons; ${before?`${before.us.toFixed(1)} -> `:''}${value.us.toFixed(1)} us (dispatch only)`);
  }
  await writeFile(resolve(root,`build/dispatch-${frontCoded?'prefix':'indexed'}-${cpu}.json`),JSON.stringify(output,null,2)+'\n');
} finally {await msx.stop();}
