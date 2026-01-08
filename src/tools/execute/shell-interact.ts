import { tool } from "ai";
import { z } from "zod";
import { getSharedSession } from "./shared-tmux-session";

const SPECIAL_KEYS: Record<string, string> = {
  enter: "Enter",
  tab: "Tab",
  escape: "Escape",
  esc: "Escape",
  backspace: "BSpace",
  delete: "DC",
  del: "DC",
  up: "Up",
  down: "Down",
  left: "Left",
  right: "Right",
  home: "Home",
  end: "End",
  pageup: "PPage",
  pagedown: "NPage",
  space: "Space",
  "ctrl+c": "C-c",
  "ctrl+d": "C-d",
  "ctrl+z": "C-z",
  "ctrl+l": "C-l",
  "ctrl+a": "C-a",
  "ctrl+e": "C-e",
  "ctrl+k": "C-k",
  "ctrl+u": "C-u",
  "ctrl+w": "C-w",
  "ctrl+r": "C-r",
};

function parseKeys(input: string): string[] {
  const keys: string[] = [];
  let i = 0;

  while (i < input.length) {
    let matched = false;

    for (const [name, tmuxKey] of Object.entries(SPECIAL_KEYS)) {
      if (input.slice(i).toLowerCase().startsWith(`<${name}>`)) {
        keys.push(tmuxKey);
        i += name.length + 2;
        matched = true;
        break;
      }
    }

    if (!matched) {
      keys.push(input[i]);
      i++;
    }
  }

  return keys;
}

export interface InteractResult {
  success: boolean;
  output: string;
}

export const shellInteractTool = tool({
  description:
    "Send keystrokes to the SAME terminal session as shell_execute. " +
    "IMPORTANT: Keystrokes are sent verbatim - you MUST include '<Enter>' or '\\n' to execute commands. " +
    "Use for: (1) interactive programs, (2) responding to prompts, (3) recovering from shell_execute timeout with '<Ctrl+C>'. " +
    "Special keys: <Enter>, <Tab>, <Escape>, <Up>, <Down>, <Left>, <Right>, " +
    "<Ctrl+C>, <Ctrl+D>, <Ctrl+Z>, <Ctrl+L>, <Backspace>, <Delete>, <Home>, <End>. " +
    "Examples: 'ls -la<Enter>' to run command, 'y<Enter>' for yes, '<Ctrl+C>' to interrupt.",

  inputSchema: z.object({
    keystrokes: z
      .string()
      .describe(
        "Keystrokes to send. Use <SpecialKey> syntax for special keys. Example: 'yes<Enter>', '<Ctrl+C>', 'n<Enter>'"
      ),
    duration: z
      .number()
      .optional()
      .describe("Time to wait after sending keys in ms (default: 500)"),
  }),

  needsApproval: true,

  execute: async ({ keystrokes, duration }): Promise<InteractResult> => {
    const session = getSharedSession();
    const parsedKeys = parseKeys(keystrokes);
    const waitTime = duration ?? 500;

    const output = await session.sendKeys(parsedKeys, {
      block: false,
      minTimeoutMs: waitTime,
    });

    return {
      success: true,
      output: output.trim() || "(no visible output)",
    };
  },
});
