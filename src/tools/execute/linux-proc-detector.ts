import { spawnSync } from "node:child_process";
import { readFileSync, readlinkSync } from "node:fs";
import { platform } from "node:os";

const WHITESPACE_SPLIT = /\s+/;

export interface LinuxProcDetectionResult {
  detected: boolean;
  confidence: "high" | "medium" | "low";
  detail: string;
  signals: ProcSignal[];
  pid: number | null;
  command: string | null;
}

export interface ProcSignal {
  name: string;
  value: string;
  indicatesInputWait: boolean;
}

const TTY_READ_WCHAN_PATTERNS = [
  "n_tty_read",
  "tty_read",
  "wait_woken",
  "do_select",
  "poll_schedule_timeout",
];

const TTY_READ_STACK_PATTERNS = [
  "n_tty_read",
  "tty_read",
  "pty_write",
  "tty_ldisc_receive_buf",
];

export function isLinuxPlatform(): boolean {
  return platform() === "linux";
}

export function getForegroundPid(tty: string): number | null {
  try {
    const ttyName = tty.replace("/dev/", "");
    const result = spawnSync(
      "/bin/bash",
      [
        "-c",
        `ps -t ${ttyName} -o pid,stat,comm --no-headers | grep '+' | head -1`,
      ],
      { encoding: "utf-8" }
    );

    if (result.status !== 0 || !result.stdout.trim()) {
      return null;
    }

    const parts = result.stdout.trim().split(WHITESPACE_SPLIT);
    if (parts.length < 1) {
      return null;
    }

    const pid = Number.parseInt(parts[0], 10);
    return Number.isNaN(pid) ? null : pid;
  } catch {
    return null;
  }
}

export function getProcessCommand(pid: number): string | null {
  try {
    const comm = readFileSync(`/proc/${pid}/comm`, "utf-8").trim();
    return comm || null;
  } catch {
    return null;
  }
}

export function getProcessStdinFd(pid: number): string | null {
  try {
    const fd0 = readlinkSync(`/proc/${pid}/fd/0`);
    return fd0;
  } catch {
    return null;
  }
}

export function getProcessWchan(pid: number): string | null {
  try {
    const wchan = readFileSync(`/proc/${pid}/wchan`, "utf-8").trim();
    return wchan === "0" ? null : wchan;
  } catch {
    return null;
  }
}

export function getProcessStack(pid: number): string | null {
  try {
    const stack = readFileSync(`/proc/${pid}/stack`, "utf-8");
    return stack;
  } catch {
    return null;
  }
}

export function getProcessSyscall(pid: number): string | null {
  try {
    const syscall = readFileSync(`/proc/${pid}/syscall`, "utf-8").trim();
    return syscall;
  } catch {
    return null;
  }
}

function checkWchanForTtyRead(wchan: string | null): boolean {
  if (!wchan) {
    return false;
  }
  return TTY_READ_WCHAN_PATTERNS.some((pattern) =>
    wchan.toLowerCase().includes(pattern.toLowerCase())
  );
}

function checkStackForTtyRead(stack: string | null): boolean {
  if (!stack) {
    return false;
  }
  return TTY_READ_STACK_PATTERNS.some((pattern) =>
    stack.toLowerCase().includes(pattern.toLowerCase())
  );
}

function checkSyscallForStdinRead(syscall: string | null): boolean {
  if (!syscall) {
    return false;
  }
  if (syscall === "running") {
    return false;
  }

  const parts = syscall.split(" ");
  if (parts.length < 2) {
    return false;
  }

  const syscallNum = parts[0];
  const fd = parts[1];

  const isReadSyscall = syscallNum === "0" || syscallNum === "read";
  const isStdinFd = fd === "0x0" || fd === "0";

  return isReadSyscall && isStdinFd;
}

export function detectLinuxProcTtyWait(
  sessionId: string
): LinuxProcDetectionResult | null {
  if (!isLinuxPlatform()) {
    return null;
  }

  try {
    const ttyResult = spawnSync(
      "/bin/bash",
      ["-c", `tmux display -t ${sessionId} -p "#{pane_tty}"`],
      { encoding: "utf-8" }
    );

    if (ttyResult.status !== 0 || !ttyResult.stdout.trim()) {
      return null;
    }

    const paneTty = ttyResult.stdout.trim();
    const pid = getForegroundPid(paneTty);

    if (!pid) {
      return null;
    }

    const command = getProcessCommand(pid);
    const stdinFd = getProcessStdinFd(pid);
    const wchan = getProcessWchan(pid);
    const stack = getProcessStack(pid);
    const syscall = getProcessSyscall(pid);

    const signals: ProcSignal[] = [];

    const stdinMatchesTty = stdinFd === paneTty;
    signals.push({
      name: "stdin_fd",
      value: stdinFd || "unknown",
      indicatesInputWait: stdinMatchesTty,
    });

    const wchanIndicatesTtyRead = checkWchanForTtyRead(wchan);
    signals.push({
      name: "wchan",
      value: wchan || "unknown",
      indicatesInputWait: wchanIndicatesTtyRead,
    });

    const stackIndicatesTtyRead = checkStackForTtyRead(stack);
    signals.push({
      name: "stack",
      value: stackIndicatesTtyRead ? "contains tty_read frames" : "no tty_read",
      indicatesInputWait: stackIndicatesTtyRead,
    });

    const syscallIndicatesStdinRead = checkSyscallForStdinRead(syscall);
    signals.push({
      name: "syscall",
      value: syscall || "unknown",
      indicatesInputWait: syscallIndicatesStdinRead,
    });

    const positiveSignals = signals.filter((s) => s.indicatesInputWait).length;

    let confidence: "high" | "medium" | "low";
    let detected: boolean;

    if (stdinMatchesTty && (wchanIndicatesTtyRead || stackIndicatesTtyRead)) {
      confidence = "high";
      detected = true;
    } else if (
      stdinMatchesTty &&
      (syscallIndicatesStdinRead || positiveSignals >= 2)
    ) {
      confidence = "medium";
      detected = true;
    } else if (positiveSignals >= 1) {
      confidence = "low";
      detected = true;
    } else {
      confidence = "low";
      detected = false;
    }

    const signalSummary = signals
      .filter((s) => s.indicatesInputWait)
      .map((s) => s.name)
      .join(", ");

    return {
      detected,
      confidence,
      detail: detected
        ? `Linux /proc analysis: Process "${command}" (PID ${pid}) appears to be waiting for TTY input. Positive signals: ${signalSummary || "none"}`
        : `Linux /proc analysis: Process "${command}" (PID ${pid}) does not appear to be waiting for input`,
      signals,
      pid,
      command,
    };
  } catch {
    return null;
  }
}
