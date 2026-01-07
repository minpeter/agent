import type { ModelMessage, TextPart, ToolApprovalResponse } from "ai";
import { env } from "../env";

const TRAILING_NEWLINES = /\n+$/;

function trimTrailingNewlines(message: ModelMessage): ModelMessage {
  if (message.role !== "assistant") {
    return message;
  }

  const content = message.content;

  if (typeof content === "string") {
    const trimmed = content.replace(TRAILING_NEWLINES, "");
    if (trimmed === content) {
      return message;
    }
    return { ...message, content: trimmed };
  }

  if (!Array.isArray(content) || content.length === 0) {
    return message;
  }

  let lastTextIndex = -1;
  for (let i = content.length - 1; i >= 0; i--) {
    if (content[i].type === "text") {
      lastTextIndex = i;
      break;
    }
  }

  if (lastTextIndex === -1) {
    return message;
  }

  const textPart = content[lastTextIndex] as TextPart;
  const trimmedText = textPart.text.replace(TRAILING_NEWLINES, "");

  if (trimmedText === textPart.text) {
    return message;
  }

  const newContent = [...content];
  newContent[lastTextIndex] = { ...textPart, text: trimmedText };
  return { ...message, content: newContent };
}

export interface Message {
  id: string;
  createdAt: Date;
  modelMessage: ModelMessage;
}

const createMessageId = (() => {
  let counter = 0;
  return (): string => {
    counter += 1;
    return `msg_${counter}`;
  };
})();

export class MessageHistory {
  private messages: Message[] = [];

  getAll(): Message[] {
    return [...this.messages];
  }

  clear(): void {
    this.messages = [];
  }

  addUserMessage(content: string): Message {
    const message: Message = {
      id: createMessageId(),
      createdAt: new Date(),
      modelMessage: {
        role: "user",
        content,
      },
    };
    this.messages.push(message);
    return message;
  }

  addModelMessages(messages: ModelMessage[]): Message[] {
    const created: Message[] = [];
    for (const modelMessage of messages) {
      const processedMessage = env.EXPERIMENTAL_TRIM_TRAILING_NEWLINES
        ? trimTrailingNewlines(modelMessage)
        : modelMessage;
      const message: Message = {
        id: createMessageId(),
        createdAt: new Date(),
        modelMessage: processedMessage,
      };
      created.push(message);
    }
    this.messages.push(...created);
    return created;
  }

  addToolApprovalResponses(responses: ToolApprovalResponse[]): Message {
    const message: Message = {
      id: createMessageId(),
      createdAt: new Date(),
      modelMessage: {
        role: "tool",
        content: responses,
      },
    };
    this.messages.push(message);
    return message;
  }

  toModelMessages(): ModelMessage[] {
    return this.messages.map((message) => message.modelMessage);
  }
}
