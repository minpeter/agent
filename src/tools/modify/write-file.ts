import { mkdir, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { tool } from "ai";
import { z } from "zod";

export const writeFileTool = tool({
  description:
    "Write content to a file, creating it if it doesn't exist or overwriting if it does. " +
    "Parent directories will be created automatically if needed. " +
    "Use this for creating new files or completely replacing file contents.",
  needsApproval: true,
  inputSchema: z.object({
    path: z.string().describe("The path to the file to write."),
    content: z.string().describe("The content to write to the file."),
  }),
  execute: async ({ path, content }) => {
    const dir = dirname(path);
    if (dir !== ".") {
      await mkdir(dir, { recursive: true });
    }

    await writeFile(path, content, "utf-8");
    return `Successfully wrote ${content.length} characters to ${path}`;
  },
});
