export const DEFAULT_TIMEOUT_MS = 60_000;

export const BLOCKED_TMUX_SUBCOMMANDS = [
  "capture-pane",
  "capturep",
  "save-buffer",
  "saveb",
  "show-buffer",
  "showb",
  "pipe-pane",
  "pipep",
];

export const SHELL_INTERACT_DESCRIPTION = `Execute tmux commands for background/interactive processes (servers, long-running tasks).

CRITICAL: This tool runs "tmux <your_command>". Do NOT include "tmux" prefix.

## When to Use
- Background servers: npm run dev, python -m http.server
- Long-running tasks: builds, watches, tests
- Interactive processes that need input

## Session Naming
Always use "cea-{name}" pattern (e.g., cea-server, cea-build).

## Workflow Example: Start Server and Check Output

Step 1 - Create session and run command:
  shell_interact: new-session -d -s cea-server \\; send-keys -t cea-server 'npm run dev' Enter

Step 2 - Wait for startup (IMPORTANT: must complete before checking output):
  shell_execute: sleep 2

Step 3 - Check output (use shell_execute, NOT shell_interact):
  shell_execute: tmux capture-pane -t cea-server -p

Step 4 - Kill when done:
  shell_interact: kill-session -t cea-server

IMPORTANT: Steps must run SEQUENTIALLY. Do NOT run sleep and capture-pane in parallel.

## Command Reference

| Action | Command |
|--------|---------|
| Create session | new-session -d -s cea-name |
| Run in session | send-keys -t cea-name 'command' Enter |
| Create + Run | new-session -d -s cea-name \\; send-keys -t cea-name 'cmd' Enter |
| List sessions | ls |
| Kill session | kill-session -t cea-name |

## Chaining tmux Commands
Use "\\;" (escaped semicolon) to chain:
  new-session -d -s cea-app \\; send-keys -t cea-app 'npm start' Enter

## WRONG (will fail)
- "tmux new-session ..." → Don't include "tmux" prefix
- "new-session && send-keys ..." → bash && doesn't chain tmux commands
- "new-session; send-keys ..." → Use \\; not plain ;

## Checking Output
capture-pane is BLOCKED in this tool. Use shell_execute instead:
  shell_execute: tmux capture-pane -t cea-server -p`;
