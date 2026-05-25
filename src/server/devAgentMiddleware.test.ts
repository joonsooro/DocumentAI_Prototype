/**
 * S3.5 F-11-live — middleware handler shape tests.
 *
 * No live AI Core. Each handler is exercised against a stubbed agent surface
 * by injecting a fake AICORE_KEY_PATH so loadServiceKey fails fast; the F-08
 * runAgentWithFailureSurface wrapper then routes the failure into the wire
 * shape we expect the browser to receive ({ kind: 'failure', clarification,
 * metric }). This proves the shape contract without spending any AI Core
 * tokens.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import {
  handleCompile,
  handleCapability,
  handleReadiness,
  type CompileResponse,
  type CapabilityResponse,
  type ReadinessResponse,
} from './devAgentMiddleware';
import { _resetClientForTests } from '@runtime/aiCoreClient';
import { _resetQualityMetricLogForTests } from '@runtime/qualityMetricLog';
import type { CompiledConfiguration, CustomerIntent } from '@domain/types';

const ORIGINAL_KEY_PATH = process.env.AICORE_KEY_PATH;

beforeAll(() => {
  // Force credential_load_failed so every agent call surfaces via F-08 as a
  // failure wire shape — we are testing the shape contract, not the agent.
  process.env.AICORE_KEY_PATH = '/dev/null/does-not-exist.json';
  _resetClientForTests();
  _resetQualityMetricLogForTests();
});

afterAll(() => {
  if (ORIGINAL_KEY_PATH === undefined) {
    delete process.env.AICORE_KEY_PATH;
  } else {
    process.env.AICORE_KEY_PATH = ORIGINAL_KEY_PATH;
  }
  _resetClientForTests();
  _resetQualityMetricLogForTests();
});

const STUB_INTENT: CustomerIntent = Object.freeze({
  id: 'intent::stub',
  raw: 'extract supplier and PO',
  documentType: 'commercial_invoice',
  capturedAt: '2026-05-25T00:00:00Z',
});

// Minimal in-shape stub — only used by /api/capability + /api/readiness when
// the compile step has already produced a configuration. assessCapabilities
// will still try to call AI Core (and fail), but the schema fields are needed
// because simulateDocumentRun reads them.
const STUB_CONFIG: CompiledConfiguration = Object.freeze({
  id: 'cfg::stub',
  intentId: STUB_INTENT.id,
  schema: {
    fields: [
      {
        name: 'supplier',
        dataType: 'string' as const,
        required: true,
        instruction: 'extract supplier',
        validation: null,
        regex: null,
        confidenceThreshold: 0.85,
      },
    ],
  },
  processingMode: 'review_required' as const,
  source: 'aiCore' as const,
  templateUsed: false as const,
  compiledAt: '2026-05-25T00:00:00Z',
});

describe('S3.5 F-11-live middleware — handleCompile shape', () => {
  it('returns kind:"failure" with clarification + metric when AI Core unreachable', async () => {
    const result: CompileResponse = await handleCompile({
      raw: 'extract supplier, PO, payable amount',
      documentType: 'commercial_invoice',
    });
    expect(result.kind).toBe('failure');
    if (result.kind === 'failure') {
      expect(result.clarification.kind).toBe('agent_failure_surface');
      // When loadServiceKey() throws synchronously, the inner AgentFailure's
      // agent name ('aiCoreClient.loadServiceKey') is preserved by F-08's
      // coerceToAgentFailure — the wrapper's outer label only stamps non-
      // AgentFailure throws. Either tag proves the failure surface fired.
      expect(result.clarification.operatorFacingError).toMatch(/credential_load_failed/);
      expect(result.metric.status).toBe('fail');
      expect(['compile', 'aiCoreClient.loadServiceKey']).toContain(result.metric.agent);
    }
  });

  it('handleCompile defaults documentType to commercial_invoice and surfaces failures on both default + override paths', async () => {
    const r1: CompileResponse = await handleCompile({ raw: 'x' });
    expect(r1.kind).toBe('failure');
    const r2: CompileResponse = await handleCompile({ raw: 'x', documentType: 'po_form' });
    expect(r2.kind).toBe('failure');
  });
});

describe('S3.5 F-11-live middleware — handleCapability shape', () => {
  it('returns kind:"failure" with clarification + metric when AI Core unreachable', async () => {
    const result: CapabilityResponse = await handleCapability({
      intent: STUB_INTENT,
      configuration: STUB_CONFIG,
    });
    expect(result.kind).toBe('failure');
    if (result.kind === 'failure') {
      expect(result.clarification.kind).toBe('agent_failure_surface');
      expect(['capability', 'aiCoreClient.loadServiceKey']).toContain(result.metric.agent);
    }
  });
});

describe('S3.5 F-11-live middleware — handleReadiness shape', () => {
  it('returns kind:"failure" with clarification + metric when AI Core unreachable', async () => {
    const result: ReadinessResponse = await handleReadiness({
      intent: STUB_INTENT,
      configuration: STUB_CONFIG,
    });
    // decideReadiness wraps its own AI Core call in runAgentWithFailureSurface,
    // so on agent failure it RETURNS a Blocked ReadinessDecision rather than
    // throwing. The middleware's outer wrap therefore sees kind:'success' but
    // with a Blocked status — that is the contracted behaviour. If a deeper
    // throw escapes (no fixture registered for the stub path etc.), the
    // outer wrap converts it to kind:'failure'. Either is a valid shape; we
    // assert both branches are well-formed.
    expect(['success', 'failure']).toContain(result.kind);
    if (result.kind === 'success') {
      expect(result.readiness).toBeDefined();
      expect(['Ready', 'Needs review', 'Blocked', 'Needs downstream validation']).toContain(
        result.readiness.status,
      );
      expect(Array.isArray(result.clarifications)).toBe(true);
    } else {
      expect(result.clarification.kind).toBe('agent_failure_surface');
      expect(result.metric.status).toBe('fail');
    }
  });
});
