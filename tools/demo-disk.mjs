import { mkdir, mkdtemp, readFile, readdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import { shootAssets } from './shoot-assets.mjs';

const root=resolve(import.meta.dirname,'..');
const diskName=/^[A-Z0-9_-]{1,8}(?:\.[A-Z0-9_-]{1,3})?$/;
function textFile(buffer,basic=false) {
  if(buffer.some(byte=>byte>127)) throw new Error('Demo text files must be ASCII without a BOM.');
  const text=buffer.toString('ascii').replace(/\x1a+$/,'').replace(/\r\n|\r/g,'\n').trimEnd();
  if(basic && text.split('\n').some(line=>line.length>=255)) throw new Error('BASIC line exceeds the supported input length.');
  return Buffer.from(text.replaceAll('\n','\r\n')+'\r\n'+(basic?'\x1a':''),'ascii');
}

function background() {
  const pixels=Buffer.alloc(128*212,0x11);
  const put=(x,y,color)=>{
    const p=y*128+(x>>1);
    pixels[p]=x&1?(pixels[p]&240)|color:(pixels[p]&15)|(color<<4);
  };
  for(let y=32;y<136;y++) for(let x=0;x<256;x++) {
    const band=Math.floor((x+y)/32)%4;
    const color=[3,6,10,8][band];
    put(x,y,(x%16===0 || y%16===0)?1:((x+y)%16<8?color:[4,7,11,2][band]));
  }
  const letters=[
    [17,27,21,21,17,17,17],
    [15,16,16,14,1,1,30],
    [17,17,10,4,10,17,17]
  ];
  for(let n=0;n<3;n++) for(let row=0;row<7;row++) for(let col=0;col<5;col++) {
    if(!(letters[n][row]&(16>>col))) continue;
    for(let y=0;y<8;y++) for(let x=0;x<8;x++) put(60+n*48+col*8+x,56+row*8+y,15);
  }
  const header=Buffer.alloc(7);
  header[0]=0xfe;
  header.writeUInt16LE(pixels.length-1,3);
  return Buffer.concat([header,pixels]);
}

export async function prepareDemoDisk({source=null,entry='MENU.BAS'}={}) {
  entry=entry.toUpperCase();
  if(!diskName.test(entry) || !entry.endsWith('.BAS')) throw new Error('Entry must be an MSX 8.3 BASIC filename, for example FONT.BAS.');
  const files=new Map();
  function add(name,data) {
    name=name.toUpperCase();
    if(!diskName.test(name)) throw new Error(`Use an MSX 8.3 filename: ${name}`);
    if(files.has(name)) throw new Error(`Duplicate MSX filename: ${name}`);
    files.set(name,data);
  }
  const directory=source?resolve(source):resolve(root,'demo/disk');
  for(const file of await readdir(directory,{withFileTypes:true})) {
    if(!file.isFile()) throw new Error(`Demo disks currently use a flat file set, not directories or links: ${file.name}`);
    const data=await readFile(resolve(directory,file.name));
    const isBasic=/\.bas$/i.test(file.name);
    add(file.name,isBasic || /\.(txt|dat)$/i.test(file.name)?textFile(data,isBasic):data);
  }
  if(!source) {
    if(!files.has('BACK.SC5')) add('BACK.SC5',background());
    for(const [name,data] of shootAssets()) if(!files.has(name)) add(name,data);
    // Keep the diagnostic's result at the BASIC prompt, without a menu return.
    add('LFMCBUG.BAS',textFile(await readFile(resolve(root,'demo/LFMCBUG.BAS')),true));
    for(const [name,exitLine] of [['ORBIT.BAS',400],['SPRITE.BAS',900],['FONT.BAS',900],['PALETTE.BAS',900],['SHUFFLE.BAS',900],['SPRITE16.BAS',900],['WAVE.BAS',900],['SHOOT.BAS',900],['INTERLAC.BAS',900],['COPYLOG.BAS',900],['CIRCLE.BAS',900]]) {
      const lines=(await readFile(resolve(root,'demo',name),'ascii')).trimEnd().split(/\r?\n/);
      const index=lines.findIndex(line=>line.startsWith(`${exitLine} `));
      if(index<0 || !lines[index].includes('demo stopped.')) throw new Error(`Review the menu return line in ${name}.`);
      // Only the packaged copy returns to the menu; standalone demos stay unchanged.
      lines[index]=lines[index].replace(/:END$/,'')+':RUN"A:MENU.BAS"';
      add(name,textFile(Buffer.from(lines.join('\n'),'ascii'),true));
    }
  }
  if(!files.has(entry)) throw new Error(`Entry file not found in demo disk: ${entry}`);
  add('AUTOEXEC.BAS',textFile(Buffer.from(`10 RUN"A:${entry}"`),true));
  const allocatedBytes=[...files.values()].reduce((total,data)=>total+Math.ceil(data.length/1024)*1024,0);
  if(files.size>112 || allocatedBytes>713*1024) throw new Error('File set exceeds the 720 KB floppy capacity (112 root entries, 713 KB of clusters).');
  const disks=resolve(root,'build/disks');
  await mkdir(disks,{recursive:true});
  // A fresh snapshot avoids stale files and does not modify another running demo.
  const target=await mkdtemp(resolve(disks,'demo-'));
  for(const [name,data] of files) await writeFile(resolve(target,name),data);
  return {directory:target,entry,files:[...files.keys()],allocatedBytes};
}

if(process.argv[1] && resolve(process.argv[1])===fileURLToPath(import.meta.url)) {
  try {
    const {values}=parseArgs({options:{source:{type:'string'},entry:{type:'string',default:'MENU.BAS'}}});
    console.log(JSON.stringify(await prepareDemoDisk(values)));
  } catch(error) {
    console.error(error.message);
    process.exitCode=1;
  }
}
