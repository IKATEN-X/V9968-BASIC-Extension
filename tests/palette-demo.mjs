import assert from 'node:assert/strict';
import { readFile, mkdir } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';
import { OpenMsx, tclString } from '../tools/openmsx.mjs';
import { readPalette } from './palette-state.mjs';

const machine=process.argv.includes('V9968_Basic')?'V9968_Basic':'Panasonic_FS-A1ST(V9968)';
const visual=process.argv.includes('--visual'), pal=process.argv.includes('--pal');
const root=resolve(import.meta.dirname,'..');
const msx=new OpenMsx({rom:'dist/v9968-basic.rom',machine});
const number=async code=>Number(await msx.command(code));
const vram=async()=>Buffer.from(await msx.command('binary encode hex [debug read_block {physical VRAM} 0 131072]'),'hex');
function pixel(data,x,y) { return data[((y*256+x)>>1)+(x&1)*65536]; }
async function pauseAnimation() {
  await msx.type(' ');
  // Z80 may still be updating the current 96-color frame after accepting a key.
  for(let i=0;i<40;i++) {
    await msx.advance(0.5);
    if(await number('expr {[machine_info time]-$::pd_last_write}')>1) return;
  }
  assert.fail('Palette animation did not pause at a completed frame');
}
async function resumeFrame() {
  const frame=await number('set ::pd_frames');
  await msx.type(' ');
  for(let i=0;i<40 && await number('set ::pd_frames')<frame+2;i++) await msx.advance(0.5);
  assert.ok(await number('set ::pd_frames')>=frame+2,'Animation did not resume');
}
async function screenshot(name) {
  const path=resolve(root,`build/screenshots/palette-${name}.png`);
  await msx.command(`screenshot -raw ${tclString(path)}`);
  const png=JSON.parse(execFileSync('pwsh.exe',['-NoProfile','-File',resolve(root,'tests/read-png.ps1'),'-Path',path],{
    encoding:'utf8',windowsHide:true,maxBuffer:2**20
  }));
  assert.equal(png.width,320);
  assert.equal(png.height,240);
  const rgb=Buffer.from(png.rgb,'base64'), colors=new Set();
  for(let i=0;i<rgb.length;i+=3) colors.add(rgb.readUIntBE(i,3));
  assert.ok(colors.size>=64,`Screenshot is blank or missing its palette: ${colors.size} colors`);
  return rgb;
}
try {
  await msx.advance(12);
  const program=await readFile(resolve(root,'demo/PALETTE.BAS'),'ascii');
  assert.ok(program.split(/\r?\n/).every(line=>line.length<255));
  const map=await readFile(resolve(root,'build/v9968-basic.map'),'ascii');
  const address=name=>'0x'+new RegExp(`\\b${name}\\s*= \\$([0-9A-F]+)`,'i').exec(map)[1];
  await msx.command(`set ::pd_frames 0; set ::pd_preview -1; set ::pd_start -1; set ::pd_last_write 0;
    debug set_bp ${address('cmd_palette')} {[pc_in_slot 1]} {set ::pd_last_write [machine_info time]};
    debug set_bp ${address('cmd_wait_vdp')} {[pc_in_slot 1]} {set ::pd_preview [machine_info time]};
    debug set_bp ${address('cmd_wait_vblank')} {[pc_in_slot 1]} {
      if {$::pd_frames == 0} {set ::pd_start [machine_info time]}
      incr ::pd_frames
    }`);
  if(visual) {
    await mkdir(resolve(root,'build/screenshots'),{recursive:true});
    await msx.command('set renderer SDLGL-PP; set throttle on');
  }
  await msx.type(program.replace(/\r?\n/g,'\r')+'\r15 ON ERROR GOTO 30000\r30000 _SCREEN(0):PRINT ERR;ERL:END\r'+
    (pal?'17 VDP(10)=VDP(10) OR 2\r':'')+'RUN\r');
  for(let i=0;i<200 && await number('set ::pd_frames')<2;i++) await msx.advance(0.5);
  if(await number('peek 0xfcaf')!==8) console.log(await msx.screen());
  assert.equal(await number('peek 0xfcaf'),8,'Demo must reach SCREEN 8');
  assert.ok(await number('set ::pd_frames')>=2,'Demo must reach palette cycling');
  const hold=await number('expr {$::pd_start-$::pd_preview}');
  assert.ok(hold>=2.9 && hold<3.3,`Expected a 3-second preview, got ${hold}`);
  await pauseAnimation();
  const frames=await number('set ::pd_frames');
  const first=await readPalette(msx), image=await vram();
  await msx.advance(0.5);
  assert.equal(await number('set ::pd_frames'),frames,'Space must pause animation');
  assert.deepEqual(await readPalette(msx),first);
  for(let n=0;n<32;n++) {
    assert.equal(first[n],(n<<10)|(n<<5)|n);
    assert.equal(pixel(image,n*8+4,30),n,'All 32 grayscale levels must be drawn');
  }
  for(let n=0;n<256;n++) assert.equal(pixel(image,(n%16)*16+8,148+Math.floor(n/16)*4+1),n);
  assert.ok(new Set(first).size>150,`The full palette must not collapse to 16 colors: ${new Set(first).size}`);
  const firstRgb=visual?await screenshot('color'):null;
  await resumeFrame();
  await pauseAnimation();
  const second=await readPalette(msx);
  assert.notDeepEqual(second,first,'Palette must animate');
  assert.deepEqual(await vram(),image,'Palette cycling must never redraw the bitmap');
  assert.deepEqual(second.slice(0,32),first.slice(0,32),'The grayscale ramp must remain unchanged');
  if(visual) {
    const secondRgb=await screenshot('shifted');
    let changed=0;
    for(let i=0;i<firstRgb.length;i+=3) if(firstRgb.readUIntBE(i,3)!==secondRgb.readUIntBE(i,3)) changed++;
    assert.ok(changed>5000,`Palette changes did not reach the rendered SCREEN 8 image: ${changed}`);
  }
  await msx.type('C'); await msx.advance(0.3);
  await resumeFrame();
  await pauseAnimation();
  const gray=await readPalette(msx);
  for(const base of [64,128,192]) for(let i=0;i<32;i++) {
    const c=gray[base+i];
    assert.equal((c>>10)&31,c&31);
    assert.equal((c>>5)&31,c&31);
  }
  assert.deepEqual(await vram(),image);
  if(visual) await screenshot('gray');
  await msx.type('\x1b'); await msx.advance(1);
  assert.match(await msx.screen(),/V9968 palette demo stopped/);
  assert.equal(await number('debug read {VDP regs} 20'),0);
  assert.equal(await number('debug read {VDP regs} 21'),1,'SCREEN 0 restores V58 compatibility');
  console.log(`PASS [${machine}, ${pal?50:60} Hz]: SCREEN 8, 256 swatches, 32 grayscale levels, ${hold.toFixed(3)}s preview`);
  console.log('PASS: palette-only animation, unchanged VRAM, pause/resume, color/gray switch and Escape cleanup'+(visual?', rendered screenshot pixel checks':''));
} finally {await msx.stop();}
