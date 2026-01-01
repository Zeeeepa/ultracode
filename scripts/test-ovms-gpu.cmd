@echo off
REM Test OVMS V2 API on GPU.1 (NVIDIA)

echo ============================================
echo   OVMS V2 GPU Test
echo ============================================
echo.

REM Setup OpenVINO environment
call "C:\opt\openvino\setupvars.bat"
if errorlevel 1 (
    echo [ERROR] Failed to setup OpenVINO environment
    pause
    exit /b 1
)

set "MODELS_DIR=%LOCALAPPDATA%\UltraScriptTools\models"
set "OVMS_DIR=%LOCALAPPDATA%\UltraScriptTools\ovms"

echo.
echo Starting OVMS on port 8084 with GPU.1 config...
echo Config: %MODELS_DIR%\config-gpu-test.json
echo.

REM Start OVMS
cd /d "%OVMS_DIR%"
start /b ovms.exe --rest_port 8084 --port 9002 --config_path "%MODELS_DIR%\config-gpu-test.json"

echo Waiting for OVMS to start...
timeout /t 10 /nobreak > nul

REM Check if model is ready
echo.
echo Checking model status...
curl -s http://127.0.0.1:8084/v2/models/e5-gpu/ready
if errorlevel 1 (
    echo.
    echo [WARN] Model may not be ready yet. Waiting more...
    timeout /t 10 /nobreak > nul
)

echo.
echo ============================================
echo   Running V2 inference test...
echo ============================================
echo.

REM Simple test with curl - send dummy tokenized input
REM input_ids: [101, 7592, 1010, 2088, 999, 102] = "Hello, world!"
REM attention_mask: [1, 1, 1, 1, 1, 1]

curl -s -X POST http://127.0.0.1:8084/v2/models/e5-gpu/infer ^
  -H "Content-Type: application/json" ^
  -d "{\"inputs\":[{\"name\":\"input_ids\",\"shape\":[1,6],\"datatype\":\"INT64\",\"data\":[101,7592,1010,2088,999,102]},{\"name\":\"attention_mask\",\"shape\":[1,6],\"datatype\":\"INT64\",\"data\":[1,1,1,1,1,1]}]}"

echo.
echo.
echo ============================================
echo   Test complete. Check output above.
echo ============================================
echo.
echo If you see "outputs" with shape - GPU encoder works!
echo If you see error - GPU not compatible with this model.
echo.
echo Press any key to stop OVMS and exit...
pause > nul

REM Kill OVMS
taskkill /f /im ovms.exe > nul 2>&1
