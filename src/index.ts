import type { Interface } from "node:readline/promises";
import { createInterface } from "node:readline/promises";
import type { ToolApprovalResponse } from "ai";
import { agentManager } from "./agent";
import { executeCommand, isCommand, registerCommand } from "./commands";
import { createClearCommand } from "./commands/clear";
import { createModelCommand } from "./commands/model";
import { createRenderCommand } from "./commands/render";
import { MessageHistory } from "./context/message-history";
import { colorize } from "./interaction/colors";
import {
  renderFullStream,
  type ToolApprovalRequestPart,
} from "./interaction/stream-renderer";

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

const formatToolInput = (input: unknown): string => {
  try {
    const str = JSON.stringify(input, null, 2);
    const lines = str.split("\n");
    if (lines.length > 5) {
      return `${lines.slice(0, 5).join("\n")}\n    ...`;
    }
    return str;
  } catch {
    return String(input);
  }
};

const renderApprovalBox = (requests: ToolApprovalRequestPart[]): void => {
  const boxWidth = 65;
  const horizontal = "─".repeat(boxWidth - 2);

  console.log();
  console.log(colorize("yellow", `┌${horizontal}┐`));
  console.log(
    colorize(
      "yellow",
      `${`│ ⚠ APPROVAL REQUIRED (${requests.length} tool${requests.length > 1 ? "s" : ""})`.padEnd(boxWidth - 1)}│`
    )
  );
  console.log(colorize("yellow", `├${horizontal}┤`));

  for (const [idx, req] of requests.entries()) {
    const toolLine = ` ${idx + 1}. ${req.toolCall.toolName}`;
    console.log(colorize("cyan", `│${toolLine.padEnd(boxWidth - 2)}│`));

    const inputLines = formatToolInput(req.toolCall.input).split("\n");
    for (const line of inputLines) {
      const paddedLine = `    ${line}`.slice(0, boxWidth - 3);
      console.log(colorize("dim", `│${paddedLine.padEnd(boxWidth - 2)}│`));
    }

    if (idx < requests.length - 1) {
      console.log(colorize("yellow", `│${" ".repeat(boxWidth - 2)}│`));
    }
  }

  console.log(colorize("yellow", `├${horizontal}┤`));
  const options =
    requests.length > 1
      ? " [a] Approve all  [y] One-by-one  [n] Deny all"
      : " [y] Approve  [n] Deny";
  console.log(colorize("green", `│${options.padEnd(boxWidth - 2)}│`));
  console.log(colorize("yellow", `└${horizontal}┘`));
};

const askSingleApproval = async (
  rl: Interface,
  request: ToolApprovalRequestPart,
  index: number,
  total: number
): Promise<ToolApprovalResponse> => {
  const { approvalId, toolCall } = request;
  console.log(
    colorize(
      "yellow",
      `\n[${index + 1}/${total}] Approve "${toolCall.toolName}"? (y/N): `
    )
  );

  const answer = await rl.question("");
  const approved = answer.toLowerCase() === "y";

  return {
    type: "tool-approval-response",
    approvalId,
    approved,
    reason: approved ? "User approved" : "User denied",
  };
};

const askBatchApproval = async (
  rl: Interface,
  requests: ToolApprovalRequestPart[]
): Promise<ToolApprovalResponse[]> => {
  renderApprovalBox(requests);

  const prompt =
    requests.length > 1
      ? colorize("yellow", "\nChoice [a/y/n]: ")
      : colorize("yellow", "\nChoice [y/n]: ");

  const answer = (await rl.question(prompt)).toLowerCase().trim();

  if (requests.length > 1 && answer === "a") {
    return requests.map((req) => ({
      type: "tool-approval-response" as const,
      approvalId: req.approvalId,
      approved: true,
      reason: "User approved all",
    }));
  }

  if (answer === "n") {
    return requests.map((req) => ({
      type: "tool-approval-response" as const,
      approvalId: req.approvalId,
      approved: false,
      reason: "User denied all",
    }));
  }

  if (answer === "y") {
    if (requests.length === 1) {
      return [
        {
          type: "tool-approval-response",
          approvalId: requests[0].approvalId,
          approved: true,
          reason: "User approved",
        },
      ];
    }

    const approvals: ToolApprovalResponse[] = [];
    for (const [idx, req] of requests.entries()) {
      const approval = await askSingleApproval(rl, req, idx, requests.length);
      approvals.push(approval);
    }
    return approvals;
  }

  return requests.map((req) => ({
    type: "tool-approval-response" as const,
    approvalId: req.approvalId,
    approved: false,
    reason: "Invalid input - denied",
  }));
};

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
