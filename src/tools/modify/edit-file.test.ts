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
import { executeEditFile } from "./edit-file";

describe("editFileTool", () => {
  let tempDir: string;

  beforeAll(() => {
    tempDir = mkdtempSync(join(tmpdir(), "edit-file-test-"));
  });

  afterAll(() => {
    if (existsSync(tempDir)) {
      rmSync(tempDir, { recursive: true });
    }
  });

  describe("basic replacement", () => {
    it("replaces single occurrence and returns context", async () => {
      const testFile = join(tempDir, "basic.txt");
      writeFileSync(testFile, "line1\nline2\nline3\nline4\nline5");

      const result = await executeEditFile({
        path: testFile,
        old_str: "line3",
        new_str: "MODIFIED",
        replace_all: false,
      });

      expect(result).toContain("OK");
      expect(result).toContain("======== basic.txt L3-L3 ========");
      expect(result).toContain("MODIFIED");
      expect(result).toContain("======== end ========");

      const content = readFileSync(testFile, "utf-8");
      expect(content).toBe("line1\nline2\nMODIFIED\nline4\nline5");
    });

    it("shows context lines around edit", async () => {
      const testFile = join(tempDir, "context.txt");
      writeFileSync(testFile, "a\nb\nc\nd\ne\nf\ng");

      const result = await executeEditFile({
        path: testFile,
        old_str: "d",
        new_str: "CHANGED",
        replace_all: false,
      });

      expect(result).toContain("b");
      expect(result).toContain("c");
      expect(result).toContain("CHANGED");
      expect(result).toContain("e");
      expect(result).toContain("f");
    });

    it("marks edited lines with > prefix", async () => {
      const testFile = join(tempDir, "prefix.txt");
      writeFileSync(testFile, "keep1\nkeep2\nchange\nkeep3\nkeep4");

      const result = await executeEditFile({
        path: testFile,
        old_str: "change",
        new_str: "EDITED",
        replace_all: false,
      });

      const lines = result.split("\n");
      const editedLine = lines.find((l: string) => l.includes("EDITED"));
      const contextLine = lines.find((l: string) => l.includes("keep2"));

      expect(editedLine).toMatch(/^>/);
      expect(contextLine).toMatch(/^ /);
    });
  });

  describe("multiline replacement", () => {
    it("handles multiline old_str and new_str", async () => {
      const testFile = join(tempDir, "multiline.txt");
      writeFileSync(testFile, "header\nold1\nold2\nold3\nfooter");

      const result = await executeEditFile({
        path: testFile,
        old_str: "old1\nold2\nold3",
        new_str: "new1\nnew2",
        replace_all: false,
      });

      expect(result).toContain("L2-L3");
      expect(result).toContain("new1");
      expect(result).toContain("new2");

      const content = readFileSync(testFile, "utf-8");
      expect(content).toBe("header\nnew1\nnew2\nfooter");
    });

    it("shows correct line range for multiline edits", async () => {
      const testFile = join(tempDir, "range.txt");
      writeFileSync(testFile, "1\n2\n3\n4\n5\n6\n7\n8\n9\n10");

      const result = await executeEditFile({
        path: testFile,
        old_str: "4\n5\n6",
        new_str: "A\nB\nC\nD",
        replace_all: false,
      });

      expect(result).toContain("L4-L7");

      const content = readFileSync(testFile, "utf-8");
      expect(content).toBe("1\n2\n3\nA\nB\nC\nD\n7\n8\n9\n10");
    });
  });

  describe("replace_all mode", () => {
    it("replaces all occurrences and shows each edit", async () => {
      const testFile = join(tempDir, "replaceall.txt");
      writeFileSync(testFile, "foo\nbar\nfoo\nbaz\nfoo");

      const result = await executeEditFile({
        path: testFile,
        old_str: "foo",
        new_str: "XXX",
        replace_all: true,
      });

      expect(result).toContain("OK - replaced 3 occurrence(s)");

      const editBlocks = result.split("======== end ========").length - 1;
      expect(editBlocks).toBe(3);

      const content = readFileSync(testFile, "utf-8");
      expect(content).toBe("XXX\nbar\nXXX\nbaz\nXXX");
    });

    it("shows correct line numbers for each replacement", async () => {
      const testFile = join(tempDir, "positions.txt");
      writeFileSync(testFile, "target\nother\ntarget\nother\ntarget");

      const result = await executeEditFile({
        path: testFile,
        old_str: "target",
        new_str: "REPLACED",
        replace_all: true,
      });

      expect(result).toContain("L1-L1");
      expect(result).toContain("L3-L3");
      expect(result).toContain("L5-L5");
    });
  });

  describe("file creation", () => {
    it("creates new file when old_str is empty", async () => {
      const newFile = join(tempDir, "newfile.txt");

      const result = await executeEditFile({
        path: newFile,
        old_str: "",
        new_str: "brand new content",
        replace_all: false,
      });

      expect(result).toContain("Successfully created file");
      expect(existsSync(newFile)).toBe(true);

      const content = readFileSync(newFile, "utf-8");
      expect(content).toBe("brand new content");
    });

    it("creates parent directories when needed", async () => {
      const nestedFile = join(tempDir, "deep", "nested", "file.txt");

      const result = await executeEditFile({
        path: nestedFile,
        old_str: "",
        new_str: "nested content",
        replace_all: false,
      });

      expect(result).toContain("Successfully created file");
      expect(existsSync(nestedFile)).toBe(true);
    });
  });

  describe("error handling", () => {
    it("throws error when old_str not found", async () => {
      const testFile = join(tempDir, "notfound.txt");
      writeFileSync(testFile, "some content");

      await expect(
        executeEditFile({
          path: testFile,
          old_str: "nonexistent",
          new_str: "replacement",
          replace_all: false,
        })
      ).rejects.toThrow("old_str not found in file");
    });

    it("throws error when multiple matches without replace_all", async () => {
      const testFile = join(tempDir, "multiple.txt");
      writeFileSync(testFile, "dup\ndup\ndup");

      await expect(
        executeEditFile({
          path: testFile,
          old_str: "dup",
          new_str: "single",
          replace_all: false,
        })
      ).rejects.toThrow("found 3 times");
    });

    it("throws error when old_str equals new_str", async () => {
      const testFile = join(tempDir, "same.txt");
      writeFileSync(testFile, "content");

      await expect(
        executeEditFile({
          path: testFile,
          old_str: "content",
          new_str: "content",
          replace_all: false,
        })
      ).rejects.toThrow("Invalid input parameters");
    });

    it("throws error for non-existent file (unless creating)", async () => {
      await expect(
        executeEditFile({
          path: join(tempDir, "nonexistent.txt"),
          old_str: "something",
          new_str: "else",
          replace_all: false,
        })
      ).rejects.toThrow();
    });
  });

  describe("edge cases", () => {
    it("handles edit at start of file", async () => {
      const testFile = join(tempDir, "start.txt");
      writeFileSync(testFile, "first\nsecond\nthird");

      const result = await executeEditFile({
        path: testFile,
        old_str: "first",
        new_str: "FIRST",
        replace_all: false,
      });

      expect(result).toContain("L1-L1");
      expect(result).toContain("FIRST");
    });

    it("handles edit at end of file", async () => {
      const testFile = join(tempDir, "end.txt");
      writeFileSync(testFile, "first\nsecond\nthird");

      const result = await executeEditFile({
        path: testFile,
        old_str: "third",
        new_str: "THIRD",
        replace_all: false,
      });

      expect(result).toContain("L3-L3");
      expect(result).toContain("THIRD");
    });

    it("handles single line file", async () => {
      const testFile = join(tempDir, "single.txt");
      writeFileSync(testFile, "only line");

      const result = await executeEditFile({
        path: testFile,
        old_str: "only",
        new_str: "ONLY",
        replace_all: false,
      });

      expect(result).toContain("L1-L1");
      expect(result).toContain("ONLY line");
    });

    it("handles empty new_str (deletion)", async () => {
      const testFile = join(tempDir, "delete.txt");
      writeFileSync(testFile, "keep\nremove\nkeep");

      const result = await executeEditFile({
        path: testFile,
        old_str: "remove\n",
        new_str: "",
        replace_all: false,
      });

      const content = readFileSync(testFile, "utf-8");
      expect(content).toBe("keep\nkeep");
    });

    it("handles special characters in replacement", async () => {
      const testFile = join(tempDir, "special.txt");
      writeFileSync(testFile, "placeholder");

      const result = await executeEditFile({
        path: testFile,
        old_str: "placeholder",
        new_str: 'const x = { a: 1, b: "test" };',
        replace_all: false,
      });

      const content = readFileSync(testFile, "utf-8");
      expect(content).toBe('const x = { a: 1, b: "test" };');
    });
  });
});
