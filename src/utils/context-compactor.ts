import type { LanguageModel, ModelMessage } from "ai";
import { generateText } from "ai";
import { colorize } from "./colors";

const COMPACTION_SYSTEM_PROMPT = `You are a conversation summarizer. Your task is to create a concise summary of the conversation history that preserves:
1. Key decisions made
2. Important code changes or file modifications
3. Current task context and goals
4. Any errors encountered and their resolutions

Output a summary that can serve as context for continuing the conversation.
Be concise but preserve essential information. Format as a brief narrative.`;

export interface CompactionResult {
  messages: ModelMessage[];
  originalMessageCount: number;
  compactedMessageCount: number;
  summary: string;
}

export interface CompactionConfig {
  keepRecentMessages: number; // Number of recent messages to preserve
  maxSummaryTokens: number;
}

const DEFAULT_COMPACTION_CONFIG: CompactionConfig = {
  keepRecentMessages: 6, // Keep last 3 exchanges (user + assistant pairs)
  maxSummaryTokens: 2000,
};

interface ContentPart {
  type: string;
  text?: string;
  toolName?: string;
  output?: unknown;
}

function getToolResultPreview(output: unknown): string {
  if (typeof output === "string") {
    return output.slice(0, 200);
  }
  if (output != null) {
    return JSON.stringify(output).slice(0, 200);
  }
  return "";
}

function formatContentPart(part: ContentPart): string {
  if (part.type === "text" && part.text) {
    return part.text;
  }
  if (part.type === "tool-call" && part.toolName) {
    return `[Tool Call: ${part.toolName}]`;
  }
  if (part.type === "tool-result") {
    const preview = getToolResultPreview(part.output);
    return `[Tool Result: ${preview}...]`;
  }
  return "";
}

function formatArrayContent(content: ContentPart[]): string {
  return content.map(formatContentPart).filter(Boolean).join("\n");
}

function formatMessage(msg: ModelMessage): string | null {
  const role = msg.role.toUpperCase();

  if (typeof msg.content === "string") {
    return `[${role}]: ${msg.content}`;
  }

  if (Array.isArray(msg.content)) {
    const content = formatArrayContent(msg.content as ContentPart[]);
    if (content) {
      return `[${role}]: ${content}`;
    }
  }

  return null;
}

/**
 * Formats messages for summarization
 */
function formatMessagesForSummary(messages: ModelMessage[]): string {
  return messages.map(formatMessage).filter(Boolean).join("\n\n");
}

/**
 * Compacts conversation history by summarizing older messages
 */
export async function compactConversation(
  model: LanguageModel,
  messages: ModelMessage[],
  config: Partial<CompactionConfig> = {}
): Promise<CompactionResult> {
  const { keepRecentMessages, maxSummaryTokens } = {
    ...DEFAULT_COMPACTION_CONFIG,
    ...config,
  };

  // If not enough messages to compact, return as-is
  if (messages.length <= keepRecentMessages) {
    return {
      messages,
      originalMessageCount: messages.length,
      compactedMessageCount: messages.length,
      summary: "",
    };
  }

  // Split messages: older ones to summarize, recent ones to keep
  const messagesToSummarize = messages.slice(0, -keepRecentMessages);
  const recentMessages = messages.slice(-keepRecentMessages);

  console.log(
    colorize(
      "yellow",
      `\n[Compacting context: summarizing ${messagesToSummarize.length} messages...]`
    )
  );

  // Format older messages for summarization
  const conversationText = formatMessagesForSummary(messagesToSummarize);

  try {
    // Generate summary using the same model
    const result = await generateText({
      model,
      system: COMPACTION_SYSTEM_PROMPT,
      prompt: `Please summarize the following conversation history:\n\n${conversationText}`,
      maxOutputTokens: maxSummaryTokens,
    });

    const summary = result.text;

    // Create a new message array with the summary as context
    const summaryMessage: ModelMessage = {
      role: "user",
      content: `[Previous conversation summary]\n${summary}\n\n[Continuing conversation...]`,
    };

    const compactedMessages: ModelMessage[] = [
      summaryMessage,
      ...recentMessages,
    ];

    console.log(
      colorize(
        "green",
        `[Context compacted: ${messages.length} → ${compactedMessages.length} messages]`
      )
    );

    return {
      messages: compactedMessages,
      originalMessageCount: messages.length,
      compactedMessageCount: compactedMessages.length,
      summary,
    };
  } catch (error) {
    console.log(
      colorize(
        "red",
        `[Compaction failed: ${error instanceof Error ? error.message : error}]`
      )
    );

    // On failure, just truncate old messages without summary
    return {
      messages: recentMessages,
      originalMessageCount: messages.length,
      compactedMessageCount: recentMessages.length,
      summary: "",
    };
  }
}
