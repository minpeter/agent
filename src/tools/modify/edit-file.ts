import { mkdir, readFile, writeFile } from "node:fs/promises";
import { basename, dirname } from "node:path";
import { tool } from "ai";
import { z } from "zod";

interface EditResult {
  startLine: number;
  endLine: number;
  context: string;
}

function extractEditContext(
  content: string,
  editStartIndex: number,
  newStr: string,
  contextLines = 2
): EditResult {
  const lines = content.split("\n");
  const beforeEdit = content.slice(0, editStartIndex);
  const startLine = beforeEdit.split("\n").length;

  const newStrLines = newStr.split("\n");
  const endLine = startLine + newStrLines.length - 1;

  const contextStart = Math.max(1, startLine - contextLines);
  const contextEnd = Math.min(lines.length, endLine + contextLines);

  const contextSnippet = lines
    .slice(contextStart - 1, contextEnd)
    .map((line, i) => {
      const lineNum = contextStart + i;
      const isEdited = lineNum >= startLine && lineNum <= endLine;
      const prefix = isEdited ? ">" : " ";
      return `${prefix} ${String(lineNum).padStart(4)} | ${line}`;
    })
    .join("\n");

  return {
    startLine,
    endLine,
    context: contextSnippet,
  };
}

function formatEditResult(filePath: string, results: EditResult[]): string {
  const fileName = basename(filePath);
  const output: string[] = [];

  for (const result of results) {
    output.push(
      `======== ${fileName} L${result.startLine}-L${result.endLine} ========`
    );
    output.push(result.context);
    output.push("======== end ========");
  }

  return output.join("\n");
}

const inputSchema = z.object({
  path: z.string().describe("The path to the file"),
  old_str: z
    .string()
    .describe(
      "Text to search for - must match exactly. " +
        "By default, must have exactly one match unless replace_all is true."
    ),
  new_str: z.string().describe("Text to replace old_str with"),
  replace_all: z
    .boolean()
    .optional()
    .default(false)
    .describe(
      "If true, replace all occurrences of old_str. " +
        "If false (default), old_str must match exactly once."
    ),
});

export type EditFileInput = z.infer<typeof inputSchema>;

export async function executeEditFile({
  path,
  old_str,
  new_str,
  replace_all = false,
}: EditFileInput): Promise<string> {
  if (!path || old_str === new_str) {
    throw new Error("Invalid input parameters");
  }

  let content: string;

  try {
    content = await readFile(path, "utf-8");
  } catch (error) {
    if (
      error instanceof Error &&
      "code" in error &&
      (error as NodeJS.ErrnoException).code === "ENOENT" &&
      old_str === ""
    ) {
      const dir = dirname(path);
      if (dir !== ".") {
        await mkdir(dir, { recursive: true });
      }
      await writeFile(path, new_str, "utf-8");
      return `Successfully created file ${path}`;
    }
    throw error;
  }

  if (old_str !== "" && !content.includes(old_str)) {
    throw new Error("old_str not found in file");
  }

  let newContent: string;
  let replacementCount = 0;

  const editResults: EditResult[] = [];

  if (replace_all) {
    const matchPositions: number[] = [];
    let pos = content.indexOf(old_str);
    while (pos !== -1) {
      matchPositions.push(pos);
      pos = content.indexOf(old_str, pos + 1);
    }
    replacementCount = matchPositions.length;

    newContent = content;
    let offset = 0;
    for (const originalPos of matchPositions) {
      const adjustedPos = originalPos + offset;
      newContent =
        newContent.slice(0, adjustedPos) +
        new_str +
        newContent.slice(adjustedPos + old_str.length);

      editResults.push(extractEditContext(newContent, adjustedPos, new_str));
      offset += new_str.length - old_str.length;
    }
  } else {
    const matchCount = content.split(old_str).length - 1;
    if (matchCount > 1) {
      throw new Error(
        `old_str found ${matchCount} times in file. ` +
          "Use replace_all: true to replace all occurrences, " +
          "or provide more context to match exactly once."
      );
    }
    const editStartIndex = content.indexOf(old_str);
    newContent = content.replace(old_str, new_str);
    replacementCount = 1;

    editResults.push(extractEditContext(newContent, editStartIndex, new_str));
  }

  if (content === newContent && old_str !== "") {
    throw new Error("old_str not found in file");
  }

  await writeFile(path, newContent, "utf-8");

  const summary = replace_all
    ? `OK - replaced ${replacementCount} occurrence(s)`
    : "OK";

  return `${summary}\n\n${formatEditResult(path, editResults)}`;
}

export const editFileTool = tool({
  description:
    "Replace text in file (surgical edits). " +
    "old_str must match exactly. " +
    "Use replace_all: true for multiple replacements. " +
    "Creates file if it doesn't exist (when old_str is empty).",
  needsApproval: true,
  inputSchema,
  execute: executeEditFile,
});
