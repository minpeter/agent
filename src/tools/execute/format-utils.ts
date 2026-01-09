import {
  detectInteractivePrompt,
  formatDetectionResults,
} from "./interactive-detector";

const TERMINAL_SCREEN_PREFIX = "=== Current Terminal Screen ===";
const TERMINAL_SCREEN_SUFFIX = "=== End of Screen ===";

const SYSTEM_REMINDER_PREFIX = "[SYSTEM REMINDER]";
const TIMEOUT_PREFIX = "[TIMEOUT]";
const BACKGROUND_PREFIX = "[Background process started]";

export function formatTerminalScreen(content: string): string {
  const trimmed = content.trim();
  if (!trimmed) {
    return "(no visible output)";
  }
  return `${TERMINAL_SCREEN_PREFIX}\n${trimmed}\n${TERMINAL_SCREEN_SUFFIX}`;
}

export function formatSystemReminder(message: string): string {
  return `${SYSTEM_REMINDER_PREFIX} ${message}`;
}

export interface TimeoutMessageOptions {
  timeoutMs: number;
  terminalScreen: string;
  sessionId?: string;
}

export function formatTimeoutMessage(options: TimeoutMessageOptions): string;
export function formatTimeoutMessage(
  timeoutMs: number,
  terminalScreen: string,
  sessionId?: string
): string;
export function formatTimeoutMessage(
  optionsOrTimeoutMs: TimeoutMessageOptions | number,
  terminalScreen?: string,
  sessionId?: string
): string {
  let timeoutMs: number;
  let screen: string;
  let session: string | undefined;

  if (typeof optionsOrTimeoutMs === "object") {
    timeoutMs = optionsOrTimeoutMs.timeoutMs;
    screen = optionsOrTimeoutMs.terminalScreen;
    session = optionsOrTimeoutMs.sessionId;
  } else {
    timeoutMs = optionsOrTimeoutMs;
    screen = terminalScreen ?? "";
    session = sessionId;
  }

  const formattedScreen = formatTerminalScreen(screen);

  const detectionResults = detectInteractivePrompt({
    terminalContent: screen,
    sessionId: session,
  });

  if (detectionResults.length > 0) {
    const detectionInfo = formatDetectionResults(detectionResults);
    return `${detectionInfo}\n\n${formattedScreen}`;
  }

  const timeoutHeader = `${TIMEOUT_PREFIX} Command timed out after ${timeoutMs}ms. The process may still be running.`;

  const possibleCauses = [
    "• The command is still executing (long-running process)",
    "• The process is waiting for input not detected by pattern matching",
    "• The process is stuck or hanging",
  ];

  const suggestedActions = [
    "• Use shell_interact('<Ctrl+C>') to interrupt",
    "• Use shell_interact('<Enter>') if it might be waiting for confirmation",
    "• Check the terminal screen above for any prompts or messages",
    "• If the process should continue, increase timeout_ms parameter",
  ];

  const reminder = [
    "[POSSIBLE CAUSES]",
    ...possibleCauses,
    "",
    "[SUGGESTED ACTIONS]",
    ...suggestedActions,
  ].join("\n");

  return `${timeoutHeader}\n\n${formattedScreen}\n\n${reminder}`;
}

export function formatBackgroundMessage(terminalScreen: string): string {
  const screen = formatTerminalScreen(terminalScreen);
  const reminder = formatSystemReminder(
    "The process is running in the background. Use shell_interact to check status or send signals."
  );
  return `${BACKGROUND_PREFIX}\n\n${screen}\n\n${reminder}`;
}
