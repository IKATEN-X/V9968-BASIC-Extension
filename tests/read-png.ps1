param([Parameter(Mandatory)][string]$Path)
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Drawing
$bitmap = [Drawing.Bitmap]::new($Path)
try {
    $rgb = [byte[]]::new($bitmap.Width * $bitmap.Height * 3)
    $i = 0
    for ($y = 0; $y -lt $bitmap.Height; $y++) {
        for ($x = 0; $x -lt $bitmap.Width; $x++) {
            $color = $bitmap.GetPixel($x, $y)
            $rgb[$i++] = $color.R
            $rgb[$i++] = $color.G
            $rgb[$i++] = $color.B
        }
    }
    @{ width = $bitmap.Width; height = $bitmap.Height; rgb = [Convert]::ToBase64String($rgb) } | ConvertTo-Json -Compress
} finally { $bitmap.Dispose() }
