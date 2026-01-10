import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { rm } from "node:fs/promises";
import { join } from "node:path";
import { initializeSession } from "../../context/session";
import { executeTodoRead } from "./todo-read";
import { executeTodoWrite } from "./todo-write";

const testDir = join(process.cwd(), ".sisyphus");

describe("executeTodoRead", () => {
  beforeEach(async () => {
    initializeSession();
    try {
      await rm(testDir, { recursive: true, force: true });
    } catch {
      // Ignore if directory doesn't exist
    }
  });

  afterEach(async () => {
    try {
      await rm(testDir, { recursive: true, force: true });
    } catch {
      // Cleanup - ignore errors
    }
  });

  test("returns message when no todo list exists", async () => {
    const result = await executeTodoRead();

    expect(result).toContain("No active todo list found");
  });

  test("reads existing todo list", async () => {
    await executeTodoWrite({
      todos: [
        {
          id: "1",
          content: "Test task",
          status: "pending",
          priority: "high",
        },
      ],
    });

    const result = await executeTodoRead();

    expect(result).toContain("OK - read todo list");
    expect(result).toContain("total: 1 tasks");
    expect(result).toContain("Test task");
  });

  test("shows correct status indicators", async () => {
    await executeTodoWrite({
      todos: [
        {
          id: "1",
          content: "Completed task",
          status: "completed",
          priority: "high",
        },
        {
          id: "2",
          content: "In progress task",
          status: "in_progress",
          priority: "medium",
        },
        {
          id: "3",
          content: "Pending task",
          status: "pending",
          priority: "low",
        },
      ],
    });

    const result = await executeTodoRead();

    expect(result).toContain("✅");
    expect(result).toContain("🔄");
    expect(result).toContain("📋");
    expect(result).toContain("completed: 1");
    expect(result).toContain("in_progress: 1");
    expect(result).toContain("pending: 1");
  });
});
