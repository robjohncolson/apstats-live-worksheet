// types/globals.d.ts — TYPES ONLY (never shipped, never built): the custom
// window.* globals the allowlisted browser modules read/write. Kept minimal —
// only what tsc needs to check the §2 allowlist; page-level globals outside the
// allowlist stay undeclared on purpose.

/**
 * window.rosterClient (roster-client.js). The global itself stays OPTIONAL — pages
 * load gradebook-client without roster-client and every reader must handle that.
 * token()/studentId() are always defined on the real object (roster-client.js
 * builds one literal with both), so they are required members here.
 */
interface RosterClientApi {
  token: () => string | null;
  studentId: () => string | null;
  current?: () => { username?: string; realName?: string; studentId?: string } | null;
}

/** A row as stored by offline-queue.js (a normalized RecordOpts plus queue metadata). */
interface OfflineQueueRow {
  source?: string;
  itemId?: string;
  attempt?: number;
  studentId?: string;
  transportSequence?: number;
  ts?: number;
  serverFailures?: number;
  [key: string]: unknown;
}

/**
 * window.OfflineQueue (offline-queue.js). The global stays OPTIONAL (not every page
 * loads offline-queue.js). Members gradebook-client feature-detects with typeof
 * stay optional; keyOf()/all() are called directly and always exist on the real object.
 */
interface OfflineQueueApi {
  keyOf: (rec: OfflineQueueRow) => string;
  all: () => Promise<OfflineQueueRow[]>;
  enqueue?: (rec: unknown) => unknown;
  isOffline?: () => boolean;
  supersede?: (rec: unknown) => Promise<boolean>;
  parked?: () => Promise<OfflineQueueRow[]>;
  drain?: (send: (rec: OfflineQueueRow) => unknown) => Promise<{ sent: number; failed: number }>;
}

interface Window {
  ROSTER_SERVICE_URL?: string;
  RAILWAY_ROSTER_URL?: string;
  rosterClient?: RosterClientApi;
  OfflineQueue?: OfflineQueueApi;
  gradebookClient?: GradebookClientApi;
  /** Worksheet hook (defined inline by each live worksheet): re-reads and repaints saved answers. */
  hydratePriorAnswers?: () => unknown;
  /** Worksheet view-as: read-only — record() must refuse (reason 'read-only'). */
  __WS_READ_ONLY__?: boolean;
  /** Teacher view-as: fetchPrior reads THIS student's rows instead of the signed-in user's. */
  __VIEW_AS_STUDENT_ID__?: string;
}

/** window.gradebookClient (gradebook-client.js). Optional: pages that skip the script. */
interface GradebookClientApi {
  record: (opts: RecordOpts) => Promise<RecordResult>;
  requestFrqGrade: (opts: { itemId: string; response: unknown; keepalive?: boolean }) => Promise<RecordResult>;
  syncOfflineQueue: () => Promise<{ sent: number; failed: number }>;
  fetchPrior: (prefix: string, options?: { restore?: boolean }) => Promise<PriorAnswers>;
  fetchReceipts: () => Promise<Array<{ id: string | null; compact: string; src?: string; i?: string; sc?: number; ts?: number }>>;
}
