#!/usr/bin/env pwsh
# Setup script for UltraScript.Comm build environment
# Downloads and installs cosmocc (Cosmopolitan C Compiler)

$ErrorActionPreference = "Stop"
$ProgressPreference = "SilentlyContinue"

$COSMO_VERSION = "4.0.2"
$COSMO_URL = "https://github.com/jart/cosmopolitan/releases/download/$COSMO_VERSION/cosmocc-$COSMO_VERSION.zip"
$INSTALL_DIR = "$env:LOCALAPPDATA\cosmocc"
$BIN_DIR = "$INSTALL_DIR\bin"

function Write-Status($msg) { Write-Host "[*] $msg" -ForegroundColor Cyan }
function Write-Success($msg) { Write-Host "[+] $msg" -ForegroundColor Green }
function Write-Warning($msg) { Write-Host "[!] $msg" -ForegroundColor Yellow }
function Write-Err($msg) { Write-Host "[-] $msg" -ForegroundColor Red }

# Check if cosmocc is already installed
function Test-Cosmocc {
    $cosmocc = Get-Command "cosmocc" -ErrorAction SilentlyContinue
    if ($cosmocc) {
        Write-Success "cosmocc already installed: $($cosmocc.Source)"
        return $true
    }

    # Check in install dir
    if (Test-Path "$BIN_DIR\cosmocc.exe") {
        Write-Success "cosmocc found in $BIN_DIR"
        return $true
    }

    return $false
}

# Download and install cosmocc
function Install-Cosmocc {
    Write-Status "Downloading cosmocc $COSMO_VERSION..."

    $zipPath = "$env:TEMP\cosmocc.zip"

    try {
        Invoke-WebRequest -Uri $COSMO_URL -OutFile $zipPath -UseBasicParsing
    } catch {
        Write-Err "Failed to download cosmocc: $_"
        return $false
    }

    Write-Status "Extracting to $INSTALL_DIR..."

    # Remove old installation
    if (Test-Path $INSTALL_DIR) {
        Remove-Item $INSTALL_DIR -Recurse -Force
    }

    # Extract
    Expand-Archive -Path $zipPath -DestinationPath $INSTALL_DIR -Force
    Remove-Item $zipPath -Force

    # cosmocc extracts to cosmocc-X.Y.Z subfolder, move contents up
    $subdir = Get-ChildItem $INSTALL_DIR -Directory | Select-Object -First 1
    if ($subdir -and $subdir.Name -like "cosmocc-*") {
        Get-ChildItem $subdir.FullName | Move-Item -Destination $INSTALL_DIR -Force
        Remove-Item $subdir.FullName -Force
    }

    Write-Success "cosmocc installed to $INSTALL_DIR"
    return $true
}

# Add to PATH for current session
function Add-ToPath {
    if ($env:PATH -notlike "*$BIN_DIR*") {
        $env:PATH = "$BIN_DIR;$env:PATH"
        Write-Status "Added $BIN_DIR to PATH (current session)"
    }
}

# Add to user PATH permanently
function Add-ToPathPermanent {
    $userPath = [Environment]::GetEnvironmentVariable("PATH", "User")
    if ($userPath -notlike "*$BIN_DIR*") {
        $newPath = "$BIN_DIR;$userPath"
        [Environment]::SetEnvironmentVariable("PATH", $newPath, "User")
        Write-Success "Added $BIN_DIR to user PATH (permanent)"
    }

    # Refresh current session
    $machinePath = [Environment]::GetEnvironmentVariable("PATH", "Machine")
    $userPathNew = [Environment]::GetEnvironmentVariable("PATH", "User")
    $env:PATH = "$userPathNew;$machinePath"
    Write-Success "Refreshed PATH in current session"
}

# Main
Write-Host ""
Write-Host "=== UltraScript.Comm Setup ===" -ForegroundColor Magenta
Write-Host ""

# Check existing installation
if (Test-Cosmocc) {
    Add-ToPath
    Write-Host ""
    Write-Success "Setup complete! Run .\build.ps1 to build."
    exit 0
}

Write-Warning "cosmocc not found"

# Install cosmocc
if (-not (Install-Cosmocc)) {
    Write-Err "Installation failed"
    exit 1
}

Add-ToPath
Add-ToPathPermanent

Write-Host ""
Write-Success "Setup complete!"
Write-Host ""
Write-Host "Next steps:" -ForegroundColor Yellow
Write-Host "  1. Restart terminal (or run: `$env:PATH = '$BIN_DIR;' + `$env:PATH)"
Write-Host "  2. Run: .\build.ps1"
Write-Host ""

# Verify
if (Test-Path "$BIN_DIR\cosmocc.exe") {
    Write-Host "Installed files:" -ForegroundColor Cyan
    Write-Host "  cosmocc:  $BIN_DIR\cosmocc.exe"
    Write-Host "  cosmoc++: $BIN_DIR\cosmoc++.exe"
}
