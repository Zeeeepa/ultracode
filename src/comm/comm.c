// UltraScript.Comm - Lightweight proxy for UltraScript Core MCP server
// Single portable binary for Windows/Linux/macOS via Cosmopolitan Libc
//
// Build with cosmocc:
//   cosmocc -Os -DNDEBUG -o ultrascript-tools.com comm.c
//
// The binary auto-detects OS at runtime and uses:
//   Windows: Named Pipes (\\.\pipe\UltraScript_Core)
//   Unix: Unix Domain Sockets (/tmp/UltraScript_Core.sock)

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
#include <time.h>
#include <poll.h>
#include <sys/socket.h>
#include <sys/un.h>
#include <netinet/in.h>
#include <arpa/inet.h>
#include <spawn.h>

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


#define VERSION "1.0.0"
#define APP_NAME "UltraScript.Comm"
#define BUFFER_SIZE 8192
#define CONNECT_TIMEOUT_MS 2000
#define STARTUP_TIMEOUT_MS 30000

// Named Pipe doesn't work with Bun on Windows, use TCP instead
#define TCP_HOST_WIN "127.0.0.1"
#define TCP_PORT_WIN 51734
#define PIPE_PATH_UNIX "/tmp/ultrascript-core.sock"

static volatile int g_running = 1;

static void signal_handler(int sig) {
    (void)sig;
    g_running = 0;
}

static void print_help(void) {
    printf("%s v%s\n", APP_NAME, VERSION);
    printf("Lightweight proxy for UltraScript Tools MCP server.\n");
    printf("Connects to Core via Named Pipe (starts Core if not running).\n\n");
    printf("Usage: ultrascript-tools.com [OPTIONS] [PROJECT_PATH]\n\n");
    printf("Options:\n");
    printf("  -h, --help      Show this help\n");
    printf("  -v, --version   Show version\n");
    printf("  -d, --directory Directory to index (defaults to cwd)\n");
}

static void print_version(void) {
    printf("%s v%s\n", APP_NAME, VERSION);
}

static long get_time_ms(void) {
    struct timespec ts;
    clock_gettime(CLOCK_MONOTONIC, &ts);
    return ts.tv_sec * 1000 + ts.tv_nsec / 1000000;
}

// ============================================================================
// Windows implementation using Cosmopolitan NT API
// ============================================================================

// Convert ASCII to UTF-16 (simple, ASCII only)
static void ascii_to_utf16(const char *src, char16_t *dst, size_t dst_size) {
    size_t i;
    for (i = 0; i < dst_size - 1 && src[i]; i++) {
        dst[i] = (char16_t)(unsigned char)src[i];
    }
    dst[i] = 0;
}

// Use standard sockets on Windows (TCP) - Bun doesn't support Named Pipes
static int win_try_connect_tcp(void) {
    int sock = socket(AF_INET, SOCK_STREAM, 0);
    if (sock < 0) return -1;

    struct sockaddr_in addr = {0};
    addr.sin_family = AF_INET;
    addr.sin_port = htons(TCP_PORT_WIN);
    addr.sin_addr.s_addr = inet_addr(TCP_HOST_WIN);

    if (connect(sock, (struct sockaddr*)&addr, sizeof(addr)) < 0) {
        close(sock);
        return -1;
    }

    return sock;
}

// Convert Unix-style path (/D/path) to Windows (D:\path)
static void convert_unix_to_win_path(char *path) {
    if (!path || !path[0]) return;

    // Check for /X/ pattern (Unix-style drive letter)
    if (path[0] == '/' && path[1] && (path[2] == '/' || path[2] == '\0')) {
        char drive = path[1];
        // Shift the rest of the string
        memmove(path + 2, path + 2, strlen(path + 2) + 1);
        path[0] = drive;
        path[1] = ':';
    }

    // Convert all forward slashes to backslashes
    for (char *p = path; *p; p++) {
        if (*p == '/') *p = '\\';
    }
}

static int win_get_exe_dir(char *buf, size_t buf_size) {
    // Use Cosmopolitan's GetProgramExecutableName
    char *exe = GetProgramExecutableName();
    if (!exe || !*exe) {
        strcpy(buf, ".");
        return -1;
    }

    strncpy(buf, exe, buf_size - 1);
    buf[buf_size - 1] = '\0';

    // Convert to Windows path format
    convert_unix_to_win_path(buf);

    // Find last backslash
    char *last = strrchr(buf, '\\');
    if (last) *last = '\0';

    return 0;
}

