// UltraScript.Comm - Lightweight stdio proxy for UltraScript Tools MCP server
// Single portable binary for Windows/Linux/macOS via Cosmopolitan Libc
//
// Build with cosmocc:
//   cosmocc -Os -DNDEBUG -o ultrascript-tools.com comm.c
//
// Supports two transport modes:
//   --stdio (default) - Direct child process with stdio proxy (Bun compatible)
//   --pipe            - Named Pipe IPC (Node.js compatible, faster)

#define _COSMO_SOURCE  // Enable IsWindows(), IsLinux(), etc.
#define NDEBUG 1       // Enable MS ABI thunks

#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <stdbool.h>
#include <unistd.h>
#include <fcntl.h>
#include <errno.h>
#include <signal.h>
#include <sys/types.h>
#include <sys/stat.h>
#include <sys/wait.h>
#include <poll.h>

// Cosmopolitan runtime detection
#include <libc/dce.h>

// Cosmopolitan NT API
#include <libc/nt/createfile.h>
#include <libc/nt/files.h>
#include <libc/nt/runtime.h>
#include <libc/nt/synchronization.h>
#include <libc/nt/process.h>
#include <libc/nt/ipc.h>
#include <libc/nt/enum/accessmask.h>
#include <libc/nt/enum/creationdisposition.h>
#include <libc/nt/enum/fileflagandattributes.h>
#include <libc/nt/enum/processcreationflags.h>
#include <libc/nt/enum/startf.h>
#include <libc/nt/struct/startupinfo.h>
#include <libc/nt/struct/processinformation.h>
#include <libc/nt/struct/securityattributes.h>

// GetExitCodeProcess - not in standard Cosmopolitan headers
bool32 GetExitCodeProcess(int64_t hProcess, uint32_t *lpExitCode);

#define VERSION "2.1.0"
#define APP_NAME "UltraScript.Comm"
#define BUFFER_SIZE 8192
#define PIPE_NAME "\\\\.\\pipe\\UltraScript_Core"

// Transport mode
typedef enum {
    MODE_STDIO,  // Direct child process (default, Bun compatible)
    MODE_PIPE    // Named Pipe IPC (Node.js, faster)
} TransportMode;

static volatile int g_running = 1;

static void signal_handler(int sig) {
    (void)sig;
    g_running = 0;
}

static void print_help(void) {
    printf("%s v%s\n", APP_NAME, VERSION);
    printf("Lightweight stdio proxy for UltraScript Tools MCP server.\n\n");
    printf("Usage: ultrascript-tools.com [OPTIONS] [PROJECT_PATH]\n\n");
    printf("Transport modes:\n");
    printf("  --stdio         Direct child process proxy (default, Bun compatible)\n");
    printf("  --pipe          Named Pipe IPC (Node.js, faster)\n\n");
    printf("Other options:\n");
    printf("  -h, --help      Show this help\n");
    printf("  -v, --version   Show version\n");
}

static void print_version(void) {
    printf("%s v%s\n", APP_NAME, VERSION);
}

// Convert Unix-style path (/D/path) to Windows (D:\path)
static void convert_unix_to_win_path(char *path) {
    if (!path || !path[0]) return;

    // Check for /X/ pattern (Unix-style drive letter)
    if (path[0] == '/' && path[1] && (path[2] == '/' || path[2] == '\0')) {
        char drive = path[1];
        memmove(path + 2, path + 2, strlen(path + 2) + 1);
        path[0] = drive;
        path[1] = ':';
    }

    // Convert all forward slashes to backslashes
    for (char *p = path; *p; p++) {
        if (*p == '/') *p = '\\';
    }
}

// Parse command line for transport mode
static TransportMode parse_mode(int argc, char **argv, int *mode_arg_idx) {
    *mode_arg_idx = -1;
    for (int i = 1; i < argc; i++) {
        if (strcmp(argv[i], "--stdio") == 0) {
            *mode_arg_idx = i;
            return MODE_STDIO;
        }
        if (strcmp(argv[i], "--pipe") == 0) {
            *mode_arg_idx = i;
            return MODE_PIPE;
        }
    }
    return MODE_STDIO;  // Default
}

