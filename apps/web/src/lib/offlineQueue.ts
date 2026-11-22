import { api } from "./api.ts";

export type OfflineQueueItem = {
  id: string;
  label: string;
  endpoint: string;
  payload: Record<string, unknown>;
  createdAt: string;
};

const QUEUE_KEY = "saktiku.offlineQueue.v1";
const QUEUE_EVENT = "saktiku:queue-changed";

export function readOfflineQueue(): OfflineQueueItem[] {
  try {
    const raw = localStorage.getItem(QUEUE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeOfflineQueue(items: OfflineQueueItem[]): void {
  localStorage.setItem(QUEUE_KEY, JSON.stringify(items));
  window.dispatchEvent(new Event(QUEUE_EVENT));
}

export function enqueueOfflineAction(item: Omit<OfflineQueueItem, "id" | "createdAt">): OfflineQueueItem {
  const entry: OfflineQueueItem = {
    ...item,
    id: `q-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    createdAt: new Date().toISOString(),
  };
  const current = readOfflineQueue();
  writeOfflineQueue([...current, entry]);
  return entry;
}

export async function flushOfflineQueue(): Promise<{ synced: number; remaining: number }> {
  if (!navigator.onLine) {
    return { synced: 0, remaining: readOfflineQueue().length };
  }
  const current = readOfflineQueue();
  if (current.length === 0) {
    return { synced: 0, remaining: 0 };
  }

  let synced = 0;
  const failed: OfflineQueueItem[] = [];

  for (const item of current) {
    try {
      await api(item.endpoint, {
        method: "POST",
        body: JSON.stringify(item.payload),
      });
      synced += 1;
    } catch (err) {
      const status = typeof err === "object" && err && "status" in err ? Number((err as { status: number }).status) : 0;
      if (status === 0 || status >= 500) {
        failed.push(item);
      }
    }
  }

  writeOfflineQueue(failed);
  return { synced, remaining: failed.length };
}

export function subscribeOfflineQueue(listener: () => void): () => void {
  const onOnline = () => {
    void flushOfflineQueue();
  };
  window.addEventListener(QUEUE_EVENT, listener);
  window.addEventListener("online", onOnline);
  return () => {
    window.removeEventListener(QUEUE_EVENT, listener);
    window.removeEventListener("online", onOnline);
  };
}
