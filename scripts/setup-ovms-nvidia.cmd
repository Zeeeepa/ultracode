@echo off
setlocal EnableDelayedExpansion

REM ============================================
REM  OVMS Full Auto-Setup with NVIDIA + ToMe
REM  For Embeddings (sentence-transformers, E5, BGE)
REM ============================================
REM
REM Installs to: %LOCALAPPDATA%\UltraScriptTools\ovms\
REM ToMe ratio: 0.3 (optimal for embeddings)
REM

echo.
echo ============================================
echo   OVMS Auto-Setup for Embeddings
echo ============================================
echo   Target: %LOCALAPPDATA%\UltraScriptTools\ovms\
echo   ToMe: 0.3 (30%% merging, 1.5-2x speedup)
echo ============================================
echo.

set "INSTALL_DIR=%LOCALAPPDATA%\UltraScriptTools\ovms"
set "TEMP_BUILD=C:\opt"
set "TOME_RATIO=0.3"
set "OVMS_BRANCH=releases/2025/4"
set "VSWHERE=%ProgramFiles(x86)%\Microsoft Visual Studio\Installer\vswhere.exe"
set "PROGX86=%ProgramFiles(x86)%"

REM ============================================
REM  Step 1: Check prerequisites
REM ============================================
echo [1/7] Checking prerequisites...

where git >nul 2>&1
if %ERRORLEVEL% NEQ 0 (
    echo   [ERROR] Git not found. Install from: https://git-scm.com/download/win
    goto :error
)
echo   [OK] Git

where python >nul 2>&1
if %ERRORLEVEL% NEQ 0 (
    echo   [WARN] Python not found. ToMe tools will be skipped.
    set "SKIP_TOME=1"
) else (
    echo   [OK] Python
    set "SKIP_TOME=0"
)

REM Check Visual Studio - OVMS requires VS2019 toolset (v142)
if not exist "%VSWHERE%" (
    echo   [ERROR] Visual Studio not found.
    echo   OVMS build requires Visual Studio 2019 Build Tools.
    echo   Download from: https://visualstudio.microsoft.com/vs/older-downloads/
    echo.
    echo   Alternatively, use Docker:
    echo   docker run -d -p 8082:8082 openvino/model_server:latest
    goto :error
)

REM Find VS BuildTools 2022 specifically (has v142 toolset)
set "VS_PATH="
set "BUILDTOOLS_PATH="

REM First try to find BuildTools 2022 which has v142
for /f "usebackq tokens=*" %%i in (`"%VSWHERE%" -products Microsoft.VisualStudio.Product.BuildTools -version "[17.0,18.0)" -property installationPath 2^>nul`) do set "BUILDTOOLS_PATH=%%i"

if defined BUILDTOOLS_PATH (
    if exist "%BUILDTOOLS_PATH%\VC\Tools\MSVC\14.29*" (
        set "VS_PATH=%BUILDTOOLS_PATH%"
        echo   [OK] VS BuildTools 2022 with v142: %VS_PATH%
    )
)

REM Fallback to any VS
if not defined VS_PATH (
    for /f "usebackq tokens=*" %%i in (`"%VSWHERE%" -latest -products * -requires Microsoft.VisualStudio.Component.VC.Tools.x86.x64 -property installationPath`) do set "VS_PATH=%%i"
)

if not defined VS_PATH (
    echo   [ERROR] VS C++ Build Tools not found.
    goto :error
)
echo   [OK] Visual Studio: %VS_PATH%

REM Check for v142 toolset
set "MSVC142_PATH="
for /d %%d in ("%VS_PATH%\VC\Tools\MSVC\14.29*") do set "MSVC142_PATH=%%d"
if not defined MSVC142_PATH for /d %%d in ("%VS_PATH%\VC\Tools\MSVC\14.2*") do set "MSVC142_PATH=%%d"

if defined MSVC142_PATH (
    echo   [OK] v142 toolset: %MSVC142_PATH%
) else (
    echo   [WARN] v142 toolset not in %VS_PATH%
    REM Try BuildTools 2022 directly - use short path to avoid parentheses issues
    set "BT2022=C:\PROGRA~2\Microsoft Visual Studio\2022\BuildTools"
    if exist "!BT2022!\VC\Tools\MSVC\14.29*" (
        for /d %%d in ("!BT2022!\VC\Tools\MSVC\14.29*") do set "MSVC142_PATH=%%d"
        echo   [OK] Found v142 in BuildTools: !MSVC142_PATH!
    )
)

REM Find CUDA first (determines OpenVINO build strategy)
set "CUDA_DIR="
set "ENABLE_NVIDIA=0"
for /d %%d in ("%ProgramFiles%\NVIDIA GPU Computing Toolkit\CUDA\v*") do set "CUDA_DIR=%%d"
if defined CUDA_DIR (
    echo   [OK] CUDA: !CUDA_DIR!
    set "ENABLE_NVIDIA=1"
) else (
    echo   [--] CUDA not found - NVIDIA support disabled
)

REM Find cuDNN (required for NVIDIA plugin)
set "CUDNN_DIR="
set "CUDNN_LIB_DIR="
if not defined CUDA_DIR goto :cudnn_done

REM Extract CUDA version (e.g., "13.1" from "C:\...\CUDA\v13.1")
for %%d in ("%CUDA_DIR%") do set "CUDA_VERSION=%%~nxd"
set "CUDA_VERSION=!CUDA_VERSION:v=!"
echo   [INFO] CUDA version: !CUDA_VERSION!

REM Check standalone cuDNN installation first (Windows default)
for /d %%d in ("%ProgramFiles%\NVIDIA\CUDNN\v*") do set "CUDNN_DIR=%%d"
if defined CUDNN_DIR (
    REM cuDNN 9.x has version-specific lib/bin/include subdirectories
    if exist "!CUDNN_DIR!\lib\!CUDA_VERSION!\x64\cudnn.lib" (
        set "CUDNN_LIB_DIR=!CUDNN_DIR!\lib\!CUDA_VERSION!\x64"
        set "CUDNN_BIN_DIR=!CUDNN_DIR!\bin\!CUDA_VERSION!"
        set "CUDNN_INCLUDE_DIR=!CUDNN_DIR!\include\!CUDA_VERSION!"
        echo   [OK] cuDNN: !CUDNN_DIR! (lib/include for CUDA !CUDA_VERSION!)
        goto :cudnn_done
    ) else if exist "!CUDNN_DIR!\lib\x64\cudnn.lib" (
        set "CUDNN_LIB_DIR=!CUDNN_DIR!\lib\x64"
        set "CUDNN_BIN_DIR=!CUDNN_DIR!\bin"
        set "CUDNN_INCLUDE_DIR=!CUDNN_DIR!\include"
        echo   [OK] cuDNN: !CUDNN_DIR!
        goto :cudnn_done
    ) else (
        echo   [WARN] cuDNN found but no libs for CUDA !CUDA_VERSION!
        set "CUDNN_DIR="
    )
)
if exist "!CUDA_DIR!\include\cudnn.h" (
    REM Fallback: cuDNN integrated into CUDA directory
    set "CUDNN_DIR=!CUDA_DIR!"
    set "CUDNN_LIB_DIR=!CUDA_DIR!\lib\x64"
    set "CUDNN_BIN_DIR=!CUDA_DIR!\bin"
    echo   [OK] cuDNN: found in CUDA directory
    goto :cudnn_done
)
echo   [--] cuDNN not found - NVIDIA plugin will not be built
echo        Install via CUDA Toolkit installer or download from:
echo        https://developer.nvidia.com/cudnn
set "ENABLE_NVIDIA=0"
:cudnn_done