static int win_start_core(int argc, char **argv) {
    char exe_path[1024];
    char core_path[1100];
    char cmd_line[4096];
    char16_t cmd_line_w[4096];

    // Priority 1: Check ULTRASCRIPT_CORE_PATH environment variable
    // (set by bin/ultrascript.js wrapper when installed via npm)
    char *env_core_path = getenv("ULTRASCRIPT_CORE_PATH");
    if (env_core_path && access(env_core_path, F_OK) == 0) {
        strncpy(core_path, env_core_path, sizeof(core_path) - 1);
        core_path[sizeof(core_path) - 1] = '\0';
        convert_unix_to_win_path(core_path);
    } else {
        // Priority 2: Look relative to exe (local dev or direct binary usage)
        win_get_exe_dir(exe_path, sizeof(exe_path));
        snprintf(core_path, sizeof(core_path), "%s\\index.js", exe_path);
    }

    // Check if JS MCP server exists
    if (access(core_path, F_OK) == 0) {
        // Try Bun first (faster), then Node.js as fallback
        char bun_path[512];
        const char *runtime_exe = NULL;

        // Get %USERPROFILE% for Bun path
        char *up = getenv("USERPROFILE");
        if (up) {
            snprintf(bun_path, sizeof(bun_path), "%s\\.bun\\bin\\bun.exe", up);
            convert_unix_to_win_path(bun_path);
            if (access(bun_path, F_OK) == 0) {
                runtime_exe = bun_path;
            }
        }

        // Fallback to Node.js
        if (!runtime_exe) {
            const char *node_paths[] = {
                "C:\\Program Files\\nodejs\\node.exe",
                "C:\\Program Files (x86)\\nodejs\\node.exe",
                NULL
            };
            for (int i = 0; node_paths[i]; i++) {
                if (access(node_paths[i], F_OK) == 0) {
                    runtime_exe = node_paths[i];
                    break;
                }
            }
        }

        if (runtime_exe) {
            snprintf(cmd_line, sizeof(cmd_line), "\"%s\" \"%s\" --pipe", runtime_exe, core_path);
        } else {
            // Last fallback to PATH
            snprintf(cmd_line, sizeof(cmd_line), "bun \"%s\" --pipe", core_path);
        }
    } else {
        // Fallback: try ultrascript-core binary
        snprintf(core_path, sizeof(core_path), "%s\\ultrascript-core.exe", exe_path);
        snprintf(cmd_line, sizeof(cmd_line), "\"%s\"", core_path);
    }

    // Append forwarded arguments
    for (int i = 1; i < argc; i++) {
        strcat(cmd_line, " \"");
        strcat(cmd_line, argv[i]);
        strcat(cmd_line, "\"");
    }

    // Convert to UTF-16
    ascii_to_utf16(cmd_line, cmd_line_w, sizeof(cmd_line_w) / sizeof(cmd_line_w[0]));

    struct NtStartupInfo si = {0};
    struct NtProcessInformation pi = {0};

    si.cb = sizeof(si);
    si.dwFlags = kNtStartfUseshowwindow;
    si.wShowWindow = 0; // SW_HIDE

    bool32 ok = CreateProcess(
        NULL,
        cmd_line_w,
        NULL,
        NULL,
        false,
        kNtCreateNoWindow | kNtDetachedProcess,
        NULL,
        NULL,
        &si,
        &pi
    );

    if (!ok) {
        fprintf(stderr, "[Comm] Failed to start runtime, error=%lu\n", GetLastError());
        return -1;
    }

    CloseHandle(pi.hThread);
    CloseHandle(pi.hProcess);
    return 0;
}

