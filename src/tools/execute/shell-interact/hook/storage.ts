import {
  existsSync,
  mkdirSync,
  readFileSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { join } from "node:path";
import { STORAGE_DIR } from "./constants";
import type {
  SerializedShellInteractSessionState,
  ShellInteractSessionState,
} from "./types";

function getSessionFilePath(sessionID: string): string {
  return join(STORAGE_DIR, `${sessionID}.json`);
}

function ensureStorageDir(): void {
  if (!existsSync(STORAGE_DIR)) {
    mkdirSync(STORAGE_DIR, { recursive: true });
  }
}

export function loadShellInteractSessionState(
  sessionID: string
): ShellInteractSessionState | null {
  const filePath = getSessionFilePath(sessionID);

  if (!existsSync(filePath)) {
    return null;
  }

  try {
    const content = readFileSync(filePath, "utf-8");
    const serialized: SerializedShellInteractSessionState = JSON.parse(content);

    return {
      sessionID: serialized.sessionID,
      tmuxSessions: new Set(serialized.tmuxSessions),
      updatedAt: serialized.updatedAt,
    };
  } catch {
    return null;
  }
}

export function saveShellInteractSessionState(
  state: ShellInteractSessionState
): void {
  ensureStorageDir();
  const filePath = getSessionFilePath(state.sessionID);

  const serialized: SerializedShellInteractSessionState = {
    sessionID: state.sessionID,
    tmuxSessions: Array.from(state.tmuxSessions),
    updatedAt: state.updatedAt,
  };

  writeFileSync(filePath, JSON.stringify(serialized, null, 2));
}

export function clearShellInteractSessionState(sessionID: string): void {
  const filePath = getSessionFilePath(sessionID);

  if (existsSync(filePath)) {
    try {
      unlinkSync(filePath);
    } catch (_) {
      /* intentionally ignored - file may already be deleted */
    }
  }
}
