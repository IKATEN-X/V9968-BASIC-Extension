$ErrorActionPreference = 'Stop'
$project = (Resolve-Path -LiteralPath (Split-Path $PSScriptRoot -Parent)).ProviderPath
$fixture = Join-Path $project ('build/cleanup-test-' + [guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Path (Join-Path $fixture 'tools') -Force | Out-Null
Copy-Item -LiteralPath (Join-Path $project 'tools/clean.ps1') -Destination (Join-Path $fixture 'tools/clean.ps1')
$cleaner = Join-Path $fixture 'tools/clean.ps1'
$temporary = @('.local/ipc-123-456', 'build/disk-full-Ab12Cd', 'build/disk custom source-Ef34Gh',
    'build/disk-missing-shoot-Ij56Kl', 'build/boot-Mn78Op', 'build/disks/demo-Qr90St')
$retained = @('src', 'dist/v9968-demo-files', '.local/openmsx', '.local/reference', '.local/home',
    '.local/user', '.git', 'build/screenshots', 'build/disks/my-demo', '.local/ipc-not-generated',
    'build/disk-full-not-generated')
function Require([bool]$Condition, [string]$Message) {
    if (!$Condition) { throw $Message }
}
try {
    foreach ($relative in $temporary + $retained) {
        $directory = Join-Path $fixture $relative
        New-Item -ItemType Directory -Path $directory -Force | Out-Null
        [IO.File]::WriteAllText((Join-Path $directory 'sentinel.txt'), 'keep this data unless selected')
    }
    foreach ($name in @('circle-before.rom', 'shoot-profile-baseline.json', 'v9968-basic.map')) {
        [IO.File]::WriteAllText((Join-Path $fixture "build/$name"), 'retained comparison/build data')
    }
    $preview = & $cleaner
    Require ($preview.Directories -eq $temporary.Count) 'Preview selection differs from the allowlist.'
    foreach ($relative in $temporary) {
        Require (Test-Path -LiteralPath (Join-Path $fixture $relative)) 'Preview removed data.'
    }
    $null = & $cleaner -Apply -WhatIf
    foreach ($relative in $temporary) {
        Require (Test-Path -LiteralPath (Join-Path $fixture $relative)) 'WhatIf removed data.'
    }
    function Get-Process {
        [CmdletBinding()]
        param($Name)
        [pscustomobject]@{ Name = 'openmsx' }
    }
    try {
        $blocked = $false
        try { $null = & $cleaner -Apply -Confirm:$false } catch {
            if ($_.Exception.Message -notmatch 'Close emulators') { throw }
            $blocked = $true
        }
        Require $blocked 'Cleanup ignored an active emulator.'
        foreach ($relative in $temporary) {
            Require (Test-Path -LiteralPath (Join-Path $fixture $relative)) 'Busy-process rejection removed data.'
        }
    } finally { Remove-Item Function:\Get-Process }
    $removed = & $cleaner -Apply -Confirm:$false
    Require ($removed.Bytes -eq $preview.Bytes) 'Removed byte count differs from preview.'
    foreach ($relative in $temporary) {
        Require (!(Test-Path -LiteralPath (Join-Path $fixture $relative))) 'Temporary directory survived cleanup.'
    }
    foreach ($relative in $retained) {
        Require ((Get-Content -LiteralPath (Join-Path $fixture "$relative/sentinel.txt") -Raw) -eq 'keep this data unless selected') 'Protected data changed.'
    }
    foreach ($name in @('circle-before.rom', 'shoot-profile-baseline.json', 'v9968-basic.map')) {
        Require (Test-Path -LiteralPath (Join-Path $fixture "build/$name")) 'Comparison/build data was deleted.'
    }
    Require ((& $cleaner -Apply -Confirm:$false).Directories -eq 0) 'Cleanup is not idempotent.'

    # A nested junction must abort all cleanup, not just skip the linked content.
    $candidate = Join-Path $fixture 'build/disks/demo-Ab12Cd'
    New-Item -ItemType Directory -Path $candidate | Out-Null
    $earlier = Join-Path $fixture '.local/ipc-456-789'
    New-Item -ItemType Directory -Path $earlier | Out-Null
    $link = Join-Path $candidate 'outside'
    New-Item -ItemType Junction -Path $link -Target (Join-Path $fixture 'src') | Out-Null
    try {
        $rejected = $false
        try { $null = & $cleaner -Apply -Confirm:$false } catch {
            if ($_.Exception.Message -notmatch 'links or junctions') { throw }
            $rejected = $true
        }
        Require $rejected 'Cleanup accepted a nested junction.'
        Require (Test-Path -LiteralPath $candidate) 'Cleanup mutated files before completing preflight.'
        Require (Test-Path -LiteralPath $earlier) 'Cleanup deleted an earlier candidate before completing preflight.'
        Require (Test-Path -LiteralPath (Join-Path $fixture 'src/sentinel.txt')) 'Junction target was modified.'
    } finally { Remove-Item -LiteralPath $link -Force }
    Write-Host 'PASS: preview, WhatIf, allowlist, preserved data, busy-process guard, idempotence and atomic junction rejection.'
} finally {
    $full = (Resolve-Path -LiteralPath $fixture).ProviderPath
    $expected = Join-Path $project 'build/cleanup-test-'
    if (!$full.StartsWith($expected, [StringComparison]::OrdinalIgnoreCase)) { throw 'Unexpected fixture cleanup path.' }
    if ((Get-Item -LiteralPath $full).Attributes -band [IO.FileAttributes]::ReparsePoint) { throw 'Unexpected fixture junction.' }
    Remove-Item -LiteralPath $full -Recurse -Force
}
