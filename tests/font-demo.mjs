import assert from 'node:assert/strict';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import { OpenMsx, tclString } from '../tools/openmsx.mjs';

const root=resolve(import.meta.dirname,'..');
const custom=[
  [24,60,126,255,255,126,60,24],
  [126,129,165,129,165,153,129,126],
  [24,24,24,255,255,24,24,24],
  [0,16,24,252,254,252,24,16]
];
function pixel(vram,x,y) {
  const byte=vram[y*128+(x>>1)];
  return x&1?byte&15:byte>>4;
}
function glyph(vram,font,code,x,y,color,height=8) {
  for(let row=0;row<height;row++) for(let col=0;col<8;col++) {
    assert.equal(pixel(vram,x+col,y+row),font[code*8+row]&(128>>col)?color:1,`glyph ${code} at (${x},${y}), pixel (${col},${row})`);
  }
}
function imagePixels(path) {
  const json=execFileSync('pwsh.exe',['-NoProfile','-File',resolve(root,'tests/read-png.ps1'),'-Path',path],{encoding:'utf8',windowsHide:true,maxBuffer:2**20});
  const png=JSON.parse(json);
  assert.equal(png.width,320);
  assert.equal(png.height,240);
  return Buffer.from(png.rgb,'base64');
}

export async function checkFontDemo(msx,{visual=false,pal=false,machine='Panasonic_FS-A1ST(V9968)'}={}) {
  const program=await readFile(resolve(root,'demo/FONT.BAS'),'utf8');
  assert.ok(program.split(/\r?\n/).every(line=>line.length<255),'BASIC input line is too long');
  assert.doesNotMatch(program,/_COPY|SCALE\(/i,'Font demo must not use image scaling or copying');
  const symbols=await readFile(resolve(root,'build/v9968-basic.map'),'utf8');
  const address=name=>{
    const match=new RegExp(`\\b${name}\\s*= \\$([0-9A-F]+)`,'i').exec(symbols);
    assert.ok(match,`Missing ROM symbol: ${name}`);
    return `0x${match[1]}`;
  };
  const paths=['patterns','text','random'].map(name=>resolve(root,`build/screenshots/font-demo-${name}.png`));
  await mkdir(resolve(root,'build/screenshots'),{recursive:true});
  await msx.type('NEW\r');
  await msx.advance(0.5);
  if(visual) await msx.command('set renderer SDLGL-PP; set throttle on');
  await msx.command('set ::fd_stage 0; set ::fd_started 0; set ::fd_calls 0; set ::fd_fill_start -1; set ::fd_preview_end -1; set ::fd_screens 0; set ::fd_render_error {}; set ::fd_visible_calls 0; set ::fd_definitions 0');
  const breakpoints=[];
  try {
    breakpoints.push(await msx.command(`debug set_bp ${address('cmd_init')} {[pc_in_slot 1]} {set ::fd_started 1}`));
    breakpoints.push(await msx.command(`debug set_bp ${address('font_write_glyph')} {[pc_in_slot 1] && $::fd_stage == 0} {incr ::fd_definitions}`));
    breakpoints.push(await msx.command(`debug set_bp ${address('font_draw')} {[pc_in_slot 1]} {
      incr ::fd_calls
      if {$::fd_stage == 0 && [peek 0xFAF6] == 2 && ([debug read {VDP regs} 2] >> 5) == 2} {incr ::fd_visible_calls}
      if {$::fd_stage == 2 && $::fd_fill_start < 0} {set ::fd_fill_start [machine_info time]}
    }`));
    breakpoints.push(await msx.command(`debug set_bp ${address('write_reg')} {[pc_in_slot 1] && [reg C] == 2 && [reg A] == 31 && $::fd_stage == 1} {set ::fd_preview_end [machine_info time]}`));
    breakpoints.push(await msx.command(`debug set_bp ${address('cmd_wait_vdp')} {[pc_in_slot 1]} {
      incr ::fd_stage
      set ::fd_time($::fd_stage) [machine_info time]
      set ::fd_count($::fd_stage) $::fd_calls
      set ::fd_page($::fd_stage) [expr {[debug read {VDP regs} 2] >> 5}]
      set ::fd_font($::fd_stage) [binary encode hex [debug read_block {physical VRAM} 0x37600 2048]]
      set ::fd_image($::fd_stage) [binary encode hex [debug read_block {physical VRAM} [expr {$::fd_page($::fd_stage)*32768}] 27136]]
      ${visual ? `if {$::fd_stage <= 3} {
        set target [lindex [list ${paths.map(tclString).join(' ')}] [expr {$::fd_stage-1}]]
        after time 0.1 [list apply {{path} {
          if {[catch {screenshot -raw $path} problem]} {set ::fd_render_error $problem}
          incr ::fd_screens
        }} $target]
      }` : ''}
    }`));
    await msx.type(program.replace(/\r?\n/g,'\r')+'\r15 ON ERROR GOTO 30000\r30000 _FONT(0):_SCREEN(0):PRINT N;ERR;ERL:END\r'+(pal?'25 VDP(10)=VDP(10) OR 2\r':'')+'RUN\r');
    let basicError='';
    for(let i=0;i<200 && Number(await msx.command('set ::fd_stage'))<3;i++) {
      await msx.advance(0.5);
      // Keyboard loading can take more than two seconds on Z80.
      if(Number(await msx.command('set ::fd_started')) && Number(await msx.command('peek 0xFCAF'))!==5) {basicError=(await msx.screen()).trim();break;}
    }
    assert.equal(Number(await msx.command('set ::fd_stage')),3,`Demo did not finish its preparation/text/random stages: ${basicError}`);
    await msx.advance(0.2);
    assert.equal(Number(await msx.command('peek 0xFCAF')),5);
    const buffers=async name=>{
      const result=[];
      for(let stage=1;stage<=3;stage++) result.push(Buffer.from(await msx.command(`set ::fd_${name}(${stage})`),'hex'));
      return result;
    };
    const fonts=await buffers('font'), images=await buffers('image');
    assert.deepEqual(fonts[1],fonts[0],'Text must use the font prepared in the preview');
    assert.deepEqual(fonts[2],fonts[0],'Random fill must retain the prepared font');
    for(let n=0;n<4;n++) assert.deepEqual(fonts[0].subarray((240+n)*8,(241+n)*8),Buffer.from(custom[n]));
    for(let n=0;n<256;n++) glyph(images[0],fonts[0],n,16+(n%16)*14,32+Math.floor(n/16)*10,n>=240 && n<=243?3:15);
    assert.equal(Number(await msx.command('set ::fd_visible_calls')),256,'All glyphs must be prepared on the visible preview page');
    assert.equal(Number(await msx.command('set ::fd_definitions')),260,'BIOS font upload plus four custom glyph registrations');
    const pages=(await msx.command('list $::fd_page(1) $::fd_page(2) $::fd_page(3)')).split(' ').map(Number);
    assert.deepEqual(pages,[2,0,0]);
    const previewHold=Number(await msx.command('expr {$::fd_preview_end-$::fd_time(1)}'));
    const textHold=Number(await msx.command('expr {$::fd_fill_start-$::fd_time(2)}'));
    for(const seconds of [previewHold,textHold]) assert.ok(seconds>=2.9 && seconds<3.2,`Expected a 3-second hold, got ${seconds}`);
    for(const [text,y] of [['V9968 FONT / GRP:',8],['ABCDEFGHIJKLMNOPQRSTUVWXYZ',40],['abcdefghijklmnopqrstuvwxyz',56],['0123456789 !? +-*/=()[]',72]]) {
      for(let i=0;i<text.length;i++) glyph(images[1],fonts[1],text.charCodeAt(i),16+i*8,y,15);
    }
    for(let i=0;i<16;i++) glyph(images[1],fonts[1],240+i%4,16+i*8,104,3);
    const drawn=Number(await msx.command('expr {$::fd_count(3)-$::fd_count(2)}'));
    assert.equal(drawn,864,'Every cell in 32x27 rows must be drawn through LFMM');
    const used=new Set();
    for(let row=0;row<27;row++) for(let col=0;col<32;col++) {
      const color=[3,6,10,15][row%4], height=Math.min(8,212-row*8);
      let match=-1;
      for(let code=33;code<=243;code++) {
        if(code>126 && code<240) continue;
        let same=true;
        for(let y=0;y<height && same;y++) for(let x=0;x<8;x++) {
          if(pixel(images[2],col*8+x,row*8+y)!==(fonts[2][code*8+y]&(128>>x)?color:1)) {same=false;break;}
        }
        if(same) {match=code;break;}
      }
      assert.ok(match>=0,`Random cell (${col},${row}) is empty, corrupt or from a different font`);
      used.add(match);
    }
    assert.ok(used.size>=60,`Too little random variety: ${used.size} glyphs`);
    const fillSeconds=Number(await msx.command('expr {$::fd_time(3)-$::fd_fill_start}'));
    const cpu=(await msx.command('get_active_cpu')).toUpperCase();
    if(visual) {
      assert.equal(await msx.command('set ::fd_render_error'),'');
      assert.equal(Number(await msx.command('set ::fd_screens')),3);
      for(const [index,path] of paths.entries()) {
        const rgb=imagePixels(path);
        let colored=0;
        for(let i=0;i<rgb.length;i+=3) if(Math.max(rgb[i],rgb[i+1],rgb[i+2])>150) colored++;
        assert.ok(colored>[1000,600,8000][index],`Stage ${index+1} screenshot is blank or incomplete: ${colored}`);
      }
    }
    await writeFile(resolve(root,'build/font-demo-result.json'),JSON.stringify({machine,cpu,pal,previewHold,textHold,fillSeconds,characters:drawn,charactersPerSecond:drawn/fillSeconds,uniqueGlyphs:used.size},null,2)+'\n');
    console.log(`PASS [${machine}, ${cpu}, ${pal?50:60} Hz]: 256-glyph preparation, ${previewHold.toFixed(3)}s preview, text, ${textHold.toFixed(3)}s hold`);
    console.log(`PASS: ${drawn} LFMM characters fill the screen in ${fillSeconds.toFixed(3)}s (${Math.round(drawn/fillSeconds)} chars/s), ${used.size} distinct glyphs; no COPY/scaling`);
    await msx.type('\x1b');
    await msx.advance(0.8);
    assert.match(await msx.screen(),/V9968 font demo stopped/);
    console.log('PASS: FONT.BAS Escape cleanup'+(visual?', three screenshot pixel checks':''));
  } finally {
    for(const breakpoint of breakpoints) await msx.command(`debug remove_bp ${breakpoint}`);
  }
}

if(process.argv[1] && resolve(process.argv[1])===fileURLToPath(import.meta.url)) {
  const machine=process.argv.includes('V9968_Basic')?'V9968_Basic':'Panasonic_FS-A1ST(V9968)';
  const msx=new OpenMsx({rom:'dist/v9968-basic.rom',machine});
  try {
    await msx.advance(12);
    await checkFontDemo(msx,{machine,visual:process.argv.includes('--visual'),pal:process.argv.includes('--pal')});
  } finally {await msx.stop();}
}
