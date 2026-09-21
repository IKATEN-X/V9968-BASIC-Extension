import assert from 'node:assert/strict';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { resolve } from 'node:path';
import { OpenMsx, tclString } from '../tools/openmsx.mjs';

const visual = process.argv.includes('--visual');
const root = resolve(import.meta.dirname, '..');
const msx = new OpenMsx({ rom: 'dist/v9968-basic.rom', machine: 'Panasonic_FS-A1ST(V9968)' });
async function pageBytes() {
  return Buffer.from(await msx.command('binary encode hex [debug read_block {physical VRAM} [expr {([debug read {VDP regs} 2] >> 5)*32768}] 27136]'),'hex');
}
try {
  await msx.advance(12);
  const symbols = await readFile(resolve(root,'build/v9968-basic.map'),'utf8');
  const vectors = /compute_vectors\s*= \$([0-9A-F]+)/i.exec(symbols);
  assert.ok(vectors,'Missing rotation symbol');
  await msx.command(`set ::demo_frames 0; set ::demo_angle 0; debug set_bp 0x${vectors[1]} {[pc_in_slot 1]} {set ::demo_angle [peek16 [expr {[reg IX]+44}]]; incr ::demo_frames}`);
  const program = (await readFile(resolve(root,'demo/ORBIT.BAS'),'utf8')).replace(/\r?\n/g,'\r');
  await msx.type(program+'\rRUN\r');
  await msx.advance(15);
  assert.equal(Number(await msx.command('peek 0xf414')),0,'BASIC error in demo');
  assert.equal(Number(await msx.command('peek 0xfcaf')),5,'Demo did not reach SCREEN 5');
  const first = await pageBytes();
  const colors = new Set([...first].flatMap(b=>[b>>4,b&15]));
  assert.ok(colors.size>=5,`Expected a multicolor logo, found ${colors.size} colors`);
  await msx.advance(1.5);
  const second = await pageBytes();
  assert.notEqual(createHash('sha256').update(first).digest('hex'),createHash('sha256').update(second).digest('hex'),'Demo is not moving');
  await mkdir(resolve(root,'build/screenshots'),{recursive:true});
  if (visual) {
    await msx.command('set throttle on; set scale_factor 3; set renderer SDLGL-PP');
    await msx.advance(1);
    await msx.command(`screenshot -raw ${tclString(resolve(root,'build/screenshots/orbit-1.png'))}`);
    await msx.advance(0.7);
    await msx.command(`screenshot -raw ${tclString(resolve(root,'build/screenshots/orbit-2.png'))}`);
  }
  await msx.type(' ');
  await msx.advance(1);
  const pausedAngle = await msx.command('set ::demo_angle');
  const pausedFrames = Number(await msx.command('set ::demo_frames'));
  await msx.advance(1);
  assert.equal(await msx.command('set ::demo_angle'),pausedAngle,'Space did not pause the angle');
  assert.ok(Number(await msx.command('set ::demo_frames'))>pausedFrames,'Paused demo stopped responding');
  await msx.type(' ');
  await msx.advance(1);
  assert.notEqual(await msx.command('set ::demo_angle'),pausedAngle,'Space did not resume rotation');
  await msx.type('\x1b');
  await msx.advance(2);
  assert.equal(Number(await msx.command('peek 0xfcaf')),0,'Escape did not restore text mode');
  assert.match(await msx.screen(),/demo stopped/);
  const result = {machine:'Panasonic_FS-A1ST(V9968)', colors:[...colors].sort(), moving:true, escape:true, screenshots:visual};
  await writeFile(resolve(root,'build/demo-result.json'),JSON.stringify(result,null,2)+'\n');
  console.log('PASS: full BASIC demo, multicolor frames, animation, pause input, Escape returns to BASIC');
} finally { await msx.stop(); }
