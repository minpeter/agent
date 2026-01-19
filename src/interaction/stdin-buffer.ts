import { EventEmitter } from "node:events";

const ESC = "\x1b";
const BRACKETED_PASTE_START = "\x1b[200~";
const BRACKETED_PASTE_END = "\x1b[201~";
const NUMERIC_REGEX = /^\d+$/;

type SequenceStatus = "complete" | "incomplete" | "not-escape";

const isCompleteSequence = (data: string): SequenceStatus => {
  if (!data.startsWith(ESC)) {
    return "not-escape";
  }
  if (data.length === 1) {
    return "incomplete";
  }

  const afterEsc = data.slice(1);
  if (afterEsc.startsWith("[")) {
    if (afterEsc.startsWith("[M")) {
      return data.length >= 6 ? "complete" : "incomplete";
    }
    return isCompleteCsiSequence(data);
  }
  if (afterEsc.startsWith("]")) {
    return isCompleteOscSequence(data);
  }
  if (afterEsc.startsWith("P")) {
    return isCompleteDcsSequence(data);
  }
  if (afterEsc.startsWith("_")) {
    return isCompleteApcSequence(data);
  }
  if (afterEsc.startsWith("O")) {
    return afterEsc.length >= 2 ? "complete" : "incomplete";
  }
  if (afterEsc.length === 1) {
    return "complete";
  }
  return "complete";
};

const isCompleteCsiSequence = (data: string): "complete" | "incomplete" => {
  if (!data.startsWith(`${ESC}[`)) {
    return "complete";
  }
  if (data.length < 3) {
    return "incomplete";
  }
  const payload = data.slice(2);
  const lastChar = payload.at(-1);
  if (!lastChar) {
    return "incomplete";
  }
  const lastCode = lastChar.charCodeAt(0);
  if (lastCode >= 0x40 && lastCode <= 0x7e) {
    if (payload.startsWith("<") && (lastChar === "m" || lastChar === "M")) {
      const params = payload.slice(1, -1).split(";");
      const allNumeric = params.every((param) => NUMERIC_REGEX.test(param));
      return allNumeric ? "complete" : "incomplete";
    }
    return "complete";
  }
  return "incomplete";
};

const isCompleteOscSequence = (data: string): "complete" | "incomplete" => {
  if (!data.startsWith(`${ESC}]`)) {
    return "complete";
  }
  return data.endsWith(`${ESC}\\`) || data.endsWith("\x07")
    ? "complete"
    : "incomplete";
};

const isCompleteDcsSequence = (data: string): "complete" | "incomplete" => {
  if (!data.startsWith(`${ESC}P`)) {
    return "complete";
  }
  return data.endsWith(`${ESC}\\`) ? "complete" : "incomplete";
};

const isCompleteApcSequence = (data: string): "complete" | "incomplete" => {
  if (!data.startsWith(`${ESC}_`)) {
    return "complete";
  }
  return data.endsWith(`${ESC}\\`) ? "complete" : "incomplete";
};

const extractCompleteSequences = (
  buffer: string
): { sequences: string[]; remainder: string } => {
  const sequences: string[] = [];
  let pos = 0;

  while (pos < buffer.length) {
    const remaining = buffer.slice(pos);
    if (remaining.startsWith(ESC)) {
      let seqEnd = 1;
      while (seqEnd <= remaining.length) {
        const candidate = remaining.slice(0, seqEnd);
        const status = isCompleteSequence(candidate);
        if (status === "complete") {
          sequences.push(candidate);
          pos += seqEnd;
          break;
        }
        if (status === "incomplete") {
          seqEnd += 1;
          continue;
        }
        sequences.push(candidate);
        pos += seqEnd;
        break;
      }
      if (seqEnd > remaining.length) {
        return { sequences, remainder: remaining };
      }
    } else {
      sequences.push(remaining[0] ?? "");
      pos += 1;
    }
  }

  return { sequences, remainder: "" };
};

export interface StdinBufferOptions {
  timeout?: number;
}

