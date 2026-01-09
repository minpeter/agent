import { agentManager } from "../agent";
import { colorize } from "../interaction/colors";
import type { Command, CommandResult } from "./types";

export const createThinkCommand = (): Command => ({
  name: "think",
  description: "Toggle reasoning mode on/off",
  execute: ({ args }): CommandResult => {
    if (args.length === 0) {
      const currentStatus = agentManager.isThinkingEnabled();
      return {
        success: true,
        message: `Reasoning is currently ${colorize(currentStatus ? "green" : "red", currentStatus ? "enabled" : "disabled")}.\nUsage: /think <on|off>`,
      };
    }

    const action = args[0]?.toLowerCase();

    if (action === "on" || action === "enable" || action === "true") {
      agentManager.setThinkingEnabled(true);
      return {
        success: true,
        message: colorize("green", "Reasoning enabled"),
      };
    }

    if (action === "off" || action === "disable" || action === "false") {
      agentManager.setThinkingEnabled(false);
      return {
        success: true,
        message: colorize("yellow", "Reasoning disabled"),
      };
    }

    return {
      success: false,
      message: `Invalid argument: ${action}. Use 'on' or 'off'.`,
    };
  },
});
