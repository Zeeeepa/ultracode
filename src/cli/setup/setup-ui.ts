/**
 * UI utilities for setup command - colors, printing, prompts
 *
 * Bun quirk: process.stdout and process.stderr may be undefined or lack .write()
 * when launched in certain modes. We use writeErr() everywhere as a safe wrapper.
 */

import { closeSync, openSync, readSync, writeSync } from "node:fs";
import rlModule from "node:readline";

// Safe stderr write that works even when process.stderr is broken (Bun edge cases)
let _stderrFd: number | null = null;
function writeErr(msg: string): void {
  // Try process.stderr first
  try {
    if (process.stderr?.write) {
      process.stderr.write(msg);
      return;
    }
  } catch {
    /* fall through */
  }
  // Fallback: write to fd 2 directly
  try {
    if (_stderrFd === null) _stderrFd = 2; // fd 2 = stderr
    writeSync(_stderrFd, msg);
  } catch {
    /* give up */
  }
}

// Clear screen
export function clearScreen(): void {
  try {
    writeErr("\x1b[2J\x1b[H");
  } catch {
    // No TTY available — skip
  }
}

// Colors (avoiding bold \x1b[1m which shows as red on some Windows terminals)
export const c = {
  reset: "\x1b[0m",
  bright: "\x1b[97m", // Bright white instead of bold
  dim: "\x1b[90m", // Gray
  red: "\x1b[31m",
  green: "\x1b[32m",
  yellow: "\x1b[33m",
  blue: "\x1b[34m",
  magenta: "\x1b[35m",
  cyan: "\x1b[36m",
  white: "\x1b[37m",
};

export function printBanner(): void {
  console.error("");
  console.error(`${c.cyan}        ██  ██${c.reset}`);
  console.error(`${c.cyan}        ██  ██  ██    ██████ █████▄  ▄████▄${c.reset}`);
  console.error(`${c.cyan}        ██  ██  ██      ██   ██▄▄██▄ ██▄▄██${c.reset}`);
  console.error(`${c.cyan}        ██  ██  ██      ██   ██   ██ ██  ██${c.reset}`);
  console.error(`${c.cyan}        ██  ██  ██████  ██   ██   ██ ██  ██${c.reset}`);
  console.error(`${c.cyan}        ▀████▀          ▄████ ▄████▄ █████▄ █████${c.reset}`);
  console.error(`${c.cyan}                        ██    ██  ██ ██  ██ ██▄▄▄${c.reset}`);
  console.error(`${c.cyan}                        ▀████ ▀████▀ █████▀ ██▄▄▄${c.reset}`);
  console.error("");
  console.error(`${c.bright}     ╔═════════════════════════════════════════════════════╗${c.reset}`);
  console.error(`${c.bright}     ║              SEMANTIC EMBEDDING SETUP               ║${c.reset}`);
  console.error(`${c.bright}     ╚═════════════════════════════════════════════════════╝${c.reset}`);
  console.error("");
}

export function printOK(msg: string): void {
  console.error(`${c.green}[OK]${c.reset} ${msg}`);
}

export function printInfo(msg: string): void {
  console.error(`${c.cyan}[INFO]${c.reset} ${msg}`);
}

export function printWarn(msg: string): void {
  console.error(`${c.yellow}[WARN]${c.reset} ${msg}`);
}

export function printError(msg: string): void {
  console.error(`${c.red}[ERROR]${c.reset} ${msg}`);
}

export function prompt(question: string): Promise<string> {
  // Strategy 1: Use readline on process.stdin if it's a TTY
  if (process.stdin.isTTY) {
    console.error(question);
    const rl = rlModule.createInterface({ input: process.stdin, output: process.stderr });
    return new Promise<string>((resolve) => {
      rl.question("", (answer: string) => {
        rl.close();
        resolve(answer.trim());
      });
    });
  }

  // Strategy 2: Synchronous read from terminal device
  // Unix: /dev/tty always works. Windows: \\.\CON opens the console device.
  // Strategy 2: Synchronous read/write via terminal device
  // Windows: \\.\CON is both input and output. Unix: /dev/tty.
  const ttyDevice = process.platform === "win32" ? "\\\\.\\CON" : "/dev/tty";
  try {
    // Open for writing to display prompt directly on console
    const wfd = openSync(ttyDevice, "w");
    writeSync(wfd, question);
    closeSync(wfd);

    // Open for reading user input
    const rfd = openSync(ttyDevice, "r");
    const buf = Buffer.alloc(1024);
    let line = "";
    while (true) {
      const bytesRead = readSync(rfd, buf, 0, 1, null);
      if (bytesRead === 0) break;
      const ch = buf.toString("utf8", 0, 1);
      if (ch === "\n" || ch === "\r") break;
      line += ch;
    }
    closeSync(rfd);
    return Promise.resolve(line.trim());
  } catch {
    // No TTY — return empty (defaults will be used)
    return Promise.resolve("");
  }
}

export function printCompleteBanner(): void {
  console.error("");
  console.error(`${c.green}${c.bright}╔═══════════════════════════════════════════════════════════════╗${c.reset}`);
  console.error(`${c.green}${c.bright}║                     Setup Complete!                           ║${c.reset}`);
  console.error(`${c.green}${c.bright}╚═══════════════════════════════════════════════════════════════╝${c.reset}`);
  console.error("");
}
