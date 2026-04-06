# comm

## Overview

The `comm` module implements cross-platform inter-process communication (IPC) over named pipes and standard I/O streams, providing a bridge between parent and child processes. It handles bidirectional message exchange using JSON serialization, with platform-specific implementations for Windows and Unix systems. The module manages process initialization, signal handling, and message transport with dual-mode support for stdio and named pipes.

## Flow

```
Initialization
     ↓
Parse CommArgs (transport mode, pipe names)
     ↓
Platform Detection (Windows/Unix)
     ↓
Send Init Message (handshake with parent)
     ↓
Message Loop (poll & handle incoming messages)
     ↓
JSON Escape → Serialize → Transport
     ↓
Receive/Process/Send Response
```

## Entities

### Type Aliases

- **bool32** — `comm.c:47-47` — 32-bit boolean type for consistent platform representation.

### Enums

- **MODE_STDIO** — `comm.c:56-59` — Transport mode enumeration for stdio-based communication.
- **TransportMode** — `comm.c:62-68` — Enumeration of available transport modes (stdio, named pipes).

### Structs

- **TransportMode** — `comm.c:62-68` — Defines available transport mechanisms and their parameters.
- **pollfd** — `comm.c:818-821` — File descriptor polling structure for Unix I/O multiplexing (first definition).
- **pollfd** — `comm.c:934-937` — File descriptor polling structure for Unix I/O multiplexing (second definition).
- **NtStartupInfo** — `comm.c:349-349` — Windows process startup information structure.
- **NtStartupInfo** — `comm.c:556-556` — Windows process startup information structure (second reference).
- **NtProcessInformation** — `comm.c:529-529` — Windows process handle and thread information.

### Functions

- **signal_handler** — `comm.c:72-75` — Handles system signals (SIGINT, SIGTERM) for graceful shutdown.
- **print_help** — `comm.c:77-91` — Outputs command-line help text describing available options and usage.
- **print_version** — `comm.c:93-95` — Outputs module version information.
- **memmove** — `comm.c:104-104` — Memory copying utility function for internal buffer management.
- **json_escape** — `comm.c:140-140` — Escapes special characters in strings for JSON serialization (first overload).
- **json_escape** — `comm.c:145-145` — Escapes special characters in strings for JSON serialization (second overload).
- **win_send_init_message** — `comm.c:154-179` — Sends initialization handshake message via Windows named pipe to parent process.
- **unix_send_init_message** — `comm.c:182-202` — Sends initialization handshake message via Unix stdio to parent process.
- **CommArgs** — `comm.c:205-227` — Parses and validates command-line arguments specifying transport mode and pipe identifiers.
- **win_get_exe_dir** — `comm.c:233-493` — Resolves the directory path of the current executable on Windows.
- **win_pipe_main** — `comm.c:499-855` — Main message loop for Windows pipe-based IPC, handles bidirectional message transport.
- **unix_pipe_main** — `comm.c:862-969` — Main message loop for Unix stdio/pipe-based IPC, handles bidirectional message transport with polling.
- **unix_main** — `comm.c:975-999` — Unix platform entry point, initializes communication and dispatches to message loop.
- **main** — `comm.c:1005-1011` — Primary entry point, detects platform and delegates to platform-specific initialization.

### Constants

- **define** — `comm.c:11-12` — Preprocessor constant defining buffer or limit value.
- **define** — `comm.c:12-13` — Preprocessor constant for configuration or compatibility.
- **define** — `comm.c:49-50` — Boolean true constant definition.
- **define** — `comm.c:50-51` — Boolean false constant definition.
- **define** — `comm.c:51-52` — Preprocessor constant for internal logic gate.
- **define** — `comm.c:52-53` — Preprocessor constant for success status code.
- **define** — `comm.c:53-54` — Preprocessor constant for failure status code.


### Added Entities

- **pollfd** — `comm-native.c:422-422`
- **win_signal_handler** — `comm-native.c:67-71`
- **signal_handler** — `comm-native.c:73-76`
- **print_help** — `comm-native.c:79-92`
- **json_escape** — `comm-native.c:98-108`
- **build_init_message** — `comm-native.c:110-128`
- **parse_args** — `comm-native.c:130-148`
- **get_cwd** — `comm-native.c:150-161`
- **get_exe_dir** — `comm-native.c:164-183`
- **find_runtime** — `comm-native.c:191-208`
- **win_stdio_main** — `comm-native.c:210-314`
- **unix_find_runtime** — `comm-native.c:326-354`
- **unix_stdio_main** — `comm-native.c:356-449`
- **main** — `comm-native.c:457-478`
- **WIN32_LEAN_AND_MEAN** — `comm-native.c:19-20`
- **access** — `comm-native.c:23-24`
- **F_OK** — `comm-native.c:25-26`
- **R_OK** — `comm-native.c:28-29`
- **snprintf** — `comm-native.c:32-33`
- **VERSION** — `comm-native.c:45-46`
- **APP_NAME** — `comm-native.c:46-47`
- **BUFFER_SIZE** — `comm-native.c:47-48`
- **PIPE_NAME** — `comm-native.c:48-49`
- **INIT_PREFIX** — `comm-native.c:49-50`
- **g_running** — `comm-native.c:64-64`
- **TransportMode** — `comm-native.c:51-54`
- **CommArgs** — `comm-native.c:56-62`

## Dependencies

**Internal:** No interdependencies with other src/comm modules (single-file module).

**External:**
- Windows API: `CreateNamedPipeA`, `CreateProcessA`, `WriteFile`, `ReadFile` (process creation, pipe I/O)
- Unix/POSIX: `poll()`, `read()`, `write()`, `fork()`, `signal()` (event multiplexing, IPC primitives)
- Standard C: `stdio.h`, `stdlib.h`, `string.h` (memory, string, I/O operations)
- JSON serialization: String escaping utilities for message encoding/decoding
```