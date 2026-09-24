$ErrorActionPreference = 'Stop'
try {
    $inputBytes = [IO.MemoryStream]::new()
    [Console]::OpenStandardInput().CopyTo($inputBytes)
    $text = [Text.UTF8Encoding]::new($false, $true).GetString($inputBytes.ToArray())
    $encoding = [Text.Encoding]::GetEncoding(932, [Text.EncoderExceptionFallback]::new(), [Text.DecoderExceptionFallback]::new())
    [Console]::Write([Convert]::ToBase64String($encoding.GetBytes($text)))
} catch {
    [Console]::Error.WriteLine($_.Exception.Message)
    exit 1
}