// ============================================================================
// Windows implementation - helper functions
// ============================================================================

static int win_get_exe_dir(char *buf, size_t buf_size) {
    char *exe = GetProgramExecutableName();
    if (!exe || !*exe) {
        strcpy(buf, ".");
        return -1;
    }

    strncpy(buf, exe, buf_size - 1);
    buf[buf_size - 1] = '\0';
    convert_unix_to_win_path(buf);

    char *last = strrchr(buf, '\\');
    if (last) *last = '\0';

    return 0;
}

// Convert ASCII to UTF-16 (simple, ASCII only)
static void ascii_to_utf16(const char *src, char16_t *dst, size_t dst_size) {
    size_t i;
    for (i = 0; i < dst_size - 1 && src[i]; i++) {
        dst[i] = (char16_t)(unsigned char)src[i];
    }
    dst[i] = 0;
}

// Find JavaScript runtime (Bun or Node.js)
static const char* find_runtime(char *bun_path, size_t bun_path_size) {
    char *up = getenv("USERPROFILE");
    if (up) {
        snprintf(bun_path, bun_path_size, "%s\\.bun\\bin\\bun.exe", up);
        convert_unix_to_win_path(bun_path);
        if (access(bun_path, F_OK) == 0) {
            return bun_path;
        }
    }

    // Fallback to Node.js
    const char *node_paths[] = {
        "C:\\Program Files\\nodejs\\node.exe",
        "C:\\Program Files (x86)\\nodejs\\node.exe",
        NULL
    };
    for (int i = 0; node_paths[i]; i++) {
        if (access(node_paths[i], F_OK) == 0) {
            return node_paths[i];
        }
    }

    return "bun";  // Fallback to PATH
}

// ============================================================================
// Windows - STDIO mode (spawn child, proxy stdin/stdout)
// ============================================================================