// Windows proxy using TCP socket and stdin/stdout handles
static int win_run_proxy(int sock) {
    char stdin_buf[BUFFER_SIZE];
    char sock_buf[BUFFER_SIZE];
    int64_t stdin_h = GetStdHandle(kNtStdInputHandle);
    int64_t stdout_h = GetStdHandle(kNtStdOutputHandle);

    // Log to file for debugging
    FILE *logf = fopen("C:\\Users\\faxen\\comm-debug.log", "a");
    if (logf) {
        fprintf(logf, "[Comm] Proxy started, sock=%d, stdin=%lld, stdout=%lld\n", sock, (long long)stdin_h, (long long)stdout_h);
        fflush(logf);
    }
    fprintf(stderr, "[Comm] Proxy started, sock=%d, stdin=%lld, stdout=%lld\n", sock, (long long)stdin_h, (long long)stdout_h);

    // Set socket to non-blocking
    fcntl(sock, F_SETFL, O_NONBLOCK);

    uint32_t bytes_read, bytes_written, bytes_avail;
    int loop_count = 0;
    int peek_fail_count = 0;

    while (g_running) {
        loop_count++;

        // Check for data from Core (socket) -> forward to stdout
        ssize_t n = read(sock, sock_buf, BUFFER_SIZE);
        if (n > 0) {
            if (logf) { fprintf(logf, "[Comm] Core->stdout: %zd bytes\n", n); fflush(logf); }
            if (!WriteFile(stdout_h, sock_buf, n, &bytes_written, NULL)) {
                if (logf) { fprintf(logf, "[Comm] WriteFile failed, err=%lu\n", GetLastError()); fflush(logf); }
                break;
            }
            FlushFileBuffers(stdout_h);
        } else if (n == 0) {
            if (logf) { fprintf(logf, "[Comm] Core disconnected (n=0)\n"); fflush(logf); }
            break;
        } else if (errno != EAGAIN && errno != EWOULDBLOCK) {
            if (logf) { fprintf(logf, "[Comm] Socket read error: errno=%d\n", errno); fflush(logf); }
            break;
        }

        // Check stdin for data -> forward to Core
        bytes_avail = 0;
        bool32 peek_ok = PeekNamedPipe(stdin_h, NULL, 0, NULL, &bytes_avail, NULL);
        if (!peek_ok) {
            if (peek_fail_count == 0 && logf) {
                fprintf(logf, "[Comm] PeekNamedPipe failed, err=%lu\n", GetLastError());
                fflush(logf);
            }
            peek_fail_count++;
        }

        if (peek_ok && bytes_avail > 0) {
            if (logf) { fprintf(logf, "[Comm] stdin has %u bytes\n", bytes_avail); fflush(logf); }
            if (ReadFile(stdin_h, stdin_buf, BUFFER_SIZE, &bytes_read, NULL) && bytes_read > 0) {
                if (logf) { fprintf(logf, "[Comm] stdin->Core: %u bytes: %.100s\n", bytes_read, stdin_buf); fflush(logf); }
                if (write(sock, stdin_buf, bytes_read) < 0) {
                    if (logf) { fprintf(logf, "[Comm] Socket write failed\n"); fflush(logf); }
                    break;
                }
            }
        }

        Sleep(1);
    }

    if (logf) { fprintf(logf, "[Comm] Proxy ended after %d loops, peek_fails=%d\n", loop_count, peek_fail_count); fclose(logf); }
    return 0;
}

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

    int sock = win_try_connect_tcp();

    if (sock < 0) {
        // Core not running, start it
        if (win_start_core(argc, argv) != 0) {
            fprintf(stderr, "[Comm] Failed to start Core\n");
            return 1;
        }

        long start = get_time_ms();
        while (get_time_ms() - start < STARTUP_TIMEOUT_MS) {
            sock = win_try_connect_tcp();
            if (sock >= 0) break;
            Sleep(200);
        }

        if (sock < 0) {
            fprintf(stderr, "[Comm] Timeout waiting for Core\n");
            return 1;
        }
    }

    int result = win_run_proxy(sock);
    close(sock);
    return result;
}

// ============================================================================
// Unix implementation
// ============================================================================

static int unix_try_connect_socket(void) {
    int sock = socket(AF_UNIX, SOCK_STREAM, 0);
    if (sock < 0) return -1;

    struct sockaddr_un addr = {0};
    addr.sun_family = AF_UNIX;
    strncpy(addr.sun_path, PIPE_PATH_UNIX, sizeof(addr.sun_path) - 1);

    if (connect(sock, (struct sockaddr*)&addr, sizeof(addr)) < 0) {
        close(sock);
        return -1;
    }

    return sock;
}

