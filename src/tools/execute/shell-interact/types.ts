export interface ShellInteractArgs {
  tmux_command: string;
}

export interface ShellInteractResult {
  success: boolean;
  output: string;
}
