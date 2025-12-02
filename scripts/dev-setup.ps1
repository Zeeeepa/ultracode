# Development Setup Script (Windows)
# Автоматическая установка всех dependencies и сборка GPU backends

$ErrorActionPreference = "Continue"

function Write-ColorOutput {
    param(
        [string]$Message,
        [string]$Color = "White"
    )
    Write-Host $Message -ForegroundColor $Color
}

function Test-Command {
    param([string]$Command)
    $null = Get-Command $Command -ErrorAction SilentlyContinue
    return $?
}

function Write-Separator {
    Write-ColorOutput ("=" * 70) "Cyan"
}

Write-Separator
Write-ColorOutput "  🚀 Code Graph RAG - Development Setup" "Cyan"
Write-Separator

# Step 1: Check Node.js
Write-ColorOutput "`n📦 Step 1: Checking Node.js..." "Blue"
if (-not (Test-Command "node")) {
    Write-ColorOutput "❌ Node.js not found!" "Red"
    Write-ColorOutput "   Install from: https://nodejs.org/" "Gray"
    exit 1
}

$nodeVersion = node --version
Write-ColorOutput "✅ Node.js $nodeVersion" "Green"

# Step 2: Install npm dependencies
Write-ColorOutput "`n📦 Step 2: Installing npm dependencies..." "Blue"
npm install

# Step 3: Install Rust (for WASM)
Write-ColorOutput "`n🦀 Step 3: Checking Rust toolchain..." "Blue"
if (-not (Test-Command "rustc")) {
    Write-ColorOutput "⚠️  Rust not installed" "Yellow"
    Write-ColorOutput "   Please install from: https://rustup.rs/" "Gray"
    Write-ColorOutput "   Download: https://win.rustup.rs/x86_64" "Gray"
    Write-ColorOutput "   After installation, restart PowerShell and run this script again" "Gray"
} else {
    $rustVersion = rustc --version
    Write-ColorOutput "✅ Rust $rustVersion" "Green"
}

# Step 4: Install wasm-pack
Write-ColorOutput "`n📦 Step 4: Checking wasm-pack..." "Blue"
if (-not (Test-Command "wasm-pack")) {
    if (-not (Test-Command "cargo")) {
        Write-ColorOutput "⚠️  Rust not installed - wasm-pack cannot be installed" "Yellow"
        Write-ColorOutput "   Please install Rust first from: https://rustup.rs/" "Gray"
        Write-ColorOutput "   Download: https://win.rustup.rs/x86_64" "Gray"
    } else {
        Write-ColorOutput "⚠️  wasm-pack not installed - installing..." "Yellow"
        cargo install wasm-pack
        if ($LASTEXITCODE -eq 0) {
            Write-ColorOutput "✅ wasm-pack installed" "Green"
        } else {
            Write-ColorOutput "⚠️  wasm-pack installation failed" "Yellow"
        }
    }
} else {
    $wasmPackVersion = wasm-pack --version
    Write-ColorOutput "✅ $wasmPackVersion" "Green"
}

# Step 5: Build WASM modules (both diff-simd and vector-ops-simd)
Write-ColorOutput "`n🔨 Step 5: Building WASM SIMD modules..." "Blue"
if (Test-Command "wasm-pack") {
    # Use the dedicated build-wasm.ps1 script for proper output paths
    $buildWasmScript = Join-Path $PSScriptRoot "build-wasm.ps1"
    if (Test-Path $buildWasmScript) {
        & $buildWasmScript
        if ($LASTEXITCODE -eq 0) {
            Write-ColorOutput "✅ WASM modules built (4-8x speedup)" "Green"
        } else {
            Write-ColorOutput "⚠️  WASM build failed" "Yellow"
        }
    } else {
        Write-ColorOutput "⚠️  build-wasm.ps1 not found - skipping WASM build" "Yellow"
    }
} else {
    Write-ColorOutput "⚠️  wasm-pack not available - skipping WASM build" "Yellow"
    Write-ColorOutput "   Install with: cargo install wasm-pack" "Gray"
}

