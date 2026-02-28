<#
.SYNOPSIS
    UltraCode - Interactive Environment Setup for Windows

.DESCRIPTION
    Checks and optionally installs required dependencies for language parsing:
    - Node.js (required)
    - Python (for Python parsing)
    - Go (for Go parsing)
    - Rust (for Rust parsing)
    - Clang (for C/C++ parsing)
    - Java (for Java/Kotlin parsing)
    - shfmt (for Bash parsing)

.NOTES
    Run with: .\user-setup.ps1
    Requires: Windows 10/11, PowerShell 5.1+
#>

param(
    [switch]$AutoInstall,
    [switch]$Quiet
)

$ErrorActionPreference = "Continue"

# Colors
function Write-Success { Write-Host $args -ForegroundColor Green }
function Write-Warning { Write-Host $args -ForegroundColor Yellow }
function Write-Error { Write-Host $args -ForegroundColor Red }
function Write-Info { Write-Host $args -ForegroundColor Cyan }

function Write-Header {
    Write-Host ""
    Write-Host "============================================" -ForegroundColor Magenta
    Write-Host "  UltraCode - Environment Setup" -ForegroundColor Magenta
    Write-Host "============================================" -ForegroundColor Magenta
    Write-Host ""
}

function Test-Command {
    param([string]$Command)
    try {
        $null = Get-Command $Command -ErrorAction Stop
        return $true
    } catch {
        return $false
    }
}

function Get-Version {
    param([string]$Command, [string]$VersionArg = "--version")
    try {
        $output = & $Command $VersionArg 2>&1 | Select-Object -First 1
        return $output.ToString().Trim()
    } catch {
        return $null
    }
}

function Ask-Install {
    param([string]$Name, [string]$Url)

    if ($AutoInstall) {
        return $true
    }

    Write-Host ""
    Write-Warning "$Name is not installed."
    Write-Info "Download: $Url"
    $response = Read-Host "Install $Name now? (y/n)"
    return $response -match "^[yY]"
}

function Install-WithWinget {
    param([string]$PackageId, [string]$Name)

    if (-not (Test-Command "winget")) {
        Write-Error "winget not available. Please install $Name manually."
        return $false
    }

    Write-Info "Installing $Name via winget..."
    try {
        winget install --id $PackageId --accept-source-agreements --accept-package-agreements
        return $LASTEXITCODE -eq 0
    } catch {
        Write-Error "Failed to install $Name"
        return $false
    }
}

function Install-WithChoco {
    param([string]$PackageName, [string]$Name)

    if (-not (Test-Command "choco")) {
        Write-Error "Chocolatey not available. Please install $Name manually."
        return $false
    }

    Write-Info "Installing $Name via Chocolatey..."
    try {
        choco install $PackageName -y
        return $LASTEXITCODE -eq 0
    } catch {
        Write-Error "Failed to install $Name"
        return $false
    }
}

# ============================================================================
# DEPENDENCY CHECKS
# ============================================================================

$results = @{}

Write-Header

# 1. Node.js (Required)
Write-Host "Checking Node.js..." -NoNewline
if (Test-Command "node") {
    $version = Get-Version "node" "-v"
    Write-Success " OK ($version)"
    $results["Node.js"] = "OK"
} else {
    Write-Error " NOT FOUND"
    $results["Node.js"] = "MISSING"

    if (Ask-Install "Node.js" "https://nodejs.org/") {
        if (Test-Command "winget") {
            Install-WithWinget "OpenJS.NodeJS.LTS" "Node.js"
        } else {
            Write-Info "Please download from: https://nodejs.org/"
        }
    }
}

# 2. Python
Write-Host "Checking Python..." -NoNewline
$pythonCmd = $null
foreach ($cmd in @("python", "python3", "py")) {
    if (Test-Command $cmd) {
        $pythonCmd = $cmd
        break
    }
}

if ($pythonCmd) {
    $version = Get-Version $pythonCmd "--version"
    Write-Success " OK ($version)"
    $results["Python"] = "OK"
} else {
    Write-Warning " NOT FOUND (Python parsing will use regex fallback)"
    $results["Python"] = "OPTIONAL"

    if (Ask-Install "Python" "https://www.python.org/downloads/") {
        Install-WithWinget "Python.Python.3.12" "Python"
    }
}

# 3. Go
Write-Host "Checking Go..." -NoNewline
if (Test-Command "go") {
    $version = Get-Version "go" "version"
    Write-Success " OK ($version)"
    $results["Go"] = "OK"
} else {
    Write-Warning " NOT FOUND (Go parsing will use regex fallback)"
    $results["Go"] = "OPTIONAL"

    if (Ask-Install "Go" "https://go.dev/dl/") {
        Install-WithWinget "GoLang.Go" "Go"
    }
}

