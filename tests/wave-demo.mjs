import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { OpenMsx, tclString } from '../tools/openmsx.mjs';

const root=resolve(import.meta.dirname,'..');
const machine=process.argv.includes('V9968_Basic')?'V9968_Basic':'Panasonic_FS-A1ST(V9968)';
const visual=process.argv.includes('--visual'), pal=process.argv.includes('--pal');
const msx=new OpenMsx({rom:'dist/v9968-basic.rom',machine});
const number=async code=>Number(await msx.command(code));
const bytes=async (address,size)=>Buffer.from(await msx.command(`binary encode hex [debug read_block {physical VRAM} ${address} ${size}]`),'hex');
const sat=async()=>bytes(await number('peek16 0xf928'),128);
const positions=data=>Array.from({length:32},(_,i)=>[data[i*4+1],data[i*4]]);
const extent=data=>{
  const y=positions(data).map(p=>p[1]);
  return Math.max(...y)-Math.min(...y);
};
async function key(character,seconds=1) { await msx.type(character); await msx.advance(seconds); }
async function flags(value) {
  const [r8,s8]=(await msx.command('list [debug read {VDP regs} 8] [peek 0xffe7]')).split(' ').map(Number);
  assert.equal(r8&2,0,'Native sprite display must be enabled');
  assert.equal(s8,r8,'R8 BASIC shadow');
  const [r20,s20,r25,s25]=(await msx.command('list [debug read {VDP regs} 20] [peek 0xfff3] [debug read {VDP regs} 25] [peek 0xfffa]')).split(' ').map(Number);
  assert.equal(r20,(value&2)?128:0);
  assert.equal(r25&128,(value&1)?128:0);
  assert.equal(s20,r20); assert.equal(s25,r25);
}
async function mode(value,expectedFlags) {
  await key(String(value),4);
  assert.equal(await number('peek 0xfcaf'),value*2);
  assert.equal((await number('debug read {VDP regs} 1'))&3,0);
  assert.equal((await number('debug read {VDP regs} 9'))&2,pal?2:0);
  await flags(expectedFlags);
  const pattern=await number('peek16 0xf926');
  assert.deepEqual(await bytes(pattern,8),Buffer.from([24,60,126,255,255,126,60,24]));
  if(value===2) {
    const colors=await bytes((await number('peek16 0xf928'))-512,512);
    for(let i=0;i<32;i++) assert.deepEqual(colors.subarray(i*16,i*16+8),Buffer.alloc(8,3+2*(i%4)),'Mode-2 sprite colors');
  }
}
async function movement(before,message) {
  let after=await sat();
  // Quantized amplitude stays zero for several updates, especially on Z80.
  for(let i=0;i<20 && JSON.stringify(positions(after))===JSON.stringify(positions(before));i++) {
    await msx.advance(0.5); after=await sat();
  }
  assert.notDeepEqual(positions(after),positions(before),message);
}
async function seekPaused(span) {
  await msx.command(`set ::wave_seek ${span}; set ::wave_hit 0; set ::wave_seen 0; set ::wave_lastspan -1`);
  for(let i=0;i<120 && !await number('expr {$::wave_hit || $::wave_error ne ""}');i++) await msx.advance(1);
  assert.equal(await msx.command('set ::wave_error'),'','Wave watchpoint script');
  assert.equal(await number('set ::wave_hit'),1,`Wave never reached span ${span}: ${await msx.command('list [peek16 0xf41c] $::wave_seek $::wave_seen $::wave_lastspan')} ${msx.stderr} ${msx.stdout}`);
  await msx.advance(1);
  const data=await sat();
  assert.equal(extent(data),span,'Pause must preserve the selected amplitude');
  await msx.advance(1);
  assert.deepEqual(await sat(),data,'Selected waveform must stay paused');
  return data;
}
async function capture(name) {
  const path=resolve(root,`build/screenshots/wave-${machine==='V9968_Basic'?'z80':'r800'}-${pal?'pal':'ntsc'}-${name}.png`);
  await msx.advance(0.1);
  await msx.command(`screenshot -raw ${tclString(path)}`);
  const png=JSON.parse(execFileSync('pwsh.exe',['-NoProfile','-File',resolve(root,'tests/read-png.ps1'),'-Path',path],{encoding:'utf8',windowsHide:true,maxBuffer:2**20}));
  const rgb=Buffer.from(png.rgb,'base64');
  const pixel=(x,y)=>Array.from(rgb.subarray((y*png.width+x)*3,(y*png.width+x)*3+3));
  let origin;
  for(let y=0;y<png.height && !origin;y++) {
    let run=0;
    for(let x=0;x<png.width;x++) {
      run=pixel(x,y).every(c=>c===255)?run+1:0;
      if(run===250) { origin=[x-249,y]; break; }
    }
  }
  assert.ok(origin,'Screen top rule');
  const at=(x,y)=>pixel(x+origin[0],y+origin[1]);
  for(const [x,y] of [[8,16],[168,16],[8,40],[144,40]]) assert.deepEqual(at(x,y),[0,0,0],'No GRP positioning dots');
  return {rgb,at};
}
try {
  await msx.ready;
  await msx.command('set throttle on; set speed 1000');
  await msx.advance(12);
  await msx.type('VDP(9)=VDP(9) OR 2\r'); await msx.advance(0.5);
  assert.equal((await number('debug read {VDP regs} 8'))&2,2,'Start with sprites disabled by a preceding demo');
  const cpu=await msx.command('get_active_cpu'), himem=await number('peek16 0xfc4a');
  const symbols=await readFile(resolve(root,'build/v9968-basic.map'),'ascii');
  const statement=/\bstatement\s*= \$([0-9a-f]+)/i.exec(symbols)[1];
  await msx.command(`set ::wave_calls 0; set ::wave_frames {}; set ::wave_times {}; set ::wave_counts {}; set ::wave_seek -1; set ::wave_hit 0; set ::wave_error {};
    debug set_bp 0x${statement} {[pc_in_slot 1]} {incr ::wave_calls}
    proc wave_sample {} {
      set data [debug read_block {physical VRAM} [peek16 0xf928] 128]
      if {[llength $::wave_frames] < 130} {
        lappend ::wave_frames [binary encode hex $data]
        lappend ::wave_times [machine_info time]
        lappend ::wave_counts $::wave_calls
      }
      if {$::wave_seek >= 0} {
        incr ::wave_seen
        binary scan $data cu* attributes
        set lo 255; set hi 0
        for {set i 0} {$i < 128} {incr i 4} {
          set y [lindex $attributes $i]
          if {$y < $lo} {set lo $y}
          if {$y > $hi} {set hi $y}
        }
        set ::wave_lastspan [expr {$hi-$lo}]
        if {$hi-$lo == $::wave_seek} {
          set ::wave_seek -1; set ::wave_hit 1
          type_via_keybuf " "
        }
      }
    }
    # CURLIN's high byte completes entry to line 100, after all 32 PUTs.
    debug set_watchpoint write_mem 0xf41d {$::wp_last_value == 0 && [peek 0xf41c] == 100 && $::wave_error eq "" && ([llength $::wave_frames] < 130 || $::wave_seek >= 0)} {if {[catch {wave_sample} error]} {set ::wave_error $error}}`);
  const program=await readFile(resolve(root,'demo/WAVE.BAS'));
  assert.ok(program.every(b=>b<128));
  const lines=program.toString('ascii').trim().split(/\r?\n/);
  assert.ok(lines.every(line=>line.length<255));
  assert.doesNotMatch(lines.filter(line=>Number(line.split(' ')[0])>=100).join('\n'),/\bSIN\(|\bCOS\(|_WAIT/i);
  await msx.type(lines.join('\r')+(pal?'\r15 VDP(10)=VDP(10) OR 2\r':'')+'\rRUN\r');
  for(let i=0;i<160 && await number('llength $::wave_frames')<130;i++) await msx.advance(2);
  assert.equal(await number('llength $::wave_frames'),130,`Wave did not produce two cycles; SCREEN=${await number('peek 0xfcaf')}`);
  const frames=(await msx.command('join $::wave_frames " "')).split(' ').map(hex=>Buffer.from(hex,'hex'));
  const times=(await msx.command('join $::wave_times " "')).split(' ').map(Number);
  const calls=(await msx.command('join $::wave_counts " "')).split(' ').map(Number);
  assert.ok(calls.every(n=>n===calls[0]),'Animation must not call extension commands');
  for(const [frame,data] of frames.entries()) {
    const f=frame&63, amplitude=Math.floor(8+8*Math.cos(f*Math.PI/32)+0.5);
    for(let i=0;i<32;i++) {
      const k=(2*f+2*i)&63;
      const y=120+Math.floor(Math.sin(k*Math.PI/32)*amplitude*3+0.5);
      assert.deepEqual(data.subarray(i*4,i*4+4),Buffer.from([y,i*8,0,3+2*(i%4)]),`Frame ${frame}, sprite ${i}`);
      assert.ok(y>=72 && y+8<=176);
    }
    if(frame>=64) assert.deepEqual(data,frames[frame-64],'The complete wave cycle must repeat');
  }
  assert.equal(extent(frames[0]),96); assert.equal(extent(frames[32]),0); assert.equal(extent(frames[64]),96);
  for(let i=0;i<32;i++) assert.ok(frames.some(data=>data[i*4]!==frames[0][i*4]),`Sprite ${i} never moves`);
  const fps=129/(times[129]-times[0]);
  console.log(`PASS [${machine}]: 130 complete frames, repeating sine/envelope, all 32 moving, screen bounds and no animation extension calls; ${fps.toFixed(2)} full updates/s`);

  await key(' ');
  const paused=await sat(), location=positions(paused);
  await msx.advance(2); assert.deepEqual(await sat(),paused,'Space must pause');
  await key('t'); await flags(2); assert.deepEqual(await sat(),paused);
  await key('s'); await flags(3); assert.deepEqual(await sat(),paused);
  await mode(2,3); assert.deepEqual(positions(await sat()),location,'SCREEN 4 must preserve paused phase/amplitude');
  await msx.advance(2); assert.deepEqual(positions(await sat()),location,'SCREEN 4 must preserve pause');
  await mode(1,3); assert.deepEqual(await sat(),paused,'SCREEN 2 must restore the same complete sprite state');
  await key('T'); await flags(1); assert.deepEqual(await sat(),paused);
  await key('S'); await flags(0); assert.deepEqual(await sat(),paused);
  await key('T'); await flags(2);
  await key(' '); await movement(paused,'Space must resume');

  const wide=await seekPaused(96);
  if(visual) {
    await mkdir(resolve(root,'build/screenshots'),{recursive:true});
    await msx.command('set renderer SDLGL-PP; set speed 100');
    const image=await capture('wide');
    for(const [x,y] of positions(wide)) assert.ok(image.at(x+4,y+4).some(c=>c>0),'All 32 sprites must render at maximum amplitude with S16');
    await key(' '); const moving=await capture('moving');
    assert.notDeepEqual(moving.rgb,image.rgb,'Rendered wave must move');
    await msx.command('set speed 1000');
  } else { await key(' '); }
  const flat=await seekPaused(0);
  if(visual) {
    await msx.command('set speed 100');
    const image=await capture('flat-sixteen');
    for(let i=0;i<32;i++) assert.equal(image.at(i*8+4,124).some(c=>c>0),i<16,'Flat wave must respect S16 limit');
  }
  await key('t'); await flags(0); assert.deepEqual(await sat(),flat);
  if(visual) {
    const image=await capture('flat-four');
    for(let i=0;i<32;i++) assert.equal(image.at(i*8+4,124).some(c=>c>0),i<4,'Flat SCREEN 2 native limit');
  }
  await mode(2,0); assert.deepEqual(positions(await sat()),positions(flat));
  if(visual) {
    const image=await capture('flat-eight');
    for(let i=0;i<32;i++) assert.equal(image.at(i*8+4,124).some(c=>c>0),i<8,'Flat SCREEN 4 native limit');
  }
  await key('s'); await key('T'); await flags(3);
  await key(' ');
  await movement(flat,'Flat wave must grow again after resume');
  await mode(1,3);
  await movement(await sat(),'Mode changes must preserve running state');
  await key('\x1b');
  assert.equal(await number('peek 0xfcaf'),0); await flags(0);
  assert.match(await msx.screen(),/wave demo stopped/);
  assert.equal(await number('peek16 0xfc4a'),himem);
  assert.equal(await msx.command('get_active_cpu'),cpu);
  await writeFile(resolve(root,`build/wave-demo-${cpu}-${pal?'pal':'ntsc'}.json`),JSON.stringify({machine,cpu,pal,visual,updatesPerSecond:fps,frames:frames.length,tableElementBytes:2304},null,2)+'\n');
  console.log(`PASS: pause/resume, T/S independence, mode changes preserving wave/settings/pause, Escape, HIMEM and CPU (${pal?50:60} Hz)${visual?', moving pixels and flat 4/8/16 limits':''}`);
} finally { await msx.stop(); }
