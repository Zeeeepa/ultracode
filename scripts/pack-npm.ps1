#!/usr/bin/env pwsh
<#
.SYNOPSIS
    Упаковывает проект в npm-пакет с проверками и резервным копированием

.DESCRIPTION
    Скрипт выполняет полную упаковку проекта для npm с проверками:
    - Проверяет наличие всех собранных файлов
    - Показывает, что войдет в пакет
    - Создает резервную копию в _bak/
    - Генерирует .tgz файл через npm pack

.PARAMETER Apply
    Выполнить реальную упаковку (по умолчанию dry-run)

.PARAMETER SkipBuild
    Пропустить проверку build (использовать существующие dist/)

.PARAMETER Publish
    Опубликовать пакет в npm после упаковки (использует --auth-type=legacy)

.PARAMETER OutputDir
    Директория для выходного .tgz файла (по умолчанию ./dist-packages)

.EXAMPLE
    .\scripts\pack-npm.ps1
    Dry-run режим - показывает что будет упаковано

.EXAMPLE
    .\scripts\pack-npm.ps1 -Apply
    Реально упаковывает пакет

.EXAMPLE
    .\scripts\pack-npm.ps1 -Apply -SkipBuild
    Упаковывает без проверки build

.EXAMPLE
    .\scripts\pack-npm.ps1 -Apply -Publish
    Упаковывает и публикует в npm
#>

param(
    [switch]$Apply,
    [switch]$SkipBuild,
    [switch]$Publish,
    [string]$OutputDir = "dist-packages"
)

$ErrorActionPreference = "Stop"
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8

$ProjectRoot = Split-Path -Parent $PSScriptRoot
$BackupRoot = Join-Path $ProjectRoot "_bak"
$Timestamp = Get-Date -Format "MMddHHmm"
$BackupDir = Join-Path $BackupRoot "${Timestamp}_pack-npm"

function Write-ColoredHeader {
    param([string]$Text)
    Write-Host ""
    Write-Host ("=" * 70) -ForegroundColor Cyan
    Write-Host "  $Text" -ForegroundColor Cyan
    Write-Host ("=" * 70) -ForegroundColor Cyan
    Write-Host ""
}

function Write-Step {
    param([string]$Text)
    Write-Host "[INFO] $Text" -ForegroundColor Cyan
}

function Write-Success {
    param([string]$Text)
    Write-Host "[OK] $Text" -ForegroundColor Green
}

function Write-Warning {
    param([string]$Text)
    Write-Host "[WARN] $Text" -ForegroundColor Yellow
}

function Write-Error {
    param([string]$Text)
    Write-Host "[FAIL] $Text" -ForegroundColor Red
}

# Проверка режима
if (-not $Apply) {
    Write-ColoredHeader "DRY RUN MODE - Preview Only"
    Write-Warning "Для реальной упаковки используйте: -Apply"
} else {
    Write-ColoredHeader "NPM Package Build"
}

Push-Location $ProjectRoot

