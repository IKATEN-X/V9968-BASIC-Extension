import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';
import { tclString } from '../tools/openmsx.mjs';

// This fork's debug palette exposes only 16 colors; savestates contain all 256.
export async function readPalette(msx) {
  const path=resolve(msx.ipc,'palette.xml.gz');
  await msx.command(`store_machine [machine] ${tclString(path)}`);
  return JSON.parse(execFileSync('pwsh.exe',['-NoProfile','-File',resolve(import.meta.dirname,'read-palette.ps1'),'-Path',path],{
    encoding:'utf8',windowsHide:true,maxBuffer:2**20
  }));
}