REM Copy cuDNN headers/libs to CUDA directory (required for NVIDIA plugin)
REM Plugin expects cudnn.h in CUDA_TOOLKIT_ROOT_DIR/include and libs in lib/x64
if defined CUDNN_INCLUDE_DIR (
    if not exist "!CUDA_DIR!\include\cudnn.h" (
        echo   Copying cuDNN headers to CUDA include directory...
        copy /Y "!CUDNN_INCLUDE_DIR!\cudnn*.h" "!CUDA_DIR!\include\" >nul 2>&1
        if exist "!CUDA_DIR!\include\cudnn.h" (
            echo   [OK] cuDNN headers copied
        ) else (
            echo   [WARN] Failed to copy cuDNN headers
        )
    ) else (
        echo   [OK] cuDNN headers already in CUDA include
    )
    REM cuDNN 9.x compatibility shims for plugins expecting cuDNN 8.x API
    REM cuDNN 9.x merged separate infer/train headers into single files
    if not exist "!CUDA_DIR!\include\cudnn_ops_infer.h" (
        echo   Creating cuDNN 9.x compatibility headers...
        copy /Y "!CUDA_DIR!\include\cudnn_ops.h" "!CUDA_DIR!\include\cudnn_ops_infer.h" >nul 2>&1
        copy /Y "!CUDA_DIR!\include\cudnn_ops.h" "!CUDA_DIR!\include\cudnn_ops_train.h" >nul 2>&1
        copy /Y "!CUDA_DIR!\include\cudnn_cnn.h" "!CUDA_DIR!\include\cudnn_cnn_infer.h" >nul 2>&1
        copy /Y "!CUDA_DIR!\include\cudnn_cnn.h" "!CUDA_DIR!\include\cudnn_cnn_train.h" >nul 2>&1
        copy /Y "!CUDA_DIR!\include\cudnn_adv.h" "!CUDA_DIR!\include\cudnn_adv_infer.h" >nul 2>&1
        copy /Y "!CUDA_DIR!\include\cudnn_adv.h" "!CUDA_DIR!\include\cudnn_adv_train.h" >nul 2>&1
        echo   [OK] cuDNN 9.x compatibility headers created
    )
)
if defined CUDNN_LIB_DIR (
    if not exist "!CUDA_DIR!\lib\x64\cudnn.lib" (
        echo   Copying cuDNN libs to CUDA lib directory...
        copy /Y "!CUDNN_LIB_DIR!\cudnn*.lib" "!CUDA_DIR!\lib\x64\" >nul 2>&1
        if exist "!CUDA_DIR!\lib\x64\cudnn.lib" (
            echo   [OK] cuDNN libs copied
        ) else (
            echo   [WARN] Failed to copy cuDNN libs
        )
    ) else (
        echo   [OK] cuDNN libs already in CUDA lib
    )
)

REM Find cuTENSOR (optional but recommended for NVIDIA plugin)
set "CUTENSOR_DIR="
set "CUTENSOR_LIB_DIR="
if not defined CUDA_DIR goto :cutensor_done

REM Extract CUDA major version (e.g., "13" from "13.1")
for /f "tokens=1 delims=." %%a in ("!CUDA_VERSION!") do set "CUDA_MAJOR=%%a"

REM Check standalone cuTENSOR installation (Windows default: "NVIDIA cuTENSOR" with space)
for /d %%d in ("%ProgramFiles%\NVIDIA cuTENSOR\v*") do set "CUTENSOR_DIR=%%d"
if defined CUTENSOR_DIR (
    REM cuTENSOR uses major CUDA version subdirectories
    if exist "!CUTENSOR_DIR!\lib\!CUDA_MAJOR!\cutensor.lib" (
        set "CUTENSOR_LIB_DIR=!CUTENSOR_DIR!\lib\!CUDA_MAJOR!"
        set "CUTENSOR_BIN_DIR=!CUTENSOR_DIR!\bin\!CUDA_MAJOR!"
        echo   [OK] cuTENSOR: !CUTENSOR_DIR! (lib for CUDA !CUDA_MAJOR!)
        goto :cutensor_done
    ) else (
        echo   [WARN] cuTENSOR found but no libs for CUDA !CUDA_MAJOR!
        set "CUTENSOR_DIR="
    )
)
REM Try without space
for /d %%d in ("%ProgramFiles%\NVIDIA\cuTENSOR\v*") do set "CUTENSOR_DIR=%%d"
if defined CUTENSOR_DIR (
    if exist "!CUTENSOR_DIR!\lib\!CUDA_MAJOR!\cutensor.lib" (
        set "CUTENSOR_LIB_DIR=!CUTENSOR_DIR!\lib\!CUDA_MAJOR!"
        set "CUTENSOR_BIN_DIR=!CUTENSOR_DIR!\bin\!CUDA_MAJOR!"
        echo   [OK] cuTENSOR: !CUTENSOR_DIR! (lib for CUDA !CUDA_MAJOR!)
        goto :cutensor_done
    )
)
if exist "!CUDA_DIR!\include\cutensor.h" (
    set "CUTENSOR_DIR=!CUDA_DIR!"
    set "CUTENSOR_LIB_DIR=!CUDA_DIR!\lib\x64"
    set "CUTENSOR_BIN_DIR=!CUDA_DIR!\bin"
    echo   [OK] cuTENSOR: found in CUDA directory
    goto :cutensor_done
)
echo   [--] cuTENSOR not found (optional, plugin will still work)
:cutensor_done

REM Copy cuTENSOR 2.x compatibility header and includes to CUDA directory
if defined CUTENSOR_DIR (
    REM Copy cuTENSOR 2.x compatibility header for plugins expecting 1.x API (always overwrite)
    echo   Copying cuTENSOR 2.x compatibility header...
    copy /Y "%~dp0cutensor_compat.h" "!CUDA_DIR!\include\" >nul 2>&1
    if exist "!CUDA_DIR!\include\cutensor_compat.h" (
        echo   [OK] cuTENSOR compat header copied
    )
    REM Copy cuTENSOR headers if not in CUDA include
    if not exist "!CUDA_DIR!\include\cutensor.h" (
        echo   Copying cuTENSOR headers to CUDA include directory...
        copy /Y "!CUTENSOR_DIR!\include\cutensor*.h" "!CUDA_DIR!\include\" >nul 2>&1
        if exist "!CUDA_DIR!\include\cutensor.h" (
            echo   [OK] cuTENSOR headers copied
        )
    )
    REM Copy cuTENSOR libs if not in CUDA lib
    if not exist "!CUDA_DIR!\lib\x64\cutensor.lib" (
        if defined CUTENSOR_LIB_DIR (
            echo   Copying cuTENSOR libs to CUDA lib directory...
            copy /Y "!CUTENSOR_LIB_DIR!\cutensor*.lib" "!CUDA_DIR!\lib\x64\" >nul 2>&1
            if exist "!CUDA_DIR!\lib\x64\cutensor.lib" (
                echo   [OK] cuTENSOR libs copied
            )
        )
    )
)

