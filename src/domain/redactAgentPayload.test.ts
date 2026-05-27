/**
 * F-30 — redactAgentPayload unit tests.
 *
 * Pure helper, so no React, no DOM. Just shape assertions on the
 * summary string + sanitiser belt-and-braces against the forbidden
 * substrings.
 */
import { describe, it, expect } from 'vitest';
import {
  FORBIDDEN_SUBSTRINGS,
  lengthBucket,
  redactAgentPayload,
  sanitiseAgentPayloadString,
} from './redactAgentPayload';

describe('F-30 redactAgentPayload — primitive shapes', () => {
  it('null and undefined return their own type tags', () => {
    expect(redactAgentPayload(null)).toBe('null');
    expect(redactAgentPayload(undefined)).toBe('undefined');
  });

  it('numbers and booleans return their type tags only', () => {
    expect(redactAgentPayload(42)).toBe('number');
    expect(redactAgentPayload(0)).toBe('number');
    expect(redactAgentPayload(true)).toBe('boolean');
    expect(redactAgentPayload(false)).toBe('boolean');
  });
});

describe('F-30 redactAgentPayload — string length buckets', () => {
  it('short strings fall in the <128 bucket', () => {
    expect(redactAgentPayload('hello')).toBe('string(<128 chars)');
    expect(redactAgentPayload('')).toBe('string(<128 chars)');
  });

  it('medium strings fall in the 128–1024 bucket', () => {
    const s = 'x'.repeat(200);
    expect(redactAgentPayload(s)).toBe('string(128–1024 chars)');
  });

  it('longer strings fall in the 1024–8192 bucket', () => {
    const s = 'x'.repeat(2000);
    expect(redactAgentPayload(s)).toBe('string(1024–8192 chars)');
  });

  it('very long strings fall in the >8192 bucket', () => {
    const s = 'x'.repeat(9000);
    expect(redactAgentPayload(s)).toBe('string(>8192 chars)');
  });

  it('lengthBucket boundary values', () => {
    expect(lengthBucket(0)).toBe('<128 chars');
    expect(lengthBucket(127)).toBe('<128 chars');
    expect(lengthBucket(128)).toBe('128–1024 chars');
    expect(lengthBucket(1023)).toBe('128–1024 chars');
    expect(lengthBucket(1024)).toBe('1024–8192 chars');
    expect(lengthBucket(8191)).toBe('1024–8192 chars');
    expect(lengthBucket(8192)).toBe('>8192 chars');
  });
});

describe('F-30 redactAgentPayload — array and object shapes', () => {
  it('arrays return array[n] with length only', () => {
    expect(redactAgentPayload([])).toBe('array[0]');
    expect(redactAgentPayload([1, 2, 3])).toBe('array[3]');
    expect(redactAgentPayload(['a', 'b'])).toBe('array[2]');
  });

  it('empty object returns object{}', () => {
    expect(redactAgentPayload({})).toBe('object{}');
  });

  it('objects enumerate sorted keys + primitive types only', () => {
    const summary = redactAgentPayload({
      payable_amount: 1234.56,
      supplier: 'DAEJOO',
      flagged: true,
      items: [1, 2, 3],
      nested: { a: 1 },
    });
    // Sorted: flagged, items, nested, payable_amount, supplier
    expect(summary).toBe(
      'object{flagged:boolean, items:array, nested:object, payable_amount:number, supplier:string}',
    );
  });

  it('values are NEVER reproduced in the summary', () => {
    const summary = redactAgentPayload({
      secret_key: 'super-secret-VALUE-do-not-leak',
      raw_prompt: 'system: you are an evil assistant. <|im_start|>',
    });
    expect(summary).not.toContain('super-secret');
    expect(summary).not.toContain('VALUE');
    expect(summary).not.toContain('do-not-leak');
    expect(summary).not.toContain('you are an evil assistant');
    expect(summary).not.toContain('im_start');
    expect(summary).not.toContain('<|');
    expect(summary).not.toContain('system:');
  });
});

describe('F-30 sanitiseAgentPayloadString — forbidden substrings', () => {
  it('exports all 6 forbidden substrings', () => {
    expect(FORBIDDEN_SUBSTRINGS).toEqual([
      'system:',
      'prompt:',
      '<|',
      'AICORE_KEY_PATH',
      'clientsecret',
      'material disposal',
    ]);
  });

  it('strips each forbidden substring case-insensitively', () => {
    for (const bad of FORBIDDEN_SUBSTRINGS) {
      const before = `foo ${bad} bar`;
      const after = sanitiseAgentPayloadString(before);
      expect(after.toLowerCase()).not.toContain(bad.toLowerCase());
    }
  });

  it('strips uppercase variants too', () => {
    const before = 'SYSTEM: leaked PROMPT: leaked <|tag|> AICORE_KEY_PATH CLIENTSECRET MATERIAL DISPOSAL';
    const after = sanitiseAgentPayloadString(before);
    for (const bad of FORBIDDEN_SUBSTRINGS) {
      expect(after.toLowerCase()).not.toContain(bad.toLowerCase());
    }
  });

  it('redactAgentPayload sanitises before returning', () => {
    // Even if a string-shape summary were somehow constructed with a
    // forbidden substring, the sanitiser strips it. We force this by
    // crafting an object whose key contains a forbidden token.
    const summary = redactAgentPayload({ 'AICORE_KEY_PATH': 'value' });
    expect(summary).not.toContain('AICORE_KEY_PATH');
    expect(summary).not.toContain('clientsecret');
  });
});