static int win_stdio_main(int argc, char **argv, int mode_arg_idx) {
    char exe_path[1024];
    char core_path[1100];
    char cmd_line[4096];
    char16_t cmd_line_w[4096];
    char bun_path[512];

    win_get_exe_dir(exe_path, sizeof(exe_path));
    snprintf(core_path, sizeof(core_path), "%s\\index.js", exe_path);

    if (access(core_path, F_OK) != 0) {
        return 1;  // No core found
    }

    const char *runtime_exe = find_runtime(bun_path, sizeof(bun_path));

    // Build command line (NO --pipe flag - stdio mode)
    snprintf(cmd_line, sizeof(cmd_line), "\"%s\" \"%s\"", runtime_exe, core_path);

    // Append forwarded arguments (skip --stdio)
    for (int i = 1; i < argc; i++) {
        if (i == mode_arg_idx) continue;  // Skip --stdio
        strcat(cmd_line, " \"");
        strcat(cmd_line, argv[i]);
        strcat(cmd_line, "\"");
    }

    ascii_to_utf16(cmd_line, cmd_line_w, sizeof(cmd_line_w) / sizeof(cmd_line_w[0]));

    // Create pipes for stdin/stdout
    struct NtSecurityAttributes sa = {0};
    sa.nLength = sizeof(sa);
    sa.bInheritHandle = true;

    int64_t child_stdin_read, child_stdin_write;
    int64_t child_stdout_read, child_stdout_write;

    if (!CreatePipe(&child_stdin_read, &child_stdin_write, &sa, 0)) {
        return 1;
    }
    if (!CreatePipe(&child_stdout_read, &child_stdout_write, &sa, 0)) {
        CloseHandle(child_stdin_read);
        CloseHandle(child_stdin_write);
        return 1;
    }

    // Don't inherit our end of the pipes
    SetHandleInformation(child_stdin_write, kNtHandleFlagInherit, 0);
    SetHandleInformation(child_stdout_read, kNtHandleFlagInherit, 0);

    struct NtStartupInfo si = {0};
    struct NtProcessInformation pi = {0};

    si.cb = sizeof(si);
    si.dwFlags = kNtStartfUsestdhandles | kNtStartfUseshowwindow;
    si.wShowWindow = 0;  // SW_HIDE
    si.hStdInput = child_stdin_read;
    si.hStdOutput = child_stdout_write;
    si.hStdError = GetStdHandle(kNtStdErrorHandle);  // Pass through stderr

    bool32 ok = CreateProcess(
        NULL,
        cmd_line_w,
        NULL,
        NULL,
        true,  // Inherit handles
        kNtCreateNoWindow,
        NULL,
        NULL,
        &si,
        &pi
    );

    // Close child's end of pipes (we keep our end)
    CloseHandle(child_stdin_read);
    CloseHandle(child_stdout_write);

    if (!ok) {
        CloseHandle(child_stdin_write);
        CloseHandle(child_stdout_read);
        return 1;
    }

    // Proxy loop: stdin -> child, child -> stdout
    char buf[BUFFER_SIZE];
    int64_t our_stdin = GetStdHandle(kNtStdInputHandle);
    int64_t our_stdout = GetStdHandle(kNtStdOutputHandle);
    uint32_t bytes_read, bytes_written, bytes_avail;

    while (g_running) {
        // Check if child has output -> forward to stdout
        if (PeekNamedPipe(child_stdout_read, NULL, 0, NULL, &bytes_avail, NULL) && bytes_avail > 0) {
            if (ReadFile(child_stdout_read, buf, BUFFER_SIZE, &bytes_read, NULL) && bytes_read > 0) {
                WriteFile(our_stdout, buf, bytes_read, &bytes_written, NULL);
            }
        }

        // Check if we have stdin -> forward to child
        if (PeekNamedPipe(our_stdin, NULL, 0, NULL, &bytes_avail, NULL) && bytes_avail > 0) {
            if (ReadFile(our_stdin, buf, BUFFER_SIZE, &bytes_read, NULL) && bytes_read > 0) {
                WriteFile(child_stdin_write, buf, bytes_read, &bytes_written, NULL);
            }
        }

        // Check if child exited
        uint32_t exit_code;
        if (GetExitCodeProcess(pi.hProcess, &exit_code) && exit_code != 259) {  // STILL_ACTIVE = 259
            break;
        }

        Sleep(10);  // 10ms sleep - balance between responsiveness and CPU/IO usage
    }

    // Cleanup
    CloseHandle(child_stdin_write);
    CloseHandle(child_stdout_read);

    // Terminate child if still running
    TerminateProcess(pi.hProcess, 0);
    CloseHandle(pi.hThread);
    CloseHandle(pi.hProcess);

    return 0;
}

// ============================================================================
// Windows - PIPE mode (Named Pipe IPC, faster but requires --pipe on server)
// ============================================================================

