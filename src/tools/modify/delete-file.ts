import { rm, stat } from "node:fs/promises";
import { tool } from "ai";
import { z } from "zod";

export const deleteFileTool = tool({
  description:
    "Delete file or directory (CANNOT BE UNDONE). " +
    "Use recursive: true for non-empty directories. " +
    "Use ignore_missing: true to skip if file doesn't exist.",
  needsApproval: true,
  inputSchema: z.object({
    path: z.string().describe("Path to delete"),
    recursive: z
      .boolean()
      .optional()
      .default(false)
      .describe("Delete directories recursively (default: false)"),
    ignore_missing: z
      .boolean()
      .optional()
      .default(false)
      .describe("Don't error if file doesn't exist (default: false)"),
  }),
  execute: async ({ path, recursive, ignore_missing }) => {
    let stats: Awaited<ReturnType<typeof stat>>;
    try {
      stats = await stat(path);
    } catch (error) {
      if (
        ignore_missing &&
        error instanceof Error &&
        "code" in error &&
        (error as NodeJS.ErrnoException).code === "ENOENT"
      ) {
        return `File does not exist (skipped): ${path}`;
      }
      throw error;
    }

    const isDirectory = stats.isDirectory();

    if (isDirectory && !recursive) {
      throw new Error(
        `Cannot delete directory '${path}' without recursive: true. ` +
          "Set recursive: true to delete directories."
      );
    }

    await rm(path, { recursive, force: false });

    return isDirectory
      ? `Successfully deleted directory: ${path}`
      : `Successfully deleted file: ${path}`;
  },
});
