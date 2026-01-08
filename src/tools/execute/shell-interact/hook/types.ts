export interface ShellInteractSessionState {
  sessionID: string;
  tmuxSessions: Set<string>;
  updatedAt: number;
}

export interface SerializedShellInteractSessionState {
  sessionID: string;
  tmuxSessions: string[];
  updatedAt: number;
}
