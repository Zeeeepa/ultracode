// UltraCode.Comm - Native stdio proxy for UltraCode MCP server
// Platform-native builds (no Cosmopolitan dependency)
//
// Build:
//   macOS:   cc -Os -DNDEBUG -o ultracode-darwin-arm64 comm-native.c
//   Linux:   cc -Os -DNDEBUG -o ultracode-linux-x64 comm-native.c
//   Windows: cl /O2 /DNDEBUG /DWIN32 /Fe:ultracode-win32-x64.exe comm-native.c /link ws2_32.lib
//
// Same logic as comm.c but uses standard platform APIs instead of Cosmopolitan.

#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <stdbool.h>
#include <signal.h>
#include <errno.h>

#ifdef _WIN32
  #define WIN32_LEAN_AND_MEAN
  #include <windows.h>
  #include <io.h>
  #include <process.h>
  #define access _access
  #ifndef F_OK
    #define F_OK 0
  #endif
  #ifndef R_OK
    #define R_OK 4
  #endif
  // MinGW provides snprintf; MSVC needs _snprintf
  #ifdef _MSC_VER
    #define snprintf _snprintf
  #endif
#else
  #include <unistd.h>
  #include <fcntl.h>
  #include <sys/types.h>
  #include <sys/wait.h>
  #include <poll.h>
  #ifdef __APPLE__
    #include <mach-o/dyld.h>
  #endif
#endif

#define VERSION "3.0.1"
#define APP_NAME "UltraCode.Comm"
#define BUFFER_SIZE 8192
#define PIPE_NAME "\\\\.\\pipe\\UltraCode_Core"
#define INIT_PREFIX "ULTRACODE_INIT:"

typedef enum {
    MODE_STDIO,
    MODE_PIPE
} TransportMode;

typedef struct {
    TransportMode mode;
    int mode_arg_idx;
    const char *directory;
    const char *branch;
    const char *agent_id;
} CommArgs;

static volatile int g_running = 1;

#ifdef _WIN32
static BOOL WINAPI win_signal_handler(DWORD type) {
    (void)type;
    g_running = 0;
    return TRUE;
}
#else
static void signal_handler(int sig) {
    (void)sig;
    g_running = 0;
}
#endif

static void print_help(void) {
    printf("%s v%s\n", APP_NAME, VERSION);
    printf("Lightweight stdio proxy for UltraCode MCP server.\n\n");
    printf("Usage: ultracode [OPTIONS] [PROJECT_PATH]\n\n");
    printf("Transport modes:\n");
    printf("  --stdio         Direct child process proxy (default)\n");
    printf("  --pipe          Named Pipe IPC (faster, multi-client)\n\n");
    printf("Options:\n");
    printf("  --directory PATH  Override working directory\n");
    printf("  --branch NAME     Explicit branch name\n");
    printf("  --agent-id ID     Agent identifier\n");
    printf("  -h, --help        Show this help\n");
    printf("  -v, --version     Show version\n");
}

// ============================================================================
// Shared utilities
// ============================================================================

static int json_escape(const char *src, char *dst, size_t dst_size) {
    size_t j = 0;
    for (size_t i = 0; src[i] && j < dst_size - 2; i++) {
        if (src[i] == '\\' || src[i] == '"') {
            dst[j++] = '\\';
        }
        dst[j++] = src[i];
    }
    dst[j] = '\0';
    return (int)j;
}

static int build_init_message(char *buf, size_t buf_size,
                              const char *cwd, const char *branch,
                              const char *agent_id) {
    char esc_cwd[4096];
    json_escape(cwd, esc_cwd, sizeof(esc_cwd));
    int n = snprintf(buf, buf_size, "%s{\"cwd\":\"%s\"", INIT_PREFIX, esc_cwd);
    if (branch) {
        char esc[512];
        json_escape(branch, esc, sizeof(esc));
        n += snprintf(buf + n, buf_size - n, ",\"branch\":\"%s\"", esc);
    }
    if (agent_id) {
        char esc[512];
        json_escape(agent_id, esc, sizeof(esc));
        n += snprintf(buf + n, buf_size - n, ",\"agentId\":\"%s\"", esc);
    }
    n += snprintf(buf + n, buf_size - n, "}\n");
    return n;
}

