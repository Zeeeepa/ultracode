<#
.SYNOPSIS
    Quick log reader for UltraCode server logs.

.DESCRIPTION
    Filters MCP server logs by category: PERFORMANCE, ERROR, TRACE, or custom pattern.

.PARAMETER Category
    Log category to filter: PERFORMANCE, ERROR, TRACE, DEBUG, INFO, WARN, FATAL, or custom regex.

.PARAMETER Lines
    Number of lines to show (default: 50).

.PARAMETER Date
    Log date in yyyy-MM-dd format (default: today).

.PARAMETER Stats
    Show statistics instead of log lines.

.EXAMPLE
    .\read-logs.ps1 PERFORMANCE
    .\read-logs.ps1 ERROR -Lines 100
    .\read-logs.ps1 PERFORMANCE -Date 2025-12-24
    .\read-logs.ps1 -Stats
#>

param(
    [Parameter(Position=0)]
    [string]$Category = "PERFORMANCE",

    [Parameter()]
    [int]$Lines = 50,

    [Parameter()]
    [string]$Date = (Get-Date -Format 'yyyy-MM-dd'),

    [Parameter()]
    [switch]$Stats
)

$logPath = "$env:LOCALAPPDATA\UltraCode\logs\mcp-server-$Date.log"

if (-not (Test-Path $logPath)) {
    Write-Host "Log file not found: $logPath" -ForegroundColor Red
    Write-Host "Available logs:" -ForegroundColor Yellow
    Get-ChildItem "$env:LOCALAPPDATA\UltraCode\logs\*.log" |
        Sort-Object LastWriteTime -Descending |
        Select-Object -First 5 |
        ForEach-Object { Write-Host "  $($_.Name) ($([math]::Round($_.Length/1KB, 1)) KB)" }
    exit 1
}

if ($Stats) {
    Write-Host "`nLog Statistics for $Date`n" -ForegroundColor Cyan

    $levels = @{
        "ERROR" = 0
        "FATAL" = 0
        "WARN" = 0
        "INFO" = 0
        "DEBUG" = 0
        "TRACE" = 0
    }

    $subcategories = @{
        "PERFORMANCE" = 0
        "CRASH" = 0
        "EMBEDDING" = 0
        "PROVIDER" = 0
    }

    # Count by level and subcategory
    Get-Content $logPath | ForEach-Object {
        # Level: [INFO], [ERROR], etc.
        if ($_ -match '\[(\w+)\]') {
            $lvl = $matches[1]
            if ($levels.ContainsKey($lvl)) {
                $levels[$lvl]++
            }
        }
        # Subcategory: [PERFORMANCE], [CRASH], etc.
        if ($_ -match '\[PERFORMANCE\]') { $subcategories["PERFORMANCE"]++ }
        if ($_ -match '\[CRASH\]') { $subcategories["CRASH"]++ }
        if ($_ -match '\[EMBEDDING') { $subcategories["EMBEDDING"]++ }
        if ($_ -match '\[PROVIDER') { $subcategories["PROVIDER"]++ }
    }

    Write-Host "By Level:" -ForegroundColor White
    $levels.GetEnumerator() | Sort-Object Value -Descending | ForEach-Object {
        $color = switch ($_.Key) {
            "ERROR" { "Red" }
            "FATAL" { "Magenta" }
            "WARN" { "Yellow" }
            default { "White" }
        }
        Write-Host ("  {0,-10} {1,8}" -f $_.Key, $_.Value) -ForegroundColor $color
    }

    Write-Host "`nBy Subcategory:" -ForegroundColor White
    $subcategories.GetEnumerator() | Where-Object { $_.Value -gt 0 } | Sort-Object Value -Descending | ForEach-Object {
        $color = switch ($_.Key) {
            "CRASH" { "Red" }
            "PERFORMANCE" { "Green" }
            default { "Cyan" }
        }
        Write-Host ("  {0,-15} {1,8}" -f $_.Key, $_.Value) -ForegroundColor $color
    }

    # File info
    $fileInfo = Get-Item $logPath
    Write-Host "`nFile: $($fileInfo.Name)" -ForegroundColor Gray
    Write-Host "Size: $([math]::Round($fileInfo.Length/1KB, 1)) KB" -ForegroundColor Gray
    Write-Host "Modified: $($fileInfo.LastWriteTime)" -ForegroundColor Gray
    exit 0
}

# Build pattern based on category
$pattern = switch ($Category.ToUpper()) {
    "PERFORMANCE" { "\[PERFORMANCE\]" }
    "ERROR" { "\[ERROR\]|\[FATAL\]" }
    "TRACE" { "\[TRACE\]" }
    "DEBUG" { "\[DEBUG\]" }
    "INFO" { "\[INFO\]" }
    "WARN" { "\[WARN\]" }
    "FATAL" { "\[FATAL\]" }
    "ALL" { "." }
    default { $Category }  # Custom regex
}

Write-Host "`nFiltering '$Category' from $Date log (last $Lines):`n" -ForegroundColor Cyan

# Use Select-String for efficient filtering
$results = Select-String -Path $logPath -Pattern $pattern | Select-Object -Last $Lines

if ($results.Count -eq 0) {
    Write-Host "No matches found for pattern: $pattern" -ForegroundColor Yellow
    exit 0
}

foreach ($match in $results) {
    $line = $match.Line

    # Color based on level
    $color = "White"
    if ($line -match "\[ERROR\]|\[FATAL\]") { $color = "Red" }
    elseif ($line -match "\[WARN\]") { $color = "Yellow" }
    elseif ($line -match "\[PERFORMANCE\]") { $color = "Green" }
    elseif ($line -match "\[DEBUG\]") { $color = "Gray" }

    # Truncate long lines
    if ($line.Length -gt 200) {
        $line = $line.Substring(0, 197) + "..."
    }

    Write-Host $line -ForegroundColor $color
}

Write-Host "`n--- $($results.Count) lines shown ---" -ForegroundColor Gray
