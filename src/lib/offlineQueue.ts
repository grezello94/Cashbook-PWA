import type { EntryInsertInput } from "@/types/domain";

const STORAGE_KEY = "cashbook.offline.queue.v1";

type QueueAction =
  | {
      id: string;
      type: "add_entry";
      payload: EntryInsertInput;
      createdAt: string;
    };

function loadQueue(): QueueAction[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      return [];
    }
    const parsed = JSON.parse(raw) as QueueAction[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function saveQueue(items: QueueAction[]): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
}

function id(): string {
  return `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

export function enqueueEntry(input: EntryInsertInput): void {
  const queue = loadQueue();
  queue.push({
    id: id(),
    type: "add_entry",
    payload: input,
    createdAt: new Date().toISOString()
  });
  saveQueue(queue);
}

export function queueSize(): number {
  return loadQueue().length;
}

export async function flushQueue(
  handlers: {
    addEntry: (input: EntryInsertInput) => Promise<void>;
  }
): Promise<void> {
  const queue = loadQueue();
  if (!queue.length) {
    return;
  }

  const remaining: QueueAction[] = [];

  for (const action of queue) {
    try {
      if (action.type === "add_entry") {
        await handlers.addEntry(action.payload);
      }
    } catch {
      remaining.push(action);
    }
  }

  saveQueue(remaining);
}
