import { spawn } from "node:child_process";
import { findSubcommand, tokenizeCommand } from "../utils";
import { buildSessionReminderMessage, CEA_SESSION_PREFIX } from "./constants";
import {
  clearShellInteractSessionState,
  loadShellInteractSessionState,
  saveShellInteractSessionState,
} from "./storage";
import type { ShellInteractSessionState } from "./types";

const sessionStates = new Map<string, ShellInteractSessionState>();

let currentSessionId: string | null = null;

export function setCurrentSessionId(sessionId: string): void {
  currentSessionId = sessionId;
}

export function getCurrentSessionId(): string | null {
  return currentSessionId;
}

function normalizeSessionName(name: string): string {
  return name.split(":")[0].split(".")[0];
}

function findFlagValue(tokens: string[], flag: string): string | null {
  for (let i = 0; i < tokens.length - 1; i++) {
    if (tokens[i] === flag) {
      return tokens[i + 1];
    }
  }
  return null;
}

function extractSessionNameFromTokens(
  tokens: string[],
  subCommand: string
): string | null {
  if (subCommand === "new-session") {
    const sFlag = findFlagValue(tokens, "-s");
    if (sFlag) {
      return normalizeSessionName(sFlag);
    }
    const tFlag = findFlagValue(tokens, "-t");
    if (tFlag) {
      return normalizeSessionName(tFlag);
    }
  } else {
    const tFlag = findFlagValue(tokens, "-t");
    if (tFlag) {
      return normalizeSessionName(tFlag);
    }
  }
  return null;
}

function isCeaSession(sessionName: string | null): sessionName is string {
  return sessionName?.startsWith(CEA_SESSION_PREFIX) ?? false;
}

function getOrCreateState(sessionID: string): ShellInteractSessionState {
  const existing = sessionStates.get(sessionID);
  if (existing) {
    return existing;
  }

  const persisted = loadShellInteractSessionState(sessionID);
  const state: ShellInteractSessionState = persisted ?? {
    sessionID,
    tmuxSessions: new Set<string>(),
    updatedAt: Date.now(),
  };
  sessionStates.set(sessionID, state);
  return state;
}

function killTmuxSession(sessionName: string): Promise<void> {
  return new Promise((resolve) => {
    const child = spawn("tmux", ["kill-session", "-t", sessionName], {
      stdio: ["ignore", "ignore", "ignore"],
    });
    child.on("exit", () => resolve());
    child.on("error", () => resolve());
  });
}

export async function cleanupAllTrackedSessions(
  sessionID: string
): Promise<void> {
  const state = getOrCreateState(sessionID);
  for (const sessionName of state.tmuxSessions) {
    await killTmuxSession(sessionName);
  }
  sessionStates.delete(sessionID);
  clearShellInteractSessionState(sessionID);
}

export interface ToolExecuteResult {
  output: string;
  sessionReminder?: string;
}

export function shellInteractHook(
  sessionID: string,
  tmuxCommand: string,
  toolOutput: string
): ToolExecuteResult {
  if (toolOutput.startsWith("Error:")) {
    return { output: toolOutput };
  }

  const tokens = tokenizeCommand(tmuxCommand);
  const subCommand = findSubcommand(tokens);
  const state = getOrCreateState(sessionID);
  let stateChanged = false;

  const isNewSession = subCommand === "new-session";
  const isKillSession = subCommand === "kill-session";
  const isKillServer = subCommand === "kill-server";

  const sessionName = extractSessionNameFromTokens(tokens, subCommand);

  if (isNewSession && isCeaSession(sessionName)) {
    state.tmuxSessions.add(sessionName);
    stateChanged = true;
  } else if (isKillSession && isCeaSession(sessionName)) {
    state.tmuxSessions.delete(sessionName);
    stateChanged = true;
  } else if (isKillServer) {
    state.tmuxSessions.clear();
    stateChanged = true;
  }

  if (stateChanged) {
    state.updatedAt = Date.now();
    saveShellInteractSessionState(state);
  }

  const isSessionOperation = isNewSession || isKillSession || isKillServer;
  let sessionReminder: string | undefined;

  if (isSessionOperation) {
    sessionReminder = buildSessionReminderMessage(
      Array.from(state.tmuxSessions),
      isNewSession && isCeaSession(sessionName) ? sessionName : undefined
    );
  }

  return {
    output: sessionReminder ? toolOutput + sessionReminder : toolOutput,
    sessionReminder,
  };
}
