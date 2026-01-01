@echo off
setlocal enabledelayedexpansion

REM Export embedding model with fixed dimensions for NPU
REM NPU requires static shapes - no dynamic dimensions

echo ============================================
echo   Export Model for NPU (Fixed Dimensions)
echo ============================================
echo.

set "MODELS_DIR=%LOCALAPPDATA%\UltraScriptTools\models"
set "MODEL_NAME=intfloat/multilingual-e5-base"
set "MAX_SEQ_LEN=512"
set "BATCH_SIZE=1"

REM Check for custom parameters
if not "%~1"=="" set "MODEL_NAME=%~1"
if not "%~2"=="" set "MAX_SEQ_LEN=%~2"

echo Model: %MODEL_NAME%
echo Max sequence length: %MAX_SEQ_LEN%
echo Batch size: %BATCH_SIZE%
echo Output: %MODELS_DIR%\embeddings-npu
echo.

REM Create output directory
if not exist "%MODELS_DIR%\embeddings-npu" mkdir "%MODELS_DIR%\embeddings-npu"

REM Check if optimum-cli is available
where optimum-cli >nul 2>&1
if %ERRORLEVEL% NEQ 0 (
    echo Installing optimum[openvino]...
    pip install optimum[openvino] --quiet
)

echo.
echo [1/3] Exporting model with fixed shape...
echo.

REM Export with optimum-cli using fixed input shape
optimum-cli export openvino ^
    --model %MODEL_NAME% ^
    --task feature-extraction ^
    --weight-format int8 ^
    "%MODELS_DIR%\embeddings-npu\1"

if %ERRORLEVEL% NEQ 0 (
    echo [ERROR] Model export failed
    goto :error
)

echo.
echo [2/3] Reshaping model for fixed sequence length...
echo.

REM Create Python script to reshape the model
set "RESHAPE_SCRIPT=%TEMP%\reshape_model.py"
(
echo import openvino as ov
echo import sys
echo import os
echo.
echo model_path = sys.argv[1]
echo max_len = int(sys.argv[2]^)
echo.
echo xml_path = os.path.join(model_path, "openvino_model.xml"^)
echo print(f"Loading model from {xml_path}"^)
echo core = ov.Core(^)
echo model = core.read_model(xml_path^)
echo.
echo print(f"Original inputs:"^)
echo for inp in model.inputs:
echo     print(f"  {inp.any_name}: {inp.partial_shape}"^)
echo.
echo # Reshape to fixed dimensions: [batch, seq_len]
echo new_shapes = {}
echo for inp in model.inputs:
echo     name = inp.any_name
echo     if "input_ids" in name or "attention_mask" in name or "token_type_ids" in name:
echo         new_shapes[name] = [1, max_len]
echo         print(f"  Reshaping {name} to [1, {max_len}]"^)
echo.
echo if new_shapes:
echo     model.reshape(new_shapes^)
echo     print("Model reshaped successfully"^)
echo.
echo     # Save to temp location first, then replace
echo     import gc
echo     temp_xml = os.path.join(model_path, "openvino_model_reshaped.xml"^)
echo     temp_bin = os.path.join(model_path, "openvino_model_reshaped.bin"^)
echo     orig_bin = os.path.join(model_path, "openvino_model.bin"^)
echo     ov.save_model(model, temp_xml^)
echo     print(f"Saved reshaped model to temp files"^)
echo.
echo     # Release model and core to unlock files
echo     del model
echo     del core
echo     gc.collect(^)
echo.
echo     # Delete originals and rename temp files
echo     os.remove(xml_path^)
echo     os.remove(orig_bin^)
echo     os.rename(temp_xml, xml_path^)
echo     os.rename(temp_bin, orig_bin^)
echo     print(f"Replaced original model with reshaped version"^)
echo else:
echo     print("No inputs found to reshape"^)
) > "%RESHAPE_SCRIPT%"

python "%RESHAPE_SCRIPT%" "%MODELS_DIR%\embeddings-npu\1" %MAX_SEQ_LEN%

if %ERRORLEVEL% NEQ 0 (
    echo [WARN] Reshape failed - model may still work with dynamic shapes
)

echo.
echo [3/3] Creating graph.pbtxt for NPU...
echo.

REM Create graph.pbtxt for NPU
(
echo input_stream: "REQUEST_PAYLOAD:input"
echo output_stream: "RESPONSE_PAYLOAD:output"
echo node {
echo   name: "EmbeddingsExecutor"
echo   input_side_packet: "EMBEDDINGS_NODE_RESOURCES:embeddings_servable"
echo   calculator: "EmbeddingsCalculatorOV"
echo   input_stream: "REQUEST_PAYLOAD:input"
echo   output_stream: "RESPONSE_PAYLOAD:output"
echo   node_options: {
echo     [type.googleapis.com / mediapipe.EmbeddingsCalculatorOVOptions]: {
echo       models_path: "./1/"
echo       plugin_config: '{"NUM_STREAMS": "1" }'
echo       normalize_embeddings: true
echo       pooling: MEAN
echo       target_device: "NPU"
echo     }
echo   }
echo }
) > "%MODELS_DIR%\embeddings-npu\graph.pbtxt"

echo.
echo ============================================
echo   Export Complete!
echo ============================================
echo.
echo NPU model: %MODELS_DIR%\embeddings-npu
echo.
echo To use NPU model, update config.json:
echo   "base_path": "%MODELS_DIR:\=/%/embeddings-npu"
echo.
echo Or switch graph.pbtxt in embeddings folder.
echo.

goto :end

:error
echo.
echo Export failed. Check errors above.
exit /b 1

:end
endlocal