static CommArgs parse_args(int argc, char **argv) {
    CommArgs args = {0};
    args.mode = MODE_STDIO;
    args.mode_arg_idx = -1;
    for (int i = 1; i < argc; i++) {
        if (strcmp(argv[i], "--stdio") == 0) {
            args.mode = MODE_STDIO; args.mode_arg_idx = i;
        } else if (strcmp(argv[i], "--pipe") == 0) {
            args.mode = MODE_PIPE; args.mode_arg_idx = i;
        } else if (strcmp(argv[i], "--directory") == 0 && i + 1 < argc) {
            args.directory = argv[++i];
        } else if (strcmp(argv[i], "--branch") == 0 && i + 1 < argc) {
            args.branch = argv[++i];
        } else if (strcmp(argv[i], "--agent-id") == 0 && i + 1 < argc) {
            args.agent_id = argv[++i];
        }
    }
    return args;
}

static void get_cwd(char *buf, size_t buf_size, const CommArgs *args) {
    if (args->directory) {
        strncpy(buf, args->directory, buf_size - 1);
        buf[buf_size - 1] = '\0';
    } else {
#ifdef _WIN32
        GetCurrentDirectoryA((DWORD)buf_size, buf);
#else
        getcwd(buf, buf_size);
#endif
    }
}

// Get directory containing this executable
static int get_exe_dir(char *buf, size_t buf_size) {
#ifdef _WIN32
    DWORD len = GetModuleFileNameA(NULL, buf, (DWORD)buf_size);
    if (len == 0) { strcpy(buf, "."); return -1; }
    char *last = strrchr(buf, '\\');
    if (last) *last = '\0';
#elif defined(__APPLE__)
    uint32_t size = (uint32_t)buf_size;
    if (_NSGetExecutablePath(buf, &size) != 0) { strcpy(buf, "."); return -1; }
    char *last = strrchr(buf, '/');
    if (last) *last = '\0';
#else
    ssize_t len = readlink("/proc/self/exe", buf, buf_size - 1);
    if (len < 0) { strcpy(buf, "."); return -1; }
    buf[len] = '\0';
    char *last = strrchr(buf, '/');
    if (last) *last = '\0';
#endif
    return 0;
}

// ============================================================================
// Windows implementation
// ============================================================================

#ifdef _WIN32

static const char* find_runtime(char *path_buf, size_t buf_size) {
    // Check bun
    const char *up = getenv("USERPROFILE");
    if (up) {
        snprintf(path_buf, buf_size, "%s\\.bun\\bin\\bun.exe", up);
        if (access(path_buf, F_OK) == 0) return path_buf;
    }
    // Check node
    const char *node_paths[] = {
        "C:\\Program Files\\nodejs\\node.exe",
        "C:\\Program Files (x86)\\nodejs\\node.exe",
        NULL
    };
    for (int i = 0; node_paths[i]; i++) {
        if (access(node_paths[i], F_OK) == 0) return node_paths[i];
    }
    return "bun";
}

