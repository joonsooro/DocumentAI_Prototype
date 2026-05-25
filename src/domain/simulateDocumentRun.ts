/**
 * F-03 — Deterministic mock extractor.
 *
 * Contract pointer: U3. Spec invariant: N6 — v1 NEVER calls live OCR or live
 * field extraction. simulateDocumentRun reads a canned fixture keyed by
 * documentPath and projects it through the schema in CompiledConfiguration.
 *
 * Acceptance (per app/feature-list.json):
 *   - Vitest test asserts deterministic output across 10 invocations.
 *   - Source is always 'mock'.
 *   - Each configured schema field gets exactly one extractedField in order.
 *
 * Determinism design:
 *   - Pure function: no I/O, no Date.now(), no Math.random(), no mutation
 *     of the imported fixture.
 *   - Output is frozen via Object.freeze on the array shell; field rows are
 *     created fresh each call but always with the same values.
 *   - The fixture's extractedAt is copied through verbatim — runtime clock
 *     is never consulted.
 *
 * Future suppliers register additional fixtures via FIXTURE_REGISTRY. v1 only
 * pins DAEJOO; Amazon and others are v2 work (spec §4 non-goals).
 */

import type {
  CompiledConfiguration,
  DocumentRun,
  ExtractedField,
  SchemaField,
} from '@domain/types';
import { DAEJOO_PDF_URL } from '@data/assets';
import daejooFixture from '@data/daejoo-extraction.fixture.json' with { type: 'json' };

/**
 * Shape of a fixture row inside *-extraction.fixture.json. Subset of
 * ExtractedField with the same field names; the projection step below
 * coerces these to ExtractedField after applying the confidence gate.
 */
interface FixtureRow {
  readonly name: string;
  readonly value: string | number | boolean | null;
  readonly confidence: number;
  readonly evidence: string | null;
}

interface FixtureFile {
  readonly documentPath: string;
  readonly extractedAt: string;
  readonly source: 'mock';
  readonly extractedFields: readonly FixtureRow[];
  // Free-text fields below are intentionally accessible only via getRawFixture;
  // they feed F-06 / F-09 governance, never the projected DocumentRun.
  readonly remark_freetext?: string;
  readonly [otherKey: string]: unknown;
}

/**
 * Registry of canned fixtures, keyed by canonical documentPath. v1 has only
 * DAEJOO. Adding a supplier is a one-line registry edit + one new fixture
 * file — the control layer itself never changes (EDGE-4).
 */
const FIXTURE_REGISTRY: ReadonlyMap<string, FixtureFile> = new Map([
  [DAEJOO_PDF_URL, daejooFixture as unknown as FixtureFile],
]);

/**
 * Project a single fixture row through a schema field, applying the
 * field's confidenceThreshold. Below-threshold values become null so
 * the F-07 clarification generator can raise a ClarificationRequest
 * for them (EDGE-1).
 */
function projectField(schemaField: SchemaField, row: FixtureRow | undefined): ExtractedField {
  if (!row) {
    return {
      name: schemaField.name,
      value: null,
      confidence: 0,
      evidence: null,
    };
  }
  const passesGate = row.confidence >= schemaField.confidenceThreshold;
  return {
    name: schemaField.name,
    value: passesGate ? row.value : null,
    confidence: row.confidence,
    evidence: row.evidence,
  };
}

/**
 * Deterministic mock extractor.
 *
 * @throws Error if no fixture is registered for the requested documentPath
 *         — we'd rather fail loudly than silently return an empty DocumentRun.
 */
export function simulateDocumentRun(
  documentPath: string,
  config: CompiledConfiguration,
): DocumentRun {
  const fixture = FIXTURE_REGISTRY.get(documentPath);
  if (!fixture) {
    throw new Error(
      `simulateDocumentRun: no fixture registered for documentPath="${documentPath}". ` +
        `Known paths: ${Array.from(FIXTURE_REGISTRY.keys()).join(', ')}`,
    );
  }

  // Build a lookup so projection is O(n) not O(n²).
  const rowsByName = new Map<string, FixtureRow>();
  for (const row of fixture.extractedFields) {
    rowsByName.set(row.name, row);
  }

  const extractedFields: readonly ExtractedField[] = Object.freeze(
    config.schema.fields.map((sf) => projectField(sf, rowsByName.get(sf.name))),
  );

  // DocumentRun id is derived deterministically from the document path and
  // the config id — same inputs => same id. No clock, no UUID, no entropy.
  return Object.freeze({
    id: `run::${config.id}::${documentPath}`,
    documentPath,
    configurationId: config.id,
    extractedFields,
    extractedAt: fixture.extractedAt,
    source: 'mock' as const,
  }) satisfies DocumentRun;
}

/**
 * Escape hatch for F-06 capability-gap router and F-09 governance gate —
 * they need the raw fixture (incl. free-text remarks like the DAEJOO
 * material-disposal phrase) to route hidden ProductSignals.
 *
 * RED-2: the remark_freetext must NEVER be rendered in the Customer
 * Workspace. ESLint rule N1 enforces this at the file-path level
 * (forbids 'Unsupported' literal under src/components/customer/**).
 */
export function getRawFixture(documentPath: string): FixtureFile {
  const fixture = FIXTURE_REGISTRY.get(documentPath);
  if (!fixture) {
    throw new Error(
      `getRawFixture: no fixture registered for documentPath="${documentPath}"`,
    );
  }
  return fixture;
}

/**
 * Inventory hook for tests and admin tooling.
 */
export function listRegisteredFixturePaths(): readonly string[] {
  return Array.from(FIXTURE_REGISTRY.keys());
}
