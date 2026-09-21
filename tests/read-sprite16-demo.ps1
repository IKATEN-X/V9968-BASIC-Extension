param([Parameter(Mandatory)][string]$Directory)
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Drawing
$reference = [Drawing.Bitmap]::new((Join-Path $Directory 'off.png'))
try {
    $origin = $null
    # Locate the native screen without relying on a particular border size.
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
$textPositions = @(@(8,16), @(168,16), @(8,40), @(144,40), @(8,56), @(8,120))
for ($i = 0; $i -lt 4; $i++) { $textPositions += ,@((8 + $i * 64), 100) }
$frames = foreach ($file in Get-ChildItem -LiteralPath $Directory -Filter '*.png') {
    $bitmap = [Drawing.Bitmap]::new($file.FullName)
    try {
        $samples = foreach ($row in @(76,140)) {
            $pixels = for ($i = 0; $i -lt 32; $i++) {
                $c = $bitmap.GetPixel(($origin[0] + 4 + $i * 8), ($origin[1] + $row))
                ,@([int]$c.R, [int]$c.G, [int]$c.B)
            }
            ,@($pixels)
        }
        $text = foreach ($position in $textPositions) {
            $x = $origin[0] + $position[0]
            $y = $origin[1] + $position[1]
            $c = $bitmap.GetPixel($x, $y)
            $ink = 0
            for ($dy = 0; $dy -lt 8; $dy++) {
                for ($dx = 0; $dx -lt 12; $dx++) {
                    $p = $bitmap.GetPixel(($x + $dx), ($y + $dy))
                    if ($p.R -eq 255 -and $p.G -eq 255 -and $p.B -eq 255) { $ink++ }
                }
            }
            @{ position = $position; cursor = @([int]$c.R, [int]$c.G, [int]$c.B); ink = $ink }
        }
        @{ name = $file.Name; sprites = $samples[0]; reference = $samples[1]; text = @($text) }
    } finally { $bitmap.Dispose() }
}
ConvertTo-Json -InputObject @($frames) -Depth 5 -Compress
