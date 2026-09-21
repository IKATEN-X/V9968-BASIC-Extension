[CmdletBinding(SupportsShouldProcess)]
param([switch]$Apply)

$ErrorActionPreference = 'Stop'
$root = (Resolve-Path -LiteralPath (Split-Path $PSScriptRoot -Parent)).ProviderPath
$prefix = $root.TrimEnd([IO.Path]::DirectorySeparatorChar) + [IO.Path]::DirectorySeparatorChar

function Assert-LocalPath([string]$Path) {
    $full = [IO.Path]::GetFullPath($Path)
    if (!$full.StartsWith($prefix, [StringComparison]::OrdinalIgnoreCase)) {
        throw "Cleanup path is outside the project: $full"
    }
    # Check every ancestor too: Resolve-Path alone does not reject junctions.
    for ($current = $full; $current -ne $root; $current = Split-Path $current -Parent) {
        if ((Get-Item -LiteralPath $current -Force).Attributes -band [IO.FileAttributes]::ReparsePoint) {
            throw "Cleanup refuses links or junctions: $current"
        }
    }
}

function Assert-Idle {
    $busy = @(Get-Process -Name openmsx,blueMSX,blueMSX+,z88dk-z80asm -ErrorAction SilentlyContinue)
    $nodes = @(Get-CimInstance Win32_Process -Filter "name = 'node.exe'" | Where-Object {
        !$_.CommandLine -or $_.CommandLine -match '(?i)(tests[\\/]|tools[\\/](openmsx|demo-disk|sine)\.mjs)'
    })
    if ($busy.Count -or $nodes.Count) {
        throw 'Close emulators and finish project builds/tests before cleanup. No process was stopped.'
    }
}

# Match only the temporary directory names created by the project's tools/tests.
# Keep build outputs, baselines, screenshots, references, settings and all dist files.
$rules = @(
    @{ Parent = '.local'; Pattern = '^ipc-[0-9]+-[0-9]+$' },
    @{ Parent = 'build'; Pattern = '^(boot|gitignore-check|disk-(invalid|full|missing|missing-shoot)|disk custom source)-[A-Za-z0-9]{6}$' },
    @{ Parent = 'build/disks'; Pattern = '^(demo|sprite-fix)-[A-Za-z0-9]{6}$' }
)
$targets = [Collections.Generic.List[object]]::new()
foreach ($rule in $rules) {
    $parent = Join-Path $root $rule.Parent
    if (!(Test-Path -LiteralPath $parent)) { continue }
    Assert-LocalPath $parent
    foreach ($item in Get-ChildItem -LiteralPath $parent -Force) {
        if (!$item.PSIsContainer -or $item.Name -cnotmatch $rule.Pattern) { continue }
        Assert-LocalPath $item.FullName
        $pending = [Collections.Generic.Stack[string]]::new()
        $pending.Push($item.FullName)
        [long]$bytes = 0
        [long]$files = 0
        while ($pending.Count) {
            foreach ($child in Get-ChildItem -LiteralPath $pending.Pop() -Force) {
                Assert-LocalPath $child.FullName
                if ($child.PSIsContainer) { $pending.Push($child.FullName) }
                else { $bytes += $child.Length; $files++ }
            }
        }
        $targets.Add([pscustomobject]@{ Path = $item.FullName; Files = $files; Bytes = $bytes })
    }
}

# Preflight the entire selection before any deletion, including nested links.
if ($Apply -and !$WhatIfPreference) { Assert-Idle }
[long]$totalBytes = 0
[long]$totalFiles = 0
$directories = 0
foreach ($target in $targets) {
    Write-Verbose $target.Path
    if (!$Apply -or $PSCmdlet.ShouldProcess($target.Path, 'Remove generated temporary directory')) {
        if ($Apply) {
            Assert-LocalPath $target.Path
            Remove-Item -LiteralPath $target.Path -Recurse -Force
        }
        $totalBytes += $target.Bytes
        $totalFiles += $target.Files
        $directories++
    }
}
[pscustomobject]@{
    Action = $(if ($Apply) { 'Removed' } else { 'Preview (use -Apply to delete)' })
    Directories = $directories
    Files = $totalFiles
    Bytes = $totalBytes
    MiB = [math]::Round($totalBytes / 1MB, 2)
}