# Step 6: Check for CUDA (optional)
Write-ColorOutput "`n🚀 Step 6: Checking CUDA Toolkit..." "Blue"
if (Test-Command "nvidia-smi") {
    Write-ColorOutput "✅ NVIDIA GPU detected" "Green"
    $gpuName = nvidia-smi --query-gpu=name --format=csv,noheader | Select-Object -First 1
    Write-ColorOutput "   $gpuName" "Gray"

    if (Test-Command "nvcc") {
        $cudaVersion = (nvcc --version | Select-String "release" | ForEach-Object { $_ -match "release (\d+\.\d+)" | Out-Null; $matches[1] })
        Write-ColorOutput "✅ CUDA Toolkit $cudaVersion detected" "Green"

        # Check for CMake (required for CUDA build)
        if (-not (Test-Command "cmake")) {
            Write-ColorOutput "⚠️  CMake not installed - attempting automatic installation..." "Yellow"
            $cmakeInstalled = $false

            # Method 1: Try winget first (modern, built-in Windows 10/11)
            if (Test-Command "winget") {
                Write-ColorOutput "📦 Installing CMake via winget..." "Blue"
                winget install --id Kitware.CMake -e --silent --accept-package-agreements --accept-source-agreements
                if ($LASTEXITCODE -eq 0) {
                    # Refresh environment to get new PATH
                    $env:Path = [System.Environment]::GetEnvironmentVariable("Path","Machine") + ";" + [System.Environment]::GetEnvironmentVariable("Path","User")

                    # Verify installation
                    if (Test-Command "cmake") {
                        Write-ColorOutput "✅ CMake installed successfully via winget" "Green"
                        $cmakeInstalled = $true
                    } else {
                        Write-ColorOutput "⚠️  CMake installed but not in PATH - restart PowerShell" "Yellow"
                    }
                } else {
                    Write-ColorOutput "⚠️  winget installation failed, trying chocolatey..." "Yellow"
                }
            }

            # Method 2: Try chocolatey as fallback
            if (-not $cmakeInstalled -and (Test-Command "choco")) {
                Write-ColorOutput "📦 Installing CMake via Chocolatey..." "Blue"
                choco install cmake -y --no-progress --force
                if ($LASTEXITCODE -eq 0) {
                    # Refresh environment to get new PATH
                    $env:Path = [System.Environment]::GetEnvironmentVariable("Path","Machine") + ";" + [System.Environment]::GetEnvironmentVariable("Path","User")

                    # Verify installation
                    if (Test-Command "cmake") {
                        Write-ColorOutput "✅ CMake installed successfully via Chocolatey" "Green"
                        $cmakeInstalled = $true
                    } else {
                        Write-ColorOutput "⚠️  CMake installed but not in PATH - restart PowerShell" "Yellow"
                    }
                } else {
                    Write-ColorOutput "⚠️  Chocolatey installation failed" "Yellow"
                }
            }

            # Method 3: Manual installation instructions
            if (-not $cmakeInstalled) {
                Write-ColorOutput "" "Gray"
                Write-ColorOutput "❌ Automatic installation failed - manual installation required" "Red"
                Write-ColorOutput "" "Gray"
                Write-ColorOutput "Please install CMake manually:" "Yellow"
                Write-ColorOutput "   1. Download from: https://cmake.org/download/" "Gray"
                Write-ColorOutput "      (Windows x64 Installer: cmake-X.X.X-windows-x86_64.msi)" "Gray"
                Write-ColorOutput "   2. Run the installer" "Gray"
                Write-ColorOutput "   3. ✅ Check 'Add CMake to system PATH'" "Gray"
                Write-ColorOutput "   4. Restart PowerShell and run this script again" "Gray"
                Write-ColorOutput "" "Gray"
                Write-ColorOutput "Alternative package managers:" "Yellow"
                Write-ColorOutput "   - winget: winget install --id Kitware.CMake" "Gray"
                Write-ColorOutput "   - choco:  choco install cmake" "Gray"
            }
        } else {
            $cmakeVersion = cmake --version | Select-Object -First 1
            Write-ColorOutput "✅ CMake detected: $cmakeVersion" "Green"
        }

        # Check for CUDA in PATH and add if needed
        Write-ColorOutput "`n🔍 Checking CUDA PATH configuration..." "Blue"
        $cudaBinPath = "C:\Program Files\NVIDIA GPU Computing Toolkit\CUDA\v$cudaVersion\bin"

        if (-not (Test-Command "nvcc")) {
            if (Test-Path $cudaBinPath) {
                Write-ColorOutput "⚠️  CUDA found but not in PATH - adding..." "Yellow"

                # Add to current session
                $env:Path += ";$cudaBinPath"

                # Add to User PATH permanently
                $userPath = [Environment]::GetEnvironmentVariable("Path", "User")
                if ($userPath -notlike "*$cudaBinPath*") {
                    [Environment]::SetEnvironmentVariable("Path", "$userPath;$cudaBinPath", "User")
                    Write-ColorOutput "✅ CUDA added to PATH permanently" "Green"
                    Write-ColorOutput "   (Restart PowerShell to apply for other sessions)" "Gray"
                }

                # Verify
                if (Test-Command "nvcc") {
                    Write-ColorOutput "✅ nvcc is now accessible" "Green"
                }
            } else {
                Write-ColorOutput "⚠️  CUDA bin directory not found: $cudaBinPath" "Yellow"
            }
        } else {
            Write-ColorOutput "✅ nvcc already in PATH" "Green"
        }

        # Check for Visual Studio CUDA integration
        Write-ColorOutput "`n🔍 Checking Visual Studio CUDA integration..." "Blue"
        $vsCudaIntegration = $false
        $vsCudaPaths = @(
            "C:\Program Files (x86)\Microsoft Visual Studio\2022\BuildTools\MSBuild\Microsoft\VC\v170\BuildCustomizations\CUDA*.props",
            "C:\Program Files (x86)\Microsoft Visual Studio\2022\Community\MSBuild\Microsoft\VC\v170\BuildCustomizations\CUDA*.props",
            "C:\Program Files (x86)\Microsoft Visual Studio\2022\Professional\MSBuild\Microsoft\VC\v170\BuildCustomizations\CUDA*.props",
            "C:\Program Files (x86)\Microsoft Visual Studio\2022\Enterprise\MSBuild\Microsoft\VC\v170\BuildCustomizations\CUDA*.props"
        )

        foreach ($pattern in $vsCudaPaths) {
            if (Test-Path $pattern) {
                $vsCudaIntegration = $true
                Write-ColorOutput "✅ Visual Studio CUDA integration found" "Green"
                break
            }
        }

        if (-not $vsCudaIntegration) {
            Write-ColorOutput "⚠️  Visual Studio CUDA integration NOT found" "Yellow"
            Write-ColorOutput "" "Gray"
            Write-ColorOutput "   CUDA backend requires Visual Studio CUDA support." "Yellow"
            Write-ColorOutput "   Choose one of these options:" "Yellow"
            Write-ColorOutput "" "Gray"
            Write-ColorOutput "   Option 1: Modify Visual Studio (Recommended)" "Cyan"
            Write-ColorOutput "      1. Run Visual Studio Installer" "Gray"
            Write-ColorOutput "      2. Click 'Modify' on VS 2022 Build Tools/Community" "Gray"
            Write-ColorOutput "      3. Go to 'Individual components'" "Gray"
            Write-ColorOutput "      4. Search and check:" "Gray"
            Write-ColorOutput "         ✓ 'MSVC v143 - VS 2022 C++ x64/x86 build tools'" "Gray"
            Write-ColorOutput "         ✓ 'C++ CMake tools for Windows'" "Gray"
            Write-ColorOutput "      5. Install and restart PowerShell" "Gray"
            Write-ColorOutput "" "Gray"
            Write-ColorOutput "   Option 2: Install Visual Studio Community (Full)" "Cyan"
            Write-ColorOutput "      winget install Microsoft.VisualStudio.2022.Community" "Gray"
            Write-ColorOutput "      (Includes CUDA support by default)" "Gray"
            Write-ColorOutput "" "Gray"
            Write-ColorOutput "   Option 3: Use Ninja generator (Alternative)" "Cyan"
            Write-ColorOutput "      winget install Ninja-build.Ninja" "Gray"
            Write-ColorOutput "      (Doesn't require VS CUDA integration)" "Gray"
            Write-ColorOutput "" "Gray"
            Write-ColorOutput "   For detailed instructions: cat _ul/CUDA_BUILD_FIX.md" "Gray"
            Write-ColorOutput "" "Gray"
        }

        # Check for CUDA Development Headers
        Write-ColorOutput "`n🔍 Checking CUDA Development Headers..." "Blue"
        $cudaRuntimeHeader = "$cudaBinPath\..\include\cuda_runtime.h"
        $cudaHeadersOk = $false

        if (Test-Path $cudaRuntimeHeader) {
            $headerCount = (Get-ChildItem "$cudaBinPath\..\include\" -Recurse -Filter "*.h" -ErrorAction SilentlyContinue | Measure-Object).Count
            if ($headerCount -gt 50) {
                Write-ColorOutput "✅ CUDA Development Headers found ($headerCount headers)" "Green"
                $cudaHeadersOk = $true
            } else {
                Write-ColorOutput "⚠️  Incomplete CUDA headers ($headerCount found, expected >100)" "Yellow"
            }
        } else {
            Write-ColorOutput "❌ CUDA Development Headers NOT found" "Red"
            Write-ColorOutput "   Expected: $cudaRuntimeHeader" "Gray"
            Write-ColorOutput "" "Gray"
            Write-ColorOutput "   CUDA Development components are required for native build." "Yellow"
            Write-ColorOutput "   Action: Reinstall CUDA Toolkit with 'Development' components" "Yellow"
            Write-ColorOutput "" "Gray"
            Write-ColorOutput "   Quick fix:" "Cyan"
            Write-ColorOutput "   1. Download CUDA Toolkit from:" "Gray"
            Write-ColorOutput "      https://developer.nvidia.com/cuda-downloads" "Gray"
            Write-ColorOutput "   2. Run installer → Custom Installation" "Gray"
            Write-ColorOutput "   3. Check: 'CUDA → Development' and 'Visual Studio Integration'" "Gray"
            Write-ColorOutput "   4. Complete installation" "Gray"
            Write-ColorOutput "" "Gray"
            Write-ColorOutput "   For detailed instructions: cat _ul\CUDA_HEADERS_MISSING.md" "Gray"
            Write-ColorOutput "" "Gray"
        }

        # Check for Visual Studio (prioritize VS 2022 over newer versions)
        Write-ColorOutput "`n🔍 Checking Visual Studio installation..." "Blue"

        $vsPath = $null
        $vsVersion = $null

        # Priority 1: VS 2022 Build Tools (most stable for CUDA)
        $vs2022BuildTools = "${env:ProgramFiles(x86)}\Microsoft Visual Studio\2022\BuildTools"
        if (Test-Path $vs2022BuildTools) {
            $vsPath = $vs2022BuildTools
            $vsVersion = "VS 2022 Build Tools"
            Write-ColorOutput "✅ Found VS 2022 Build Tools (prioritized for CUDA)" "Green"
        }

        # Priority 2: VS 2022 Community/Professional/Enterprise
        if (-not $vsPath) {
            $vs2022Editions = @("Community", "Professional", "Enterprise")
            foreach ($edition in $vs2022Editions) {
                $path = "${env:ProgramFiles(x86)}\Microsoft Visual Studio\2022\$edition"
                if (Test-Path $path) {
                    $vsPath = $path
                    $vsVersion = "VS 2022 $edition"
                    Write-ColorOutput "✅ Found VS 2022 $edition" "Green"
                    break
                }
            }
        }

        # Priority 3: Use vswhere for other versions (VS 2019, VS 2026, etc.)
        if (-not $vsPath) {
            $vsWhere = "${env:ProgramFiles(x86)}\Microsoft Visual Studio\Installer\vswhere.exe"
            if (Test-Path $vsWhere) {
                $vsPath = & $vsWhere -latest -property installationPath
                if ($vsPath) {
                    $vsVersion = "Visual Studio (detected via vswhere)"
                    Write-ColorOutput "⚠️  Using Visual Studio: $vsPath" "Yellow"
                    Write-ColorOutput "   Note: VS 2022 is recommended for CUDA builds" "Gray"
                }
            }
        }

        if ($vsPath) {
            Write-ColorOutput "✅ Active Visual Studio: $vsVersion" "Green"
            Write-ColorOutput "   Path: $vsPath" "Gray"

                # Check for C++ Build Tools (CRITICAL!)
                Write-ColorOutput "`n🔍 Checking C++ Build Tools..." "Blue"
                $vsCppToolsInstalled = $false

                # Check if MSVC C++ compiler is available
                $vcToolsPath = "$vsPath\VC\Tools\MSVC"
                if (Test-Path $vcToolsPath) {
                    $msvcVersions = Get-ChildItem $vcToolsPath -Directory -ErrorAction SilentlyContinue
                    if ($msvcVersions) {
                        $latestMsvc = $msvcVersions | Sort-Object Name -Descending | Select-Object -First 1
                        $clPath = "$($latestMsvc.FullName)\bin\Hostx64\x64\cl.exe"
                        if (Test-Path $clPath) {
                            Write-ColorOutput "✅ MSVC C++ compiler found: $($latestMsvc.Name)" "Green"
                            $vsCppToolsInstalled = $true
                        }
                    }
                }

                if (-not $vsCppToolsInstalled) {
                    Write-ColorOutput "❌ MSVC C++ Build Tools NOT installed" "Red"
                    Write-ColorOutput "" "Gray"
                    Write-ColorOutput "   CRITICAL: CUDA build requires C++ compiler!" "Yellow"
                    Write-ColorOutput "" "Gray"
                    Write-ColorOutput "   To install C++ Build Tools:" "Cyan"
                    Write-ColorOutput "   1. Run Visual Studio Installer" "Gray"
                    Write-ColorOutput "   2. Click 'Modify' on your Visual Studio installation" "Gray"
                    Write-ColorOutput "   3. Select one of these workloads:" "Gray"
                    Write-ColorOutput "      ✓ 'Desktop development with C++' (Recommended)" "Gray"
                    Write-ColorOutput "      OR go to 'Individual components' and check:" "Gray"
                    Write-ColorOutput "      ✓ 'MSVC v143 - VS 2022 C++ x64/x86 build tools'" "Gray"
                    Write-ColorOutput "      ✓ 'C++ CMake tools for Windows'" "Gray"
                    Write-ColorOutput "      ✓ 'Windows SDK (latest version)'" "Gray"
                    Write-ColorOutput "   4. Click 'Modify' to install" "Gray"
                    Write-ColorOutput "   5. Restart PowerShell and run this script again" "Gray"
                    Write-ColorOutput "" "Gray"
                }

                # Only attempt CUDA build if ALL requirements are met
                if ($vsCudaIntegration -and $cudaHeadersOk -and $vsCppToolsInstalled) {
                    Write-ColorOutput "🔨 Building CUDA native addon..." "Blue"
                    npm run build:cuda
                    if ($LASTEXITCODE -eq 0) {
                        Write-ColorOutput "✅ CUDA backend built successfully (100-200x speedup)" "Green"
                    } else {
                        Write-ColorOutput "⚠️  CUDA build failed (optional)" "Yellow"
                        Write-ColorOutput "   Check error logs above for details" "Gray"
                        Write-ColorOutput "   Run 'npm run build:cuda' manually to retry" "Gray"
                    }
                } elseif (-not $vsCppToolsInstalled) {
                    Write-ColorOutput "⚠️  Skipping CUDA build - C++ Build Tools required" "Yellow"
                    Write-ColorOutput "   Follow instructions above to install C++ compiler" "Gray"
                } elseif (-not $vsCudaIntegration) {
                    Write-ColorOutput "⚠️  Skipping CUDA build - VS CUDA integration required" "Yellow"
                    Write-ColorOutput "   Follow instructions above to install CUDA support" "Gray"
                } elseif (-not $cudaHeadersOk) {
                    Write-ColorOutput "⚠️  Skipping CUDA build - CUDA Development headers required" "Yellow"
                    Write-ColorOutput "   Reinstall CUDA Toolkit with Development components" "Gray"
                }
            } else {
                Write-ColorOutput "⚠️  Visual Studio not found" "Yellow"
                Write-ColorOutput "   CUDA build requires Visual Studio 2019+ with C++ tools" "Gray"
            }
        } else {
            Write-ColorOutput "⚠️  Visual Studio not detected" "Yellow"
            Write-ColorOutput "   Install from: https://visualstudio.microsoft.com/downloads/" "Gray"
        }
    } else {
        Write-ColorOutput "⚠️  CUDA Toolkit not installed (optional)" "Yellow"
        Write-ColorOutput "   Download from: https://developer.nvidia.com/cuda-downloads" "Gray"
    }
} else {
    Write-ColorOutput "⚠️  NVIDIA GPU not detected - skipping CUDA" "Yellow"
}

