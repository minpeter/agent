import { spawnSync } from "node:child_process";
import {
  detectLinuxProcTtyWait,
  isLinuxPlatform,
} from "./linux-proc-detector.js";
import { detectOutputStallSync } from "./output-stall-detector.js";

const WHITESPACE_SPLIT = /\s+/;
const SHELL_PROMPT_ONLY = /^\s*[$#%]\s*$/;
const PROMPT_INDICATOR_1 = /[?:>]\s*$/;
const PROMPT_INDICATOR_2 = /\]\s*$/;

export type DetectionMethod =
  | "regex_pattern"
  | "process_state"
  | "last_line_prompt"
  | "cursor_at_prompt"
  | "linux_proc_tty_wait"
  | "output_stall";

export interface DetectionResult {
  detected: boolean;
  method: DetectionMethod;
  confidence: "high" | "medium" | "low";
  detail: string;
  suggestedActions: string[];
}

export interface DetectionContext {
  terminalContent: string;
  sessionId?: string;
}

interface PatternMatch {
  pattern: string;
  description: string;
  suggestedResponse: string;
}

const INTERACTIVE_PATTERNS: PatternMatch[] = [
  {
    pattern: "\\[Y/n\\]",
    description: "Yes/No prompt (default Yes)",
    suggestedResponse: "Y<Enter> or N<Enter>",
  },
  {
    pattern: "\\[y/N\\]",
    description: "Yes/No prompt (default No)",
    suggestedResponse: "y<Enter> or N<Enter>",
  },
  {
    pattern: "\\(Y/I/N/O/D/Z\\)",
    description: "dpkg config file conflict",
    suggestedResponse:
      "N<Enter> (keep current) or Y<Enter> (use package version)",
  },
  {
    pattern: "\\[yes/no\\]",
    description: "Yes/No confirmation",
    suggestedResponse: "yes<Enter> or no<Enter>",
  },
  {
    pattern: "Press \\[ENTER\\] to continue",
    description: "Continue prompt",
    suggestedResponse: "<Enter>",
  },
  {
    pattern: "\\(y/n\\)",
    description: "Yes/No prompt",
    suggestedResponse: "y<Enter> or n<Enter>",
  },
  {
    pattern: "Do you want to continue\\?",
    description: "Continue confirmation",
    suggestedResponse: "y<Enter> or n<Enter>",
  },
  {
    pattern: "Are you sure\\?",
    description: "Confirmation prompt",
    suggestedResponse: "y<Enter> or n<Enter>",
  },
  {
    pattern: "[Pp]assword:",
    description: "Password prompt",
    suggestedResponse: "Enter password then <Enter>, or <Ctrl+C> to cancel",
  },
  {
    pattern: "\\[default=\\w+\\]",
    description: "Prompt with default value",
    suggestedResponse: "<Enter> for default, or type value then <Enter>",
  },
  {
    pattern: "Enter passphrase",
    description: "Passphrase prompt",
    suggestedResponse: "Enter passphrase then <Enter>",
  },
  {
    pattern: "\\(yes/no/\\[fingerprint\\]\\)",
    description: "SSH host key verification",
    suggestedResponse: "yes<Enter> to accept, no<Enter> to reject",
  },
  {
    pattern: "Press any key to continue",
    description: "Any key prompt",
    suggestedResponse: "<Enter> or <Space>",
  },
  {
    pattern: "Hit:.*\\nGet:",
    description: "apt-get in progress (not interactive)",
    suggestedResponse: "",
  },
];