REM Find or Build OpenVINO
set "OV_DIR="
set "OV_INSTALL_DIR=%LOCALAPPDATA%\UltraScriptTools\openvino"
set "OV_BUILD_DIR=%TEMP_BUILD%\openvino_build"
set "OV_SOURCE_DIR=%TEMP_BUILD%\openvino_src"

REM Check existing OpenVINO installations
for %%p in (
    "%OV_INSTALL_DIR%\runtime\cmake"
    "%TEMP_BUILD%\openvino_build\runtime\cmake"
    "%USERPROFILE%\intel\openvino_2025\runtime\cmake"
    "%LOCALAPPDATA%\Intel\openvino_2025\runtime\cmake"
    "C:\Intel\openvino_2025\runtime\cmake"
) do (
    if exist "%%~p" set "OV_DIR=%%~p"
)

REM If NVIDIA enabled, need to build OpenVINO from source for DeveloperPackage
if "%ENABLE_NVIDIA%"=="1" (
    REM Check if we have a source build with DeveloperPackage
    if exist "%OV_BUILD_DIR%\OpenVINODeveloperPackageConfig.cmake" (
        set "OV_DIR=%OV_BUILD_DIR%"
        set "OV_DEVELOPER_DIR=%OV_BUILD_DIR%"
        echo   [OK] OpenVINO source build found: !OV_DIR!
    ) else (
        echo.
        echo   NVIDIA support requires building OpenVINO from source...
        call :build_openvino_from_source
        if !ERRORLEVEL! NEQ 0 (
            echo   [ERROR] OpenVINO build failed
            set "ENABLE_NVIDIA=0"
            goto :try_prebuilt_openvino
        )
        set "OV_DIR=%OV_BUILD_DIR%"
        set "OV_DEVELOPER_DIR=%OV_BUILD_DIR%"
    )
    goto :openvino_done
)

:try_prebuilt_openvino
REM No NVIDIA or build failed - use prebuilt OpenVINO
if not defined OV_DIR call :download_openvino

:openvino_done
if not exist "%OV_DIR%" (
    echo   [ERROR] OpenVINO cmake not found at: %OV_DIR%
    goto :error
)
echo   [OK] OpenVINO: %OV_DIR%

REM ============================================
REM  Step 2: Clone OVMS
REM ============================================
echo.
echo [2/7] Preparing OVMS source...

set "REPO_DIR=%TEMP_BUILD%\model_server"
if not exist "%REPO_DIR%" (
    echo   Cloning OVMS repository...
    if not exist "%TEMP_BUILD%" mkdir "%TEMP_BUILD%"
    git clone --depth 1 --branch %OVMS_BRANCH% https://github.com/openvinotoolkit/model_server.git "%REPO_DIR%"
)
if not exist "%REPO_DIR%\windows_build.bat" (
    echo   [ERROR] OVMS repository incomplete - windows_build.bat not found
    goto :error
)
echo   [OK] OVMS source: %REPO_DIR%

REM Patch OVMS scripts to fix parentheses issues in paths
echo   Patching OVMS scripts for Windows compatibility...
powershell -NoProfile -Command "(Get-Content '%REPO_DIR%\windows_install_build_dependencies.bat') -replace 'C:\\Program Files \(x86\)', 'C:\PROGRA~2' | Set-Content '%REPO_DIR%\windows_install_build_dependencies.bat'"
powershell -NoProfile -Command "(Get-Content '%REPO_DIR%\windows_build.bat') -replace 'C:\\Program Files \(x86\)', 'C:\PROGRA~2' | Set-Content '%REPO_DIR%\windows_build.bat'"
echo   [OK] OVMS scripts patched

REM ============================================
REM  Step 3: Install OVMS build dependencies
REM ============================================
echo.
echo [3/7] Installing OVMS build dependencies...

REM OVMS 2025.4 requires Python 3.12
if exist "C:\opt\Python312\python.exe" goto :deps_ok

echo   Installing dependencies (Python 3.12, OpenCV, BoringSSL, Bazel)...
echo   This may take 10-20 minutes on first run...

pushd "%REPO_DIR%"
call windows_install_build_dependencies.bat
set "DEP_RESULT=%ERRORLEVEL%"
popd

:deps_ok
REM Fix Python path case - create junction if lowercase exists
if not exist "C:\opt\Python312" (
    if exist "C:\opt\python312\python.exe" (
        echo   Creating junction Python312 -^> python312...
        mklink /J "C:\opt\Python312" "C:\opt\python312"
    )
)

if not exist "C:\opt\Python312\python.exe" (
    echo   [ERROR] Python 3.12 not found at C:\opt\Python312\python.exe
    echo   Run the OVMS dependency installer manually or install Python 3.12
    goto :error
)
echo   [OK] Python 3.12: C:\opt\Python312\python.exe

REM Check OpenCV
if not exist "C:\opt\opencv" (
    echo   [WARN] OpenCV not found, installing...
    pushd "%REPO_DIR%"
    if exist "opencv\install_opencv.bat" (
        call opencv\install_opencv.bat
    ) else (
        echo   Downloading OpenCV 4.10.0...
        powershell -Command "Invoke-WebRequest -Uri 'https://github.com/opencv/opencv/releases/download/4.10.0/opencv-4.10.0-windows.exe' -OutFile 'C:\opt\opencv-4.10.0-windows.exe'"
        if exist "C:\opt\opencv-4.10.0-windows.exe" (
            echo   Extracting OpenCV...
            "C:\opt\opencv-4.10.0-windows.exe" -o"C:\opt" -y
            if exist "C:\opt\opencv" echo   [OK] OpenCV installed
        )
    )
    popd
)

if not exist "C:\opt\opencv" (
    echo   [ERROR] OpenCV not found at C:\opt\opencv
    goto :error
)

REM Fix OpenCV structure - OVMS expects files in opencv\ not opencv\build\
if not exist "C:\opt\opencv\setup_vars_opencv4.cmd" (
    if exist "C:\opt\opencv\build\setup_vars_opencv4.cmd" (
        echo   Fixing OpenCV structure...
        copy "C:\opt\opencv\build\setup_vars_opencv4.cmd" "C:\opt\opencv\" >nul
        copy "C:\opt\opencv\build\OpenCVConfig.cmake" "C:\opt\opencv\" >nul 2>nul
        REM Create junction for x64 folder
        if not exist "C:\opt\opencv\x64" (
            if exist "C:\opt\opencv\build\x64" mklink /J "C:\opt\opencv\x64" "C:\opt\opencv\build\x64"
        )
        REM Create junction for include folder
        if not exist "C:\opt\opencv\include" (
            if exist "C:\opt\opencv\build\include" mklink /J "C:\opt\opencv\include" "C:\opt\opencv\build\include"
        )
        echo   [OK] OpenCV structure fixed
    )
)
echo   [OK] OpenCV: C:\opt\opencv

