param(
    [string]$Machine = 'Panasonic_FS-A1ST(V9968)',
    [string]$Program = 'demo/ORBIT.BAS',
    [switch]$Disk,
    [string]$DiskDirectory,
    [string]$Entry = 'MENU.BAS',
    [switch]$NoBuild
)
$ErrorActionPreference = 'Stop'
if (!$Disk -and ($DiskDirectory -or $PSBoundParameters.ContainsKey('Entry'))) { throw '-DiskDirectory and -Entry require -Disk.' }
if ($Disk -and $PSBoundParameters.ContainsKey('Program')) { throw 'Use -Entry FONT.BAS with -Disk, or use -Program without -Disk.' }
$emulator = "$PSScriptRoot\.local\openmsx"
if (!(Test-Path "$emulator\share\machines\$Machine.xml")) {
    throw "Machine is not set up. Run .\tools\setup.ps1, or select -Machine V9968_Basic."
}
if ($Disk) {
    [xml]$configuration = Get-Content -LiteralPath "$emulator\share\machines\$Machine.xml" -Raw
    if (!$configuration.SelectSingleNode('//devices//*[drives > 0]')) { throw "Machine has no disk drive: $Machine. Use Panasonic_FS-A1ST(V9968)." }
    $prepareArgs = @("$PSScriptRoot\tools\demo-disk.mjs", '--entry', $Entry)
    if ($DiskDirectory) { $prepareArgs += @('--source', [IO.Path]::GetFullPath($DiskDirectory, $PSScriptRoot)) }
    $prepared = & node @prepareArgs
    if ($LASTEXITCODE -ne 0) { throw 'Demo disk preparation failed.' }
    $diskInfo = $prepared | ConvertFrom-Json
    $env:V9968_DISK = $diskInfo.directory
    $script = "$PSScriptRoot\emulator\disk.tcl"
    Write-Host "Drive A: $($diskInfo.directory) (read-only, $($diskInfo.files.Count) files)"
    Write-Host "Disk BASIC will run $($diskInfo.entry) via AUTOEXEC.BAS."
} else {
    $programPath = [IO.Path]::GetFullPath($Program, $PSScriptRoot)
    if (!(Test-Path -LiteralPath $programPath -PathType Leaf)) { throw "BASIC program not found: $programPath" }
    $env:V9968_DEMO = $programPath
    $script = "$PSScriptRoot\emulator\demo.tcl"
}
if (!$NoBuild) { & "$PSScriptRoot\build.ps1" }
if (!(Test-Path -LiteralPath "$PSScriptRoot\dist\v9968-basic.rom" -PathType Leaf)) { throw 'Build the ROM first with .\build.ps1.' }
$env:OPENMSX_SYSTEM_DATA = "$emulator\share"
$env:OPENMSX_USER_DATA = "$PSScriptRoot\.local\user"
$env:OPENMSX_HOME = "$PSScriptRoot\.local\home"
$arguments = @('-machine', ('"{0}"' -f $Machine), '-cart', ('"{0}"' -f "$PSScriptRoot\dist\v9968-basic.rom"), '-romtype', 'Normal', '-script', ('"{0}"' -f $script))
# This is the interactive emulator requested by the user, not a helper window.
Start-Process -FilePath "$emulator\openmsx.exe" -ArgumentList $arguments -WorkingDirectory $PSScriptRoot
