import { agentManager } from "../agent";
import { createToggleCommand } from "./factories/create-toggle-command";
import type { Command } from "./types";

export const createToolFallbackCommand = (): Command =>
  createToggleCommand({
    name: "tool-fallback",
    description:
      "Toggle tool call fallback mode for models without native tool support",
    getter: () => agentManager.isToolFallbackEnabled(),
    setter: (value) => agentManager.setToolFallbackEnabled(value),
    featureName: "Tool fallback",
    enabledMessage: "Tool fallback enabled (using XML-based tool calling)",
    disabledMessage: "Tool fallback disabled (using native tool support)",
  });
