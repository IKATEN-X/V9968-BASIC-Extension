param(
    [string]$OpenMsx = 'C:\Program Files\openMSX',
    [string]$BiosDirectory = 'C:\Program Files (x86)\blueMSX\Machines\Shared Roms',
    [string]$SystemRoms = ((Join-Path ([Environment]::GetFolderPath('MyDocuments')) 'openMSX\share\systemroms'))
)
$ErrorActionPreference = 'Stop'
$root = Split-Path $PSScriptRoot -Parent
$local = Join-Path $root '.local'
$emulator = Join-Path $local 'openmsx'
if (!(Test-Path "$emulator\share\scripts")) {
    if (!(Test-Path "$OpenMsx\openmsx.exe")) { throw "openMSX 21.0 is required: $OpenMsx" }
    New-Item -ItemType Directory -Force -Path $local | Out-Null
    Copy-Item -LiteralPath $OpenMsx -Destination $emulator -Recurse
}
$zip = Join-Path $local 'v9968-c620b69.zip'
if (!(Test-Path $zip)) {
    Invoke-WebRequest -UseBasicParsing -Uri 'https://buppu3.github.io/openMSX/derived/openmsx-21.0-v9968-c620b69-x64-VC-Release.zip' -OutFile $zip
}
if ((Get-FileHash -LiteralPath $zip -Algorithm SHA256).Hash -ne '764C42EC1D202F90283C1A75558B9CD6C0E29F0481103854C447487EF2E4FC8E') {
    throw 'The V9968 emulator archive differs from the tested c620b69 build.'
}
Expand-Archive -LiteralPath $zip -DestinationPath "$local\v9968-download" -Force
Copy-Item -LiteralPath "$local\v9968-download\openmsx.exe" -Destination "$emulator\openmsx.exe" -Force
foreach ($name in @('MSX2P.rom', 'MSX2PEXT.rom')) {
    $target = Join-Path "$emulator\share\systemroms" $name
    if (!(Test-Path $target)) {
        $source = Join-Path $BiosDirectory $name
        if (!(Test-Path $source)) { throw "Supply your existing BIOS files using -BiosDirectory: $name" }
        Copy-Item -LiteralPath $source -Destination $target
    }
}
[xml]$machine = Get-Content -LiteralPath "$root\emulator\V9968_Basic.xml" -Raw
foreach ($file in $machine.SelectNodes('//rom/filename')) {
    $file.InnerText = (Join-Path "$emulator\share\systemroms" $file.InnerText).Replace('\', '/')
}
$machine.Save("$emulator\share\machines\V9968_Basic.xml")
$stSource = Join-Path $OpenMsx 'share\machines\Panasonic_FS-A1ST(V9968).xml'
if (!(Test-Path $stSource)) { $stSource = Join-Path $OpenMsx 'share\machines\Panasonic_FS-A1ST.xml' }
if ((Test-Path $stSource) -and (Test-Path $SystemRoms)) {
    [xml]$st = Get-Content -LiteralPath $stSource -Raw
    $st.msxconfig.devices.VDP.version = 'V9968'
    $st.msxconfig.devices.VDP.vram = '256'
    foreach ($port in $st.msxconfig.devices.VDP.io) { $port.num = '5' }
    $timing = $st.msxconfig.devices.VDP.SelectSingleNode('timing')
    if (!$timing) { $timing = $st.CreateElement('timing'); $st.msxconfig.devices.VDP.AppendChild($timing) | Out-Null }
    $timing.InnerText = '0'
    $available = $true
    foreach ($file in $st.SelectNodes('//rom/filename')) {
        $found = Get-ChildItem -LiteralPath $SystemRoms -Recurse -File -Filter $file.InnerText | Select-Object -First 1
        if (!$found) { $available = $false; Write-Warning "FS-A1ST ROM not found: $($file.InnerText)"; continue }
        $destination = Join-Path "$emulator\share\systemroms" $file.InnerText
        if (!(Test-Path $destination)) { Copy-Item -LiteralPath $found.FullName -Destination $destination }
        $file.InnerText = $destination.Replace('\', '/')
    }
    if ($available) { $st.Save("$emulator\share\machines\Panasonic_FS-A1ST(V9968).xml") }
} elseif (!(Test-Path "$emulator\share\machines\Panasonic_FS-A1ST(V9968).xml")) {
    Write-Warning 'FS-A1ST was not configured. Supply -SystemRoms to select your existing openMSX ROM directory.'
}
New-Item -ItemType Directory -Force -Path "$local\user" | Out-Null
Write-Host "V9968 emulator ready: $emulator"
