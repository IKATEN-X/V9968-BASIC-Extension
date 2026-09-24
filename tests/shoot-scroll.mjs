import assert from 'node:assert/strict';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { OpenMsx, tclString } from '../tools/openmsx.mjs';
import { prepareDemoDisk } from '../tools/demo-disk.mjs';

const root=resolve(import.meta.dirname,'..');
const pal=process.argv.includes('--pal'),visual=process.argv.includes('--visual');
const disk=await prepareDemoDisk({entry:'SHOOT.BAS'});
const path=resolve(disk.directory,'SHOOT.BAS');
const source=await readFile(path,'ascii');
assert.match(source,/^160 D=STICK\(0\)/m);
assert.match(source,/^155 .*:VDP\(24\)=SG:/m,'Avoid SET SCROLL synchronization in the game loop');
assert.match(source,/^510 SET SCROLL ,0:/m,'Use SET SCROLL for initial scroll position');
// Isolate scrolling from lives/combat. All loading, initialization, scroll and
// COPY statements are the real demo; only the generated test disk is changed.
await writeFile(path,source.replace(/^160 [^\r\n]*/m,'160 GOTO 320'),'ascii');
const pages=[1,2,3,5];
const scene=Buffer.concat(await Promise.all(['CITY.SC5','POWER.SC5','CARGO.SC5','RUNWAY.SC5'].map(async name=>
  (await readFile(resolve(disk.directory,name))).subarray(7))));
