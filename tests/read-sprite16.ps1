param([Parameter(Mandatory)][string]$Directory)
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Drawing
$reference = [Drawing.Bitmap]::new((Join-Path $Directory 'off.png'))
try {
    $origin = $null
    for ($y = 0; $y -lt $reference.Height -and !$origin; $y++) {
        $run = 0
        for ($x = 0; $x -lt $reference.Width; $x++) {
            $c = $reference.GetPixel($x, $y)
            if ($c.R -eq 255 -and $c.G -eq 255 -and $c.B -eq 255) { $run++ } else { $run = 0 }
            if ($run -eq 250) { $origin = @(($x - 249), $y); break }
        }
    }
    if (!$origin) { throw 'Native SCREEN top rule is missing.' }
} finally { $reference.Dispose() }
$frames = foreach ($file in Get-ChildItem -LiteralPath $Directory -Filter '*.png') {
    $bitmap = [Drawing.Bitmap]::new($file.FullName)
    try {
        $samples = foreach ($row in @(76,116)) {
            # SCREEN 2 background colors are shared by aligned 8-pixel groups.
            $spacing = if ($row -eq 76) { 10 } else { 8 }
            $pixels = for ($i = 0; $i -lt 24; $i++) {
                $c = $bitmap.GetPixel(($origin[0] + 12 + $i * $spacing), ($origin[1] + $row))
                ,@([int]$c.R, [int]$c.G, [int]$c.B)
            }
            ,@($pixels)
        }
        @{ name = $file.Name; sprites = $samples[0]; reference = $samples[1] }
    } finally { $bitmap.Dispose() }
}
ConvertTo-Json -InputObject @($frames) -Depth 5 -Compress
