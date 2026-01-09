#!/usr/bin/env bun

import type { Interface } from "node:readline/promises";
import { createInterface } from "node:readline/promises";
import { agentManager } from "../agent";
import { executeCommand, isCommand, registerCommand } from "../commands";
import { createClearCommand } from "../commands/clear";
import { createModelCommand } from "../commands/model";
import { createRenderCommand } from "../commands/render";
import { createThinkCommand } from "../commands/think";
import { MessageHistory } from "../context/message-history";
import { env } from "../env";
import { colorize } from "../interaction/colors";
import { renderFullStream } from "../interaction/stream-renderer";
import { askBatchApproval } from "../interaction/tool-approval";
import { cleanupSession } from "../tools/execute/shared-tmux-session";

const messageHistory = new MessageHistory();

let rlInstance: Interface | null = null;
let shouldExit = false;

process.on("exit", () => {
  if (env.DEBUG_TMUX_CLEANUP) {
    console.error("[DEBUG] Process exit handler called");
  }
  cleanupSession();
});

registerCommand(
  createRenderCommand(() => ({
    model: agentManager.getModelId(),
    instructions: agentManager.getInstructions(),
    tools: agentManager.getTools(),
    messages: messageHistory.toModelMessages(),
    thinkingEnabled: agentManager.isThinkingEnabled(),
  }))
);
registerCommand(createModelCommand());
registerCommand(createClearCommand(messageHistory));
registerCommand(createThinkCommand());

const processAgentResponse = async (rl: Interface): Promise<void> => {
  const stream = await agentManager.stream(messageHistory.toModelMessages());
  const { approvalRequests } = await renderFullStream(stream.fullStream, {
    showSteps: false,
  });

  const response = await stream.response;
  messageHistory.addModelMessages(response.messages);

  if (approvalRequests.length > 0) {
    const approvals = await askBatchApproval(rl, approvalRequests);
    messageHistory.addToolApprovalResponses(approvals);
    await processAgentResponse(rl);
  }
};

const parseCliArgs = (): { thinking: boolean } => {
  const args = process.argv.slice(2);
  let thinking = false;

  for (const arg of args) {
    if (arg === "--think") {
      thinking = true;
    }
  }

  return { thinking };
};

const run = async (): Promise<void> => {
  const { thinking } = parseCliArgs();
  agentManager.setThinkingEnabled(thinking);

  const rl = createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  rlInstance = rl;

  const handleGracefulShutdown = () => {
    shouldExit = true;
    console.log("\nShutting down...");

    if (rlInstance) {
      rlInstance.close();
    }

    cleanupSession();
    process.exit(0);
  };

  process.on("SIGINT", handleGracefulShutdown);

  try {
    while (!shouldExit) {
      const input = await rl
        .question(`${colorize("blue", "You")}: `)
        .catch(() => "");
      const trimmed = input.trim();
      if (
        shouldExit ||
        trimmed.length === 0 ||
        trimmed.toLowerCase() === "exit"
      ) {
        break;
      }

      if (isCommand(trimmed)) {
        try {
          const result = await executeCommand(trimmed);
          if (result?.message) {
            console.log(result.message);
          }
        } catch (error) {
          const errorMessage =
            error instanceof Error ? error.message : "Unknown error";
          console.error(`Command error: ${errorMessage}`);
        }
        continue;
      }

      messageHistory.addUserMessage(trimmed);
      try {
        await processAgentResponse(rl);
      } catch (error) {
        const errorMessage =
          error instanceof Error ? error.message : String(error);
        console.error(`\nError: ${errorMessage}`);
        console.error("Returning to prompt...\n");
      }
    }
  } catch (error) {
    console.error("Error:", error);
    throw error;
  } finally {
    if (env.DEBUG_TMUX_CLEANUP) {
      console.error("[DEBUG] Performing cleanup...");
    }
    process.off("SIGINT", handleGracefulShutdown);
    rlInstance = null;
    rl.close();
    cleanupSession();
    if (env.DEBUG_TMUX_CLEANUP) {
      console.error("[DEBUG] Cleanup completed.");
    }
  }
};

run().catch((error: unknown) => {
  throw error instanceof Error ? error : new Error("Failed to run stream.");
});
