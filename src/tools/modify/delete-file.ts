import { rm, stat } from "node:fs/promises";
import { tool } from "ai";
import { z } from "zod";

export const deleteFileTool = tool({
  description:
    "Delete a file or directory. " +
    "Use with caution - this operation cannot be undone. " +
    "For directories, use recursive: true to delete non-empty directories.",
  needsApproval: true,
  inputSchema: z.object({
    path: z.string().describe("The path to the file or directory to delete."),
    recursive: z
      .boolean()
      .optional()
      .default(false)
      .describe(
        "If true, recursively delete directories and their contents. " +
          "Required for non-empty directories. Defaults to false."
      ),
  }),
  execute: async ({ path, recursive }) => {
    const stats = await stat(path);
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
