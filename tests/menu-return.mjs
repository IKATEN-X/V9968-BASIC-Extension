import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { demoWithMenuReturn } from '../tools/demo-disk.mjs';

const packageDemo=source=>demoWithMenuReturn(Buffer.from(source,'ascii'),'TEST.BAS').toString('ascii');
const source='10 GOTO 900\n900 \' FINISHING DEMO\n910 _SCREEN(0):PRINT "V9968 road demo stopped.":END\n960 \' ERROR\n970 PRINT "ROAD ERROR":END\n';
const packaged=packageDemo(source);
assert.equal(packaged,source.replace(':END\n960',':RUN"A:MENU.BAS"\n960').replaceAll('\n','\r\n')+'\x1a');
assert.equal(packageDemo('400 _SCREEN(0):PRINT "V9968 BASIC demo stopped."'),
  '400 _SCREEN(0):PRINT "V9968 BASIC demo stopped.":RUN"A:MENU.BAS"\r\n\x1a','ORBIT exits without END');
assert.match(packageDemo('1234 _SCREEN(0): PRINT "V9968 road demo stopped." : END  '),/1234 .*:RUN"A:MENU.BAS"/);
assert.match(packageDemo(source.replace('910 ','1234 ')),/^1234 .*:RUN"A:MENU.BAS"/m,'Line numbering and physical order need not be fixed');
assert.throws(()=>packageDemo('900 \' :PRINT "V9968 road demo stopped.":END'),/found 0/);
assert.throws(()=>packageDemo('900 REM :PRINT "V9968 road demo stopped.":END'),/found 0/);
assert.throws(()=>packageDemo('900 END'),/found 0/);
assert.throws(()=>packageDemo(source+'999 PRINT "X":PRINT "V9968 duplicate demo stopped.":END\n'),/found 2/);
for(const name of ['ORBIT','SPRITE','FONT','KANJI','PALETTE','SHUFFLE','SPRITE16','WAVE','SHOOT','INTERLAC','COPYLOG','CIRCLE','WIRE','ROAD']) {
  const data=await readFile(resolve(import.meta.dirname,`../demo/${name}.BAS`)),copy=Buffer.from(data);
  const result=demoWithMenuReturn(data,`${name}.BAS`).toString('ascii');
  assert.equal((result.match(/RUN"A:MENU.BAS"/g)??[]).length,1,name);
  assert.deepEqual(data,copy,'Do not modify source data');
}
console.log('PASS: moved exit lines, comments, END/no END, unique markers and all bundled demos');
