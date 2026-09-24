import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { encodeMsxText, sourceText, textFile, prepareBasicProgram } from '../tools/msx-text.mjs';
import { demoWithMenuReturn, prepareDemoDisk } from '../tools/demo-disk.mjs';
import { OpenMsx, tclString } from '../tools/openmsx.mjs';

const japanese='日本語ｶﾀｶﾅ';
const expected=Buffer.from('93fa967b8ceab6c0b6c5','hex');
const decode=data=>new TextDecoder('shift_jis',{fatal:true}).decode(data);
assert.deepEqual(encodeMsxText(japanese),expected);
assert.equal(sourceText(Buffer.from('\ufeff日本語')),'日本語');
assert.throws(()=>sourceText(Buffer.from([0x93,0xfa])),/UTF-8/);
assert.throws(()=>encodeMsxText('\u{1f600}'),/Cannot encode/);
assert.equal(decode(encodeMsxText('ソ表能\\"ABC')),'ソ表能\\"ABC');
assert.deepEqual(textFile(Buffer.from('10 PRINT "ABC"\r20 END\n\x1a'),true),Buffer.from('10 PRINT "ABC"\r\n20 END\r\n\x1a'));
const boundary='10 REM '+ '日'.repeat(123);
assert.equal(textFile(Buffer.from(boundary+'A'),true).length,257);
assert.throws(()=>textFile(Buffer.from(boundary+'AB'),true),/255 bytes/);
const packaged=demoWithMenuReturn(Buffer.from(`10 PRINT "${japanese}"\n900 PRINT "DONE":PRINT "V9968 encoding demo stopped.":END`),'TEST.BAS');
assert.ok(packaged.includes(expected));
assert.match(decode(packaged),/:RUN"A:MENU.BAS"/);

await mkdir('build',{recursive:true});
const directory=await mkdtemp(resolve('build/text-encoding-'));
const program=`10 A$="${japanese}":B$="ソ表能"\n20 FOR I=1 TO LEN(A$):PRINT ASC(MID$(A$,I,1));:NEXT\n30 PRINT "SJIS OK":END\n`;
const path=resolve(directory,'START.BAS');
await writeFile(path,program);
await writeFile(resolve(directory,'TEXT.TXT'),japanese+'\n');
await writeFile(resolve(directory,'FONT.DAT'),'1,"日本語"\n');
const binary=Buffer.from([0,26,128,255]);
await writeFile(resolve(directory,'RAW.BIN'),binary);
const disk=await prepareDemoDisk({source:directory,entry:'START.BAS'});
assert.deepEqual(await readFile(resolve(disk.directory,'RAW.BIN')),binary);
assert.deepEqual(await readFile(resolve(disk.directory,'TEXT.TXT')),Buffer.concat([expected,Buffer.from('\r\n')]));
assert.equal(decode(await readFile(resolve(disk.directory,'FONT.DAT'))),'1,"日本語"\r\n');
const prepared=await prepareBasicProgram(path);
assert.deepEqual(await readFile(prepared),await readFile(resolve(disk.directory,'START.BAS')));
assert.equal(await readFile(path,'utf8'),program,'Source is not rewritten');
console.log('PASS: exact SJIS bytes, kana, backslash trail bytes, BOM, invalid UTF-8/unrepresentable characters, byte limits and disk packaging');

if(process.argv.includes('--emulator')) {
  for(const route of ['disk','keybuf','standalone']) {
    const msx=new OpenMsx({machine:'Panasonic_FS-A1ST(V9968)',diskDirectory:route==='disk'?disk.directory:null});
    try {
      await msx.command('set throttle on; set speed 400');
      await msx.advance(18);
      if(route==='keybuf') {
        await msx.type(program.replaceAll('\n','\r')+'RUN\r');
        await msx.advance(3);
      } else if(route==='standalone') {
        await msx.command(`set ::env(V9968_DEMO) ${tclString(prepared)}; source ${tclString(resolve('emulator/demo.tcl'))}; set renderer none; set speed 400`);
        await msx.advance(16);
      }
      const screen=await msx.screen();
      assert.match(screen,/147\s+250\s+150\s+123\s+140\s+234\s+182\s+192\s+182\s+197/);
      assert.match(screen,/SJIS OK/);
      const memory=Buffer.from(await msx.command('binary encode hex [debug read_block memory [peek16 0xf676] [expr {[peek16 0xf6c2]-[peek16 0xf676]}]]'),'hex');
      assert.ok(memory.includes(expected),`${route}: actual BASIC string bytes`);
      assert.ok(memory.includes(Buffer.from('835c955c945c','hex')),`${route}: 5C trail bytes are preserved`);
      console.log(`PASS: ${route}: Japanese source executes with exact Shift-JIS bytes`);
    } finally {await msx.stop();}
  }
}