REM Create libcurl import library for MSVC (required for libgit2 linking)
set "CURL_DEF=C:\opt\curl-8.14.1_1-win64-mingw\bin\libcurl-x64.def"
set "CURL_LIB=C:\opt\curl-8.14.1_1-win64-mingw\bin\libcurl-x64.lib"
if exist "%CURL_LIB%" (
    echo   [OK] libcurl-x64.lib exists
    goto :curl_done
)
if not exist "%CURL_DEF%" goto :curl_done
echo   Creating libcurl-x64.lib from .def file...
set "LIB_EXE="
for /d %%F in ("C:\PROGRA~2\Microsoft Visual Studio\2022\BuildTools\VC\Tools\MSVC\*") do set "LIB_EXE=%%F\bin\HostX64\x64\lib.exe"
if not defined LIB_EXE for /d %%F in ("C:\PROGRA~1\Microsoft Visual Studio\*\*\VC\Tools\MSVC\*") do set "LIB_EXE=%%F\bin\HostX64\x64\lib.exe"
if not defined LIB_EXE (
    echo   [WARN] lib.exe not found, libcurl-x64.lib not created
    goto :curl_done
)
"!LIB_EXE!" /def:"%CURL_DEF%" /out:"%CURL_LIB%" /machine:x64 >nul 2>&1
if exist "%CURL_LIB%" (
    echo   [OK] libcurl-x64.lib created
) else (
    echo   [WARN] Failed to create libcurl-x64.lib
)
:curl_done

REM ============================================
REM  Step 4: Build openvino_tokenizers
REM ============================================
echo.
echo [4/7] Building openvino_tokenizers extension...

set "TOKENIZERS_REPO=%TEMP_BUILD%\openvino_tokenizers"
set "TOKENIZERS_BUILD=!TOKENIZERS_REPO!\build"

REM Clone if not exists - use exact OpenVINO version tag
if exist "%TOKENIZERS_REPO%\CMakeLists.txt" goto :tokenizers_clone_ok
echo   Cloning openvino_tokenizers repository (tag 2025.4.0.0)...
git clone --depth 1 --branch 2025.4.0.0 https://github.com/openvinotoolkit/openvino_tokenizers.git "%TOKENIZERS_REPO%"
if not exist "%TOKENIZERS_REPO%\CMakeLists.txt" (
    echo   [ERROR] openvino_tokenizers clone failed
    goto :error
)
:tokenizers_clone_ok
echo   [OK] openvino_tokenizers source: %TOKENIZERS_REPO%

REM Check if already built
if exist "%TOKENIZERS_BUILD%\src\Release\openvino_tokenizers.dll" (
    echo   [OK] openvino_tokenizers already built
    goto :tokenizers_copy
)

REM Build tokenizers
echo   Building openvino_tokenizers (5-10 minutes)...

if not exist "%TOKENIZERS_BUILD%" mkdir "%TOKENIZERS_BUILD%"
pushd "%TOKENIZERS_BUILD%"

REM Set OpenVINO environment
set "OV_ROOT_DIR=%OV_DIR%\..\.."
if exist "!OV_ROOT_DIR!\setupvars.bat" call "!OV_ROOT_DIR!\setupvars.bat"

REM Configure with CMake - use VS2022 generator
cmake -G "Visual Studio 17 2022" -A x64 -DOpenVINO_DIR="%OV_DIR%" -DCMAKE_BUILD_TYPE=Release ..
if !ERRORLEVEL! NEQ 0 (
    echo   [ERROR] CMake configuration failed
    popd
    goto :tokenizers_copy
)

REM Build
cmake --build . --config Release --parallel
set "TOK_BUILD_RESULT=!ERRORLEVEL!"
popd

if "!TOK_BUILD_RESULT!" NEQ "0" (
    echo   [WARN] openvino_tokenizers build failed, /v3/embeddings may not work
    echo   You can still use /v2/models/embeddings/infer API
) else (
    echo   [OK] openvino_tokenizers built successfully
)

:tokenizers_copy
REM Copy tokenizers DLL to OpenVINO runtime folder
if not exist "%TOKENIZERS_BUILD%\src\Release\openvino_tokenizers.dll" goto :tokenizers_done

REM Find OpenVINO bin directory
set "OV_BIN_DIR=%OV_DIR%\..\..\runtime\bin\intel64\Release"
if not exist "!OV_BIN_DIR!" set "OV_BIN_DIR=%OV_DIR%\..\bin\intel64\Release"
if not exist "!OV_BIN_DIR!" set "OV_BIN_DIR=%OV_DIR%\..\..\bin\intel64\Release"

if exist "!OV_BIN_DIR!" (
    echo   Copying openvino_tokenizers.dll to OpenVINO runtime...
    copy /Y "%TOKENIZERS_BUILD%\src\Release\openvino_tokenizers.dll" "!OV_BIN_DIR!\" >nul
    echo   [OK] openvino_tokenizers.dll installed to !OV_BIN_DIR!
) else (
    echo   [WARN] OpenVINO bin directory not found, will copy to OVMS folder later
)

:tokenizers_done

REM ============================================
REM  Step 4.5: Build OpenVINO NVIDIA Plugin
REM ============================================
if "%ENABLE_NVIDIA%"=="0" goto :nvidia_plugin_done

echo.
echo [4.5/7] Building OpenVINO NVIDIA GPU Plugin...

set "OV_CONTRIB_DIR=%TEMP_BUILD%\openvino_contrib"
set "NVIDIA_PLUGIN_BUILD=%TEMP_BUILD%\nvidia_plugin_build"

REM Clone openvino_contrib if not exists
if not exist "%OV_CONTRIB_DIR%" (
    echo   Cloning openvino_contrib repository...
    git clone --depth 1 --branch master https://github.com/openvinotoolkit/openvino_contrib.git "%OV_CONTRIB_DIR%"
    if !ERRORLEVEL! NEQ 0 (
        echo   [ERROR] Failed to clone openvino_contrib
        set "ENABLE_NVIDIA=0"
        goto :nvidia_plugin_done
    )
)

REM Patch NVIDIA plugin for CUDA 13.x compatibility on Windows
echo   Applying CUDA 13.x compatibility patches...

REM Patch 1: soft_sign.cu - __device__ constexpr variable template fix
set "SOFT_SIGN_FILE=%OV_CONTRIB_DIR%\modules\nvidia_plugin\src\kernels\soft_sign.cu"
if exist "%SOFT_SIGN_FILE%" (
    powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0patch-cuda13.ps1" "%SOFT_SIGN_FILE%"
)

REM Patch 2: graph.cpp - cudaStreamUpdateCaptureDependencies signature change
set "GRAPH_CPP_FILE=%OV_CONTRIB_DIR%\modules\nvidia_plugin\src\cuda\graph.cpp"
if exist "%GRAPH_CPP_FILE%" (
    powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0patch-cuda13.ps1" "%GRAPH_CPP_FILE%"
)

