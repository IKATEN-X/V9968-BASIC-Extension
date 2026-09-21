$ErrorActionPreference = 'Stop'
$root = Split-Path $PSScriptRoot -Parent
$capture = @{ Launch = $null }
function Start-Process {
    param($FilePath, $ArgumentList, $WorkingDirectory)
    $capture.Launch = [pscustomobject]@{ FilePath = $FilePath; Arguments = $ArgumentList; Directory = $WorkingDirectory }
}
function Assert-True($Value, $Message) { if (!$Value) { throw $Message } }
function Assert-Rejected([hashtable]$Options, [string]$Message) {
    $capture.Launch = $null
    $rejected = $false
    try { & "$root\run.ps1" @Options -NoBuild } catch { $rejected = $_.Exception.Message.Contains($Message) }
    Assert-True $rejected "Expected launcher error containing: $Message"
    Assert-True ($null -eq $capture.Launch) 'Invalid arguments must not start the emulator.'
}
& "$root\run.ps1" -Disk -Entry ASSETS.BAS -NoBuild
Assert-True ($null -ne $capture.Launch) 'Disk launcher did not start the emulator.'
Assert-True ($capture.Launch.Arguments -contains ('"{0}\emulator\disk.tcl"' -f $root)) 'Disk launch must select disk.tcl.'
Assert-True ($capture.Launch.Arguments -contains '"Panasonic_FS-A1ST(V9968)"') 'Default machine was changed.'
Assert-True (Test-Path -LiteralPath "$env:V9968_DISK\BACK.SC5") 'Prepared disk is missing its bitmap.'
Assert-True ((Get-Content -LiteralPath "$env:V9968_DISK\AUTOEXEC.BAS" -Raw).Contains('A:ASSETS.BAS')) 'Entry was not forwarded.'

& "$root\run.ps1" -Disk -Entry SHUFFLE.BAS -NoBuild
Assert-True (Test-Path -LiteralPath "$env:V9968_DISK\SHUFFLE.BAS") 'Dedicated shuffle demo is missing.'
Assert-True ((Get-Content -LiteralPath "$env:V9968_DISK\AUTOEXEC.BAS" -Raw).Contains('A:SHUFFLE.BAS')) 'Shuffle entry was not forwarded.'

& "$root\run.ps1" -Disk -Entry LFMCBUG.BAS -NoBuild
Assert-True ((Get-Content -LiteralPath "$env:V9968_DISK\AUTOEXEC.BAS" -Raw).Contains('A:LFMCBUG.BAS')) 'LFMC diagnostic entry was not forwarded.'
$diagnostic = Get-Content -LiteralPath "$env:V9968_DISK\LFMCBUG.BAS" -Raw
Assert-True ($diagnostic.Contains('180 END')) 'Diagnostic must finish at the BASIC prompt.'
Assert-True (!$diagnostic.Contains('MENU.BAS')) 'Diagnostic results must not be replaced by the menu.'

& "$root\run.ps1" -Disk -Entry CIRCLE.BAS -NoBuild
Assert-True ((Get-Content -LiteralPath "$env:V9968_DISK\AUTOEXEC.BAS" -Raw).Contains('A:CIRCLE.BAS')) 'CIRCLE entry was not forwarded.'
Assert-True ((Get-Content -LiteralPath "$env:V9968_DISK\CIRCLE.BAS" -Raw).Contains('RUN"A:MENU.BAS"')) 'Packaged CIRCLE must return to the menu.'

& "$root\run.ps1" -Program demo/FONT.BAS -NoBuild
Assert-True ($capture.Launch.Arguments -contains ('"{0}\emulator\demo.tcl"' -f $root)) 'Legacy launch must still select demo.tcl.'
Assert-True ($env:V9968_DEMO -eq [IO.Path]::GetFullPath('demo/FONT.BAS', $root)) 'Legacy program path was not forwarded.'
Assert-Rejected @{ Disk = $true; Machine = 'V9968_Basic' } 'no disk drive'
Assert-Rejected @{ Disk = $true; Program = 'demo/FONT.BAS' } 'Use -Entry'
Assert-Rejected @{ Entry = 'FONT.BAS' } 'require -Disk'
Assert-Rejected @{ Program = 'demo/MISSING.BAS' } 'not found'
Write-Host 'PASS: disk and legacy launcher arguments, entry forwarding, path resolution and actionable errors (process launch mocked)'
