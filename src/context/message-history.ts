import type { ModelMessage, TextPart } from "ai";

function trimTrailingNewlines(message: ModelMessage): ModelMessage {
  if (message.role !== "assistant") {
    return message;
  }

  const content = message.content;

  if (typeof content === "string") {
    const trimmed = content.replace(/\n+$/, "");
    if (trimmed === content) {
      return message;
    }
    return { ...message, content: trimmed };
  }

  if (!Array.isArray(content) || content.length === 0) {
    return message;
  }

  const lastPart = content[content.length - 1];
  if (lastPart.type !== "text") {
    return message;
  }

  const trimmedText = (lastPart as TextPart).text.replace(/\n+$/, "");
  if (trimmedText === (lastPart as TextPart).text) {
    return message;
  }

  const newContent = [
    ...content.slice(0, -1),
    { ...lastPart, text: trimmedText },
  ];
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
      const message: Message = {
        id: createMessageId(),
        createdAt: new Date(),
        modelMessage: trimTrailingNewlines(modelMessage),
      };
      created.push(message);
    }
    this.messages.push(...created);
    return created;
  }

  toModelMessages(): ModelMessage[] {
    return this.messages.map((message) => message.modelMessage);
  }
}