static int win_pipe_main(int argc, char **argv, int mode_arg_idx) {
    char exe_path[1024];
    char core_path[1100];
    char cmd_line[4096];
    char16_t cmd_line_w[4096];
    char16_t pipe_name_w[256];
    char bun_path[512];

    win_get_exe_dir(exe_path, sizeof(exe_path));
    snprintf(core_path, sizeof(core_path), "%s\\index.js", exe_path);

    if (access(core_path, F_OK) != 0) {
        return 1;
    }

    const char *runtime_exe = find_runtime(bun_path, sizeof(bun_path));

    // Build command line WITH --pipe flag
    snprintf(cmd_line, sizeof(cmd_line), "\"%s\" \"%s\" --pipe", runtime_exe, core_path);

    // Append forwarded arguments (skip --pipe from our args)
    for (int i = 1; i < argc; i++) {
        if (i == mode_arg_idx) continue;  // Skip --pipe
        strcat(cmd_line, " \"");
        strcat(cmd_line, argv[i]);
        strcat(cmd_line, "\"");
    }

    ascii_to_utf16(cmd_line, cmd_line_w, sizeof(cmd_line_w) / sizeof(cmd_line_w[0]));
    ascii_to_utf16(PIPE_NAME, pipe_name_w, sizeof(pipe_name_w) / sizeof(pipe_name_w[0]));

    // Start MCP server as background process
    struct NtStartupInfo si = {0};
    struct NtProcessInformation pi = {0};

    si.cb = sizeof(si);
    si.dwFlags = kNtStartfUsestdhandles | kNtStartfUseshowwindow;
    si.wShowWindow = 0;  // SW_HIDE
    si.hStdInput = GetStdHandle(kNtStdInputHandle);
    si.hStdOutput = GetStdHandle(kNtStdErrorHandle);  // Server output to stderr
    si.hStdError = GetStdHandle(kNtStdErrorHandle);

    bool32 ok = CreateProcess(
        NULL,
        cmd_line_w,
        NULL,
        NULL,
        true,
        kNtCreateNoWindow,
        NULL,
        NULL,
        &si,
        &pi
    );

    if (!ok) {
        return 1;
    }

    CloseHandle(pi.hThread);

    // Wait for Named Pipe to be available
    int64_t pipe_handle = -1;
    for (int retry = 0; retry < 100 && g_running; retry++) {
        pipe_handle = CreateFile(
            pipe_name_w,
            kNtGenericRead | kNtGenericWrite,
            0,
            NULL,
            kNtOpenExisting,
            0,
            0
        );

        if (pipe_handle != -1) break;
        Sleep(100);
    }

    if (pipe_handle == -1) {
        TerminateProcess(pi.hProcess, 0);
        CloseHandle(pi.hProcess);
        return 1;
    }

    // Proxy loop: stdin <-> Named Pipe <-> stdout
    char buf[BUFFER_SIZE];
    int64_t our_stdin = GetStdHandle(kNtStdInputHandle);
    int64_t our_stdout = GetStdHandle(kNtStdOutputHandle);
    uint32_t bytes_read, bytes_written, bytes_avail;

    while (g_running) {
        // Check Named Pipe for output -> forward to stdout
        if (PeekNamedPipe(pipe_handle, NULL, 0, NULL, &bytes_avail, NULL) && bytes_avail > 0) {
            if (ReadFile(pipe_handle, buf, BUFFER_SIZE, &bytes_read, NULL) && bytes_read > 0) {
                WriteFile(our_stdout, buf, bytes_read, &bytes_written, NULL);
            }
        }

        // Check stdin -> forward to Named Pipe
        if (PeekNamedPipe(our_stdin, NULL, 0, NULL, &bytes_avail, NULL) && bytes_avail > 0) {
            if (ReadFile(our_stdin, buf, BUFFER_SIZE, &bytes_read, NULL) && bytes_read > 0) {
                WriteFile(pipe_handle, buf, bytes_read, &bytes_written, NULL);
            }
        }

        // Check if server exited
        uint32_t exit_code;
        if (GetExitCodeProcess(pi.hProcess, &exit_code) && exit_code != 259) {
            break;
        }

        Sleep(10);  // 10ms sleep - balance between responsiveness and CPU/IO usage
    }

    // Cleanup
    CloseHandle(pipe_handle);
    TerminateProcess(pi.hProcess, 0);
    CloseHandle(pi.hProcess);

    return 0;
}

// ============================================================================
// Windows main dispatcher
// ============================================================================

static int win_main(int argc, char **argv) {
    if (argc > 1) {
        if (strcmp(argv[1], "--help") == 0 || strcmp(argv[1], "-h") == 0) {
            print_help();
            return 0;
        }
        if (strcmp(argv[1], "--version") == 0 || strcmp(argv[1], "-v") == 0) {
            print_version();
            return 0;
        }
    }

    int mode_arg_idx;
    TransportMode mode = parse_mode(argc, argv, &mode_arg_idx);

    if (mode == MODE_PIPE) {
        return win_pipe_main(argc, argv, mode_arg_idx);
    } else {
        return win_stdio_main(argc, argv, mode_arg_idx);
    }
}

