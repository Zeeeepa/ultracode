param(
    [string]$GraphPath,
    [string]$ModelsPath = "./1/"
)

$content = Get-Content $GraphPath -Raw
$content = $content -replace 'models_path:\s*"[^"]*"', "models_path: `"$ModelsPath`""
$utf8NoBom = New-Object System.Text.UTF8Encoding $false
[IO.File]::WriteAllText($GraphPath, $content, $utf8NoBom)
Write-Host "Set models_path to: $ModelsPath"
