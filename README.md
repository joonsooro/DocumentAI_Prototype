# Document AI Customer-Configuration Prototype

A spec-engineered prototype of an **AI-assisted configuration layer** that sits in front of SAP Document AI. The product premise: enterprise admins should be able to describe what they want to extract from a document in plain English, and the system should turn that description into a Document AI-ready extraction configuration — schema, prompt, thresholds, and a readiness verdict — without anyone editing JSON by hand.

This repository is a **single-laptop demo**, not a production deployment. The visible v1 surface uses one document type (commercial invoice) and one sample document (DAEJOO) so the workflow itself can be exercised end-to-end without enterprise plumbing.

---

## The problem

Document AI gives enterprise teams a powerful extraction engine — header fields, line items, confidence scoring, template + generative paths — but configuring it for a specific document type still requires direct manipulation of schemas, prompt fragments, confidence thresholds, and processing modes. That workflow is precise but unforgiving: a small mismatch between what the admin meant and what the schema actually says shows up as silently missing fields, mislabelled values, or over-confident extractions on edge cases. The admin's intent never quite makes it into the configuration without a roundtrip through someone who reads the docs.

The prototype's bet: the gap between "what the admin wants" and "a Document AI configuration that does that" is a translation problem, and translation is what LLMs are actually good at — provided the surface around the translation tells the truth about the product's boundaries.

---

## What the prototype does

1. **An admin types an extraction intent in plain English** in a chat surface at `/customer`. Example: *"Extract supplier name, invoice number, PO number, invoice date, total amount, and tax amount from this invoice. Skip lines marked 'no commercial value'."*
2. **A live AI Core agent compiles that intent** into a Document AI-shaped configuration — extraction schema, system prompt for the extractor, confidence thresholds, processing mode. The configuration is visible to the admin as an auxiliary panel that updates in place.
3. **The extraction runs against the sample document.** In v1 this is a deterministic projection of the AI-generated schema through a hand-curated fixture (`src/data/daejoo-extraction.fixture.json`); the OCR + raw-extraction step is mocked so the demo runs offline. The admin sees extracted values with per-field confidence, and a "Not found in this document" marker for fields the document doesn't carry.
4. **A readiness verdict** assembles in plain business language — what's confident, what's borderline, what to do next.
5. **The admin can iterate by typing** — *"also extract the buyer reference"*, *"raise the threshold on payment_terms"*, *"show me the prompt you generated"*. Each turn re-compiles the configuration and re-runs the extraction.
6. **When the admin asks for something Document AI does not do** — *"link this to S/4 HANA"*, *"compare this invoice to last month's"*, *"flag suspicious invoices"* — the chat does not say "unsupported." It confirms the request back in product-grounded language, cites the relevant section of the Document AI capability surface, and asks the admin whether to notify the SAP product team. On *yes*, a `ProductSignal` lands in an internal flywheel screen so the product team can see what customers actually want.

Three personas, three screens:

- **`/customer`** — the admin chat workflow above. 90% of the prototype's surface area.
- **`/admin`** — internal SAP view: agent traces, threshold governance, recommendations derived from extraction corrections.
- **`/internal`** — internal SAP view: the ProductSignal flywheel. Capability gaps surfaced through the customer chat appear here as structured signals, ranked by frequency, customer count, and addressability.

---

## Why this matters

This prototype is an experiment in three claims that go beyond "Document AI gets a friendly UI":

**1. The translation between intent and configuration is the product, not the chat.** The visible chat is just where the admin types. The load-bearing work is producing a structurally valid Document AI configuration that an extractor can actually execute — schema field list, per-field instructions, regex patterns, confidence thresholds, processing mode. Get that translation right and the rest of Document AI keeps working as it always has.

**2. Capability boundaries are part of the configuration surface.** A configurator that pretends the product can do anything the user asks for fails as soon as the user asks for something the product doesn't do. The prototype's "I can't do X — want me to notify the team?" pathway is treated as a first-class outcome: it gives the customer an honest answer and gives the product team a quantified signal about where the boundary actually pinches. Capability grounding ships as a curated 6,000-token document derived from the 628-page Document AI product manual (`docs/document-ai-capability-surface.md`), not as RAG — the curation is intentional and version-controlled.

**3. Live AI in the loop is verified by live tests.** Every customer-facing decision (compile, capability classification, readiness reasoning) is a real call to a live model. The eval bar (`app/evals.md` → `src/evals/`) treats this as the falsifier: drift in any of those agents shows up as a regression in CI, not as a demo failure during a sales call.

---

## Architecture (one paragraph)

React 18 + TypeScript strict mode + Vite for the front end. UI5 Web Components React for the SAP Fiori look-and-feel, adapted to a custom visual identity. A Node-side Vite middleware (`src/server/devAgentMiddleware.ts`) exposes JSON endpoints the browser POSTs to; the browser never imports the AI Core client directly. Live agent calls go to SAP AI Core. Extraction itself is mocked against `src/data/daejoo-extraction.fixture.json` — that's a v1 invariant called N6. The project follows a six-stage spec engineering workflow (S1 spec → S2 contract → S3 build → S4 eval → S5 debug → S6 strip); the canonical artifacts live in `app/`. See `app/CLAUDE.md` for the tenets every change is checked against.

---

## Repository map

```
app/                          canonical spec-engineering artifacts
  spec.html                   single source of truth (S1)
  contract.html               wiring diagram (S2)
  evals.md                    binary eval cases bound 1:1 to spec rules
  CLAUDE.md                   durable tenets — read before changing anything in app/
  claude-progress.txt         append-only RATIONALE trace
  eval-results.html           latest eval-bar verdict (S4)
  app-spec.json               concrete build manifest
docs/                         orientation + active plans
  handoff-2026-05-28.md       dev-lead onboarding
  architectural-plan-2026-05-28.md  the re-derivation plan in flight
  document-ai-capability-surface.md curated grounding for the capability agent
reference/                    source material (Document AI help PDF)
src/
  routes/                     /customer · /admin · /internal
  domain/                     live AI Core agents + deterministic domain logic
  components/                 per-route panels
  evals/                      eval-bar tests (the formal pass/fail surface)
  server/                     dev-only Vite middleware exposing /api/*
  runtime/                    AI Core client + supporting infrastructure
  data/                       deterministic fixtures (DAEJOO)
scripts/                      one-off diagnostics and ops scripts
```

---

## Running it

```bash
npm install
cp .env.example .env          # fill in AICORE_KEY_PATH and Langfuse keys
npm run dev                   # opens /customer at http://localhost:5173
```

Test surfaces:

```bash
npx vitest run                # full eval bar + unit tests
npm run build                 # production bundle
```

Live evals (require `AICORE_KEY_PATH` pointing at a readable SAP AI Core service key) are in `src/evals/live.test.tsx`; they `describe.skipIf` automatically when credentials are absent.

---

## Non-goals (v1)

- **Live OCR / live raw extraction.** Mocked in v1 against a single fixture; this is intentional, not a missing piece.
- **Multi-document.** DAEJOO is the only sample.
- **Multi-tenant runtime, persistence, authentication.** The `/admin` surface is a theatrical governance view, not a live workbench.
- **Direct ERP write-back, Cognee-based graph RAG, embedding retrieval.** Deferred to v2 with documented revisit conditions.

Document AI itself does these things at the service level; this prototype is about the configuration surface that sits in front of it.
