param([Parameter(Mandatory)][string]$Directory)
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Drawing
$reference = [Drawing.Bitmap]::new((Join-Path $Directory 'off.png'))
try {
    $origin = $null
    for ($y = 0; $y -lt $reference.Height -and !$origin; $y++) {
        for ($x = 0; $x -lt $reference.Width; $x++) {
            $c = $reference.GetPixel($x, $y)
            if ($c.R -eq 255 -and $c.G -eq 0 -and $c.B -eq 255) {
                $origin = @($x, $y)
                break
            }
        }
    }
    if (!$origin) { throw 'SCREEN 5 calibration marker is missing.' }
} finally { $reference.Dispose() }
$frames = foreach ($file in Get-ChildItem -LiteralPath $Directory -Filter '*.png') {
    $bitmap = [Drawing.Bitmap]::new($file.FullName)
    try {
        $c = $bitmap.GetPixel($origin[0] + 52, $origin[1] + 84)
        $overlap = @([int]$c.R, [int]$c.G, [int]$c.B)
        $planes = for ($n = 0; $n -lt 24; $n++) {
            $c = $bitmap.GetPixel($origin[0] + $n * 10 + 3, $origin[1] + 123)
            ,@([int]$c.R, [int]$c.G, [int]$c.B)
        }
        @{ name = $file.Name; overlap = $overlap; planes = @($planes) }
    } finally { $bitmap.Dispose() }
}
ConvertTo-Json -InputObject @($frames) -Depth 5 -Compress