const LAST_LINE_PROMPT_PATTERNS = [
  { pattern: /[?:>]\s*$/, description: "Ends with ?, :, or >" },
  { pattern: /\]\s*$/, description: "Ends with ] (likely prompt)" },
  { pattern: /[$#%]\s*$/, description: "Shell prompt character" },
  { pattern: /\(.*\)\s*[?]?\s*$/, description: "Choice in parentheses" },
  { pattern: /\.\.\.\s*$/, description: "Ends with ... (waiting indicator)" },
  { pattern: />>>\s*$/, description: "Python/REPL prompt" },
  { pattern: /input/i, description: "Contains 'input' keyword" },
  { pattern: /enter\s+(your|a|the)/i, description: "Prompting for input" },
  { pattern: /waiting/i, description: "Contains 'waiting' keyword" },
  { pattern: /press\s+/i, description: "Press key prompt" },
  { pattern: /type\s+(your|a|the)/i, description: "Type input prompt" },
];

function detectByRegexPattern(content: string): DetectionResult | null {
  for (const {
    pattern,
    description,
    suggestedResponse,
  } of INTERACTIVE_PATTERNS) {
    const regex = new RegExp(pattern, "i");
    if (regex.test(content)) {
      if (!suggestedResponse) {
        return null;
      }
      return {
        detected: true,
        method: "regex_pattern",
        confidence: "high",
        detail: `Pattern matched: "${description}"`,
        suggestedActions: [
          `Respond with: ${suggestedResponse}`,
          "Or use <Ctrl+C> to cancel/interrupt",
        ],
      };
    }
  }
  return null;
}

function detectByProcessState(sessionId: string): DetectionResult | null {
  try {
    const ttyResult = spawnSync(
      "/bin/bash",
      ["-c", `tmux display -t ${sessionId} -p "#{pane_tty}"`],
      { encoding: "utf-8" }
    );

    if (ttyResult.status !== 0 || !ttyResult.stdout.trim()) {
      return null;
    }

    const tty = ttyResult.stdout.trim().replace("/dev/", "");

    const psResult = spawnSync(
      "/bin/bash",
      ["-c", `ps -t ${tty} -o pid,stat,comm 2>/dev/null | grep '+' | tail -1`],
      { encoding: "utf-8" }
    );

    if (psResult.status !== 0 || !psResult.stdout.trim()) {
      return null;
    }

    const parts = psResult.stdout.trim().split(WHITESPACE_SPLIT);
    if (parts.length < 3) {
      return null;
    }

    const [, stat, comm] = parts;

    const isForeground = stat.includes("+");
    const isSleeping = stat.includes("S");
    const isInteractiveCandidate = [
      "bash",
      "sh",
      "zsh",
      "apt",
      "apt-get",
      "dpkg",
      "yum",
      "pacman",
      "ssh",
      "sudo",
    ].includes(comm);

    if (isForeground && isSleeping && isInteractiveCandidate) {
      return {
        detected: true,
        method: "process_state",
        confidence: "medium",
        detail: `Foreground process "${comm}" is sleeping (state: ${stat}) - may be waiting for input`,
        suggestedActions: [
          "Check terminal screen for prompts",
          "Try <Enter> if prompt expects input",
          "Use <Ctrl+C> to interrupt if stuck",
        ],
      };
    }

    return null;
  } catch {
    return null;
  }
}

function detectByLastLine(content: string): DetectionResult | null {
  const lines = content.split("\n").filter((line) => line.trim().length > 0);
  if (lines.length === 0) {
    return null;
  }

  const lastMeaningfulLine = [...lines]
    .reverse()
    .find((line) => !(line.includes("__CEA_") || line.includes("tmux wait")));

  if (!lastMeaningfulLine) {
    return null;
  }

  const lastLine = lastMeaningfulLine.trim();

  for (const { pattern, description } of LAST_LINE_PROMPT_PATTERNS) {
    if (pattern.test(lastLine)) {
      if (SHELL_PROMPT_ONLY.test(lastLine)) {
        return null;
      }

      return {
        detected: true,
        method: "last_line_prompt",
        confidence: "low",
        detail: `Last line analysis: ${description}. Line: "${lastLine.slice(0, 50)}${lastLine.length > 50 ? "..." : ""}"`,
        suggestedActions: [
          "Inspect the terminal screen for context",
          "If prompted, respond appropriately",
          "Use <Ctrl+C> if command appears stuck",
        ],
      };
    }
  }

  return null;
}

function detectByCursorPosition(
  content: string,
  sessionId: string
): DetectionResult | null {
  try {
    const cursorResult = spawnSync(
      "/bin/bash",
      ["-c", `tmux display -t ${sessionId} -p "#{cursor_x},#{cursor_y}"`],
      { encoding: "utf-8" }
    );

    if (cursorResult.status !== 0 || !cursorResult.stdout.trim()) {
      return null;
    }

    const [cursorX, cursorY] = cursorResult.stdout
      .trim()
      .split(",")
      .map(Number);

    const lines = content.split("\n");
    if (cursorY >= lines.length) {
      return null;
    }

    const currentLine = lines[cursorY] || "";

    const isAtEndOfContent = cursorX >= currentLine.trimEnd().length - 1;
    const lineHasPromptIndicator =
      PROMPT_INDICATOR_1.test(currentLine) ||
      PROMPT_INDICATOR_2.test(currentLine);

    if (
      isAtEndOfContent &&
      lineHasPromptIndicator &&
      currentLine.trim().length > 0
    ) {
      return {
        detected: true,
        method: "cursor_at_prompt",
        confidence: "medium",
        detail: `Cursor at position (${cursorX}, ${cursorY}) appears to be at end of prompt line`,
        suggestedActions: [
          "Terminal may be waiting for input at cursor position",
          "Try responding to the visible prompt",
          "Use <Ctrl+C> if uncertain",
        ],
      };
    }

    return null;
  } catch {
    return null;
  }
}

function detectByLinuxProc(sessionId: string): DetectionResult | null {
  if (!isLinuxPlatform()) {
    return null;
  }

  const procResult = detectLinuxProcTtyWait(sessionId);
  if (!procResult?.detected) {
    return null;
  }

  return {
    detected: true,
    method: "linux_proc_tty_wait",
    confidence: procResult.confidence,
    detail: procResult.detail,
    suggestedActions: [
      "Process is waiting for TTY input (detected via /proc)",
      "Check terminal screen for prompts",
      "Use <Ctrl+C> to interrupt if stuck",
    ],
  };
}

function detectByOutputStall(sessionId: string): DetectionResult | null {
  const stallResult = detectOutputStallSync(sessionId, 2, 300);

  if (!stallResult.isStalled) {
    return null;
  }

  return {
    detected: true,
    method: "output_stall",
    confidence: stallResult.confidence,
    detail: stallResult.detail,
    suggestedActions: [
      "Terminal output has stalled - may be waiting for input",
      "Check terminal screen for prompts",
      "Use <Ctrl+C> to interrupt if stuck",
    ],
  };
}

export function detectInteractivePrompt(
  context: DetectionContext
): DetectionResult[] {
  const results: DetectionResult[] = [];
  const { terminalContent, sessionId } = context;

  const regexResult = detectByRegexPattern(terminalContent);
  if (regexResult) {
    results.push(regexResult);
  }

  if (sessionId) {
    const linuxProcResult = detectByLinuxProc(sessionId);
    if (linuxProcResult) {
      results.push(linuxProcResult);
    }

    const processResult = detectByProcessState(sessionId);
    if (processResult) {
      results.push(processResult);
    }

    const cursorResult = detectByCursorPosition(terminalContent, sessionId);
    if (cursorResult) {
      results.push(cursorResult);
    }

    const stallResult = detectByOutputStall(sessionId);
    if (stallResult) {
      results.push(stallResult);
    }
  }

  const lastLineResult = detectByLastLine(terminalContent);
  if (lastLineResult) {
    results.push(lastLineResult);
  }

  results.sort((a, b) => {
    const confidenceOrder = { high: 0, medium: 1, low: 2 };
    return confidenceOrder[a.confidence] - confidenceOrder[b.confidence];
  });

  return results;
}

export function formatDetectionResults(results: DetectionResult[]): string {
  if (results.length === 0) {
    return "";
  }

  const lines: string[] = [
    "[INTERACTIVE PROMPT DETECTED]",
    "",
    "⚠️  TERMINAL BLOCKED - DO NOT use shell_execute  ⚠️",
    "",
    "The terminal is occupied by a running process.",
    "If you call shell_execute now, your command will be sent AS INPUT to this process,",
    "NOT executed as a new command. This will cause unexpected behavior.",
    "",
  ];

  for (const result of results) {
    lines.push(
      `• Detection method: ${result.method} (confidence: ${result.confidence})`
    );
    lines.push(`  ${result.detail}`);
  }

  lines.push("");
  lines.push("[REQUIRED ACTIONS]");

  const highConfidenceResult = results.find((r) => r.confidence === "high");
  if (highConfidenceResult) {
    for (const action of highConfidenceResult.suggestedActions) {
      lines.push(`• ${action}`);
    }
  } else {
    const allActions = new Set<string>();
    for (const result of results) {
      for (const action of result.suggestedActions) {
        allActions.add(action);
      }
    }
    for (const action of allActions) {
      lines.push(`• ${action}`);
    }
  }

  lines.push("");
  lines.push("[FOR LONG-RUNNING PROCESSES]");
  lines.push("If you intended to start a server or long-running task:");
  lines.push(
    "1. First: shell_interact('<Ctrl+C>') to terminate the current process"
  );
  lines.push(
    "2. Then: shell_execute('nohup your_command > /tmp/output.log 2>&1 &') for background execution"
  );
  lines.push(
    "3. Verify: shell_execute('curl ...') or other commands to test the service"
  );

  return lines.join("\n");
}
