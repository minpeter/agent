import { homedir } from "node:os";
import { join } from "node:path";

export const CEA_SESSION_PREFIX = "cea-";

export const STORAGE_DIR = join(homedir(), ".code-editing-agent", "sessions");

export function buildSessionReminderMessage(
  sessions: string[],
  newlyCreated?: string
): string {
  if (sessions.length === 0) {
    return "";
  }

  let message = `\n\n[System Reminder] Active cea-* tmux sessions: ${sessions.join(", ")}`;

  if (newlyCreated) {
    message += `\n[Action Required] Background process started in '${newlyCreated}'. Before reporting completion:
  1. Wait: shell_execute sleep 2-5
  2. Verify output: shell_execute tmux capture-pane -t ${newlyCreated} -p
  3. For servers: test the endpoint (e.g., curl localhost:PORT)`;
  }

  return message;
}
