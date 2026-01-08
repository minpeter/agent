import { homedir } from "node:os";
import { join } from "node:path";

export const CEA_SESSION_PREFIX = "cea-";

export const STORAGE_DIR = join(homedir(), ".code-editing-agent", "sessions");

export function buildSessionReminderMessage(sessions: string[]): string {
  if (sessions.length === 0) {
    return "";
  }
  return `\n\n[System Reminder] Active cea-* tmux sessions: ${sessions.join(", ")}`;
}