static int unix_get_exe_dir(char *buf, size_t buf_size) {
    // Use Cosmopolitan's GetProgramExecutableName
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

static int unix_start_core(int argc, char **argv) {
    char exe_path[2048];
    char core_path[2200];

    // Priority 1: Check ULTRASCRIPT_CORE_PATH environment variable
    // (set by bin/ultrascript.js wrapper when installed via npm)
    char *env_core_path = getenv("ULTRASCRIPT_CORE_PATH");
    if (env_core_path && access(env_core_path, F_OK) == 0) {
        strncpy(core_path, env_core_path, sizeof(core_path) - 1);
        core_path[sizeof(core_path) - 1] = '\0';
    } else {
        // Priority 2: Look relative to exe (local dev or direct binary usage)
        unix_get_exe_dir(exe_path, sizeof(exe_path));
        snprintf(core_path, sizeof(core_path), "%s/index.js", exe_path);
    }

    pid_t pid = fork();
    if (pid < 0) return -1;

    if (pid == 0) {
        setsid();
        close(STDIN_FILENO);
        close(STDOUT_FILENO);
        close(STDERR_FILENO);

        // Check if Node.js MCP server exists
        if (access(core_path, R_OK) == 0) {
            // Use Node.js with --pipe for multi-client TCP mode
            char **new_argv = malloc((argc + 3) * sizeof(char*));
            new_argv[0] = "node";
            new_argv[1] = core_path;
            new_argv[2] = "--pipe";
            for (int i = 1; i < argc; i++) {
                new_argv[i + 2] = argv[i];
            }
            new_argv[argc + 2] = NULL;
            execvp("node", new_argv);
        } else {
            // Fallback: try ultrascript-core binary
            snprintf(core_path, sizeof(core_path), "%s/ultrascript-core", exe_path);

            char **new_argv = malloc((argc + 1) * sizeof(char*));
            new_argv[0] = core_path;
            for (int i = 1; i < argc; i++) {
                new_argv[i] = argv[i];
            }
            new_argv[argc] = NULL;
            execv(core_path, new_argv);
        }

        _exit(1);
    }

    return 0;
}

static int unix_run_proxy(int sock) {
    char stdin_buf[BUFFER_SIZE];
    char sock_buf[BUFFER_SIZE];

    fcntl(STDIN_FILENO, F_SETFL, O_NONBLOCK);
    fcntl(sock, F_SETFL, O_NONBLOCK);

    struct pollfd fds[2] = {
        { .fd = STDIN_FILENO, .events = POLLIN },
        { .fd = sock, .events = POLLIN }
    };

    while (g_running) {
        int ready = poll(fds, 2, 100);
        if (ready < 0) {
            if (errno == EINTR) continue;
            break;
        }
        if (ready == 0) continue;

        if (fds[0].revents & POLLIN) {
            ssize_t n = read(STDIN_FILENO, stdin_buf, BUFFER_SIZE);
            if (n <= 0) break;
            if (write(sock, stdin_buf, n) < 0) break;
        }

        if (fds[1].revents & POLLIN) {
            ssize_t n = read(sock, sock_buf, BUFFER_SIZE);
            if (n <= 0) break;
            if (write(STDOUT_FILENO, sock_buf, n) < 0) break;
        }

        if ((fds[0].revents | fds[1].revents) & (POLLHUP | POLLERR)) {
            break;
        }
    }

    return 0;
}

static int unix_main(int argc, char **argv) {
    signal(SIGINT, signal_handler);
    signal(SIGTERM, signal_handler);
    signal(SIGPIPE, SIG_IGN);

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

    int sock = unix_try_connect_socket();

    if (sock < 0) {
        if (unix_start_core(argc, argv) != 0) {
            fprintf(stderr, "Failed to start Core\n");
            return 1;
        }

        long start = get_time_ms();
        while (get_time_ms() - start < STARTUP_TIMEOUT_MS) {
            sock = unix_try_connect_socket();
            if (sock >= 0) break;
            usleep(200000);
        }

        if (sock < 0) {
            fprintf(stderr, "Timeout waiting for Core\n");
            return 1;
        }
    }

    int result = unix_run_proxy(sock);
    close(sock);
    return result;
}

// ============================================================================
// Main - runtime OS detection
// ============================================================================

int main(int argc, char **argv) {
    // Disable stderr buffering for immediate output
    setbuf(stderr, NULL);

    if (IsWindows()) {
        return win_main(argc, argv);
    } else {
        return unix_main(argc, argv);
    }
}