try {
    # Шаг 1: Проверка package.json
    Write-Step "Проверка package.json..."

    $PackageJson = Get-Content "package.json" -Raw -Encoding UTF8 | ConvertFrom-Json
    $PackageName = $PackageJson.name
    $PackageVersion = $PackageJson.version

    Write-Success "Пакет: $PackageName@$PackageVersion"

    # Шаг 2: Сборка с минификацией (BUILD_MODE=package)
    if (-not $SkipBuild) {
        Write-Step "Сборка с минификацией (BUILD_MODE=package)..."

        $env:BUILD_MODE = "package"
        # Run build - temporarily allow stderr output (tsup warnings)
        $ErrorActionPreference = "Continue"
        npm run build
        $BuildExitCode = $LASTEXITCODE
        $ErrorActionPreference = "Stop"
        $env:BUILD_MODE = $null

        if ($BuildExitCode -ne 0) {
            Write-Error "Сборка не удалась (exit code: $BuildExitCode)"
            exit 1
        }

        Write-Success "TypeScript собран в dist/ (минифицирован, без sourcemaps)"

        # Копирование WASM diff-simd (единственный используемый WASM модуль)
        # Примечание: ultrascript-tools.com копируется через tsup.config.ts
        # Примечание: vector-ops-simd НЕ используется (wasm-backend.ts импортирует из другого пути)
        Write-Step "Копирование WASM модулей..."

        $DiffSimdSrc = "external-tools/wasm/diff-simd/pkg"
        $DiffSimdDst = "dist/external-tools/wasm/diff-simd"

        if (Test-Path $DiffSimdSrc) {
            if (-not (Test-Path $DiffSimdDst)) {
                New-Item -ItemType Directory -Path $DiffSimdDst -Force | Out-Null
            }
            Copy-Item "$DiffSimdSrc/*" $DiffSimdDst -Recurse -Force
            Write-Host "  + $DiffSimdDst" -ForegroundColor Gray
            Write-Success "WASM diff-simd скопирован"
        } else {
            Write-Warning "WASM diff-simd не найден (optional)"
        }
    }

    # Шаг 3: Показать файлы, которые войдут в пакет
    Write-Step "Файлы, которые войдут в пакет..."

    $FilesSection = $PackageJson.files
    Write-Host ""
    Write-Host "Секция 'files' в package.json:" -ForegroundColor Yellow
    foreach ($Pattern in $FilesSection) {
        Write-Host "  + $Pattern" -ForegroundColor Gray
    }

    # Получить реальный список через npm pack --dry-run
    Write-Host ""
    Write-Host "Проверка реальных файлов (npm pack --dry-run):" -ForegroundColor Yellow

    $ErrorActionPreference = "Continue"
    $DryRunOutput = npm pack --dry-run --loglevel=error 2>&1 | Out-String
    $ErrorActionPreference = "Stop"

    # Check for real errors (ignore warnings)
    $HasRealError = ($DryRunOutput -split "`n") | Where-Object { $_ -match "npm ERR!" }
    if ($HasRealError) {
        Write-Host ""
        Write-Error "npm pack failed with errors:"
        Write-Host $DryRunOutput -ForegroundColor Red
        exit 1
    }

    $FileList = ($DryRunOutput -split "`n") | Where-Object { $_ -match "npm notice \d+\.\d+[kMG]?B" } | ForEach-Object {
        $_ -replace "npm notice \d+\.\d+[kMG]?B\s+", ""
    }

    $TotalSizeLine = ($DryRunOutput -split "`n") | Where-Object { $_ -match "unpacked size:" }
    if ($TotalSizeLine) {
        $TotalSize = ($TotalSizeLine -replace ".*unpacked size:\s+", "").Trim()
    } else {
        $TotalSize = "Unknown"
    }

    foreach ($File in $FileList) {
        if ($File -match "package\.json|index\.js|README") {
            Write-Host "  $File" -ForegroundColor Green
        } elseif ($File -match "\.wasm|\.node") {
            Write-Host "  $File" -ForegroundColor Magenta
        } else {
            Write-Host "  $File" -ForegroundColor Gray
        }
    }

    Write-Host ""
    Write-Success "Размер распакованного пакета: $TotalSize"

    # Шаг 4: Проверить .npmignore
    Write-Step "Проверка .npmignore..."

    if (Test-Path ".npmignore") {
        Write-Success "Найден .npmignore"
        $IgnoreLines = Get-Content ".npmignore" | Where-Object { $_ -and $_ -notmatch "^\s*#" }
        Write-Host "  Исключено паттернов: $($IgnoreLines.Count)" -ForegroundColor Gray
    } else {
        Write-Warning "Файл .npmignore не найден, используется .gitignore"
    }

    # Режим dry-run - остановиться здесь
    if (-not $Apply) {
        Write-Host ""
        Write-ColoredHeader "Preview Complete"
        Write-Host "Для реальной упаковки запустите:" -ForegroundColor Yellow
        Write-Host "  .\scripts\pack-npm.ps1 -Apply" -ForegroundColor White
        exit 0
    }

    # === РЕАЛЬНАЯ УПАКОВКА ===

    # Шаг 5: Создать backup
    Write-Step "Создание резервной копии..."

    if (-not (Test-Path $BackupRoot)) {
        New-Item -ItemType Directory -Path $BackupRoot | Out-Null
    }

    if (-not (Test-Path $BackupDir)) {
        New-Item -ItemType Directory -Path $BackupDir | Out-Null
    }

    # Бэкап package.json
    Copy-Item "package.json" (Join-Path $BackupDir "package.json") -Force

    Write-Success "Backup создан: $BackupDir"

    # Шаг 6: Создать выходную директорию
    Write-Step "Создание выходной директории..."

    $OutputPath = Join-Path $ProjectRoot $OutputDir
    if (-not (Test-Path $OutputPath)) {
        New-Item -ItemType Directory -Path $OutputPath | Out-Null
    }

    Write-Success "Выходная директория: $OutputDir"

    # Шаг 7: Запустить npm pack
    Write-Step "Упаковка пакета (npm pack)..."

    $PackOutput = npm pack --loglevel=error 2>&1
    $TarballName = ($PackOutput | Select-String "\.tgz").ToString().Trim()

    if (-not $TarballName) {
        Write-Error "Не удалось создать .tgz файл"
        Write-Host $PackOutput
        exit 1
    }

    Write-Success "Создан пакет: $TarballName"

    # Шаг 8: Переместить в выходную директорию
    if (Test-Path $TarballName) {
        $Destination = Join-Path $OutputPath $TarballName
        Move-Item $TarballName $Destination -Force
        Write-Success "Пакет перемещен: $OutputDir\$TarballName"

        # Показать размер файла
        $FileSize = (Get-Item $Destination).Length
        $FileSizeMB = [math]::Round($FileSize / 1MB, 2)
        Write-Host "  Размер: $FileSizeMB MB" -ForegroundColor Gray
    }

    # Шаг 9: Публикация (если указан -Publish)
    if ($Publish) {
        Write-Step "Публикация в npm..."

        # Проверить авторизацию
        $WhoAmI = npm whoami 2>&1
        if ($LASTEXITCODE -ne 0) {
            Write-Error "Не авторизован в npm. Выполните: npm login"
            Write-Host "  Или настройте токен в ~/.npmrc" -ForegroundColor Gray
            exit 1
        }

        Write-Host "  Публикация от имени: $WhoAmI" -ForegroundColor Gray

        # Публикация с legacy auth (без web-browser)
        $PublishOutput = npm publish $Destination --auth-type=legacy 2>&1

        if ($LASTEXITCODE -ne 0) {
            Write-Error "Ошибка публикации:"
            Write-Host $PublishOutput -ForegroundColor Red
            exit 1
        }

        Write-Success "Пакет опубликован: $PackageName@$PackageVersion"
        Write-Host "  https://www.npmjs.com/package/$PackageName" -ForegroundColor Cyan
    }

    # Шаг 10: Итоговая информация
    Write-Host ""
    Write-ColoredHeader "Package Build Complete"

    Write-Host "Пакет:" -ForegroundColor Cyan
    Write-Host "  Название: $PackageName" -ForegroundColor White
    Write-Host "  Версия:   $PackageVersion" -ForegroundColor White
    Write-Host "  Файл:     $OutputDir\$TarballName" -ForegroundColor White
    Write-Host ""

    Write-Host "Установка локально:" -ForegroundColor Yellow
    Write-Host "  npm install ./$OutputDir/$TarballName" -ForegroundColor White
    Write-Host ""

    if ($Publish) {
        Write-Host "Статус: ОПУБЛИКОВАН" -ForegroundColor Green
        Write-Host "  https://www.npmjs.com/package/$PackageName" -ForegroundColor Cyan
    } else {
        Write-Host "Публикация:" -ForegroundColor Yellow
        Write-Host "  npm publish ./$OutputDir/$TarballName --auth-type=legacy" -ForegroundColor White
        Write-Host "  или" -ForegroundColor Gray
        Write-Host "  .\scripts\pack-npm.ps1 -Apply -Publish" -ForegroundColor White
    }
    Write-Host ""

    Write-Host "Проверка содержимого:" -ForegroundColor Yellow
    Write-Host "  tar -tzf ./$OutputDir/$TarballName" -ForegroundColor White
    Write-Host ""

} catch {
    Write-Error "Ошибка при упаковке: $_"
    exit 1
} finally {
    Pop-Location
}

# Примечание: После pack-npm dist/ содержит минифицированную версию.
# Для восстановления dev-версии запустите: npm run build
