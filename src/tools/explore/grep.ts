import { spawn } from "node:child_process";
import { resolve } from "node:path";
import { tool } from "ai";
import { z } from "zod";

const MAX_MATCHES = 20_000;

interface GrepResult {
  matches: string;
  matchCount: number;
  truncated: boolean;
}

function runRipgrep(args: string[], cwd: string): Promise<GrepResult> {
  return new Promise((resolve, reject) => {
    const rg = spawn("rg", args, { cwd });

    let stdout = "";
    let stderr = "";

    rg.stdout.on("data", (data: Buffer) => {
      stdout += data.toString();
    });

    rg.stderr.on("data", (data: Buffer) => {
      stderr += data.toString();
    });

    rg.on("close", (code) => {
      if (code === 0 || code === 1) {
        // code 1 means no matches found, which is not an error
        const lines = stdout.split("\n").filter((line) => line.length > 0);
        const truncated = lines.length > MAX_MATCHES;
        const result = truncated
          ? lines.slice(0, MAX_MATCHES).join("\n")
          : stdout.trim();

        resolve({
          matches: result,
          matchCount: Math.min(lines.length, MAX_MATCHES),
          truncated,
        });
      } else {
        reject(new Error(`ripgrep failed with code ${code}: ${stderr}`));
      }
    });

    rg.on("error", (err) => {
      reject(new Error(`Failed to spawn ripgrep: ${err.message}`));
    });
  });
}

export const grepTool = tool({
  description:
    "FAST, optimized search powered by ripgrep. " +
    "Searches file contents using regular expressions or literal strings. " +
    "Returns matching lines with file paths and line numbers.",
  inputSchema: z.object({
    pattern: z
      .string()
      .describe(
        "The pattern to search for. By default, treated as a regular expression. " +
          "Use '\\b' for precise symbol matching (e.g., '\\bMatchMe\\b')."
      ),
    dir_path: z
      .string()
      .optional()
      .describe(
        "Directory or file to search. Directories are searched recursively. " +
          "Defaults to current working directory if omitted."
      ),
    include: z
      .string()
      .optional()
      .describe(
        "Glob pattern to filter files (e.g., '*.ts', 'src/**'). " +
          "Recommended for large repositories to reduce noise."
      ),
    case_sensitive: z
      .boolean()
      .optional()
      .default(false)
      .describe("If true, search is case-sensitive. Defaults to false."),
    fixed_strings: z
      .boolean()
      .optional()
      .default(false)
      .describe(
        "If true, treats the pattern as a literal string instead of a regular expression. " +
          "Defaults to false."
      ),
    context: z
      .number()
      .optional()
      .describe(
        "Show this many lines of context around each match (equivalent to grep -C)."
      ),
    before: z
      .number()
      .optional()
      .describe(
        "Show this many lines before each match (equivalent to grep -B)."
      ),
    after: z
      .number()
      .optional()
      .describe(
        "Show this many lines after each match (equivalent to grep -A)."
      ),
    no_ignore: z
      .boolean()
      .optional()
      .default(false)
      .describe(
        "If true, searches all files including those in .gitignore. Defaults to false."
      ),
  }),
  execute: async ({
    pattern,
    dir_path,
    include,
    case_sensitive,
    fixed_strings,
    context,
    before,
    after,
    no_ignore,
  }) => {
    const searchDir = dir_path ? resolve(dir_path) : process.cwd();

    const args: string[] = [
      "--line-number",
      "--with-filename",
      "--color=never",
    ];

    if (!case_sensitive) {
      args.push("--ignore-case");
    }

    if (fixed_strings) {
      args.push("--fixed-strings");
    }

    if (include) {
      args.push("--glob", include);
    }

    if (context !== undefined) {
      args.push("--context", context.toString());
    }

    if (before !== undefined) {
      args.push("--before-context", before.toString());
    }

    if (after !== undefined) {
      args.push("--after-context", after.toString());
    }

    if (no_ignore) {
      args.push("--no-ignore");
    }

    args.push("--", pattern, ".");

    try {
      const result = await runRipgrep(args, searchDir);

      if (result.matchCount === 0) {
        return JSON.stringify({
          matches: [],
          message: "No matches found",
        });
      }

      let output = result.matches;
      if (result.truncated) {
        output += `

[Output truncated: showing ${MAX_MATCHES} of ${result.matchCount}+ matches]`;
      }

      return output;
    } catch (error) {
      if (error instanceof Error) {
        throw new Error(`Search failed: ${error.message}`);
      }
      throw error;
    }
  },
});
