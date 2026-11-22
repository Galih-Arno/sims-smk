import { api } from "./api.ts";

export type OfflineQueueItem = {
  id: string;
  endpoint: string;
  method: "POST" | "PATCH";
  body: string;
  label: string;
  createdAt: string;
};

const STORAGE_KEY = "sakti_offline_sync_queue_v1";

export function getOfflineQueue(): OfflineQueueItem[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as OfflineQueueItem[]) : [];
  } catch {
    return [];
  }
}

export function enqueueOfflineRequest(item: Omit<OfflineQueueItem, "id" | "createdAt">): OfflineQueueItem {
  const queue = getOfflineQueue();
  const entry: OfflineQueueItem = {
    ...item,
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    createdAt: new Date().toISOString(),
  };
  queue.push(entry);
  localStorage.setItem(STORAGE_KEY, JSON.stringify(queue));
  window.dispatchEvent(new Event("sakti-offline-queue-changed"));
  return entry;
}

export async function flushOfflineQueue(): Promise<{ synced: number; remaining: number }> {
  if (!navigator.onLine) {
    return { synced: 0, remaining: getOfflineQueue().length };
  }
  const queue = getOfflineQueue();
  if (queue.length === 0) return { synced: 0, remaining: 0 };

  const failed: OfflineQueueItem[] = [];
  let synced = 0;

  for (const item of queue) {
    try {
      await api(item.endpoint, {
        method: item.method,
        body: item.body,
      });
      synced += 1;
    } catch {
      failed.push(item);
    }
  }

  localStorage.setItem(STORAGE_KEY, JSON.stringify(failed));
  window.dispatchEvent(new Event("sakti-offline-queue-changed"));
  return { synced, remaining: failed.length };
}
