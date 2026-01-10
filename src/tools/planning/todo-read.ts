import { readFile, stat } from "node:fs/promises";
import { join } from "node:path";
import { tool } from "ai";
import { z } from "zod";
import { getSessionId } from "../../context/session";
import type { TodoItem } from "./todo-write";

const TODO_DIR = ".cea/todos";

const inputSchema = z.object({});

export type TodoReadInput = z.infer<typeof inputSchema>;

interface TodoData {
  todos: TodoItem[];
  updatedAt: string;
}

export async function executeTodoRead(): Promise<string> {
  const sessionId = getSessionId();
  const cwd = process.cwd();
  const todoPath = join(cwd, TODO_DIR, `${sessionId}.json`);

  try {
    await stat(todoPath);
  } catch {
    return `No active todo list found for session ${sessionId}. Use todo_write to create one.`;
  }

  const content = await readFile(todoPath, "utf-8");
  const data: TodoData = JSON.parse(content);

  const stats = {
    total: data.todos.length,
    completed: data.todos.filter((t) => t.status === "completed").length,
    inProgress: data.todos.filter((t) => t.status === "in_progress").length,
    pending: data.todos.filter((t) => t.status === "pending").length,
    cancelled: data.todos.filter((t) => t.status === "cancelled").length,
  };

  const todosList = data.todos
    .map((todo, i) => {
      let statusIcon = "📋";
      if (todo.status === "completed") {
        statusIcon = "✅";
      } else if (todo.status === "in_progress") {
        statusIcon = "🔄";
      } else if (todo.status === "cancelled") {
        statusIcon = "❌";
      }
      return `${i + 1}. ${statusIcon} [${todo.status.toUpperCase()}] ${todo.content} (${todo.priority})`;
    })
    .join("\n");

  const output = [
    "OK - read todo list",
    `session: ${sessionId}`,
    `path: ${TODO_DIR}/${sessionId}.json`,
    `last_updated: ${data.updatedAt}`,
    `total: ${stats.total} tasks`,
    `completed: ${stats.completed}`,
    `in_progress: ${stats.inProgress}`,
    `pending: ${stats.pending}`,
    `cancelled: ${stats.cancelled}`,
    "",
    "======== Task List ========",
    todosList,
    "======== end ========",
  ];

  return output.join("\n");
}

export const todoReadTool = tool({
  description:
    "Read the current todo list status. " +
    "Shows all tasks with their current status, priority, and statistics. " +
    "Use this to check progress before continuing work or to verify task completion.",
  inputSchema,
  execute: executeTodoRead,
});
