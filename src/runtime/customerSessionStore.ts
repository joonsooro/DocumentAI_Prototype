/**
 * SF #2d — Customer-route session memory.
 *
 * The /customer route's session-critical state (chat conversation,
 * compiled configuration, extracted run, readiness verdict, uploaded
 * file, turn counter) was held in component-local useState before this
 * SF. When the operator navigated to /admin or /internal via the
 * ShellBar's NavLink, the route's component unmounted under SPA-nav
 * semantics and React discarded all hook state. Returning to /customer
 * re-mounted the route with empty defaults — the §6 multi-route demo
 * could not be walked through because every nav round-trip wiped the
 * chat history and the panels.
 *
 * This module lifts that state into a process-singleton store mirroring
 * the qualityMetricLog pattern (src/runtime/qualityMetricLog.ts):
 *
 *   - Module-level `let session` holds the current snapshot.
 *   - getCustomerSession() returns the snapshot (used by the route on
 *     mount + by subscribers on notify).
 *   - updateCustomerSession(updater) applies the updater and notifies
 *     subscribers. Mutators NEVER return; callers read the next value
 *     by re-reading getCustomerSession() if they need it.
 *   - subscribe(fn) returns an unsubscribe; the customer route binds a
 *     useEffect to subscribe → setSnapshot(getCustomerSession()).
 *   - _resetForTests() restores INITIAL_SNAPSHOT and clears subscribers
 *     — every test mounting CustomerRoute calls this in beforeEach so
 *     module-level state does not leak between cases.
 *
 * Design choices:
 *   - NO persistence layer. localStorage / sessionStorage / IndexedDB /
 *     cookies are deliberately not used. SUB-2 binds; a hard reload
 *     (Cmd-R) must wipe everything for a clean demo restart. This is a
 *     product requirement, not an accidental omission.
 *   - NO Langfuse mirror. qualityMetricLog has one because it carries
 *     observability data the product team consumes; this store carries
 *     UI session state that has no analytics meaning.
 *   - Single snapshot type. updateCustomerSession takes an immutable
 *     updater and the store stores one frozen-by-construction object.
 *     The route destructures it on every render to keep call sites
 *     close to the prior useState-based shape.
 *   - CustomerSessionSnapshot is defined HERE (not in src/domain/types.ts)
 *     because it references CustomerViewModel which lives at
 *     src/components/customer/viewModel.ts; putting it in domain/types
 *     would invert the domain → components dependency.
 *
 * Non-goals:
 *   - Server-side state. The Node sidecar's qualityMetricLog is separate.
 *   - /admin or /internal session state. They remain stateless reads.
 *   - Multi-tab synchronisation. Each browser tab gets its own process
 *     and its own store — by design.
 */

import { createConversation } from '@domain/chatReducer';
import type { ConversationState, DocumentRun } from '@domain/types';
import {
  EMPTY_CUSTOMER_VIEW_MODEL,
  type CustomerViewModel,
} from '@components/customer/viewModel';

// ---------------------------------------------------------------------------
// Snapshot shape
// ---------------------------------------------------------------------------

export interface CustomerSessionSnapshot {
  readonly conversation: ConversationState;
  readonly viewModel: CustomerViewModel;
  readonly extractedRun: DocumentRun | null;
  readonly uploadedFile: { readonly name: string } | null;
  readonly turnCounter: number;
}

function buildInitialSnapshot(): CustomerSessionSnapshot {
  return Object.freeze({
    conversation: createConversation('conv::customer::v0'),
    viewModel: EMPTY_CUSTOMER_VIEW_MODEL,
    extractedRun: null,
    uploadedFile: null,
    turnCounter: 0,
  });
}

// ---------------------------------------------------------------------------
// Module-level store — single instance per process (browser tab or Node test
// run). Tests reset via _resetForTests().
// ---------------------------------------------------------------------------

let session: CustomerSessionSnapshot = buildInitialSnapshot();
type Subscriber = () => void;
const subscribers = new Set<Subscriber>();

// ---------------------------------------------------------------------------
// Read surface
// ---------------------------------------------------------------------------

export function getCustomerSession(): CustomerSessionSnapshot {
  return session;
}

// ---------------------------------------------------------------------------
// Write surface
// ---------------------------------------------------------------------------

export function updateCustomerSession(
  updater: (prev: CustomerSessionSnapshot) => CustomerSessionSnapshot,
): void {
  session = updater(session);
  notify();
}

// ---------------------------------------------------------------------------
// Subscription surface
// ---------------------------------------------------------------------------

export function subscribe(fn: Subscriber): () => void {
  subscribers.add(fn);
  return () => {
    subscribers.delete(fn);
  };
}

function notify(): void {
  if (subscribers.size === 0) return;
  for (const fn of subscribers) {
    try {
      fn();
    } catch {
      // Subscriber threw — do not let a downstream renderer break the store.
    }
  }
}

// ---------------------------------------------------------------------------
// Test-only reset
// ---------------------------------------------------------------------------

export function _resetForTests(): void {
  session = buildInitialSnapshot();
  subscribers.clear();
}
