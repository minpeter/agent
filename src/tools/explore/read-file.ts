import { stat } from "node:fs/promises";
import { basename } from "node:path";
import { tool } from "ai";
import { z } from "zod";
import { formatBlock, safeReadFileEnhanced } from "./safety-utils";

const inputSchema = z.object({
  path: z.string().describe("File path (absolute or relative)"),
  offset: z
    .number()
    .optional()
    .describe(
      "Start line (0-based, default: 0). Use around_line for smarter reading."
    ),
  limit: z.number().optional().describe("Max lines to read (default: 2000)"),
  around_line: z
    .number()
    .optional()
    .describe("Read around this line (1-based). Combines with before/after."),
  before: z
    .number()
    .optional()
    .describe("Lines before around_line (default: 5)"),
  after: z
    .number()
    .optional()
    .describe("Lines after around_line (default: 10)"),
});

export type ReadFileInput = z.input<typeof inputSchema>;

export async function executeReadFile({
  path,
  offset,
  limit,
  around_line,
  before,
  after,
}: ReadFileInput): Promise<string> {
  const result = await safeReadFileEnhanced(path, {
    offset,
    limit,
    around_line,
    before,
    after,
  });

  let mtime = "";
  try {
    const stats = await stat(path);
    mtime = stats.mtime.toISOString();
  } catch {
    mtime = "unknown";
  }

  const fileName = basename(path);
  const rangeStr = `L${result.startLine1}-L${result.endLine1}`;

  const output = [
    "OK - read file",
    `path: ${path}`,
    `bytes: ${result.bytes}`,
    `last_modified: ${mtime}`,
    `lines: ${result.totalLines} (returned: ${result.endLine1 - result.startLine1 + 1})`,
    `range: ${rangeStr}`,
    `truncated: ${result.truncated}`,
    "",
    formatBlock(`${fileName} ${rangeStr}`, result.numberedContent),
  ];

  return output.join("\n");
}

export const readFileTool = tool({
  description:
    "Read file contents with line numbers. " +
    "ALWAYS read before editing. " +
    "Use around_line for smart reading (grep result → read around match).",
  inputSchema,
  execute: executeReadFile,
});