// ============================================================================
// Unix implementation - helper functions
// ============================================================================

static int unix_get_exe_dir(char *buf, size_t buf_size) {
    char *exe = GetProgramExecutableName();
    if (!exe || !*exe) {
        ssize_t len = readlink("/proc/self/exe", buf, buf_size - 1);
        if (len < 0) {
            strcpy(buf, ".");
            return -1;
        }
        buf[len] = '\0';
    } else {
        strncpy(buf, exe, buf_size - 1);
        buf[buf_size - 1] = '\0';
    }

    char *last_slash = strrchr(buf, '/');
    if (last_slash) *last_slash = '\0';
    return 0;
}

// ============================================================================
// Unix - STDIO mode (fork/exec with pipe proxy)
// ============================================================================

static int unix_stdio_main(int argc, char **argv, int mode_arg_idx) {
    char exe_path[2048];
    char core_path[2200];

    unix_get_exe_dir(exe_path, sizeof(exe_path));
    snprintf(core_path, sizeof(core_path), "%s/index.js", exe_path);

    if (access(core_path, R_OK) != 0) {
        return 1;
    }

    // Create pipes
    int stdin_pipe[2], stdout_pipe[2];
    if (pipe(stdin_pipe) < 0 || pipe(stdout_pipe) < 0) {
        return 1;
    }

    pid_t pid = fork();
    if (pid < 0) {
        return 1;
    }

    if (pid == 0) {
        // Child process
        dup2(stdin_pipe[0], STDIN_FILENO);
        dup2(stdout_pipe[1], STDOUT_FILENO);
        // stderr passes through

        close(stdin_pipe[0]);
        close(stdin_pipe[1]);
        close(stdout_pipe[0]);
        close(stdout_pipe[1]);

        // Count args (excluding --stdio)
        int arg_count = 0;
        for (int i = 1; i < argc; i++) {
            if (i != mode_arg_idx) arg_count++;
        }

        // Build argv for child (NO --pipe flag)
        char **new_argv = malloc((arg_count + 3) * sizeof(char*));
        new_argv[0] = "bun";
        new_argv[1] = core_path;
        int j = 2;
        for (int i = 1; i < argc; i++) {
            if (i != mode_arg_idx) {
                new_argv[j++] = argv[i];
            }
        }
        new_argv[j] = NULL;

        execvp("bun", new_argv);
        // Fallback to node
        new_argv[0] = "node";
        execvp("node", new_argv);
        _exit(1);
    }

    // Parent process - close child's ends
    close(stdin_pipe[0]);
    close(stdout_pipe[1]);

    int child_stdin = stdin_pipe[1];
    int child_stdout = stdout_pipe[0];

    fcntl(STDIN_FILENO, F_SETFL, O_NONBLOCK);
    fcntl(child_stdout, F_SETFL, O_NONBLOCK);

    char buf[BUFFER_SIZE];
    struct pollfd fds[2] = {
        { .fd = STDIN_FILENO, .events = POLLIN },
        { .fd = child_stdout, .events = POLLIN }
    };

    while (g_running) {
        int ready = poll(fds, 2, 100);
        if (ready < 0) {
            if (errno == EINTR) continue;
            break;
        }
        if (ready == 0) continue;

        // stdin -> child
        if (fds[0].revents & POLLIN) {
            ssize_t n = read(STDIN_FILENO, buf, BUFFER_SIZE);
            if (n <= 0) break;
            if (write(child_stdin, buf, n) < 0) break;
        }

        // child -> stdout
        if (fds[1].revents & POLLIN) {
            ssize_t n = read(child_stdout, buf, BUFFER_SIZE);
            if (n <= 0) break;
            if (write(STDOUT_FILENO, buf, n) < 0) break;
        }

        if ((fds[0].revents | fds[1].revents) & (POLLHUP | POLLERR)) {
            break;
        }
    }

    close(child_stdin);
    close(child_stdout);
    kill(pid, SIGTERM);

    return 0;
}

