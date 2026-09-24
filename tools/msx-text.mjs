import { execFileSync } from 'node:child_process';
import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root=resolve(import.meta.dirname,'..');
export function sourceText(data) {
  try { return new TextDecoder('utf-8',{fatal:true}).decode(data); }
  catch { throw new Error('Source text must be valid UTF-8 (ASCII is also supported).'); }
}

export function encodeMsxText(text) {
  if(/^[\x00-\x7f]*$/.test(text)) return Buffer.from(text,'ascii');
  // Use Windows' standard CP932 encoder; never silently replace unsupported characters.
  try {
    const base64=execFileSync('pwsh.exe',['-NoProfile','-NonInteractive','-File',resolve(import.meta.dirname,'encode-sjis.ps1')],
      {input:Buffer.from(text,'utf8'),stdio:['pipe','pipe','pipe'],windowsHide:true,maxBuffer:8*1024*1024});
    return Buffer.from(base64.toString('ascii'),'base64');
  } catch(error) {
    throw new Error('Cannot encode MSX text as Shift-JIS (CP932). Check for unsupported characters or unavailable PowerShell 7.',{cause:error});
  }
}

export function textFile(data,basic=false) {
  const text=sourceText(data).replace(/\x1a+$/,'').replace(/\r\n|\r/g,'\n').trimEnd();
  const encoded=encodeMsxText(text.replaceAll('\n','\r\n')+'\r\n'+(basic?'\x1a':''));
  if(basic && encoded.toString('latin1').split('\r\n').some(line=>line.length>=255)) {
    throw new Error('BASIC line exceeds the supported input length (255 bytes in Shift-JIS).');
  }
  return encoded;
}

export async function prepareBasicProgram(path) {
  const data=textFile(await readFile(path),true);
  const directory=resolve(root,'build/programs');
  await mkdir(directory,{recursive:true});
  const target=resolve(await mkdtemp(resolve(directory,'basic-')),'PROGRAM.BAS');
  await writeFile(target,data);
  return target;
}

if(process.argv[1] && resolve(process.argv[1])===fileURLToPath(import.meta.url)) {
  try {
    if(process.argv.length!==3) throw new Error('Usage: node tools/msx-text.mjs <UTF-8 BASIC source>');
    console.log(await prepareBasicProgram(process.argv[2]));
  } catch(error) {console.error(error.message);process.exitCode=1;}
}
