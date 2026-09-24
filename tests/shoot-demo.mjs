import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { OpenMsx, tclString } from '../tools/openmsx.mjs';
import { prepareDemoDisk } from '../tools/demo-disk.mjs';

const root=resolve(import.meta.dirname,'..');
const pal=process.argv.includes('--pal');
const visual=process.argv.includes('--visual');
const planes={player:32,explosion:33,enemies:[34,35,36],shots:[37,38],enemyShots:[40,41]};
const shotFixed=new Set(['SX','SY','VX','VY']);
const disk=await prepareDemoDisk({entry:'SHOOT.BAS'});
const source=await readFile(resolve(root,'demo/SHOOT.BAS'),'ascii');
assert.ok(source.trim().split(/\r?\n/).every(line=>line.length<255),'BASIC line length');
assert.doesNotMatch(source.split(/\r?\n/).filter(line=>Number(line.split(' ')[0])>=100).join('\n'),/\bSIN\(|\bCOS\(|_WAIT/i);
assert.doesNotMatch(source,/\bSV\b/i,'Keep SVNS fixed');
assert.doesNotMatch(source,/K\$="r"/i,'R retry is removed');
assert.ok(source.split(/\r?\n/).filter(line=>/SQR\(/.test(line)).every(line=>line.startsWith('866 ')),'Normalize aim only at firing');
assert.match(source,/^155 .*:VDP\(24\)=SG:/m,'Avoid SET SCROLL synchronization in the game loop');
for(const line of [510,900,960]) assert.match(source,new RegExp(`^${line} .*SET SCROLL ,0`, 'm'),'Use SET SCROLL to reset vertical scroll');
// Independent 5x7 glyphs: 2x pixels, with one clear row above and below.
const gameOverRows=[
  [14,17,16,23,17,17,15],[14,17,17,31,17,17,17],
  [17,27,21,21,17,17,17],[31,16,16,30,16,16,31],
  [14,17,17,17,17,17,14],[17,17,17,17,17,10,4],
  [31,16,16,30,16,16,31],[30,17,17,30,20,18,17]
];
function gameOverInk(x,y) {
  const tile=Math.floor(x/16),col=Math.floor((x%16-3)/2),row=Math.floor((y-1)/2);
  return col>=0 && col<5 && row>=0 && row<7 && Boolean(gameOverRows[tile][row]&(16>>col));
}
const patterns=(await readFile(resolve(disk.directory,'SHIPS.SC5'))).subarray(7);
for(let y=0;y<=16;y++) for(let x=0;x<128;x++) {
  const packed=patterns[(64+y)*128+(x>>1)],actual=x&1?packed&15:packed>>4;
  assert.equal(actual,gameOverInk(x,y)?10:0,`GAME OVER source pixel (${x},${64+y}), including tile boundary`);
}
const msx=new OpenMsx({rom:'dist/v9968-basic.rom',machine:'Panasonic_FS-A1ST(V9968)',diskDirectory:disk.directory});
const number=async code=>Number(await msx.command(code));
const bytes=async (device,address,size)=>Buffer.from(await msx.command(`binary encode hex [debug read_block {${device}} ${address} ${size}]`),'hex');
const sat=async()=>bytes('physical VRAM',0x37e00,512);
const sprite=(data,n)=>{
  const b=data.subarray(n*8,n*8+8),signed=n=>n>=512?n-1024:n;
  return {x:signed(b[4]|((b[5]&3)<<8)),y:signed(b[0]|((b[1]&3)<<8))+1,p:b[7]|((b[5]>>4)<<8)};
};
async function basicState() {
  const [start,arrays,end]=(await msx.command('list [peek16 0xf6c2] [peek16 0xf6c4] [peek16 0xf6c6]')).split(' ').map(Number);
  const data=await bytes('memory',start,end-start),values={},slots={};
  for(let i=0;i<arrays-start;) {
    const size=data[i],name=String.fromCharCode(data[i+1]&127,...(data[i+2]?[data[i+2]&127]:[]));
    assert.ok([2,3,4,8].includes(size),`Variable type ${size} at ${i}`);
    if(size===2) {values[name]=data.readInt16LE(i+3);slots[name]={address:start+i+3,count:1};}
    i+=size+3;
  }
  for(let i=arrays-start;i<data.length;) {
    const name=String.fromCharCode(data[i+1]&127,...(data[i+2]?[data[i+2]&127]:[]));
    assert.equal(data[i],2,'Demo arrays are integers');assert.equal(data[i+5],1,'Demo arrays are one-dimensional');
    const count=data.readUInt16LE(i+6),next=i+5+data.readUInt16LE(i+3);
    assert.equal(next,i+8+count*2);assert.ok(next<=data.length,'Array storage bounds');
    values[name]=Array.from({length:count},(_,n)=>data.readInt16LE(i+8+n*2));
    slots[name]={address:start+i+8,count};i=next;
  }
  return {values,slots,arrayBytes:end-arrays};
}
async function variables() {
  const {values}=await basicState();
  // Fixtures use pixel units; the demo stores shot positions/velocities in 1/64 pixels.
  for(const name of shotFixed) values[name]=values[name].map(n=>name==='SY' && n===-1?-1:n/64);
  return values;
}
// Deterministic gameplay fixtures change only existing, bounds-checked BASIC
// values while paused at the input loop. Resolve addresses again on every use.
async function stage(changes) {
  const {slots}=await basicState(),commands=[];
  for(const [name,value] of Object.entries(changes)) {
    const slot=slots[name],values=Array.isArray(value)?value:[value];
    assert.ok(slot,`Existing BASIC variable ${name}`);assert.equal(values.length,slot.count);
    const data=Buffer.alloc(values.length*2);
    values.forEach((n,i)=>data.writeInt16LE(shotFixed.has(name) && !(name==='SY' && n===-1)?n*64:n,i*2));
    commands.push(`debug write_block {memory} ${slot.address} [binary format H* ${data.toString('hex')}]`);
  }
  await msx.command(commands.join('; '));
}
async function stopped() {
  for(let i=0;i<1200 && await number('set ::shoot_steps')!==0;i++) await new Promise(r=>setTimeout(r,10));
  if(await number('set ::shoot_steps')!==0) assert.fail(`Game did not reach input loop: ${await msx.screen().catch(e=>e.message)}`);
}
async function frames(n=1) {
  await msx.command(`set ::shoot_steps ${n}; debug cont`);await stopped();
}
async function key(key,n=1) {
  await msx.type(key);
  // CPU is stopped at INKEY$: deliver queued text before this statement.
  await msx.command('type_via_keybuf::handleinterrupt');
  await frames(n);
}
async function hold(mask,n) {
  await msx.command(`keymatrixdown 8 ${mask}`);await frames(n);await msx.command(`keymatrixup 8 ${mask}`);
}
function aimedShot(v,enemy,k=0) {
  const x=enemy.x+8,y=enemy.y+24,dx=v.PX-x,dy=v.PY+6-y,d=Math.hypot(dx,dy);
  const vx=d?6*dx/d:0,vy=d?6*dy/d:6;
  assert.ok(Math.abs(v.VX[k]-vx)<1/64+0.0001,`Horizontal aim: got ${v.VX[k]}, expected ${vx}, delta (${dx},${dy})`);
  assert.ok(Math.abs(v.VY[k]-vy)<1/64+0.0001,`Vertical aim: got ${v.VY[k]}, expected ${vy}, delta (${dx},${dy})`);
  assert.ok(Math.abs(Math.hypot(v.VX[k],v.VY[k])-6)<0.023,'Direction-independent six-pixel speed');
  assert.equal(v.SX[k],x+v.VX[k]);assert.equal(v.SY[k],y+v.VY[k]);
}
async function capture(name) {
  if(!visual) return;
  const path=resolve(root,`build/screenshots/shoot-${pal?'pal':'ntsc'}-${name}.png`);
  await mkdir(resolve(root,'build/screenshots'),{recursive:true});
  const {PA,LV}=await variables(),pause=!PA && LV>0;if(pause) await key('p');
  await msx.command('set ::shoot_steps -1; debug cont; set renderer SDLGL-PP; set speed 100');
  await msx.advance(0.1);
  await msx.command(`debug break; screenshot -raw ${tclString(path)}`);
  const png=JSON.parse(execFileSync('pwsh.exe',['-NoProfile','-File',resolve(root,'tests/read-png.ps1'),'-Path',path],{encoding:'utf8',windowsHide:true,maxBuffer:2**20}));
  const rgb=Buffer.from(png.rgb,'base64'),colors=new Map();
  for(let i=0;i<rgb.length;i+=3) {const c=rgb.subarray(i,i+3).toString('hex');colors.set(c,(colors.get(c)??0)+1);}
  assert.ok([...colors.values()].filter(n=>n>30).length>=11,'Background detail must be rendered, including when sprites scroll offscreen');
  let snapshot;
  if(name==='gameover' || name==='enemy-shots' || name.startsWith('hud-')) {
    const pixel=(x,y)=>rgb.subarray((y*png.width+x)*3,(y*png.width+x)*3+3);
    // Anchor to the HUD's sprite strip, including overscan and sprite offsets.
    let ox=0,oy=0;
    while(oy<png.height && pixel(png.width/2,oy).every(c=>c===0)) oy++;
    assert.ok(oy+212<=png.height,'Visible SCREEN 5 top');
    while(ox<png.width && pixel(ox,oy).every(c=>c===0)) ox++;
    assert.ok(ox+256<=png.width,'Visible SCREEN 5 sprite origin');
    snapshot={
      hud:Buffer.concat(Array.from({length:16},(_,y)=>rgb.subarray(((oy+y)*png.width+ox)*3,((oy+y)*png.width+ox+256)*3))),
      pixel:(x,y)=>pixel(ox+x,oy+y)
    };
    if(name==='gameover') {
      const ink=pixel(ox+69,oy+89);
      assert.ok(ink[0]>240 && ink[1]>200 && ink[2]<140,'GAME OVER yellow');
      for(let y=0;y<16;y++) for(let x=0;x<128;x++) {
        assert.equal(pixel(ox+64+x,oy+88+y).equals(ink),gameOverInk(x,y),`Rendered GAME OVER pixel (${x},${y})`);
      }
    }
  }
  await msx.command('set speed 1000; set ::shoot_steps 1; debug cont');await stopped();
  if(pause) await key('p');
  return snapshot;
}
try {
  await msx.ready;await msx.command('set throttle on; set speed 1000');
  await msx.command(`set ::shoot_steps 1; set ::shoot_frames 0; set ::shoot_times {}; set ::shoot_title 1
    set ::shoot_over_started -1; set ::shoot_return_started -1
    debug set_watchpoint write_mem 0xf41d {$::wp_last_value == 0 && ((!$::shoot_title && [peek 0xf41c] == 100) || ($::shoot_title && [peek 0xf41c] == 80))} {
      if {$::shoot_steps > 0} {incr ::shoot_steps -1; if {$::shoot_steps == 0} {debug break}}
    }
    debug set_watchpoint write_mem 0xf41d {$::wp_last_value == 2 && [peek 0xf41c] == 208} {set ::shoot_over_started [machine_info time]; set ::shoot_return_started -1}
    debug set_watchpoint write_mem 0xf41d {$::wp_last_value == 0 && [peek 0xf41c] == 70 && $::shoot_over_started >= 0 && $::shoot_return_started < 0} {set ::shoot_return_started [machine_info time]}
    debug set_watchpoint write_mem 0xf41d {$::wp_last_value == 1 && [peek 0xf41c] == 64} {
      incr ::shoot_frames; lappend ::shoot_times [machine_info time]
    }`);
  await stopped();
  assert.equal(await msx.command('get_active_cpu'),'r800');
  assert.equal(await number('peek 0xfcaf'),5,'Shooter starts in SCREEN 5');
  assert.equal(await number('peek 0xf3db'),0,'Keep the user-selected silent key clicks');
  assert.equal(await number('debug read {VDP regs} 20'),0x1b,'SVNS and mode 3');
  if(pal) await msx.command('debug write {VDP regs} 9 [expr {[debug read {VDP regs} 9] | 2}]; poke 0xffe8 [debug read {VDP regs} 9]');
  const himem=await number('peek16 0xfc4a'),work=await number('peek16 0xfd2f');
  const title=(await readFile(resolve(disk.directory,'TITLE.SC5'))).subarray(7);
  const runway=(await readFile(resolve(disk.directory,'RUNWAY.SC5'))).subarray(7);
  assert.equal(title.length,32768);assert.equal(runway.length,32768);
  assert.deepEqual(await bytes('physical VRAM',4*32768,32768),title,'Title is stored on page 4');
  assert.deepEqual(await bytes('physical VRAM',5*32768,32768),runway,'Additional background is stored on page 5');
  assert.deepEqual(await bytes('physical VRAM',0,32768),title,'Title is copied to display page 0');
  assert.equal((await number('debug read {VDP regs} 8'))&2,2,'No gameplay sprites on the title');
  const titleVram=await bytes('physical VRAM',0,262144);
  await frames(8);assert.deepEqual(await bytes('physical VRAM',0,262144),titleVram,'Waiting at the title does not redraw VRAM');
  await capture('title');
  await msx.command('set ::shoot_title 0; keymatrixdown 8 1; set ::shoot_steps -1; debug cont');
  await msx.advance(0.3);
  assert.equal(await number('set ::shoot_frames'),0,'Wait for the start trigger to be released');
  assert.deepEqual(await bytes('physical VRAM',0,32768),title);
  await msx.command('set ::shoot_steps 1; keymatrixup 8 1');await stopped();
  assert.equal((await number('debug read {VDP regs} 8'))&2,0,'Starting the game enables sprites');
  console.log('PASS: page-4 title, page-5 background, idle VRAM, start/release and sprite visibility');
  const bg=await bytes('physical VRAM',0,32768),art=await bytes('physical VRAM',7*32768,16384);
  assert.deepEqual(bg,(await readFile(resolve(disk.directory,'CITY.SC5'))).subarray(7),'BLOAD terrain');
  const terrain=await bytes('physical VRAM',32768,3*32768);
  for(const [i,name] of ['CITY.SC5','POWER.SC5','CARGO.SC5'].entries()) {
    assert.deepEqual(terrain.subarray(i*32768,(i+1)*32768),(await readFile(resolve(disk.directory,name))).subarray(7),`Terrain page ${i+1}`);
  }
  assert.deepEqual(art,(await readFile(resolve(disk.directory,'SHIPS.SC5'))).subarray(7),'Copied mode-3 patterns');
  assert.deepEqual(sprite(await sat(),planes.player),{x:120,y:174,p:1792});
  const attrs=await sat(),playerOffset=planes.player*8,gunshipOffset=planes.enemies[2]*8;
  assert.equal(attrs[playerOffset+2],32);assert.equal(attrs[playerOffset+1]&192,64,'16x32 source pattern');
  assert.equal(attrs[gunshipOffset+2],32);assert.equal(attrs[gunshipOffset+6],32);assert.equal(attrs[gunshipOffset+1]&192,64,'Gunship uses a 16x32 source at 32x32');
  assert.equal(sprite(attrs,planes.enemies[2]).p,1800);assert.equal((await variables()).HP,3);
  assert.equal((await basicState()).arrayBytes,224,'68 integer elements plus eleven array headers');
  assert.equal(sprite(attrs,39).y,511,'The former third player-shot slot stays hidden');
  assert.equal((await variables()).EC,0);assert.deepEqual((await variables()).SY,[-1,-1]);
  assert.equal(sprite(attrs,15).y,511,'The removed SVNS indicator stays hidden');
  for(let i=0;i<4;i++) assert.deepEqual(sprite(attrs,8+i),{x:24+i*8,y:0,p:1824},'Score uses eight-dot spacing');
  for(const n of planes.enemyShots) assert.deepEqual(sprite(attrs,n),{x:0,y:511,p:1796},'Both enemy-shot slots start hidden');
  const lookup=await variables(),font=await bytes('physical VRAM',0x37600,2048);
  assert.equal((await variables()).LV,3);
  await frames(20);
  assert.equal(await number('debug read {VDP regs} 23'),176,'Four-dot background scroll');
  assert.deepEqual(sprite(await sat(),planes.player),{x:120,y:174,p:1792},'Stationary player in scrolling world');
  assert.notDeepEqual((await sat()).subarray(planes.enemies[0]*8,planes.shots[0]*8),attrs.subarray(planes.enemies[0]*8,planes.shots[0]*8),'Enemies advance');
  await hold(1,7);
  assert.equal((await variables()).BC,2,'Held trigger cannot exceed two simultaneous shots');
  assert.equal((await variables()).BF,0,'Two shots wrap the firing slot back to zero');
  const burstSat=await sat(),burst=planes.shots.map(n=>sprite(burstSat,n));
  assert.deepEqual(burst.map(s=>s.y),[78,114],'Two shots retain the three-update firing interval');
  assert.equal(sprite(burstSat,39).y,511,'Holding fire never displays the old third shot');
  await frames(1);assert.equal(sprite(await sat(),planes.shots[0]).y,66,'First shot continues independently');
  await capture('play');
  await key('p');
  const paused=await sat(),scroll=await number('debug read {VDP regs} 23'),pausedBackground=await bytes('physical VRAM',0,32768);
  await frames(5);assert.deepEqual(await sat(),paused);assert.equal(await number('debug read {VDP regs} 23'),scroll);
  assert.deepEqual(await bytes('physical VRAM',0,32768),pausedBackground,'Pause must stop background replenishment');
  for(const k of ['v','V']) {
    await key(k);assert.equal(await number('debug read {VDP regs} 20'),0x1b,'V no longer toggles SVNS');
    assert.deepEqual(await sat(),paused,'V cannot change the HUD or gameplay sprites');
    assert.equal(await number('debug read {VDP regs} 23'),scroll);
  }
  await capture('paused');
  await key('P');
  const x=(await variables()).PX;
  await hold(128,4);assert.ok((await variables()).PX>x,'Right cursor');
  await hold(16,4);assert.equal((await variables()).PX,x,'Left cursor');
  await hold(32,3);assert.ok((await variables()).PY<174,'Up cursor');
  await hold(64,3);assert.equal((await variables()).PY,174,'Down cursor');
  await hold(1,2);assert.ok((await variables()).BC>0,'Space fires');
  console.log('PASS: disk assets, sprite mode 3, 16x32 player, scroll, pause, fixed SVNS, cursor input and firing');

  // Aim using only real cursor/trigger input; no writes to BASIC or SAT state.
  for(let i=0;i<250 && (await variables()).SC===0 && (await variables()).LV>0;i++) {
    const v=await variables(),data=await sat();
    const targets=planes.enemies.map(n=>sprite(data,n)).filter(s=>s.y<v.PY && s.y>-16).sort((a,b)=>b.y-a.y);
    const target=targets[0];
    const targetX=target?target.x+(target.p===1800?8:0):v.PX;
    const direction=targetX>v.PX+4?128:targetX<v.PX-4?16:0;
    await hold(direction|1,1);
  }
  assert.ok((await variables()).SC>0,'Shots must hit enemies and increase score');
  assert.ok(sprite(await sat(),10).p>1824,'Score digit must update');
  await capture('score');
  const escaped=await variables();
  await stage({EX:[16,48,208],EY:[211,211,211],IV:0,BC:0,BY:[-1,-1],SY:[-1,-1],EC:0,T:1});
  await frames(1);
  assert.equal((await variables()).LV,escaped.LV,'All three escaped enemies must leave lives unchanged');
  assert.equal((await variables()).SC,escaped.SC,'Escaping enemies give no points');
  assert.deepEqual((await variables()).EY,[-32,-80,-128]);
  assert.equal((await variables()).HP,3,'Respawn restores gunship health');

  await stage({PX:120,PY:174,EX:[40,72,184],EY:[-100,-100,30],T:7,IV:0,BC:0,SY:[-1,-1],SX:[0,0],VX:[0,0],VY:[0,0],EC:0});
  await frames(1);
  const fired=await variables();
  assert.deepEqual(fired.SY,[56+fired.VY[0],-1],'Visible gunship fires on update 8 instead of waiting for 32');
  assert.equal(fired.EC,1);aimedShot(fired,sprite(await sat(),planes.enemies[2]));
  assert.equal(sprite(await sat(),planes.enemyShots[0]).y,Math.trunc(fired.SY[0]));
  await frames(7);
  assert.deepEqual((await variables()).SY,[56+8*fired.VY[0],-1],'No second shot before eight updates elapse');
  await frames(1);
  const pair=await variables();
  assert.equal(pair.EC,2);assert.deepEqual(pair.SY,[56+9*fired.VY[0],72+pair.VY[1]],'Second shot appears while the first is still flying');
  aimedShot(pair,sprite(await sat(),planes.enemies[2]),1);
  assert.equal(pair.SX[0],fired.SX[0]+8*fired.VX[0],'Firing cannot reset the first trajectory');
  const pairSat=await sat(),pairImage=await capture('enemy-shots');
  if(visual) for(const n of planes.enemyShots) {
    const s=sprite(pairSat,n),ink=pairImage.pixel(s.x+7,s.y+6);
    assert.ok(ink.every(c=>c>200),`Enemy-shot highlight is rendered for slot ${n}`);
  }
  await key('p');const pausedShots=await variables(),pausedShotSat=await sat();
  await frames(4);assert.deepEqual(await sat(),pausedShotSat,'Pause freezes both enemy bullets');
  assert.deepEqual((await variables()).SY,pausedShots.SY);await key('p');
  await stage({T:23,SY:[100,60],SX:[32,208],VX:[-2,2],VY:[6,6],EC:2});await frames(1);
  assert.deepEqual((await variables()).SX,[30,210]);assert.deepEqual((await variables()).SY,[106,66],'Full pool moves both shots without replacing either');
  assert.equal((await variables()).EC,2);
  await stage({T:0,SY:[211,80],SX:[0,160],VX:[0,0],VY:[6,6],EC:2});await frames(1);
  assert.deepEqual((await variables()).SY,[-1,86]);assert.equal((await variables()).EC,1);
  assert.equal(sprite(await sat(),planes.enemyShots[0]).y,511,'Expired first shot is hidden');
  await stage({T:7,EY:[-100,-100,30]});await frames(1);
  const reused=await variables();
  assert.equal(reused.EC,2);assert.deepEqual(reused.SY,[56+reused.VY[0],92],'Reuse the empty slot without replacing the second shot');
  aimedShot(reused,sprite(await sat(),planes.enemies[2]));
  assert.equal((await variables()).SX[1],160);
  await stage({T:0,SY:[211,80],SX:[0,240],VX:[0,2],VY:[6,6],EC:2});await frames(1);
  assert.deepEqual((await variables()).SY,[-1,-1]);assert.equal((await variables()).EC,0,'Both shots can expire in the same update');
  for(const n of planes.enemyShots) assert.equal(sprite(await sat(),n).y,511);
  for(const y of [-2,13,126,212]) {
    await stage({EY:[-100,-100,y],T:7,SY:[-1,-1],EC:0});await frames(1);
    assert.equal((await variables()).EC,0,'Hidden, too-low or respawned gunship must not fire');
  }
  console.log('PASS: eight-update firing, two independent shots, bounded pool, slot reuse, pause and offscreen cleanup');

  const aligned=120-lookup.WX[28]-8;
  for(const [px,py,ex,ey] of [
    [0,180,208,14],[240,180,16,14],[120,174,aligned,30],
    [24,100,184,80],[232,100,24,80],[240,101,16,80],
    [24,24,208,100],[232,24,24,100],[120,24,aligned,80]
  ]) {
    await stage({PX:px,PY:py,EX:[40,72,ex],EY:[-2000,-2000,ey],T:7,IV:2,LV:3,BC:0,BY:[-1,-1],SY:[-1,-1],EC:0});
    await frames(1);
    const shot=await variables(),enemy=sprite(await sat(),planes.enemies[2]);
    aimedShot(shot,enemy);assert.equal(shot.EC,1);
    const distance=Math.hypot(px-enemy.x-8,py-enemy.y-18);
    await stage({EY:[-2000,-2000,-2000],IV:0});
    await frames(Math.ceil(distance/6)+1);
    const hit=await variables();
    assert.equal(hit.LV,2,`A stationary player at (${px},${py}) is hit from (${ex},${ey})`);
    assert.equal(hit.EC,0,'Aimed shot is consumed on contact');
    assert.deepEqual(hit.VX,shot.VX);assert.deepEqual(hit.VY,shot.VY,'Velocity remains constant throughout flight');
  }
  for(const [px,py] of [[120,100],[121,100],[120,101]]) {
    await stage({PX:px,PY:py,EX:[40,72,aligned],EY:[-2000,-2000,80],T:7,IV:32,LV:3,SY:[-1,-1],EC:0});
    await frames(1);aimedShot(await variables(),sprite(await sat(),planes.enemies[2]));
  }
  // Move after firing: retain the original line of fire, including fractional travel.
  await stage({PX:120,PY:174,EX:[40,72,184],EY:[-2000,-2000,30],T:7,IV:32,LV:3,SY:[-1,-1],EC:0});
  await frames(1);
  const locked=await variables();
  await stage({EY:[-2000,-2000,-2000]});await hold(16,5);
  const dodged=await variables();
  assert.equal(dodged.PX,100);assert.deepEqual(dodged.VX,locked.VX);assert.deepEqual(dodged.VY,locked.VY,'No homing after player movement');
  assert.equal(dodged.SX[0],locked.SX[0]+5*locked.VX[0]);assert.equal(dodged.SY[0],locked.SY[0]+5*locked.VY[0]);
  assert.deepEqual(sprite(await sat(),40),{x:Math.trunc(dodged.SX[0]),y:Math.trunc(dodged.SY[0]),p:1796},'Render integer pixels without discarding accumulated fractions');
  await stage({SX:[0,100],SY:[100,0],VX:[-1/64,0],VY:[0,-1/64],EC:2,IV:32,T:0});await frames(1);
  assert.equal((await variables()).EC,0);assert.deepEqual((await variables()).SY,[-1,-1],'Even subpixel left/top exits free both slots');
  for(const n of planes.enemyShots) assert.equal(sprite(await sat(),n).y,511);
  console.log('PASS: stationary targets in all directions, constant speed, long/zero/near-zero aim, fractional movement, firing-time lock and top/left cleanup');

  for(const [dx,dy,hit] of [[0,-7,false],[0,-6,true],[0,19,true],[0,20,false],[-8,6,false],[-7,6,true],[7,6,true],[8,6,false]]) {
    await stage({PX:120,PY:100,EY:[-2000,-2000,-2000],T:0,IV:0,LV:3,BC:0,BY:[-1,-1],SX:[120+dx,0],SY:[100+dy,-1],VX:[0,0],VY:[0,0],EC:1});
    await frames(1);
    const contact=await variables();
    assert.equal(contact.LV,hit?2:3,`Enemy-shot strict contact edge (${dx},${dy})`);
    assert.equal(contact.EC,hit?0:1);
  }
  console.log('PASS: unchanged strict collision inequalities at all four enemy-shot hitbox edges');

  await stage({PX:120,PY:174,IV:32,SY:[-1,-1],EC:0});
  const score=(await variables()).SC;
  for(let hit=1;hit<=3;hit++) {
    await stage({EX:[40,72,120],EY:[-100,-100,80],T:11,BC:1,BF:1,FC:2,BX:[128,0],BY:[100,-1],SY:[-1,-1],EC:0});
    await frames(1);
    const v=await variables();assert.equal(v.BC,0);assert.deepEqual(v.BY,[-1,-1]);
    assert.equal(v.HP,hit===3?3:3-hit,'Gunship requires three hits');
    assert.equal(v.SC,(score+(hit===3?50:0))%10000,'Only destruction awards 50 points');
    assert.equal(v.EY[2],hit===3?-128:82,'Nonlethal hits must not respawn the gunship');
  }
  await stage({EX:[40,72,120],EY:[-100,-100,80],HP:2,T:11,BC:2,BF:0,FC:2,BX:[128,128],BY:[100,100],SY:[-1,-1],EC:0});
  await frames(1);assert.equal((await variables()).BC,0,'Scoring must not corrupt the active bullet loop');
  assert.equal((await variables()).SC,(score+100)%10000,'Two same-update hits finish a damaged gunship once');

  for(let slot=0;slot<2;slot++) {
    const before=await variables(),ys=[-1,-1];ys[slot]=100;
    await stage({EX:[120,40,184],EY:[80,-2000,-2000],T:11,IV:32,BC:1,BX:[128,128],BY:ys,SY:[-1,-1],EC:0});
    await frames(1);
    const hit=await variables();
    assert.equal(hit.SC,(before.SC+10)%10000,`Player bullet slot ${slot} destroys a small enemy`);
    assert.equal(hit.BC,0);assert.deepEqual(hit.BY,[-1,-1]);assert.equal(hit.EY[0],-32);
    assert.equal(sprite(await sat(),37+slot).y,511,'Only the matching shot is consumed');
  }
  const beforeRespawn=await variables();
  await stage({EX:[120,40,184],EY:[80,-2000,-2000],T:11,IV:32,BC:2,BX:[128,128],BY:[100,100],SY:[-1,-1],EC:0});
  await frames(1);
  const afterRespawn=await variables();
  assert.equal(afterRespawn.SC,(beforeRespawn.SC+10)%10000,'Two shots cannot kill one small enemy repeatedly');
  assert.equal(afterRespawn.BC,1);assert.deepEqual(afterRespawn.BY,[-1,88],'The later slot tests the respawned position, not the old hitbox');
  await stage({EY:[-2000,-2000,-2000],T:0,IV:32,BC:2,BX:[20,80],BY:[28,27],SY:[-1,-1],EC:0});
  await frames(1);
  assert.deepEqual((await variables()).BY,[16,-1]);assert.equal((await variables()).BC,1,'Exact upper exit edge');
  const edgeShots=await sat();
  assert.equal(sprite(edgeShots,37).y,16);assert.equal(sprite(edgeShots,38).y,511);assert.equal(sprite(edgeShots,39).y,511);
  await stage({BC:2,BY:[27,0]});await frames(1);
  assert.deepEqual((await variables()).BY,[-1,-1]);assert.equal((await variables()).BC,0,'Both player shots can expire in the same update');
  console.log('PASS: each unrolled player-shot slot, immediate respawn during collision checks and exact projectile exit boundaries');

  await stage({PX:120,PY:174,EY:[-2000,-2000,-2000],IV:32,BC:2,BF:0,FC:0,BX:[20,160],BY:[64,100],SY:[-1,-1],EC:0});
  await hold(1,1);
  assert.deepEqual((await variables()).BY,[52,88],'A full player-shot pool does not overwrite either shot');
  assert.deepEqual((await variables()).BX,[20,160]);assert.equal((await variables()).BF,0);
  await stage({BY:[27,100]});await hold(1,1);
  assert.deepEqual((await variables()).BY,[-1,88]);assert.equal((await variables()).BC,1);
  await hold(1,1);
  assert.deepEqual((await variables()).BY,[150,76]);assert.equal((await variables()).BF,1,'Reuse slot zero after expiration');
  assert.deepEqual((await variables()).BX,[120,160]);assert.equal((await variables()).BC,2);
  await stage({BY:[100,27],FC:0});await hold(1,1);await hold(1,1);
  assert.deepEqual((await variables()).BY,[76,150]);assert.equal((await variables()).BF,0,'Reuse slot one and wrap to zero');
  for(let i=0;i<20;i++) {
    await hold(1,1);
    const pool=await variables();
    assert.ok(pool.BC>=0 && pool.BC<=2);assert.equal(pool.BC,pool.BY.filter(y=>y>=0).length);
    assert.ok(pool.BF===0 || pool.BF===1);assert.equal(sprite(await sat(),39).y,511);
  }
  console.log('PASS: held fire stays capped at two shots, both slots are reused without overwriting and slot 39 stays hidden');

  await stage({PX:120,PY:174,EX:[40,72,184],EY:[32,8,32],T:0,BC:0,BF:0,FC:0,BY:[-1,-1],SY:[40,16],SX:[160,208],VX:[0,-2],VY:[6,6],EC:2});
  await hold(1,7);assert.equal((await variables()).BC,2);
  await capture('gunship-burst');
  console.log('PASS: two-shot burst, harmless escapes, 32x32/three-hit gunship, score-loop isolation and aimed enemy bullet');

  const lives=3;
  await stage({LV:lives,EX:[120,40,184],EY:[171,-128,-128],T:31,BC:0,BY:[-1,-1],SY:[-1,-1],EC:0,IV:0});
  await frames(1);assert.equal((await variables()).LV,lives-1,'Direct contact reduces lives');
  assert.equal((await sat())[playerOffset+3]&192,128,'Damage makes the player translucent');
  if((await variables()).LV>0) {
    const protectedLives=(await variables()).LV;
    await stage({EX:[120,40,184],EY:[171,-128,-128],T:31,SX:[120,120],SY:[172,172],VX:[0,0],VY:[6,6],EC:2});
    await frames(1);assert.equal((await variables()).LV,protectedLives,'Invulnerability protects against contact and enemy shots');
    assert.equal((await variables()).EC,2,'Invulnerability leaves both projectiles flying');
  }
  let hitSlot=1;
  while((await variables()).LV>0) {
    const v=await variables();
    const xs=[v.PX,v.PX],ys=[v.PY-2,v.PY-2];
    if(hitSlot===1) xs[0]=0;
    await stage({EY:[-128,-128,-128],IV:0,SX:xs,SY:ys,VX:[0,0],VY:[6,6],EC:2,T:1});
    await frames(1);
    assert.equal((await variables()).LV,v.LV-1,'Either bullet slot and simultaneous hits reduce exactly one life');
    assert.equal((await variables()).SY[hitSlot],-1,'Colliding enemy bullet is consumed');
    assert.equal((await variables()).EC,1,'The other bullet survives the collision update');
    hitSlot=0;
  }
  console.log('PASS: either enemy-shot slot can hit; simultaneous hits cost only one life and leave the other shot protected by invulnerability');
  for(let i=0;i<8;i++) assert.equal(sprite(await sat(),16+i).p,1856+i,'GAME OVER sprites');
  const hidden=await sat();
  for(const n of [planes.player,planes.explosion,...planes.enemies,...planes.shots,...planes.enemyShots]) assert.equal(sprite(hidden,n).y,511,'Game over hides every gameplay sprite');
  await capture('gameover');
  const over=await sat();await frames(8);assert.deepEqual(await sat(),over,'Game over is stationary');
  assert.equal((await variables()).TW,pal?250:300,'Five-second wait follows the refresh rate');
  for(const k of ['r','R','p','P',' ']) {
    await key(k);assert.equal((await variables()).LV,0,'Keys cannot restart or pause GAME OVER');
    assert.deepEqual(await sat(),over);
  }
  const overVram=await bytes('physical VRAM',0,262144);
  await msx.command(`after time [expr {$::shoot_over_started+4.5-[machine_info time]}] {set ::shoot_steps 0; debug break}
    set ::shoot_steps -1; debug cont`);await stopped();
  assert.equal((await variables()).LV,0,'GAME OVER stays visible before five seconds');
  assert.deepEqual(await bytes('physical VRAM',0,262144),overVram,'No animation or drawing during the wait');
  await msx.command('set ::shoot_title 1');await frames(1);
  const returnSeconds=await number('expr {$::shoot_return_started-$::shoot_over_started}');
  // TIME is quantized to VBlanks; the real refresh rate is not exactly 50/60 Hz.
  assert.ok(Math.abs(returnSeconds-5)<0.06,`Title return at five seconds, got ${returnSeconds}`);
  assert.deepEqual(await bytes('physical VRAM',0,32768),title,'Automatic title return');
  assert.equal((await number('debug read {VDP regs} 8'))&2,2,'Title hides GAME OVER and HUD sprites');
  assert.equal(await number('debug read {VDP regs} 23'),0,'Title resets scroll');
  for(const k of ['r','R']) {await key(k);assert.equal((await variables()).LV,0,'R does not start a new game from the title');}
  await msx.command('set ::shoot_title 0');await key(' ');
  assert.equal((await variables()).LV,3);assert.equal((await variables()).SC,0);
  console.log(`PASS: five-second GAME OVER (${returnSeconds.toFixed(3)} s), ignored R, stationary VRAM and automatic title return`);
  assert.equal(await number('debug read {VDP regs} 23'),0,'Restart scroll');
  assert.equal((await number('debug read {VDP regs} 20'))&2,2);
  assert.equal(await number('peek16 0xfc4a'),himem);assert.equal(await number('peek16 0xfd2f'),work);
  assert.deepEqual(await bytes('physical VRAM',0,32768),bg,'Restart must restore the first background page');
  assert.deepEqual(await bytes('physical VRAM',32768,3*32768),terrain,'Background source pages must remain unchanged');
  assert.equal((await variables()).BP,5);assert.equal((await variables()).BR,240);
  assert.deepEqual(await bytes('physical VRAM',4*32768,32768),title,'Title survives gameplay/restart');
  assert.deepEqual(await bytes('physical VRAM',5*32768,32768),runway,'Fourth background survives gameplay/restart');
  assert.equal((await variables()).BC,0);assert.equal((await variables()).BF,0);assert.equal((await variables()).FC,0);
  assert.equal((await variables()).EC,0);assert.deepEqual((await variables()).SY,[-1,-1]);
  assert.deepEqual((await variables()).SX,[0,0]);assert.deepEqual((await variables()).VX,[0,0]);
  assert.deepEqual((await variables()).VY,[0,0]);
  assert.deepEqual((await variables()).BY,[-1,-1]);assert.equal((await variables()).HP,3);
  assert.equal(sprite(await sat(),39).y,511,'The unused third shot stays hidden after restart');
  for(const name of ['DX','DY','WX']) assert.deepEqual((await variables())[name],lookup[name],'Motion lookup tables must survive gameplay/restart');
  assert.equal((await basicState()).arrayBytes,224,'Restart must not allocate new arrays');
  assert.deepEqual(await bytes('physical VRAM',0x37600,2048),font,'Font reservation is untouched');
  assert.deepEqual(await bytes('physical VRAM',7*32768,16384),art,'Pattern data survives play/restart');
  const clearHud=await capture('hud-clear');
  if(visual) {
    const zero=[14,17,19,21,25,17,14],ink=clearHud.pixel(30,4);
    assert.ok(ink.every(c=>c>240),'Score digits are white');
    for(let y=0;y<16;y++) for(let x=24;x<64;x++) {
      const expected=y>=4 && y<11 && [24,32,40,48].some(left=>{
        const col=x-left-5;return col>=0 && col<5 && Boolean(zero[y-4]&(16>>col));
      });
      assert.equal(clearHud.pixel(x,y).equals(ink),expected,`Compact score pixel (${x},${y})`);
    }
  }
  await stage({EX:[44,104,184],EY:[-3,-3,-2],T:0});await frames(1);
  const covered=await sat();
  for(const n of planes.enemies) assert.equal(sprite(covered,n).y,0,'Enemies overlap the entire HUD height');
  const overlap=await capture('hud-overlap');
  if(visual) assert.ok(overlap.hud.equals(clearHud.hud),'Enemies must not cover HUD text or its opaque strip');
  await stage({EX:[44,104,184],EY:[9,9,10],T:0});await frames(1);
  const emerging=await sat(),small=sprite(emerging,planes.enemies[0]);
  assert.equal(small.y,12,'Enemy crosses the lower edge of the HUD');
  const reveal=await capture('hud-reveal');
  if(visual) {
    assert.ok(reveal.hud.equals(clearHud.hud),'Partly emerged enemies still stay behind the HUD');
    const red=reveal.pixel(small.x+5,small.y+7);
    assert.ok(red[0]>240 && red[1]<130 && red[2]<130,'Enemy remains visible immediately below the HUD');
  }
  assert.equal(await number('peek 0xf3db'),0,'Key clicks remain off after gameplay/restart');
  console.log('PASS: HUD priority over overlapping small/large enemies and unchanged silent key clicks');
  for(const [x,y,mask,expectedX,expectedY] of [
    [0,100,16,0,100],[1,100,16,0,100],[4,100,16,0,100],
    [240,100,128,240,100],[239,100,128,240,100],[236,100,128,240,100],
    [120,24,32,120,24],[120,25,32,120,24],[120,28,32,120,24],
    [120,180,64,120,180],[120,179,64,120,180],[120,176,64,120,180],
    [1,25,48,0,24],[239,25,160,240,24],[1,179,80,0,180],[239,179,192,240,180],
    [120,100,160,124,96],[120,100,80,116,104]
  ]) {
    await stage({PX:x,PY:y,IV:32,EY:[-128,-128,-128],SY:[-1,-1],EC:0,BC:0,BY:[-1,-1]});
    await hold(mask,1);
    const v=await variables(),player=sprite(await sat(),planes.player);
    assert.deepEqual([v.PX,v.PY],[expectedX,expectedY],`Player bounds from (${x},${y}), keys ${mask}`);
    assert.deepEqual([player.x,player.y],[expectedX,expectedY],'Clamped position reaches the sprite');
  }
  console.log('PASS: exclusive coordinate clamps, exact bounds, overshoot, all corners and interior diagonal movement');

  async function gameOver() {
    const v=await variables();
    await stage({LV:1,IV:0,EY:[-128,-128,-128],SX:[v.PX,0],SY:[v.PY-2,-1],VX:[0,0],VY:[6,0],EC:1,BC:0,BY:[-1,-1],T:1});
    await frames(1);assert.equal((await variables()).LV,0);
    assert.ok(await number('peek16 0xfc9e')<3,'Each GAME OVER resets TIME');
  }
  await gameOver();
  await msx.command(`keymatrixdown 8 1; set ::shoot_title 1; set ::shoot_steps -1
    set ::shoot_held_title [debug set_watchpoint write_mem 0xf41d {$::wp_last_value == 0 && [peek 0xf41c] == 72} {set ::shoot_steps 0; debug break}]
    debug cont`);await stopped();
  await msx.command('debug remove_watchpoint $::shoot_held_title');
  assert.deepEqual(await bytes('physical VRAM',0,32768),title,'Holding fire still returns to the title');
  assert.equal((await variables()).LV,0,'Held fire cannot restart automatically');
  await msx.command('keymatrixup 8 1');await frames(2);
  assert.equal((await variables()).LV,0,'Releasing old fire input is not a new start');
  await msx.command('set ::shoot_title 0');await key(' ');assert.equal((await variables()).LV,3);
  await gameOver();
  console.log('PASS: repeated GAME OVER resets the timer; held/released fire needs a fresh start input');
  const times=(await msx.command('join $::shoot_times " "')).split(' ').map(Number);
  const fps=19/(times[19]-times[0]);
  console.log(`PASS: real-input hits/score, collision fixtures, game over/restart, preserved assets/reservations/tables; ${fps.toFixed(2)} initial updates/s`);
  await writeFile(resolve(root,`build/shoot-${pal?'pal':'ntsc'}-result.json`),JSON.stringify({fps,updates:times.length,gameOverSeconds:returnSeconds},null,2));
  await msx.type('\x1b');await msx.command('set ::shoot_steps -1; debug cont');await msx.advance(4);
  assert.match(await msx.screen(),/V9968 DEMO DISK/);
  assert.equal(await number('debug read {VDP regs} 20'),0);assert.equal(await number('debug read {VDP regs} 23'),0);
  assert.equal(await number('peek16 0xfc4a'),himem);assert.equal(await number('peek16 0xfd2f'),work);
  console.log('PASS: Escape during GAME OVER restores text mode, scroll, extension flags and menu');
} finally {await msx.stop();}
