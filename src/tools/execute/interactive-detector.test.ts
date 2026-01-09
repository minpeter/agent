import { describe, expect, it } from "bun:test";
import {
  type DetectionContext,
  detectInteractivePrompt,
  formatDetectionResults,
} from "./interactive-detector";

describe("detectInteractivePrompt", () => {
  describe("regex_pattern detection (high confidence)", () => {
    it("detects [Y/n] prompt", () => {
      const context: DetectionContext = {
        terminalContent: "Do you want to continue? [Y/n]",
      };

      const results = detectInteractivePrompt(context);

      expect(results.length).toBeGreaterThan(0);
      const regexResult = results.find((r) => r.method === "regex_pattern");
      expect(regexResult).toBeDefined();
      expect(regexResult?.confidence).toBe("high");
    });

    it("detects [y/N] prompt", () => {
      const context: DetectionContext = {
        terminalContent: "Are you sure? [y/N]",
      };

      const results = detectInteractivePrompt(context);

      const regexResult = results.find((r) => r.method === "regex_pattern");
      expect(regexResult).toBeDefined();
      expect(regexResult?.confidence).toBe("high");
    });

    it("detects dpkg config conflict prompt", () => {
      const context: DetectionContext = {
        terminalContent:
          "Configuration file '/etc/nginx/nginx.conf'\n(Y/I/N/O/D/Z)",
      };

      const results = detectInteractivePrompt(context);

      const regexResult = results.find((r) => r.method === "regex_pattern");
      expect(regexResult).toBeDefined();
      expect(regexResult?.detail).toContain("dpkg config file conflict");
    });

    it("detects password prompt", () => {
      const context: DetectionContext = {
        terminalContent: "Password:",
      };

      const results = detectInteractivePrompt(context);

      const regexResult = results.find((r) => r.method === "regex_pattern");
      expect(regexResult).toBeDefined();
      expect(regexResult?.detail).toContain("Password prompt");
    });

    it("detects SSH host key verification", () => {
      const context: DetectionContext = {
        terminalContent:
          "Are you sure you want to continue connecting (yes/no/[fingerprint])?",
      };

      const results = detectInteractivePrompt(context);

      const regexResult = results.find((r) => r.method === "regex_pattern");
      expect(regexResult).toBeDefined();
      expect(regexResult?.detail).toContain("SSH host key verification");
    });

    it("does not detect apt-get progress as interactive", () => {
      const context: DetectionContext = {
        terminalContent: "Hit:1 http://archive.ubuntu.com\nGet:2 http://...",
      };

      const results = detectInteractivePrompt(context);

      const regexResult = results.find((r) => r.method === "regex_pattern");
      expect(regexResult).toBeUndefined();
    });
  });

  describe("last_line_prompt detection (low confidence)", () => {
    it("detects line ending with ?", () => {
      const context: DetectionContext = {
        terminalContent: "What is your name?",
      };

      const results = detectInteractivePrompt(context);

      const lastLineResult = results.find(
        (r) => r.method === "last_line_prompt"
      );
      expect(lastLineResult).toBeDefined();
      expect(lastLineResult?.confidence).toBe("low");
    });

    it("detects line ending with :", () => {
      const context: DetectionContext = {
        terminalContent: "Enter value:",
      };

      const results = detectInteractivePrompt(context);

      const lastLineResult = results.find(
        (r) => r.method === "last_line_prompt"
      );
      expect(lastLineResult).toBeDefined();
    });

    it("detects Python REPL prompt", () => {
      const context: DetectionContext = {
        terminalContent: ">>> ",
      };

      const results = detectInteractivePrompt(context);

      const lastLineResult = results.find(
        (r) => r.method === "last_line_prompt"
      );
      expect(lastLineResult).toBeDefined();
    });

    it("ignores shell prompt only lines", () => {
      const context: DetectionContext = {
        terminalContent: "$ ",
      };

      const results = detectInteractivePrompt(context);

      const lastLineResult = results.find(
        (r) => r.method === "last_line_prompt"
      );
      expect(lastLineResult).toBeUndefined();
    });

    it("ignores internal markers", () => {
      const context: DetectionContext = {
        terminalContent: "__CEA_S_12345__",
      };

      const results = detectInteractivePrompt(context);

      const lastLineResult = results.find(
        (r) => r.method === "last_line_prompt"
      );
      expect(lastLineResult).toBeUndefined();
    });
  });

  describe("result ordering", () => {
    it("sorts results by confidence (high first)", () => {
      const context: DetectionContext = {
        terminalContent: "Do you want to continue? [Y/n]",
      };

      const results = detectInteractivePrompt(context);

      if (results.length > 1) {
        const confidenceOrder = { high: 0, medium: 1, low: 2 };
        for (let i = 1; i < results.length; i++) {
          expect(
            confidenceOrder[results[i - 1].confidence]
          ).toBeLessThanOrEqual(confidenceOrder[results[i].confidence]);
        }
      }
    });
  });

  describe("empty/no detection cases", () => {
    it("returns empty array for normal output", () => {
      const context: DetectionContext = {
        terminalContent: "Hello, World!\nThis is normal output.",
      };

      const results = detectInteractivePrompt(context);

      expect(results.length).toBe(0);
    });

    it("returns empty array for empty content", () => {
      const context: DetectionContext = {
        terminalContent: "",
      };

      const results = detectInteractivePrompt(context);

      expect(results.length).toBe(0);
    });
  });
});

describe("formatDetectionResults", () => {
  it("returns empty string for no results", () => {
    const result = formatDetectionResults([]);

    expect(result).toBe("");
  });

  it("formats single high confidence result", () => {
    const results = [
      {
        detected: true,
        method: "regex_pattern" as const,
        confidence: "high" as const,
        detail: 'Pattern matched: "Yes/No prompt"',
        suggestedActions: [
          "Respond with: Y<Enter>",
          "Or use <Ctrl+C> to cancel",
        ],
      },
    ];

    const formatted = formatDetectionResults(results);

    expect(formatted).toContain("[INTERACTIVE PROMPT DETECTED]");
    expect(formatted).toContain("regex_pattern");
    expect(formatted).toContain("high");
    expect(formatted).toContain("[SUGGESTED ACTIONS]");
    expect(formatted).toContain("Y<Enter>");
  });

  it("uses high confidence actions when available", () => {
    const results = [
      {
        detected: true,
        method: "regex_pattern" as const,
        confidence: "high" as const,
        detail: "High confidence detection",
        suggestedActions: ["High confidence action"],
      },
      {
        detected: true,
        method: "last_line_prompt" as const,
        confidence: "low" as const,
        detail: "Low confidence detection",
        suggestedActions: ["Low confidence action"],
      },
    ];

    const formatted = formatDetectionResults(results);

    expect(formatted).toContain("High confidence action");
    expect(formatted).not.toContain("Low confidence action");
  });

  it("combines actions when no high confidence result", () => {
    const results = [
      {
        detected: true,
        method: "process_state" as const,
        confidence: "medium" as const,
        detail: "Medium confidence detection",
        suggestedActions: ["Medium action 1"],
      },
      {
        detected: true,
        method: "last_line_prompt" as const,
        confidence: "low" as const,
        detail: "Low confidence detection",
        suggestedActions: ["Low action 1"],
      },
    ];

    const formatted = formatDetectionResults(results);

    expect(formatted).toContain("Medium action 1");
    expect(formatted).toContain("Low action 1");
  });
});