assert.equal(scene.length,4*32768);
for(let i=0;i<pages.length;i++) for(let j=i+1;j<pages.length;j++) {
  assert.notDeepEqual(scene.subarray(i*32768,(i+1)*32768),scene.subarray(j*32768,(j+1)*32768),'Distinct background pages');
}
const title=(await readFile(resolve(disk.directory,'TITLE.SC5'))).subarray(7);
const msx=new OpenMsx({rom:'dist/v9968-basic.rom',machine:'Panasonic_FS-A1ST(V9968)',diskDirectory:disk.directory});
const number=async command=>Number(await msx.command(command));
const block=async (start,size)=>Buffer.from(await msx.command(`binary encode hex [debug read_block {physical VRAM} ${start} ${size}]`),'hex');
async function stopped() {
  for(let i=0;i<1000;i++) {
    assert.equal(await msx.command('set ::scroll_error'),'','Emulator-side scroll assertions');
    if(await number('set ::scroll_stopped')) return;
    await new Promise(r=>setTimeout(r,10));
  }
  assert.fail(`Background loop timed out: ${await msx.screen().catch(e=>e.message)}`);
}
async function seek(tick) {
  await msx.command(`set ::scroll_target ${tick}; set ::scroll_stopped 0; debug cont`);await stopped();
  assert.equal(await number('set ::scroll_ticks'),tick);
}
async function capture(name) {
  if(!visual) return;
  const image=resolve(root,`build/screenshots/shoot-scroll-${pal?'pal':'ntsc'}-${name}.png`);
  await mkdir(resolve(root,'build/screenshots'),{recursive:true});
  await msx.type('p');await msx.command('type_via_keybuf::handleinterrupt; set ::scroll_observe 0; debug cont; set renderer SDLGL-PP; set speed 100');
  await msx.advance(0.1);await msx.command(`screenshot -raw ${tclString(image)}`);
  await msx.command('set speed 1000; set ::scroll_stopped 0; set ::scroll_observe 1; set ::scroll_target $::scroll_ticks');
  await stopped();
  await msx.type('p');await msx.command('type_via_keybuf::handleinterrupt');
}
try {
  await msx.ready;await msx.command('set throttle on; set speed 1000');
  const map=await readFile(resolve(root,'build/v9968-basic.map'),'ascii');
  const addr=name=>'0x'+new RegExp(`\\b${name}\\s*= \\$([0-9A-F]+)`,'i').exec(map)[1];
  await msx.command(`set ::scroll_ticks 0; set ::scroll_target 0; set ::scroll_stopped 0; set ::scroll_observe 1
    set ::scroll_error {}; set ::scroll_events {}; set ::scroll_scene {}; set ::scroll_expected {}
    proc scroll_check {condition message} {if {![uplevel 1 [list expr $condition]]} {error $message}}
    proc scroll_frame {} {
      if {$::scroll_scene eq {}} {set ::scroll_scene [debug read_block {physical VRAM} 32768 98304][debug read_block {physical VRAM} 163840 32768]}
      set top [expr {(1024-($::scroll_ticks*4)%1024)%1024}]
      set r23 [debug read {VDP regs} 23]
      scroll_check {$r23 == ($top & 255)} "R23 phase"
      scroll_check {[peek 0xfff6] == $r23} "BASIC vertical-scroll shadow"
      scroll_check {[debug read {VDP regs} 20] == 0x1b} "SVNS and sprite mode 3 stay enabled"
      set data [debug read_block {physical VRAM} 0 32768]
      for {set y 0} {$y < 212} {incr y} {
        set s [expr {(($top+$y)%1024)*128}]; set d [expr {(($r23+$y)&255)*128}]
        scroll_check {[string range $data $d [expr {$d+127}]] eq [string range $::scroll_scene $s [expr {$s+127}]]} "Visible row $y differs at tick $::scroll_ticks"
      }
      if {$::scroll_ticks == $::scroll_target} {set ::scroll_stopped 1; debug break}
    }
    proc scroll_submit {} {
      set ix [reg IX]
      set p [peek [expr {$ix+36}]]; set s [peek [expr {$ix+33}]]; set d [peek [expr {$ix+38}]]
      set r23 [debug read {VDP regs} 23]; set n [llength $::scroll_events]
      scroll_check {$p == [lindex {5 3 2 1} [expr {($n/16)%4}]] && $s == 240-16*($n%16)} "Source sequence skips the title page"
      scroll_check {$d == (($r23-16)&255) && ($r23&15) == 0} "Band alignment"
      scroll_check {[peek [expr {$ix+32}]] == 0 && [peek [expr {$ix+34}]] == 255 && [peek [expr {$ix+35}]] == $s+15} "Source bounds"
      scroll_check {[peek [expr {$ix+37}]] == 0 && [peek [expr {$ix+39}]] == 255 && [peek [expr {$ix+40}]] == $d+15 && [peek [expr {$ix+41}]] == 0} "Destination bounds"
      for {set y $d} {$y < $d+16} {incr y} {scroll_check {(($y-$r23)&255) >= 212} "Visible destination write"}
      set before [debug read_block {physical VRAM} 0 32768]
      set band [debug read_block {physical VRAM} [expr {$p*32768+$s*128}] 2048]
      set ::scroll_expected [string replace $before [expr {$d*128}] [expr {($d+16)*128-1}] $band]
      set ::scroll_old $r23; set ::scroll_submit [machine_info time]
      set ::scroll_meta [list $::scroll_ticks $p $s $d]
    }
    proc scroll_return {} {
      scroll_check {([debug read {VDP status regs} 2]&1) == 0} "COPY returned busy"
      scroll_check {[debug read {VDP regs} 23] == $::scroll_old} "Scroll changed before COPY completion"
      scroll_check {[debug read_block {physical VRAM} 0 32768] eq $::scroll_expected} "COPY changed data outside its hidden band or copied wrong data"
      set now [machine_info time]
      lappend ::scroll_events [concat $::scroll_meta [list [expr {($now-$::scroll_start)*1000}] [expr {($now-$::scroll_submit)*1000}]]]
    }
    proc scroll_guard {script} {if {[catch {uplevel #0 $script} e]} {set ::scroll_error $e; debug break}}
    set ::scroll_title_hook [debug set_watchpoint write_mem 0xf41d {$::wp_last_value == 0 && [peek 0xf41c] == 80} {debug remove_watchpoint $::scroll_title_hook; type_via_keybuf " "}]
    debug set_bp ${addr('cmd_copy')} {[pc_in_slot 1] && [peek16 0xf41c] == 750} {set ::scroll_start [machine_info time]}
    debug set_bp ${addr('submit_command')} {[pc_in_slot 1] && [peek16 0xf41c] == 750} {scroll_guard scroll_submit}
    debug set_bp ${addr('restore_text')} {[pc_in_slot 1] && [peek16 0xf41c] == 750} {scroll_guard scroll_return}
    debug set_watchpoint write_mem 0xf41d {$::wp_last_value == 1 && [peek 0xf41c] == 64} {incr ::scroll_ticks}
    debug set_watchpoint write_mem 0xf41d {$::wp_last_value == 0 && [peek 0xf41c] == 100 && $::scroll_observe && $::scroll_error eq {}} {scroll_guard scroll_frame}`);
  await stopped();
  if(pal) await msx.command('debug write {VDP regs} 9 [expr {[debug read {VDP regs} 9] | 2}]; poke 0xffe8 [debug read {VDP regs} 9]');
  assert.equal(await number('debug read {VDP regs} 20'),0x1b);
  const himem=await number('peek16 0xfc4a'),work=await number('peek16 0xfd2f');
  const patterns=await block(7*32768,16384),reserved=await block(0x37600,2048);
  for(const [i,page] of pages.entries()) assert.deepEqual(await block(page*32768,32768),scene.subarray(i*32768,(i+1)*32768));
  assert.deepEqual(await block(4*32768,32768),title);
  assert.deepEqual(await block(0,32768),scene.subarray(0,32768));
  await capture('city');
  for(const [tick,page,name] of [[64,5,'runway'],[128,3,'cargo'],[192,2,'power'],[256,1,'repeat']]) {
    await seek(tick);
    const i=pages.indexOf(page);
    assert.deepEqual(await block(0,32768),scene.subarray(i*32768,(i+1)*32768),'Whole-page transition');
    await capture(name);
  }
  await seek(260);
  const events=(await msx.command('join [lmap e $::scroll_events {join $e ,}] "\\n"')).split('\n').map(row=>row.split(',').map(Number));
  assert.equal(events.length,65,'One COPY per four four-dot updates');
  events.forEach(([tick],i)=>assert.equal(tick,i*4,'Copy cadence'));
  for(const [i,page] of pages.entries()) assert.deepEqual(await block(page*32768,32768),scene.subarray(i*32768,(i+1)*32768),'Source pages must not be modified');
  assert.deepEqual(await block(4*32768,32768),title,'Title page must be skipped and preserved');
  assert.deepEqual(await block(7*32768,16384),patterns,'Sprite patterns must survive');
  assert.deepEqual(await block(0x37600,2048),reserved,'Font region must be untouched');
  assert.equal(await number('peek16 0xfc4a'),himem);assert.equal(await number('peek16 0xfd2f'),work);
  const average=col=>events.reduce((sum,e)=>sum+e[col],0)/events.length;
  const result={hz:pal?50:60,ticks:260,copies:events.length,bytesPerCopy:2048,copyCallMs:average(4),submitThroughCompletionMs:average(5),maxCopyCallMs:Math.max(...events.map(e=>e[4]))};
  await writeFile(resolve(root,`build/shoot-scroll-${pal?'pal':'ntsc'}-result.json`),JSON.stringify(result,null,2));
  console.log(`PASS: ${pal?50:60} Hz, scroll/shadow, fixed SVNS, 260 four-dot updates, every visible row matches the 1024-row scene, 256/1024 wraps and 65 hidden-band copies`);
  console.log(`PASS: COPY return busy=0 before R23 change, immutable source/sprite/font regions and unchanged RAM; ${result.copyCallMs.toFixed(3)} ms/COPY including parsing, ${result.submitThroughCompletionMs.toFixed(3)} ms submission/completion`);
  await msx.type('\x1b');await msx.command('type_via_keybuf::handleinterrupt; set ::scroll_observe 0; debug cont');await msx.advance(4);
  assert.match(await msx.screen(),/V9968 DEMO DISK/);
} finally {await msx.stop();}
