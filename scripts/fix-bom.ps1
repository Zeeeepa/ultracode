param([string]$FilePath)

$content = Get-Content $FilePath -Raw
$utf8NoBom = New-Object System.Text.UTF8Encoding $false
[System.IO.File]::WriteAllText($FilePath, $content, $utf8NoBom)
Write-Host "BOM removed from: $FilePath"
