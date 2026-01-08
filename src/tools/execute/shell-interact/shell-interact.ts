import { spawn } from "node:child_process";
import { tool } from "ai";
import { z } from "zod";
import {
  BLOCKED_TMUX_SUBCOMMANDS,
  DEFAULT_TIMEOUT_MS,
  SHELL_INTERACT_DESCRIPTION,
} from "./constants";
import { getCurrentSessionId, shellInteractHook } from "./hook";
import type { ShellInteractResult } from "./types";
import { getCachedTmuxPath, tokenizeCommand } from "./utils";

function executeTmuxCommand(tmuxCommand: string): Promise<ShellInteractResult> {
  return new Promise((resolve) => {
    const tmuxPath = getCachedTmuxPath() ?? "tmux";
    const parts = tokenizeCommand(tmuxCommand);

    if (parts.length === 0) {
      resolve({ success: false, output: "Error: Empty tmux command" });
      return;
    }

    const subcommand = parts[0].toLowerCase();
    if (BLOCKED_TMUX_SUBCOMMANDS.includes(subcommand)) {
      resolve({
        success: false,
        output: `Error: '${parts[0]}' is blocked. Use shell_execute instead for capturing/printing terminal output.`,
      });
      return;
    }

    const fullCommand = `${tmuxPath} ${tmuxCommand}`;
    const child = spawn("/bin/bash", ["-c", fullCommand], {
      stdio: ["ignore", "pipe", "pipe"],
      env: { ...process.env, LANG: "en_US.UTF-8" },
    });

    let stdout = "";
    let stderr = "";
    let timedOut = false;

    const timeout = setTimeout(() => {
      timedOut = true;
      child.kill();
    }, DEFAULT_TIMEOUT_MS);

    child.stdout?.on("data", (data: Buffer) => {
      stdout += data.toString();
    });

    child.stderr?.on("data", (data: Buffer) => {
      stderr += data.toString();
    });

    child.on("exit", (code) => {
      clearTimeout(timeout);

      if (timedOut) {
        resolve({
          success: false,
          output: `Error: Timeout after ${DEFAULT_TIMEOUT_MS}ms`,
        });
        return;
      }

      if (code !== 0) {
        const errorMsg =
          stderr.trim() || `Command failed with exit code ${code}`;
        resolve({ success: false, output: `Error: ${errorMsg}` });
        return;
      }

      let output = stdout || "(no output)";

      const sessionId = getCurrentSessionId();
      if (sessionId) {
        const hookResult = shellInteractHook(sessionId, tmuxCommand, output);
        output = hookResult.output;
      }

      resolve({ success: true, output });
    });

    child.on("error", (err) => {
      clearTimeout(timeout);
      resolve({ success: false, output: `Error: ${err.message}` });
    });
  });
}

export const shellInteractTool = tool({
  description: SHELL_INTERACT_DESCRIPTION,
  needsApproval: true,

  inputSchema: z.object({
    tmux_command: z
      .string()
      .describe("The tmux command to execute (without 'tmux' prefix)"),
  }),

  execute: ({ tmux_command }): Promise<ShellInteractResult> => {
    return executeTmuxCommand(tmux_command);
  },
});
