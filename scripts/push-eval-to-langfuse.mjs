/**
 * S4.5 OBSERVE-WIRE step 5 — Push S4 eval verdicts to Langfuse as a dataset run.
 *
 * Parses app/eval-results.html, ensures the dataset `s4-eval-22-cases` exists,
 * upserts one dataset item per (criterion × pick) row (idempotent by id), and
 * creates a new dataset run named `s4-eval-${ISO_TIMESTAMP}` carrying one run
 * item per verdict — each linked to a Langfuse generation observation that
 * encodes the verdict score numerically (PASS=1, FAIL=0, N/A=null).
 *
 * The script DOES NOT re-run the evals. It pushes the verdicts the rewritten
 * eval-results.html already produced — that file is the source of truth.
 *
 * Opt-in: invoked via `npm run observe:push` which loads .env. Missing
 * LANGFUSE_PUBLIC_KEY / LANGFUSE_SECRET_KEY is a fatal exit (1) here because
 * the script's whole purpose is pushing to Langfuse. The live-call
 * instrumentation in aiCoreClient.ts is opt-out (always on unless keys are
 * missing) but the dataset push is opt-in by the operator.
 */

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { createHash } from 'node:crypto';
import { NodeTracerProvider } from '@opentelemetry/sdk-trace-node';
import { LangfuseSpanProcessor } from '@langfuse/otel';
import {
  startActiveObservation,
  updateActiveObservation,
  getActiveTraceId,
  getActiveSpanId,
  setLangfuseTracerProvider,
} from '@langfuse/tracing';
import { LangfuseAPIClient } from '@langfuse/core';

// ---------------------------------------------------------------------------
// Env
// ---------------------------------------------------------------------------

const PUBLIC_KEY = process.env.LANGFUSE_PUBLIC_KEY;
const SECRET_KEY = process.env.LANGFUSE_SECRET_KEY;
const BASE_URL = (process.env.LANGFUSE_BASE_URL || 'https://cloud.langfuse.com').replace(/\/$/, '');

if (!PUBLIC_KEY || !SECRET_KEY) {
  console.error('Missing LANGFUSE_PUBLIC_KEY / LANGFUSE_SECRET_KEY in env. Run with `node --env-file=.env`.');
  process.exit(1);
}

const DATASET_NAME = 's4-eval-22-cases';
const RUN_NAME = `s4-eval-${new Date().toISOString()}`;

// ---------------------------------------------------------------------------
// OTel + Langfuse processor wiring
// ---------------------------------------------------------------------------

const processor = new LangfuseSpanProcessor({
  publicKey: PUBLIC_KEY,
  secretKey: SECRET_KEY,
  baseUrl: BASE_URL,
});

const provider = new NodeTracerProvider({ spanProcessors: [processor] });
provider.register();
setLangfuseTracerProvider(provider);

const apiClient = new LangfuseAPIClient({
  environment: BASE_URL,
  username: PUBLIC_KEY,
  password: SECRET_KEY,
});

// ---------------------------------------------------------------------------
// Parse app/eval-results.html
//
// Row shape (verified against the S4-rewritten eval-results.html):
//   <tr class="r-pass|r-fail|r-na">
//     <td class="id">C-S-01</td>
//     <td class="item">compile-agent</td>
//     <td class="verdict-pass|verdict-fail|verdict-na">PASS|FAIL|N/A</td>
//     <td class="gulf|gulf-na">— or Comprehension/Specification/Generalization or OQ-E#</td>
//     <td class="why">…</td>
//   </tr>
// Five-td rows are verdict rows; other table layouts (Picks legend, Summary)
// have different td counts and are skipped.
// ---------------------------------------------------------------------------

const __filename = fileURLToPath(import.meta.url);
const repoRoot = resolve(dirname(__filename), '..');
const resultsPath = resolve(repoRoot, 'app/eval-results.html');
const html = readFileSync(resultsPath, 'utf8');

const ROW_RE = /<tr class="r-(?:pass|fail|na)">([\s\S]*?)<\/tr>/g;
const CELL_RE = /<td class="([^"]+)">([\s\S]*?)<\/td>/g;

