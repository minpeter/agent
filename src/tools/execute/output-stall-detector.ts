import { spawnSync } from "node:child_process";

export interface OutputStallResult {
  isStalled: boolean;
  sampleCount: number;
  unchangedCount: number;
  lastOutput: string;
  confidence: "high" | "medium" | "low";
  detail: string;
}

export interface StallDetectorOptions {
  sampleCount?: number;
  sampleIntervalMs?: number;
  sessionId: string;
}

function capturePane(sessionId: string): string {
  const result = spawnSync(
    "/bin/bash",
    ["-c", `tmux capture-pane -p -t ${sessionId}`],
    { encoding: "utf-8" }
  );

  if (result.status !== 0) {
    return "";
  }

  return result.stdout || "";
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function detectOutputStall(
  options: StallDetectorOptions
): Promise<OutputStallResult> {
  const { sessionId, sampleCount = 3, sampleIntervalMs = 500 } = options;

  const samples: string[] = [];

  for (let i = 0; i < sampleCount; i++) {
    const output = capturePane(sessionId);
    samples.push(output);

    if (i < sampleCount - 1) {
      await sleep(sampleIntervalMs);
    }
  }

  let unchangedCount = 0;
  for (let i = 1; i < samples.length; i++) {
    if (samples[i] === samples[i - 1]) {
      unchangedCount++;
    }
  }

  const isStalled = unchangedCount === sampleCount - 1;
  const lastOutput = samples.at(-1) ?? "";

  let confidence: "high" | "medium" | "low";
  if (isStalled && sampleCount >= 3) {
    confidence = "high";
  } else if (unchangedCount >= sampleCount / 2) {
    confidence = "medium";
  } else {
    confidence = "low";
  }

  const detail = isStalled
    ? `Output stalled: ${sampleCount} samples over ${(sampleCount - 1) * sampleIntervalMs}ms showed no change`
    : `Output active: ${sampleCount - unchangedCount} of ${sampleCount} samples showed changes`;

  return {
    isStalled,
    sampleCount,
    unchangedCount,
    lastOutput,
    confidence,
    detail,
  };
}

export function detectOutputStallSync(
  sessionId: string,
  sampleCount = 2,
  sampleIntervalMs = 300
): OutputStallResult {
  const samples: string[] = [];

  for (let i = 0; i < sampleCount; i++) {
    const output = capturePane(sessionId);
    samples.push(output);

    if (i < sampleCount - 1) {
      spawnSync("sleep", [(sampleIntervalMs / 1000).toString()]);
    }
  }

  let unchangedCount = 0;
  for (let i = 1; i < samples.length; i++) {
    if (samples[i] === samples[i - 1]) {
      unchangedCount++;
    }
  }

  const isStalled = unchangedCount === sampleCount - 1;
  const lastOutput = samples.at(-1) ?? "";

  let confidence: "high" | "medium" | "low";
  if (isStalled && sampleCount >= 3) {
    confidence = "high";
  } else if (unchangedCount >= sampleCount / 2) {
    confidence = "medium";
  } else {
    confidence = "low";
  }

  const detail = isStalled
    ? `Output stalled: ${sampleCount} samples over ${(sampleCount - 1) * sampleIntervalMs}ms showed no change`
    : `Output active: ${sampleCount - unchangedCount} of ${sampleCount} samples showed changes`;

  return {
    isStalled,
    sampleCount,
    unchangedCount,
    lastOutput,
    confidence,
    detail,
  };
}
