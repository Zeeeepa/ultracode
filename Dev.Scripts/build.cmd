@echo off
REM Build script for UltraScript Tools MCP Server
REM Compiles TypeScript to dist/ directory using tsup

echo ========================================
echo Building UltraScript Tools MCP Server...
echo ========================================
echo.

REM Check if node_modules exists
if not exist "node_modules\" (
    echo ERROR: node_modules not found!
    echo Please run: npm install
    echo.
    exit /b 1
)

REM Run TypeScript type checking first
echo [1/3] Running TypeScript type check...
call npm run typecheck
if errorlevel 1 (
    echo.
    echo ERROR: TypeScript type check failed!
    echo Please fix type errors before building.
    exit /b 1
)
echo Type check passed!
echo.

REM Run build
echo [2/3] Building with tsup...
call npm run build
if errorlevel 1 (
    echo.
    echo ERROR: Build failed!
    exit /b 1
)
echo Build completed successfully!
echo.

REM Show output
echo [3/3] Build artifacts:
echo.
if exist "dist\index.js" (
    echo ✓ dist\index.js
    for %%A in (dist\index.js) do echo   Size: %%~zA bytes
)
if exist "dist\index.js.map" (
    echo ✓ dist\index.js.map
)
if exist "dist\index.d.ts" (
    echo ✓ dist\index.d.ts
)
echo.

REM Count native modules
set /a NODE_COUNT=0
for %%f in (dist\*.node) do set /a NODE_COUNT+=1
if %NODE_COUNT% gtr 0 (
    echo ✓ %NODE_COUNT% native modules (.node files)
    echo.
)

echo ========================================
echo Build completed successfully!
echo ========================================
echo.
echo Output directory: dist\
echo Entry point: dist\index.js
echo.
echo To run the server:
echo   node dist\index.js [directory]
echo.
echo To create NPM package:
echo   make package
echo.

exit /b 0
