import { describe, expect, it } from "bun:test";
import { platform } from "node:os";
import {
  isLinuxPlatform,
  type LinuxProcDetectionResult,
  type ProcSignal,
} from "./linux-proc-detector";

describe("isLinuxPlatform", () => {
  it("returns correct value for current platform", () => {
    const result = isLinuxPlatform();
    const expected = platform() === "linux";

    expect(result).toBe(expected);
  });
});

describe("LinuxProcDetectionResult interface", () => {
  it("has correct structure", () => {
    const result: LinuxProcDetectionResult = {
      detected: true,
      confidence: "high",
      detail: "Process waiting for TTY input",
      signals: [],
      pid: 12_345,
      command: "bash",
    };

    expect(result.detected).toBe(true);
    expect(result.confidence).toBe("high");
    expect(result.detail).toBe("Process waiting for TTY input");
    expect(result.signals).toEqual([]);
    expect(result.pid).toBe(12_345);
    expect(result.command).toBe("bash");
  });

  it("supports null pid and command", () => {
    const result: LinuxProcDetectionResult = {
      detected: false,
      confidence: "low",
      detail: "No process found",
      signals: [],
      pid: null,
      command: null,
    };

    expect(result.pid).toBeNull();
    expect(result.command).toBeNull();
  });
});

describe("ProcSignal interface", () => {
  it("has correct structure", () => {
    const signal: ProcSignal = {
      name: "wchan",
      value: "n_tty_read",
      indicatesInputWait: true,
    };

    expect(signal.name).toBe("wchan");
    expect(signal.value).toBe("n_tty_read");
    expect(signal.indicatesInputWait).toBe(true);
  });
});

describe("TTY read pattern matching logic", () => {
  const TTY_READ_WCHAN_PATTERNS = [
    "n_tty_read",
    "tty_read",
    "wait_woken",
    "do_select",
    "poll_schedule_timeout",
  ];

  const checkWchanForTtyRead = (wchan: string | null): boolean => {
    if (!wchan) {
      return false;
    }
    return TTY_READ_WCHAN_PATTERNS.some((pattern) =>
      wchan.toLowerCase().includes(pattern.toLowerCase())
    );
  };

  it("detects n_tty_read in wchan", () => {
    expect(checkWchanForTtyRead("n_tty_read")).toBe(true);
  });

  it("detects tty_read in wchan", () => {
    expect(checkWchanForTtyRead("tty_read")).toBe(true);
  });

  it("detects wait_woken in wchan", () => {
    expect(checkWchanForTtyRead("wait_woken")).toBe(true);
  });

  it("detects do_select in wchan", () => {
    expect(checkWchanForTtyRead("do_select")).toBe(true);
  });

  it("detects poll_schedule_timeout in wchan", () => {
    expect(checkWchanForTtyRead("poll_schedule_timeout")).toBe(true);
  });

  it("returns false for null wchan", () => {
    expect(checkWchanForTtyRead(null)).toBe(false);
  });

  it("returns false for unrelated wchan", () => {
    expect(checkWchanForTtyRead("futex_wait")).toBe(false);
  });

  it("is case insensitive", () => {
    expect(checkWchanForTtyRead("N_TTY_READ")).toBe(true);
    expect(checkWchanForTtyRead("TTY_Read")).toBe(true);
  });
});

describe("syscall parsing logic", () => {
  const checkSyscallForStdinRead = (syscall: string | null): boolean => {
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
  };

  it("detects read syscall on stdin (numeric format)", () => {
    expect(checkSyscallForStdinRead("0 0x0 0x7fff...")).toBe(true);
  });

  it("detects read syscall on stdin (named format)", () => {
    expect(checkSyscallForStdinRead("read 0 0x7fff...")).toBe(true);
  });

  it("returns false for running process", () => {
    expect(checkSyscallForStdinRead("running")).toBe(false);
  });

  it("returns false for null syscall", () => {
    expect(checkSyscallForStdinRead(null)).toBe(false);
  });

  it("returns false for read on non-stdin fd", () => {
    expect(checkSyscallForStdinRead("0 0x3 0x7fff...")).toBe(false);
  });

  it("returns false for non-read syscall", () => {
    expect(checkSyscallForStdinRead("1 0x0 0x7fff...")).toBe(false);
  });
});

describe("confidence determination logic", () => {
  const determineConfidence = (
    stdinMatchesTty: boolean,
    wchanIndicatesTtyRead: boolean,
    stackIndicatesTtyRead: boolean,
    syscallIndicatesStdinRead: boolean,
    positiveSignals: number
  ): { detected: boolean; confidence: "high" | "medium" | "low" } => {
    if (stdinMatchesTty && (wchanIndicatesTtyRead || stackIndicatesTtyRead)) {
      return { detected: true, confidence: "high" };
    }
    if (
      stdinMatchesTty &&
      (syscallIndicatesStdinRead || positiveSignals >= 2)
    ) {
      return { detected: true, confidence: "medium" };
    }
    if (positiveSignals >= 1) {
      return { detected: true, confidence: "low" };
    }
    return { detected: false, confidence: "low" };
  };

  it("returns high confidence when stdin matches and wchan indicates tty read", () => {
    const result = determineConfidence(true, true, false, false, 2);

    expect(result.detected).toBe(true);
    expect(result.confidence).toBe("high");
  });

  it("returns high confidence when stdin matches and stack indicates tty read", () => {
    const result = determineConfidence(true, false, true, false, 2);

    expect(result.detected).toBe(true);
    expect(result.confidence).toBe("high");
  });

  it("returns medium confidence when stdin matches and syscall indicates stdin read", () => {
    const result = determineConfidence(true, false, false, true, 1);

    expect(result.detected).toBe(true);
    expect(result.confidence).toBe("medium");
  });

  it("returns medium confidence when stdin matches and 2+ positive signals", () => {
    const result = determineConfidence(true, false, false, false, 2);

    expect(result.detected).toBe(true);
    expect(result.confidence).toBe("medium");
  });

  it("returns low confidence when only 1 positive signal", () => {
    const result = determineConfidence(false, false, false, false, 1);

    expect(result.detected).toBe(true);
    expect(result.confidence).toBe("low");
  });

  it("returns not detected when no positive signals", () => {
    const result = determineConfidence(false, false, false, false, 0);

    expect(result.detected).toBe(false);
    expect(result.confidence).toBe("low");
  });
});
