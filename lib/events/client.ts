/**
 * lib/events/client.ts
 *
 * Client-side event buffer with batched fetch + sendBeacon flush.
 * SSR-safe: every window / navigator / localStorage / document access is
 * guarded so this module can be imported by "use client" components without
 * crashing during Next.js server-side rendering.
 */

// ── Types ─────────────────────────────────────────────────────────────────────

export type EventRecord = {
  id: string;
  type: string;
  payload: Record<string, unknown>;
  clientTs: number;
  assignmentId?: number;
  section?: string;
};

type EventContext = {
  assignmentId?: number;
};

// ── Module-level state (singleton per browser tab) ────────────────────────────

let buffer: EventRecord[] = [];
let globalCtx: EventContext = {};
let flushTimer: ReturnType<typeof setInterval> | null = null;
let initialized = false;

// ── Constants ─────────────────────────────────────────────────────────────────

const STORAGE_KEY = "ace_event_buffer";
const FLUSH_INTERVAL_MS = 3_000;   // auto-flush every 3 s
const FLUSH_BATCH_SIZE = 20;       // immediate flush when buffer reaches 20
const API_URL = "/api/events";

// ── localStorage helpers ──────────────────────────────────────────────────────

function loadStored(): EventRecord[] {
  if (typeof localStorage === "undefined") return [];
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as EventRecord[]) : [];
  } catch {
    return [];
  }
}

function saveToStorage(events: EventRecord[]): void {
  if (typeof localStorage === "undefined") return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(events));
  } catch {
    // Quota exceeded or storage unavailable — silently ignore.
  }
}

function clearStorage(): void {
  if (typeof localStorage === "undefined") return;
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    // ignore
  }
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Set the ambient assignment context so callers do not have to pass
 * assignmentId on every logEvent call.  Call this whenever CaseRunner
 * loads a new case.
 */
export function setEventContext(ctx: EventContext): void {
  globalCtx = { ...globalCtx, ...ctx };
}

/**
 * Push one event into the in-memory buffer.
 * Auto-initialises browser listeners on first call (SSR-safe).
 * Triggers an immediate flush when the buffer reaches FLUSH_BATCH_SIZE.
 */
export function logEvent(
  type: string,
  payload?: Record<string, unknown>,
  ctx?: { assignmentId?: number; section?: string },
): void {
  maybeInit(); // SSR-safe; no-op in Node

  const record: EventRecord = {
    id:
      typeof crypto !== "undefined"
        ? crypto.randomUUID()
        : `${Date.now()}-${Math.random().toString(36).slice(2)}`,
    type,
    payload: payload ?? {},
    clientTs: Date.now(),
    assignmentId: ctx?.assignmentId ?? globalCtx.assignmentId,
    section: ctx?.section,
  };

  buffer.push(record);

  if (buffer.length >= FLUSH_BATCH_SIZE) {
    void flush();
  }
}

/**
 * Send buffered events to /api/events via fetch (keepalive).
 * On failure, re-queues events to the front of the buffer and persists
 * them to localStorage so they survive a page reload.
 */
export async function flush(): Promise<void> {
  if (buffer.length === 0) return;

  // Drain the buffer atomically before the async send so new events
  // arriving during the fetch are not double-sent.
  const toSend = buffer.splice(0);

  try {
    const res = await fetch(API_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      keepalive: true,
      body: JSON.stringify({ events: toSend }),
    });

    if (!res.ok) throw new Error(`HTTP ${res.status}`);

    // Success — storage can be cleared (events that survived a crash and
    // were reloaded into `buffer` have now been sent).
    clearStorage();
  } catch {
    // Re-queue failed events at the front so order is preserved.
    buffer = [...toSend, ...buffer];
    // Persist for offline resilience; reloaded on next maybeInit().
    saveToStorage(buffer);
  }
}

// ── Internal helpers ──────────────────────────────────────────────────────────

/** Unload flush via sendBeacon — fire-and-forget, no async. */
function beaconFlush(): void {
  if (typeof navigator === "undefined" || !navigator.sendBeacon) return;
  if (buffer.length === 0) return;

  const toSend = buffer.splice(0);
  const blob = new Blob([JSON.stringify({ events: toSend })], {
    type: "application/json",
  });

  if (navigator.sendBeacon(API_URL, blob)) {
    clearStorage();
  } else {
    // Beacon queuing failed (budget exceeded, etc.) — persist for next load.
    buffer = [...toSend, ...buffer];
    saveToStorage(buffer);
  }
}

/**
 * Idempotent browser initialisation.
 * - Recovers events persisted by a previous session.
 * - Starts the 3-second auto-flush interval.
 * - Registers pagehide / visibilitychange beacon listeners.
 * No-op on the server (typeof window === "undefined").
 */
function maybeInit(): void {
  if (typeof window === "undefined") return; // SSR guard
  if (initialized) return;
  initialized = true;

  // Recover events that survived a previous crash / unload failure.
  const stored = loadStored();
  if (stored.length > 0) {
    buffer = [...stored, ...buffer];
    clearStorage();
    void flush(); // attempt immediate re-send
  }

  // Auto-flush interval.
  flushTimer = setInterval(() => {
    if (buffer.length > 0) void flush();
  }, FLUSH_INTERVAL_MS);

  // Best-effort beacon on page hide / unload.
  window.addEventListener("pagehide", beaconFlush);
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") beaconFlush();
  });
}

// Expose for testing / direct use in effects.
export { beaconFlush };