REM Patch 3: graph.hpp - cudaStreamUpdateCaptureDependencies signature change (template)
set "GRAPH_HPP_FILE=%OV_CONTRIB_DIR%\modules\nvidia_plugin\src\cuda\graph.hpp"
if exist "%GRAPH_HPP_FILE%" (
    powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0patch-cuda13.ps1" "%GRAPH_HPP_FILE%"
)

REM Patch 4: tensor.hpp - cuTENSOR 2.x API compatibility
set "TENSOR_HPP_FILE=%OV_CONTRIB_DIR%\modules\nvidia_plugin\src\cuda\tensor.hpp"
if exist "%TENSOR_HPP_FILE%" (
    powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0patch-cuda13.ps1" "%TENSOR_HPP_FILE%"
)

REM Check if plugin module exists
if not exist "%OV_CONTRIB_DIR%\modules\nvidia_plugin" (
    echo   [ERROR] nvidia_plugin module not found in openvino_contrib
    set "ENABLE_NVIDIA=0"
    goto :nvidia_plugin_done
)

REM Create build directory
if not exist "%NVIDIA_PLUGIN_BUILD%" mkdir "%NVIDIA_PLUGIN_BUILD%"

echo   Configuring NVIDIA plugin build...

REM Setup Visual Studio environment
set "VCVARS=%VS_PATH%\VC\Auxiliary\Build\vcvars64.bat"
if exist "!VCVARS!" call "!VCVARS!" >nul 2>&1

pushd "%NVIDIA_PLUGIN_BUILD%"

REM Set CUDA/cuDNN/cuTENSOR environment
set "PATH=%CUDA_DIR%\bin;%PATH%"
if defined CUDNN_BIN_DIR set "PATH=!CUDNN_BIN_DIR!;!PATH!"
if defined CUTENSOR_BIN_DIR set "PATH=!CUTENSOR_BIN_DIR!;!PATH!"
set "CUDA_PATH=%CUDA_DIR%"
set "CUDACXX=%CUDA_DIR%\bin\nvcc.exe"

REM Convert paths to CMake format (forward slashes)
set "OV_BUILD_DIR_CMAKE=%OV_BUILD_DIR:\=/%"
set "CUDA_DIR_CMAKE=%CUDA_DIR:\=/%"
set "CUDNN_DIR_CMAKE=%CUDNN_DIR:\=/%"
set "CUDNN_LIB_DIR_CMAKE=%CUDNN_LIB_DIR:\=/%"
set "CUDNN_INCLUDE_DIR_CMAKE=%CUDNN_INCLUDE_DIR:\=/%"
set "OV_CONTRIB_DIR_CMAKE=%OV_CONTRIB_DIR:\=/%"

REM Build library/include paths (combine cuDNN and cuTENSOR dirs)
set "CMAKE_LIB_PATH=!CUDNN_LIB_DIR_CMAKE!"
set "CMAKE_INCLUDE_PATH=!CUDNN_INCLUDE_DIR_CMAKE!"
if defined CUTENSOR_LIB_DIR (
    set "CUTENSOR_LIB_DIR_CMAKE=!CUTENSOR_LIB_DIR:\=/!"
    set "CMAKE_LIB_PATH=!CMAKE_LIB_PATH!;!CUTENSOR_LIB_DIR_CMAKE!"
)

REM Configure with CMake - use OpenVINODeveloperPackage from source build
REM Note: CMAKE_LIBRARY_PATH and CMAKE_INCLUDE_PATH needed for cuDNN 9.x version-specific subdirectories
REM Note: CMAKE_CUDA_ARCHITECTURES limited to 75+ for CUDA 13.x compatibility (older archs removed)
REM Architectures: 75=Turing, 80=Ampere, 86=GA102, 89=Ada, 90=Hopper, 100=Thor, 120=Blackwell(RTX50)
cmake -G "Visual Studio 17 2022" -A x64 ^
    "-DOpenVINODeveloperPackage_DIR=%OV_BUILD_DIR_CMAKE%" ^
    "-DCUDA_TOOLKIT_ROOT_DIR=%CUDA_DIR_CMAKE%" ^
    "-DCUDNN_ROOT_DIR=%CUDNN_DIR_CMAKE%" ^
    "-DCMAKE_LIBRARY_PATH=%CMAKE_LIB_PATH%" ^
    "-DCMAKE_INCLUDE_PATH=%CMAKE_INCLUDE_PATH%" ^
    "-DCMAKE_CUDA_ARCHITECTURES=75;80;86;89;90;100;120" ^
    -DCMAKE_BUILD_TYPE=Release ^
    "%OV_CONTRIB_DIR_CMAKE%/modules/nvidia_plugin"

if !ERRORLEVEL! NEQ 0 (
    echo   [ERROR] CMake configuration failed for NVIDIA plugin
    popd
    set "ENABLE_NVIDIA=0"
    goto :nvidia_plugin_done
)

REM Build
echo   Building NVIDIA plugin (this may take 10-30 minutes)...
cmake --build . --config Release --parallel
set "NVIDIA_BUILD_RESULT=!ERRORLEVEL!"
popd

REM Check if DLL was created regardless of build exit code
REM (build may return non-zero for warnings/tests but still produce the DLL)
set "NVIDIA_PLUGIN_DLL="
if exist "%NVIDIA_PLUGIN_BUILD%\Release\openvino_nvidia_gpu_plugin.dll" (
    set "NVIDIA_PLUGIN_DLL=%NVIDIA_PLUGIN_BUILD%\Release\openvino_nvidia_gpu_plugin.dll"
) else if exist "%NVIDIA_PLUGIN_BUILD%\src\Release\openvino_nvidia_gpu_plugin.dll" (
    set "NVIDIA_PLUGIN_DLL=%NVIDIA_PLUGIN_BUILD%\src\Release\openvino_nvidia_gpu_plugin.dll"
) else if exist "%NVIDIA_PLUGIN_BUILD%\openvino_nvidia_gpu_plugin.dll" (
    set "NVIDIA_PLUGIN_DLL=%NVIDIA_PLUGIN_BUILD%\openvino_nvidia_gpu_plugin.dll"
)

if not defined NVIDIA_PLUGIN_DLL (
    echo   [WARN] NVIDIA plugin build failed - DLL not found
    echo        Build exit code: !NVIDIA_BUILD_RESULT!
    echo        Searched: %NVIDIA_PLUGIN_BUILD%\Release\
    echo                  %NVIDIA_PLUGIN_BUILD%\src\Release\
    set "ENABLE_NVIDIA=0"
    goto :nvidia_plugin_done
)

echo   [OK] NVIDIA plugin built successfully: !NVIDIA_PLUGIN_DLL!

REM Find OpenVINO plugins directory
set "OV_PLUGINS_DIR=%OV_DIR%\..\..\runtime\bin\intel64\Release"
if not exist "!OV_PLUGINS_DIR!" set "OV_PLUGINS_DIR=%OV_DIR%\..\bin\intel64\Release"

