import type { MessageHistory } from "../context/message-history";
import type { Command, CommandContext, CommandResult } from "./types";

export const createClearCommand = (
  messageHistory: MessageHistory
): Command => ({
  name: "clear",
  description: "Clear current conversation history",
  execute: (_context: CommandContext): CommandResult => {
    messageHistory.clear();
    return {
      success: true,
      message: "Conversation history cleared.",
    };
  },
});