# 4. Rust
Write-Host "Checking Rust..." -NoNewline
if (Test-Command "rustc") {
    $version = Get-Version "rustc" "--version"
    Write-Success " OK ($version)"
    $results["Rust"] = "OK"

    # Check rust-analyzer
    Write-Host "Checking rust-analyzer..." -NoNewline
    if (Test-Command "rust-analyzer") {
        $raVersion = Get-Version "rust-analyzer" "--version"
        Write-Success " OK ($raVersion)"
    } else {
        Write-Warning " NOT FOUND (will use regex parser)"
    }
} else {
    Write-Warning " NOT FOUND (Rust parsing will use regex fallback)"
    $results["Rust"] = "OPTIONAL"

    if (Ask-Install "Rust" "https://rustup.rs/") {
        Write-Info "Installing Rust via rustup..."
        try {
            Invoke-WebRequest -Uri "https://win.rustup.rs/x86_64" -OutFile "$env:TEMP\rustup-init.exe"
            & "$env:TEMP\rustup-init.exe" -y
        } catch {
            Write-Error "Failed to download rustup. Please install manually from https://rustup.rs/"
        }
    }
}

# 5. Clang (C/C++)
Write-Host "Checking Clang..." -NoNewline
if (Test-Command "clang") {
    $version = Get-Version "clang" "--version"
    Write-Success " OK ($version)"
    $results["Clang"] = "OK"
} else {
    Write-Warning " NOT FOUND (C/C++ parsing will use regex fallback)"
    $results["Clang"] = "OPTIONAL"

    if (Ask-Install "LLVM/Clang" "https://releases.llvm.org/download.html") {
        Install-WithWinget "LLVM.LLVM" "LLVM/Clang"
    }
}

# 6. Java
Write-Host "Checking Java..." -NoNewline
if (Test-Command "java") {
    $version = Get-Version "java" "--version"
    Write-Success " OK ($version)"
    $results["Java"] = "OK"
} else {
    Write-Warning " NOT FOUND (Java/Kotlin parsing will use regex fallback)"
    $results["Java"] = "OPTIONAL"

    if (Ask-Install "Java" "https://adoptium.net/") {
        Install-WithWinget "EclipseAdoptium.Temurin.21.JDK" "Java"
    }
}

# 7. shfmt (Bash)
Write-Host "Checking shfmt..." -NoNewline
if (Test-Command "shfmt") {
    $version = Get-Version "shfmt" "--version"
    Write-Success " OK ($version)"
    $results["shfmt"] = "OK"
} else {
    Write-Warning " NOT FOUND (Bash parsing will use regex fallback)"
    $results["shfmt"] = "OPTIONAL"

    if (Ask-Install "shfmt" "https://github.com/mvdan/sh/releases") {
        if (Test-Command "go") {
            Write-Info "Installing shfmt via go install..."
            go install mvdan.cc/sh/v3/cmd/shfmt@latest
        } else {
            Write-Info "Please download from: https://github.com/mvdan/sh/releases"
        }
    }
}

# 8. PowerShell (always available on Windows)
Write-Host "Checking PowerShell..." -NoNewline
$psVersion = $PSVersionTable.PSVersion.ToString()
Write-Success " OK ($psVersion)"
$results["PowerShell"] = "OK"

# ============================================================================
# SUMMARY
# ============================================================================

Write-Host ""
Write-Host "============================================" -ForegroundColor Magenta
Write-Host "  SUMMARY" -ForegroundColor Magenta
Write-Host "============================================" -ForegroundColor Magenta
Write-Host ""

$required = 0
$optional = 0
$missing = 0

foreach ($item in $results.GetEnumerator()) {
    $icon = switch ($item.Value) {
        "OK" { "[+]"; $color = "Green" }
        "OPTIONAL" { "[~]"; $color = "Yellow"; $optional++ }
        "MISSING" { "[!]"; $color = "Red"; $missing++ }
    }
    Write-Host "$icon $($item.Key): $($item.Value)" -ForegroundColor $color
}

Write-Host ""

if ($missing -gt 0) {
    Write-Error "Some required dependencies are missing. Please install them."
    exit 1
} elseif ($optional -gt 0) {
    Write-Warning "Some optional dependencies are missing."
    Write-Info "Parsers for those languages will use regex fallback."
    Write-Host ""
    Write-Success "UltraCode can run with reduced functionality."
} else {
    Write-Success "All dependencies are installed!"
    Write-Host ""
    Write-Success "UltraCode is ready to use with full functionality."
}

Write-Host ""
Write-Info "To start the MCP server, run:"
Write-Host "  npm start" -ForegroundColor White
Write-Host ""