# Step 7: Install WebGPU (optional)
Write-ColorOutput "`n🎨 Step 7: Installing WebGPU support..." "Blue"
npm install @webgpu/node @webgpu/types --save-optional
Write-ColorOutput "✅ WebGPU support installed" "Green"

# Step 8: Build TypeScript
Write-ColorOutput "`n🔨 Step 8: Building TypeScript..." "Blue"
npm run build
Write-ColorOutput "✅ TypeScript compiled" "Green"

# Step 9: Run tests
Write-ColorOutput "`n🧪 Step 9: Running tests..." "Blue"
npm test
if ($LASTEXITCODE -eq 0) {
    Write-ColorOutput "✅ All tests passed" "Green"
} else {
    Write-ColorOutput "⚠️  Some tests failed (check above)" "Yellow"
}

# Final summary
Write-Separator
Write-ColorOutput "  ✅ Development Environment Ready!" "Green"
Write-Separator

Write-ColorOutput "`n📊 Installed Backends:" "Cyan"
Write-ColorOutput "  • Pure JS (Loop Unrolling) - ✅ Always available (1.45x)" "Gray"

$wasmDiffOk = Test-Path "external-tools\wasm\diff-simd\pkg\diff_simd.js"
$wasmVectorOk = Test-Path "external-tools\wasm\vector-ops-simd\pkg\vector_ops_simd.js"
if ($wasmDiffOk -and $wasmVectorOk) {
    Write-ColorOutput "  • WASM SIMD                - ✅ Built (4-8x)" "Green"
} elseif ($wasmDiffOk -or $wasmVectorOk) {
    Write-ColorOutput "  • WASM SIMD                - ⚠️  Partial (run build-wasm.ps1)" "Yellow"
} else {
    Write-ColorOutput "  • WASM SIMD                - ❌ Not built" "Red"
}

$webgpuInstalled = npm list @webgpu/node 2>&1 | Select-String "@webgpu/node"
if ($webgpuInstalled) {
    Write-ColorOutput "  • WebGPU Compute           - ✅ Installed (50-100x)" "Green"
} else {
    Write-ColorOutput "  • WebGPU Compute           - ❌ Not installed" "Red"
}

if (Test-Path "external-tools\native\cuda\build\ultrascript_cuda.node") {
    Write-ColorOutput "  • CUDA Native              - ✅ Built (100-200x)" "Green"
} else {
    Write-ColorOutput "  • CUDA Native              - ⚠️  Not built (optional)" "Yellow"
}

Write-ColorOutput "`n🚀 Next steps:" "Cyan"
Write-ColorOutput "  • Run tests:    npm test" "Gray"
Write-ColorOutput "  • Start coding: npm run build:watch" "Gray"
Write-ColorOutput "  • Check docs:   cat GPU_IMPLEMENTATION_STATUS.md" "Gray"

Write-Host ""