if exist "!OV_PLUGINS_DIR!" (
    echo   Installing NVIDIA plugin to OpenVINO...
    copy /Y "!NVIDIA_PLUGIN_DLL!" "!OV_PLUGINS_DIR!\" >nul

    REM Copy cuDNN DLLs (required at runtime)
    if defined CUDNN_BIN_DIR (
        echo   Copying cuDNN DLLs...
        copy /Y "!CUDNN_BIN_DIR!\cudnn*.dll" "!OV_PLUGINS_DIR!\" >nul 2>&1
    )

    REM Copy cuTENSOR DLLs (optional, for better performance)
    if defined CUTENSOR_BIN_DIR (
        echo   Copying cuTENSOR DLLs...
        copy /Y "!CUTENSOR_BIN_DIR!\cutensor*.dll" "!OV_PLUGINS_DIR!\" >nul 2>&1
    )

    REM Register the NVIDIA plugin in plugins.xml
    set "PLUGINS_XML=!OV_PLUGINS_DIR!\plugins.xml"
    if exist "!PLUGINS_XML!" (
        REM Check if NVIDIA_GPU already registered
        findstr /C:"NVIDIA_GPU" "!PLUGINS_XML!" >nul 2>&1
        if !ERRORLEVEL! NEQ 0 (
            echo   Registering NVIDIA_GPU plugin in existing plugins.xml...
            powershell -Command "(Get-Content '!PLUGINS_XML!') -replace '</plugins>', '        <plugin name=\"NVIDIA_GPU\" location=\"openvino_nvidia_gpu_plugin.dll\"></plugin>`n    </plugins>' | Set-Content '!PLUGINS_XML!'"
        )
    ) else (
        REM Create plugins.xml with all standard plugins + NVIDIA
        echo   Creating plugins.xml with NVIDIA_GPU registration...
        (
            echo ^<ie^>
            echo     ^<plugins^>
            echo         ^<plugin name="CPU" location="openvino_intel_cpu_plugin.dll"^>^</plugin^>
            echo         ^<plugin name="GPU" location="openvino_intel_gpu_plugin.dll"^>^</plugin^>
            echo         ^<plugin name="NPU" location="openvino_intel_npu_plugin.dll"^>^</plugin^>
            echo         ^<plugin name="HETERO" location="openvino_hetero_plugin.dll"^>^</plugin^>
            echo         ^<plugin name="AUTO" location="openvino_auto_plugin.dll"^>^</plugin^>
            echo         ^<plugin name="BATCH" location="openvino_auto_batch_plugin.dll"^>^</plugin^>
            echo         ^<plugin name="NVIDIA_GPU" location="openvino_nvidia_gpu_plugin.dll"^>^</plugin^>
            echo     ^</plugins^>
            echo ^</ie^>
        ) > "!PLUGINS_XML!"
    )
    echo   [OK] NVIDIA plugin installed to !OV_PLUGINS_DIR!
) else (
    echo   [WARN] OpenVINO plugins directory not found
)

:nvidia_plugin_done

REM ============================================
REM  Step 5: Build OVMS
REM ============================================
echo.
echo [5/7] Building OVMS (this takes 15-45 minutes)...

set "VCVARS=%VS_PATH%\VC\Auxiliary\Build\vcvars64.bat"

pushd "%REPO_DIR%"

REM Use BuildTools 2022 vcvars if we found v142 there
if defined MSVC142_PATH (
    set "VCVARS_DIR=%MSVC142_PATH%\..\..\..\..\Auxiliary\Build"
    if exist "!VCVARS_DIR!\vcvars64.bat" set "VCVARS=!VCVARS_DIR!\vcvars64.bat"
)

REM Set environment via vcvars
echo   Using vcvars: %VCVARS%
call "%VCVARS%"

REM Set Bazel toolchain to BuildTools 2022 with v142
REM Use short path to avoid parentheses issues
set "BT2022_VC=C:\PROGRA~2\Microsoft Visual Studio\2022\BuildTools\VC"
set "BT2022_MSVC=C:\PROGRA~2\Microsoft Visual Studio\2022\BuildTools\VC\Tools\MSVC\14.29.30133"

if not exist "%BT2022_MSVC%\include" (
    echo   [ERROR] BuildTools 2022 v142 not found
    echo   Install VS 2022 Build Tools with MSVC v142 component
    goto :error
)

set "BAZEL_VC=%BT2022_VC%"
set "BAZEL_VC_FULL_VERSION=14.29.30133"
set "INCLUDE=%BT2022_MSVC%\include;%INCLUDE%"

echo   [OK] BAZEL_VC=%BT2022_VC%
echo   [OK] BAZEL_VC_FULL_VERSION=14.29.30133
echo   [OK] INCLUDE updated

REM Patch .bazelrc - add INCLUDE
echo   Patching .bazelrc...
echo build --action_env=INCLUDE >> "%REPO_DIR%\.bazelrc"

REM Keep MediaPipe ENABLED (MEDIAPIPE_DISABLE=0) for /v3/embeddings API support
REM This requires OpenCV contrib to be available
echo   [OK] MediaPipe enabled (required for /v3/embeddings API)

REM Set OpenVINO path
set "OV_ROOT=%OV_DIR%\..\.."
if exist "%OV_ROOT%\setupvars.bat" call "%OV_ROOT%\setupvars.bat"

echo.

REM Clean Bazel cache to force re-detection of toolchain
echo   Cleaning Bazel cache to re-detect toolchain...
bazel clean --expunge 2>nul

REM Build with Windows script
echo   Running windows_build.bat...
call windows_build.bat
set "BUILD_RESULT=%ERRORLEVEL%"

popd

if %BUILD_RESULT% NEQ 0 (
    echo   [ERROR] Build failed with exit code %BUILD_RESULT%
    goto :error
)
echo   [OK] Build complete

REM ============================================
REM  Step 6: Install binaries
REM ============================================
echo.
echo [6/7] Installing to %INSTALL_DIR%...

if not exist "%INSTALL_DIR%" mkdir "%INSTALL_DIR%"

REM Find built OVMS in bazel-bin/src/ovms folder (contains exe + all dlls)
set "OVMS_BUILD_DIR=%REPO_DIR%\bazel-bin\src\ovms"

if exist "%OVMS_BUILD_DIR%\ovms.exe" (
    echo   Found OVMS build at: %OVMS_BUILD_DIR%
    echo   Copying all files...
    xcopy /E /I /Y "%OVMS_BUILD_DIR%\*" "%INSTALL_DIR%\" >nul
    echo   [OK] Binaries installed
) else (
    REM Fallback - search for ovms.exe
    echo   Searching for ovms.exe...
    set "FOUND_OVMS="
    for /r "%REPO_DIR%\bazel-bin" %%f in (ovms.exe) do (
        if exist "%%f" (
            set "FOUND_OVMS=%%~dpf"
            echo   Found at: %%~dpf
        )
    )
    if defined FOUND_OVMS (
        echo   Copying from !FOUND_OVMS!...
        xcopy /E /I /Y "!FOUND_OVMS!*" "%INSTALL_DIR%\" >nul
        echo   [OK] Binaries installed
    ) else (
        echo   [ERROR] ovms.exe not found in build output
        goto :error
    )
)