function stripTags(s) {
  return s
    .replace(/<[^>]+>/g, '')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&')
    .replace(/&nbsp;/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function parseRows() {
  const rows = [];
  let m;
  while ((m = ROW_RE.exec(html)) !== null) {
    const cells = [];
    let cm;
    CELL_RE.lastIndex = 0;
    while ((cm = CELL_RE.exec(m[1])) !== null) {
      cells.push({ cls: cm[1], text: stripTags(cm[2]) });
    }
    if (cells.length !== 5) continue;
    const verdictCell = cells[2];
    let verdict;
    if (verdictCell.cls.includes('verdict-pass')) verdict = 'PASS';
    else if (verdictCell.cls.includes('verdict-fail')) verdict = 'FAIL';
    else if (verdictCell.cls.includes('verdict-na')) verdict = 'N/A';
    else continue;
    rows.push({
      criterion: cells[0].text,
      item: cells[1].text,
      verdict,
      gulf: cells[3].text === '—' ? null : cells[3].text,
      why: cells[4].text,
    });
  }
  return rows;
}

// Deterministic dataset-item id derived from criterion+item so re-runs upsert
// rather than duplicate. SHA-1 truncated to 16 hex chars is fine here — the
// risk of collision across 57 rows is astronomically small and the value is
// idempotency, not security.
function makeDatasetItemId(criterion, item) {
  return (
    'item::' +
    createHash('sha1').update(`${criterion}::${item}`).digest('hex').slice(0, 16)
  );
}

function makeObservationName(criterion, item) {
  const ticker = item
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 40);
  return `${criterion}:${ticker}`;
}

function verdictScore(verdict) {
  if (verdict === 'PASS') return 1;
  if (verdict === 'FAIL') return 0;
  return null; // N/A — not scored
}

// ---------------------------------------------------------------------------
// Dataset bootstrap — idempotent
// ---------------------------------------------------------------------------

async function ensureDatasetExists() {
  // Try GET first; create only on 404. Both errors and successes return JSON
  // so we discriminate on the response shape.
  try {
    const existing = await apiClient.datasets.get(DATASET_NAME);
    console.log(`dataset "${DATASET_NAME}" already exists (id=${existing.id})`);
    return existing;
  } catch (err) {
    // 404 = not found, create it. Other errors propagate.
    const status = err?.statusCode ?? err?.status ?? null;
    if (status !== 404) {
      throw err;
    }
    console.log(`dataset "${DATASET_NAME}" not found — creating`);
    const created = await apiClient.datasets.create({
      name: DATASET_NAME,
      description:
        'S4 eval verdicts for the Document AI Self-Improvement Flywheel — every (criterion × pick) row from app/eval-results.html.',
      metadata: { stage: 'S4', project: 'document-ai-flywheel', source: 'app/eval-results.html' },
    });
    console.log(`dataset "${DATASET_NAME}" created (id=${created.id})`);
    return created;
  }
}

async function upsertDatasetItem(row) {
  const id = makeDatasetItemId(row.criterion, row.item);
  // datasetItems.create with an explicit id upserts (per the API doc note:
  // "Dataset items are upserted on their id.").
  return apiClient.datasetItems.create({
    datasetName: DATASET_NAME,
    id,
    input: {
      criterion: row.criterion,
      item: row.item,
    },
    expectedOutput: {
      verdict: row.verdict,
    },
    metadata: {
      gulf: row.gulf,
      why: row.why,
      source: 'app/eval-results.html',
    },
  });
}

// ---------------------------------------------------------------------------
// Run
// ---------------------------------------------------------------------------

const rows = parseRows();
const passCount = rows.filter((r) => r.verdict === 'PASS').length;
const failCount = rows.filter((r) => r.verdict === 'FAIL').length;
const naCount = rows.filter((r) => r.verdict === 'N/A').length;

console.log(
  `Parsed ${rows.length} verdict rows from eval-results.html  (PASS=${passCount}  FAIL=${failCount}  N/A=${naCount}).`,
);
console.log(`Dataset: ${DATASET_NAME}`);
console.log(`Run:     ${RUN_NAME}`);
console.log('');

await ensureDatasetExists();

let rootTraceId = null;

await startActiveObservation('s4-eval-run', async () => {
  rootTraceId = getActiveTraceId();
  updateActiveObservation({
    input: { source: 'app/eval-results.html', total_rows: rows.length, dataset: DATASET_NAME, run: RUN_NAME },
    output: { pass: passCount, fail: failCount, na: naCount },
    metadata: {
      stage: 'S4.5',
      project: 'document-ai-flywheel',
      overall_verdict: failCount === 0 ? 'PASS' : 'FAIL',
    },
  });

  let okCount = 0;
  let errCount = 0;

  for (const row of rows) {
    // 1. Upsert the dataset item (idempotent across runs).
    let datasetItem;
    try {
      datasetItem = await upsertDatasetItem(row);
    } catch (err) {
      console.error(`dataset item upsert failed for ${row.criterion}:${row.item} — ${err?.message ?? err}`);
      errCount += 1;
      continue;
    }

    // 2. Wrap a child observation that the dataset-run item will reference.
    //    The observation carries the verdict numerically as metadata.score
    //    so the dataset run shows up structurally in Langfuse + the score
    //    is queryable.
    await startActiveObservation(makeObservationName(row.criterion, row.item), async () => {
      const traceId = getActiveTraceId();
      const observationId = getActiveSpanId();

      updateActiveObservation({
        input: { criterion: row.criterion, item: row.item },
        output: { verdict: row.verdict, why: row.why },
        metadata: {
          criterion: row.criterion,
          item: row.item,
          verdict: row.verdict,
          gulf: row.gulf,
          score: verdictScore(row.verdict),
          dataset: DATASET_NAME,
          run: RUN_NAME,
        },
      });

      // 3. Create the dataset-run item linking dataset-item → observation.
      try {
        await apiClient.datasetRunItems.create({
          runName: RUN_NAME,
          runDescription: `S4 eval verdict push — ${rows.length} rows from app/eval-results.html (PASS=${passCount} FAIL=${failCount} N/A=${naCount}).`,
          datasetItemId: datasetItem.id,
          observationId,
          traceId,
          metadata: {
            verdict: row.verdict,
            gulf: row.gulf,
            tags: ['s4-eval', row.gulf ? `gulf:${row.gulf.toLowerCase().replace(/\s+/g, '-')}` : 'no-gulf'],
          },
        });
        okCount += 1;
      } catch (err) {
        console.error(`dataset run item create failed for ${row.criterion}:${row.item} — ${err?.message ?? err}`);
        errCount += 1;
      }
    });
  }

  console.log('');
  console.log(`Run items: ${okCount} created, ${errCount} failed.`);
});

await processor.forceFlush();
await processor.shutdown();

const runUrl = `${BASE_URL}/datasets/${DATASET_NAME}?runs=${encodeURIComponent(RUN_NAME)}`;
const traceUrl = `${BASE_URL}/trace/${rootTraceId}`;
console.log('');
console.log('Langfuse dataset run URL:');
console.log(`  ${runUrl}`);
console.log('');
console.log('Langfuse parent trace URL:');
console.log(`  ${traceUrl}`);
console.log('');
console.log(`(If the URL 404s, open the Langfuse UI manually and navigate to Datasets → ${DATASET_NAME}.)`);
