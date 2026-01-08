import { spawn } from "node:child_process";

let tmuxPath: string | null = null;
let initPromise: Promise<string | null> | null = null;

function findTmuxPath(): Promise<string | null> {
  const isWindows = process.platform === "win32";
  const cmd = isWindows ? "where" : "which";

  return new Promise((resolve) => {
    const child = spawn(cmd, ["tmux"], {
      stdio: ["ignore", "pipe", "pipe"],
    });

    let stdout = "";

    child.stdout?.on("data", (data: Buffer) => {
      stdout += data.toString();
    });

    child.on("exit", (code) => {
      if (code !== 0) {
        resolve(null);
        return;
      }

      const path = stdout.trim().split("\n")[0];
      if (!path) {
        resolve(null);
        return;
      }

      const verifyChild = spawn(path, ["-V"], {
        stdio: ["ignore", "pipe", "pipe"],
      });

      verifyChild.on("exit", (verifyCode) => {
        resolve(verifyCode === 0 ? path : null);
      });

      verifyChild.on("error", () => resolve(null));
    });

    child.on("error", () => resolve(null));
  });
}

export function getTmuxPath(): Promise<string | null> {
  if (tmuxPath !== null) {
    return Promise.resolve(tmuxPath);
  }

  if (initPromise) {
    return initPromise;
  }

  initPromise = findTmuxPath().then((path) => {
    tmuxPath = path;
    return path;
  });

  return initPromise;
}

export function getCachedTmuxPath(): string | null {
  return tmuxPath;
}

export function startBackgroundTmuxCheck(): void {
  if (!initPromise) {
    initPromise = getTmuxPath();
    initPromise.catch(() => undefined);
  }
}

export function tokenizeCommand(cmd: string): string[] {
  const tokens: string[] = [];
  let current = "";
  let inQuote = false;
  let quoteChar = "";
  let escaped = false;

  for (const char of cmd) {
    if (escaped) {
      current += char;
      escaped = false;
      continue;
    }

    if (char === "\\") {
      escaped = true;
      continue;
    }

    if ((char === "'" || char === '"') && !inQuote) {
      inQuote = true;
      quoteChar = char;
    } else if (char === quoteChar && inQuote) {
      inQuote = false;
      quoteChar = "";
    } else if (char === " " && !inQuote) {
      if (current) {
        tokens.push(current);
        current = "";
      }
    } else {
      current += char;
    }
  }

  if (current) {
    tokens.push(current);
  }
  return tokens;
}

export function findSubcommand(tokens: string[]): string {
  const globalOptionsWithArgs = new Set(["-L", "-S", "-f", "-c", "-T"]);

  let i = 0;
  while (i < tokens.length) {
    const token = tokens[i];

    if (token === "--") {
      return tokens[i + 1] ?? "";
    }

    if (globalOptionsWithArgs.has(token)) {
      i += 2;
      continue;
    }

    if (token.startsWith("-")) {
      i++;
      continue;
    }

    return token;
  }

  return "";
}
