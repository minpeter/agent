import { afterAll, beforeAll, describe, expect, it } from "bun:test";
import { existsSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { executeReadFile } from "./read-file";

describe("executeReadFile", () => {
  let tempDir: string;

  beforeAll(() => {
    tempDir = mkdtempSync(join(tmpdir(), "read-file-test-"));
  });

  afterAll(() => {
    if (existsSync(tempDir)) {
      rmSync(tempDir, { recursive: true });
    }
  });

  describe("basic read operations", () => {
    it("reads file and returns structured response", async () => {
      const testFile = join(tempDir, "basic.txt");
      writeFileSync(testFile, "line1\nline2\nline3");

      const result = await executeReadFile({ path: testFile });

      expect(result).toContain("OK - read file");
      expect(result).toContain(`path: ${testFile}`);
      expect(result).toContain("bytes:");
      expect(result).toContain("lines: 3");
      expect(result).toContain("range: L1-L3");
      expect(result).toContain("======== basic.txt L1-L3 ========");
      expect(result).toContain("   1 | line1");
      expect(result).toContain("   2 | line2");
      expect(result).toContain("   3 | line3");
      expect(result).toContain("======== end ========");
    });

    it("includes last_modified timestamp", async () => {
      const testFile = join(tempDir, "mtime.txt");
      writeFileSync(testFile, "content");

      const result = await executeReadFile({ path: testFile });

      expect(result).toContain("last_modified:");
      expect(result).toMatch(/\d{4}-\d{2}-\d{2}T/);
    });
  });

  describe("offset and limit", () => {
    it("respects offset parameter", async () => {
      const testFile = join(tempDir, "offset.txt");
      writeFileSync(testFile, "a\nb\nc\nd\ne");

      const result = await executeReadFile({ path: testFile, offset: 2 });

      expect(result).toContain("range: L3-L5");
      expect(result).toContain("   3 | c");
      expect(result).toContain("   4 | d");
      expect(result).toContain("   5 | e");
      expect(result).not.toContain("   1 | a");
      expect(result).not.toContain("   2 | b");
    });

    it("respects limit parameter", async () => {
      const testFile = join(tempDir, "limit.txt");
      writeFileSync(testFile, "a\nb\nc\nd\ne");

      const result = await executeReadFile({ path: testFile, limit: 2 });

      expect(result).toContain("range: L1-L2");
      expect(result).toContain("returned: 2");
      expect(result).toContain("   1 | a");
      expect(result).toContain("   2 | b");
    });

    it("combines offset and limit", async () => {
      const testFile = join(tempDir, "combo.txt");
      writeFileSync(testFile, "1\n2\n3\n4\n5\n6\n7\n8\n9\n10");

      const result = await executeReadFile({
        path: testFile,
        offset: 3,
        limit: 3,
      });

      expect(result).toContain("range: L4-L6");
      expect(result).toContain("   4 | 4");
      expect(result).toContain("   5 | 5");
      expect(result).toContain("   6 | 6");
    });
  });

  describe("around_line feature", () => {
    it("reads around specified line with defaults", async () => {
      const testFile = join(tempDir, "around.txt");
      const lines = Array.from({ length: 30 }, (_, i) => `line${i + 1}`);
      writeFileSync(testFile, lines.join("\n"));

      const result = await executeReadFile({
        path: testFile,
        around_line: 15,
      });

      expect(result).toContain("L10-L25");
      expect(result).toContain("line15");
      expect(result).toContain("line10");
      expect(result).toContain("line25");
    });

    it("respects before parameter", async () => {
      const testFile = join(tempDir, "before.txt");
      const lines = Array.from({ length: 20 }, (_, i) => `line${i + 1}`);
      writeFileSync(testFile, lines.join("\n"));

      const result = await executeReadFile({
        path: testFile,
        around_line: 10,
        before: 2,
        after: 2,
      });

      expect(result).toContain("L8-L12");
      expect(result).toContain("line8");
      expect(result).toContain("line10");
      expect(result).toContain("line12");
    });

    it("handles around_line at start of file", async () => {
      const testFile = join(tempDir, "start.txt");
      writeFileSync(testFile, "1\n2\n3\n4\n5\n6\n7\n8\n9\n10");

      const result = await executeReadFile({
        path: testFile,
        around_line: 1,
        before: 5,
        after: 3,
      });

      expect(result).toContain("L1-L4");
    });

    it("handles around_line at end of file", async () => {
      const testFile = join(tempDir, "end.txt");
      writeFileSync(testFile, "1\n2\n3\n4\n5");

      const result = await executeReadFile({
        path: testFile,
        around_line: 5,
        before: 2,
        after: 10,
      });

      expect(result).toContain("L3-L5");
    });
  });

  describe("truncation indication", () => {
    it("indicates when file is truncated", async () => {
      const testFile = join(tempDir, "trunc.txt");
      writeFileSync(testFile, "a\nb\nc\nd\ne");

      const result = await executeReadFile({ path: testFile, limit: 2 });

      expect(result).toContain("truncated: true");
    });

    it("indicates when file is not truncated", async () => {
      const testFile = join(tempDir, "notrunc.txt");
      writeFileSync(testFile, "a\nb");

      const result = await executeReadFile({ path: testFile });

      expect(result).toContain("truncated: false");
    });
  });

  describe("error handling", () => {
    it("throws error for non-existent file", async () => {
      await expect(
        executeReadFile({ path: join(tempDir, "nonexistent.txt") })
      ).rejects.toThrow();
    });
  });
});
