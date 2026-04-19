export interface AppErrorLogEntry {
  id: string;
  at: string;
  location: string;
  message: string;
  detail: string;
}

const STORAGE_KEY = "cashbook:error-log";
const MAX_ENTRIES = 50;
const SENSITIVE_KEY_PATTERN = /(token|secret|password|authorization|cookie|api[-_]?key|apikey|jwt|session)/i;
const JWT_PATTERN = /\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9._-]+\.[A-Za-z0-9._-]+\b/g;
const BEARER_PATTERN = /\bBearer\s+[A-Za-z0-9\-._~+/]+=*\b/gi;
const SUPABASE_KEY_PATTERN = /\bsb_[A-Za-z0-9_-]{20,}\b/g;

function canUseStorage(): boolean {
  return typeof window !== "undefined" && typeof window.localStorage !== "undefined";
}

function sanitizeString(value: string): string {
  return value
    .replace(BEARER_PATTERN, "Bearer [redacted]")
    .replace(JWT_PATTERN, "[redacted-jwt]")
    .replace(SUPABASE_KEY_PATTERN, "[redacted-key]");
}

function safeStringify(value: unknown): string {
  try {
    return JSON.stringify(
      value,
      (key, currentValue) => {
        if (SENSITIVE_KEY_PATTERN.test(key)) {
          return "[redacted]";
        }
        if (typeof currentValue === "string") {
          return sanitizeString(currentValue);
        }
        return currentValue;
      },
      2
    );
  } catch {
    return sanitizeString(String(value));
  }
}

function normalizeError(error: unknown): { message: string; detail: string } {
  if (error instanceof Error) {
    const typedError = error as Error & {
      code?: string;
      status?: number;
      statusCode?: number;
      hint?: string;
      details?: string;
      cause?: unknown;
      reason?: unknown;
    };
    const detailPayload = {
      name: typedError.name || "Error",
      message: typedError.message || "Unexpected error",
      code: typedError.code,
      status: typedError.status ?? typedError.statusCode,
      hint: typedError.hint,
      details: typedError.details,
      cause: typedError.cause,
      reason: typedError.reason,
      stack: typedError.stack
    };
    return {
      message: sanitizeString(error.message || error.name || "Unexpected error"),
      detail: safeStringify(detailPayload)
    };
  }

  if (typeof error === "object" && error) {
    const message =
      "message" in error && typeof error.message === "string"
        ? error.message
        : "Unhandled object error";

      return {
      message: sanitizeString(message),
      detail: safeStringify(error)
    };
  }

  if (typeof error === "string") {
    return {
      message: sanitizeString(error),
      detail: sanitizeString(error)
    };
  }

  return {
    message: "Unknown error",
    detail: safeStringify(error)
  };
}

function readEntries(): AppErrorLogEntry[] {
  if (!canUseStorage()) {
    return [];
  }

  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      return [];
    }

    const parsed = JSON.parse(raw) as AppErrorLogEntry[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeEntries(entries: AppErrorLogEntry[]): void {
  if (!canUseStorage()) {
    return;
  }

  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(entries.slice(0, MAX_ENTRIES)));
  } catch {
    // Ignore storage write failures.
  }
}

export function listAppErrorLogEntries(): AppErrorLogEntry[] {
  return readEntries();
}

export function clearAppErrorLogEntries(): void {
  if (!canUseStorage()) {
    return;
  }

  try {
    window.localStorage.removeItem(STORAGE_KEY);
  } catch {
    // Ignore storage write failures.
  }
}

export function recordAppError(params: {
  location: string;
  error: unknown;
  detail?: string;
}): AppErrorLogEntry {
  const { location, error, detail = "" } = params;
  const normalized = normalizeError(error);
  const entry: AppErrorLogEntry = {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    at: new Date().toISOString(),
    location,
    message: normalized.message,
    detail: detail ? sanitizeString(detail) : normalized.detail
  };

  const nextEntries = [entry, ...readEntries()].slice(0, MAX_ENTRIES);
  writeEntries(nextEntries);
  return entry;
}
