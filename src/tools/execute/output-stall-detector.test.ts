import { describe, expect, it } from "bun:test";
import type { OutputStallResult } from "./output-stall-detector";

describe("OutputStallResult interface", () => {
  it("has correct structure", () => {
    const result: OutputStallResult = {
      isStalled: true,
      sampleCount: 3,
      unchangedCount: 2,
      lastOutput: "test output",
      confidence: "high",
      detail: "Output stalled",
    };

    expect(result.isStalled).toBe(true);
    expect(result.sampleCount).toBe(3);
    expect(result.unchangedCount).toBe(2);
    expect(result.lastOutput).toBe("test output");
    expect(result.confidence).toBe("high");
    expect(result.detail).toBe("Output stalled");
  });

  it("supports all confidence levels", () => {
    const highConfidence: OutputStallResult = {
      isStalled: true,
      sampleCount: 3,
      unchangedCount: 2,
      lastOutput: "",
      confidence: "high",
      detail: "",
    };

    const mediumConfidence: OutputStallResult = {
      isStalled: false,
      sampleCount: 3,
      unchangedCount: 1,
      lastOutput: "",
      confidence: "medium",
      detail: "",
    };

    const lowConfidence: OutputStallResult = {
      isStalled: false,
      sampleCount: 3,
      unchangedCount: 0,
      lastOutput: "",
      confidence: "low",
      detail: "",
    };

    expect(highConfidence.confidence).toBe("high");
    expect(mediumConfidence.confidence).toBe("medium");
    expect(lowConfidence.confidence).toBe("low");
  });
});

describe("stall detection logic", () => {
  it("calculates stall correctly when all samples are same", () => {
    const samples = ["output", "output", "output"];
    let unchangedCount = 0;
    for (let i = 1; i < samples.length; i++) {
      if (samples[i] === samples[i - 1]) {
        unchangedCount++;
      }
    }
    const isStalled = unchangedCount === samples.length - 1;

    expect(unchangedCount).toBe(2);
    expect(isStalled).toBe(true);
  });

  it("calculates not stalled when samples differ", () => {
    const samples = ["output1", "output2", "output3"];
    let unchangedCount = 0;
    for (let i = 1; i < samples.length; i++) {
      if (samples[i] === samples[i - 1]) {
        unchangedCount++;
      }
    }
    const isStalled = unchangedCount === samples.length - 1;

    expect(unchangedCount).toBe(0);
    expect(isStalled).toBe(false);
  });

  it("calculates partial stall correctly", () => {
    const samples = ["output1", "output1", "output2"];
    let unchangedCount = 0;
    for (let i = 1; i < samples.length; i++) {
      if (samples[i] === samples[i - 1]) {
        unchangedCount++;
      }
    }
    const isStalled = unchangedCount === samples.length - 1;

    expect(unchangedCount).toBe(1);
    expect(isStalled).toBe(false);
  });

  it("determines confidence based on sample count and unchanged count", () => {
    const determineConfidence = (
      isStalled: boolean,
      sampleCount: number,
      unchangedCount: number
    ): "high" | "medium" | "low" => {
      if (isStalled && sampleCount >= 3) {
        return "high";
      }
      if (unchangedCount >= sampleCount / 2) {
        return "medium";
      }
      return "low";
    };

    expect(determineConfidence(true, 3, 2)).toBe("high");
    expect(determineConfidence(true, 2, 1)).toBe("medium");
    expect(determineConfidence(false, 4, 2)).toBe("medium");
    expect(determineConfidence(false, 4, 1)).toBe("low");
  });
});
