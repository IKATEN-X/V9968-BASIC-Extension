param([string]$Z88dk = 'D:\z88dk')
$ErrorActionPreference = 'Stop'
$assembler = Join-Path $Z88dk 'bin\z88dk-z80asm.exe'
if (!(Test-Path $assembler)) { throw "z88dk assembler not found: $assembler" }
Push-Location $PSScriptRoot
try {
    New-Item -ItemType Directory -Force -Path build,dist | Out-Null
    & node tools/sine.mjs
    if ($LASTEXITCODE -ne 0) { throw 'Sine table generation failed.' }
    & $assembler '-b' '-m' '-s' '-I=src' '-I=build' '-O=build' '-o=v9968-basic.rom' 'src/main.asm'
    if ($LASTEXITCODE -ne 0) { throw 'Assembly failed.' }
    $code = [IO.File]::ReadAllBytes("$PSScriptRoot\build\v9968-basic.rom")
    if ($code.Length -gt 16384) { throw 'ROM exceeds the 16 KB cartridge window.' }
    $rom = [byte[]]::new(16384)
    [Array]::Fill[byte]($rom, 255)
    [Array]::Copy($code, $rom, $code.Length)
    [IO.File]::WriteAllBytes("$PSScriptRoot\dist\v9968-basic.rom", $rom)
    Write-Host "Built dist/v9968-basic.rom ($((Get-Item dist/v9968-basic.rom).Length) bytes)"
} finally { Pop-Location }
