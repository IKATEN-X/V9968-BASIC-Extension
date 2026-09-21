import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readFile, readdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { execFileSync } from 'node:child_process';
import { prepareDemoDisk } from '../tools/demo-disk.mjs';
import { OpenMsx, tclString } from '../tools/openmsx.mjs';
import { readPalette } from './palette-state.mjs';

const root=resolve(import.meta.dirname,'..');
const visual=process.argv.includes('--visual');
const errorsOnly=process.argv.includes('--errors-only');
const machine='Panasonic_FS-A1ST(V9968)';
const disk=await prepareDemoDisk();
const original=new Map();
for(const name of disk.files) original.set(name,await readFile(resolve(disk.directory,name)));
assert.match(original.get('AUTOEXEC.BAS').toString('ascii'),/^10 RUN"A:MENU.BAS"\r\n\x1a$/);
assert.deepEqual(original.get('BACK.SC5').subarray(0,7),Buffer.from([254,0,0,255,105,0,0]));
for(const name of ['ORBIT.BAS','SPRITE.BAS','FONT.BAS','PALETTE.BAS','SHUFFLE.BAS','SPRITE16.BAS','WAVE.BAS','SHOOT.BAS','INTERLAC.BAS','COPYLOG.BAS','CIRCLE.BAS']) {
  assert.match(original.get(name).toString('ascii'),/demo stopped\.".*:RUN"A:MENU.BAS"/);
  assert.doesNotMatch(await readFile(resolve(root,'demo',name),'ascii'),/MENU\.BAS/);
}
const second=await prepareDemoDisk({entry:'assets.bas'});
assert.notEqual(second.directory,disk.directory);
assert.match(await readFile(resolve(second.directory,'AUTOEXEC.BAS'),'ascii'),/RUN"A:ASSETS.BAS"/);
await assert.rejects(prepareDemoDisk({entry:'../FONT.BAS'}),/8\.3/);
await assert.rejects(prepareDemoDisk({entry:'ABSENT.BAS'}),/not found/);
const invalid=await mkdtemp(resolve(root,'build/disk-invalid-'));
await writeFile(resolve(invalid,'TOO-LONG-NAME.BAS'),'10 END');
await assert.rejects(prepareDemoDisk({source:invalid}),/8\.3/);
const custom=await mkdtemp(resolve(root,'build/disk custom source-'));
await writeFile(resolve(custom,'START.BAS'),'10 PRINT "CUSTOM DISK BOOT":END\n');
await writeFile(resolve(custom,'RAW.BIN'),Buffer.from([0,26,127,128,255]));
const customDisk=await prepareDemoDisk({source:custom,entry:'START.BAS'});
assert.deepEqual(await readFile(resolve(customDisk.directory,'RAW.BIN')),Buffer.from([0,26,127,128,255]));
const tooLarge=await mkdtemp(resolve(root,'build/disk-full-'));
await writeFile(resolve(tooLarge,'START.BAS'),'10 END');
await writeFile(resolve(tooLarge,'LARGE.BIN'),Buffer.alloc(714*1024));
await assert.rejects(prepareDemoDisk({source:tooLarge,entry:'START.BAS'}),/capacity/);
const broken=await mkdtemp(resolve(root,'build/disk-missing-'));
for(const [name,data] of original) {
  if(!['AUTOEXEC.BAS','FONT.DAT','CITY.SC5'].includes(name)) await writeFile(resolve(broken,name),data);
}
const brokenDisk=await prepareDemoDisk({source:broken,entry:'ASSETS.BAS'});
const brokenShooter=await prepareDemoDisk({source:broken,entry:'SHOOT.BAS'});
const brokenShooters=[{disk:brokenShooter,asset:'CITY.SC5',line:20}];
for(const [asset,line] of [['RUNWAY.SC5',42],['TITLE.SC5',44],['CARGO.SC5',46]]) {
  const directory=await mkdtemp(resolve(root,'build/disk-missing-shoot-'));
  for(const [name,data] of original) if(name!=='AUTOEXEC.BAS' && name!==asset) await writeFile(resolve(directory,name),data);
  brokenShooters.push({disk:await prepareDemoDisk({source:directory,entry:'SHOOT.BAS'}),asset,line});
}
console.log('PASS: 8.3 file set, CRLF BASIC, binary assets, isolated snapshots, custom source/entry and validation');

async function configureTiming(instance) {
  if(process.argv.includes('--realtime'))await instance.command('set throttle on; set speed 100');
}
if(!errorsOnly) {
const msx=new OpenMsx({rom:'dist/v9968-basic.rom',machine,diskDirectory:disk.directory});
const number=async code=>Number(await msx.command(code));
const block=async (address,size)=>Buffer.from(await msx.command(`binary encode hex [debug read_block {physical VRAM} ${address} ${size}]`),'hex');
async function stableScreenMode() {
  let mode=await number('peek 0xfcaf');
  // Like the command harness, distinguish transient unmapped reads from RAM.
  // Retry only FF: an actual wrong screen mode still fails immediately.
  if(mode===255)console.log('SCRMOD=FF, checking again; PC/SP/R0/R1:',await msx.command('list [reg PC] [reg SP] [debug read {VDP regs} 0] [debug read {VDP regs} 1]'));
  for(let i=0;i<20&&mode===255;i++){await msx.advance(.05);mode=await number('peek 0xfcaf');}
  return mode;
}
async function menu() {
  await msx.advance(3);
  assert.equal(await number('peek 0xFCAF'),0);
  const text=await msx.screen();
  assert.match(text,/V9968 DEMO DISK/);
  assert.match(text,/8\s+SPRITE WAVE/);
  assert.match(text,/9\s+SKYLINE PATROL/);
  assert.match(text,/F\s+FLAT INTERLACE/);
  assert.match(text,/L\s+LOGICAL COPY/);
  assert.match(text,/C\s+CIRCLE/);
  assert.match(text,/0\s+BASIC/);
}
async function screenshot(name) {
  if(!visual) return;
  const path=resolve(root,`build/screenshots/disk-${name}.png`);
  await mkdir(resolve(root,'build/screenshots'),{recursive:true});
  const flat=name==='interlace' || name==='copy-logic' || name==='circle-fil';
  await msx.command('set ::disk_capture_settings [list $renderer $throttle $deinterlace $minframeskip $maxframeskip]');
  try {
    await msx.command('set renderer SDLGL-PP; set throttle on');
    if(flat) await msx.command('set deinterlace on; set minframeskip 0; set maxframeskip 0');
    await msx.advance(0.5);
    await msx.command(`screenshot -raw -size ${flat?640:320} ${tclString(path)}`);
  } finally {
    await msx.command('lassign $::disk_capture_settings renderer throttle deinterlace minframeskip maxframeskip; unset ::disk_capture_settings');
  }
  const png=JSON.parse(execFileSync('pwsh.exe',['-NoProfile','-File',resolve(root,'tests/read-png.ps1'),'-Path',path],{encoding:'utf8',windowsHide:true,maxBuffer:2**22}));
  assert.equal(png.width,flat?640:320);
  assert.equal(png.height,flat?480:240);
  const rgb=Buffer.from(png.rgb,'base64');
  let bright=0;
  for(let i=0;i<rgb.length;i+=3) if(Math.max(rgb[i],rgb[i+1],rgb[i+2])>150) bright++;
  assert.ok(bright>(name==='assets'?8000:600),`Empty ${name} screenshot`);
}
try {
  await configureTiming(msx);
  await msx.advance(20);
  await menu();
  assert.equal(await msx.command('set DirAsDSKmode'),'read_only');
  assert.equal(await msx.command('get_active_cpu'),'r800');
  const work=(await number('peek16 0xFD2F'))&0xfffe;
  const himem=await number('peek16 0xFC4A');
  assert.ok(work>himem && work<0xF1C9,'Font RAM must be reserved below the disk work area');
  const symbols=await readFile(resolve(root,'build/v9968-basic.map'),'ascii');
  const addr=name=>'0x'+new RegExp(`\\b${name}\\s*= \\$([0-9A-F]+)`,'i').exec(symbols)[1];
  await msx.command(`set ::disk_allocations 0; set ::disk_draws 0; debug set_bp ${addr('font_allocate')} {[pc_in_slot 1]} {incr ::disk_allocations}; debug set_bp ${addr('font_draw')} {[pc_in_slot 1]} {incr ::disk_draws}`);
  await screenshot('menu');
  console.log('PASS: Disk BASIC AUTOEXEC boot, menu without BASIC injection, R800 and late font RAM allocation');

  await msx.type('1');
  await msx.advance(8);
  if(await number('peek 0xFCAF')!==5) console.log(await msx.screen());
  assert.equal(await number('peek 0xFCAF'),5,'ASSETS.BAS did not load');
  const image=await block(0,27136);
  assert.deepEqual(image.subarray(32*128,136*128),original.get('BACK.SC5').subarray(7+32*128,7+136*128),'BLOAD must reproduce the disk bitmap');
  const font=await block(0x37600,2048);
  const data=original.get('FONT.DAT').toString('ascii').trim().split(/\r?\n/).slice(1).map(line=>line.split(',').map(Number));
  for(const [code,...rows] of data) assert.deepEqual(font.subarray(code*8,code*8+8),Buffer.from(rows),'Glyph bytes must come from FONT.DAT');
  const palette=Buffer.from(await msx.command('binary encode hex [debug read_block {VDP palette} 0 32]'),'hex');
  for(const line of original.get('PALETTE.DAT').toString('ascii').trim().split(/\r?\n/).slice(1)) {
    const [c,r,g,b]=line.split(',').map(Number);
    assert.equal(palette.readUInt16LE(c*2),(g<<10)|(r<<5)|b,'Palette must come from PALETTE.DAT');
  }
  const glyph=(code,x,y,color)=>{
    for(let row=0;row<8;row++) for(let col=0;col<8;col++) {
      const v=image[(y+row)*128+((x+col)>>1)];
      assert.equal((x+col)&1?v&15:v>>4,font[code*8+row]&(128>>col)?color:1);
    }
  };
  for(const [i,line] of original.get('TEXT.TXT').toString('ascii').trim().split(/\r?\n/).entries()) {
    for(let c=0;c<line.length;c++) glyph(line.charCodeAt(c),16+c*8,[8,176,192][i],15);
  }
  for(let i=0;i<16;i++) glyph(240+i%4,64+i*8,152,3);
  await screenshot('assets');
  await msx.type('\x1b'); await menu();
  console.log('PASS: bitmap BLOAD, palette/input files, custom font and GRP text pixel checks; Escape returns to menu');
  // Regression: the reported menu order leaves R8.DS set by the rotation demo.
  for(const [key,seconds] of [['3',25],['4',8]]) {
    await msx.type(key); await msx.advance(seconds);
    assert.equal(await number('peek 0xfcaf'),5);
    await msx.type('\x1b'); await menu();
  }
  assert.equal((await number('debug read {VDP regs} 8'))&2,2,'Rotation leaves sprites disabled');
  await msx.type('8'); await msx.advance(30);
  assert.equal(await number('peek 0xfcaf'),2);
  assert.equal((await number('debug read {VDP regs} 8'))&2,0,'Wave must enable sprites after menu 1 -> 3 -> 4 -> 8');
  assert.equal(await number('peek 0xffe7'),await number('debug read {VDP regs} 8'),'R8 BASIC shadow');
  assert.deepEqual(await block(await number('peek16 0xf926'),8),Buffer.from([24,60,126,255,255,126,60,24]));
  const sequenceSat=await number('peek16 0xf928'), sequenceWave=await block(sequenceSat,128);
  await msx.advance(1);
  assert.notDeepEqual(await block(sequenceSat,128),sequenceWave,'Wave animates after consecutive demos');
  await msx.type('\x1b'); await menu();
  console.log('PASS: menu 1 -> 3 -> 4 -> 8 restores native sprite display, pattern and animation');
  await msx.type('6'); await msx.advance(12);
  assert.equal(await number('peek 0xFCAF'),2,'Disk shuffle demo must start in sprite mode 1');
  assert.equal(await number('debug read {VDP regs} 20'),0,'Shuffle demo must not enable SP3 or the 16-sprite extension');
  await msx.type('s'); await msx.advance(1);
  assert.equal((await number('debug read {VDP regs} 25'))&128,128);
  await msx.type('2'); await msx.advance(12);
  assert.equal(await number('peek 0xFCAF'),4,'Sprite mode 2 selection');
  assert.equal((await number('debug read {VDP regs} 25'))&128,0);
  await msx.type('s'); await msx.advance(1);
  await msx.type('\x1b'); await menu();
  assert.equal((await number('debug read {VDP regs} 25'))&128,0,'Menu return must disable shuffle');
  console.log('PASS: separate shuffle menu item, sprite modes 1/2, S toggle and SPS cleanup on menu return');

  await msx.type('7'); await msx.advance(30);
  assert.equal(await number('peek 0xFCAF'),2,'Disk sprite16 demo must start in sprite mode 1');
  assert.equal(await number('debug read {VDP regs} 20'),0);
  const sat=await number('peek16 0xf928'), attributes=await block(sat,128);
  await msx.type(' '); await msx.advance(1);
  assert.equal(await number('debug read {VDP regs} 20'),128,'Space must enable only S16');
  assert.deepEqual(await block(sat,128),attributes,'Space must retain native sprite attributes');
  for(let i=0;i<32;i++) assert.deepEqual(attributes.subarray(i*4,i*4+4),Buffer.from([72,i*8,0,3+2*(i%4)]),'All 32 sprites must be prepared');
  await msx.type('s'); await msx.advance(1);
  assert.equal(await number('debug read {VDP regs} 20'),128,'Shuffle toggle must retain S16');
  assert.equal((await number('debug read {VDP regs} 25'))&128,128);
  assert.deepEqual(await block(sat,128),attributes,'Shuffle must retain native sprite attributes');
  await msx.type('2'); await msx.advance(30);
  assert.equal(await number('peek 0xFCAF'),4,'Disk sprite16 mode 2 selection');
  assert.equal(await number('debug read {VDP regs} 20'),0,'Mode change must reset S16');
  assert.equal((await number('debug read {VDP regs} 25'))&128,0,'Mode change must reset shuffle');
  await msx.type('S'); await msx.advance(1);
  assert.equal(await number('debug read {VDP regs} 20'),0);
  assert.equal((await number('debug read {VDP regs} 25'))&128,128);
  await msx.type('T'); await msx.advance(1);
  assert.equal(await number('debug read {VDP regs} 20'),128);
  assert.equal((await number('debug read {VDP regs} 25'))&128,128,'S16 toggle must retain shuffle');
  await screenshot('sprite16');
  await msx.type('\x1b'); await menu();
  assert.equal(await number('debug read {VDP regs} 20'),0,'Menu return must disable S16');
  assert.equal((await number('debug read {VDP regs} 25'))&128,0);
  console.log('PASS: sprite16 menu item, 32 sprites, modes 1/2, independent Space/T/S toggles and S16/SPS cleanup on menu return');

  await msx.type('8'); await msx.advance(30);
  assert.equal(await number('peek 0xFCAF'),2,'Wave demo must start in sprite mode 1');
  const waveSat=await number('peek16 0xf928');
  const wave=await block(waveSat,128);
  await msx.advance(1); assert.notDeepEqual(await block(waveSat,128),wave,'Wave must animate');
  await msx.type(' '); await msx.advance(1);
  const pausedWave=await block(waveSat,128);
  await msx.advance(1); assert.deepEqual(await block(waveSat,128),pausedWave,'Wave pause');
  await msx.type('T'); await msx.advance(1);
  await msx.type('S'); await msx.advance(1);
  await msx.type('2'); await msx.advance(4);
  assert.equal(await number('peek 0xFCAF'),4);
  assert.equal(await number('debug read {VDP regs} 20'),128);
  assert.equal((await number('debug read {VDP regs} 25'))&128,128);
  const pausedMode2=await block(await number('peek16 0xf928'),128);
  for(let i=0;i<32;i++) assert.deepEqual(pausedMode2.subarray(i*4,i*4+3),pausedWave.subarray(i*4,i*4+3),'Mode change must keep the paused wave');
  await msx.type('\x1b'); await menu();
  assert.equal(await number('debug read {VDP regs} 20'),0);
  assert.equal((await number('debug read {VDP regs} 25'))&128,0);
  console.log('PASS: wave menu item, motion, pause, settings/phase retained across mode change and menu cleanup');

  for(let attempt=0;attempt<2;attempt++) {
    await msx.command(`set ::disk_title_ready 0
      set ::disk_title_watch [debug set_watchpoint write_mem 0xf41d {$::wp_last_value == 0 && [peek 0xf41c] == 80 && [peek 0xfcaf] == 5} {set ::disk_title_ready 1}]`);
    await msx.type('9'); await msx.advance(5);
    for(let i=0;i<80 && !(await number('set ::disk_title_ready'));i++) await msx.advance(0.5);
    assert.equal(await number('set ::disk_title_ready'),1,'Title entrance must finish');
    await msx.command('debug remove_watchpoint $::disk_title_watch');
    await msx.advance(0.5);
    assert.equal(await number('peek 0xFCAF'),5,'Shooter menu entry');
    assert.equal(await number('debug read {VDP regs} 20'),0x7b,'Mode 3 and SVNS');
    for(const [page,name] of [[1,'CITY.SC5'],[2,'POWER.SC5'],[3,'CARGO.SC5'],[4,'TITLE.SC5'],[5,'RUNWAY.SC5']]) {
      assert.deepEqual(await block(page*32768,32768),original.get(name).subarray(7),`Shooter source page ${page}`);
    }
    assert.deepEqual(await block(0,32768),original.get('TITLE.SC5').subarray(7),'Display starts with the title');
    assert.equal((await number('debug read {VDP regs} 8'))&2,2,'Title hides sprites');
    if(attempt===0) {
      await screenshot('shoot-title');
      await msx.type('\x1b');await menu();
      assert.equal(await number('debug read {VDP regs} 20'),0,'Title Escape cleans up extension state');
      assert.equal(await number('debug read {VDP regs} 23'),0);
    }
  }
  await msx.type(' ');await msx.advance(1);
  assert.equal((await number('debug read {VDP regs} 8'))&2,0,'Space starts the game');
  await msx.type('p'); await msx.advance(1);
  const game=await block(0x37e00,512),scroll=await number('debug read {VDP regs} 23');
  await msx.advance(1); assert.deepEqual(await block(0x37e00,512),game,'Shooter pause');
  assert.equal(await number('debug read {VDP regs} 23'),scroll);
  for(const k of ['v','V']) {
    await msx.type(k); await msx.advance(1);
    assert.equal(await number('debug read {VDP regs} 20'),0x7b,'Removed V key must leave SVNS enabled');
    assert.deepEqual(await block(0x37e00,512),game,'V does not change the paused sprites');
    assert.equal(await number('debug read {VDP regs} 23'),scroll);
  }
  await screenshot('shoot');
  await msx.type('\x1b'); await menu();
  assert.equal(await number('debug read {VDP regs} 20'),0);
  assert.equal(await number('debug read {VDP regs} 23'),0);
  console.log('PASS: shooter title/escape/start, four backgrounds, mode 3/fixed SVNS, pause/ignored V and clean menu return');

  await msx.type('f');await msx.advance(30);
  assert.equal(await number('peek 0xfcaf'),7,'Interlace demo enters SCREEN 7');
  assert.equal((await number('debug read {VDP regs} 21'))&64,64,'FIL enabled');
  await msx.type('p');await msx.advance(1);
  const interlaceImage=await block(0,262144);
  assert.ok(interlaceImage.subarray(256*128,424*128).some(b=>b!==0),'Drawing below Y=255');
  const interlacePixel=(x,y,page=0)=>{
    const address=page*131072+((x&2)<<15)+(y<<7)+(x>>2);
    return (interlaceImage[address]>>((x&1)?0:4))&15;
  };
  let titlePixels=0;
  for(let y=0;y<32;y++) for(let x=0;x<224;x++) {
    const color=interlacePixel(x,y,1);
    if(color===15) titlePixels++;
    for(let dy=0;dy<2;dy++) for(let dx=0;dx<2;dx++) {
      assert.equal(interlacePixel(32+2*x+dx,16+2*y+dy),color,'Native GRP material on high page and scaled title COPY');
    }
  }
  assert.ok(titlePixels>300,'Both title strings have visible native glyphs');
  assert.equal(interlacePixel(503,423),15,'512-wide bottom-right frame');
  assert.equal(interlacePixel(49,128),8);assert.equal(interlacePixel(49,129),0);
  assert.equal(interlacePixel(400,200),6);assert.equal(interlacePixel(401,200),0);
  await screenshot('interlace');
  await msx.type('tT');await msx.advance(1);
  assert.deepEqual(await block(0,262144),interlaceImage,'Logical COPY comparison is separate; T is ignored here');
  await msx.type(' ');await msx.advance(1);
  assert.equal((await number('debug read {VDP regs} 21'))&64,0);
  await msx.type(' ');await msx.advance(1);
  assert.equal((await number('debug read {VDP regs} 21'))&64,64);
  assert.deepEqual(await block(0,262144),interlaceImage,'Mode comparison preserves both image pages');
  await msx.type('P');
  let rotatedImage;
  // A single delayed sample can coincide with the same angle after a full turn.
  for(let i=0;i<30;i++) {
    await msx.advance(0.1);
    rotatedImage=await block(0,262144);
    if(!rotatedImage.subarray(0,131072).equals(interlaceImage.subarray(0,131072))) break;
  }
  assert.notDeepEqual(rotatedImage.subarray(0,131072),interlaceImage.subarray(0,131072),'FIL rotation resumes');
  assert.deepEqual(rotatedImage.subarray(131072),interlaceImage.subarray(131072),'Rotation leaves the source page unchanged');
  await msx.type('\x1b');await menu();
  assert.equal(await number('debug read {VDP regs} 21'),0);
  console.log('PASS: SCREEN 7 interlace demo, high-page opaque rotation, ignored T, FIL toggle and menu cleanup');

  await msx.type('l');await msx.advance(15);
  assert.equal(await number('peek 0xfcaf'),7,'Logical COPY menu entry');
  assert.equal((await number('debug read {VDP regs} 21'))&64,0,'Logical COPY uses normal SCREEN 7');
  await msx.type('p');await msx.advance(2);
  const logicalImage=await block(0,262144);
  await msx.advance(2);assert.deepEqual(await block(0,262144),logicalImage,'Logical comparison pause');
  const logicalPixel=(data,x,y,page=0)=>(data[((x&2)<<15)+((y+page*256)<<7)+(x>>2)]>>((x&1)?0:4))&15;
  const sy=logicalPixel(logicalImage,480,5)===15?0:32;
  for(let op=0;op<10;op++) for(let y=0;y<64;y++) for(let x=0;x<96;x++) {
    const s=logicalPixel(logicalImage,x%32,(y%32)+sy,1),d=logicalPixel(logicalImage,64+x,y,1);
    const expected=op>=5 && !s?d:[s,s&d,s|d,s^d,(~s)&15][op%5];
    assert.equal(logicalPixel(logicalImage,8+(op%5)*100+x,48+Math.floor(op/5)*96+y),expected,'All ten disk-demo operator results');
  }
  await screenshot('copy-logic');
  await msx.type(' ');await msx.advance(2);
  const nextLogical=await block(0,262144);
  assert.notDeepEqual(nextLogical,logicalImage,'Space stamps the alternate source');
  for(const start of [0x8000,0x18000]) assert.deepEqual(nextLogical.subarray(start,start+0x8000),logicalImage.subarray(start,start+0x8000),'Logical COPY material is immutable');
  await msx.type('\x1b');await menu();
  console.log('PASS: separate logical COPY entry, all ten operations, pause, next source and clean menu return');

  await msx.command(`set ::circle_stages 0
    set ::circle_watch [debug set_watchpoint write_mem 0xf41d {$::wp_last_value <= 1} {
      switch [peek16 0xf41c] {
        100 {if {[peek 0xfcaf] == 7} {set ::circle_stages [expr {$::circle_stages | 1}]}}
        250 {if {[peek 0xfcaf] == 5} {set ::circle_stages [expr {$::circle_stages | 2}]}}
        320 {if {[peek 0xfcaf] == 5} {set ::circle_stages [expr {$::circle_stages | 4}]}}
      }
    }]`);
  const circleStage=async mask=>{
    for(let i=0;i<100 && !(await number('set ::circle_stages')&mask);i++)await msx.advance(.2);
    assert.ok(await number('set ::circle_stages')&mask,`CIRCLE demo stage ${mask}`);
  };
  await msx.type('c');await circleStage(1);
  assert.equal(await number('peek 0xfcaf'),7,'CIRCLE starts in SCREEN 7 FIL');
  assert.equal((await number('debug read {VDP regs} 21'))&64,64);
  await screenshot('circle-fil');
  await circleStage(2);await screenshot('circle-patterns');
  await circleStage(4);
  assert.equal(await number('peek 0xfcaf'),5,'CIRCLE switches to pattern sprites');
  assert.equal((await number('debug read {VDP regs} 20'))&8,8);
  const circleSprites=await block(0x37e00,64);
  assert.ok((await block(0x38000,2048)).some(b=>b!==0),'Circle material in page 7');
  await msx.advance(.5);assert.notDeepEqual(await block(0x37e00,64),circleSprites,'Circle sprites move');
  await screenshot('circle-sprites');
  await msx.command('debug remove_watchpoint $::circle_watch');
  await msx.type('\x1b');await menu();
  console.log('PASS: circle FIL demo, FG4 circle patterns, moving sprites and menu cleanup');

  const draws=await number('set ::disk_draws');
  await msx.type('2'); await msx.advance(25);
  assert.equal(await number('peek 0xFCAF'),5);
  assert.ok(await number('set ::disk_draws')-draws>=1120,'Disk font demo must reach its random fill');
  await msx.type('\x1b'); await menu();
  await msx.type('3'); await msx.advance(20);
  assert.equal(await number('peek 0xFCAF'),5);
  const sprites=await block(0x37E00,24*8);
  await msx.advance(1);
  assert.notDeepEqual(await block(0x37E00,24*8),sprites,'Disk sprite demo must animate');
  await msx.type('\x1b'); await menu();
  await msx.type('4'); await msx.advance(5);
  assert.equal(await number('peek 0xFCAF'),5);
  const display=async()=>Buffer.from(await msx.command('binary encode hex [debug read_block {physical VRAM} [expr {([debug read {VDP regs} 2] >> 5)*32768}] 27136]'),'hex');
  const orbit=await display();
  await msx.advance(1);
  assert.notDeepEqual(await display(),orbit,'Disk orbit demo must animate');
  await msx.type('\x1b'); await menu();
  await msx.type('5'); await msx.advance(30);
  assert.equal(await stableScreenMode(),8,'Disk palette demo must enter SCREEN 8');
  const paletteImage=await block(0,131072);
  const paletteBefore=await readPalette(msx);
  await msx.advance(2);
  assert.equal(await stableScreenMode(),8);
  assert.notDeepEqual(await readPalette(msx),paletteBefore);
  assert.deepEqual(await block(0,131072),paletteImage,'Palette animation must not redraw VRAM');
  await msx.type('\x1b'); await menu();
  assert.equal(await number('set ::disk_allocations'),0,'RUN/CLEAR must not reserve RAM again');
  assert.equal(await number('peek16 0xFC4A'),himem);
  assert.equal(await number('peek16 0xFD2F'),work,'All demos must retain the installed font hook');
  console.log('PASS: all twelve demos load from disk and return to the menu without RAM leaks');

  await msx.type('0'); await msx.advance(1);
  await msx.type('SAVE"A:WRITE.BAS"\r'); await msx.advance(3);
  assert.match(await msx.screen(),/write protected/i);
  assert.deepEqual((await readdir(disk.directory)).sort(),disk.files.toSorted());
  for(const [name,data] of original) assert.deepEqual(await readFile(resolve(disk.directory,name)),data);
  console.log('PASS: read-only disk rejects SAVE and leaves all host files unchanged');
} finally {await msx.stop();}
} else console.log('SKIP: main demo matrix (--errors-only); checking alternate boot and missing assets');

const direct=new OpenMsx({rom:'dist/v9968-basic.rom',machine,diskDirectory:customDisk.directory});
try {
  await configureTiming(direct);
  await direct.advance(20);
  assert.match(await direct.screen(),/CUSTOM DISK BOOT/);
  assert.doesNotMatch(await direct.screen(),/V9968 DEMO DISK/);
  console.log('PASS: custom directory and entry boot natively through AUTOEXEC.BAS');
} finally {await direct.stop();}

const missing=new OpenMsx({rom:'dist/v9968-basic.rom',machine,diskDirectory:brokenDisk.directory});
try {
  await configureTiming(missing);
  await missing.advance(25);
  assert.match(await missing.screen(),/DISK DEMO ERROR\s+53\s+AT\s+50/);
  await missing.type('\x1b'); await missing.advance(3);
  assert.match(await missing.screen(),/V9968 DEMO DISK/);
  console.log('PASS: missing asset reports the BASIC error and allows return to the menu');
} finally {await missing.stop();}

for(const {disk,asset,line} of brokenShooters) {
  const missingAsset=new OpenMsx({rom:'dist/v9968-basic.rom',machine,diskDirectory:disk.directory});
  try {
    await configureTiming(missingAsset);
    await missingAsset.advance(20);
    for(let i=0;i<80 && Number(await missingAsset.command('peek16 0xf41c'))!==970;i++) await missingAsset.advance(0.5);
    assert.equal(Number(await missingAsset.command('peek16 0xf41c')),970,'Wait for the asset-error handler, not a fixed loading duration');
    assert.match(await missingAsset.screen(),new RegExp(`SHOOT ERROR\\s+53\\s+AT\\s+${line}`));
    assert.equal(Number(await missingAsset.command('debug read {VDP regs} 20')),0);
    assert.equal(Number(await missingAsset.command('debug read {VDP regs} 23')),0);
    await missingAsset.type('\x1b'); await missingAsset.advance(3);
    assert.match(await missingAsset.screen(),/V9968 DEMO DISK/);
    console.log(`PASS: missing ${asset} reports the file error, cleans up and returns to the menu`);
  } finally {await missingAsset.stop();}
}