static int win_stdio_main(int argc, char **argv, const CommArgs *args) {
    char exe_path[1024], core_path[1100], cmd_line[4096], runtime_buf[512];
    get_exe_dir(exe_path, sizeof(exe_path));
    snprintf(core_path, sizeof(core_path), "%s\\index.js", exe_path);
    if (access(core_path, F_OK) != 0) {
        fprintf(stderr, "Comm: core not found: %s\n", core_path);
        return 1;
    }

    // Try connecting to existing pipe first
    HANDLE pipe_handle = CreateFileA(PIPE_NAME, GENERIC_READ | GENERIC_WRITE,
                                      0, NULL, OPEN_EXISTING, 0, NULL);
    PROCESS_INFORMATION pi = {0};
    int we_started = 0;

    if (pipe_handle == INVALID_HANDLE_VALUE) {
        we_started = 1;
        const char *runtime = find_runtime(runtime_buf, sizeof(runtime_buf));
        snprintf(cmd_line, sizeof(cmd_line), "\"%s\" \"%s\" --pipe", runtime, core_path);
        for (int i = 1; i < argc; i++) {
            if (i == args->mode_arg_idx) continue;
            strcat(cmd_line, " \""); strcat(cmd_line, argv[i]); strcat(cmd_line, "\"");
        }

        HANDLE nul = CreateFileA("NUL", GENERIC_READ, 0, NULL, OPEN_EXISTING, 0, NULL);
        STARTUPINFOA si = {0};
        si.cb = sizeof(si);
        si.dwFlags = STARTF_USESTDHANDLES | STARTF_USESHOWWINDOW;
        si.wShowWindow = SW_HIDE;
        si.hStdInput = nul != INVALID_HANDLE_VALUE ? nul : GetStdHandle(STD_INPUT_HANDLE);
        si.hStdOutput = GetStdHandle(STD_ERROR_HANDLE);
        si.hStdError = GetStdHandle(STD_ERROR_HANDLE);

        if (!CreateProcessA(NULL, cmd_line, NULL, NULL, TRUE, CREATE_NO_WINDOW, NULL, NULL, &si, &pi)) {
            if (nul != INVALID_HANDLE_VALUE) CloseHandle(nul);
            fprintf(stderr, "Comm: failed to start server\n");
            return 1;
        }
        if (nul != INVALID_HANDLE_VALUE) CloseHandle(nul);
        CloseHandle(pi.hThread);

        // Wait for pipe
        for (int retry = 0; retry < 300 && g_running; retry++) {
            pipe_handle = CreateFileA(PIPE_NAME, GENERIC_READ | GENERIC_WRITE,
                                       0, NULL, OPEN_EXISTING, 0, NULL);
            if (pipe_handle != INVALID_HANDLE_VALUE) break;
            DWORD exit_code;
            if (GetExitCodeProcess(pi.hProcess, &exit_code) && exit_code != STILL_ACTIVE) {
                fprintf(stderr, "Comm: server exited (code=%lu)\n", exit_code);
                CloseHandle(pi.hProcess);
                return 1;
            }
            Sleep(100);
        }
        if (pipe_handle == INVALID_HANDLE_VALUE) {
            fprintf(stderr, "Comm: timeout waiting for pipe\n");
            TerminateProcess(pi.hProcess, 0);
            CloseHandle(pi.hProcess);
            return 1;
        }
    }

    fprintf(stderr, "Comm: connected\n");

    // Send init
    char cwd[2048], init_msg[8192];
    get_cwd(cwd, sizeof(cwd), args);
    int init_len = build_init_message(init_msg, sizeof(init_msg), cwd, args->branch, args->agent_id);
    DWORD written;
    WriteFile(pipe_handle, init_msg, init_len, &written, NULL);

    // Proxy loop
    char buf[BUFFER_SIZE];
    HANDLE h_stdin = GetStdHandle(STD_INPUT_HANDLE);
    HANDLE h_stdout = GetStdHandle(STD_OUTPUT_HANDLE);
    DWORD bytes_read, bytes_avail;

    while (g_running) {
        bool had_activity = false;

        // Pipe -> stdout
        if (PeekNamedPipe(pipe_handle, NULL, 0, NULL, &bytes_avail, NULL) && bytes_avail > 0) {
            had_activity = true;
            if (ReadFile(pipe_handle, buf, BUFFER_SIZE, &bytes_read, NULL) && bytes_read > 0)
                WriteFile(h_stdout, buf, bytes_read, &written, NULL);
        }

        // stdin -> pipe
        if (PeekNamedPipe(h_stdin, NULL, 0, NULL, &bytes_avail, NULL) && bytes_avail > 0) {
            had_activity = true;
            if (ReadFile(h_stdin, buf, BUFFER_SIZE, &bytes_read, NULL) && bytes_read > 0)
                WriteFile(pipe_handle, buf, bytes_read, &written, NULL);
        }

        if (we_started) {
            DWORD exit_code;
            if (GetExitCodeProcess(pi.hProcess, &exit_code) && exit_code != STILL_ACTIVE) break;
        }
        if (!had_activity) Sleep(10);
    }

    CloseHandle(pipe_handle);
    if (we_started) CloseHandle(pi.hProcess);
    return 0;
}

#endif // _WIN32

// ============================================================================
// Unix implementation (macOS + Linux)
// ============================================================================

#ifndef _WIN32

// Find bun or node runtime by checking well-known paths.
// Returns absolute path to runtime, or "bun"/"node" for PATH fallback.
static const char* unix_find_runtime(char *buf, size_t buf_size) {
    const char *home = getenv("HOME");

    // Check bun at well-known locations
    if (home) {
        snprintf(buf, buf_size, "%s/.bun/bin/bun", home);
        if (access(buf, X_OK) == 0) return buf;
    }
    if (access("/usr/local/bin/bun", X_OK) == 0) return "/usr/local/bin/bun";
    if (access("/opt/homebrew/bin/bun", X_OK) == 0) return "/opt/homebrew/bin/bun";

    // Check node at well-known locations
    if (home) {
        // nvm — find latest installed version
        char nvm_dir[2048];
        snprintf(nvm_dir, sizeof(nvm_dir), "%s/.nvm/versions/node", home);
        if (access(nvm_dir, F_OK) == 0) {
            // Use the default alias or latest directory
            snprintf(buf, buf_size, "%s/.nvm/alias/default", home);
            // Simplified: just check if node exists via common nvm path
        }
    }
    if (access("/usr/local/bin/node", X_OK) == 0) return "/usr/local/bin/node";
    if (access("/opt/homebrew/bin/node", X_OK) == 0) return "/opt/homebrew/bin/node";
    if (access("/usr/bin/node", X_OK) == 0) return "/usr/bin/node";

    // Last resort: rely on PATH
    return "bun";
}

