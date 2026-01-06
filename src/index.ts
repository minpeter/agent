#!/usr/bin/env bun
import { createInterface } from "node:readline";
import { createFriendli } from "@friendliai/ai-provider";
import type { LanguageModel } from "ai";
import { Agent } from "./agent";
import { handleCommand } from "./commands";
import { env } from "./env";
import { wrapModel } from "./model/create-model";
import { printYou } from "./utils/colors";

const DEFAULT_MODEL_ID = "LGAI-EXAONE/K-EXAONE-236B-A23B";

const friendli = createFriendli({
  apiKey: env.FRIENDLI_TOKEN,
  includeUsage: true,
});

let currentModelId = DEFAULT_MODEL_ID;
const agent = new Agent(wrapModel(friendli(currentModelId)));
let currentConversationId: string | undefined;

const rl = createInterface({
  input: process.stdin,
  output: process.stdout,
});

function getUserInput(): Promise<string | null> {
  return new Promise((resolve) => {
    printYou();
    rl.once("line", (line) => {
      resolve(line);
    });
    rl.once("close", () => {
      resolve(null);
    });
  });
}

function exitProgram(): void {
  rl.close();
  process.exit(0);
}

function setModel(model: LanguageModel, modelId: string): void {
  agent.setModel(wrapModel(model));
  currentModelId = modelId;
}

async function main(): Promise<void> {
  console.log(`Chat with AI (model: ${currentModelId})`);
  console.log("Use '/help' for commands, 'ctrl-c' to quit");
  console.log();

  while (true) {
    const userInput = await getUserInput();

    if (userInput === null) {
      break;
    }

    const trimmed = userInput.trim();
    if (trimmed === "") {
      continue;
    }

    if (trimmed.startsWith("/")) {
      const result = await handleCommand(trimmed, {
        agent,
        currentConversationId,
        currentModelId,
        readline: rl,
        setModel,
        exit: exitProgram,
      });
      currentConversationId = result.conversationId;
      console.log();
      continue;
    }

    try {
      await agent.chat(userInput);
    } catch (error) {
      console.error("An error occurred:", error);
    }

    console.log();
  }

  rl.close();
}

main().catch(console.error);