REM Copy openvino_tokenizers.dll to OVMS install folder
if exist "%TOKENIZERS_BUILD%\src\Release\openvino_tokenizers.dll" (
    echo   Copying openvino_tokenizers.dll to OVMS folder...
    copy /Y "%TOKENIZERS_BUILD%\src\Release\openvino_tokenizers.dll" "%INSTALL_DIR%\" >nul
    echo   [OK] openvino_tokenizers.dll copied to OVMS folder
)

REM Copy NVIDIA plugin DLL and dependencies to OVMS install folder
if defined NVIDIA_PLUGIN_DLL (
    echo   Copying NVIDIA plugin to OVMS folder...
    copy /Y "!NVIDIA_PLUGIN_DLL!" "%INSTALL_DIR%\" >nul
    echo   [OK] openvino_nvidia_gpu_plugin.dll copied to OVMS folder

    REM Copy cuDNN DLLs (required at runtime)
    if defined CUDNN_BIN_DIR (
        echo   Copying cuDNN DLLs to OVMS folder...
        copy /Y "!CUDNN_BIN_DIR!\cudnn*.dll" "%INSTALL_DIR%\" >nul 2>&1
    )

    REM Copy cuTENSOR DLLs (optional)
    if defined CUTENSOR_BIN_DIR (
        echo   Copying cuTENSOR DLLs to OVMS folder...
        copy /Y "!CUTENSOR_BIN_DIR!\cutensor*.dll" "%INSTALL_DIR%\" >nul 2>&1
    )
)

REM ============================================
REM  Step 7: Export embedding model for OVMS
REM ============================================
echo.
echo [7/7] Exporting embedding model...

set "MODELS_DIR=%LOCALAPPDATA%\UltraScriptTools\models"
set "DEFAULT_MODEL=intfloat/multilingual-e5-base"
set "EXPORT_SCRIPT=%REPO_DIR%\demos\common\export_models\export_model.py"

if not exist "%MODELS_DIR%" mkdir "%MODELS_DIR%"

REM Check if model already exported
if exist "%MODELS_DIR%\embeddings\graph.pbtxt" (
    echo   [OK] Embedding model already exported
    goto :create_config
)

REM Check if export_model.py exists
if not exist "%EXPORT_SCRIPT%" (
    echo   [WARN] export_model.py not found, skipping model export
    echo   Run manually: python "%REPO_DIR%\demos\common\export_models\export_model.py" embeddings_ov --help
    goto :create_config
)

REM Install required Python packages for export
echo   Installing Python packages for model export...
python -m pip install --upgrade pip --quiet 2>nul
python -m pip install optimum[openvino] sentence-transformers openvino-tokenizers --quiet 2>nul

echo   Exporting model: %DEFAULT_MODEL%
echo   This may take 5-10 minutes (downloading and converting)...

pushd "%REPO_DIR%\demos\common\export_models"
python export_model.py embeddings_ov --source_model %DEFAULT_MODEL% --model_name embeddings --weight-format int8 --pooling MEAN --model_repository_path "%MODELS_DIR%" --target_device CPU --overwrite_models
set "EXPORT_RESULT=!ERRORLEVEL!"
popd

if !EXPORT_RESULT! EQU 0 (
    echo   [OK] Model exported successfully

    REM If NVIDIA plugin was built, change target_device to NVIDIA_GPU.0
    if defined NVIDIA_PLUGIN_DLL (
        set "GRAPH_PBTXT=%MODELS_DIR%\embeddings\graph.pbtxt"
        if exist "!GRAPH_PBTXT!" (
            echo   Configuring model for NVIDIA GPU...
            REM Use UTF-8 without BOM - MediaPipe cannot parse files with BOM
            powershell -NoProfile -Command "$c = (Get-Content '!GRAPH_PBTXT!' -Raw) -replace 'target_device:\s*\"CPU\"', 'target_device: \"NVIDIA_GPU.0\"'; $u = New-Object System.Text.UTF8Encoding $false; [IO.File]::WriteAllText('!GRAPH_PBTXT!', $c, $u)"
            echo   [OK] target_device set to NVIDIA_GPU.0
        )
    )
) else (
    echo   [WARN] Model export failed with code !EXPORT_RESULT!
    echo   You can export manually later using setup-embedding command
)

:create_config
REM Create OVMS config.json in models root (required by MCP server)
echo   Creating OVMS config.json...
(
echo {
echo   "model_config_list": [
echo     {
echo       "config": {
echo         "name": "embeddings",
echo         "base_path": "%MODELS_DIR:\=/%/embeddings"
echo       }
echo     }
echo   ]
echo }
) > "%MODELS_DIR%\config.json"
echo   [OK] config.json created

:finish
REM Check model and tokenizers status
set "MODEL_OK=0"
set "TOKENIZERS_OK=0"
set "NVIDIA_PLUGIN_OK=0"
if exist "%MODELS_DIR%\embeddings\graph.pbtxt" set "MODEL_OK=1"
if exist "%INSTALL_DIR%\openvino_tokenizers.dll" set "TOKENIZERS_OK=1"

REM Check for NVIDIA plugin (in OVMS folder or OpenVINO runtime)
if exist "%INSTALL_DIR%\openvino_nvidia_gpu_plugin.dll" set "NVIDIA_PLUGIN_OK=1"
if "%NVIDIA_PLUGIN_OK%"=="0" (
    set "OV_BIN_DIR=%OV_DIR%\..\..\runtime\bin\intel64\Release"
    if not exist "!OV_BIN_DIR!" set "OV_BIN_DIR=%OV_DIR%\..\bin\intel64\Release"
    if exist "!OV_BIN_DIR!\openvino_nvidia_gpu_plugin.dll" set "NVIDIA_PLUGIN_OK=1"
)

