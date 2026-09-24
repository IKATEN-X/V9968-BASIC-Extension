param(
    [string]$Z88dk = 'D:\z88dk',
    [string]$ExtensionFile = '',
    [switch]$BasicStatement,
    [switch]$RomHook,
    [switch]$FullShadow,
    [switch]$ExpandedSlot0,
    [switch]$KeepMainRom
)
$ErrorActionPreference = 'Stop'
if ($RomHook -and $BasicStatement) { throw 'Run -RomHook and -BasicStatement separately.' }
if ($FullShadow -and ($RomHook -or $BasicStatement)) { throw '-FullShadow includes its own BASIC probe; run it separately.' }
if (($ExpandedSlot0 -or $KeepMainRom) -and !$FullShadow) { throw '-ExpandedSlot0 and -KeepMainRom require -FullShadow.' }
$root = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..\..'))
$assembler = Join-Path $Z88dk 'bin\z88dk-z80asm.exe'
$sourceMachine = Join-Path $root '.local\openmsx\share\machines\V9968_Basic.xml'
if (!(Test-Path -LiteralPath $assembler)) { throw "Assembler not found: $assembler" }
if (!(Test-Path -LiteralPath $sourceMachine)) { throw 'Run tools/setup.ps1 first.' }

if (!$ExtensionFile) {
    $candidates = @(
        (Join-Path ([Environment]::GetFolderPath('MyDocuments')) 'openMSX\share\extensions\HRA_V9968.xml'),
        (Join-Path $root '.local\user\extensions\HRA_V9968.xml'),
        (Join-Path $root '.local\openmsx\share\extensions\HRA_V9968.xml'),
        (Join-Path $env:ProgramFiles 'openMSX\share\extensions\HRA_V9968.xml')
    )
    $ExtensionFile = $candidates | Where-Object { Test-Path -LiteralPath $_ -PathType Leaf } | Select-Object -First 1
}
if (!$ExtensionFile -or !(Test-Path -LiteralPath $ExtensionFile -PathType Leaf)) {
    throw 'HRA_V9968.xml not found. Specify its installed path with -ExtensionFile.'
}
$ExtensionFile = (Resolve-Path -LiteralPath $ExtensionFile).Path
[xml]$extension = Get-Content -LiteralPath $ExtensionFile -Raw
$external = $extension.SelectSingleNode('/msxconfig/devices/VDP[@id="V9968"]')
if (!$external -or $external.version -ne 'V9968') {
    throw 'Expected the HRA_V9968 extension with a V9968 device.'
}
foreach ($direction in @('I', 'O')) {
    $port = $external.SelectSingleNode("io[@type='$direction']")
    if (!$port -or [Convert]::ToInt32($port.GetAttribute('base'), 16) -ne 0x88 -or [int]$port.num -ne 5) {
        throw 'This experiment requires HRA_V9968 at I/O ports 88h-8Ch.'
    }
}

$work = Join-Path $root ('.local\vdp-port-shadow\' + [guid]::NewGuid().ToString('N'))
$userData = Join-Path $work 'share'
New-Item -ItemType Directory -Path (Join-Path $userData 'machines'), (Join-Path $userData 'extensions') -Force | Out-Null
Copy-Item -LiteralPath $ExtensionFile -Destination (Join-Path $userData 'extensions\HRA_V9968.xml')
Write-Host "Extension: $ExtensionFile"

# Generate a separate machine; never overwrite the normal emulator configuration.
[xml]$machine = Get-Content -LiteralPath $sourceMachine -Raw
$machine.msxconfig.info.code = 'VDP port shadow experiment'
$machine.msxconfig.info.description = 'Isolated Z80 MSX2+ with internal V9958; use the HRA_V9968 extension.'
$internal = $machine.SelectSingleNode('/msxconfig/devices/VDP')
$internal.version = 'V9958'
$internal.vram = '128'
$internal.SelectSingleNode('io[@type="O"]').SetAttribute('num', '4')
$internal.SelectSingleNode('io[@type="I"]').SetAttribute('num', '2')
$internal.RemoveChild($internal.SelectSingleNode('timing')) | Out-Null
if ($ExpandedSlot0) {
    $slot0 = $machine.SelectSingleNode('/msxconfig/devices/primary[@slot="0"]')
    $bios = $slot0.SelectSingleNode('ROM')
    $secondary = $machine.CreateElement('secondary')
    $secondary.SetAttribute('slot', '0')
    $secondary.AppendChild($bios) | Out-Null
    $slot0.AppendChild($secondary) | Out-Null
}

$machineFile = Join-Path $userData 'machines\PortShadow.xml'
$machine.Save($machineFile)

$probeSource = if ($RomHook) { 'rom-hook.asm' } elseif ($FullShadow) { 'full-shadow.asm' } else { 'probe.asm' }
& $assembler '-b' '-m' "-I=$PSScriptRoot" "-O=$work" '-o=probe.bin' (Join-Path $PSScriptRoot $probeSource)
if ($LASTEXITCODE -ne 0) { throw 'Probe assembly failed.' }
$testOptions = @()
if ($BasicStatement) { $testOptions += '--basic-statement' }
if ($FullShadow) { $testOptions += '--full-shadow' }
if ($ExpandedSlot0) { $testOptions += '--expanded-slot0' }
if ($KeepMainRom) { $testOptions += '--keep-mainrom' }
if ($RomHook) {
    & $assembler '-b' '-m' "-O=$work" '-o=wrtvdp-code.bin' (Join-Path $PSScriptRoot 'wrtvdp-rom.asm')
    if ($LASTEXITCODE -ne 0) { throw 'Experimental ROM assembly failed.' }
    $code = [IO.File]::ReadAllBytes((Join-Path $work 'wrtvdp-code.bin'))
    if ($code.Length -gt 16384) { throw 'Experimental ROM exceeds 16KB.' }
    $rom = [byte[]]::new(16384)
    [Array]::Fill[byte]($rom, 255)
    [Array]::Copy($code, $rom, $code.Length)
    $romFile = Join-Path $work 'wrtvdp-hook.rom'
    [IO.File]::WriteAllBytes($romFile, $rom)
    $testOptions += @('--rom-hook', $romFile)
}
& node (Join-Path $PSScriptRoot 'verify.mjs') $userData (Join-Path $work 'probe.bin') @testOptions
if ($LASTEXITCODE -ne 0) { throw "Probe failed. See $work" }
Write-Host "Results: $work\result.json"
