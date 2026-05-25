/**
 * F-11 — Customer Workspace route (/customer).
 *
 * Composes the five customer panels against a single CustomerViewModel.
 * The view-model's type signature is the load-bearing negative-contract
 * guard (see src/components/customer/viewModel.ts): the model does not
 * carry ProductSignal, capability_gap rows, or any free-text not already
 * sanitised — so this route literally cannot leak them.
 *
 * Wiring (S3.5 F-11-live): when no onSubmitIntent prop is supplied, the
 * route POSTs to /api/compile → /api/capability → /api/readiness in
 * sequence. The middleware (src/server/devAgentMiddleware.ts) runs the
 * agents server-side; the browser bundle never imports @runtime/aiCoreClient
 * or any @domain/* implementation. Failures return as structured
 * {kind:'failure', clarification, metric} responses (per N4 — never a
 * canned fallback); the clarification is pushed into vm.clarifications
 * and the ClarificationLoopPanel renders the operator-facing error.
 *
 * Tests and the F-19 eval harness keep using `initialViewModel` to seed
 * canned state and `onSubmitIntent` to override the live wire — the
 * view-model type signature is unchanged, so the structural negative-
 * contract guards still hold.
 */
import { useState } from 'react';
import {
  EMPTY_CUSTOMER_VIEW_MODEL,
  projectCapabilitiesForCustomerSurface,
  type CustomerViewModel,
} from '@components/customer/viewModel';
import { IntentInputPanel } from '@components/customer/IntentInputPanel';
import { CompiledConfigPanel } from '@components/customer/CompiledConfigPanel';
import { CapabilityStatusPanel } from '@components/customer/CapabilityStatusPanel';
import { ClarificationLoopPanel } from '@components/customer/ClarificationLoopPanel';
import { ReadinessPanel } from '@components/customer/ReadinessPanel';
import {
  postCompile,
  postCapability,
  postReadiness,
} from '@components/customer/agentClient';

type LoadingStage = 'idle' | 'compile' | 'capability' | 'readiness';

const STAGE_LABEL: Record<Exclude<LoadingStage, 'idle'>, string> = {
  compile: 'Compiling configuration…',
  capability: 'Assessing capabilities…',
  readiness: 'Deciding readiness…',
};

interface CustomerRouteProps {
  /** Optional seed for tests + eval harness. Defaults to an empty model. */
  readonly initialViewModel?: CustomerViewModel;
  /**
   * Optional handler called when the customer submits intent. Tests pass this
   * to bypass the live /api/* wire. When omitted, the route runs the live
   * three-stage chain itself.
   */
  readonly onSubmitIntent?: (raw: string) => void;
}

export default function CustomerRoute({
  initialViewModel = EMPTY_CUSTOMER_VIEW_MODEL,
  onSubmitIntent,
}: CustomerRouteProps) {
  const [vm, setVm] = useState<CustomerViewModel>(initialViewModel);
  const [stage, setStage] = useState<LoadingStage>('idle');
  const [requestError, setRequestError] = useState<string | null>(null);

  async function runLiveChain(raw: string): Promise<void> {
    setRequestError(null);
    setStage('compile');
    try {
      const compileResp = await postCompile({ raw, documentType: 'commercial_invoice' });
      if (compileResp.kind === 'failure') {
        setVm((prev) => ({ ...prev, clarifications: [...prev.clarifications, compileResp.clarification] }));
        setStage('idle');
        return;
      }

      const { intent, configuration } = compileResp;
      setVm((prev) => ({ ...prev, intent, configuration }));

      setStage('capability');
      const capResp = await postCapability({ intent, configuration });
      if (capResp.kind === 'success') {
        const assessments = projectCapabilitiesForCustomerSurface(capResp.assessments);
        setVm((prev) => ({ ...prev, assessments }));
      } else {
        setVm((prev) => ({ ...prev, clarifications: [...prev.clarifications, capResp.clarification] }));
      }

      setStage('readiness');
      const readyResp = await postReadiness({ intent, configuration });
      if (readyResp.kind === 'success') {
        setVm((prev) => ({
          ...prev,
          readiness: readyResp.readiness,
          clarifications: [...prev.clarifications, ...readyResp.clarifications],
        }));
      } else {
        setVm((prev) => ({ ...prev, clarifications: [...prev.clarifications, readyResp.clarification] }));
      }
    } catch (err) {
      // Network-level failure (server down, JSON parse error). The agent
      // wire-shape failure path is handled above via kind:'failure'.
      setRequestError((err as Error).message);
    } finally {
      setStage('idle');
    }
  }

  function handleSubmit(raw: string) {
    if (onSubmitIntent) {
      onSubmitIntent(raw);
      return;
    }
    void runLiveChain(raw);
  }

  const loading = stage !== 'idle';

  return (
    <div data-testid="customer-route" style={rootStyle}>
      <header style={headerStyle}>
        <h1 style={titleStyle}>Customer Workspace</h1>
        <p style={subtitleStyle}>
          Paste your business intent. The system will compile a configuration,
          show which parts are covered, and ask clarifying questions as needed.
        </p>
      </header>
      <IntentInputPanel
        initialValue={vm.intent?.raw ?? ''}
        disabled={loading}
        onSubmit={handleSubmit}
      />
      {loading ? (
        <div data-testid="customer-loading-indicator" style={loadingStyle}>
          {STAGE_LABEL[stage as Exclude<LoadingStage, 'idle'>]}
        </div>
      ) : null}
      {requestError ? (
        <div data-testid="customer-request-error" style={requestErrorStyle}>
          The request to the agent server failed. Check the dev server logs and
          try again.
        </div>
      ) : null}
      <CompiledConfigPanel configuration={vm.configuration} />
      <CapabilityStatusPanel assessments={vm.assessments} />
      <ClarificationLoopPanel clarifications={vm.clarifications} />
      <ReadinessPanel readiness={vm.readiness} />
    </div>
  );
}

const rootStyle: React.CSSProperties = {
  maxWidth: 960,
  margin: '0 auto',
};
const headerStyle: React.CSSProperties = {
  marginBottom: 16,
};
const titleStyle: React.CSSProperties = {
  fontSize: 24, fontWeight: 500, margin: '0 0 8px', color: '#32363a',
};
const subtitleStyle: React.CSSProperties = {
  fontSize: 14, color: '#5a6168', margin: 0,
};
const loadingStyle: React.CSSProperties = {
  background: '#ebf5ff',
  border: '1px solid #0a6ed1',
  borderRadius: 4,
  padding: '10px 14px',
  marginBottom: 16,
  fontSize: 14,
  color: '#0a6ed1',
  fontWeight: 500,
};
const requestErrorStyle: React.CSSProperties = {
  background: '#fbecec',
  border: '1px solid #b00',
  borderRadius: 4,
  padding: '10px 14px',
  marginBottom: 16,
  fontSize: 14,
  color: '#b00',
};
