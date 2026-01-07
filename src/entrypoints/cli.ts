#!/usr/bin/env bun

/**
 * Interactive CLI entry point.
 * Usage: bun run src/entrypoints/cli.ts
 */

import type { Interface } from "node:readline/promises";
import { createInterface } from "node:readline/promises";
import { agentManager } from "../agent";
import { executeCommand, isCommand, registerCommand } from "../commands";
import { createClearCommand } from "../commands/clear";
import { createModelCommand } from "../commands/model";
import { createRenderCommand } from "../commands/render";
import { MessageHistory } from "../context/message-history";
import { renderFullStream } from "../interaction/stream-renderer";
import { askBatchApproval } from "../interaction/tool-approval";

const messageHistory = new MessageHistory();

registerCommand(
  createRenderCommand(() => ({
    model: agentManager.getModelId(),
    instructions: agentManager.getInstructions(),
    tools: agentManager.getTools(),
    messages: messageHistory.toModelMessages(),
  }))
);
registerCommand(createModelCommand());
registerCommand(createClearCommand(messageHistory));

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

const run = async (): Promise<void> => {
  const rl = createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  try {
    while (true) {
      const input = await rl.question("You: ");
      const trimmed = input.trim();
      if (trimmed.length === 0 || trimmed.toLowerCase() === "exit") {
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
      await processAgentResponse(rl);
    }
  } finally {
    rl.close();
  }
};

run().catch((error: unknown) => {
  throw error instanceof Error ? error : new Error("Failed to run stream.");
});
