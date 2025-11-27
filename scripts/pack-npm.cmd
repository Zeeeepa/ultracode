@echo off
cd /d "%~dp0"
pwsh -ExecutionPolicy Bypass -File "pack-npm.ps1" -Apply -Publish