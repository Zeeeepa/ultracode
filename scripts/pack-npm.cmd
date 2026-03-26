@echo off
chcp 65001 >nul 2>&1
cd /d "%~dp0"
pwsh -ExecutionPolicy Bypass -File "pack-npm.ps1" -Apply -Publish