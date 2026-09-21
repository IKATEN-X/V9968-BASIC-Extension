import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { OpenMsx } from '../tools/openmsx.mjs';
import { prepareDemoDisk } from '../tools/demo-disk.mjs';

const root=resolve(import.meta.dirname,'..');
const active=process.argv.includes('--active');
const baseline=process.argv.includes('--baseline');
const compare=process.argv.includes('--compare');
assert.ok(!(baseline && compare),'Capture baseline before comparing');
const warmup=process.argv.includes('--warmup')?96:0;
const label=(baseline?'baseline':'current')+(active?'-active':'')+(warmup?'-warm':'');
const disk=await prepareDemoDisk({entry:'SHOOT.BAS'});
const msx=new OpenMsx({rom:'dist/v9968-basic.rom',machine:'Panasonic_FS-A1ST(V9968)',diskDirectory:disk.directory});
async function vramHash() {
  const hex=await msx.command('binary encode hex [debug read_block {physical VRAM} 0 262144]');
  return createHash('sha256').update(Buffer.from(hex,'hex')).digest('hex');
}
async function stopped() {
  for(let i=0;i<1200;i++) {
    if(await msx.command('set ::profile_stopped')==='1') return;
    await new Promise(r=>setTimeout(r,10));
  }
  assert.fail(`Profile timed out: ${await msx.screen()}`);
}
try {
  await msx.ready;await msx.command('set throttle on; set speed 1000');
  const map=await readFile(resolve(root,'build/v9968-basic.map'),'ascii');
  const addr=name=>'0x'+new RegExp(`\\b${name}\\s*= \\$([0-9A-F]+)`,'i').exec(map)[1];
  await msx.command(`set ::profile_stopped 0; set ::profile_enabled 0; set ::profile_frames 0; set ::profile_warmup 0; set ::profile_title 1
    set ::profile_lines {}; set ::profile_calls {}; set ::profile_kind {}; set ::profile_phase 0
    proc profile_add {variable key elapsed} {
      upvar #0 $variable data
      if {![dict exists $data $key]} {dict set data $key {0 0}}
      lassign [dict get $data $key] count total
      dict set data $key [list [expr {$count+1}] [expr {$total+$elapsed}]]
    }
    proc profile_line {} {
      set line [peek16 0xf41c]; set now [machine_info time]
      if {$line == 80 && $::profile_title} {set ::profile_title 0; type_via_keybuf " "}
      if {!$::profile_enabled} {
        if {$line == 100} {
          if {$::profile_warmup > 0} {incr ::profile_warmup -1}
          if {$::profile_warmup == 0} {set ::profile_stopped 1; debug break}
        }
        return
      }
      profile_add ::profile_lines $::profile_line [expr {$now-$::profile_time}]
      set ::profile_line $line; set ::profile_time $now
      if {$line == 100} {
        incr ::profile_frames
        if {$::profile_frames == 32} {set ::profile_stopped 1; set ::profile_enabled 0; debug break}
      }
    }
    debug set_watchpoint write_mem 0xf41d {} {profile_line}
    debug set_bp ${addr('cmd_put_sprite')} {$::profile_enabled && [pc_in_slot 1]} {
      set ::profile_kind sprite; set ::profile_phase 1; set ::profile_start [machine_info time]
    }
    debug set_bp ${addr('sprite_commit')} {$::profile_enabled && [pc_in_slot 1]} {set ::profile_phase 2}
    debug set_bp ${addr('cmd_copy')} {$::profile_enabled && [pc_in_slot 1]} {
      set ::profile_kind copy; set ::profile_phase 2; set ::profile_start [machine_info time]
    }
    debug set_bp ${addr('restore_text')} {$::profile_enabled && $::profile_phase == 2 && [pc_in_slot 1]} {
      profile_add ::profile_calls $::profile_kind [expr {[machine_info time]-$::profile_start}]
      set ::profile_phase 0
    }`);
  await stopped();
  const cpu=await msx.command('get_active_cpu');assert.equal(cpu,'r800');
  if(warmup) {
    await msx.command(`set ::profile_warmup ${warmup}; set ::profile_stopped 0; debug cont`);await stopped();
  }
  const scroll=Number(await msx.command('debug read {VDP regs} 23'));
  const startVramHash=await vramHash();
  if(active) await msx.command('keymatrixdown 8 129');
  await msx.command(`set ::profile_stopped 0; set ::profile_enabled 1; set ::profile_line 100
    set ::profile_time [machine_info time]; set ::profile_begin $::profile_time; debug cont`);
  await stopped();
  const seconds=Number(await msx.command('expr {[machine_info time]-$::profile_begin}'));
  async function timings(name) {
    const rows=await msx.command(`join [lmap key [dict keys $::profile_${name}] {join [concat $key [dict get $::profile_${name} $key]] ,}] "\\n"`);
    return rows.split('\n').map(row=>{
      const [key,count,time]=row.split(',');
      return {key,count:Number(count),totalMs:Number(time)*1000,msPerUpdate:Number(time)*1000/32};
    }).sort((a,b)=>b.totalMs-a.totalMs);
  }
  const result={cpu,input:active?'right+fire':'none',warmup,updates:32,seconds,updatesPerSecond:32/seconds,startVramHash,endVramHash:await vramHash(),lines:await timings('lines'),calls:await timings('calls')};
  assert.ok(Math.abs(result.lines.reduce((n,row)=>n+row.totalMs,0)-seconds*1000)<0.001,'Line timings cover the whole loop');
  assert.equal(result.calls.find(row=>row.key==='copy')?.count,8,'Hidden-band COPY every four updates');
  assert.equal(Number(await msx.command('debug read {VDP regs} 23')),(scroll-128)&255,'All 32 four-dot scroll updates executed');
  if(!active && !baseline && !warmup) {
    assert.equal(result.calls.find(row=>row.key==='sprite')?.count,34,'Offscreen enemies skip updates; invulnerability changes once');
    assert.ok(!result.lines.some(row=>row.key==='210' || row.key==='280'),'Idle player and absent bullet skip unnecessary work');
    assert.ok(!result.lines.some(row=>Number(row.key)>=800 && Number(row.key)<=870),'Empty enemy-shot pool skips movement and collision loops');
    assert.equal(result.lines.find(row=>row.key==='290')?.count,2,'Only visible enemies are checked when invulnerability ends');
  }
  if(compare) {
    const name='baseline'+(active?'-active':'')+(warmup?'-warm':'');
    const previous=JSON.parse(await readFile(resolve(root,`build/shoot-profile-${name}.json`),'utf8'));
    assert.equal(result.startVramHash,previous.startVramHash,'Identical complete VRAM at the beginning of the interval');
    assert.equal(result.endVramHash,previous.endVramHash,'Identical complete VRAM after the same 32 updates');
    for(const kind of ['sprite','copy']) assert.equal(result.calls.find(row=>row.key===kind)?.count,previous.calls.find(row=>row.key===kind)?.count,`Unchanged ${kind} submission count`);
  }
  await writeFile(resolve(root,`build/shoot-profile-${label}.json`),JSON.stringify(result,null,2));
  console.log(JSON.stringify(result,null,2));
} finally {await msx.stop();}