echo.
echo ============================================
echo   Setup Complete!
echo ============================================
echo.
echo   OVMS binary: %INSTALL_DIR%\ovms.exe
echo   Models: %MODELS_DIR%
echo   Config: %MODELS_DIR%\config.json
if "%MODEL_OK%"=="1" (
    echo   Model: EXPORTED [embeddings with MediaPipe graph]
) else (
    echo   Model: NOT EXPORTED [run setup-embedding to export]
)
if "%TOKENIZERS_OK%"=="1" (
    echo   Tokenizers: INSTALLED [/v3/embeddings API ready]
) else (
    echo   Tokenizers: NOT BUILT [only /v2/infer API available]
)
echo.
echo   -------------------------------------------
echo   NVIDIA GPU Support:
if "%NVIDIA_PLUGIN_OK%"=="1" (
    echo   [OK] NVIDIA plugin: INSTALLED
    echo        Device name: NVIDIA_GPU.0
    echo        To use NVIDIA GPU, edit graph.pbtxt:
    echo          target_device: "NVIDIA_GPU.0"
) else if "%ENABLE_NVIDIA%"=="1" (
    echo   [--] NVIDIA plugin: BUILD FAILED
    echo        CUDA detected but plugin build failed.
    echo        Check build logs in %TEMP_BUILD%\nvidia_plugin_build
) else (
    echo   [--] NVIDIA plugin: NOT AVAILABLE
    echo        Requirements: CUDA Toolkit + cuDNN
    echo        https://developer.nvidia.com/cuda-downloads
    echo        https://developer.nvidia.com/cudnn
)
echo   -------------------------------------------
echo.
echo   MCP server will auto-start OVMS when needed.
echo.
echo   Manual start:
echo   cd /d "%INSTALL_DIR%"
echo   call "%OV_INSTALL_DIR%\setupvars.bat"
echo   ovms.exe --rest_port 8083 --port 9001 --config_path "%MODELS_DIR%\config.json"
echo.
echo   Test /v3/embeddings API:
echo   curl -X POST http://localhost:8083/v3/embeddings -H "Content-Type: application/json" -d "{\"input\":\"test\",\"model\":\"embeddings\"}"
echo.
if "%NVIDIA_PLUGIN_OK%"=="1" (
    echo   To test with NVIDIA GPU:
    echo   1. Edit %MODELS_DIR%\embeddings\graph.pbtxt
    echo   2. Change target_device: "CPU" to target_device: "NVIDIA_GPU.0"
    echo   3. Restart OVMS
    echo.
)
pause
exit /b 0

REM ============================================
REM  Subroutines
REM ============================================

:build_openvino_from_source
echo.
echo ============================================
echo   Building OpenVINO from Source
echo   (Required for NVIDIA GPU plugin)
echo   This will take 1-2 hours...
echo ============================================
echo.

REM Use different directory name to avoid conflict with prebuilt package
set "OV_SOURCE_DIR=%TEMP_BUILD%\openvino_src"
set "OV_BUILD_DIR=%TEMP_BUILD%\openvino_build"

REM Clone OpenVINO if not exists or if it's not a source directory
if not exist "%OV_SOURCE_DIR%\CMakeLists.txt" (
    if exist "%OV_SOURCE_DIR%" (
        echo   Removing incomplete source directory...
        rmdir /S /Q "%OV_SOURCE_DIR%" 2>nul
    )
    echo   Cloning OpenVINO repository...
    git clone --depth 1 --branch 2025.4.0 --recurse-submodules https://github.com/openvinotoolkit/openvino.git "%OV_SOURCE_DIR%"
    if !ERRORLEVEL! NEQ 0 (
        echo   [ERROR] Failed to clone OpenVINO
        exit /b 1
    )
)

REM Create build directory
if not exist "%OV_BUILD_DIR%" mkdir "%OV_BUILD_DIR%"

echo   Configuring OpenVINO build...
pushd "%OV_BUILD_DIR%"

REM Setup Visual Studio environment
set "VCVARS=%VS_PATH%\VC\Auxiliary\Build\vcvars64.bat"
if exist "!VCVARS!" call "!VCVARS!" >nul 2>&1

REM Convert paths for CMake
set "OV_SOURCE_CMAKE=%OV_SOURCE_DIR:\=/%"
set "CUDA_DIR_CMAKE=%CUDA_DIR:\=/%"

REM Configure with CMake - enable developer package for NVIDIA plugin
cmake -G "Visual Studio 17 2022" -A x64 ^
    -DCMAKE_BUILD_TYPE=Release ^
    -DENABLE_INTEL_CPU=ON ^
    -DENABLE_INTEL_GPU=ON ^
    -DENABLE_PYTHON=OFF ^
    -DENABLE_WHEEL=OFF ^
    -DENABLE_TESTS=OFF ^
    -DENABLE_SAMPLES=OFF ^
    -DENABLE_DOCS=OFF ^
    -DENABLE_SYSTEM_TBB=OFF ^
    -DENABLE_OV_TF_FRONTEND=OFF ^
    -DENABLE_OV_TF_LITE_FRONTEND=OFF ^
    -DENABLE_OV_PADDLE_FRONTEND=OFF ^
    -DENABLE_OV_PYTORCH_FRONTEND=OFF ^
    -DENABLE_OV_JAX_FRONTEND=OFF ^
    -DENABLE_OV_ONNX_FRONTEND=ON ^
    -DENABLE_CPPLINT=OFF ^
    -DENABLE_NCC_STYLE=OFF ^
    "%OV_SOURCE_CMAKE%"

if !ERRORLEVEL! NEQ 0 (
    echo   [ERROR] CMake configuration failed
    popd
    exit /b 1
)

REM Build OpenVINO
echo   Building OpenVINO (this takes 1-2 hours)...
cmake --build . --config Release --parallel %NUMBER_OF_PROCESSORS%
set "BUILD_RESULT=!ERRORLEVEL!"
popd

if "!BUILD_RESULT!" NEQ "0" (
    echo   [ERROR] OpenVINO build failed
    exit /b 1
)

echo   [OK] OpenVINO built successfully
set "OV_DIR=%OV_BUILD_DIR%"
exit /b 0

:download_openvino
echo   OpenVINO not found, downloading...
set "OV_VERSION=2025.4.0"
set "OV_ZIP=openvino_toolkit_windows_2025.4.0.20398.8fdad55727d_x86_64.zip"
set "OV_URL=https://storage.openvinotoolkit.org/repositories/openvino/packages/2025.4/windows/%OV_ZIP%"

if not exist "%TEMP_BUILD%" mkdir "%TEMP_BUILD%"

echo   Downloading OpenVINO %OV_VERSION% (~400MB, please wait)...
powershell -NoProfile -ExecutionPolicy Bypass -Command "$ProgressPreference='SilentlyContinue'; Invoke-WebRequest -Uri '%OV_URL%' -OutFile '%TEMP_BUILD%\%OV_ZIP%'"

if not exist "%TEMP_BUILD%\%OV_ZIP%" (
    echo   ERROR: Failed to download OpenVINO
    echo   Download manually from: https://github.com/openvinotoolkit/openvino/releases/tag/2025.4.0
    exit /b 1
)

echo   Extracting...
powershell -NoProfile -ExecutionPolicy Bypass -Command "$ProgressPreference='SilentlyContinue'; Expand-Archive -Path '%TEMP_BUILD%\%OV_ZIP%' -DestinationPath '%TEMP_BUILD%\ov_extract' -Force"

REM Move to install dir
if not exist "%OV_INSTALL_DIR%" mkdir "%OV_INSTALL_DIR%"
for /d %%d in ("%TEMP_BUILD%\ov_extract\*") do (
    xcopy /E /I /Y "%%d\*" "%OV_INSTALL_DIR%\" >nul
)

set "OV_DIR=%OV_INSTALL_DIR%\runtime\cmake"
del "%TEMP_BUILD%\%OV_ZIP%" 2>nul
rmdir /S /Q "%TEMP_BUILD%\ov_extract" 2>nul
exit /b 0

:error
echo.
echo [ERROR] Setup failed!
pause
exit /b 1
