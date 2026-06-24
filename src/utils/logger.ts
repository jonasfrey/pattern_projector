/** In-memory + console logging system with a subscribable live feed. */

export type LogLevel = "DEBUG" | "INFO" | "WARN" | "ERROR";

export interface LogEntry {
  timestamp: string;
  level: LogLevel;
  message: string;
}

type Listener = (entry: LogEntry) => void;

const MAX_ENTRIES = 1000;

class Logger {
  private entries: LogEntry[] = [];
  private listeners = new Set<Listener>();

  private write(level: LogLevel, message: string) {
    const entry: LogEntry = {
      timestamp: new Date().toISOString(),
      level,
      message,
    };
    this.entries.push(entry);
    if (this.entries.length > MAX_ENTRIES) this.entries.shift();

    const stamp = entry.timestamp.replace("T", " ").slice(0, 19);
    const line = `[${stamp}] ${level}: ${message}`;
    if (level === "ERROR") console.error(line);
    else if (level === "WARN") console.warn(line);
    else console.log(line);

    for (const l of this.listeners) {
      try {
        l(entry);
      } catch {
        // ignore listener failures
      }
    }
  }

  debug(msg: string) {
    this.write("DEBUG", msg);
  }
  info(msg: string) {
    this.write("INFO", msg);
  }
  warn(msg: string) {
    this.write("WARN", msg);
  }
  error(msg: string) {
    this.write("ERROR", msg);
  }

  history(limit = 200): LogEntry[] {
    return this.entries.slice(-limit);
  }

  clear() {
    this.entries = [];
  }

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }
}

export const logger = new Logger();
