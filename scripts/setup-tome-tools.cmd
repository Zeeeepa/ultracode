@echo off
REM ToMe Tools Setup - Wrapper for PowerShell script
REM Run this to install Token Merging tools for OVMS embeddings

echo Starting ToMe Tools Setup...
powershell -ExecutionPolicy Bypass -File "%~dp0setup-tome-tools.ps1"
