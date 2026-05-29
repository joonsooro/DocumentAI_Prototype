/**
 * SF #2d — customerSessionStore unit tests.
 *
 * Asserts the store's get/update/subscribe/_resetForTests surface
 * matches the qualityMetricLog-derived contract:
 *   - getCustomerSession returns the initial snapshot before any update
 *   - updateCustomerSession applies the updater and notifies subscribers
 *   - subscribe returns an unsubscribe that stops further notifications
 *   - _resetForTests restores the initial snapshot AND clears subscribers
 *   - Multiple updates compose; subscribers see the latest snapshot
 *   - A throwing subscriber does not break the update path
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  _resetForTests,
  getCustomerSession,
  subscribe,
  updateCustomerSession,
} from '@runtime/customerSessionStore';

beforeEach(() => {
  _resetForTests();
});

describe('SF #2d customerSessionStore — read surface', () => {
  it('getCustomerSession returns the initial snapshot when no updates have run', () => {
    const s = getCustomerSession();
    expect(s.conversation.id).toBe('conv::customer::v0');
    expect(s.conversation.turns.length).toBe(0);
    expect(s.viewModel.intent).toBeNull();
    expect(s.viewModel.configuration).toBeNull();
    expect(s.viewModel.readiness).toBeNull();
    expect(s.viewModel.assessments).toEqual([]);
    expect(s.extractedRun).toBeNull();
    expect(s.uploadedFile).toBeNull();
    expect(s.turnCounter).toBe(0);
  });
});

describe('SF #2d customerSessionStore — write surface', () => {
  it('updateCustomerSession applies the updater and the next get reflects it', () => {
    updateCustomerSession((prev) => ({ ...prev, turnCounter: prev.turnCounter + 1 }));
    expect(getCustomerSession().turnCounter).toBe(1);
    updateCustomerSession((prev) => ({ ...prev, turnCounter: prev.turnCounter + 1 }));
    expect(getCustomerSession().turnCounter).toBe(2);
  });

  it('updateCustomerSession passes the latest snapshot to the updater', () => {
    const seen: number[] = [];
    updateCustomerSession((prev) => {
      seen.push(prev.turnCounter);
      return { ...prev, turnCounter: 5 };
    });
    updateCustomerSession((prev) => {
      seen.push(prev.turnCounter);
      return { ...prev, turnCounter: prev.turnCounter + 1 };
    });
    expect(seen).toEqual([0, 5]);
    expect(getCustomerSession().turnCounter).toBe(6);
  });

  it('updateCustomerSession preserves untouched fields', () => {
    updateCustomerSession((prev) => ({ ...prev, turnCounter: 42 }));
    const s = getCustomerSession();
    expect(s.turnCounter).toBe(42);
    expect(s.conversation.id).toBe('conv::customer::v0');
    expect(s.viewModel.intent).toBeNull();
  });
});

describe('SF #2d customerSessionStore — subscription surface', () => {
  it('subscribers fire after every update', () => {
    const fn = vi.fn();
    subscribe(fn);
    updateCustomerSession((prev) => ({ ...prev, turnCounter: 1 }));
    updateCustomerSession((prev) => ({ ...prev, turnCounter: 2 }));
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it('unsubscribe stops further notifications', () => {
    const fn = vi.fn();
    const unsub = subscribe(fn);
    updateCustomerSession((prev) => ({ ...prev, turnCounter: 1 }));
    expect(fn).toHaveBeenCalledTimes(1);
    unsub();
    updateCustomerSession((prev) => ({ ...prev, turnCounter: 2 }));
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('multiple subscribers all fire on update', () => {
    const a = vi.fn();
    const b = vi.fn();
    subscribe(a);
    subscribe(b);
    updateCustomerSession((prev) => ({ ...prev, turnCounter: 1 }));
    expect(a).toHaveBeenCalledTimes(1);
    expect(b).toHaveBeenCalledTimes(1);
  });

  it('a throwing subscriber does not break the update path', () => {
    subscribe(() => {
      throw new Error('renderer blew up');
    });
    expect(() => updateCustomerSession((prev) => ({ ...prev, turnCounter: 1 }))).not.toThrow();
    expect(getCustomerSession().turnCounter).toBe(1);
  });

  it('subscribers see the latest snapshot when they re-read getCustomerSession', () => {
    const seen: number[] = [];
    subscribe(() => {
      seen.push(getCustomerSession().turnCounter);
    });
    updateCustomerSession((prev) => ({ ...prev, turnCounter: 1 }));
    updateCustomerSession((prev) => ({ ...prev, turnCounter: 2 }));
    updateCustomerSession((prev) => ({ ...prev, turnCounter: 3 }));
    expect(seen).toEqual([1, 2, 3]);
  });
});

describe('SF #2d customerSessionStore — test reset hook', () => {
  it('_resetForTests restores the initial snapshot', () => {
    updateCustomerSession((prev) => ({ ...prev, turnCounter: 99 }));
    expect(getCustomerSession().turnCounter).toBe(99);
    _resetForTests();
    expect(getCustomerSession().turnCounter).toBe(0);
    expect(getCustomerSession().conversation.id).toBe('conv::customer::v0');
  });

  it('_resetForTests clears subscribers so a later update does not fire stale callbacks', () => {
    const fn = vi.fn();
    subscribe(fn);
    _resetForTests();
    updateCustomerSession((prev) => ({ ...prev, turnCounter: 1 }));
    expect(fn).not.toHaveBeenCalled();
  });
});