// ============================================================================
// Unix - PIPE mode (fork/exec with --pipe flag to server)
// On Unix, --pipe just passes the flag to server; transport is still pipes
// ============================================================================

static int unix_pipe_main(int argc, char **argv, int mode_arg_idx) {
    char exe_path[2048];
    char core_path[2200];

    unix_get_exe_dir(exe_path, sizeof(exe_path));
    snprintf(core_path, sizeof(core_path), "%s/index.js", exe_path);

    if (access(core_path, R_OK) != 0) {
        return 1;
    }

    // Create pipes
    int stdin_pipe[2], stdout_pipe[2];
    if (pipe(stdin_pipe) < 0 || pipe(stdout_pipe) < 0) {
        return 1;
    }

    pid_t pid = fork();
    if (pid < 0) {
        return 1;
    }

    if (pid == 0) {
        // Child process
        dup2(stdin_pipe[0], STDIN_FILENO);
        dup2(stdout_pipe[1], STDOUT_FILENO);

        close(stdin_pipe[0]);
        close(stdin_pipe[1]);
        close(stdout_pipe[0]);
        close(stdout_pipe[1]);

        // Count args (excluding --pipe from comm.c args)
        int arg_count = 0;
        for (int i = 1; i < argc; i++) {
            if (i != mode_arg_idx) arg_count++;
        }

        // Build argv WITH --pipe flag for server
        char **new_argv = malloc((arg_count + 4) * sizeof(char*));
        new_argv[0] = "bun";
        new_argv[1] = core_path;
        new_argv[2] = "--pipe";  // Pass --pipe to server
        int j = 3;
        for (int i = 1; i < argc; i++) {
            if (i != mode_arg_idx) {
                new_argv[j++] = argv[i];
            }
        }
        new_argv[j] = NULL;

        execvp("bun", new_argv);
        new_argv[0] = "node";
        execvp("node", new_argv);
        _exit(1);
    }

    // Parent process
    close(stdin_pipe[0]);
    close(stdout_pipe[1]);

    int child_stdin = stdin_pipe[1];
    int child_stdout = stdout_pipe[0];

    fcntl(STDIN_FILENO, F_SETFL, O_NONBLOCK);
    fcntl(child_stdout, F_SETFL, O_NONBLOCK);

    char buf[BUFFER_SIZE];
    struct pollfd fds[2] = {
        { .fd = STDIN_FILENO, .events = POLLIN },
        { .fd = child_stdout, .events = POLLIN }
    };

    while (g_running) {
        int ready = poll(fds, 2, 100);
        if (ready < 0) {
            if (errno == EINTR) continue;
            break;
        }
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

        if ((fds[0].revents | fds[1].revents) & (POLLHUP | POLLERR)) {
            break;
        }
    }

    close(child_stdin);
    close(child_stdout);
    kill(pid, SIGTERM);

    return 0;
}

// ============================================================================
// Unix main dispatcher
// ============================================================================

static int unix_main(int argc, char **argv) {
    signal(SIGINT, signal_handler);
    signal(SIGTERM, signal_handler);
    signal(SIGPIPE, SIG_IGN);
    signal(SIGCHLD, SIG_IGN);

    if (argc > 1) {
        if (strcmp(argv[1], "--help") == 0 || strcmp(argv[1], "-h") == 0) {
            print_help();
            return 0;
        }
        if (strcmp(argv[1], "--version") == 0 || strcmp(argv[1], "-v") == 0) {
            print_version();
            return 0;
        }
    }

    int mode_arg_idx;
    TransportMode mode = parse_mode(argc, argv, &mode_arg_idx);

    if (mode == MODE_PIPE) {
        return unix_pipe_main(argc, argv, mode_arg_idx);
    } else {
        return unix_stdio_main(argc, argv, mode_arg_idx);
    }
}

// ============================================================================
// Main - runtime OS detection
// ============================================================================

int main(int argc, char **argv) {
    if (IsWindows()) {
        return win_main(argc, argv);
    } else {
        return unix_main(argc, argv);
    }
}