export class StdinBuffer extends EventEmitter {
  private buffer = "";
  private timeout: ReturnType<typeof setTimeout> | null = null;
  private readonly timeoutMs: number;
  private pasteMode = false;
  private pasteBuffer = "";

  constructor(options: StdinBufferOptions = {}) {
    super();
    this.timeoutMs = options.timeout ?? 10;
  }

  private convertBufferToString(data: string | Buffer): string {
    if (!Buffer.isBuffer(data)) {
      return data;
    }

    if (data.length === 1 && data[0] !== undefined && data[0] > 127) {
      const byte = data[0] - 128;
      return `\x1b${String.fromCharCode(byte)}`;
    }

    return data.toString();
  }

  private processPasteModeBuffer(): void {
    this.pasteBuffer += this.buffer;
    this.buffer = "";
    const endIndex = this.pasteBuffer.indexOf(BRACKETED_PASTE_END);

    if (endIndex === -1) {
      return;
    }

    const pastedContent = this.pasteBuffer.slice(0, endIndex);
    const remaining = this.pasteBuffer.slice(
      endIndex + BRACKETED_PASTE_END.length
    );
    this.pasteMode = false;
    this.pasteBuffer = "";
    this.emit("paste", pastedContent);

    if (remaining.length > 0) {
      this.process(remaining);
    }
  }

  private handleBracketedPasteStart(startIndex: number): void {
    if (startIndex > 0) {
      const beforePaste = this.buffer.slice(0, startIndex);
      const result = extractCompleteSequences(beforePaste);
      for (const sequence of result.sequences) {
        this.emit("data", sequence);
      }
    }

    this.buffer = this.buffer.slice(startIndex + BRACKETED_PASTE_START.length);
    this.pasteMode = true;
    this.pasteBuffer = this.buffer;
    this.buffer = "";

    const endIndex = this.pasteBuffer.indexOf(BRACKETED_PASTE_END);
    if (endIndex !== -1) {
      const pastedContent = this.pasteBuffer.slice(0, endIndex);
      const remaining = this.pasteBuffer.slice(
        endIndex + BRACKETED_PASTE_END.length
      );
      this.pasteMode = false;
      this.pasteBuffer = "";
      this.emit("paste", pastedContent);

      if (remaining.length > 0) {
        this.process(remaining);
      }
    }
  }

  private processNormalInput(): void {
    const result = extractCompleteSequences(this.buffer);
    this.buffer = result.remainder;

    for (const sequence of result.sequences) {
      this.emit("data", sequence);
    }

    if (this.buffer.length > 0) {
      this.timeout = setTimeout(() => {
        const flushed = this.flush();
        for (const sequence of flushed) {
          this.emit("data", sequence);
        }
      }, this.timeoutMs);
    }
  }

  process(data: string | Buffer): void {
    if (this.timeout) {
      clearTimeout(this.timeout);
      this.timeout = null;
    }

    const str = this.convertBufferToString(data);

    if (str.length === 0 && this.buffer.length === 0) {
      this.emit("data", "");
      return;
    }

    this.buffer += str;

    if (this.pasteMode) {
      this.processPasteModeBuffer();
      return;
    }

    const startIndex = this.buffer.indexOf(BRACKETED_PASTE_START);
    if (startIndex !== -1) {
      this.handleBracketedPasteStart(startIndex);
      return;
    }

    this.processNormalInput();
  }

  flush(): string[] {
    if (this.timeout) {
      clearTimeout(this.timeout);
      this.timeout = null;
    }
    if (this.buffer.length === 0) {
      return [];
    }
    const sequences = [this.buffer];
    this.buffer = "";
    return sequences;
  }

  clear(): void {
    if (this.timeout) {
      clearTimeout(this.timeout);
      this.timeout = null;
    }
    this.buffer = "";
    this.pasteMode = false;
    this.pasteBuffer = "";
  }

  getBuffer(): string {
    return this.buffer;
  }

  destroy(): void {
    this.clear();
  }
}
