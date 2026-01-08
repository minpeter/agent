import { afterAll, beforeAll, describe, expect, it } from "bun:test";
import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { CommandError, executeCommand } from "./shell-execute";

const PID_PATTERN = /^\d+$/;

describe("executeCommand", () => {
  let tempDir: string;

  beforeAll(() => {
    tempDir = mkdtempSync(join(tmpdir(), "shell-test-"));
  });

  afterAll(() => {
    if (existsSync(tempDir)) {
      rmSync(tempDir, { recursive: true });
    }
  });

  describe("basic execution", () => {
    it("executes simple echo command", async () => {
      const result = await executeCommand('echo "hello world"');

      expect(result.output).toBe("hello world");
      expect(result.exitCode).toBe(0);
    });

    it("captures multiline output", async () => {
      const result = await executeCommand("printf 'line1\\nline2\\nline3'");

      expect(result.output).toBe("line1\nline2\nline3");
    });

    it("returns non-zero exit code for failed command", async () => {
      const result = await executeCommand("exit 42");

      expect(result.exitCode).toBe(42);
    });

    it("combines stdout and stderr", async () => {
      const result = await executeCommand('echo "stdout" && echo "stderr" >&2');

      expect(result.output).toContain("stdout");
      expect(result.output).toContain("stderr");
    });

    it("handles pipes", async () => {
      const result = await executeCommand('echo "hello world" | wc -w');

      expect(result.output.trim()).toBe("2");
    });

    it("handles empty output", async () => {
      const result = await executeCommand("true");

      expect(result.output).toBe("");
      expect(result.exitCode).toBe(0);
    });
  });

  describe("workdir parameter", () => {
    it("executes command in specified directory", async () => {
      const result = await executeCommand("pwd", { workdir: tempDir });

      expect(result.output).toContain("shell-test-");
      expect(result.exitCode).toBe(0);
    });

    it("uses current directory when workdir not specified", async () => {
      const result = await executeCommand("pwd");

      expect(result.output).toBe(process.cwd());
    });

    it("rejects with error for non-existent directory", async () => {
      try {
        await executeCommand("pwd", { workdir: "/nonexistent/path" });
        expect(true).toBe(false);
      } catch (err) {
        expect(err).toBeInstanceOf(CommandError);
      }
    });
  });

  describe("background processes with &", () => {
    it("returns immediately with PID when using &", async () => {
      const startTime = Date.now();
      const result = await executeCommand("sleep 10 & echo $!");
      const elapsed = Date.now() - startTime;

      expect(elapsed).toBeLessThan(1000);
      expect(result.exitCode).toBe(0);
      expect(result.output).toMatch(PID_PATTERN);
    });

    it("can start server and verify with subsequent command", async () => {
      const start = await executeCommand(
        "python3 -m http.server 18888 > /dev/null 2>&1 & echo $!"
      );
      const pid = start.output.trim();

      expect(start.exitCode).toBe(0);
      expect(pid).toMatch(PID_PATTERN);

      await new Promise((r) => setTimeout(r, 500));

      const verify = await executeCommand("curl -s http://localhost:18888");
      expect(verify.output).toContain("Directory listing");

      await executeCommand(`kill ${pid}`);
    });
  });

  describe("command chaining", () => {
    it("handles && chaining", async () => {
      const result = await executeCommand('echo "a" && echo "b"');

      expect(result.output).toBe("a\nb");
    });

    it("handles ; chaining", async () => {
      const result = await executeCommand('echo "a"; echo "b"');

      expect(result.output).toBe("a\nb");
    });

    it("handles || chaining", async () => {
      const result = await executeCommand('false || echo "fallback"');

      expect(result.output).toBe("fallback");
    });
  });

  describe("special characters", () => {
    it("handles quotes", async () => {
      const result = await executeCommand(`echo "hello 'world'"`);

      expect(result.output).toBe("hello 'world'");
    });

    it("handles environment variables", async () => {
      const result = await executeCommand("echo $HOME");

      expect(result.output).toBe(process.env.HOME ?? "");
    });

    it("handles command substitution", async () => {
      const result = await executeCommand("echo $(echo nested)");

      expect(result.output).toBe("nested");
    });
  });
});
