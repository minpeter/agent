import { afterAll, beforeAll, describe, expect, it } from "bun:test";
import {
  existsSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { executeWriteFile } from "./write-file";

describe("executeWriteFile", () => {
  let tempDir: string;

  beforeAll(() => {
    tempDir = mkdtempSync(join(tmpdir(), "write-file-test-"));
  });

  afterAll(() => {
    if (existsSync(tempDir)) {
      rmSync(tempDir, { recursive: true });
    }
  });

  describe("basic write operations", () => {
    it("creates new file and returns preview", async () => {
      const testFile = join(tempDir, "new.txt");
      const content = "line1\nline2\nline3";

      const result = await executeWriteFile({ path: testFile, content });

      expect(result).toContain("OK - created new.txt");
      expect(result).toContain("bytes:");
      expect(result).toContain("lines: 3");
      expect(result).toContain("======== new.txt (preview) ========");
      expect(result).toContain("line1");
      expect(result).toContain("line2");
      expect(result).toContain("line3");
      expect(result).toContain("======== end ========");

      const written = readFileSync(testFile, "utf-8");
      expect(written).toBe(content);
    });

    it("overwrites existing file and indicates action", async () => {
      const testFile = join(tempDir, "existing.txt");
      writeFileSync(testFile, "old content");

      const newContent = "new content";
      const result = await executeWriteFile({
        path: testFile,
        content: newContent,
      });

      expect(result).toContain("OK - overwrote existing.txt");
      expect(result).toContain("new content");

      const written = readFileSync(testFile, "utf-8");
      expect(written).toBe(newContent);
    });

    it("creates parent directories automatically", async () => {
      const nestedFile = join(tempDir, "deep", "nested", "dir", "file.txt");
      const content = "nested content";

      const result = await executeWriteFile({ path: nestedFile, content });

      expect(result).toContain("OK - created file.txt");
      expect(existsSync(nestedFile)).toBe(true);

      const written = readFileSync(nestedFile, "utf-8");
      expect(written).toBe(content);
    });
  });

  describe("preview formatting", () => {
    it("shows full content for small files", async () => {
      const testFile = join(tempDir, "small.txt");
      const content = "a\nb\nc\nd\ne";

      const result = await executeWriteFile({ path: testFile, content });

      expect(result).toContain("   1 | a");
      expect(result).toContain("   2 | b");
      expect(result).toContain("   3 | c");
      expect(result).toContain("   4 | d");
      expect(result).toContain("   5 | e");
      expect(result).not.toContain("lines omitted");
    });

    it("shows head/tail preview for large files", async () => {
      const testFile = join(tempDir, "large.txt");
      const lines = Array.from({ length: 20 }, (_, i) => `line${i + 1}`);
      const content = lines.join("\n");

      const result = await executeWriteFile({ path: testFile, content });

      expect(result).toContain("line1");
      expect(result).toContain("line2");
      expect(result).toContain("line3");
      expect(result).toContain("lines omitted");
      expect(result).toContain("line18");
      expect(result).toContain("line19");
      expect(result).toContain("line20");
    });

    it("includes correct byte count", async () => {
      const testFile = join(tempDir, "bytes.txt");
      const content = "hello";

      const result = await executeWriteFile({ path: testFile, content });

      expect(result).toContain("bytes: 5");
    });

    it("handles unicode content correctly", async () => {
      const testFile = join(tempDir, "unicode.txt");
      const content = "한글 테스트\n이모지 🎉";

      const result = await executeWriteFile({ path: testFile, content });

      expect(result).toContain("한글 테스트");
      expect(result).toContain("이모지 🎉");
      expect(result).toContain("lines: 2");

      const written = readFileSync(testFile, "utf-8");
      expect(written).toBe(content);
    });
  });

  describe("edge cases", () => {
    it("handles empty content", async () => {
      const testFile = join(tempDir, "empty.txt");

      const result = await executeWriteFile({ path: testFile, content: "" });

      expect(result).toContain("OK - created empty.txt");
      expect(result).toContain("bytes: 0");
      expect(result).toContain("lines: 1");

      const written = readFileSync(testFile, "utf-8");
      expect(written).toBe("");
    });

    it("handles single line content", async () => {
      const testFile = join(tempDir, "single.txt");
      const content = "single line without newline";

      const result = await executeWriteFile({ path: testFile, content });

      expect(result).toContain("lines: 1");
      expect(result).toContain("single line without newline");
    });

    it("handles content with special characters", async () => {
      const testFile = join(tempDir, "special.txt");
      const content =
        'const x = { a: 1, b: "test" };\nconst y = `template ${x}`;';

      const result = await executeWriteFile({ path: testFile, content });

      const written = readFileSync(testFile, "utf-8");
      expect(written).toBe(content);
    });
  });
});
