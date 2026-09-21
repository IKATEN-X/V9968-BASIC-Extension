param([Parameter(Mandatory)][string]$Path)
$ErrorActionPreference = 'Stop'
$stream = [IO.File]::OpenRead($Path)
try {
    $gzip = [IO.Compression.GZipStream]::new($stream, [IO.Compression.CompressionMode]::Decompress)
    $reader = [IO.StreamReader]::new($gzip)
    try { $document = [xml]$reader.ReadToEnd() } finally { $reader.Dispose() }
} finally { $stream.Dispose() }
$colors = @($document.SelectNodes('//palette/item') | ForEach-Object { [int]$_.InnerText })
if ($colors.Count -ne 256) { throw "Expected 256 V9968 palette entries, got $($colors.Count)." }
ConvertTo-Json -InputObject $colors -Compress