static int unix_stdio_main(int argc, char **argv, const CommArgs *args) {
    char exe_path[2048], core_path[2200], runtime_buf[2048];
    get_exe_dir(exe_path, sizeof(exe_path));
    snprintf(core_path, sizeof(core_path), "%s/index.js", exe_path);

    if (access(core_path, R_OK) != 0) {
        fprintf(stderr, "Comm: core not found: %s\n", core_path);
        return 1;
    }

    const char *runtime = unix_find_runtime(runtime_buf, sizeof(runtime_buf));
    fprintf(stderr, "Comm: using runtime: %s\n", runtime);

    int stdin_pipe[2], stdout_pipe[2];
    if (pipe(stdin_pipe) < 0 || pipe(stdout_pipe) < 0) return 1;

    pid_t pid = fork();
    if (pid < 0) return 1;

    if (pid == 0) {
        // Child
        dup2(stdin_pipe[0], STDIN_FILENO);
        dup2(stdout_pipe[1], STDOUT_FILENO);
        close(stdin_pipe[0]); close(stdin_pipe[1]);
        close(stdout_pipe[0]); close(stdout_pipe[1]);

        int arg_count = 0;
        for (int i = 1; i < argc; i++) {
            if (i != args->mode_arg_idx) arg_count++;
        }

        char **new_argv = malloc((arg_count + 3) * sizeof(char*));
        new_argv[0] = (char*)runtime;
        new_argv[1] = core_path;
        int j = 2;
        for (int i = 1; i < argc; i++) {
            if (i != args->mode_arg_idx) new_argv[j++] = argv[i];
        }
        new_argv[j] = NULL;

        execv(runtime, new_argv);
        // If runtime was absolute and failed, try PATH fallback
        execvp("bun", new_argv);
        new_argv[0] = "node";
        execvp("node", new_argv);
        fprintf(stderr, "Comm: failed to exec runtime\n");
        _exit(1);
    }

    // Parent
    close(stdin_pipe[0]);
    close(stdout_pipe[1]);

    int child_stdin = stdin_pipe[1];
    int child_stdout = stdout_pipe[0];

    // Send init
    char cwd[2048], init_msg[8192];
    get_cwd(cwd, sizeof(cwd), args);
    int init_len = build_init_message(init_msg, sizeof(init_msg), cwd, args->branch, args->agent_id);
    write(child_stdin, init_msg, init_len);

    fcntl(STDIN_FILENO, F_SETFL, O_NONBLOCK);
    fcntl(child_stdout, F_SETFL, O_NONBLOCK);

    char buf[BUFFER_SIZE];
    struct pollfd fds[2] = {
        { .fd = STDIN_FILENO,  .events = POLLIN },
        { .fd = child_stdout,  .events = POLLIN }
    };

    while (g_running) {
        int ready = poll(fds, 2, 100);
        if (ready < 0) { if (errno == EINTR) continue; break; }
        if (ready == 0) continue;

        if (fds[0].revents & POLLIN) {
            ssize_t n = read(STDIN_FILENO, buf, BUFFER_SIZE);
            if (n <= 0) break;
            if (write(child_stdin, buf, n) < 0) break;
        }
        if (fds[1].revents & POLLIN) {
            ssize_t n = read(child_stdout, buf, BUFFER_SIZE);
            if (n <= 0) break;
            if (write(STDOUT_FILENO, buf, n) < 0) break;
        }
        if ((fds[0].revents | fds[1].revents) & (POLLHUP | POLLERR)) break;
    }

    close(child_stdin);
    close(child_stdout);
    kill(pid, SIGTERM);
    return 0;
}

#endif // !_WIN32

// ============================================================================
// Main
// ============================================================================

int main(int argc, char **argv) {
    if (argc > 1) {
        if (strcmp(argv[1], "--help") == 0 || strcmp(argv[1], "-h") == 0) { print_help(); return 0; }
        if (strcmp(argv[1], "--version") == 0 || strcmp(argv[1], "-v") == 0) {
            printf("%s v%s\n", APP_NAME, VERSION);
            return 0;
        }
    }

    CommArgs args = parse_args(argc, argv);

#ifdef _WIN32
    SetConsoleCtrlHandler(win_signal_handler, TRUE);
    return win_stdio_main(argc, argv, &args);
#else
    signal(SIGINT, signal_handler);
    signal(SIGTERM, signal_handler);
    signal(SIGPIPE, SIG_IGN);
    signal(SIGCHLD, SIG_IGN);
    return unix_stdio_main(argc, argv, &args);
#endif
}
