param(
    [string]$GraphPath,
    [string]$Device
)

$content = Get-Content $GraphPath -Raw
$content = $content -replace 'target_device:\s*"[^"]*"', "target_device: `"$Device`""
$utf8NoBom = New-Object System.Text.UTF8Encoding $false
[IO.File]::WriteAllText($GraphPath, $content, $utf8NoBom)
Write-Host "Set target_device to: $Device"
